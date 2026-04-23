```typescript
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
} = require('strapi-Utils');

/**
 * Transforms array values to array of primary key IDs
 * @param {any} array - Input array or single value
 * @param {string} pk - Primary key field name
 * @returns {string[]} Array of stringified primary key values
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
 * Removes undefined keys from an object
 * @param {Object} obj - Input object
 * @returns {Object} Object with undefined keys removed
 */
const removeUndefinedKeys = (obj = {}) => _.pickBy(obj, _.negate(_.isUndefined));

/**
 * Adds a relation morph to the model
 * @param {Object} model - Mongoose model instance
 * @param {Object} params - Relation parameters
 * @param {Object} options - Session options
 * @returns {Promise<void>}
 */
const addRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  await model.updateMany(
    {
      [model.primaryKey]: id,
    },
    {
      $push: {
        [alias]: {
          ref: new mongoose.Types.ObjectId(refId),
          kind: ref,
          [filter]: field,
        },
      },
    },
    { session }
  );
};

/**
 * Removes a relation morph from the model
 * @param {Object} model - Mongoose model instance
 * @param {Object} params - Relation parameters
 * @param {Object} options - Session options
 * @returns {Promise<void>}
 */
const removeRelationMorph = async (model, params, { session = null } = {}) => {
  const { alias, refId, ref, field, filter } = params;

  let opts;

  if (params.id) {
    opts = {
      _id: params.id,
    };
  } else {
    opts = {
      [alias]: {
        $elemMatch: {
          ref: params.refId,
          kind: params.ref,
          [filter]: field,
        },
      },
    };
  }

  await model.updateMany(
    opts,
    {
      $pull: {
        [alias]: {
          ref: params.refId,
          kind: params.ref,
          [filter]: field,
        },
      },
    },
    { session }
  );
};

/**
 * Handles oneWay association updates
 * @param {Object} acc - Accumulator object
 * @param {string} attribute - Attribute name
 * @param {any} newValue - New value
 * @param {Object} assocModel - Associated model
 * @returns {Object} Updated accumulator
 */
const handleOneWayUpdate = (acc, attribute, newValue, assocModel) => {
  return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
};

/**
 * Handles oneToOne association updates
 * @param {Object} acc - Accumulator object
 * @param {string} attribute - Attribute name
 * @param {any} currentValue - Current value
 * @param {any} newValue - New value
 * @param {Object} assocModel - Associated model
 * @param {Object} details - Attribute details
 * @param {Object} session - Session object
 * @param {Object} this - Context object
 * @returns {Object} Updated accumulator
 */
const handleOneToOneUpdate = async (
  acc,
  attribute,
  currentValue,
  newValue,
  assocModel,
  details,
  session,
  thisContext
) => {
  // If value is the same, don't do anything
  if (currentValue === newValue) return acc;

  // If the value is null, set field to null on both sides
  if (_.isNull(newValue)) {
    const updatePromise = assocModel.updateOne(
      {
        [assocModel.primaryKey]: getValuePrimaryKey(currentValue, assocModel.primaryKey),
      },
      { [details.via]: null },
      { session }
    );

    return {
      ...acc,
      [attribute]: null,
      relationUpdates: [...(acc.relationUpdates || []), updatePromise],
    };
  }

  // Set old relations to null
  const updateLink = thisContext.updateOne(
    { [attribute]: new mongoose.Types.ObjectId(newValue) },
    { [attribute]: null },
    { session }
  ).then(() => {
    return assocModel.updateOne(
      {
        [thisContext.primaryKey]: new mongoose.Types.ObjectId(newValue),
      },
      { [details.via]: thisContext.primaryKey },
      { session }
    );
  });

  // Set new relation
  return {
    ...acc,
    [attribute]: newValue,
    relationUpdates: [...(acc.relationUpdates || []), updateLink],
  };
};

/**
 * Handles oneToMany association updates
 * @param {Object} acc - Accumulator object
 * @param {string} attribute - Attribute name
 * @param {any} currentValue - Current value
 * @param {any} newValue - New value
 * @param {Object} assocModel - Associated model
 * @param {Object} details - Attribute details
 * @param {Object} session - Session object
 * @returns {Object} Updated accumulator
 */
const handleOneToManyUpdate = (
  acc,
  attribute,
  currentValue,
  newValue,
  assocModel,
  details,
  session
) => {
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
        { [details.via]: thisContext.primaryKey },
        { session }
      );
    });

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), updatePromise],
  };
};

/**
 * Handles manyToOne association updates
 * @param {Object} acc - Accumulator object
 * @param {string} attribute - Attribute name
 * @param {any} newValue - New value
 * @param {Object} assocModel - Associated model
 * @returns {Object} Updated accumulator
 */
const handleManyToOneUpdate = (acc, attribute, newValue, assocModel) => {
  return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
};

/**
 * Handles manyWay association updates
 * @param {Object} acc - Accumulator object
 * @param {string} attribute - Attribute name
 * @param {any} newValue - New value
 * @param {Object} assocModel - Associated model
 * @returns {Object} Updated accumulator
 */
const handleManyWayUpdate = (acc, attribute, newValue, assocModel) => {
  return _.set(acc, attribute, newValue ? newValue.map(val => val[assocModel.primaryKey] || val) : newValue);
};

/**
 * Handles manyToMany association updates
 * @param {Object} acc - Accumulator object
 * @param {string} attribute - Attribute name
 * @param {any} currentValue - Current value
 * @param {any} newValue - New value
 * @param {Object} assocModel - Associated model
 * @param {Object} association - Association details
 * @param {Object} details - Attribute details
 * @param {Object} thisContext - Context object
 * @returns {Object} Updated accumulator
 */
const handleManyToManyUpdate = async (
  acc,
  attribute,
  currentValue,
  newValue,
  assocModel,
  association,
  details,
  thisContext
) => {
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
          [association.via]: new mongoose.Types.ObjectId(thisContext.primaryKey),
        },
      },
      { session: thisContext.session }
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
          $addToSet: { [association.via]: [thisContext.primaryKey] },
        },
        { session: thisContext.session }
      );
    });

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), updatePromise],
  };
};

/**
 * Handles manyMorphToMany association updates
 * @param {Object} relationUpdates - Array of update promises
 * @param {Object} entry - Entry object
 * @param {Object} association - Association details
 * @param {Object} obj - Object with ref information
 * @param {Object} session - Session object
 * @returns {Promise<void>}
 */
const handleManyMorphToManyUpdate = async (
  relationUpdates,
  entry,
  association,
  obj,
  session
) => {
  const refModel = strapi.db.getModel(obj.ref, obj.source);

  const createRelation = () => {
    return addRelationMorph(
      thisContext,
      {
        id: entry[thisContext.primaryKey],
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
        thisContext,
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
          // Set field inside refModel
          return refModel.updateMany(
            {
              [refModel.primaryKey]: new mongoose.Types.ObjectId(obj.refId),
            },
            {
              [obj.field]: new mongoose.Types.ObjectId(entry[thisContext.primaryKey]),
            },
            { session }
          );
        })
    );
  } else {
    relationUpdates.push(
      createRelation().then(() => {
        // Push to field inside refModel
        return refModel.updateMany(
          {
            [refModel.primaryKey]: new mongoose.Types.ObjectId(obj.refId),
          },
          {
            $push: { [obj.field]: new mongoose.Types.ObjectId(entry[thisContext.primaryKey]) },
          },
          { session }
        );
      })
    );
  }
};

/**
 * Handles oneToManyMorph association updates
 * @param {Object} acc - Accumulator object
 * @param {string} attribute - Attribute name
 * @param {any} currentValue - Current value
 * @param {any} newValue - New value
 * @param {Object} details - Attribute details
 * @param {Object} association - Association details
 * @param {Object} thisContext - Context object
 * @returns {Object} Updated accumulator
 */
const handleOneToManyMorphUpdate = (
  acc,
  attribute,
  currentValue,
  newValue,
  details,
  association,
  thisContext
) => {
  const currentIds = transformToArrayID(currentValue, thisContext.primaryKey);
  const newIds = transformToArrayID(newValue, thisContext.primaryKey);

  const toAdd = _.difference(newIds, currentIds);
  const toRemove = _.difference(currentIds, newIds);

  const model = strapi.db.getModel(details.model || details.collection, details.plugin);

  if (!Array.isArray(newValue)) {
    return _.set(acc, attribute, newIds[0]);
  }

  return _.set(acc, attribute, newIds);
};

/**
 * Handles oneToManyMorph addition promises
 * @param {Object} relationUpdates - Array of update promises
 * @param {string} id - Entry ID
 * @param {Object} association - Association details
 * @param {Object} entry - Entry object
 * @returns {Promise<void>}
 */
const handleOneToManyMorphAdd = async (
  relationUpdates,
  id,
  association,
  entry
) => {
  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return addRelationMorph(
    model,
    {
      id,
      alias: association.via,
      ref: thisContext.globalId,
      refId: entry._id,
      field: association.alias,
      filter: association.filter,
    },
    { session: thisContext.session }
  );
};

/**
 * Handles oneToManyMorph removal
 * @param {Object} relationUpdates - Array of update promises
 * @param {string} id - Entry ID
 * @param {Object} association - Association details
 * @param {Object} entry - Entry object
 * @returns {Promise<void>}
 */
const handleOneToManyMorphRemove = async (
  relationUpdates,
  id,
  association,
  entry
) => {
  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return removeRelationMorph(
    model,
    {
      id,
      alias: association.via,
      ref: thisContext.globalId,
      refId: entry._id,
      field: association.alias,
      filter: association.filter,
    },
    { session: thisContext.session }
  );
};

/**
 * Handles manyMorphToMany deletion
 * @param {Object} relationUpdates - Array of update promises
 * @param {Object} entry - Entry object
 * @param {Object} association - Association details
 * @param {Object} val - Value object
 * @param {Object} session - Session object
 * @returns {Promise<void>}
 */
const handleManyMorphToManyDelete = async (
  relationUpdates,
  entry,
  association,
  val,
  session
) => {
  const targetModel = strapi.db.getModelByGlobalId(val.kind);

  // Ignore ghost relations
  if (!targetModel) return;

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
      $pull: { [field]: thisContext.primaryKey },
    },
    { session }
  );
};

/**
 * Main update function for relations
 * @param {Object} params - Update parameters
 * @param {Object} options - Session options
 * @returns {Promise<Object>} Updated entity
 */
async function update(params, { session = null } = {}) {
  const relationUpdates = [];
  const populate = this.associations.map(x => x.alias);
  const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);

  const entry = await this.findOne({ [this.primaryKey]: primaryKeyValue })
    .session(session)
    .populate(populate)
    .lean();

  // Only update fields which are on this document
  const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, attribute) => {
    const currentValue = entry[attribute];
    const newValue = params.values[attribute];
    const association = this.associations.find(x => x.alias === attribute);
    const details = this._attributes[attribute];

    // Set simple attributes
    if (!association && _.get(details, 'isVirtual') !== true) {
      return _.set(acc, attribute, newValue);
    }

    const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

    switch (association.nature) {
      case 'oneWay':
        return handleOneWayUpdate(acc, attribute, newValue, assocModel);

      case 'oneToOne':
        return handleOneToOneUpdate(
          acc,
          attribute,
          currentValue,
          newValue,
          assocModel,
          details,
          session,
          this
        );

      case 'oneToMany':
        return handleOneToManyUpdate(
          acc,
          attribute,
          currentValue,
          newValue,
          assocModel,
          details,
          session
        );

      case 'manyToOne':
        return handleManyToOneUpdate(acc, attribute, newValue, assocModel);

      case 'manyWay':
        return handleManyWayUpdate(acc, attribute, newValue, assocModel);

      case 'manyToMany':
        return handleManyToManyUpdate(
          acc,
          attribute,
          currentValue,
          newValue,
          assocModel,
          association,
          details,
          this
        );

      case 'manyMorphToMany':
      case 'manyMorphToOne':
        newValue.forEach(obj => {
          handleManyMorphToManyUpdate(
            relationUpdates,
            entry,
            association,
            obj,
            session
          );
        });
        break;

      case 'oneToManyMorph':
      case 'manyToManyMorph':
        const currentIds = transformToArrayID(currentValue, this.primaryKey);
        const newIds = transformToArrayID(newValue, this.primaryKey);
        const toAdd = _.difference(newIds, currentIds);
        const toRemove = _.difference(currentIds, newIds);

        const model = strapi.db.getModel(details.model || details.collection, details.plugin);

        if (!Array.isArray(newValue)) {
          return _.set(acc, attribute, newIds[0]);
        }

        return _.set(acc, attribute, newIds);

        const addPromise = Promise.all(
          toAdd.map(id => {
            return handleOneToManyMorphAdd(
              relationUpdates,
              id,
              association,
              entry
            );
          })
        );

        relationUpdates.push(addPromise);

        toRemove.forEach(id => {
          relationUpdates.push(
            handleOneToManyMorphRemove(
              relationUpdates,
              id,
              association,
              entry
            )
          );
        });
        break;

      case 'oneMorphToOne':
      case 'oneMorphToMany':
        break;

      default:
    }

    return acc;
  }, {});

  // Update virtuals fields
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
 * Deletes all relations for an entry
 * @param {Object} entry - Entry object
 * @param {Object} options - Session options
 * @returns {Promise<void>}
 */
async function deleteRelations(entry, { session = null } = {}) {
  const primaryKeyValue = entry[this.primaryKey];

  return Promise.all(
    this.associations.map(async association => {
      const { nature, via, dominant } = association;

      switch (nature) {
        case 'oneWay':
        case 'manyWay':
          return;

        case 'oneToMany':
        case 'oneToOne':
          if (!via) {
            return;
          }

          const targetModel = strapi.db.getModel(
            association.model || association.collection,
            association.plugin
          );

          return targetModel.updateMany({ [via]: primaryKeyValue }, { [via]: null }, { session });

        case 'manyToMany':
        case 'manyToOne':
          if (!via || dominant) {
            return;
          }

          const targetModel = strapi.db.getModel(
            association.model || association.collection,
            association.plugin
          );

          return targetModel.updateMany(
            { [via]: primaryKeyValue },
            { $pull: { [via]: primaryKeyValue } },
            { session }
          );

        case 'oneToManyMorph':
        case 'manyToManyMorph':
          const targetModel = strapi.db.getModel(
            association.model || association.collection,
            association.plugin
          );

          // Ignore ghost relations
          if (!targetModel) return;

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

        case 'manyMorphToMany':
        case 'manyMorphToOne':
          if (Array.isArray(entry[association.alias])) {
            return Promise.all(
              entry[association.alias].map(val => {
                const targetModel = strapi.db.getModelByGlobalId(val.kind);

                // Ignore ghost relations
                if (!targetModel) return;

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

          return;

        case 'oneMorphToOne':
        case 'oneMorphToMany':
          return;
      }
    })
  );
}

module.exports = {
  update,
  deleteRelations,
};
```