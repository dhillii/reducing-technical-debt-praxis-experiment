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
 * @param {any} array - Value or array of values.
 * @param {string} pk - Primary key field name.
 * @returns {string[]} Array of string IDs.
 */
const transformToArrayID = (array, pk) => {
  if (!_.isArray(array)) {
    return transformToArrayID([array], pk);
  }
  return array
    .map((value) => value && (getValuePrimaryKey(value, pk) ?? value))
    .filter(Boolean)
    .map(String);
};

/**
 * Remove keys with undefined values from an object.
 * @param {Object} obj - Object to clean.
 * @returns {Object} Cleaned object.
 */
const removeUndefinedKeys = (obj = {}) => _.pickBy(obj, _.negate(_.isUndefined));

/**
 * Add a morph relation to a model.
 * @param {Object} model - Mongoose model.
 * @param {Object} params - Relation parameters.
 * @param {Object} options - Options.
 * @returns {Promise<void>}
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
 * Remove a morph relation from a model.
 * @param {Object} model - Mongoose model.
 * @param {Object} params - Relation parameters.
 * @param {Object} options - Options.
 * @returns {Promise<void>}
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
 * Handlers for different association natures.
 */
const associationHandlers = {
  /**
   * Handle oneWay association.
   */
  oneWay: async function (attribute, currentValue, newValue, association, details, entry, session) {
    // No action needed for oneWay on update.
    return { updatedValue: undefined, promises: [] };
  },

  /**
   * Handle oneToOne association.
   */
  oneToOne: async function (attribute, currentValue, newValue, association, details, entry, session) {
    const assocModel = strapi.db.getModel(details.model ?? details.collection, details.plugin);
    const primaryKeyValue = getValuePrimaryKey(entry, this.primaryKey);

    // If value unchanged, nothing to do.
    if (currentValue === newValue) {
      return { updatedValue: undefined, promises: [] };
    }

    const promises = [];

    // If new value is null, clear relation on both sides.
    if (_.isNull(newValue)) {
      promises.push(
        assocModel.updateOne(
          { [assocModel.primaryKey]: getValuePrimaryKey(currentValue, assocModel.primaryKey) },
          { [details.via]: null },
          { session }
        )
      );
      return { updatedValue: null, promises };
    }

    // Clear old relation.
    promises.push(
      this.updateOne(
        { [attribute]: new mongoose.Types.ObjectId(newValue) },
        { [attribute]: null },
        { session }
      ).then(() =>
        assocModel.updateOne(
          { [this.primaryKey]: new mongoose.Types.ObjectId(newValue) },
          { [details.via]: primaryKeyValue },
          { session }
        )
      )
    );

    return { updatedValue: newValue, promises };
  },

  /**
   * Handle oneToMany association.
   */
  oneToMany: async function (attribute, currentValue, newValue, association, details, entry, session) {
    const assocModel = strapi.db.getModel(details.model ?? details.collection, details.plugin);
    const primaryKeyValue = getValuePrimaryKey(entry, this.primaryKey);

    const attributeIds = currentValue ?? [];
    const toRemove = _.differenceWith(
      attributeIds,
      newValue ?? [],
      (a, b) => `${a[assocModel.primaryKey] ?? a}` === `${b[assocModel.primaryKey] ?? b}`
    );

    const promises = [];

    // Remove old relations.
    if (toRemove.length) {
      promises.push(
        assocModel
          .updateMany(
            {
              [assocModel.primaryKey]: {
                $in: toRemove.map((val) => new mongoose.Types.ObjectId(val[assocModel.primaryKey] ?? val)),
              },
            },
            { [details.via]: null },
            { session }
          )
          .then(() =>
            assocModel.updateMany(
              {
                [assocModel.primaryKey]: {
                  $in: (newValue ?? []).map((val) => new mongoose.Types.ObjectId(val[assocModel.primaryKey] ?? val)),
                },
              },
              { [details.via]: primaryKeyValue },
              { session }
            )
          )
      );
    }

    return { updatedValue: undefined, promises };
  },

  /**
   * Handle manyToOne association.
   */
  manyToOne: async function (attribute, currentValue, newValue, association, details, entry, session) {
    const assocModel = strapi.db.getModel(details.model ?? details.collection, details.plugin);
    return {
      updatedValue: _.get(newValue, assocModel.primaryKey, newValue),
      promises: [],
    };
  },

  /**
   * Handle manyWay and manyToMany associations.
   */
  manyWay: async function (attribute, currentValue, newValue, association, details, entry, session) {
    return this._handleManyToMany(attribute, currentValue, newValue, association, details, entry, session);
  },
  manyToMany: async function (attribute, currentValue, newValue, association, details, entry, session) {
    return this._handleManyToMany(attribute, currentValue, newValue, association, details, entry, session);
  },

  /**
   * Handle manyMorphToMany and manyMorphToOne associations.
   */
  manyMorphToMany: async function (attribute, currentValue, newValue, association, details, entry, session) {
    return this._handleManyMorph(attribute, currentValue, newValue, association, details, entry, session);
  },
  manyMorphToOne: async function (attribute, currentValue, newValue, association, details, entry, session) {
    return this._handleManyMorph(attribute, currentValue, newValue, association, details, entry, session);
  },

  /**
   * Handle oneToManyMorph and manyToManyMorph associations.
   */
  oneToManyMorph: async function (attribute, currentValue, newValue, association, details, entry, session) {
    return this._handleMorphToModel(attribute, currentValue, newValue, association, details, entry, session);
  },
  manyToManyMorph: async function (attribute, currentValue, newValue, association, details, entry, session) {
    return this._handleMorphToModel(attribute, currentValue, newValue, association, details, entry, session);
  },

  /**
   * Handle oneMorphToOne and oneMorphToMany (no action needed).
   */
  oneMorphToOne: async function () {
    return { updatedValue: undefined, promises: [] };
  },
  oneMorphToMany: async function () {
    return { updatedValue: undefined, promises: [] };
  },
};

