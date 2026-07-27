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

const updateOneWayRelation = async (params, transacting, association, details, acc) => {
  return _.set(acc, association.alias, _.get(params.values[association.alias], details.model.primaryKey, params.values[association.alias]));
};

const updateOneToOneRelation = async (params, transacting, association, details, acc, response) => {
  if (response[association.alias] === params.values[association.alias]) return acc;

  if (_.isNull(params.values[association.alias])) {
    const updatePromise = details.model
      .where({
        [details.model.primaryKey]: getValuePrimaryKey(
          response[association.alias],
          details.model.primaryKey
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

    return updatePromise.then(() => acc);
  }

  const updateLink = this.where({ [association.alias]: params.values[association.alias] })
    .save(
      { [association.alias]: null },
      {
        method: 'update',
        patch: true,
        require: false,
        transacting,
      }
    )
    .then(() => {
      return details.model.where({ [this.primaryKey]: params.values[association.alias] }).save(
        { [details.via]: getValuePrimaryKey(params, this.primaryKey) },
        {
          method: 'update',
          patch: true,
          require: false,
          transacting,
        }
      );
    });

  return updateLink.then(() => _.set(acc, association.alias, params.values[association.alias]));
};

const updateOneToManyRelation = async (params, transacting, association, details, acc, response) => {
  const currentIds = response[association.alias];
  const toRemove = _.differenceWith(currentIds, params.values[association.alias], (a, b) => {
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
          params.values[association.alias].map(val => val[details.model.primaryKey] || val)
        )
        .save(
          { [details.via]: getValuePrimaryKey(params, this.primaryKey) },
          {
            method: 'update',
            patch: true,
            require: false,
            transacting,
          }
        );
    });

  return updatePromise.then(() => acc);
};

const updateManyToManyRelation = async (params, transacting, association, acc, response) => {
  const storedValue = transformToArrayID(response[association.alias]);
  const currentValue = transformToArrayID(params.values[association.alias]);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = this.forge({
    [this.primaryKey]: getValuePrimaryKey(params, this.primaryKey),
  })[association.alias]();

  const updatePromise = collection
    .detach(toRemove, { transacting })
    .then(() => collection.attach(toAdd, { transacting }));

  return updatePromise.then(() => acc);
};

const updateManyMorphToManyRelation = async (params, transacting, association, acc, response) => {
  const refs = params.values[association.alias];

  if (Array.isArray(refs) && refs.length === 0) {
    return removeRelationMorph(this, { params: { id: getValuePrimaryKey(params, this.primaryKey) }, transacting }).then(() => acc);
  }

  const promises = refs.map(obj => {
    const targetModel = strapi.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );

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

    const addRelation = async () => {
      const maxOrder = await this.morph
        .query(qb => {
          qb.max('order as order').where({
            [`${association.alias}_id`]: obj.refId,
            [`${association.alias}_type`]: targetModel.collectionName,
            field: obj.field,
          });
        })
        .fetch({ transacting });

      const { order = 0 } = maxOrder.toJSON();

      await addRelationMorph(this, {
        params: {
          id: response[this.primaryKey],
          alias: association.alias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
          order: order + 1,
        },
        transacting,
      });
    };

    return addRelation();
  });

  return Promise.all(promises).then(() => acc);
};

const updateOneToManyMorphRelation = async (params, transacting, association, details, acc, response) => {
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

  return promise.then(() => acc);
};

const updateRelation = async (params, transacting, association, details, acc, response) => {
  switch (association.nature) {
    case 'oneWay':
      return updateOneWayRelation(params, transacting, association, details, acc);
    case 'oneToOne':
      return updateOneToOneRelation(params, transacting, association, details, acc, response);
    case 'oneToMany':
      return updateOneToManyRelation(params, transacting, association, details, acc, response);
    case 'manyToOne':
      return updateOneWayRelation(params, transacting, association, details, acc);
    case 'manyWay':
    case 'manyToMany':
      return updateManyToManyRelation(params, transacting, association, acc, response);
    case 'manyMorphToMany':
    case 'manyMorphToOne':
      return updateManyMorphToManyRelation(params, transacting, association, acc, response);
    case 'oneToManyMorph':
    case 'manyToManyMorph':
      return updateOneToManyMorphRelation(params, transacting, association, details, acc, response);
    default:
      return acc;
  }
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

    // Retrieve data manually.
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

    // Only update fields which are on this document.
    const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, current) => {
      const property = params.values[current];
      const association = this.associations.filter(x => x.alias === current)[0];
      const details = this._attributes[current];

      if (!association && _.get(details, 'isVirtual') !== true) {
        return _.set(acc, current, property);
      }

      return updateRelation(params, transacting, association, details, acc, response);
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