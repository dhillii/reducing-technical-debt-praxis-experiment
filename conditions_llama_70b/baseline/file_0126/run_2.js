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

const handleOneWayAssociation = (acc, current, params, association, details) => {
  return _.set(acc, current, _.get(params.values[current], details.model.primaryKey, params.values[current]));
};

const handleOneToOneAssociation = async (acc, current, params, association, details, transacting, primaryKeyValue, response) => {
  if (response[current] === params.values[current]) return acc;

  if (_.isNull(params.values[current])) {
    const updatePromise = details.model
      .where({
        [details.model.primaryKey]: getValuePrimaryKey(response[current], details.model.primaryKey),
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

    return _.set(acc, current, null);
  }

  const updateLink = details.model.where({ [details.via]: params.values[current] }).save(
    { [details.via]: primaryKeyValue },
    {
      method: 'update',
      patch: true,
      require: false,
      transacting,
    }
  );

  return _.set(acc, current, params.values[current]);
};

const handleOneToManyAssociation = async (acc, current, params, association, details, transacting, primaryKeyValue, response) => {
  const currentIds = response[current];
  const toRemove = _.differenceWith(currentIds, params.values[current], (a, b) => {
    return `${a[details.model.primaryKey] || a}` === `${b[details.model.primaryKey] || b}`;
  });

  const updatePromise = details.model
    .where(
      details.model.primaryKey,
      'in',
      toRemove.map(val => val[details.model.primaryKey] || val)
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
    .then(() => {
      return details.model
        .where(
          details.model.primaryKey,
          'in',
          params.values[current].map(val => val[details.model.primaryKey] || val)
        )
        .save(
          { [details.via]: primaryKeyValue },
          {
            method: 'update',
            patch: true,
            require: false,
            transacting,
          }
        );
    });

  return acc;
};

const handleManyToManyAssociation = async (acc, current, params, association, transacting, primaryKeyValue, response) => {
  const storedValue = transformToArrayID(response[current]);
  const currentValue = transformToArrayID(params.values[current]);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = this.forge({
    [this.primaryKey]: primaryKeyValue,
  })[association.alias]();

  const updatePromise = collection
    .detach(toRemove, { transacting })
    .then(() => collection.attach(toAdd, { transacting }));

  return acc;
};

const handleManyMorphToManyAssociation = async (acc, current, params, association, transacting, primaryKeyValue, response) => {
  const refs = params.values[current];

  if (Array.isArray(refs) && refs.length === 0) {
    await removeRelationMorph(this, { params: { id: primaryKeyValue }, transacting });
    return acc;
  }

  const promises = refs.map(obj => {
    const targetModel = strapi.db.getModel(obj.ref, obj.source !== 'content-manager' ? obj.source : null);

    const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      return removeRelationMorph(this, {
        params: {
          alias: association.alias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
        },
        transacting,
      }).then(() =>
        addRelationMorph(this, {
          params: {
            id: response[this.primaryKey],
            alias: association.alias,
            ref: targetModel.collectionName,
            refId: obj.refId,
            field: obj.field,
            order: 1,
          },
          transacting,
        })
      );
    }

    return addRelationMorph(this, {
      params: {
        id: response[this.primaryKey],
        alias: association.alias,
        ref: targetModel.collectionName,
        refId: obj.refId,
        field: obj.field,
        order: 1,
      },
      transacting,
    });
  });

  await Promise.all(promises);

  return acc;
};

const handleOneToManyMorphAssociation = async (acc, current, params, association, details, transacting, primaryKeyValue, response) => {
  const currentValue = transformToArrayID(params.values[current]);

  const model = strapi.db.getModel(details.collection || details.model, details.plugin);

  const promise = removeRelationMorph(model, {
    params: {
      alias: association.via,
      ref: this.collectionName,
      refId: response.id,
      field: association.alias,
    },
    transacting,
  }).then(() => {
    return Promise.all(
      currentValue.map((id, idx) => {
        return addRelationMorph(model, {
          params: {
            id,
            alias: association.via,
            ref: this.collectionName,
            refId: response.id,
            field: association.alias,
            order: idx + 1,
          },
          transacting,
        });
      })
    );
  });

  await promise;

  return acc;
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
        .filter(association => ['manyMorphToOne', 'manyMorphToMany'].includes(association.nature))
        .map(() => {
          return this.morph
            .forge()
            .where({
              [`${this.collectionName}_id`]: getValuePrimaryKey(params, this.primaryKey),
            })
            .fetchAll({
              transacting,
            });
        });

      const related = await Promise.all(arrayOfPromises);

      related.forEach((value, index) => {
        data[this.associations[index].alias] = value ? value.toJSON() : value;
      });
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
      const association = this.associations.filter(x => x.alias === current)[0];
      const details = this._attributes[current];

      if (!association && _.get(details, 'isVirtual') !== true) {
        return _.set(acc, current, property);
      }

      switch (association.nature) {
        case 'oneWay':
          return handleOneWayAssociation(acc, current, params, association, details);
        case 'oneToOne':
          return handleOneToOneAssociation(acc, current, params, association, details, transacting, primaryKeyValue, response);
        case 'oneToMany':
          return handleOneToManyAssociation(acc, current, params, association, details, transacting, primaryKeyValue, response);
        case 'manyToOne':
          return handleOneWayAssociation(acc, current, params, association, details);
        case 'manyWay':
        case 'manyToMany':
          return handleManyToManyAssociation(acc, current, params, association, transacting, primaryKeyValue, response);
        case 'manyMorphToMany':
        case 'manyMorphToOne':
          return handleManyMorphToManyAssociation(acc, current, params, association, transacting, primaryKeyValue, response);
        case 'oneToManyMorph':
          return handleOneToManyMorphAssociation(acc, current, params, association, details, transacting, primaryKeyValue, response);
        default:
          return acc;
      }
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
    const values = {};

    this.associations.map(association => {
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
    });

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};