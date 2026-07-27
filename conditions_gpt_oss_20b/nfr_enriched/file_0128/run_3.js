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
 * Transform a value or array of values into an array of string IDs.
 *
 * @param {any} array - The value or array of values to transform.
 * @param {string} pk - The primary key field name.
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
 * @param {Object} options - Options object.
 * @param {Object|null} options.session - Mongoose session.
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
 * Remove a morph relation from a model.
 *
 * @param {Object} model - The Mongoose model.
 * @param {Object} params - Parameters for the relation.
 * @param {Object} options - Options object.
 * @param {Object|null} options.session - Mongoose session.
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
 * Handle one-way association updates.
 *
 * @param {string} attribute - Attribute name.
 * @param {any} newValue - New value for the attribute.
 * @param {Object} assocModel - Associated model.
 * @param {Object} acc - Accumulator object.
 * @returns {Object} Updated accumulator.
 */
const handleOneWay = (attribute, newValue, assocModel, acc) => {
  return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
};

/**
 * Handle one-to-one association updates.
 *
 * @param {string} attribute - Attribute name.
 * @param {any} currentValue - Current value of the attribute.
 * @param {any} newValue - New value for the attribute.
 * @param {Object} assocModel - Associated model.
 * @param {Object} details - Attribute details.
 * @param {any} primaryKeyValue - Primary key of the current entry.
 * @param {Object|null} session - Mongoose session.
 * @param {Array} relationUpdates - Array to push relation promises.
 * @returns {Object} Updated accumulator.
 */
const handleOneToOne = async (
  attribute,
  currentValue,
  newValue,
  assocModel,
  details,
  primaryKeyValue,
  session,
  relationUpdates,
  acc
) => {
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
};

/**
 * Handle one-to-many association updates.
 *
 * @param {string} attribute - Attribute name.
 * @param {Array} currentValue - Current array of related IDs.
 * @param {Array} newValue - New array of related IDs.
 * @param {Object} assocModel - Associated model.
 * @param {Object} details - Attribute details.
 * @param {any} primaryKeyValue - Primary key of the current entry.
 * @param {Object|null} session - Mongoose session.
 * @param {Array} relationUpdates - Array to push relation promises.
 * @returns {Object} Updated accumulator.
 */
