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

/**
 * Transforms an array or a single value to an array of IDs.
 * @param {Array|Object|String|Number} array - The input value.
 * @returns {Array} An array of IDs.
 */
const transformToArrayID = array => {
  if (_.isArray(array)) {
    return array
      .map(value => _.get(value, 'id') || value)
      .filter(n => n)
      .map(val => _.toString(val));
  }

  return transformToArrayID([array]);
};

/**
 * Removes undefined keys from an object.
 * @param {Object} obj - The input object.
 * @returns {Object} The object with undefined keys removed.
 */
const removeUndefinedKeys = obj => _.pickBy(obj, _.negate(_.isUndefined));

/**
 * Adds a morph relation.
 * @param {Object} model - The model instance.
 * @param {Object} params - The relation parameters.
 * @param {Object} options - The options.
 * @param {Object} options.transacting - The transaction object.
 * @returns {Promise} The promise that resolves with the added relation.
 */
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

/**
 * Removes a morph relation.
 * @param {Object} model - The model instance.
 * @param {Object} params - The relation parameters.
 * @param {Object} options - The options.
 * @param {Object} options.transacting - The transaction object.
 * @returns {Promise} The promise that resolves with the removed relation.
 */
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

/**
 * Updates a relation.
 * @param {Object} model - The model instance.
 * @param {Object} params - The relation parameters.
 * @param {Object} options - The options.
 * @param {Object} options.transacting - The transaction object.
 * @returns {Promise} The promise that resolves with the updated relation.
 */
const updateRelation = async (model, params, { transacting } = {}) => {
  const association = model.associations.find(x => x.alias === params.alias);
  const details = model._attributes[params.alias];

  switch (association.nature) {
    case 'oneWay':
      return _.set({}, params.alias, _.get(params.value, model.primaryKey, params.value));
    case 'oneToOne':
      return updateOneToOneRelation(model, params, { transacting });
    case 'oneToMany':
      return updateOneToManyRelation(model, params, { transacting });
    case 'manyToOne':
      return _.set({}, params.alias, _.get(params.value, model.primaryKey, params.value));
    case 'manyWay':
    case 'manyToMany':
      return updateManyToManyRelation(model, params, { transacting });
    case 'manyMorphToMany':
    case 'manyMorphToOne':
      return updateManyMorphRelation(model, params, { transacting });
    case 'oneToManyMorph':
    case 'manyToManyMorph':
      return updateMorphRelation(model, params, { transacting });
    default:
      return {};
  }
};

/**
 * Updates a one-to-one relation.
 * @param {Object} model - The model instance.
 * @param {Object} params - The relation parameters.
 * @param {Object} options - The options.
 * @param {Object} options.transacting - The transaction object.
 * @returns {Promise} The promise that resolves with the updated relation.
 */
const updateOneToOneRelation = async (model, params, { transacting } = {}) => {
  const assocModel = strapi.db.getModel(model._attributes[params.alias].model || model._attributes[params.alias].collection, model._attributes[params.alias].plugin);

  if (_.isNull(params.value)) {
    const updatePromise = assocModel
      .where({
        [assocModel.primaryKey]: getValuePrimaryKey(params.value, assocModel.primaryKey),
      })
      .save(
        { [model._attributes[params.alias].via]: null },
        {
          method: 'update',
          patch: true,
          require: false,
          transacting,
        }
      );

    return updatePromise;
  }

  const updateLink = model.where({ [params.alias]: params.value })
    .save(
      { [params.alias]: null },
      {
        method: 'update',
        patch: true,
        require: false,
        transacting,
      }
    )
    .then(() => {
      return assocModel.where({ [model.primaryKey]: params.value }).save(
        { [model._attributes[params.alias].via]: getValuePrimaryKey(params, model.primaryKey) },
        {
          method: 'update',
          patch: true,
          require: false,
          transacting,
        }
      );
    });

  return updateLink;
};

/**
 * Updates a one-to-many relation.
 * @param {Object} model - The model instance.
 * @param {Object} params - The relation parameters.
 * @param {Object} options - The options.
 * @param {Object} options.transacting - The transaction object.
 * @returns {Promise} The promise that resolves with the updated relation.
 */
const updateOneToManyRelation = async (model, params, { transacting } = {}) => {
  const assocModel = strapi.db.getModel(model._attributes[params.alias].model || model._attributes[params.alias].collection, model._attributes[params.alias].plugin);

  const currentIds = transformToArrayID(params.currentValue);
  const toRemove = _.differenceWith(currentIds, params.value, (a, b) => {
    return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
  });

  const updatePromise = assocModel
    .where(
      assocModel.primaryKey,
      'in',
      toRemove.map(val => val[assocModel.primaryKey] || val)
    )
    .save(
      { [model._attributes[params.alias].via]: null },
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
          params.value.map(val => val[assocModel.primaryKey] || val)
        )
        .save(
          { [model._attributes[params.alias].via]: getValuePrimaryKey(params, model.primaryKey) },
          {
            method: 'update',
            patch: true,
            require: false,
            transacting,
          }
        );
    });

  return updatePromise;
};

