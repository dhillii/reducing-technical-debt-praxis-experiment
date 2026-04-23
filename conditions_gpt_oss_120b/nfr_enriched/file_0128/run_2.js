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
 * Transform any input to an array of string IDs.
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
 * Remove keys with undefined values.
 */
const removeUndefinedKeys = (obj = {}) => _.pickBy(obj, _.negate(_.isUndefined));

/**
 * Add a morph relation.
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
 * Retrieve the model for a given association detail.
 */
const getAssociatedModel = (details) => {
  return strapi.db.getModel(details.model || details.collection, details.plugin);
};

/**
 * Process a simple (non‑association) attribute.
 */
const processSimpleAttribute = (acc, attribute, newValue) => _.set(acc, attribute, newValue);

/**
 * Process a one‑way or many‑way association.
 */
const processOneWay = (acc, attribute, newValue, assocModel) => {
  const pk = newValue?.[assocModel.primaryKey] ?? newValue;
  return _.set(acc, attribute, pk);
};

/**
 * Process a many‑to‑one association.
 */
const processManyToOne = (acc, attribute, newValue, assocModel) => {
  const pk = newValue?.[assocModel.primaryKey] ?? newValue;
  return _.set(acc, attribute, pk);
};

/**
 * Process a one‑to‑one association.
 */
const processOneToOne = async ({
  entry,
  attribute,
  newValue,
  currentValue,
  assocModel,
  details,
  primaryKeyValue,
  session,
}) => {
  const updates = [];

  // No change.
  if (currentValue === newValue) {
    return { acc: {}, updates };
  }

  // Unset relation.
  if (_.isNull(newValue)) {
    const updatePromise = assocModel.updateOne(
      {
        [assocModel.primaryKey]: getValuePrimaryKey(currentValue, assocModel.primaryKey),
      },
      { [details.via]: null },
      { session }
    );
    updates.push(updatePromise);
    return { acc: _.set({}, attribute, null), updates };
  }

  // Switch links.
  const linkPromise = this.updateOne(
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

  updates.push(linkPromise);
  return { acc: _.set({}, attribute, newValue), updates };
};

/**
 * Process a one‑to‑many association.
 */
const processOneToMany = async ({
  currentValue,
  newValue,
  assocModel,
  details,
  primaryKeyValue,
  session,
}) => {
  const updates = [];

  const toRemove = _.differenceWith(currentValue, newValue, (a, b) => {
    const aId = a?.[assocModel.primaryKey] ?? a;
    const bId = b?.[assocModel.primaryKey] ?? b;
    return `${aId}` === `${bId}`;
  });

  const removePromise = assocModel
    .updateMany(
      {
        [assocModel.primaryKey]: {
          $in: toRemove.map(val => new mongoose.Types.ObjectId(val?.[assocModel.primaryKey] ?? val)),
        },
      },
      { [details.via]: null },
      { session }
    )
    .then(() => {
      return assocModel.updateMany(
        {
          [assocModel.primaryKey]: {
            $in: newValue.map(val => new mongoose.Types.ObjectId(val?.[assocModel.primaryKey] ?? val)),
          },
        },
        { [details.via]: primaryKeyValue },
        { session }
      );
    });

  updates.push(removePromise);
  return { acc: {}, updates };
};

/**
 * Process a many‑to‑many association.
 */
const processManyToMany = async ({
  currentValue,
  newValue,
  assocModel,
  association,
  primaryKeyValue,
  session,
}) => {
  const updates = [];

  const unlinkPromise = assocModel
    .updateMany(
      {
        [assocModel.primaryKey]: {
          $in: currentValue.map(val => new mongoose.Types.ObjectId(val?.[assocModel.primaryKey] ?? val)),
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
            $in:
              newValue?.map(val => new mongoose.Types.ObjectId(val?.[assocModel.primaryKey] ?? val)) ??
              newValue,
          },
        },
        {
          $addToSet: { [association.via]: [primaryKeyValue] },
        },
        { session }
      );
    });

  updates.push(unlinkPromise);
  return { acc: {}, updates };
};

/**
 * Process dominant many‑to‑many association.
 */
const processDominantManyToMany = (acc, attribute, newValue, assocModel) => {
  const ids = newValue?.map(val => val?.[assocModel.primaryKey] ?? val) ?? newValue;
  return _.set(acc, attribute, ids);
};

/**
 * Process morph relations where the current model is the source.
 */
