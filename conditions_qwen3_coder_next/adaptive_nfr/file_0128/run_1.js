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
 * Process relation for one-way association
 * @param {Object} acc - Accumulator object
 * @param {Object} entry - Current entry
 * @param {Object} newValue - New value for attribute
 * @param {Object} assocModel - Association model
 * @returns {Object} - Updated accumulator
 */
const processOneWay = (acc, entry, newValue, assocModel) => {
  return _.set(acc, entry.attribute, _.get(newValue, assocModel.primaryKey, newValue));
};

/**
 * Process relation for one-to-one association
 * @param {Object} acc - Accumulator object
 * @param {Object} entry - Current entry
 * @param {Object} newValue - New value for attribute
 * @param {Object} assocModel - Association model
 * @param {Object} details - Attribute details
 * @param {String} primaryKeyValue - Primary key value
 * @param {Object} session - Mongoose session
 * @returns {Object} - Updated accumulator
 */
const processOneToOne = async (acc, entry, newValue, assocModel, details, primaryKeyValue, session) => {
  const currentValue = entry.currentValue;

  if (currentValue === newValue) {
    return acc;
  }

  if (_.isNull(newValue)) {
    const updatePromise = assocModel.updateOne(
      {
        [assocModel.primaryKey]: getValuePrimaryKey(currentValue, assocModel.primaryKey),
      },
      { [details.via]: null },
      { session }
    );

    acc.relationUpdates.push(updatePromise);
    return _.set(acc.accumulator, entry.attribute, null);
  }

  const updateLink = this.updateOne(
    { [entry.attribute]: new mongoose.Types.ObjectId(newValue) },
    { [entry.attribute]: null },
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

  acc.relationUpdates.push(updateLink);
  return _.set(acc.accumulator, entry.attribute, newValue);
};

/**
 * Process relation for one-to-many association
 * @param {Object} acc - Accumulator object
 * @param {Object} entry - Current entry
 * @param {Array} newValue - New values for attribute
 * @param {Object} assocModel - Association model
 * @param {Object} details - Attribute details
 * @param {String} primaryKeyValue - Primary key value
 * @param {Object} session - Mongoose session
 * @returns {Object} - Updated accumulator
 */
const processOneToMany = async (acc, entry, newValue, assocModel, details, primaryKeyValue, session) => {
  const attributeIds = entry.currentValue;

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

  acc.relationUpdates.push(updatePromise);
  return acc.accumulator;
};

/**
 * Process relation for many-to-one association
 * @param {Object} acc - Accumulator object
 * @param {Object} entry - Current entry
 * @param {Object} newValue - New value for attribute
 * @param {Object} assocModel - Association model
 * @returns {Object} - Updated accumulator
 */
const processManyToOne = (acc, entry, newValue, assocModel) => {
  return _.set(acc.accumulator, entry.attribute, _.get(newValue, assocModel.primaryKey, newValue));
};

/**
 * Process relation for many-to-many or many-way association
 * @param {Object} acc - Accumulator object
 * @param {Object} entry - Current entry
 * @param {Array} newValue - New values for attribute
 * @param {Object} association - Association definition
 * @param {Object} assocModel - Association model
 * @param {String} primaryKeyValue - Primary key value
 * @param {Object} session - Mongoose session
 * @returns {Object} - Updated accumulator
 */
const processManyToMany = async (acc, entry, newValue, association, assocModel, primaryKeyValue, session) => {
  if (association.dominant) {
    return _.set(
      acc.accumulator,
      entry.attribute,
      newValue ? newValue.map(val => val[assocModel.primaryKey] || val) : newValue
    );
  }

  const updatePromise = assocModel
    .updateMany(
      {
        [assocModel.primaryKey]: {
          $in: entry.currentValue.map(
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

  acc.relationUpdates.push(updatePromise);
  return acc.accumulator;
};

/**
 * Process relation for many-morph associations
 * @param {Object} acc - Accumulator object
 * @param {Object} entry - Current entry
 * @param {Array} newValue - New values for attribute
 * @param {Object} association - Association definition
 * @param {Object} session - Mongoose session
 * @returns {Object} - Updated accumulator
 */
const processManyMorphRelations = async (acc, entry, newValue, association, session) => {
  for (const obj of newValue) {
    const refModel = strapi.db.getModel(obj.ref, obj.source);

    const createRelation = () => {
      return addRelationMorph(
        this,
        {
          id: entry.entry[this.primaryKey],
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
      acc.relationUpdates.push(
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
            return refModel.updateMany(
              {
                [refModel.primaryKey]: new mongoose.Types.ObjectId(obj.refId),
              },
              {
                [obj.field]: new mongoose.Types.ObjectId(entry.entry[this.primaryKey]),
              },
              { session }
            );
          })
      );
    } else {
      acc.relationUpdates.push(
        createRelation().then(() => {
          return refModel.updateMany(
            {
              [refModel.primaryKey]: new mongoose.Types.ObjectId(obj.refId),
            },
            {
              $push: { [obj.field]: new mongoose.Types.ObjectId(entry.entry[this.primaryKey]) },
            },
            { session }
          );
        })
      );
    }
  }

  return acc.accumulator;
};

/**
 * Process relation for one-to-many morph and many-to-many morph associations
 * @param {Object} acc - Accumulator object
 * @param {Object} entry - Current entry
 * @param {Array} newValue - New values for attribute
 * @param {Object} association - Association definition
 * @param {Object} details - Attribute details
 * @param {String} primaryKeyValue - Primary key value
 * @param {Object} session - Mongoose session
 * @returns {Object} - Updated accumulator
 */
const processMorphRelations = async (acc, entry, newValue, association, details, primaryKeyValue, session) => {
  const currentIds = transformToArrayID(entry.currentValue, this.primaryKey);
  const newIds = transformToArrayID(newValue, this.primaryKey);

  const toAdd = _.difference(newIds, currentIds);
  const toRemove = _.difference(currentIds, newIds);

  const model = strapi.db.getModel(details.model || details.collection, details.plugin);

  _.set(acc.accumulator, entry.attribute, Array.isArray(newValue) ? newIds : newIds[0]);

  const addPromise = Promise.all(
    toAdd.map(id => {
      return addRelationMorph(
        model,
        {
          id,
          alias: association.via,
          ref: this.globalId,
          refId: entry.entry._id,
          field: association.alias,
          filter: association.filter,
        },
        { session }
      );
    })
  );

  acc.relationUpdates.push(addPromise);

  toRemove.forEach(id => {
    acc.relationUpdates.push(
      removeRelationMorph(
        model,
        {
          id,
          alias: association.via,
          ref: this.globalId,
          refId: entry.entry._id,
          field: association.alias,
          filter: association.filter,
        },
        { session }
      )
    );
  });

  return acc.accumulator;
};

/**
 * Process relation for one-morph associations
 * @param {Object} acc - Accumulator object
 * @param {Object} entry - Current entry
 * @returns {Object} - Updated accumulator
 */
const processOneMorphRelations = (acc, entry) => {
  return acc.accumulator;
};

/**
 * Main update logic parser with reduced complexity
 * @param {Object} acc - Accumulator object
 * @param {Object} association - Association definition
 * @param {Object} entry - Current entry object with attribute, currentValue
 * @param {Object} newValue - New value for attribute
 * @param {Object} assocModel - Association model
 * @param {Object} details - Attribute details
 * @param {String} primaryKeyValue - Primary key value
 * @param {Object} session - Mongoose session
 * @returns {Object} - Updated accumulator
 */
const processAssociation = async (acc, association, entry, newValue, assocModel, details, primaryKeyValue, session) => {
  const createAccumulator = () => ({ accumulator: acc, relationUpdates: acc.relationUpdates });

  switch (association.nature) {
    case 'oneWay':
      return processOneWay(createAccumulator(), entry, newValue, assocModel);

    case 'oneToOne':
      return processOneToOne(createAccumulator(), entry, newValue, assocModel, details, primaryKeyValue, session);

    case 'oneToMany':
      return processOneToMany(createAccumulator(), entry, newValue, assocModel, details, primaryKeyValue, session);

    case 'manyToOne':
      return processManyToOne(createAccumulator(), entry, newValue, assocModel);

    case 'manyWay':
    case 'manyToMany':
      return processManyToMany(createAccumulator(), entry, newValue, association, assocModel, primaryKeyValue, session);

    case 'manyMorphToMany':
    case 'manyMorphToOne':
      return processManyMorphRelations(createAccumulator(), entry, newValue, association, session);

    case 'oneToManyMorph':
    case 'manyToManyMorph':
      return processMorphRelations(createAccumulator(), entry, newValue, association, details, primaryKeyValue, session);

    case 'oneMorphToOne':
    case 'oneMorphToMany':
      return processOneMorphRelations(createAccumulator(), entry);

    default:
      return acc;
  }
};

/**
 * Process associations for relation updates
 * @param {Object} params - Update parameters
 * @param {Object} session - Mongoose session
 * @returns {Object} - Updated entity
 */
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

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

      const associationEntry = {
        attribute,
        currentValue,
        entry,
      };

      return processAssociation({ accumulator: acc, relationUpdates }, association, associationEntry, newValue, assocModel, details, primaryKeyValue, session);
    }, { accumulator: {}, relationUpdates });

    await Promise.all(values.relationUpdates).then(() =>
      this.updateOne({ [this.primaryKey]: primaryKeyValue }, values.accumulator, {
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
          case 'manyMorphToOne': {
            if (Array.isArray(entry[association.alias])) {
              return Promise.all(
                entry[association.alias].map(val => {
                  const targetModel = strapi.db.getModelByGlobalId(val.kind);

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