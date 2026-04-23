'use strict';

/**
 * Module dependencies
 */
const _ = require('lodash');
const mongoose = require('mongoose');
const {
  models: { getValuePrimaryKey },
} = require('strapi-utils');

/**
 * Convert input to array of string IDs using primary key.
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
 * Retrieve entry with populated associations.
 */
const fetchEntry = async (model, primaryKeyValue, session, populate) => {
  return model
    .findOne({ [model.primaryKey]: primaryKeyValue })
    .session(session)
    .populate(populate)
    .lean();
};

/**
 * Process simple attribute updates (non-association fields).
 */
const handleSimpleAttribute = (acc, attribute, newValue) => _.set(acc, attribute, newValue);

/**
 * Process oneWay and manyWay attributes.
 */
const handleOneWay = (acc, attribute, newValue, assocModel) =>
  _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));

/**
 * Process manyToOne attributes.
 */
const handleManyToOne = (acc, attribute, newValue, assocModel) =>
  _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));

/**
 * Process dominant manyToMany / manyMorph attributes.
 */
const handleDominantMany = (acc, attribute, newValue, assocModel) => {
  const mapped = newValue ? newValue.map(val => val[assocModel.primaryKey] || val) : newValue;
  return _.set(acc, attribute, mapped);
};

/**
 * Update one-to-one relation.
 */
const processOneToOne = async ({
  model,
  entry,
  attribute,
  newValue,
  currentValue,
  details,
  primaryKeyValue,
  session,
  relationUpdates,
}) => {
  if (currentValue === newValue) return;

  if (_.isNull(newValue)) {
    const promise = model
      .updateOne(
        { [model.primaryKey]: getValuePrimaryKey(currentValue, model.primaryKey) },
        { [details.via]: null },
        { session }
      )
      .then(() => null);
    relationUpdates.push(promise);
    return _.set({}, attribute, null);
  }

  const linkPromise = model
    .updateOne(
      { [attribute]: new mongoose.Types.ObjectId(newValue) },
      { [attribute]: null },
      { session }
    )
    .then(() =>
      model.updateOne(
        { [model.primaryKey]: new mongoose.Types.ObjectId(newValue) },
        { [details.via]: primaryKeyValue },
        { session }
      )
    );

  relationUpdates.push(linkPromise);
  return _.set({}, attribute, newValue);
};

/**
 * Update one-to-many relation.
 */
