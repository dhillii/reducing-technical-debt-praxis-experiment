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
 * Transform array values to array of primary key IDs
 * @param {any} array - Input array or single value
 * @param {string} pk - Primary key field name
 * @returns {string[]} Array of stringified primary key values
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
 * Remove undefined keys from object
 * @param {Object} obj - Input object
 * @returns {Object} Object with undefined keys removed
 */
const removeUndefinedKeys = (obj = {}) => _.pickBy(obj, _.negate(_.isUndefined));

/**
 * Update relation based on association nature
 * @param {Object} association - Association metadata
 * @param {Object} assocModel - Associated model
 * @param {any} currentValue - Current relation value
 * @param {any} newValue - New relation value
 * @param {Object} details - Attribute details
 * @param {Object} entry - Entry document
 * @param {string} primaryKeyValue - Primary key value
 * @param {Object} session - MongoDB session
 * @param {Object} thisContext - Context for update methods
 * @returns {Object} Updated accumulator with relation changes
 */
const updateRelationStrategy = (association, assocModel, currentValue, newValue, details, entry, primaryKeyValue, session, thisContext) => {
  const { nature } = association;

  switch (nature) {
    case 'oneWay':
    case 'manyToOne': {
      return _.set({}, association.alias, _.get(newValue, assocModel.primaryKey, newValue));
    }

    case 'oneToOne': {
      if (currentValue === newValue) return {};

      if (_.isNull(newValue)) {
        const updatePromise = assocModel.updateOne(
          {
            [assocModel.primaryKey]: getValuePrimaryKey(currentValue, assocModel.primaryKey),
          },
          { [details.via]: null },
          { session }
        );

        return {
          updatePromise,
          newValue: null,
        };
      }

      const updateLink = thisContext.updateOne(
        { [association.alias]: new mongoose.Types.ObjectId(newValue) },
        { [association.alias]: null },
        { session }
      ).then(() => {
        return assocModel.updateOne(
          {
            [thisContext.primaryKey]: new mongoose.Types.ObjectId(newValue),
          },
          { [details.via]: primaryKeyValue },
          { session }
        );
      });

      return {
        updateLink,
        newValue,
      };
    }

    case 'oneToMany': {
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

      return {
        updatePromise,
        newValue: newValue,
      };
    }

    case 'manyWay':
    case 'manyToMany': {
      if (association.dominant) {
        return {
          newValue: newValue ? newValue.map(val => val[assocModel.primaryKey] || val) : newValue,
        };
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

      return {
        updatePromise,
        newValue: newValue,
      };
    }

    case 'manyMorphToMany':
    case 'manyMorphToOne': {
      const morphUpdates = [];
      newValue.forEach(obj => {
        const refModel = strapi.db.getModel(obj.ref, obj.source);

        const createRelation = () => {
          return addRelationMorph(
            thisContext,
            {
              id: entry[thisContext.primaryKey],
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
          morphUpdates.push(
            removeRelationMorph(
              thisContext,
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
                    [obj.field]: new mongoose.Types.ObjectId(entry[thisContext.primaryKey]),
                  },
                  { session }
                );
              })
          );
        } else {
          morphUpdates.push(
            createRelation().then(() => {
              return refModel.updateMany(
                {
                  [refModel.primaryKey]: new mongoose.Types.ObjectId(obj.refId),
                },
                {
                  $push: { [obj.field]: new mongoose.Types.ObjectId(entry[thisContext.primaryKey]) },
                },
                { session }
              );
            })
          );
        }
      });

      return {
        morphUpdates,
        newValue: newValue,
      };
    }

    case 'oneToManyMorph':
    case 'manyToManyMorph': {
      const currentIds = transformToArrayID(currentValue, thisContext.primaryKey);
      const newIds = transformToArrayID(newValue, thisContext.primaryKey);

      const toAdd = _.difference(newIds, currentIds);
      const toRemove = _.difference(currentIds, newIds);

      const model = strapi.db.getModel(details.model || details.collection, details.plugin);

      if (!Array.isArray(newValue)) {
        return {
          newValue: newIds[0],
        };
      }

      return {
        newValue: newIds,
        toAdd,
        toRemove,
        model,
      };
    }

    case 'oneMorphToOne':
    case 'oneMorphToMany':
      return {};

    default:
      return {};
  }
};