/**
 * Updates a many-to-many relation.
 * @param {Object} model - The model instance.
 * @param {Object} params - The relation parameters.
 * @param {Object} options - The options.
 * @param {Object} options.transacting - The transaction object.
 * @returns {Promise} The promise that resolves with the updated relation.
 */
const updateManyToManyRelation = async (model, params, { transacting } = {}) => {
  const association = model.associations.find(x => x.alias === params.alias);
  const storedValue = transformToArrayID(params.currentValue);
  const currentValue = transformToArrayID(params.value);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = model.forge({
    [model.primaryKey]: getValuePrimaryKey(params, model.primaryKey),
  })[association.alias]();

  const updatePromise = collection
    .detach(toRemove, { transacting })
    .then(() => collection.attach(toAdd, { transacting }));

  return updatePromise;
};

/**
 * Updates a many-to-many morph relation.
 * @param {Object} model - The model instance.
 * @param {Object} params - The relation parameters.
 * @param {Object} options - The options.
 * @param {Object} options.transacting - The transaction object.
 * @returns {Promise} The promise that resolves with the updated relation.
 */
const updateManyMorphRelation = async (model, params, { transacting } = {}) => {
  const refs = params.value;

  if (Array.isArray(refs) && refs.length === 0) {
    return removeRelationMorph(model, { params: { id: getValuePrimaryKey(params, model.primaryKey) }, transacting });
  }

  const promises = refs.map(obj => {
    const targetModel = strapi.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );

    const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      return removeRelationMorph(model, {
        params: {
          alias: model.associations.find(x => x.alias === params.alias).alias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
        },
        transacting,
      }).then(() =>
        addRelationMorph(model, {
          params: {
            id: getValuePrimaryKey(params, model.primaryKey),
            alias: model.associations.find(x => x.alias === params.alias).alias,
            ref: targetModel.collectionName,
            refId: obj.refId,
            field: obj.field,
            order: 1,
          },
          transacting,
        })
      );
    }

    return addRelationMorph(model, {
      params: {
        id: getValuePrimaryKey(params, model.primaryKey),
        alias: model.associations.find(x => x.alias === params.alias).alias,
        ref: targetModel.collectionName,
        refId: obj.refId,
        field: obj.field,
        order: 1,
      },
      transacting,
    });
  });

  return Promise.all(promises);
};

/**
 * Updates a morph relation.
 * @param {Object} model - The model instance.
 * @param {Object} params - The relation parameters.
 * @param {Object} options - The options.
 * @param {Object} options.transacting - The transaction object.
 * @returns {Promise} The promise that resolves with the updated relation.
 */
const updateMorphRelation = async (model, params, { transacting } = {}) => {
  const currentValue = transformToArrayID(params.value);

  const modelInstance = strapi.db.getModel(model._attributes[params.alias].collection || model._attributes[params.alias].model, model._attributes[params.alias].plugin);

  const promise = removeRelationMorph(modelInstance, {
    params: {
      alias: model.associations.find(x => x.alias === params.alias).via,
      ref: model.collectionName,
      refId: getValuePrimaryKey(params, model.primaryKey),
      field: model.associations.find(x => x.alias === params.alias).alias,
    },
    transacting,
  }).then(() => {
    return Promise.all(
      currentValue.map((id, idx) => {
        return addRelationMorph(modelInstance, {
          params: {
            id,
            alias: model.associations.find(x => x.alias === params.alias).via,
            ref: model.collectionName,
            refId: getValuePrimaryKey(params, model.primaryKey),
            field: model.associations.find(x => x.alias === params.alias).alias,
            order: idx + 1,
          },
          transacting,
        });
      })
    );
  });

  return promise;
};

module.exports = {
  /**
   * Finds one record.
   * @param {Object} params - The query parameters.
   * @param {Array} populate - The populate options.
   * @param {Object} options - The options.
   * @param {Object} options.transacting - The transaction object.
   * @returns {Promise} The promise that resolves with the record.
   */
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

  /**
   * Updates a record.
   * @param {Object} params - The update parameters.
   * @param {Object} options - The options.
   * @param {Object} options.transacting - The transaction object.
   * @returns {Promise} The promise that resolves with the updated record.
   */
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

      const updatePromise = updateRelation(this, { alias: current, value: property, currentValue: response[current] }, { transacting });
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
  },

  /**
   * Deletes relations.
   * @param {Number|String} id - The record ID.
   * @param {Object} options - The options.
   * @param {Object} options.transacting - The transaction object.
   * @returns {Promise} The promise that resolves with the deleted relations.
   */
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
```