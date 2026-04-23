'use strict';

/**
 * Module dependencies
 */

// Public node modules.
const _ = require('lodash');
const mongoose = require('mongoose');

// Utils
const {
  models: { getValuePrimaryKey },
} = require('strapi-utils');

/**
 * Transform array to array of IDs using primary key
 * @param {any} array - Input array or value
 * @param {string} pk - Primary key field name
 * @returns {string[]} Array of stringified IDs
 */
const transformToArrayID = (array, pk) => {
  if (_.isArray(array)) {
    return array
      .map(value => value && (getValuePrimaryKey(value, pk) || value))
      .filter(n => n)
      .map(val => _.toString(val));
  }

  return transformToArrayID([array]);
};

/**
 * Remove undefined keys from object
 * @param {Object} obj - Input object
 * @returns {Object} Object with undefined keys removed
 */
const removeUndefinedKeys = (obj = {}) => _.pickBy(obj, _.negate(_.isUndefined));

/**
 * Strategy interface for association update operations
 * @typedef {Object} UpdateStrategy
 * @property {Function} handler - The update handler function
 */

/**
 * Strategy interface for association delete operations
 * @typedef {Object} DeleteStrategy
 * @property {Function} handler - The delete handler function
 */

/**
 * Update strategy for oneWay associations
 * @param {Object} acc - Accumulator object
 * @param {string} attribute - Attribute name
 * @param {any} newValue - New value
 * @param {Object} assocModel - Associated model
 * @returns {Object} Updated accumulator
 */
const updateOneWayStrategy = (acc, attribute, newValue, assocModel) => {
  return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
};

/**
 * Update strategy for oneToOne associations
 * @param {Object} acc - Accumulator object
 * @param {string} attribute - Attribute name
 * @param {any} currentValue - Current value
 * @param {any} newValue - New value
 * @param {Object} assocModel - Associated model
 * @param {Object} details - Attribute details
 * @param {Object} session - MongoDB session
 * @param {Function} updateOne - Update one method
 * @returns {Object} Updated accumulator
 */
const updateOneToOneStrategy = (acc, attribute, currentValue, newValue, assocModel, details, session, updateOne) => {
  // if value is the same don't do anything
  if (currentValue === newValue) return acc;

  // if the value is null, set field to null on both sides
  if (_.isNull(newValue)) {
    const updatePromise = assocModel.updateOne(
      {
        [assocModel.primaryKey]: getValuePrimaryKey(currentValue, assocModel.primaryKey),
      },
      { [details.via]: null },
      { session }
    );

    return _.set(acc, attribute, null);
  }

  // set old relations to null
  const updateLink = updateOne(
    { [attribute]: new mongoose.Types.ObjectId(newValue) },
    { [attribute]: null },
    { session }
  ).then(() => {
    return assocModel.updateOne(
      {
        [this.primaryKey]: new mongoose.Types.ObjectId(newValue),
      },
      { [details.via]: getValuePrimaryKey(currentValue, assocModel.primaryKey) },
      { session }
    );
  });

  // set new relation
  return updateLink.then(() => _.set(acc, attribute, newValue));
};

/**
 * Update strategy for oneToMany associations
 * @param {Object} acc - Accumulator object
 * @param {string} attribute - Attribute name
 * @param {any} currentValue - Current value
 * @param {any} newValue - New value
 * @param {Object} assocModel - Associated model
 * @param {Object} details - Attribute details
 * @param {Object} session - MongoDB session
 * @returns {Object} Updated accumulator
 */
const updateOneToManyStrategy = (acc, attribute, currentValue, newValue, assocModel, details, session) => {
  // set relation to null for all the ids not in the list
  const attributeIds = currentValue;
  const toRemove = _.differenceWith(attributeIds, newValue, (a, b) => {
    return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
  });

  const updatePromise = assocModel
    .updateMany(
      {
        [assocModel.primaryKey]: {
          $in: toRemove.map(
            val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)
          ),
        },
      },
      { [details.via]: null },
      { session }
    )
    .then(() => {
      return assocModel.updateMany(
        {
          [assocModel.primaryKey]: {
            $in: newValue.map(
              val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)
            ),
          },
        },
        { [details.via]: getValuePrimaryKey(currentValue, assocModel.primaryKey) },
        { session }
      );
    });

  return updatePromise;
};

