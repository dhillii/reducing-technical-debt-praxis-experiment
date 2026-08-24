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

/**
 * Adds a morph relation to model
 * @param {Object} model - The model to update
 * @param {Object} params - Relation parameters
 * @param {Object} options - Session options
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
 * Removes a morph relation from model
 * @param {Object} model - The model to update
 * @param {Object} params - Relation parameters
 * @param {Object} options - Session options
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
 * Extracted method to handle 'manyMorph*' relationship updates
 * @param {Object} association - Association definition
 * @param {Object} newValue - New relationship data
 * @param {Object} entry - Current entry
 */
const handleManyMorphRelations = async (association, newValue, entry, { session = null }) => {
  const relationUpdates = [];
  newValue.forEach(obj => {
    const refModel = strapi.db.getModel(obj.ref, obj.source);
    const refId = new mongoose.Types.ObjectId(obj.refId);

    const createRelation = () => {
      return addRelationMorph(
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
    };

    const reverseAssoc = refModel.associations.find(assoc => assoc.alias === obj.field);

    const processRemoveAndSet = () => {
      return removeRelationMorph(
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
    };

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      relationUpdates.push(
        processRemoveAndSet()
          .then(createRelation)
          .then(() => {
            return refModel.updateMany(
              {
                [refModel.primaryKey]: refId,
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
              [refModel.primaryKey]: refId,
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

  return relationUpdates;
};

/**
 * Extracted method to handle morph relations when deleting entries
 * @param {Object} association - Association definition
 * @param {Object} entry - Entry to clean relations for
 */
const handleMorphDeletion = async (association, entry, { session = null }) => {
  const targetModel = strapi.db.getModel(
    association.model || association.collection,
    association.plugin
  );

  if (!targetModel) return;

  const element = {
    ref: entry[this.primaryKey],
    kind: this.globalId,
    [association.filter]: association.alias,
  };

  return targetModel.updateMany(
    { [association.via]: { $elemMatch: element } },
    { $pull: { [association.via]: element } },
    { session }
  );
};

/**
 * Extracted method to handle manyMorph deletion
 * @param {Object} association - Association definition
 * @param {Object} entry - Entry to clean relations for
 */
const handleManyMorphDeletion = async (association, entry, { session = null }) => {
  if (!Array.isArray(entry[association.alias])) return null;

  const relationUpdates = entry[association.alias].map(val => {
    const targetModel = strapi.db.getModelByGlobalId(val.kind);
    if (!targetModel) return Promise.resolve();

    const field = val[association.filter];
    const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === field);
    const refId = val.ref && (val.ref._id || val.ref);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      return targetModel.updateMany(
        { [targetModel.primaryKey]: refId },
        { [field]: null },
        { session }
      );
    }

    return targetModel.updateMany(
      { [targetModel.primaryKey]: refId },
      { $pull: { [field]: this.primaryKey } },
      { session }
    );
  });

  return Promise.all(relationUpdates);
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

      if (!association) {
        const details = this._attributes[attribute];
        const isVirtual = _.get(details, 'isVirtual') === true;
        if (!isVirtual) {
          return _.set(acc, attribute, newValue);
        }

        return acc;
      }

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

      switch (association.nature) {
        case 'oneWay': {
          return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
        }
        case 'oneToOne': {
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
        case 'manyMorphToMany':
        case 'manyMorphToOne': {
          const morphUpdates = await handleManyMorphRelations.call(this, association, newValue, entry, { session });
          relationUpdates.push(...(morphUpdates || []));
          break;
        }
        case 'oneToManyMorph':
        case 'manyToManyMorph': {
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
            return handleMorphDeletion.call(this, association, entry, { session });
          }
          case 'manyMorphToMany':
          case 'manyMorphToOne': {
            return handleManyMorphDeletion.call(this, association, entry, { session });
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