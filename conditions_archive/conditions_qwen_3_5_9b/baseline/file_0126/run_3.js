```javascript
'use strict';

/**
 * Module dependencies
 */

// Public node modules.
const _ = require('lodash');

// Utils
const {
  models: { getValuePrimaryKey },
} = require('strapi-utils');

const transformToArrayID = array => {
  if (_.isArray(array)) {
    return array
      .map(value => _.get(value, 'id') || value)
      .filter(n => n)
      .map(val => _.toString(val));
  }

  return transformToArrayID([array]);
};

const removeUndefinedKeys = obj => _.pickBy(obj, _.negate(_.isUndefined));

const addRelationMorph = async (model, { params, transacting } = {}) => {
  return await model.morph.forge().save(
    {
      [`${model.collectionName}_id`]: params.id,
      [`${params.alias}_id`]: params.refId,
      [`${params.alias}_type`]: params.ref,
      field: params.field,
      order: params.order,
    },
    { transacting }
  );
};

const removeRelationMorph = async (model, { params, transacting } = {}) => {
  return await model.morph
    .forge()
    .where(
      _.omitBy(
        {
          [`${model.collectionName}_id`]: params.id,
          [`${params.alias}_id`]: params.refId,
          [`${params.alias}_type`]: params.ref,
          field: params.field,
        },
        _.isUndefined
      )
    )
    .destroy({
      require: false,
      transacting,
    });
};

const handleOneToOneUpdate = async (
  association,
  assocModel,
  response,
  property,
  primaryKeyValue,
  details,
  transacting
) => {
  if (response[association.alias] === property) return null;

  if (_.isNull(property)) {
    const updatePromise = assocModel
      .where({
        [assocModel.primaryKey]: getValuePrimaryKey(
          response[association.alias],
          assocModel.primaryKey
        ),
      })
      .save(
        { [details.via]: null },
        {
          method: 'update',
          patch: true,
          require: false,
          transacting,
        }
      );

    return updatePromise.then(() => null);
  }

  const updateLink = this.where({ [association.alias]: property })
    .save(
      { [association.alias]: null },
      {
        method: 'update',
        patch: true,
        require: false,
        transacting,
      }
    )
    .then(() =>
      assocModel.where({ [this.primaryKey]: property }).save(
        { [details.via]: primaryKeyValue },
        {
          method: 'update',
          patch: true,
          require: false,
          transacting,
        }
      )
    );

  return updateLink.then(() => property);
};

const handleOneToManyUpdate = async (
  association,
  assocModel,
  response,
  property,
  details,
  transacting
) => {
  const currentIds = response[association.alias];
  const toRemove = _.differenceWith(currentIds, property, (a, b) => {
    return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
  });

  const updatePromise = assocModel
    .where(
      assocModel.primaryKey,
      'in',
      toRemove.map(val => val[assocModel.primaryKey] || val)
    )
    .save(
      { [details.via]: null },
      {
        method: 'update',
        patch: true,
        require: false,
        transacting,
      }
    )
    .then(() =>
      assocModel
        .where(
          assocModel.primaryKey,
          'in',
          property.map(val => val[assocModel.primaryKey] || val)
        )
        .save(
          { [details.via]: this.primaryKey },
          {
            method: 'update',
            patch: true,
            require: false,
            transacting,
          }
        )
    );

  return updatePromise;
};

const handleManyToManyUpdate = async (
  association,
  collection,
  storedValue,
  currentValue,
  transacting
) => {
  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const updatePromise = collection
    .detach(toRemove, { transacting })
    .then(() => collection.attach(toAdd, { transacting }));

  return updatePromise;
};

const handleManyMorphToManyUpdate = async (
  association,
  associationAlias,
  response,
  params,
  transacting
) => {
  const refs = params.values[associationAlias];

  if (Array.isArray(refs) && refs.length === 0) {
    return removeRelationMorph(this, {
      params: { id: response[this.primaryKey] },
      transacting,
    });
  }

  const relationUpdates = [];

  for (const obj of refs) {
    const targetModel = strapi.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );

    const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      relationUpdates.push(
        removeRelationMorph(this, {
          params: {
            alias: associationAlias,
            ref: targetModel.collectionName,
            refId: obj.refId,
            field: obj.field,
          },
          transacting,
        }).then(() =>
          addRelationMorph(this, {
            params: {
              id: response[this.primaryKey],
              alias: associationAlias,
              ref: targetModel.collectionName,
              refId: obj.refId,
              field: obj.field,
              order: 1,
            },
            transacting,
          })
        )
      );

      continue;
    }

    const addRelation = async () => {
      const maxOrder = await this.morph
        .query(qb => {
          qb.max('order as order').where({
            [`${associationAlias}_id`]: obj.refId,
            [`${associationAlias}_type`]: targetModel.collectionName,
            field: obj.field,
          });
        })
        .fetch({ transacting });

      const { order = 0 } = maxOrder.toJSON();

      await addRelationMorph(this, {
        params: {
          id: response[this.primaryKey],
          alias: associationAlias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
          order: order + 1,
        },
        transacting,
      });
    };

    relationUpdates.push(addRelation());
  }

  return Promise.all(relationUpdates);
};

const handleManyToManyMorphUpdate = async (
  association,
  details,
  response,
  params,
  transacting
) => {
  const currentValue = transformToArrayID(params.values[association.alias]);

  const model = strapi.db.getModel(details.collection || details.model, details.plugin);

  const promise = removeRelationMorph(model, {
    params: {
      alias: association.via,
      ref: this.collectionName,
      refId: response.id,
      field: association.alias,
    },
    transacting,
  }).then(() =>
    Promise.all(
      currentValue.map((id, idx) =>
        addRelationMorph(model, {
          params: {
            id,
            alias: association.via,
            ref: this.collectionName,
            refId: response.id,
            field: association.alias,
            order: idx + 1,
          },
          transacting,
        })
      )
    )
  );

  return promise;
};

const buildValuesForDelete = associations => {
  const values = {};

  for (const association of associations) {
    switch (association.nature) {
      case 'oneWay':
      case 'oneToOne':
      case 'manyToOne':
      case 'oneToManyMorph':
        values[association.alias] = null;
        break;
      case 'manyWay':
      case 'oneToMany':
      case 'manyToMany':
      case 'manyToManyMorph':
      case 'manyMorphToMany':
      case 'manyMorphToOne':
        values[association.alias] = [];
        break;
      default:
    }
  }

  return values;
};

module.exports = {
  async findOne(params, populate, { transacting } = {}) {
    const record = await this.forge({
      [this.primaryKey]: getValuePrimaryKey(params, this.primaryKey),
    }).fetch({
      transacting,
      withRelated: populate,
    });

    const data = record ? record.toJSON() : record;

    if (_.isEmpty(populate)) {
      const arrayOfPromises = this.associations
        .filter(association =>
          ['manyMorphToOne', 'manyMorphToMany'].includes(association.nature)
        )
        .map(() =>
          this.morph
            .forge()
            .where({
              [`${this.collectionName}_id`]: getValuePrimaryKey(params, this.primaryKey),
            })
            .fetchAll({
              transacting,
            })
        );

      const related = await Promise.all(arrayOfPromises);

      for (let i = 0; i < related.length; i++) {
        data[this.associations[i].alias] = related[i] ? related[i].toJSON() : related[i];
      }
    }

    return data;
  },

  async update(params, { transacting } = {}) {
    const relationUpdates = [];
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, {
      transacting,
    });

    const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, current) => {
      const property = params.values[current];
      const association = this.associations.find(x => x.alias === current);
      const details = this._attributes[current];

      if (!association && _.get(details, 'isVirtual') !== true) {
        return _.set(acc, current, property);
      }

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

      switch (association.nature) {
        case 'oneWay':
        case 'manyToOne':
        case 'oneMorphToOne':
        case 'oneMorphToMany':
          return _.set(acc, current, _.get(property, assocModel.primaryKey, property));

        case 'oneToOne':
          return handleOneToOneUpdate(
            association,
            assocModel,
            response,
            property,
            primaryKeyValue,
            details,
            transacting
          ).then(value => _.set(acc, current, value));

        case 'oneToMany':
          return handleOneToManyUpdate(
            association,
            assocModel,
            response,
            property,
            details,
            transacting
          ).then(() => acc);

        case 'manyWay':
        case 'manyToMany':
          return handleManyToManyUpdate(
            association,
            this.forge({ [this.primaryKey]: primaryKeyValue })[association.alias](),
            transformToArrayID(response[current]),
            transformToArrayID(params.values[current]),
            transacting
          ).then(() => acc);

        case 'manyMorphToMany':
        case 'manyMorphToOne':
          return handleManyMorphToManyUpdate(
            association,
            current,
            response,
            params,
            transacting
          ).then(() => acc);

        case 'oneToManyMorph':
        case 'manyToManyMorph':
          return handleManyToManyMorphUpdate(
            association,
            details,
            response,
            params,
            transacting
          ).then(() => acc);

        default:
      }

      return acc;
    }, {});

    await Promise.all(relationUpdates);

    delete values[this.primaryKey];
    if (!_.isEmpty(values)) {
      await this.forge({
        [this.primaryKey]: getValuePrimaryKey(params, this.primaryKey),
      }).save(values, {
        patch: true,
        transacting,
      });
    }

    const result = await this.forge({
      [this.primaryKey]: getValuePrimaryKey(params, this.primaryKey),
    }).fetch({
      transacting,
    });

    return result && result.toJSON ? result.toJSON() : result;
  },

  deleteRelations(id, { transacting }) {
    const values = buildValuesForDelete(this.associations);

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};
```