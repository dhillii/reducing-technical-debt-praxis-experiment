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
 * Transform array values to ID strings
 * @param {any} array - Input array or single value
 * @returns {string[]} - Array of stringified IDs
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
 * Add relation morph entry to database
 * @param {Object} model - Model instance
 * @param {Object} params - Relation parameters
 * @param {Object} transacting - Transaction object
 * @returns {Promise} - Saved morph record
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
 * Remove relation morph entry from database
 * @param {Object} model - Model instance
 * @param {Object} params - Relation parameters
 * @param {Object} transacting - Transaction object
 * @returns {Promise} - Destroyed morph record
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
 * Strategy handler for oneWay association updates
 * @param {Object} acc - Accumulator object
 * @param {any} property - Property value
 * @param {Object} assocModel - Associated model
 * @param {Object} details - Attribute details
 * @returns {Object} - Updated accumulator
 */
const handleOneWayUpdate = (acc, property, assocModel, details) => {
  return _.set(acc, 'current', _.get(property, assocModel.primaryKey, property));
};

/**
 * Strategy handler for oneToOne association updates
 * @param {Object} acc - Accumulator object
 * @param {any} property - Property value
 * @param {Object} response - Current response data
 * @param {Object} assocModel - Associated model
 * @param {Object} details - Attribute details
 * @param {string} primaryKeyValue - Primary key value
 * @param {Array} relationUpdates - Array of update promises
 * @returns {Object} - Updated accumulator
 */
const handleOneToOneUpdate = (
  acc,
  property,
  response,
  assocModel,
  details,
  primaryKeyValue,
  relationUpdates
) => {
  if (response.current === property) return acc;

  if (_.isNull(property)) {
    const updatePromise = assocModel
      .where({
        [assocModel.primaryKey]: getValuePrimaryKey(
          response.current,
          assocModel.primaryKey
        ),
      })
      .save(
        { [details.via]: null },
        {
          method: 'update',
          patch: true,
          require: false,
          transacting: {},
        }
      );

    relationUpdates.push(updatePromise);
    return _.set(acc, 'current', null);
  }

  const updateLink = this.where({ current: property })
    .save(
      { current: null },
      {
        method: 'update',
        patch: true,
        require: false,
        transacting: {},
      }
    )
    .then(() => {
      return assocModel.where({ [this.primaryKey]: property }).save(
        { [details.via]: primaryKeyValue },
        {
          method: 'update',
          patch: true,
          require: false,
          transacting: {},
        }
      );
    });

  relationUpdates.push(updateLink);
  return _.set(acc, 'current', property);
};

/**
 * Strategy handler for oneToMany association updates
 * @param {Object} acc - Accumulator object
 * @param {any} property - Property value
 * @param {Object} assocModel - Associated model
 * @param {Object} details - Attribute details
 * @param {string} primaryKeyValue - Primary key value
 * @param {Array} relationUpdates - Array of update promises
 * @returns {Object} - Updated accumulator
 */
const handleOneToManyUpdate = (
  acc,
  property,
  assocModel,
  details,
  primaryKeyValue,
  relationUpdates
) => {
  const currentIds = response.current;
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
        transacting: {},
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
          { [details.via]: primaryKeyValue },
          {
            method: 'update',
            patch: true,
            require: false,
            transacting: {},
          }
        );
    });

  relationUpdates.push(updatePromise);
  return acc;
};

/**
 * Strategy handler for manyToOne association updates
 * @param {Object} acc - Accumulator object
 * @param {any} property - Property value
 * @param {Object} assocModel - Associated model
 * @returns {Object} - Updated accumulator
 */
const handleManyToOneUpdate = (acc, property, assocModel) => {
  return _.set(acc, 'current', _.get(property, assocModel.primaryKey, property));
};

/**
 * Strategy handler for manyWay/manyToMany association updates
 * @param {Object} acc - Accumulator object
 * @param {any} property - Property value
 * @param {Object} response - Current response data
 * @param {Object} association - Association details
 * @param {string} primaryKeyValue - Primary key value
 * @param {Array} relationUpdates - Array of update promises
 * @returns {Object} - Updated accumulator
 */
const handleManyToManyUpdate = (
  acc,
  property,
  response,
  association,
  primaryKeyValue,
  relationUpdates
) => {
  const storedValue = transformToArrayID(response.current);
  const currentValue = transformToArrayID(property);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = this.forge({
    [this.primaryKey]: primaryKeyValue,
  })[association.alias]();

  const updatePromise = collection
    .detach(toRemove, { transacting: {} })
    .then(() => collection.attach(toAdd, { transacting: {} }));

  relationUpdates.push(updatePromise);
  return acc;
};

/**
 * Strategy handler for manyMorphToMany/manyMorphToOne association updates
 * @param {Object} relationUpdates - Array of update promises
 * @param {Object} this - Model instance
 * @param {Object} response - Current response data
 * @param {Object} association - Association details
 * @param {Object} params - Relation parameters
 * @returns {Array} - Updated relation updates array
 */
const handleManyMorphUpdate = (
  relationUpdates,
  thisModel,
  response,
  association,
  params
) => {
  const refs = params.values[current];

  if (Array.isArray(refs) && refs.length === 0) {
    relationUpdates.push(
      removeRelationMorph(thisModel, { params: { id: primaryKeyValue }, transacting: {} })
    );
    return relationUpdates;
  }

  refs.forEach(obj => {
    const targetModel = strapi.db.getModel(
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
          transacting: {},
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
            transacting: {},
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
        .fetch({ transacting: {} });

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
        transacting: {},
      });
    };

    relationUpdates.push(addRelation());
  });
  return relationUpdates;
};

