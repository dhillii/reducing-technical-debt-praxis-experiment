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

const transformToArrayID = (array, pk) => {
  if (_.isArray(array)) {
    return array
      .map(value => value && (getValuePrimaryKey(value, pk) || value))
      .filter(n => n)
      .map(val => _.toString(val));
  }

  return transformToArrayID([array]);
};

const removeUndefinedKeys = (obj = {}) => _.pickBy(obj, _.negate(_.isUndefined));

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

const removeRelationMorph = async (model, params, { session = null } = {}) => {
  const { alias } = params;

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
 * Extracts primary key value from association value
 * @param {*} value - The value to extract from
 * @param {Object} assocModel - The associated model
 * @returns {*} The primary key value
 */
const extractPrimaryKeyValue = (value, assocModel) => {
  return _.get(value, assocModel.primaryKey, value);
};

/**
 * Handles oneWay and manyToOne association updates
 * @param {Object} acc - Accumulator object
 * @param {string} attribute - Attribute name
 * @param {*} newValue - New value
 * @param {Object} assocModel - Associated model
 * @returns {Object} Updated accumulator
 */
const handleSimpleAssociation = (acc, attribute, newValue, assocModel) => {
  return _.set(acc, attribute, extractPrimaryKeyValue(newValue, assocModel));
};

/**
 * Handles oneToOne association updates
 * @param {Object} params - Parameters object
 * @returns {Promise<Object>} Updated accumulator and relation updates
 */
const handleOneToOne = async (params) => {
  const {
    acc,
    attribute,
    currentValue,
    newValue,
    assocModel,
    details,
    primaryKeyValue,
    session,
    relationUpdates,
  } = params;

  if (currentValue === newValue) return acc;

  if (_.isNull(newValue)) {
    const updatePromise = assocModel.updateOne(
      {
        [assocModel.primaryKey]: getValuePrimaryKey(currentValue, assocModel.primaryKey),
      },
      { [details.via]: null },
      { session }
    );

    relationUpdates.push(updatePromise);
    return _.set(acc, attribute, null);
  }

  const updateLink = this.updateOne(
    { [attribute]: new mongoose.Types.ObjectId(newValue) },
    { [attribute]: null },
    { session }
  ).then(() => {
    return assocModel.updateOne(
      {
        [this.primaryKey]: new mongoose.Types.ObjectId(newValue),
      },
      { [details.via]: primaryKeyValue },
      { session }
    );
  });

  relationUpdates.push(updateLink);
  return _.set(acc, attribute, newValue);
};

/**
 * Handles oneToMany association updates
 * @param {Object} params - Parameters object
 * @returns {Object} Updated accumulator
 */
const handleOneToMany = (params) => {
  const { acc, currentValue, newValue, assocModel, details, primaryKeyValue, session, relationUpdates } = params;

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
        { [details.via]: primaryKeyValue },
        { session }
      );
    });

  relationUpdates.push(updatePromise);
  return acc;
};

/**
 * Handles manyToMany and manyWay association updates
 * @param {Object} params - Parameters object
 * @returns {Object} Updated accumulator
 */
const handleManyToMany = (params) => {
  const { acc, attribute, association, currentValue, newValue, assocModel, primaryKeyValue, session, relationUpdates } = params;

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

  relationUpdates.push(updatePromise);
  return acc;
};

/**
 * Handles manyMorphToMany and manyMorphToOne association updates
 * @param {Object} params - Parameters object
 */
