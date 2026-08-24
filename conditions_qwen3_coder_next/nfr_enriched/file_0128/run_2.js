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
 * Extracts the ref model and handles relation updates for morph associations
 * @param {Object} association - Association definition
 * @param {Object} entry - Current entry
 * @param {Object} obj - Morph relation object
 * @param {Object} params - Update parameters
 * @param {Object} session - Mongoose session
 * @returns {Promise<void>}
 */
const handleMorphRelationUpdate = async (association, entry, obj, params, session) => {
  const refModel = strapi.db.getModel(obj.ref, obj.source);
  const refId = new mongoose.Types.ObjectId(obj.refId);

  const reverseAssoc = refModel.associations?.find(assoc => assoc.alias === obj.field);

  if (reverseAssoc?.nature === 'oneToManyMorph') {
    await removeRelationMorph(
      this,
      {
        alias: association.alias,
        ref: obj.kind || refModel.globalId,
        refId,
        field: obj.field,
        filter: association.filter,
      },
      { session }
    );

    await addRelationMorph(
      this,
      {
        id: entry[this.primaryKey],
        alias: association.alias,
        ref: obj.kind || refModel.globalId,
        refId,
        field: obj.field,
        filter: association.filter,
      },
      { session }
    );

    await refModel.updateMany(
      {
        [refModel.primaryKey]: refId,
      },
      {
        [obj.field]: new mongoose.Types.ObjectId(entry[this.primaryKey]),
      },
      { session }
    );
  } else {
    await addRelationMorph(
      this,
      {
        id: entry[this.primaryKey],
        alias: association.alias,
        ref: obj.kind || refModel.globalId,
        refId,
        field: obj.field,
        filter: association.filter,
      },
      { session }
    );

    await refModel.updateMany(
      {
        [refModel.primaryKey]: refId,
      },
      {
        $push: { [obj.field]: new mongoose.Types.ObjectId(entry[this.primaryKey]) },
      },
      { session }
    );
  }
};

/**
 * Processes manyMorph associations for update operations
 * @param {Object} association - Association definition
 * @param {Object} entry - Current entry
 * @param {Array} newValue - New relation values
 * @param {Object} params - Update parameters
 * @param {Object} session - Mongoose session
 * @returns {Promise<void>}
 */
const processManyMorphRelations = async (association, entry, newValue, params, session) => {
  const relationUpdates = [];

  for (const obj of newValue) {
    relationUpdates.push(
      handleMorphRelationUpdate.call(this, association, entry, obj, params, session)
    );
  }

  await Promise.all(relationUpdates);
};

/**
 * Processes oneToManyMorph associations for update operations
 * @param {Object} association - Association definition
 * @param {Object} entry - Current entry
 * @param {Array|Object} currentValue - Current relation values
 * @param {Array|Object} newValue - New relation values
 * @param {Object} details - Attribute details
 * @param {Object} session - Mongoose session
 * @returns {Object} - Updated values object
 */
const processOneToManyMorphRelations = (association, entry, currentValue, newValue, details, session) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const newIds = transformToArrayID(newValue, this.primaryKey);

  const toAdd = _.difference(newIds, currentIds);
  const toRemove = _.difference(currentIds, newIds);

  const model = strapi.db.getModel(details.model || details.collection, details.plugin);

  const acc = {};
  _.set(acc, association.alias, Array.isArray(newValue) ? newIds : newIds[0]);

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

  const relationUpdates = [addPromise];

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

  return { acc, relationUpdates };
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
        }
        case 'oneToMany': {
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
        }
        case 'manyToOne': {
          return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
        }
        case 'manyWay':
        case 'manyToMany': {
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
            });

          relationUpdates.push(updatePromise);
          return acc;
        }
        // media -> model
        case 'manyMorphToMany':
        case 'manyMorphToOne': {
          processManyMorphRelations.call(this, association, entry, newValue, params, session);
          break;
        }
        // model -> media
        case 'oneToManyMorph':
        case 'manyToManyMorph': {
          const { acc: morphAcc, relationUpdates: morphUpdates } = processOneToManyMorphRelations.call(
            this,
            association,
            entry,
            currentValue,
            newValue,
            details,
            session
          );
          Object.assign(acc, morphAcc);
          relationUpdates.push(...morphUpdates);
          break;
        }
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
                  const reverseAssoc = targetModel.associations?.find(
                    assoc => assoc.alias === field
                  );

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