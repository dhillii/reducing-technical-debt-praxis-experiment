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
 * Convert a value or array of values to an array of string IDs.
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
 * Remove keys with undefined values.
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
 * Update simple (non‑association) attributes.
 */
const handleSimpleAttribute = (acc, attribute, newValue, details) =>
  _.set(acc, attribute, newValue);

/**
 * Handle one‑way relations.
 */
const handleOneWay = (acc, attribute, newValue, assocModel) =>
  _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));

/**
 * Handle many‑to‑one relations.
 */
const handleManyToOne = (acc, attribute, newValue, assocModel) =>
  _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));

/**
 * Handle one‑to‑one relations.
 */
const handleOneToOne = async ({
  entry,
  attribute,
  currentValue,
  newValue,
  details,
  assocModel,
  primaryKeyValue,
  relationUpdates,
  session,
}) => {
  if (currentValue === newValue) return {};

  if (_.isNull(newValue)) {
    const promise = assocModel.updateOne(
      { [assocModel.primaryKey]: getValuePrimaryKey(currentValue, assocModel.primaryKey) },
      { [details.via]: null },
      { session }
    );
    relationUpdates.push(promise);
    return { [attribute]: null };
  }

  const promise = this.updateOne(
    { [attribute]: new mongoose.Types.ObjectId(newValue) },
    { [attribute]: null },
    { session }
  ).then(() =>
    assocModel.updateOne(
      { [this.primaryKey]: new mongoose.Types.ObjectId(newValue) },
      { [details.via]: primaryKeyValue },
      { session }
    )
  );

  relationUpdates.push(promise);
  return { [attribute]: newValue };
};

/**
 * Handle one‑to‑many relations.
 */
const handleOneToMany = async ({
  currentValue,
  newValue,
  assocModel,
  details,
  primaryKeyValue,
  relationUpdates,
  session,
}) => {
  const toRemove = _.differenceWith(
    currentValue,
    newValue,
    (a, b) => `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`
  );

  const removePromise = assocModel
    .updateMany(
      {
        [assocModel.primaryKey]: {
          $in: toRemove.map(v => new mongoose.Types.ObjectId(v[assocModel.primaryKey] || v)),
        },
      },
      { [details.via]: null },
      { session }
    )
    .then(() =>
      assocModel.updateMany(
        {
          [assocModel.primaryKey]: {
            $in: newValue.map(v => new mongoose.Types.ObjectId(v[assocModel.primaryKey] || v)),
          },
        },
        { [details.via]: primaryKeyValue },
        { session }
      )
    );

  relationUpdates.push(removePromise);
  return {};
};

/**
 * Handle many‑to‑many (non‑dominant) relations.
 */
const handleManyToMany = async ({
  currentValue,
  newValue,
  assocModel,
  association,
  primaryKeyValue,
  relationUpdates,
  session,
}) => {
  const pullPromise = assocModel
    .updateMany(
      {
        [assocModel.primaryKey]: {
          $in: currentValue.map(v => new mongoose.Types.ObjectId(v[assocModel.primaryKey] || v)),
        },
      },
      { $pull: { [association.via]: new mongoose.Types.ObjectId(primaryKeyValue) } },
      { session }
    )
    .then(() =>
      assocModel.updateMany(
        {
          [assocModel.primaryKey]: {
            $in: newValue
              ? newValue.map(v => new mongoose.Types.ObjectId(v[assocModel.primaryKey] || v))
              : newValue,
          },
        },
        { $addToSet: { [association.via]: [primaryKeyValue] } },
        { session }
      )
    );

  relationUpdates.push(pullPromise);
  return {};
};

/**
 * Handle dominant many‑to‑many relations.
 */
const handleDominantMany = (acc, attribute, newValue, assocModel) => {
  const ids = newValue ? newValue.map(v => v[assocModel.primaryKey] || v) : newValue;
  return _.set(acc, attribute, ids);
};

/**
 * Handle morph relations where the current model is the target (manyMorph…).
 */
const handleMorphTarget = async ({
  entry,
  attribute,
  newValue,
  association,
  details,
  primaryKeyValue,
  relationUpdates,
  session,
}) => {
  newValue.forEach(obj => {
    const refModel = strapi.db.getModel(obj.ref, obj.source);

    const createRelation = () =>
      addRelationMorph(this, {
        id: entry[this.primaryKey],
        alias: association.alias,
        ref: obj.kind || refModel.globalId,
        refId: new mongoose.Types.ObjectId(obj.refId),
        field: obj.field,
        filter: association.filter,
      }, { session });

    const reverseAssoc = refModel.associations.find(a => a.alias === obj.field);

    if (reverseAssoc?.nature === 'oneToManyMorph') {
      relationUpdates.push(
        removeRelationMorph(this, {
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
              { [obj.field]: new mongoose.Types.ObjectId(entry[this.primaryKey]) },
              { session }
            )
          )
      );
    } else {
      relationUpdates.push(
        createRelation().then(() =>
          refModel.updateMany(
            { [refModel.primaryKey]: new mongoose.Types.ObjectId(obj.refId) },
            { $push: { [obj.field]: new mongoose.Types.ObjectId(entry[this.primaryKey]) } },
            { session }
          )
        )
      );
    }
  });
};

/**
 * Handle morph relations where the current model is the source (oneMorph…).
 */