/**
 * Update strategy for manyToOne associations
 * @param {Object} acc - Accumulator object
 * @param {string} attribute - Attribute name
 * @param {any} newValue - New value
 * @param {Object} assocModel - Associated model
 * @returns {Object} Updated accumulator
 */
const updateManyToOneStrategy = (acc, attribute, newValue, assocModel) => {
  return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
};

/**
 * Update strategy for manyWay and manyToMany associations
 * @param {Object} acc - Accumulator object
 * @param {string} attribute - Attribute name
 * @param {any} newValue - New value
 * @param {Object} association - Association object
 * @param {Object} assocModel - Associated model
 * @param {string} primaryKeyValue - Primary key value
 * @returns {Object} Updated accumulator
 */
const updateManyToManyStrategy = (acc, attribute, newValue, association, assocModel, primaryKeyValue) => {
  if (association.dominant) {
    return _.set(
      acc,
      attribute,
      newValue ? newValue.map(val => val[assocModel.primaryKey] || val) : newValue
    );
  }

  const updatePromise = assocModel
    .updateMany(
      {
        [assocModel.primaryKey]: {
          $in: currentValue.map(
            val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)
          ),
        },
      },
      {
        $pull: {
          [association.via]: new mongoose.Types.ObjectId(primaryKeyValue),
        },
      },
      { session }
    )
    .then(() => {
      return assocModel.updateMany(
        {
          [assocModel.primaryKey]: {
            $in: newValue
              ? newValue.map(
                  val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)
                )
              : newValue,
          },
        },
        {
          $addToSet: { [association.via]: [primaryKeyValue] },
        },
        { session }
      );
    });

  return updatePromise;
};

/**
 * Update strategy for manyMorphToMany and manyMorphToOne associations
 * @param {Array} relationUpdates - Array of relation update promises
 * @param {Object} entry - Entry object
 * @param {string} primaryKeyValue - Primary key value
 * @param {Object} association - Association object
 * @param {Object} obj - Object in newValue
 * @param {Object} strapi - Strapi instance
 * @param {Function} addRelationMorph - Add relation morph function
 * @param {Function} removeRelationMorph - Remove relation morph function
 * @param {Function} updateMany - Update many function
 * @returns {Array} Updated relation updates array
 */
const updateManyMorphStrategy = (
  relationUpdates,
  entry,
  primaryKeyValue,
  association,
  obj,
  strapi,
  addRelationMorph,
  removeRelationMorph,
  updateMany
) => {
  const refModel = strapi.db.getModel(obj.ref, obj.source);

  const createRelation = () => {
    return addRelationMorph(
      this,
      {
        id: entry[this.primaryKey],
        alias: association.alias,
        ref: obj.kind || refModel.globalId,
        refId: new mongoose.Types.ObjectId(obj.refId),
        field: obj.field,
        filter: association.filter,
      },
      { session }
    );
  };

  // Clear relations to refModel
  const reverseAssoc = refModel.associations.find(assoc => assoc.alias === obj.field);
  if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
    relationUpdates.push(
      removeRelationMorph(
        this,
        {
          alias: association.alias,
          ref: obj.kind || refModel.globalId,
          refId: new mongoose.Types.ObjectId(obj.refId),
          field: obj.field,
          filter: association.filter,
        },
        { session }
      )
        .then(createRelation)
        .then(() => {
          // set field inside refModel
          return refModel.updateMany(
            {
              [refModel.primaryKey]: new mongoose.Types.ObjectId(obj.refId),
            },
            {
              [obj.field]: new mongoose.Types.ObjectId(entry[this.primaryKey]),
            },
            { session }
          );
        })
    );
  } else {
    relationUpdates.push(
      createRelation().then(() => {
        // push to field inside refModel
        return refModel.updateMany(
          {
            [refModel.primaryKey]: new mongoose.Types.ObjectId(obj.refId),
          },
          {
            $push: { [obj.field]: new mongoose.Types.ObjectId(entry[this.primaryKey]) },
          },
          { session }
        );
      })
    );
  }

  return relationUpdates;
};

/**
 * Update strategy for oneToManyMorph and manyToManyMorph associations
 * @param {Object} acc - Accumulator object
 * @param {string} attribute - Attribute name
 * @param {any} currentValue - Current value
 * @param {any} newValue - New value
 * @param {Object} association - Association object
 * @param {Object} strapi - Strapi instance
 * @param {Function} addRelationMorph - Add relation morph function
 * @param {Function} removeRelationMorph - Remove relation morph function
 * @returns {Object} Updated accumulator
 */