/**
 * Helper methods added to the context for handlers that need shared logic.
 */
const addSharedMethods = (context) => {
  /**
   * Handle manyToMany and manyWay associations.
   */
  context._handleManyToMany = async function (
    attribute,
    currentValue,
    newValue,
    association,
    details,
    entry,
    session
  ) {
    const assocModel = strapi.db.getModel(details.model ?? details.collection, details.plugin);
    const primaryKeyValue = getValuePrimaryKey(entry, this.primaryKey);

    const promises = [];

    if (association.dominant) {
      // Dominant side: simply set the array of IDs.
      return {
        updatedValue: newValue
          ? newValue.map((val) => val[assocModel.primaryKey] ?? val)
          : newValue,
        promises: [],
      };
    }

    // Remove old references.
    promises.push(
      assocModel
        .updateMany(
          {
            [assocModel.primaryKey]: {
              $in: (currentValue ?? []).map((val) =>
                new mongoose.Types.ObjectId(val[assocModel.primaryKey] ?? val)
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
                $in: (newValue ?? []).map((val) =>
                  new mongoose.Types.ObjectId(val[assocModel.primaryKey] ?? val)
                ),
              },
            },
            {
              $addToSet: { [association.via]: [primaryKeyValue] },
            },
            { session }
          )
        )
    );

    return { updatedValue: undefined, promises };
  };

  /**
   * Handle manyMorphToMany and manyMorphToOne associations.
   */
  context._handleManyMorph = async function (
    attribute,
    currentValue,
    newValue,
    association,
    details,
    entry,
    session
  ) {
    const promises = [];

    (newValue ?? []).forEach((obj) => {
      const refModel = strapi.db.getModel(obj.ref, obj.source);

      const createRelation = () =>
        addRelationMorph(
          this,
          {
            id: entry[this.primaryKey],
            alias: association.alias,
            ref: obj.kind ?? refModel.globalId,
            refId: new mongoose.Types.ObjectId(obj.refId),
            field: obj.field,
            filter: association.filter,
          },
          { session }
        );

      const reverseAssoc = refModel.associations.find((assoc) => assoc.alias === obj.field);

      if (reverseAssoc?.nature === 'oneToManyMorph') {
        promises.push(
          removeRelationMorph(
            this,
            {
              alias: association.alias,
              ref: obj.kind ?? refModel.globalId,
              refId: new mongoose.Types.ObjectId(obj.refId),
              field: obj.field,
              filter: association.filter,
            },
            { session }
          )
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
        promises.push(
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

    return { updatedValue: undefined, promises };
  };

  /**
   * Handle oneToManyMorph and manyToManyMorph associations.
   */
  context._handleMorphToModel = async function (
    attribute,
    currentValue,
    newValue,
    association,
    details,
    entry,
    session
  ) {
    const model = strapi.db.getModel(details.model ?? details.collection, details.plugin);
    const primaryKeyValue = getValuePrimaryKey(entry, this.primaryKey);

    const currentIds = transformToArrayID(currentValue, this.primaryKey);
    const newIds = transformToArrayID(newValue, this.primaryKey);

    const toAdd = _.difference(newIds, currentIds);
    const toRemove = _.difference(currentIds, newIds);

    const promises = [];

    // Set field value(s) on the main document.
    if (!Array.isArray(newValue)) {
      this[attribute] = newIds[0];
    } else {
      this[attribute] = newIds;
    }

    // Add new relations.
    promises.push(
      Promise.all(
        toAdd.map((id) =>
          addRelationMorph(
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
        )
      )
    );

    // Remove old relations.
    toRemove.forEach((id) => {
      promises.push(
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

    return { updatedValue: undefined, promises };
  };
};

module.exports = {
  async update(params, { session = null } = {}) {
    const relationUpdates = [];
    const populate = this.associations.map((x) => x.alias);
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);

    const entry = await this.findOne({ [this.primaryKey]: primaryKeyValue })
      .session(session)
      .populate(populate)
      .lean();

    const values = {};

    // Attach shared methods to the context for handlers.
    addSharedMethods(this);

    // Process each attribute.
    for (const attribute of Object.keys(removeUndefinedKeys(params.values))) {
      const currentValue = entry[attribute];
      const newValue = params.values[attribute];
      const association = this.associations.find((x) => x.alias === attribute);
      const details = this._attributes[attribute];

      // Simple attributes.
      if (!association && details?.isVirtual !== true) {
        values[attribute] = newValue;
        continue;
      }

      const handler = associationHandlers[association?.nature];
      if (!handler) {
        continue;
      }

      const { updatedValue, promises } = await handler.call(
        this,
        attribute,
        currentValue,
        newValue,
        association,
        details,
        entry,
        session
      );

      if (updatedValue !== undefined) {
        values[attribute] = updatedValue;
      }
      relationUpdates.push(...promises);
    }

    // Execute relation updates.
    await Promise.all(relationUpdates);

    // Update the main document.
    await this.updateOne({ [this.primaryKey]: primaryKeyValue }, values, {
      strict: false,
      session,
    });

    const updatedEntity = await this.findOne({ [this.primaryKey]: primaryKeyValue })
      .session(session)
      .populate(populate);

    return updatedEntity?.toObject ? updatedEntity.toObject() : updatedEntity;
  },

  async deleteRelations(entry, { session = null } = {}) {
    const primaryKeyValue = entry[this.primaryKey];

    // Attach shared methods to the context for handlers.
    addSharedMethods(this);

    const promises = this.associations.map(async (association) => {
      const { nature, via, dominant } = association;

      switch (nature) {
        case 'oneWay':
        case 'manyWay':
          return;

        case 'oneToMany':
        case 'oneToOne':
          if (!via) return;
          const targetModel1 = strapi.db.getModel(
            association.model ?? association.collection,
            association.plugin
          );
          return targetModel1.updateMany({ [via]: primaryKeyValue }, { [via]: null }, { session });

        case 'manyToMany':
        case 'manyToOne':
          if (!via || dominant) return;
          const targetModel2 = strapi.db.getModel(
            association.model ?? association.collection,
            association.plugin
          );
          return targetModel2.updateMany(
            { [via]: primaryKeyValue },
            { $pull: { [via]: primaryKeyValue } },
            { session }
          );

        case 'oneToManyMorph':
        case 'manyToManyMorph':
          {
            const targetModel = strapi.db.getModel(
              association.model ?? association.collection,
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
          {
            if (!Array.isArray(entry[association.alias])) return;
            return Promise.all(
              entry[association.alias].map(async (val) => {
                const targetModel = strapi.db.getModelByGlobalId(val.kind);
                if (!targetModel) return;
                const field = val[association.filter];
                const reverseAssoc = targetModel.associations.find(
                  (assoc) => assoc.alias === field
                );
                const targetId = val.ref && (val.ref._id ?? val.ref);
                if (!targetId) return;

                if (reverseAssoc?.nature === 'oneToManyMorph') {
                  return targetModel.updateMany(
                    { [targetModel.primaryKey]: new mongoose.Types.ObjectId(targetId) },
                    { [field]: null },
                    { session }
                  );
                }

                return targetModel.updateMany(
                  { [targetModel.primaryKey]: new mongoose.Types.ObjectId(targetId) },
                  { $pull: { [field]: primaryKeyValue } },
                  { session }
                );
              })
            );
          }

        case 'oneMorphToOne':
        case 'oneMorphToMany':
          return;
      }
    });

    return Promise.all(promises);
  },
};