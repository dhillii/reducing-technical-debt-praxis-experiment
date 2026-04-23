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
 * Transform an array or single value into an array of stringified primary keys.
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
 * Remove undefined keys from an object.
 * @param {Object} obj - The object to filter.
 * @returns {Object} Object with undefined keys removed.
 */
const removeUndefinedKeys = (obj = {}) => _.pickBy(obj, _.negate(_.isUndefined));

/**
 * Add a relation morph to the database.
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
 * Remove a relation morph from the database.
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
 * Handle update logic for oneWay associations.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} newValue - The new value.
 * @param {Object} assocModel - The associated model.
 * @returns {Object} Updated accumulator.
 */
const handleOneWayUpdate = (acc, attribute, newValue, assocModel) => {
  return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
};

/**
 * Handle update logic for manyWay and manyToOne associations.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} newValue - The new value.
 * @param {Object} assocModel - The associated model.
 * @returns {Object} Updated accumulator.
 */
const handleManyWayUpdate = (acc, attribute, newValue, assocModel) => {
  return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
};

/**
 * Handle update logic for oneToOne associations.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {any} newValue - The new value.
 * @param {Object} assocModel - The associated model.
 * @param {Object} details - Attribute details.
 * @param {Object} session - Database session.
 * @param {Function} updateOne - The updateOne method.
 * @returns {Object} Updated accumulator.
 */
const handleOneToOneUpdate = (acc, attribute, currentValue, newValue, assocModel, details, session, updateOne) => {
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

    return updatePromise.then(() => _.set(acc, attribute, null));
  }

  // set old relations to null
  const updateLink = updateOne(
    { [attribute]: new mongoose.Types.ObjectId(newValue) },
    { [attribute]: null },
    { session }
  ).then(() => {
    return assocModel.updateOne(
      {
        [this.primaryKey]: new mongoose.Types.ObjectId(newValue),
      },
      { [details.via]: this.primaryKey },
      { session }
    );
  });

  // set new relation
  return updateLink.then(() => _.set(acc, attribute, newValue));
};

/**
 * Handle update logic for oneToMany associations.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {any} newValue - The new value.
 * @param {Object} assocModel - The associated model.
 * @param {Object} details - Attribute details.
 * @param {Object} session - Database session.
 * @param {Function} updateMany - The updateMany method.
 * @returns {Object} Updated accumulator.
 */
const handleOneToManyUpdate = (acc, attribute, currentValue, newValue, assocModel, details, session, updateMany) => {
  // set relation to null for all the ids not in the list
  const attributeIds = currentValue;
  const toRemove = _.differenceWith(attributeIds, newValue, (a, b) => {
    return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
  });

  const updatePromise = updateMany(
    {
      [assocModel.primaryKey]: {
        $in: toRemove.map(
          val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)
        ),
      },
    },
    { [details.via]: null },
    { session }
  ).then(() => {
    return updateMany(
      {
        [assocModel.primaryKey]: {
          $in: newValue.map(
            val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)
          ),
        },
      },
      { [details.via]: this.primaryKey },
      { session }
    );
  });

  return updatePromise.then(() => acc);
};

/**
 * Handle update logic for manyToMany associations.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} newValue - The new value.
 * @param {Object} association - The association object.
 * @param {Object} assocModel - The associated model.
 * @param {Object} session - Database session.
 * @param {Function} updateMany - The updateMany method.
 * @returns {Object} Updated accumulator.
 */
const handleManyToManyUpdate = (acc, attribute, newValue, association, assocModel, session, updateMany) => {
  if (association.dominant) {
    return _.set(
      acc,
      attribute,
      newValue ? newValue.map(val => val[assocModel.primaryKey] || val) : newValue
    );
  }

  const updatePromise = updateMany(
    {
      [assocModel.primaryKey]: {
        $in: newValue.map(
          val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)
        ),
      },
    },
    {
      $pull: {
        [association.via]: new mongoose.Types.ObjectId(this.primaryKey),
      },
    },
    { session }
  ).then(() => {
    return updateMany(
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
        $addToSet: { [association.via]: [this.primaryKey] },
      },
      { session }
    );
  });

  return updatePromise.then(() => acc);
};

/**
 * Handle update logic for manyMorphToMany and manyMorphToOne associations.
 * @param {Object} relationUpdates - Array of update promises.
 * @param {Object} entry - The entry object.
 * @param {string} primaryKey - The primary key value.
 * @param {string} association - The association object.
 * @param {Object} obj - The object in the new value array.
 * @param {Object} refModel - The referenced model.
 * @param {Object} session - Database session.
 * @param {Function} addRelationMorph - The addRelationMorph function.
 * @param {Function} removeRelationMorph - The removeRelationMorph function.
 * @param {Function} updateMany - The updateMany method.
 * @returns {Promise<void>}
 */
const handleMorphToManyUpdate = async (
  relationUpdates,
  entry,
  primaryKey,
  association,
  obj,
  refModel,
  session,
  addRelationMorph,
  removeRelationMorph,
  updateMany
) => {
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
          return updateMany(
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
        return updateMany(
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
};

/**
 * Handle update logic for oneToManyMorph and manyToManyMorph associations.
 * @param {Object} acc - Accumulator object.
 * @param {string} attribute - The attribute name.
 * @param {any} currentValue - The current value.
 * @param {any} newValue - The new value.
 * @param {Object} association - The association object.
 * @param {Object} details - Attribute details.
 * @param {Object} session - Database session.
 * @param {Function} addRelationMorph - The addRelationMorph function.
 * @param {Function} removeRelationMorph - The removeRelationMorph function.
 * @param {Function} updateMany - The updateMany method.
 * @returns {Object} Updated accumulator.
 */
const handleMorphToManyModelUpdate = (
  acc,
  attribute,
  currentValue,
  newValue,
  association,
  details,
  session,
  addRelationMorph,
  removeRelationMorph,
  updateMany
) => {
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
          return handleOneWayUpdate(acc, attribute, newValue, assocModel);
        }
        case 'oneToOne': {
          return handleOneToOneUpdate(acc, attribute, currentValue, newValue, assocModel, details, session, this.updateOne);
        }
        case 'oneToMany': {
          return handleOneToManyUpdate(acc, attribute, currentValue, newValue, assocModel, details, session, this.updateMany);
        }
        case 'manyToOne': {
          return handleManyWayUpdate(acc, attribute, newValue, assocModel);
        }
        case 'manyWay':
        case 'manyToMany': {
          return handleManyToManyUpdate(acc, attribute, newValue, association, assocModel, session, this.updateMany);
        }
        // media -> model
        case 'manyMorphToMany':
        case 'manyMorphToOne': {
          newValue.forEach(obj => {
            const refModel = strapi.db.getModel(obj.ref, obj.source);

            handleMorphToManyUpdate(
              relationUpdates,
              entry,
              this.primaryKey,
              association,
              obj,
              refModel,
              session,
              addRelationMorph,
              removeRelationMorph,
              this.updateMany
            );
          });
          break;
        }
        // model -> media
        case 'oneToManyMorph':
        case 'manyToManyMorph': {
          return handleMorphToManyModelUpdate(
            acc,
            attribute,
            currentValue,
            newValue,
            association,
            details,
            session,
            addRelationMorph,
            removeRelationMorph,
            this.updateMany
          );
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