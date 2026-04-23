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
 * Transform array to ID format
 * @param {any} array - Input array or value
 * @returns {string[]} - Array of string IDs
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
 * Remove undefined keys from object
 * @param {Object} obj - Input object
 * @returns {Object} - Object without undefined values
 */
const removeUndefinedKeys = obj => _.pickBy(obj, _.negate(_.isUndefined));

/**
 * Add relation morph entry
 * @param {Object} model - Model instance
 * @param {Object} params - Relation parameters
 * @param {Object} transacting - Transaction object
 * @returns {Promise} - Save promise
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
 * Remove relation morph entry
 * @param {Object} model - Model instance
 * @param {Object} params - Relation parameters
 * @param {Object} transacting - Transaction object
 * @returns {Promise} - Destroy promise
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
 * Handle one-way and one-to-one relation updates
 * @param {Object} assocModel - Associated model
 * @param {any} property - New property value
 * @param {Object} details - Attribute details
 * @param {Object} transacting - Transaction object
 * @returns {Promise} - Update promise
 */
const handleOneWayRelation = async (assocModel, property, details, transacting) => {
  if (_.isNull(property)) {
    return assocModel
      .where({
        [assocModel.primaryKey]: getValuePrimaryKey(property, assocModel.primaryKey),
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
  }

  return assocModel.where({ [assocModel.primaryKey]: property }).save(
    { [details.via]: property },
    {
      method: 'update',
      patch: true,
      require: false,
      transacting,
    }
  );
};

/**
 * Handle one-to-many relation updates
 * @param {Object} assocModel - Associated model
 * @param {any} currentIds - Current relation IDs
 * @param {any} property - New property value
 * @param {Object} details - Attribute details
 * @param {Object} transacting - Transaction object
 * @returns {Promise} - Update promise
 */
const handleOneToManyRelation = async (assocModel, currentIds, property, details, transacting) => {
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
    .then(() => {
      return assocModel
        .where(
          assocModel.primaryKey,
          'in',
          property.map(val => val[assocModel.primaryKey] || val)
        )
        .save(
          { [details.via]: getValuePrimaryKey(property, assocModel.primaryKey) },
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
 * Handle many-to-many relation updates
 * @param {Object} collection - Collection instance
 * @param {any} toRemove - IDs to remove
 * @param {any} toAdd - IDs to add
 * @param {Object} transacting - Transaction object
 * @returns {Promise} - Update promise
 */
const handleManyToManyRelation = async (collection, toRemove, toAdd, transacting) => {
  return collection
    .detach(toRemove, { transacting })
    .then(() => collection.attach(toAdd, { transacting }));
};

/**
 * Handle many-to-many morph relation updates
 * @param {Object} this - Model instance
 * @param {Object} association - Association details
 * @param {Object} response - Current response data
 * @param {Object} params - Update parameters
 * @param {Object} transacting - Transaction object
 * @returns {Promise} - Update promise
 */
const handleManyToManyMorphRelation = async (
  thisModel,
  association,
  response,
  params,
  transacting
) => {
  const storedValue = transformToArrayID(response[association.alias]);
  const currentValue = transformToArrayID(params.values[association.alias]);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = thisModel.forge({
    [thisModel.primaryKey]: getValuePrimaryKey(params, thisModel.primaryKey),
  })[association.alias]();

  return handleManyToManyRelation(collection, toRemove, toAdd, transacting);
};

/**
 * Handle many-to-one morph relation updates
 * @param {Object} thisModel - Model instance
 * @param {Object} association - Association details
 * @param {Object} response - Current response data
 * @param {Object} params - Update parameters
 * @param {Object} transacting - Transaction object
 * @returns {Promise} - Update promise
 */
const handleManyToOneMorphRelation = async (
  thisModel,
  association,
  response,
  params,
  transacting
) => {
  const refs = params.values[association.alias];

  if (Array.isArray(refs) && refs.length === 0) {
    return removeRelationMorph(thisModel, {
      params: { id: getValuePrimaryKey(params, thisModel.primaryKey) },
      transacting,
    });
  }

  const relationUpdates = [];

  refs.forEach(obj => {
    const targetModel = thisModel.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );

    const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      relationUpdates.push(
        removeRelationMorph(thisModel, {
          params: {
            alias: association.alias,
            ref: targetModel.collectionName,
            refId: obj.refId,
            field: obj.field,
          },
          transacting,
        }).then(() =>
          addRelationMorph(thisModel, {
            params: {
              id: response[thisModel.primaryKey],
              alias: association.alias,
              ref: targetModel.collectionName,
              refId: obj.refId,
              field: obj.field,
              order: 1,
            },
            transacting,
          })
        )
      );

      return;
    }

    const addRelation = async () => {
      const maxOrder = await thisModel.morph
        .query(qb => {
          qb.max('order as order').where({
            [`${association.alias}_id`]: obj.refId,
            [`${association.alias}_type`]: targetModel.collectionName,
            field: obj.field,
          });
        })
        .fetch({ transacting });

      const { order = 0 } = maxOrder.toJSON();

      await addRelationMorph(thisModel, {
        params: {
          id: response[thisModel.primaryKey],
          alias: association.alias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
          order: order + 1,
        },
        transacting,
      });
    };

    relationUpdates.push(addRelation());
  });

  return Promise.all(relationUpdates);
};

/**
 * Handle one-to-many morph relation updates
 * @param {Object} model - Associated model
 * @param {Object} association - Association details
 * @param {Object} response - Current response data
 * @param {Object} params - Update parameters
 * @param {Object} transacting - Transaction object
 * @returns {Promise} - Update promise
 */
const handleOneToManyMorphRelation = async (
  model,
  association,
  response,
  params,
  transacting
) => {
  const currentValue = transformToArrayID(params.values[association.alias]);

  const promise = removeRelationMorph(model, {
    params: {
      alias: association.via,
      ref: thisModel.collectionName,
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
            ref: thisModel.collectionName,
            refId: response.id,
            field: association.alias,
            order: idx + 1,
          },
          transacting,
        });
      })
    );
  });

  return promise;
};