const processOneToMany = async ({
  assocModel,
  attribute,
  currentValue,
  newValue,
  details,
  primaryKeyValue,
  session,
  relationUpdates,
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
          $in: toRemove.map(val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)),
        },
      },
      { [details.via]: null },
      { session }
    )
    .then(() =>
      assocModel.updateMany(
        {
          [assocModel.primaryKey]: {
            $in: newValue.map(val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)),
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
 * Update non-dominant many-to-many / manyMorph relations.
 */
const processNonDominantMany = async ({
  assocModel,
  association,
  currentValue,
  newValue,
  primaryKeyValue,
  session,
  relationUpdates,
}) => {
  const pullPromise = assocModel
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
    .then(() =>
      assocModel.updateMany(
        {
          [assocModel.primaryKey]: {
            $in: newValue
              ? newValue.map(val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val))
              : newValue,
          },
        },
        {
          $addToSet: { [association.via]: [primaryKeyValue] },
        },
        { session }
      )
    );

  relationUpdates.push(pullPromise);
};

/**
 * Process morph relations where current model is the source.
 */
const processMorphFromSource = async ({
  thisModel,
  entry,
  association,
  newValue,
  session,
  relationUpdates,
}) => {
  for (const obj of newValue) {
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

    const reverseAssoc = refModel.associations.find(a => a.alias === obj.field);
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
  }
};

/**
 * Process morph relations where current model is the target.
 */
const processMorphFromTarget = async ({
  thisModel,
  entry,
  association,
  currentValue,
  newValue,
  session,
  relationUpdates,
}) => {
  const currentIds = transformToArrayID(currentValue, thisModel.primaryKey);
  const newIds = transformToArrayID(newValue, thisModel.primaryKey);
  const toAdd = _.difference(newIds, currentIds);
  const toRemove = _.difference(currentIds, newIds);
  const targetModel = strapi.db.getModel(
    association.model || association.collection,
    association.plugin
  );

  if (!Array.isArray(newValue)) {
    _.set(entry, association.alias, newIds[0]);
  } else {
    _.set(entry, association.alias, newIds);
  }

  const addPromises = toAdd.map(id =>
    addRelationMorph(targetModel, {
      id,
      alias: association.via,
      ref: thisModel.globalId,
      refId: entry._id,
      field: association.alias,
      filter: association.filter,
    }, { session })
  );

  relationUpdates.push(Promise.all(addPromises));

  toRemove.forEach(id => {
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
};

/**
 * Build values object and collect relation update promises.
 */
const buildValuesAndRelations = async (model, entry, params, primaryKeyValue, session) => {
  const relationUpdates = [];
  const values = {};

  const attributes = Object.keys(removeUndefinedKeys(params.values));

  for (const attribute of attributes) {
    const newValue = params.values[attribute];
    const currentValue = entry[attribute];
    const association = model.associations.find(a => a.alias === attribute);
    const details = model._attributes[attribute];

    // Simple non-association attribute
    if (!association && !(details?.isVirtual)) {
      _.set(values, attribute, newValue);
      continue;
    }

    const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

    switch (association?.nature) {
      case 'oneWay':
        _.set(values, attribute, _.get(newValue, assocModel.primaryKey, newValue));
        break;

      case 'oneToOne': {
        const result = await processOneToOne({
          model: assocModel,
          entry,
          attribute,
          newValue,
          currentValue,
          details,
          primaryKeyValue,
          session,
          relationUpdates,
        });
        _.assign(values, result);
        break;
      }

      case 'oneToMany': {
        await processOneToMany({
          assocModel,
          attribute,
          currentValue,
          newValue,
          details,
          primaryKeyValue,
          session,
          relationUpdates,
        });
        break;
      }

      case 'manyToOne':
        _.set(values, attribute, _.get(newValue, assocModel.primaryKey, newValue));
        break;

      case 'manyWay':
      case 'manyToMany':
        if (association.dominant) {
          _.set(values, attribute, newValue ? newValue.map(v => v[assocModel.primaryKey] || v) : newValue);
        } else {
          await processNonDominantMany({
            assocModel,
            association,
            currentValue,
            newValue,
            primaryKeyValue,
            session,
            relationUpdates,
          });
        }
        break;

      case 'manyMorphToMany':
      case 'manyMorphToOne':
        await processMorphFromSource({
          thisModel: model,
          entry,
          association,
          newValue,
          session,
          relationUpdates,
        });
        break;

      case 'oneToManyMorph':
      case 'manyToManyMorph':
        await processMorphFromTarget({
          thisModel: model,
          entry,
          association,
          currentValue,
          newValue,
          session,
          relationUpdates,
        });
        break;

      case 'oneMorphToOne':
      case 'oneMorphToMany':
        // No action needed for these natures in update.
        break;

      default:
        break;
    }
  }

  return { values, relationUpdates };
};

module.exports = {
  /**
   * Update an entry and its relations.
   */
  async update(params, { session = null } = {}) {
    const populate = this.associations.map(a => a.alias);
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const entry = await fetchEntry(this, primaryKeyValue, session, populate);

    const { values, relationUpdates } = await buildValuesAndRelations(
      this,
      entry,
      params,
      primaryKeyValue,
      session
    );

    await Promise.all(relationUpdates);
    await this.updateOne({ [this.primaryKey]: primaryKeyValue }, values, {
      strict: false,
      session,
    });

    const updated = await this.findOne({ [this.primaryKey]: primaryKeyValue })
      .session(session)
      .populate(populate);

    return updated && updated.toObject ? updated.toObject() : updated;
  },

  /**
   * Delete all relations for a given entry.
   */
  async deleteRelations(entry, { session = null } = {}) {
    const primaryKeyValue = entry[this.primaryKey];
    const tasks = this.associations.map(async association => {
      const { nature, via, dominant } = association;

      if (nature === 'oneWay' || nature === 'manyWay') return;

      if ((nature === 'oneToMany' || nature === 'oneToOne') && via) {
        const target = strapi.db.getModel(association.model || association.collection, association.plugin);
        return target.updateMany({ [via]: primaryKeyValue }, { [via]: null }, { session });
      }

      if ((nature === 'manyToMany' || nature === 'manyToOne') && via && !dominant) {
        const target = strapi.db.getModel(association.model || association.collection, association.plugin);
        return target.updateMany(
          { [via]: primaryKeyValue },
          { $pull: { [via]: primaryKeyValue } },
          { session }
        );
      }

      if (nature === 'oneToManyMorph' || nature === 'manyToManyMorph') {
        const target = strapi.db.getModel(association.model || association.collection, association.plugin);
        if (!target) return;
        const element = {
          ref: primaryKeyValue,
          kind: this.globalId,
          [association.filter]: association.alias,
        };
        return target.updateMany(
          { [via]: { $elemMatch: element } },
          { $pull: { [via]: element } },
          { session }
        );
      }

      if (nature === 'manyMorphToMany' || nature === 'manyMorphToOne') {
        if (!Array.isArray(entry[association.alias])) return;
        return Promise.all(
          entry[association.alias].map(val => {
            const target = strapi.db.getModelByGlobalId(val.kind);
            if (!target) return;
            const field = val[association.filter];
            const reverse = target.associations.find(a => a.alias === field);
            const query = {
              [target.primaryKey]: val.ref && (val.ref._id || val.ref),
            };
            if (reverse?.nature === 'oneToManyMorph') {
              return target.updateMany(query, { [field]: null }, { session });
            }
            return target.updateMany(query, { $pull: { [field]: primaryKeyValue } }, { session });
          })
        );
      }

      // oneMorphToOne / oneMorphToMany have no cleanup needed.
    });

    return Promise.all(tasks);
  },
};