const handleOneToMany = async (
  attribute,
  currentValue,
  newValue,
  assocModel,
  details,
  primaryKeyValue,
  session,
  relationUpdates,
  acc
) => {
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
 * Handle many-to-one association updates.
 *
 * @param {string} attribute - Attribute name.
 * @param {any} newValue - New value for the attribute.
 * @param {Object} assocModel - Associated model.
 * @returns {Object} Updated accumulator.
 */
const handleManyToOne = (attribute, newValue, assocModel, acc) => {
  return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
};

/**
 * Handle many-to-many or many-way association updates.
 *
 * @param {string} attribute - Attribute name.
 * @param {Array} currentValue - Current array of related IDs.
 * @param {Array} newValue - New array of related IDs.
 * @param {Object} assocModel - Associated model.
 * @param {Object} association - Association definition.
 * @param {any} primaryKeyValue - Primary key of the current entry.
 * @param {Object|null} session - Mongoose session.
 * @param {Array} relationUpdates - Array to push relation promises.
 * @returns {Object} Updated accumulator.
 */
const handleManyWay = async (
  attribute,
  currentValue,
  newValue,
  assocModel,
  association,
  primaryKeyValue,
  session,
  relationUpdates,
  acc
) => {
  if (association.dominant) {
    return _.set(
      acc,
      attribute,
      newValue ? newValue.map(val => val[assocModel.primaryKey] || val) : newValue
    );
  }

  const updatePomise = assocModel
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

  relationUpdates.push(updatePomise);
  return acc;
};

/**
 * Handle many-morph-to-many association updates.
 *
 * @param {string} attribute - Attribute name.
 * @param {Array} currentValue - Current array of related objects.
 * @param {Array} newValue - New array of related objects.
 * @param {Object} assocModel - Associated model.
 * @param {Object} details - Attribute details.
 * @param {any} primaryKeyValue - Primary key of the current entry.
 * @param {Object|null} session - Mongoose session.
 * @param {Array} relationUpdates - Array to push relation promises.
 * @returns {Object} Updated accumulator.
 */
const handleManyMorphToMany = async (
  attribute,
  currentValue,
  newValue,
  assocModel,
  details,
  primaryKeyValue,
  session,
  relationUpdates,
  acc
) => {
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
    if (reverseAssoc?.nature === 'oneToManyMorph') {
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
 * Handle one-to-many-morph or many-to-many-morph association updates.
 *
 * @param {string} attribute - Attribute name.
 * @param {Array} currentValue - Current array of related IDs.
 * @param {Array} newValue - New array of related IDs.
 * @param {Object} details - Attribute details.
 * @param {any} primaryKeyValue - Primary key of the current entry.
 * @param {Object|null} session - Mongoose session.
 * @param {Array} relationUpdates - Array to push relation promises.
 * @returns {Object} Updated accumulator.
 */
const handleOneToManyMorph = async (
  attribute,
  currentValue,
  newValue,
  details,
  primaryKeyValue,
  session,
  relationUpdates,
  acc
) => {
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
 * Process all attributes of an entry and collect relation updates.
 *
 * @param {Object} entry - The current entry document.
 * @param {Object} params - Parameters containing values to update.
 * @param {Object|null} session - Mongoose session.
 * @returns {Promise<{values: Object, relationUpdates: Array}>}
 */
const processAttributes = async (entry, params, session) => {
  const values = Object.keys(removeUndefinedKeys(params.values)).reduce(async (accPromise, attribute) => {
    const acc = await accPromise;
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
      case 'oneWay':
        return handleOneWay(attribute, newValue, assocModel, acc);

      case 'oneToOne':
        return handleOneToOne(
          attribute,
          currentValue,
          newValue,
          assocModel,
          details,
          getValuePrimaryKey(entry, this.primaryKey),
          session,
          relationUpdates,
          acc
        );

      case 'oneToMany':
        return handleOneToMany(
          attribute,
          currentValue,
          newValue,
          assocModel,
          details,
          getValuePrimaryKey(entry, this.primaryKey),
          session,
          relationUpdates,
          acc
        );

      case 'manyToOne':
        return handleManyToOne(attribute, newValue, assocModel, acc);

      case 'manyWay':
      case 'manyToMany':
        return handleManyWay(
          attribute,
          currentValue,
          newValue,
          assocModel,
          association,
          getValuePrimaryKey(entry, this.primaryKey),
          session,
          relationUpdates,
          acc
        );

      case 'manyMorphToMany':
      case 'manyMorphToOne':
        return handleManyMorphToMany(
          attribute,
          currentValue,
          newValue,
          assocModel,
          details,
          getValuePrimaryKey(entry, this.primaryKey),
          session,
          relationUpdates,
          acc
        );

      case 'oneToManyMorph':
      case 'manyToManyMorph':
        return handleOneToManyMorph(
          attribute,
          currentValue,
          newValue,
          details,
          getValuePrimaryKey(entry, this.primaryKey),
          session,
          relationUpdates,
          acc
        );

      case 'oneMorphToOne':
      case 'oneMorphToMany':
        return acc;

      default:
        return acc;
    }
  }, Promise.resolve({}));

  return { values, relationUpdates };
};

module.exports = {
  async update(params, { session = null } = {}) {
    const populate = this.associations.map(x => x.alias);
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);

    const entry = await this.findOne({ [this.primaryKey]: primaryKeyValue })
      .session(session)
      .populate(populate)
      .lean();

    const { values, relationUpdates } = await processAttributes.call(this, entry, params, session);

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