/**
 * Handle one-to-one morph relation updates
 * @param {Object} thisModel - Model instance
 * @param {Object} association - Association details
 * @param {Object} response - Current response data
 * @param {Object} params - Update parameters
 * @param {Object} transacting - Transaction object
 * @returns {Promise} - Update promise
 */
const handleOneToOneMorphRelation = async (
  thisModel,
  association,
  response,
  params,
  transacting
) => {
  const currentValue = transformToArrayID(params.values[association.alias]);

  const promise = removeRelationMorph(thisModel, {
    params: {
      alias: association.via,
      ref: thisModel.collectionName,
      refId: response.id,
      field: association.alias,
    },
    transacting,
  }).then(() => {
    return Promise.all(
      currentValue.map((id, idx) => {
        return addRelationMorph(thisModel, {
          params: {
            id,
            alias: association.via,
            ref: thisModel.collectionName,
            refId: response.id,
            field: association.alias,
            order: idx + 1,
          },
          transacting,
        });
      })
    );
  });

  return promise;
};

/**
 * Fetch related data for associations
 * @param {Object} thisModel - Model instance
 * @param {Object} params - Fetch parameters
 * @param {Object} transacting - Transaction object
 * @returns {Object} - Related data
 */
const fetchRelatedData = async (thisModel, params, transacting) => {
  const arrayOfPromises = thisModel.associations
    .filter(association => ['manyMorphToOne', 'manyMorphToMany'].includes(association.nature))
    .map(() => {
      return thisModel.morph
        .forge()
        .where({
          [`${thisModel.collectionName}_id`]: getValuePrimaryKey(params, thisModel.primaryKey),
        })
        .fetchAll({
          transacting,
        });
    });

  const related = await Promise.all(arrayOfPromises);

  const data = {};

  related.forEach((value, index) => {
    data[thisModel.associations[index].alias] = value ? value.toJSON() : value;
  });

  return data;
};

/**
 * Update relation based on association nature
 * @param {Object} thisModel - Model instance
 * @param {Object} association - Association details
 * @param {Object} assocModel - Associated model
 * @param {any} property - New property value
 * @param {Object} details - Attribute details
 * @param {Object} response - Current response data
 * @param {Object} params - Update parameters
 * @param {Object} transacting - Transaction object
 * @returns {Promise} - Update promise
 */
const updateRelation = async (
  thisModel,
  association,
  assocModel,
  property,
  details,
  response,
  params,
  transacting
) => {
  switch (association.nature) {
    case 'oneWay':
    case 'oneToOne': {
      return handleOneWayRelation(assocModel, property, details, transacting);
    }
    case 'oneToMany': {
      return handleOneToManyRelation(assocModel, response[association.alias], property, details, transacting);
    }
    case 'manyWay':
    case 'manyToMany': {
      return handleManyToManyRelation(
        thisModel.forge({
          [thisModel.primaryKey]: getValuePrimaryKey(params, thisModel.primaryKey),
        })[association.alias](),
        response[association.alias],
        property,
        transacting
      );
    }
    case 'manyMorphToMany':
    case 'manyMorphToOne': {
      return handleManyToManyMorphRelation(thisModel, association, response, params, transacting);
    }
    case 'oneToManyMorph':
    case 'manyToManyMorph': {
      return handleOneToManyMorphRelation(assocModel, association, response, params, transacting);
    }
    case 'oneMorphToOne':
    case 'oneMorphToMany': {
      return handleOneToOneMorphRelation(thisModel, association, response, params, transacting);
    }
    default:
      return Promise.resolve();
  }
};

/**
 * Find one record with relations
 * @param {Object} params - Fetch parameters
 * @param {Array} populate - Relations to populate
 * @param {Object} transacting - Transaction object
 * @returns {Object} - Record data
 */
const findOne = async (params, populate, { transacting } = {}) => {
  const record = await this.forge({
    [this.primaryKey]: getValuePrimaryKey(params, this.primaryKey),
  }).fetch({
    transacting,
    withRelated: populate,
  });

  const data = record ? record.toJSON() : record;

  // Retrieve data manually.
  if (_.isEmpty(populate)) {
    const relatedData = await fetchRelatedData(this, params, transacting);

    Object.keys(relatedData).forEach(key => {
      data[key] = relatedData[key];
    });
  }

  return data;
};

/**
 * Update record with relations
 * @param {Object} params - Update parameters
 * @param {Object} transacting - Transaction object
 * @returns {Object} - Updated record data
 */
const update = async (params, { transacting } = {}) => {
  const relationUpdates = [];
  const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
  const response = await findOne.call(this, params, null, {
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

    const assocModel = this.db.getModel(details.model || details.collection, details.plugin);

    return updateRelation(
      this,
      association,
      assocModel,
      property,
      details,
      response,
      params,
      transacting
    ).then(() => _.set(acc, current, property));
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

/**
 * Delete all relations for a record
 * @param {string} id - Record ID
 * @param {Object} transacting - Transaction object
 * @returns {Promise} - Update promise
 */
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
  findOne,
  update,
  deleteRelations,
};