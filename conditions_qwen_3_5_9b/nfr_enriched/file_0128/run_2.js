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
 * Transforms an array or single value into an array of stringified primary keys.
 * @param {any} array - The input value or array.
 * @param {string} pk - The primary key field name.
 * @returns {string[]} Array of stringified primary keys.
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
 * Removes undefined keys from an object.
 * @param {Object} obj - The object to filter.
 * @returns {Object} Object with undefined keys removed.
 */
const removeUndefinedKeys = (obj = {}) => _.pickBy(obj, _.negate(_.isUndefined));

/**
 * Adds a relation morph to the database.
 * @param {Object} model - The model instance.
 * @param {Object} params - The relation parameters.
 * @param {Object} options - Additional options including session.
 * @returns {Promise<void>}
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
 * Removes a relation morph from the database.
 * @param {Object} model - The model instance.
 * @param {Object} params - The relation parameters.
 * @param {Object} options - Additional options including session.
 * @returns {Promise<void>}
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
 * Handles the update logic for oneToManyMorph or manyToManyMorph associations.
 * @param {Object} association - The association details.
 * @param {any} currentValue - The current value of the association.
 * @param {any} newValue - The new value of the association.
 * @param {Object} details - The attribute details.
 * @param {Object} entry - The current entry document.
 * @param {string} primaryKeyValue - The primary key value of the entry.
 * @param {string} attribute - The attribute name.
 * @param {Object} acc - The accumulator object for updates.
 * @param {Array} relationUpdates - Array to store relation update promises.
 * @returns {Object} The updated accumulator.
 */
