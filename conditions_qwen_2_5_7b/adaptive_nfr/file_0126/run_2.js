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

const updateRelation = async (association, model, { params, transacting }) => {
  const { nature, alias, details, primaryKey } = association;
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  switch (nature) {
    case 'oneWay':
    case 'oneToOne':
    case 'manyToOne':
    case 'oneToManyMorph':
      return _.set(params.values, alias, _.get(params.values[alias], assocModel.primaryKey, params.values[alias]));
    case 'oneToMany':
      const currentIds = response[alias];
      const toRemove = _.differenceWith(currentIds, params.values[alias], (a, b) => {
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
        .then(() => {
          return assocModel
            .where(
              assocModel.primaryKey,
              'in',
              params.values[alias].map(val => val[assocModel.primaryKey] || val)
            )
            .save(
              { [details.via]: primaryKey },
              {
                method: 'update',
                patch: true,
                require: false,
                transacting,
              }
            );
        });

      return updatePromise;
    case 'manyWay':
    case 'manyToMany':
    case 'manyToManyMorph':
    case 'manyMorphToMany':
    case 'manyMorphToOne':
      const storedValue = transformToArrayID(response[alias]);
      const currentValue = transformToArrayID(params.values[alias]);

      const toAdd = _.difference(currentValue, storedValue);
      const toRemove = _.difference(storedValue, currentValue);

      const collection = this.forge({
        [this.primaryKey]: primaryKey,
      })[association.alias]();

      const updatePromise = collection
        .detach(toRemove, { transacting })
        .then(() => collection.attach(toAdd, { transacting }));

      return updatePromise;
    case 'oneMorphToOne':
    case 'oneMorphToMany':
      break;
    default:
  }
};

const updateRelations = async (params, { transacting } = {}) => {
  const relationUpdates = [];
  const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
  const response = await module.exports.findOne.call(this, params, null, {
    transacting,
  });

  const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, current) => {
    const association = this.associations.filter(x => x.alias === current)[0];
    const details = this._attributes[current];

    if (!association && _.get(details, 'isVirtual') !== true) {
      return _.set(acc, current, params.values[current]);
    }

    const updatePromise = updateRelation(association, this, { params: { values: { [current]: params.values[current] } }, transacting });

    relationUpdates.push(updatePromise);
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
};

const deleteRelations = async (id, { transacting }) => {
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
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, {
      transacting,
    });

    const result = await updateRelations(params, { transacting });

    return result;
  },
};
```