const processMorphSource = async ({
  entry,
  association,
  newValue,
  session,
  primaryKeyValue,
}) => {
  const updates = [];

  newValue.forEach((obj) => {
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

    const reverseAssoc = refModel.associations.find((assoc) => assoc.alias === obj.field);

    if (reverseAssoc?.nature === 'oneToManyMorph') {
      updates.push(
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
      updates.push(
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

  return updates;
};

/**
 * Process morph relations where the current model is the target.
 */
const processMorphTarget = async ({
  entry,
  association,
  currentValue,
  newValue,
  session,
  primaryKeyValue,
}) => {
  const updates = [];

  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const newIds = transformToArrayID(newValue, this.primaryKey);
  const toAdd = _.difference(newIds, currentIds);
  const toRemove = _.difference(currentIds, newIds);
  const targetModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  // Update attribute value.
  if (!Array.isArray(newValue)) {
    _.set(acc, association.alias, newIds[0]);
  } else {
    _.set(acc, association.alias, newIds);
  }

  const addPromises = toAdd.map((id) =>
    addRelationMorph(targetModel, {
      id,
      alias: association.via,
      ref: this.globalId,
      refId: entry._id,
      field: association.alias,
      filter: association.filter,
    }, { session })
  );

  updates.push(Promise.all(addPromises));

  toRemove.forEach((id) => {
    updates.push(
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

  return updates;
};

/**
 * Main update method.
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
      const currentValue = entry?.[attribute];
      const newValue = params.values[attribute];
      const association = this.associations.find((x) => x.alias === attribute);
      const details = this._attributes[attribute];

      // Simple attribute.
      if (!association && !details?.isVirtual) {
        return processSimpleAttribute(acc, attribute, newValue);
      }

      const assocModel = getAssociatedModel(details);

      // Association handling.
      switch (association?.nature) {
        case 'oneWay':
        case 'manyWay':
          return processOneWay(acc, attribute, newValue, assocModel);
        case 'manyToOne':
          return processManyToOne(acc, attribute, newValue, assocModel);
        case 'oneToOne':
          {
            const { acc: subAcc, updates } = await processOneToOne.call(this, {
              entry,
              attribute,
              newValue,
              currentValue,
              assocModel,
              details,
              primaryKeyValue,
              session,
            });
            relationUpdates.push(...updates);
            return _.assign(acc, subAcc);
          }
        case 'oneToMany':
          {
            const { acc: subAcc, updates } = await processOneToMany({
              currentValue,
              newValue,
              assocModel,
              details,
              primaryKeyValue,
              session,
            });
            relationUpdates.push(...updates);
            return _.assign(acc, subAcc);
          }
        case 'manyToMany':
          if (association.dominant) {
            return processDominantManyToMany(acc, attribute, newValue, assocModel);
          }
          {
            const { acc: subAcc, updates } = await processManyToMany({
              currentValue,
              newValue,
              assocModel,
              association,
              primaryKeyValue,
              session,
            });
            relationUpdates.push(...updates);
            return _.assign(acc, subAcc);
          }
        case 'manyMorphToMany':
        case 'manyMorphToOne':
          {
            const morphUpdates = await processMorphSource.call(this, {
              entry,
              association,
              newValue,
              session,
              primaryKeyValue,
            });
            relationUpdates.push(...morphUpdates);
            break;
          }
        case 'oneToManyMorph':
        case 'manyToManyMorph':
          {
            const morphUpdates = await processMorphTarget.call(this, {
              entry,
              association,
              currentValue,
              newValue,
              session,
              primaryKeyValue,
            });
            relationUpdates.push(...morphUpdates);
            break;
          }
        case 'oneMorphToOne':
        case 'oneMorphToMany':
          break;
        default:
          break;
      }

      return acc;
    }, {});

    // Persist updates.
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

    return Promise.all(
      this.associations.map(async (association) => {
        const { nature, via, dominant } = association;

        switch (nature) {
          case 'oneWay':
          case 'manyWay':
            return;
          case 'oneToMany':
          case 'oneToOne':
            if (!via) return;
            {
              const targetModel = strapi.db.getModel(
                association.model || association.collection,
                association.plugin
              );
              return targetModel.updateMany({ [via]: primaryKeyValue }, { [via]: null }, { session });
            }
          case 'manyToMany':
          case 'manyToOne':
            if (!via || dominant) return;
            {
              const targetModel = strapi.db.getModel(
                association.model || association.collection,
                association.plugin
              );
              return targetModel.updateMany(
                { [via]: primaryKeyValue },
                { $pull: { [via]: primaryKeyValue } },
                { session }
              );
            }
          case 'oneToManyMorph':
          case 'manyToManyMorph':
            {
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

              return targetModel.updateMany(
                { [via]: { $elemMatch: element } },
                { $pull: { [via]: element } },
                { session }
              );
            }
          case 'manyMorphToMany':
          case 'manyMorphToOne':
            if (Array.isArray(entry[association.alias])) {
              return Promise.all(
                entry[association.alias].map((val) => {
                  const targetModel = strapi.db.getModelByGlobalId(val.kind);
                  if (!targetModel) return;

                  const field = val[association.filter];
                  const reverseAssoc = targetModel.associations.find(
                    (assoc) => assoc.alias === field
                  );

                  if (reverseAssoc?.nature === 'oneToManyMorph') {
                    return targetModel.updateMany(
                      {
                        [targetModel.primaryKey]: val.ref && (val.ref._id || val.ref),
                      },
                      { [field]: null },
                      { session }
                    );
                  }

                  return targetModel.updateMany(
                    {
                      [targetModel.primaryKey]: val.ref && (val.ref._id || val.ref),
                    },
                    { $pull: { [field]: primaryKeyValue } },
                    { session }
                  );
                })
              );
            }
            return;
          case 'oneMorphToOne':
          case 'oneMorphToMany':
            return;
          default:
            return;
        }
      })
    );
  },
};