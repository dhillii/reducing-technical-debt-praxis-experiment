```javascript
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
 * Transforms an array or single value into an array of primary key strings.
 * @param {any} array - The input array or single value.
 * @param {string} pk - The primary key field name.
 * @returns {string[]} - Array of primary key strings.
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
 * Removes undefined keys from an object.
 * @param {Object} obj - The input object.
 * @returns {Object} - Object with undefined keys removed.
 */
const removeUndefinedKeys = (obj = {}) => _.pickBy(obj, _.negate(_.isUndefined));

/**
 * Adds a relation morph to the model.
 * @param {Object} model - The model instance.
 * @param {Object} params - The relation parameters.
 * @param {Object} options - Additional options including session.
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
 * Removes a relation morph from the model.
 * @param {Object} model - The model instance.
 * @param {Object} params - The relation parameters.
 * @param {Object} options - Additional options including session.
 * @returns {Promise<void>}
 */
const removeRelationMorph = async (model, params, { session = null } = {}) => {
  const { alias, refId, ref, field, filter } = params;

  const opts = params.id
    ? { _id: params.id }
    : {
        [alias]: {
          $elemMatch: {
            ref: params.refId,
            kind: params.ref,
            [params.filter]: params.field,
          },
        },
      };

  await model.updateMany(
    opts,
    {
      $pull: {
        [alias]: {
          ref: params.refId,
          kind: params.ref,
          [params.filter]: params.field,
        },
      },
    },
    { session }
  );
};

/**
 * Handles one-way relation updates.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} newValue - The new value.
 * @param {Object} assocModel - The associated model.
 * @returns {Object} - Updated accumulator.
 */
const handleOneWayRelation = (acc, attribute, newValue, assocModel) => {
  return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
};

/**
 * Handles many-to-one relation updates.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} newValue - The new value.
 * @param {Object} assocModel - The associated model.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToOneRelation = (acc, attribute, newValue, assocModel) => {
  return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
};

/**
 * Handles one-to-one relation updates.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {any} newValue - The new value.
 * @param {Object} assocModel - The associated model.
 * @param {Object} details - Attribute details.
 * @param {Object} session - MongoDB session.
 * @param {Object} self - The model instance.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToOneRelation = async (
  acc,
  attribute,
  currentValue,
  newValue,
  assocModel,
  details,
  session,
  self
) => {
  if (currentValue === newValue) return acc;

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

  const updateLink = self.updateOne(
    { [attribute]: new mongoose.Types.ObjectId(newValue) },
    { [attribute]: null },
    { session }
  ).then(() => {
    return assocModel.updateOne(
      {
        [self.primaryKey]: new mongoose.Types.ObjectId(newValue),
      },
      { [details.via]: self.primaryKey },
      { session }
    );
  });

  return {
    ...acc,
    [attribute]: newValue,
    relationUpdates: [...(acc.relationUpdates || []), updateLink],
  };
};

/**
 * Handles one-to-many relation updates.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {any} newValue - The new value.
 * @param {Object} assocModel - The associated model.
 * @param {Object} details - Attribute details.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyRelation = (
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
        { [details.via]: self.primaryKey },
        { session }
      );
    });

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), updatePromise],
  };
};

/**
 * Handles many-to-many relation updates.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {any} newValue - The new value.
 * @param {Object} association - The association object.
 * @param {Object} assocModel - The associated model.
 * @param {Object} details - Attribute details.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyRelation = (
  acc,
  attribute,
  currentValue,
  newValue,
  association,
  assocModel,
  details,
  session
) => {
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
          [association.via]: new mongoose.Types.ObjectId(self.primaryKey),
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
          $addToSet: { [association.via]: [self.primaryKey] },
        },
        { session }
      );
    });

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), updatePromise],
  };
};

/**
 * Handles many-to-many morph relation updates.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} newValue - The new value.
 * @param {Object} association - The association object.
 * @param {Object} entry - The entry object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelation = (
  acc,
  attribute,
  newValue,
  association,
  entry,
  session
) => {
  const relationUpdates = [];

  newValue.forEach(obj => {
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
  });

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), ...relationUpdates],
  };
};

/**
 * Handles one-to-many morph relation updates.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {any} newValue - The new value.
 * @param {Object} association - The association object.
 * @param {Object} details - Attribute details.
 * @param {Object} entry - The entry object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelation = (
  acc,
  attribute,
  currentValue,
  newValue,
  association,
  details,
  entry,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const newIds = transformToArrayID(newValue, this.primaryKey);

  const toAdd = _.difference(newIds, currentIds);
  const toRemove = _.difference(currentIds, newIds);

  const model = strapi.db.getModel(details.model || details.collection, details.plugin);

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

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), addPromise],
  };
};

/**
 * Handles many-to-many morph relation updates.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {any} newValue - The new value.
 * @param {Object} association - The association object.
 * @param {Object} details - Attribute details.
 * @param {Object} entry - The entry object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelation = (
  acc,
  attribute,
  currentValue,
  newValue,
  association,
  details,
  entry,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const newIds = transformToArrayID(newValue, this.primaryKey);

  const toAdd = _.difference(newIds, currentIds);
  const toRemove = _.difference(currentIds, newIds);

  const model = strapi.db.getModel(details.model || details.collection, details.plugin);

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

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), addPromise],
  };
};

/**
 * Handles many-to-many morph relation updates with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} newValue - The new value.
 * @param {Object} association - The association object.
 * @param {Object} entry - The entry object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationWithReverse = (
  acc,
  attribute,
  newValue,
  association,
  entry,
  session
) => {
  const relationUpdates = [];

  if (Array.isArray(entry[association.alias])) {
    entry[association.alias].forEach(val => {
      const targetModel = strapi.db.getModelByGlobalId(val.kind);

      if (!targetModel) return;

      const field = val[association.filter];
      const reverseAssoc = targetModel.associations.find(
        assoc => assoc.alias === field
      );

      if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
        relationUpdates.push(
          targetModel.updateMany(
            {
              [targetModel.primaryKey]: val.ref && (val.ref._id || val.ref),
            },
            {
              [field]: null,
            },
            { session }
          )
        );
      } else {
        relationUpdates.push(
          targetModel.updateMany(
            {
              [targetModel.primaryKey]: val.ref && (val.ref._id || val.ref),
            },
            {
              $pull: { [field]: self.primaryKey },
            },
            { session }
          )
        );
      }
    });
  }

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), ...relationUpdates],
  };
};

/**
 * Handles one-to-many morph relation deletion.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDelete = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDelete = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles one-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleOneToManyMorphRelationDeleteWithReverse = (
  acc,
  attribute,
  currentValue,
  association,
  session
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const toRemove = _.difference(currentIds, currentValue);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return {
    ...acc,
    relationUpdates: [...(acc.relationUpdates || []), Promise.all(toRemove.map(id => {
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
    }))],
  };
};

/**
 * Handles many-to-many morph relation deletion with reverse association.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {Object} association - The association object.
 * @param {Object} session - MongoDB session.
 * @returns {Object} - Updated accumulator.
 */
const handleManyToMany