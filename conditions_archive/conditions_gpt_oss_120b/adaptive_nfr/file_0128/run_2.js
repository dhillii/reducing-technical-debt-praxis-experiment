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
 * @param {any|any[]} array
 * @param {string} pk
 * @returns {string[]}
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
 * Remove keys with undefined values from an object.
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
 * Handlers for each association nature during update.
 * @type {Object<string, Function>}
 */
const natureHandlers = {
  oneWay({ attribute, newValue, assocModel, acc }) {
    acc[attribute] = newValue?.[assocModel.primaryKey] ?? newValue;
  },

  oneToOne({
    attribute,
    currentValue,
    newValue,
    assocModel,
    details,
    primaryKeyValue,
    session,
    acc,
    relationUpdates,
    model,
  }) {
    if (currentValue === newValue) return;

    if (_.isNull(newValue)) {
      const updatePromise = assocModel.updateOne(
        {
          [assocModel.primaryKey]: getValuePrimaryKey(currentValue, assocModel.primaryKey),
        },
        { [details.via]: null },
        { session }
      );
      relationUpdates.push(updatePromise);
      acc[attribute] = null;
      return;
    }

    const updateLink = model
      .updateOne(
        { [attribute]: new mongoose.Types.ObjectId(newValue) },
        { [attribute]: null },
        { session }
      )
      .then(() => {
        return assocModel.updateOne(
          {
            [model.primaryKey]: new mongoose.Types.ObjectId(newValue),
          },
          { [details.via]: primaryKeyValue },
          { session }
        );
      });

    relationUpdates.push(updateLink);
    acc[attribute] = newValue;
  },

  oneToMany({
    attribute,
    currentValue,
    newValue,
    assocModel,
    details,
    primaryKeyValue,
    session,
    relationUpdates,
  }) {
    const toRemove = _.differenceWith(currentValue, newValue, (a, b) => {
      return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
    });

    const updatePromise = assocModel
      .updateMany(
        {
          [assocModel.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)),
          },
        },
        { [details.via]: null },
        { session }
      )
      .then(() => {
        return assocModel.updateMany(
          {
            [assocModel.primaryKey]: {
              $in: newValue.map(val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)),
            },
          },
          { [details.via]: primaryKeyValue },
          { session }
        );
      });

    relationUpdates.push(updatePromise);
  },

  manyToOne({ attribute, newValue, assocModel, acc }) {
    acc[attribute] = newValue?.[assocModel.primaryKey] ?? newValue;
  },

  manyWay({ attribute, newValue, acc }) {
    // same handling as manyToMany when not dominant
    acc[attribute] = newValue;
  },

  manyToMany({
    attribute,
    currentValue,
    newValue,
    association,
    assocModel,
    primaryKeyValue,
    session,
    relationUpdates,
    model,
  }) {
    if (association.dominant) {
      acc[attribute] = newValue ? newValue.map(val => val[assocModel.primaryKey] || val) : newValue;
      return;
    }

    const updatePromise = assocModel
      .updateMany(
        {
          [assocModel.primaryKey]: {
            $in: currentValue.map(val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)),
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
                ? newValue.map(val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val))
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
  },

  manyMorphToMany({
    attribute,
    newValue,
    entry,
    association,
    model,
    session,
    relationUpdates,
  }) {
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
      if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
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
  },

  manyMorphToOne({
    attribute,
    newValue,
    entry,
    association,
    model,
    session,
    relationUpdates,
  }) {
    // identical handling to manyMorphToMany
    natureHandlers.manyMorphToMany({
      attribute,
      newValue,
      entry,
      association,
      model,
      session,
      relationUpdates,
    });
  },

  oneToManyMorph({
    attribute,
    currentValue,
    newValue,
    entry,
    association,
    model,
    session,
    relationUpdates,
    primaryKeyValue,
  }) {
    const currentIds = transformToArrayID(currentValue, model.primaryKey);
    const newIds = transformToArrayID(newValue, model.primaryKey);

    const toAdd = _.difference(newIds, currentIds);
    const toRemove = _.difference(currentIds, newIds);

    const targetModel = strapi.db.getModel(
      association.model || association.collection,
      association.plugin
    );

    if (!Array.isArray(newValue)) {
      model._attributes[attribute] = newIds[0];
    } else {
      model._attributes[attribute] = newIds;
    }

    const addPromise = Promise.all(
      toAdd.map(id => {
        return addRelationMorph(
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
        );
      })
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
  },

  oneMorphToOne() {
    // No operation needed
  },

  oneMorphToMany() {
    // No operation needed
  },

  manyMorphToOne() {
    // Handled by manyMorphToMany
  },

  manyMorphToMany() {
    // Handled by manyMorphToMany
  },
};

/**
 * Process a single attribute during update.
 * @param {Object} ctx
 */
function processAttribute(ctx) {
  const {
    attribute,
    entry,
    paramsValues,
    model,
    relationUpdates,
    primaryKeyValue,
    session,
  } = ctx;

  const currentValue = entry[attribute];
  const newValue = paramsValues[attribute];
  const association = model.associations.find(x => x.alias === attribute);
  const details = model._attributes[attribute];

  // Simple attribute
  if (!association && details?.isVirtual !== true) {
    ctx.acc[attribute] = newValue;
    return;
  }

  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
  const handler = natureHandlers[association.nature];
  if (handler) {
    handler({
      attribute,
      currentValue,
      newValue,
      entry,
      assocModel,
      details,
      primaryKeyValue,
      session,
      acc: ctx.acc,
      relationUpdates,
      model,
      association,
    });
  }
}

/**
 * Handlers for each association nature during deleteRelations.
 * @type {Object<string, Function>}
 */
const deleteNatureHandlers = {
  oneWay() {
    // No action needed
  },

  manyWay() {
    // No action needed
  },

  oneToMany({ association, primaryKeyValue, session }) {
    if (!association.via) return;
    const targetModel = strapi.db.getModel(
      association.model || association.collection,
      association.plugin
    );
    return targetModel.updateMany({ [association.via]: primaryKeyValue }, { [association.via]: null }, {
      session,
    });
  },

  oneToOne({ association, primaryKeyValue, session }) {
    // Same as oneToMany
    return deleteNatureHandlers.oneToMany({ association, primaryKeyValue, session });
  },

  manyToMany({ association, primaryKeyValue, session }) {
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
  },

  manyToOne({ association, primaryKeyValue, session }) {
    // Same as manyToMany
    return deleteNatureHandlers.manyToMany({ association, primaryKeyValue, session });
  },

  oneToManyMorph({ association, primaryKeyValue, session }) {
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
  },

  manyToManyMorph({ association, primaryKeyValue, session }) {
    // Same as oneToManyMorph
    return deleteNatureHandlers.oneToManyMorph({ association, primaryKeyValue, session });
  },

  manyMorphToMany({ entry, association, session }) {
    if (!Array.isArray(entry[association.alias])) return;
    return Promise.all(
      entry[association.alias].map(val => {
        const targetModel = strapi.db.getModelByGlobalId(val.kind);
        if (!targetModel) return;
        const field = val[association.filter];
        const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === field);
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
            $pull: { [field]: entry[this.primaryKey] },
          },
          { session }
        );
      })
    );
  },

  manyMorphToOne({ entry, association, session }) {
    // Same as manyMorphToMany
    return deleteNatureHandlers.manyMorphToMany({ entry, association, session });
  },

  oneMorphToOne() {
    // No action needed
  },

  oneMorphToMany() {
    // No action needed
  },
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
      processAttribute({
        attribute,
        entry,
        paramsValues: params.values,
        model: this,
        relationUpdates,
        primaryKeyValue,
        session,
        acc,
      });
      return acc;
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

    return Promise.all(
      this.associations.map(association => {
        const handler = deleteNatureHandlers[association.nature];
        if (!handler) return;
        return handler.call(this, {
          association,
          primaryKeyValue,
          session,
          entry,
        });
      })
    );
  },
};