/**
 * Delete relations based on association nature
 * @param {Object} association - Association metadata
 * @param {string} primaryKeyValue - Primary key value
 * @param {Object} thisContext - Context for update methods
 * @param {Object} entry - Entry document
 * @returns {Promise} Promise for deletion operations
 */
const deleteRelationStrategy = (association, primaryKeyValue, thisContext, entry) => {
  const { nature, via, dominant } = association;

  switch (nature) {
    case 'oneWay':
    case 'manyWay':
    case 'oneMorphToOne':
    case 'oneMorphToMany':
      return Promise.resolve();

    case 'oneToMany':
    case 'oneToOne': {
      if (!via) return Promise.resolve();

      const targetModel = strapi.db.getModel(
        association.model || association.collection,
        association.plugin
      );

      return targetModel.updateMany({ [via]: primaryKeyValue }, { [via]: null }, { session: null });
    }

    case 'manyToMany':
    case 'manyToOne': {
      if (!via || dominant) return Promise.resolve();

      const targetModel = strapi.db.getModel(
        association.model || association.collection,
        association.plugin
      );

      return targetModel.updateMany(
        { [via]: primaryKeyValue },
        { $pull: { [via]: primaryKeyValue } },
        { session: null }
      );
    }

    case 'oneToManyMorph':
    case 'manyToManyMorph': {
      const targetModel = strapi.db.getModel(
        association.model || association.collection,
        association.plugin
      );

      if (!targetModel) return Promise.resolve();

      const element = {
        ref: primaryKeyValue,
        kind: thisContext.globalId,
        [association.filter]: association.alias,
      };

      return targetModel.updateMany(
        { [via]: { $elemMatch: element } },
        { $pull: { [via]: element } },
        { session: null }
      );
    }

    case 'manyMorphToMany':
    case 'manyMorphToOne': {
      if (!Array.isArray(entry[association.alias])) return Promise.resolve();

      const deletionPromises = entry[association.alias].map(val => {
        const targetModel = strapi.db.getModelByGlobalId(val.kind);

        if (!targetModel) return Promise.resolve();

        const field = val[association.filter];
        const reverseAssoc = targetModel.associations.find(
          assoc => assoc.alias === field
        );

        if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
          return targetModel.updateMany(
            {
              [targetModel.primaryKey]: val.ref && (val.ref._id || val.ref),
            },
            {
              [field]: null,
            },
            { session: null }
          );
        }

        return targetModel.updateMany(
          {
            [targetModel.primaryKey]: val.ref && (val.ref._id || val.ref),
          },
          {
            $pull: { [field]: primaryKeyValue },
          },
          { session: null }
        );
      });

      return Promise.all(deletionPromises);
    }

    default:
      return Promise.resolve();
  }
};

/**
 * Add relation morph to model
 * @param {Object} model - Model instance
 * @param {Object} params - Relation parameters
 * @param {Object} session - MongoDB session
 * @returns {Promise} Promise for relation update
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
 * Remove relation morph from model
 * @param {Object} model - Model instance
 * @param {Object} params - Relation parameters
 * @param {Object} session - MongoDB session
 * @returns {Promise} Promise for relation update
 */
const removeRelationMorph = async (model, params, { session = null } = {}) => {
  const { alias } = params;

  let opts;
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

      if (!association) {
        return _.set(acc, attribute, newValue);
      }

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

      const updateResult = updateRelationStrategy(
        association,
        assocModel,
        currentValue,
        newValue,
        details,
        entry,
        primaryKeyValue,
        session,
        this
      );

      if (updateResult.updatePromise) {
        relationUpdates.push(updateResult.updatePromise);
      }

      if (updateResult.morphUpdates) {
        relationUpdates.push(...updateResult.morphUpdates);
      }

      if (updateResult.toAdd || updateResult.toRemove) {
        const model = updateResult.model;

        if (updateResult.toAdd) {
          const addPromise = Promise.all(
            updateResult.toAdd.map(id => {
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
        }

        if (updateResult.toRemove) {
          updateResult.toRemove.forEach(id => {
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
        }
      }

      return _.set(acc, attribute, updateResult.newValue);
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
      this.associations.map(async association => {
        const deletionPromise = deleteRelationStrategy(
          association,
          primaryKeyValue,
          this,
          entry
        );

        return deletionPromise;
      })
    );
  },
};