const handleManyMorphToMany = (params) => {
  const { newValue, association, entry, relationUpdates, session } = params;

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
    const isOneToManyMorph = reverseAssoc?.nature === 'oneToManyMorph';

    if (isOneToManyMorph) {
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
};

/**
 * Handles oneToManyMorph and manyToManyMorph association updates
 * @param {Object} params - Parameters object
 */
const handleOneToManyMorph = (params) => {
  const { attribute, currentValue, newValue, association, details, entry, relationUpdates, session } = params;

  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const newIds = transformToArrayID(newValue, this.primaryKey);

  const toAdd = _.difference(newIds, currentIds);
  const toRemove = _.difference(currentIds, newIds);

  const model = strapi.db.getModel(details.model || details.collection, details.plugin);

  if (!Array.isArray(newValue)) {
    _.set(params.acc, attribute, newIds[0]);
  } else {
    _.set(params.acc, attribute, newIds);
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

  relationUpdates.push(addPromise);

  toRemove.forEach(id => {
    relationUpdates.push(
      removeRelationMorph(
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
      )
    );
  });
};

/**
 * Association update handlers by nature type
 */
const associationHandlers = {
  oneWay: (params) => handleSimpleAssociation(params.acc, params.attribute, params.newValue, params.assocModel),
  manyToOne: (params) => handleSimpleAssociation(params.acc, params.attribute, params.newValue, params.assocModel),
  oneToOne: handleOneToOne,
  oneToMany: handleOneToMany,
  manyWay: handleManyToMany,
  manyToMany: handleManyToMany,
  manyMorphToMany: handleManyMorphToMany,
  manyMorphToOne: handleManyMorphToMany,
  oneToManyMorph: handleOneToManyMorph,
  manyToManyMorph: handleOneToManyMorph,
  oneMorphToOne: (params) => params.acc,
  oneMorphToMany: (params) => params.acc,
};

/**
 * Checks if attribute is a simple attribute (not an association)
 * @param {Object} association - Association object
 * @param {Object} details - Attribute details
 * @returns {boolean} True if simple attribute
 */
const isSimpleAttribute = (association, details) => {
  return !association && _.get(details, 'isVirtual') !== true;
};

/**
 * Processes a single attribute update
 * @param {Object} params - Parameters object
 * @returns {Object} Updated accumulator
 */
const processAttributeUpdate = function(params) {
  const {
    acc,
    attribute,
    currentValue,
    newValue,
    association,
    details,
    relationUpdates,
    primaryKeyValue,
    entry,
    session,
  } = params;

  if (isSimpleAttribute(association, details)) {
    return _.set(acc, attribute, newValue);
  }

  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
  const handler = associationHandlers[association.nature];

  if (!handler) {
    return acc;
  }

  return handler.call(this, {
    acc,
    attribute,
    currentValue,
    newValue,
    association,
    details,
    assocModel,
    relationUpdates,
    primaryKeyValue,
    entry,
    session,
  });
};

/**
 * Delete relation handlers by nature type
 */
const deleteRelationHandlers = {
  oneWay: () => undefined,
  manyWay: () => undefined,
  oneToMany: deleteOneToMany,
  oneToOne: deleteOneToMany,
  manyToMany: deleteManyToMany,
  manyToOne: deleteManyToMany,
  oneToManyMorph: deleteOneToManyMorph,
  manyToManyMorph: deleteManyMorphToMany,
  manyMorphToMany: deleteManyMorphToMany,
  manyMorphToOne: deleteManyMorphToMany,
  oneMorphToOne: () => undefined,
  oneMorphToMany: () => undefined,
};

/**
 * Deletes oneToOne and oneToMany relations
 * @param {Object} params - Parameters object
 * @returns {Promise|undefined}
 */
function deleteOneToMany(params) {
  const { association, session } = params;

  if (!association.via) {
    return undefined;
  }

  const targetModel = strapi.db.getModel(
    association.model || association.collection,
    association.plugin
  );

  return targetModel.updateMany(
    { [association.via]: params.primaryKeyValue },
    { [association.via]: null },
    { session }
  );
}

/**
 * Deletes manyToMany and manyToOne relations
 * @param {Object} params - Parameters object
 * @returns {Promise|undefined}
 */
function deleteManyToMany(params) {
  const { association, session, primaryKeyValue } = params;

  if (!association.via || association.dominant) {
    return undefined;
  }

  const targetModel = strapi.db.getModel(
    association.model || association.collection,
    association.plugin
  );

  return targetModel.updateMany(
    { [association.via]: primaryKeyValue },
    { $pull: { [association.via]: primaryKeyValue } },
    { session }
  );
}

/**
 * Deletes oneToManyMorph and manyToManyMorph relations
 * @param {Object} params - Parameters object
 * @returns {Promise|undefined}
 */
function deleteOneToManyMorph(params) {
  const { association, session, primaryKeyValue } = params;

  const targetModel = strapi.db.getModel(
    association.model || association.collection,