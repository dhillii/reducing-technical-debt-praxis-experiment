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
 * Transform a value or array of values to an array of string IDs.
 *
 * @param {any|any[]} array - The value(s) to transform.
 * @param {string} pk - Primary key field name.
 * @returns {string[]} Array of string IDs.
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

const removeUndefinedKeys = (obj = {}) => _.pickBy(obj, _.negate(_.isUndefined));

/**
 * Add a morph relation.
 *
 * @param {Object} model - Mongoose model.
 * @param {Object} params - Relation parameters.
 * @param {Object} [options] - Options.
 * @param {any} [options.session=null] - Transaction session.
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
 *
 * @param {Object} model - Mongoose model.
 * @param {Object} params - Relation parameters.
 * @param {Object} [options] - Options.
 * @param {any} [options.session=null] - Transaction session.
 */
const removeRelationMorph = async (model, params, { session = null } = {}) => {
  const { alias } = params;

  let opts;
  // if entry id is provided simply query it
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
          [params.filter]: params.field,
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
          [params.filter]: params.field,
        },
      },
    },
    { session }
  );
};

/**
 * Process attribute based on association nature.
 *
 * @param {Object} ctx - Context containing helpers and state.
 * @param {Object} ctx.entry - Current DB entry.
 * @param {Object} ctx.relationUpdates - Array collecting async updates.
 * @param {Object} ctx.session - Transaction session.
 * @param {string} attribute - Attribute name.
 * @param {any} currentValue - Current stored value.
 * @param {any} newValue - New value from params.
 * @param {Object} association - Association metadata.
 * @param {Object} details - Attribute details.
 * @param {Object} model - Current model (this).
 * @returns {Object} Updated accumulator.
 */
const processAttribute = ({
  entry,
  relationUpdates,
  session,
  attribute,
  currentValue,
  newValue,
  association,
  details,
  model,
}) => {
  const primaryKeyValue = getValuePrimaryKey(entry, model.primaryKey);
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
  const handlers = {
    oneWay: () => _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue)),
    manyToOne: () => _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue)),
    oneToOne: () => {
      if (currentValue === newValue) return acc;
      if (_.isNull(newValue)) {
        const upd = assocModel.updateOne(
          {
            [assocModel.primaryKey]: getValuePrimaryKey(currentValue, assocModel.primaryKey),
          },
          { [details.via]: null },
          { session }
        );
        relationUpdates.push(upd);
        return _.set(acc, attribute, null);
      }
      const link = model
        .updateOne(
          { [attribute]: new mongoose.Types.ObjectId(newValue) },
          { [attribute]: null },
          { session }
        )
        .then(() =>
          assocModel.updateOne(
            { [model.primaryKey]: new mongoose.Types.ObjectId(newValue) },
            { [details.via]: primaryKeyValue },
            { session }
          )
        );
      relationUpdates.push(link);
      return _.set(acc, attribute, newValue);
    },
    oneToMany: () => {
      const toRemove = _.differenceWith(currentValue, newValue, (a, b) => {
        return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
      });
      const upd = assocModel
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
      relationUpdates.push(upd);
      return acc;
    },
    manyWay: () => handlers.manyToMany(),
    manyToMany: () => {
      if (association.dominant) {
        return _.set(
          acc,
          attribute,
          newValue ? newValue.map(v => v[assocModel.primaryKey] || v) : newValue
        );
      }
      const upd = assocModel
        .updateMany(
          {
            [assocModel.primaryKey]: {
              $in: currentValue.map(v => new mongoose.Types.ObjectId(v[assocModel.primaryKey] || v)),
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
                  ? newValue.map(v => new mongoose.Types.ObjectId(v[assocModel.primaryKey] || v))
                  : newValue,
              },
            },
            {
              $addToSet: { [association.via]: [primaryKeyValue] },
            },
            { session }
          )
        );
      relationUpdates.push(upd);
      return acc;
    },
    manyMorphToMany: () => handleMorphMany({ entry, relationUpdates, session, newValue, association, model }),
    manyMorphToOne: () => handlers.manyMorphToMany(),
    oneToManyMorph: () => handleMorphOneToMany({ entry, relationUpdates, session, currentValue, newValue, details, association, model }),
    manyToManyMorph: () => handlers.oneToManyMorph(),
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorphToOne: () => acc,
    oneMorphToMany: () => acc,
    oneMorph: () => acc,
  };

  const handler = handlers[association.nature];
  if (handler) {
    return handler();
  }
  return acc;
};

/**
 * Handle manyMorph (manyMorphToMany / manyMorphToOne) updates.
 *
 * @param {Object} ctx - Context.
 */