const handleMorphSource = async ({
  entry,
  attribute,
  currentValue,
  newValue,
  association,
  details,
  primaryKeyValue,
  relationUpdates,
  session,
}) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const newIds = transformToArrayID(newValue, this.primaryKey);
  const toAdd = _.difference(newIds, currentIds);
  const toRemove = _.difference(currentIds, newIds);
  const targetModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  // update attribute value
  if (!Array.isArray(newValue)) {
    _.set(acc, attribute, newIds[0]);
  } else {
    _.set(acc, attribute, newIds);
  }

  const addPromise = Promise.all(
    toAdd.map(id =>
      addRelationMorph(targetModel, {
        id,
        alias: association.via,
        ref: this.globalId,
        refId: entry._id,
        field: association.alias,
        filter: association.filter,
      }, { session })
    )
  );

  relationUpdates.push(addPromise);

  toRemove.forEach(id => {
    relationUpdates.push(
      removeRelationMorph(targetModel, {
        id,
        alias: association.via,
        ref: this.globalId,
        refId: entry._id,
        field: association.alias,
        filter: association.filter,
      }, { session })
    );
  });
};

/**
 * Main update method – orchestrates attribute handling.
 */
module.exports = {
  async update(params, { session = null } = {}) {
    const relationUpdates = [];
    const populate = this.associations.map(a => a.alias);
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);

    const entry = await this.findOne({ [this.primaryKey]: primaryKeyValue })
      .session(session)
      .populate(populate)
      .lean();

    const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, attribute) => {
      const currentValue = entry[attribute];
      const newValue = params.values[attribute];
      const association = this.associations.find(a => a.alias === attribute);
      const details = this._attributes[attribute];

      // simple attribute
      if (!association && !details?.isVirtual) {
        return handleSimpleAttribute(acc, attribute, newValue, details);
      }

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

      switch (association.nature) {
        case 'oneWay':
          return handleOneWay(acc, attribute, newValue, assocModel);
        case 'manyToOne':
          return handleManyToOne(acc, attribute, newValue, assocModel);
        case 'oneToOne':
          return _.assign(
            acc,
            handleOneToOne.call(this, {
              entry,
              attribute,
              currentValue,
              newValue,
              details,
              assocModel,
              primaryKeyValue,
              relationUpdates,
              session,
            })
          );
        case 'oneToMany':
          return _.assign(
            acc,
            handleOneToMany({
              currentValue,
              newValue,
              assocModel,
              details,
              primaryKeyValue,
              relationUpdates,
              session,
            })
          );
        case 'manyToMany':
          if (association.dominant) {
            return handleDominantMany(acc, attribute, newValue, assocModel);
          }
          return _.assign(
            acc,
            handleManyToMany({
              currentValue,
              newValue,
              assocModel,
              association,
              primaryKeyValue,
              relationUpdates,
              session,
            })
          );
        case 'manyMorphToMany':
        case 'manyMorphToOne':
          handleMorphTarget({
            entry,
            attribute,
            newValue,
            association,
            details,
            primaryKeyValue,
            relationUpdates,
            session,
          });
          break;
        case 'oneToManyMorph':
        case 'manyToManyMorph':
          handleMorphSource({
            entry,
            attribute,
            currentValue,
            newValue,
            association,
            details,
            primaryKeyValue,
            relationUpdates,
            session,
          });
          break;
        default:
          return acc;
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

    const handleOneToManyOrOneToOne = async association => {
      if (!association.via) return;
      const targetModel = strapi.db.getModel(
        association.model || association.collection,
        association.plugin
      );
      await targetModel.updateMany({ [association.via]: primaryKeyValue }, { [association.via]: null }, { session });
    };

    const handleManyToManyOrManyToOne = async association => {
      if (!association.via || association.dominant) return;
      const targetModel = strapi.db.getModel(
        association.model || association.collection,
        association.plugin
      );
      await targetModel.updateMany(
        { [association.via]: primaryKeyValue },
        { $pull: { [association.via]: primaryKeyValue } },
        { session }
      );
    };

    const handleMorphDeletion = async association => {
      const targetModel = strapi.db.getModel(
        association.model || association.collection,
        association.plugin
      );
      if (!targetModel) return;

      const element = {
        ref: primaryKeyValue,
        kind: this.globalId,
        [association.filter]: association.alias,
      };

      await targetModel.updateMany(
        { [association.via]: { $elemMatch: element } },
        { $pull: { [association.via]: element } },
        { session }
      );
    };

    const handleManyMorphDeletion = async association => {
      if (!Array.isArray(entry[association.alias])) return;
      await Promise.all(
        entry[association.alias].map(async val => {
          const targetModel = strapi.db.getModelByGlobalId(val.kind);
          if (!targetModel) return;

          const field = val[association.filter];
          const reverseAssoc = targetModel.associations.find(a => a.alias === field);

          const query = {
            [targetModel.primaryKey]: val.ref && (val.ref._id || val.ref),
          };

          if (reverseAssoc?.nature === 'oneToManyMorph') {
            await targetModel.updateMany(query, { [field]: null }, { session });
          } else {
            await targetModel.updateMany(query, { $pull: { [field]: primaryKeyValue } }, { session });
          }
        })
      );
    };

    return Promise.all(
      this.associations.map(async association => {
        const { nature } = association;

        if (['oneWay', 'manyWay'].includes(nature)) return;

        if (['oneToMany', 'oneToOne'].includes(nature)) {
          return handleOneToManyOrOneToOne(association);
        }

        if (['manyToMany', 'manyToOne'].includes(nature)) {
          return handleManyToManyOrManyToOne(association);
        }

        if (['oneToManyMorph', 'manyToManyMorph'].includes(nature)) {
          return handleMorphDeletion(association);
        }

        if (['manyMorphToMany', 'manyMorphToOne'].includes(nature)) {
          return handleManyMorphDeletion(association);
        }

        // oneMorphToOne / oneMorphToMany have no cleanup
        return;
      })
    );
  },
};
```