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
 * Transform any value to an array of string IDs.
 * @param {*} array
 * @param {string} pk
 * @returns {string[]}
 */
const transformToArrayID = (array, pk) => {
  if (_.isArray(array)) {
    return array
      .map(value => value && (getValuePrimaryKey(value, pk) || value))
      .filter(Boolean)
      .map(val => _.toString(val));
  }
  return transformToArrayID([array], pk);
};

/**
 * Remove undefined keys from an object.
 * @param {Object} [obj={}]
 * @returns {Object}
 */
const removeUndefinedKeys = (obj = {}) => _.pickBy(obj, _.negate(_.isUndefined));

/**
 * Add a morph relation.
 */
const addRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  await model.updateMany(
    { [model.primaryKey]: id },
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
 * Remove a morph relation.
 */
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
 * Resolve association model.
 */
const resolveAssocModel = (details) =>
  strapi.db.getModel(details.model || details.collection, details.plugin);

/**
 * Handler map for attribute update based on association nature.
 */
const attributeHandlers = {
  oneWay: ({ acc, attribute, newValue, assocModel }) => {
    _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
    return acc;
  },

  manyToOne: ({ acc, attribute, newValue, assocModel }) => {
    _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
    return acc;
  },

  oneToOne: ({
    thisModel,
    entry,
    attribute,
    currentValue,
    newValue,
    details,
    assocModel,
    relationUpdates,
    session,
    primaryKeyValue,
  }) => {
    if (currentValue === newValue) return;
    if (_.isNull(newValue)) {
      const upd = assocModel.updateOne(
        { [assocModel.primaryKey]: getValuePrimaryKey(currentValue, assocModel.primaryKey) },
        { [details.via]: null },
        { session }
      );
      relationUpdates.push(upd);
      _.set(entry, attribute, null);
      return;
    }

    const link = thisModel
      .updateOne(
        { [attribute]: new mongoose.Types.ObjectId(newValue) },
        { [attribute]: null },
        { session }
      )
      .then(() =>
        assocModel.updateOne(
          { [thisModel.primaryKey]: new mongoose.Types.ObjectId(newValue) },
          { [details.via]: primaryKeyValue },
          { session }
        )
      );

    relationUpdates.push(link);
    _.set(entry, attribute, newValue);
  },

  oneToMany: ({
    currentValue,
    newValue,
    details,
    assocModel,
    relationUpdates,
    session,
    primaryKeyValue,
  }) => {
    const toRemove = _.differenceWith(currentValue, newValue, (a, b) => {
      const aId = a[assocModel.primaryKey] || a;
      const bId = b[assocModel.primaryKey] || b;
      return `${aId}` === `${bId}`;
    });

    const removePromise = assocModel
      .updateMany(
        {
          [assocModel.primaryKey]: {
            $in: toRemove.map((v) => new mongoose.Types.ObjectId(v[assocModel.primaryKey] || v)),
          },
        },
        { [details.via]: null },
        { session }
      )
      .then(() =>
        assocModel.updateMany(
          {
            [assocModel.primaryKey]: {
              $in: newValue.map((v) => new mongoose.Types.ObjectId(v[assocModel.primaryKey] || v)),
            },
          },
          { [details.via]: primaryKeyValue },
          { session }
        )
      );

    relationUpdates.push(removePromise);
  },

  manyMorphToMany: handleMorphRelation.bind(null, false),
  manyMorphToOne: handleMorphRelation.bind(null, false),

  manyToMany: handleManyToMany.bind(null, false),
  manyWay: handleManyToMany.bind(null, false),

  manyToManyMorph: handleMorphRelation.bind(null, true),
  oneToManyMorph: handleMorphRelation.bind(null, true),

  oneMorphToOne: () => {},
  oneMorphToMany: () => {},
};

/**
 * Handle many-to-many (including dominant flag) updates.
 */
function handleManyToMany(isMorph, {
  thisModel,
  entry,
  attribute,
  currentValue,
  newValue,
  details,
  association,
  relationUpdates,
  session,
  primaryKeyValue,
}) {
  if (association.dominant) {
    _.set(entry, attribute, newValue ? newValue.map((v) => v[details.model?.primaryKey] || v) : newValue);
    return;
  }

  const updatePromise = resolveAssocModel(details)
    .updateMany(
      {
        [resolveAssocModel(details).primaryKey]: {
          $in: currentValue.map((v) => new mongoose.Types.ObjectId(v[details.model?.primaryKey] || v)),
        },
      },
      { $pull: { [association.via]: new mongoose.Types.ObjectId(primaryKeyValue) } },
      { session }
    )
    .then(() =>
      resolveAssocModel(details).updateMany(
        {
          [resolveAssocModel(details).primaryKey]: {
            $in: newValue
              ? newValue.map((v) => new mongoose.Types.ObjectId(v[details.model?.primaryKey] || v))
              : newValue,
          },
        },
        { $addToSet: { [association.via]: [primaryKeyValue] } },
        { session }
      )
    );

  relationUpdates.push(updatePromise);
}

/**
 * Handle morph relations (both directions).
 */
function handleMorphRelation(isReverse, {
  thisModel,
  entry,
  attribute,
  currentValue,
  newValue,
  details,
  association,
  relationUpdates,
  session,
  primaryKeyValue,
}) {
  if (isReverse) {
    // model -> media
    const currentIds = transformToArrayID(currentValue, thisModel.primaryKey);
    const newIds = transformToArrayID(newValue, thisModel.primaryKey);
    const toAdd = _.difference(newIds, currentIds);
    const toRemove = _.difference(currentIds, newIds);
    const targetModel = resolveAssocModel(details);

    _.set(entry, attribute, _.isArray(newValue) ? newIds : newIds[0]);

    const addPromise = Promise.all(
      toAdd.map((id) =>
        addRelationMorph(targetModel, {
          id,
          alias: association.via,
          ref: thisModel.globalId,
          refId: entry._id,
          field: association.alias,
          filter: association.filter,
        }, { session })
      )
    );
    relationUpdates.push(addPromise);

    toRemove.forEach((id) => {
      relationUpdates.push(
        removeRelationMorph(targetModel, {
          id,
          alias: association.via,
          ref: thisModel.globalId,
          refId: entry._id,
          field: association.alias,
          filter: association.filter,
        }, { session })
      );
    });
    return;
  }

  // media -> model
  newValue.forEach((obj) => {
    const refModel = strapi.db.getModel(obj.ref, obj.source);
    const createRelation = () =>
      addRelationMorph(thisModel, {
        id: entry[thisModel.primaryKey],
        alias: association.alias,
        ref: obj.kind || refModel.globalId,
        refId: new mongoose.Types.ObjectId(obj.refId),
        field: obj.field,
        filter: association.filter,
      }, { session });

    const reverseAssoc = refModel.associations.find((a) => a.alias === obj.field);
    if (reverseAssoc?.nature === 'oneToManyMorph') {
      relationUpdates.push(
        removeRelationMorph(thisModel, {
          alias: association.alias,
          ref: obj.kind || refModel.globalId,
          refId: new mongoose.Types.ObjectId(obj.refId),
          field: obj.field,
          filter: association.filter,
        }, { session })
          .then(createRelation)
          .then(() =>
            refModel.updateMany(
              { [refModel.primaryKey]: new mongoose.Types.ObjectId(obj.refId) },
              { [obj.field]: new mongoose.Types.ObjectId(entry[thisModel.primaryKey]) },
              { session }
            )
          )
      );
    } else {
      relationUpdates.push(
        createRelation().then(() =>
          refModel.updateMany(
            { [refModel.primaryKey]: new mongoose.Types.ObjectId(obj.refId) },
            { $push: { [obj.field]: new mongoose.Types.ObjectId(entry[thisModel.primaryKey]) } },
            { session }
          )
        )
      );
    }
  });
}

/**
 * Update method refactored to reduce branching.
 */
module.exports = {
  async update(params, { session = null } = {}) {
    const relationUpdates = [];
    const populate = this.associations.map((x) => x.alias);
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);

    const entry = await this.findOne({ [this.primaryKey]: primaryKeyValue })
      .session(session)
      .populate(populate)
      .lean();

    const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, attribute) => {
      const currentValue = entry[attribute];
      const newValue = params.values[attribute];
      const association = this.associations.find((x) => x.alias === attribute);
      const details = this._attributes[attribute];

      // simple attribute
      if (!association && !details?.isVirtual) {
        _.set(acc, attribute, newValue);
        return acc;
      }

      const assocModel = resolveAssocModel(details);
      const handler = attributeHandlers[association.nature];
      if (handler) {
        handler({
          thisModel: this,
          entry,
          attribute,
          currentValue,
          newValue,
          details,
          assocModel,
          association,
          relationUpdates,
          session,
          primaryKeyValue,
        });
      }
      return acc;
    }, {});

    await Promise.all(relationUpdates).then(() =>
      this.updateOne({ [this.primaryKey]: primaryKeyValue }, values, {
        strict: false,
        session,
      })
    );

    const updatedEntity = await this.findOne({ [this.primaryKey]: primaryKeyValue })
      .session(session)
      .populate(populate);

    return updatedEntity && updatedEntity.toObject ? updatedEntity.toObject() : updatedEntity;
  },

  deleteRelations(entry, { session = null } = {}) {
    const primaryKeyValue = entry[this.primaryKey];

    const deleteHandlers = {
      oneWay: () => {},
      manyWay: () => {},
      oneToMany: handleDeleteOneToManyOrOneToOne,
      oneToOne: handleDeleteOneToManyOrOneToOne,
      manyToMany: handleDeleteManyToManyOrManyToOne,
      manyToOne: handleDeleteManyToManyOrManyToOne,
      oneToManyMorph: handleDeleteMorph,
      manyToManyMorph: handleDeleteMorph,
      manyMorphToMany: handleDeleteMorphReverse,
      manyMorphToOne: handleDeleteMorphReverse,
      oneMorphToOne: () => {},
      oneMorphToMany: () => {},
    };

    return Promise.all(
      this.associations.map(async (association) => {
        const handler = deleteHandlers[association.nature];
        if (handler) {
          return handler.call(this, association, entry, primaryKeyValue, session);
        }
      })
    );
  },
};