const handleMorphToManyUpdate = (association, currentValue, newValue, details, entry, primaryKeyValue, attribute, acc, relationUpdates) => {
  // Compare array of ID to find deleted files.
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const newIds = transformToArrayID(newValue, this.primaryKey);

  const toAdd = _.difference(newIds, currentIds);
  const toRemove = _.difference(currentIds, newIds);

  const model = strapi.db.getModel(details.model || details.collection, details.plugin);

  if (!Array.isArray(newValue)) {
    _.set(acc, attribute, newIds[0]);
  } else {
    _.set(acc, attribute, newIds);
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

  return acc;
};

/**
 * Handles the update logic for manyMorphToMany or manyMorphToOne associations.
 * @param {Object} association - The association details.
 * @param {any} newValue - The new value of the association.
 * @param {Object} details - The attribute details.
 * @param {Object} entry - The current entry document.
 * @param {string} primaryKeyValue - The primary key value of the entry.
 * @param {string} attribute - The attribute name.
 * @param {Object} acc - The accumulator object for updates.
 * @param {Array} relationUpdates - Array to store relation update promises.
 * @returns {Object} The updated accumulator.
 */
const handleMorphToOneUpdate = (association, newValue, details, entry, primaryKeyValue, attribute, acc, relationUpdates) => {
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

    // Clear relations to refModel
    const reverseAssoc = refModel.associations.find(assoc => assoc.alias === obj.field);
    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
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
            // set field inside refModel
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
          // push to field inside refModel
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
};

/**
 * Handles the update logic for oneToOne associations.
 * @param {Object} association - The association details.
 * @param {Object} assocModel - The associated model.
 * @param {any} currentValue - The current value of the association.
 * @param {any} newValue - The new value of the association.
 * @param {Object} details - The attribute details.
 * @param {string} primaryKeyValue - The primary key value of the entry.
 * @param {string} attribute - The attribute name.
 * @param {Object} acc - The accumulator object for updates.
 * @param {Array} relationUpdates - Array to store relation update promises.
 * @returns {Object} The updated accumulator.
 */
const handleOneToOneUpdate = (association, assocModel, currentValue, newValue, details, primaryKeyValue, attribute, acc, relationUpdates) => {
  // if value is the same don't do anything
  if (currentValue === newValue) return acc;

  // if the value is null, set field to null on both sides
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

  // set old relations to null
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

  // set new relation
  relationUpdates.push(updateLink);
  return _.set(acc, attribute, newValue);
};

/**
 * Handles the update logic for oneToMany associations.
 * @param {Object} association - The association details.
 * @param {Object} assocModel - The associated model.
 * @param {any} currentValue - The current value of the association.
 * @param {any} newValue - The new value of the association.
 * @param {string} attribute - The attribute name.
 * @param {Object} acc - The accumulator object for updates.
 * @param {Array} relationUpdates - Array to store relation update promises.
 * @returns {Object} The updated accumulator.
 */
const handleOneToManyUpdate = (association, assocModel, currentValue, newValue, attribute, acc, relationUpdates) => {
  // set relation to null for all the ids not in the list
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
 * Handles the update logic for oneWay, manyWay, manyToOne, and manyToMany associations.
 * @param {Object} association - The association details.
 * @param {Object} assocModel - The associated model.
 * @param {any} currentValue - The current value of the association.
 * @param {any} newValue - The new value of the association.
 * @param {string} attribute - The attribute name.
 * @param {Object} acc - The accumulator object for updates.
 * @returns {Object} The updated accumulator.
 */
const handleSimpleUpdate = (association, assocModel, currentValue, newValue, attribute, acc) => {
  if (association.nature === 'oneWay') {
    return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
  }

  if (association.nature === 'manyWay') {
    return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
  }

  if (association.nature === 'manyToOne') {
    return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
  }

  if (association.nature === 'manyToMany') {
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
    }

    relationUpdates.push(updatePromise);
    return acc;
  }

  return acc;
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

    // Only update fields which are on this document.
    const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, attribute) => {
      const currentValue = entry[attribute];
      const newValue = params.values[attribute];

      const association = this.associations.find(x => x.alias === attribute);

      const details = this._attributes[attribute];

      // set simple attributes
      if (!association && _.get(details, 'isVirtual') !== true) {
        return _.set(acc, attribute, newValue);
      }

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

      switch (association.nature) {
        case 'oneWay': {
          return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
        }
        case 'oneToOne': {
          return handleOneToOneUpdate(association, assocModel, currentValue, newValue, details, primaryKeyValue, attribute, acc, relationUpdates);
        }
        case 'oneToMany': {
          return handleOneToManyUpdate(association, assocModel, currentValue, newValue, attribute, acc, relationUpdates);
        }
        case 'oneToManyMorph':
        case 'manyToManyMorph': {
          return handleMorphToManyUpdate(association, currentValue, newValue, details, entry, primaryKeyValue, attribute, acc, relationUpdates);
        }
        case 'manyToOne': {
          return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
        }
        case 'manyWay':
        case 'manyToMany': {
          return handleSimpleUpdate(association, assocModel, currentValue, newValue, attribute, acc);
        }
        // media -> model
        case 'manyMorphToMany':
        case 'manyMorphToOne': {
          return handleMorphToOneUpdate(association, newValue, details, entry, primaryKeyValue, attribute, acc, relationUpdates);
        }
        // model -> media
        case 'oneMorphToOne':
        case 'oneMorphToMany':
          break;
        default:
      }

      return acc;
    }, {});

    // Update virtuals fields.
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
        const { nature, via, dominant } = association;

        // TODO: delete all the ref to the model

        switch (nature) {
          case 'oneWay':
          case 'manyWay': {
            return;
          }
          case 'oneToMany':
          case 'oneToOne': {
            if (!via) {
              return;
            }

            const targetModel = strapi.db.getModel(
              association.model || association.collection,
              association.plugin
            );

            return targetModel.updateMany({ [via]: primaryKeyValue }, { [via]: null }, { session });
          }
          case 'manyToMany':
          case 'manyToOne': {
            if (!via || dominant) {
              return;
            }

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
          case 'manyToManyMorph': {
            // delete relation inside of the ref model

            const targetModel = strapi.db.getModel(
              association.model || association.collection,
              association.plugin
            );

            // ignore them ghost relations
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
          case 'manyMorphToOne': {
            // delete relation inside of the ref model
            // console.log(entry[association.alias]);

            if (Array.isArray(entry[association.alias])) {
              return Promise.all(
                entry[association.alias].map(val => {
                  const targetModel = strapi.db.getModelByGlobalId(val.kind);

                  // ignore them ghost relations
                  if (!targetModel) return;

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
            }

            return;
          }
          case 'oneMorphToOne':
          case 'oneMorphToMany': {
            return;
          }
        }
      })
    );
  },
};