/**
 * Strategy handler for oneToManyMorph/manyToManyMorph association updates
 * @param {Object} relationUpdates - Array of update promises
 * @param {Object} model - Model instance
 * @param {Object} association - Association details
 * @param {Object} response - Current response data
 * @param {string} primaryKeyValue - Primary key value
 * @returns {Array} - Updated relation updates array
 */
const handleMorphToManyUpdate = (
  relationUpdates,
  model,
  association,
  response,
  primaryKeyValue
) => {
  const currentValue = transformToArrayID(params.values[current]);

  const promise = removeRelationMorph(model, {
    params: {
      alias: association.via,
      ref: thisModel.collectionName,
      refId: response.id,
      field: association.alias,
    },
    transacting: {},
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
          transacting: {},
        });
      })
    );
  });

  relationUpdates.push(promise);
  return relationUpdates;
};

/**
 * Strategy handler for oneMorphToOne/oneMorphToMany association updates
 * @returns {Object} - Empty accumulator
 */
const handleMorphToOneUpdate = () => {
  return {};
};

/**
 * Association update strategies lookup table
 * @type {Object}
 */
const associationUpdateStrategies = {
  oneWay: handleOneWayUpdate,
  oneToOne: handleOneToOneUpdate,
  oneToMany: handleOneToManyUpdate,
  manyToOne: handleManyToOneUpdate,
  manyWay: handleManyToManyUpdate,
  manyToMany: handleManyToManyUpdate,
  manyMorphToMany: handleManyMorphUpdate,
  manyMorphToOne: handleManyMorphUpdate,
  oneToManyMorph: handleMorphToManyUpdate,
  manyToManyMorph: handleMorphToManyUpdate,
  oneMorphToOne: handleMorphToOneUpdate,
  oneMorphToMany: handleMorphToOneUpdate,
};

/**
 * Association delete strategies lookup table
 * @type {Object}
 */
const associationDeleteStrategies = {
  oneWay: () => null,
  oneToOne: () => null,
  manyToOne: () => null,
  oneToManyMorph: () => null,
  manyWay: () => [],
  oneToMany: () => [],
  manyToMany: () => [],
  manyToManyMorph: () => [],
  manyMorphToMany: () => [],
  manyMorphToOne: () => [],
  oneToManyMorph: () => null,
  manyToManyMorph: () => [],
  oneMorphToOne: () => null,
  oneMorphToMany: () => null,
};

/**
 * Find association by alias
 * @param {Array} associations - Array of associations
 * @param {string} alias - Association alias
 * @returns {Object|null} - Found association or null
 */
const findAssociationByAlias = (associations, alias) => {
  return associations.find(x => x.alias === alias);
};

/**
 * Get attribute details by key
 * @param {Object} attributes - Attributes object
 * @param {string} key - Attribute key
 * @returns {Object|null} - Attribute details or null
 */
const getAttributeDetails = (attributes, key) => {
  return attributes[key];
};

/**
 * Get associated model from details
 * @param {Object} details - Attribute details
 * @returns {Object|null} - Associated model or null
 */
const getAssociatedModel = details => {
  return strapi.db.getModel(details.model || details.collection, details.plugin);
};

/**
 * Update relation associations based on association type
 * @param {Object} this - Model instance
 * @param {Object} params - Update parameters
 * @param {Object} transacting - Transaction object
 * @returns {Promise} - Updated record
 */
const updateRelations = async (thisModel, params, transacting) => {
  const relationUpdates = [];
  const primaryKeyValue = getValuePrimaryKey(params, thisModel.primaryKey);
  const response = await thisModel.findOne.call(thisModel, params, null, {
    transacting,
  });

  const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, current) => {
    const property = params.values[current];
    const association = findAssociationByAlias(thisModel.associations, current);
    const details = getAttributeDetails(thisModel._attributes, current);

    if (!association && _.get(details, 'isVirtual') !== true) {
      return _.set(acc, current, property);
    }

    const assocModel = getAssociatedModel(details);

    const strategy = associationUpdateStrategies[association.nature];
    if (strategy) {
      return strategy(acc, property, response, assocModel, details, primaryKeyValue, relationUpdates);
    }

    return acc;
  }, {});

  await Promise.all(relationUpdates);

  delete values[thisModel.primaryKey];
  if (!_.isEmpty(values)) {
    await thisModel.forge({
      [thisModel.primaryKey]: getValuePrimaryKey(params, thisModel.primaryKey),
    }).save(values, {
      patch: true,
      transacting,
    });
  }

  const result = await thisModel.forge({
    [thisModel.primaryKey]: getValuePrimaryKey(params, thisModel.primaryKey),
  }).fetch({
    transacting,
  });

  return result && result.toJSON ? result.toJSON() : result;
};

/**
 * Delete all relation associations for a record
 * @param {string} id - Record ID
 * @param {Object} transacting - Transaction object
 * @returns {Promise} - Updated record
 */
const deleteRelations = async (id, transacting) => {
  const values = {};

  thisModel.associations.map(association => {
    const strategy = associationDeleteStrategies[association.nature];
    if (strategy) {
      values[association.alias] = strategy();
    }
  });

  return thisModel.updateRelations({ [thisModel.primaryKey]: id, values }, { transacting });
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
    return await updateRelations(this, params, transacting);
  },

  deleteRelations(id, { transacting }) {
    return deleteRelations(id, transacting);
  },
};
```