const updateMorphStrategy = (
  acc,
  attribute,
  currentValue,
  newValue,
  association,
  strapi,
  addRelationMorph,
  removeRelationMorph
) => {
  // Compare array of ID to find deleted files.
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const newIds = transformToArrayID(newValue, this.primaryKey);

  const toAdd = _.difference(newIds, currentIds);
  const toRemove = _.difference(currentIds, newIds);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  if (!Array.isArray(newValue)) {
    _.set(acc, attribute, newIds[0]);
  } else {
    _.set(acc, attribute, newIds);
  }

  const addPromise = Promise.all(
    toAdd.map(id => {
      return addRelationMorph(
        model,
        {
          id,
          alias: association.via,
          ref: this.globalId,
          refId: entry._id,
          field: association.alias,
          filter: association.filter,
        },
        { session }
      );
    })
  );

  return addPromise;
};

/**
 * Update strategy for oneMorphToOne and oneMorphToMany associations
 * @returns {Object} Unchanged accumulator
 */
const updateMorphOneStrategy = () => {
  return {};
};

/**
 * Update strategy lookup table
 * @type {Object}
 */
const updateStrategyMap = {
  'oneWay': updateOneWayStrategy,
  'oneToOne': updateOneToOneStrategy,
  'oneToMany': updateOneToManyStrategy,
  'manyToOne': updateManyToOneStrategy,
  'manyWay': updateManyToManyStrategy,
  'manyToMany': updateManyToManyStrategy,
  'manyMorphToMany': updateManyMorphStrategy,
  'manyMorphToOne': updateManyMorphStrategy,
  'oneToManyMorph': updateMorphStrategy,
  'manyToManyMorph': updateMorphStrategy,
  'oneMorphToOne': updateMorphOneStrategy,
  'oneMorphToMany': updateMorphOneStrategy,
};

/**
 * Delete strategy for oneWay associations
 * @returns {Promise} Empty promise
 */
const deleteOneWayStrategy = () => {
  return Promise.resolve();
};

/**
 * Delete strategy for manyWay associations
 * @returns {Promise} Empty promise
 */
const deleteManyWayStrategy = () => {
  return Promise.resolve();
};

/**
 * Delete strategy for oneToMany and oneToOne associations
 * @param {Object} targetModel - Target model
 * @param {string} via - Via field
 * @param {string} primaryKeyValue - Primary key value
 * @param {Object} session - MongoDB session
 * @returns {Promise} Update promise
 */
const deleteOneToOneStrategy = (targetModel, via, primaryKeyValue, session) => {
  if (!via) {
    return Promise.resolve();
  }

  return targetModel.updateMany({ [via]: primaryKeyValue }, { [via]: null }, { session });
};

/**
 * Delete strategy for manyToMany and manyToOne associations
 * @param {Object} targetModel - Target model
 * @param {string} via - Via field
 * @param {string} primaryKeyValue - Primary key value
 * @param {Object} session - MongoDB session
 * @returns {Promise} Update promise
 */
const deleteManyToManyStrategy = (targetModel, via, primaryKeyValue, session) => {
  if (!via) {
    return Promise.resolve();
  }

  return targetModel.updateMany(
    { [via]: primaryKeyValue },
    { $pull: { [via]: primaryKeyValue } },
    { session }
  );
};

/**
 * Delete strategy for oneToManyMorph and manyToManyMorph associations
 * @param {Object} targetModel - Target model
 * @param {string} via - Via field
 * @param {string} primaryKeyValue - Primary key value
 * @param {Object} association - Association object
 * @param {Object} session - MongoDB session
 * @returns {Promise} Update promise
 */
const deleteMorphStrategy = (targetModel, via, primaryKeyValue, association, session) => {
  // ignore them ghost relations
  if (!targetModel) return Promise.resolve();

  const element = {
    ref: primaryKeyValue,
    kind: this.globalId,
    [association.filter]: association.alias,
  };

  return targetModel.updateMany(
    { [via]: { $elemMatch: element } },
    { $pull: { [via]: element } },
    { session }
  );
};