const handleMorphMany = async ({
  entry,
  relationUpdates,
  session,
  newValue,
  association,
  model,
}) => {
  newValue.forEach(obj => {
    const refModel = strapi.db.getModel(obj.ref, obj.source);

    const createRelation = () => {
      return addRelationMorph(
        model,
        {
          id: entry[model.primaryKey],
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
    if (reverseAssoc?.nature === 'oneToManyMorph') {
      relationUpdates.push(
        removeRelationMorph(
          model,
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
                [obj.field]: new mongoose.Types.ObjectId(entry[model.primaryKey]),
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
              $push: { [obj.field]: new mongoose.Types.ObjectId(entry[model.primaryKey]) },
            },
            { session }
          );
        })
      );
    }
  });
};

/**
 * Handle oneToManyMorph / manyToManyMorph updates.
 *
 * @param {Object} ctx - Context.
 */
const handleMorphOneToMany = ({
  entry,
  relationUpdates,
  session,
  currentValue,
  newValue,
  details,
  association,
  model,
}) => {
  const currentIds = transformToArrayID(currentValue, model.primaryKey);
  const newIds = transformToArrayID(newValue, model.primaryKey);

  const toAdd = _.difference(newIds, currentIds);
  const toRemove = _.difference(currentIds, newIds);

  const targetModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  if (!Array.isArray(newValue)) {
    _.set(entry, association.alias, newIds[0]);
  } else {
    _.set(entry, association.alias, newIds);
  }

  const addPromise = Promise.all(
    toAdd.map(id =>
      addRelationMorph(
        targetModel,
        {
          id,
          alias: association.via,
          ref: model.globalId,
          refId: entry._id,
          field: association.alias,
          filter: association.filter,
        },
        { session }
      )
    )
  );

  relationUpdates.push(addPromise);

  toRemove.forEach(id => {
    relationUpdates.push(
      removeRelationMorph(
        targetModel,
        {
          id,
          alias: association.via,
          ref: model.globalId,
          refId: entry._id,
          field: association.alias,
          filter: association.filter,
        },
        { session }
      )
    );
  });
};

module.exports = {
  async update(params, { session = null } = {}) {
    const relationUpdates = [];
    const populate = this.associations.map(x => x.alias);
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);

    const entry = await this.findOne({ [this.primaryKey]: primaryKeyValue })
      .session(session)
      .populate(populate)
      .lean();

    const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, attribute) => {
      const currentValue = entry[attribute];
      const newValue = params.values[attribute];

      const association = this.associations.find(x => x.alias === attribute);
      const details = this._attributes[attribute];

      if (!association && _.get(details, 'isVirtual') !== true) {
        return _.set(acc, attribute, newValue);
      }

      return processAttribute({
        entry,
        relationUpdates,
        session,
        attribute,
        currentValue,
        newValue,
        association,
        details,
        model: this,
      });
    }, {});

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
  },

  deleteRelations(entry, { session = null } = {}) {
    const primaryKeyValue = entry[this.primaryKey];

    const handlers = {
      oneWay: () => Promise.resolve(),
      manyWay: () => Promise.resolve(),
      oneToMany: () => handleDeleteOneToMany(),
      oneToOne: () => handleDeleteOneToMany(),
      manyToMany: () => handleDeleteManyToMany(),
      manyToOne: () => handleDeleteManyToMany(),
      oneToManyMorph: () => handleDeleteMorph(),
      manyToManyMorph: () => handleDeleteMorph(),
      manyMorphToMany: () => handleDeleteManyMorph(),
      manyMorphToOne: () => handleDeleteManyMorph(),
    };

    const handleDeleteOneToMany = () => {
      if (!association.via) return;
      const targetModel = strapi.db.getModel(
        association.model || association.collection,
        association.plugin
      );
      return targetModel.updateMany({ [association.via]: primaryKeyValue }, { [association.via]: null }, { session });
    };

    const handleDeleteManyToMany = () => {
      if (!association.via || association.dominant) return;
      const targetModel = strapi.db.getModel(
        association.model || association.collection,
        association.plugin
      );
      return targetModel.updateMany(
        { [association.via]: primaryKeyValue },
        { $pull: { [association.via]: primaryKeyValue } },
        { session }
      );
    };

    const handleDeleteMorph = () => {
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
        { [association.via]: { $elemMatch: element } },
        { $pull: { [association.via]: element } },
        { session }
      );
    };

    const handleDeleteManyMorph = async () => {
      if (!Array.isArray(entry[association.alias])) return;
      return Promise.all(
        entry[association.alias].map(val => {
          const targetModel = strapi.db.getModelByGlobalId(val.kind);
          if (!targetModel) return;
          const field = val[association.filter];
          const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === field);
          if (reverseAssoc?.nature === 'oneToManyMorph') {
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
    };

    return Promise.all(
      this.associations.map(async association => {
        const handler = handlers[association.nature];
        if (handler) {
          return handler();
        }
        return null;
      })
    );
  },
};