/**
 * Delete handler for one-to-many / one-to-one relations.
 */
function handleDeleteOneToManyOrOneToOne(association, entry, primaryKeyValue, session) {
  if (!association.via) return;
  const targetModel = strapi.db.getModel(association.model || association.collection, association.plugin);
  return targetModel.updateMany({ [association.via]: primaryKeyValue }, { [association.via]: null }, { session });
}

/**
 * Delete handler for many-to-many / many-to-one relations.
 */
function handleDeleteManyToManyOrManyToOne(association, entry, primaryKeyValue, session) {
  if (!association.via || association.dominant) return;
  const targetModel = strapi.db.getModel(association.model || association.collection, association.plugin);
  return targetModel.updateMany(
    { [association.via]: primaryKeyValue },
    { $pull: { [association.via]: primaryKeyValue } },
    { session }
  );
}

/**
 * Delete handler for morph relations where this model is the target.
 */
function handleDeleteMorph(association, entry, primaryKeyValue, session) {
  const targetModel = strapi.db.getModel(association.model || association.collection, association.plugin);
  if (!targetModel) return;
  const element = {
    ref: primaryKeyValue,
    kind: this.globalId,
    [association.filter]: association.alias,
  };
  return targetModel.updateMany(
    { [association.via]: { $elemMatch: element } },
    { $pull: { [association.via]: element } },
    { session }
  );
}

/**
 * Delete handler for morph relations where this model holds the references.
 */
function handleDeleteMorphReverse(association, entry, primaryKeyValue, session) {
  const values = entry[association.alias];
  if (!Array.isArray(values)) return;
  return Promise.all(
    values.map((val) => {
      const targetModel = strapi.db.getModelByGlobalId(val.kind);
      if (!targetModel) return;
      const field = val[association.filter];
      const reverseAssoc = targetModel.associations.find((a) => a.alias === field);
      const query = { [targetModel.primaryKey]: val.ref && (val.ref._id || val.ref) };
      if (reverseAssoc?.nature === 'oneToManyMorph') {
        return targetModel.updateMany(query, { [field]: null }, { session });
      }
      return targetModel.updateMany(query, { $pull: { [field]: primaryKeyValue } }, { session });
    })
  );
}
```