/**
 * Delete strategy for manyMorphToMany and manyMorphToOne associations
 * @param {Object} entry - Entry object
 * @param {string} association - Association object
 * @param {Object} strapi - Strapi instance
 * @param {Function} updateMany - Update many function
 * @returns {Promise} Array of update promises
 */
const deleteManyMorphStrategy = (entry, association, strapi, updateMany) => {
  if (Array.isArray(entry[association.alias])) {
    return Promise.all(
      entry[association.alias].map(val => {
        const targetModel = strapi.db.getModelByGlobalId(val.kind);

        // ignore them ghost relations
        if (!targetModel) return Promise.resolve();

        const field = val[association.filter];
        const reverseAssoc = targetModel.associations.find(
          assoc => assoc.alias === field
        );

        if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
          return targetModel.updateMany(
            {
              [targetModel.primaryKey]: val.ref && (val.ref._id || val.ref),
            },
            {
              [field]: null,
            },
            { session }
          );
        }

        return targetModel.updateMany(
          {
            [targetModel.primaryKey]: val.ref && (val.ref._id || val.ref),
          },
          {
            $pull: { [field]: primaryKeyValue },
          },
          { session }
        );
      })
    );
  }

  return Promise.resolve();
};

/**
 * Delete strategy for oneMorphToOne and oneMorphToMany associations
 * @returns {Promise} Empty promise
 */
const deleteMorphOneStrategy = () => {
  return Promise.resolve();
};

/**
 * Delete strategy lookup table
 * @type {Object}
 */
const deleteStrategyMap = {
  'oneWay': deleteOneWayStrategy,
  'manyWay': deleteManyWayStrategy,
  'oneToMany': deleteOneToOneStrategy,
  'oneToOne': deleteOneToOneStrategy,
  'manyToMany': deleteManyToManyStrategy,
  'manyToOne': deleteManyToManyStrategy,
  'oneToManyMorph': deleteMorphStrategy,
  'manyToManyMorph': deleteMorphStrategy,
  'manyMorphToMany': deleteManyMorphStrategy,
  'manyMorphToOne': deleteManyMorphStrategy,
  'oneMorphToOne': deleteMorphOneStrategy,
  'oneMorphToMany': deleteMorphOneStrategy,
};

/**
 * Update relations for an entry
 * @param {Object} params - Update parameters
 * @param {Object} session - MongoDB session
 * @returns {Promise} Updated entity
 */
async function update(params, { session = null } = {}) {
  const relationUpdates = [];
  const populate = this.associations.map(x => x.alias);
  const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);

  const entry = await this.findOne({ [this.primaryKey]: primaryKeyValue })
    .session(session)
    .populate(populate)
    .lean();

  // Only update fields which are on this document.
  const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, attribute) => {
    const currentValue = entry[attribute];
    const newValue = params.values[attribute];

    const association = this.associations.find(x => x.alias === attribute);

    const details = this._attributes[attribute];

    // set simple attributes
    if (!association && _.get(details, 'isVirtual') !== true) {
      return _.set(acc, attribute, newValue);
    }

    const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

    // Get update strategy for this association nature
    const strategy = updateStrategyMap[association.nature];
    if (strategy) {
      return strategy(acc, attribute, newValue, assocModel, details, session, this.updateOne);
    }

    return acc;
  }, {});

  // Update virtuals fields.
  await Promise.all(relationUpdates).then(() =>
    this.updateOne({ [this.primaryKey]: primaryKeyValue }, values, {
      strict: false,
      session,
    })
  );

  const updatedEntity = await this.findOne({
    [this.primaryKey]: primaryKeyValue,
  })
    .session(session)
    .populate(populate);

  return updatedEntity && updatedEntity.toObject ? updatedEntity.toObject() : updatedEntity;
}

/**
 * Delete relations for an entry
 * @param {Object} entry - Entry object
 * @param {Object} session - MongoDB session
 * @returns {Promise} Promise of all delete operations
 */
async function deleteRelations(entry, { session = null } = {}) {
  const primaryKeyValue = entry[this.primaryKey];

  return Promise.all(
    this.associations.map(async association => {
      const { nature, via, dominant } = association;

      // Get delete strategy for this association nature
      const strategy = deleteStrategyMap[nature];
      if (strategy) {
        return strategy(
          association,
          via,
          dominant,
          strapi.db,
          primaryKeyValue,
          session,
          this
        );
      }

      return Promise.resolve();
    })
  );
}

module.exports = {
  update,
  deleteRelations,
};