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
 * Convert a value or array of values to an array of stringified primary keys.
 *
 * @param {any} array - The value or array of values to transform.
 * @param {string} pk - The primary key field name.
 * @returns {string[]} Array of stringified primary keys.
 */
const transformToArrayID = (array, pk) => {
  if (_.isArray(array)) {
    return array
      .map((value) => value && (getValuePrimaryKey(value, pk) ?? value))
      .filter(Boolean)
      .map((val) => _.toString(val));
  }

  return transformToArrayID([array], pk);
};

/**
 * Remove keys with undefined values from an object.
 *
 * @param {Object} obj - The object to clean.
 * @returns {Object} New object without undefined values.
 */
const removeUndefinedKeys = (obj = {}) => _.pickBy(obj, _.negate(_.isUndefined));

/**
 * Add a morph relation to a model.
 *
 * @param {Object} model - The Mongoose model.
 * @param {Object} params - Parameters for the relation.
 * @param {Object} [options] - Options.
 * @param {Object} [options.session] - Mongoose session.
 * @returns {Promise} Promise resolving when the relation is added.
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
 * Remove a morph relation from a model.
 *
 * @param {Object} model - The Mongoose model.
 * @param {Object} params - Parameters for the relation.
 * @param {Object} [options] - Options.
 * @param {Object} [options.session] - Mongoose session.
 * @returns {Promise} Promise resolving when the relation is removed.
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
 *
 * Each handler receives the following arguments:
 * - attribute: The attribute name.
 * - currentValue: The current value of the attribute.
 * - newValue: The new value to set.
 * - details: The attribute details.
 * - assocModel: The associated Mongoose model.
 * - association: The association definition.
 * - entry: The current entry document.
 * - primaryKeyValue: The primary key value of the entry.
 * - session: The Mongoose session.
 * - relationUpdates: Array to push relation update promises.
 * - acc: Accumulator object for the update payload.
 *
 * The handler should return the updated accumulator.
 */
const natureHandlers = {
  oneWay: (attribute, currentValue, newValue, details, assocModel, association, entry, primaryKeyValue, session, relationUpdates, acc) => {
    return _.set(acc, attribute, newValue?.[assocModel.primaryKey] ?? newValue);
  },

  oneToOne: (attribute, currentValue, newValue, details, assocModel, association, entry, primaryKeyValue, session, relationUpdates, acc) => {
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
  },

  oneToMany: (attribute, currentValue, newValue, details, assocModel, association, entry, primaryKeyValue, session, relationUpdates, acc) => {
    const attributeIds = currentValue;
    const toRemove = _.differenceWith(attributeIds, newValue, (a, b) => {
      return `${a?.[assocModel.primaryKey] ?? a}` === `${b?.[assocModel.primaryKey] ?? b}`;
    });

    const updatePromise = assocModel
      .updateMany(
        {
          [assocModel.primaryKey]: {
            $in: toRemove.map((val) => new mongoose.Types.ObjectId(val?.[assocModel.primaryKey] ?? val)),
          },
        },
        { [details.via]: null },
        { session }
      )
      .then(() => {
        return assocModel.updateMany(
          {
            [assocModel.primaryKey]: {
              $in: newValue.map((val) => new mongoose.Types.ObjectId(val?.[assocModel.primaryKey] ?? val)),
            },
          },
          { [details.via]: primaryKeyValue },
          { session }
        );
      });

    relationUpdates.push(updatePromise);
    return acc;
  },

  manyToOne: (attribute, currentValue, newValue, details, assocModel, association, entry, primaryKeyValue, session, relationUpdates, acc) => {
    return _.set(acc, attribute, newValue?.[assocModel.primaryKey] ?? newValue);
  },

  manyWay: (attribute, currentValue, newValue, details, assocModel, association, entry, primaryKeyValue, session, relationUpdates, acc) => {
    if (association.dominant) {
      return _.set(
        acc,
        attribute,
        newValue ? newValue.map((val) => val?.[assocModel.primaryKey] ?? val) : newValue
      );
    }

    const updatePromise = assocModel
      .updateMany(
        {
          [assocModel.primaryKey]: {
            $in: currentValue.map((val) => new mongoose.Types.ObjectId(val?.[assocModel.primaryKey] ?? val)),
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
                ? newValue.map((val) => new mongoose.Types.ObjectId(val?.[assocModel.primaryKey] ?? val))
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
  },

  manyMorphToMany: (attribute, currentValue, newValue, details, assocModel, association, entry, primaryKeyValue, session, relationUpdates, acc) => {
    newValue.forEach((obj) => {
      const refModel = strapi.db.getModel(obj.ref, obj.source);

      const createRelation = () => {
        return addRelationMorph(
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
      };

      const reverseAssoc = refModel.associations.find((assoc) => assoc.alias === obj.field);
      if (reverseAssoc?.nature === 'oneToManyMorph') {
        relationUpdates.push(
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
    return acc;
  },

  oneToManyMorph: (attribute, currentValue, newValue, details, assocModel, association, entry, primaryKeyValue, session, relationUpdates, acc) => {
    const currentIds = transformToArrayID(currentValue, this.primaryKey);
    const newIds = transformToArrayID(newValue, this.primaryKey);

    const toAdd = _.difference(newIds, currentIds);
    const toRemove = _.difference(currentIds, newIds);

    const model = strapi.db.getModel(details.model ?? details.collection, details.plugin);

    if (!Array.isArray(newValue)) {
      _.set(acc, attribute, newIds[0]);
    } else {
      _.set(acc, attribute, newIds);
    }

    const addPromise = Promise.all(
      toAdd.map((id) => {
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

    toRemove.forEach((id) => {
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

    return acc;
  },

  manyToManyMorph: (attribute, currentValue, newValue, details, assocModel, association, entry, primaryKeyValue, session, relationUpdates, acc) => {
    // Reuse oneToManyMorph logic
    return natureHandlers.oneToManyMorph(
      attribute,
      currentValue,
      newValue,
      details,
      assocModel,
      association,
      entry,
      primaryKeyValue,
      session,
      relationUpdates,
      acc
    );
  },

  // No-op handlers for morph-to-one and morph-to-many
  oneMorphToOne: () => {},
  oneMorphToMany: () => {},
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

    const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, attribute) => {
      const currentValue = entry[attribute];
      const newValue = params.values[attribute];

      const association = this.associations.find((x) => x.alias === attribute);
      const details = this._attributes[attribute];

      if (!association && details?.isVirtual !== true) {
        return _.set(acc, attribute, newValue);
      }

      const assocModel = strapi.db.getModel(details.model ?? details.collection, details.plugin);

      const handler = natureHandlers[association.nature];
      if (handler) {
        return handler(
          attribute,
          currentValue,
          newValue,
          details,
          assocModel,
          association,
          entry,
          primaryKeyValue,
          session,
          relationUpdates,
          acc
        );
      }

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
      this.associations.map(async (association) => {
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
            const targetModel3 = strapi.db.getModel(
              association.model ?? association.collection,
              association.plugin
            );

            if (!targetModel3) return;

            const element = {
              ref: primaryKeyValue,
              kind: this.globalId,
              [association.filter]: association.alias,
            };

            return targetModel3.updateMany(
              { [via]: { $elemMatch: element } },
              { $pull: { [via]: element } },
              { session }
            );

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
                        [targetModel.primaryKey]: val.ref && (val.ref._id ?? val.ref),
                      },
                      {
                        [field]: null,
                      },
                      { session }
                    );
                  }

                  return targetModel.updateMany(
                    {
                      [targetModel.primaryKey]: val.ref && (val.ref._id ?? val.ref),
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
  },
};