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
 * Extractor for relation update logic based on association nature
 */
const createRelationUpdateHandler = (association, acc, entry, params, model) => {
  const { nature } = association;
  const { id: entryId, primaryKey: entryPk } = entry;
  const { session } = params;
  const { details, newValue } = association.target;

  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  switch (nature) {
    case 'oneWay': {
      return _.set(acc, association.alias, _.get(newValue, assocModel.primaryKey, newValue));
    }
    case 'oneToOne': {
      const currentValue = association.target.currentValue;
      if (currentValue === newValue) return acc;

      if (_.isNull(newValue)) {
        const updatePromise = assocModel.updateOne(
          {
            [assocModel.primaryKey]: getValuePrimaryKey(currentValue, assocModel.primaryKey),
          },
          { [details.via]: null },
          { session }
        );
        association.relationUpdates.push(updatePromise);
        return _.set(acc, association.alias, null);
      }

      const updateLink = model.updateOne(
        { [association.alias]: new mongoose.Types.ObjectId(newValue) },
        { [association.alias]: null },
        { session }
      ).then(() => {
        return assocModel.updateOne(
          {
            [entryPk]: new mongoose.Types.ObjectId(newValue),
          },
          { [details.via]: entryId },
          { session }
        );
      });

      association.relationUpdates.push(updateLink);
      return _.set(acc, association.alias, newValue);
    }
    case 'oneToMany': {
      const attributeIds = association.target.currentValue;
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
            { [details.via]: entryId },
            { session }
          );
        });

      association.relationUpdates.push(updatePromise);
      return acc;
    }
    case 'manyToOne': {
      return _.set(acc, association.alias, _.get(newValue, assocModel.primaryKey, newValue));
    }
    case 'manyWay':
    case 'manyToMany': {
      if (association.dominant) {
        return _.set(
          acc,
          association.alias,
          newValue ? newValue.map(val => assocModel.primaryKey || val) : newValue
        );
      }

      const updatePromise = assocModel
        .updateMany(
          {
            [assocModel.primaryKey]: {
              $in: association.target.currentValue.map(
                val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)
              ),
            },
          },
          {
            $pull: {
              [association.via]: new mongoose.Types.ObjectId(entryId),
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
              $addToSet: { [association.via]: [entryId] },
            },
            { session }
          );
        });

      association.relationUpdates.push(updatePromise);
      return acc;
    }
    case 'manyMorphToMany':
    case 'manyMorphToOne': {
      association.target.newValue.forEach(obj => {
        const refModel = strapi.db.getModel(obj.ref, obj.source);
        const createRelation = () => {
          return addRelationMorph(
            model,
            {
              id: entryId,
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
          const removePromise = removeRelationMorph(
            model,
            {
              alias: association.alias,
              ref: obj.kind || refModel.globalId,
              refId: new mongoose.Types.ObjectId(obj.refId),
              field: obj.field,
              filter: association.filter,
            },
            { session }
          );
          association.relationUpdates.push(
            removePromise
              .then(createRelation)
              .then(() => {
                return refModel.updateMany(
                  {
                    [refModel.primaryKey]: new mongoose.Types.ObjectId(obj.refId),
                  },
                  {
                    [obj.field]: new mongoose.Types.ObjectId(entryId),
                  },
                  { session }
                );
              })
          );
        } else {
          association.relationUpdates.push(
            createRelation().then(() => {
              return refModel.updateMany(
                {
                  [refModel.primaryKey]: new mongoose.Types.ObjectId(obj.refId),
                },
                {
                  $push: { [obj.field]: new mongoose.Types.ObjectId(entryId) },
                },
                { session }
              );
            })
          );
        }
      });
      break;
    }
    case 'oneToManyMorph':
    case 'manyToManyMorph': {
      const currentIds = transformToArrayID(association.target.currentValue, entryPk);
      const newIds = transformToArrayID(association.target.newValue, entryPk);
      const toAdd = _.difference(newIds, currentIds);
      const toRemove = _.difference(currentIds, newIds);

      const morphModel = strapi.db.getModel(details.model || details.collection, details.plugin);

      if (!Array.isArray(association.target.newValue)) {
        _.set(acc, association.alias, newIds[0]);
      } else {
        _.set(acc, association.alias, newIds);
      }

      const addPromise = Promise.all(
        toAdd.map(id => {
          return addRelationMorph(
            morphModel,
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

      association.relationUpdates.push(addPromise);

      toRemove.forEach(id => {
        association.relationUpdates.push(
          removeRelationMorph(
            morphModel,
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
      break;
    }
    case 'oneMorphToOne':
    case 'oneMorphToMany':
      break;
    default:
  }

  return acc;
};

/**
 * Process relation updates with decreased complexity by delegating to nature-specific handlers
 */
const processRelationUpdates = (association, acc, entry, params, model) => {
  association.target = {
    currentValue: params.currentValue,
    newValue: params.newValue,
  };
  association.dominant = association.dominant;
  association.relationUpdates = params.relationUpdates;

  return createRelationUpdateHandler(association, acc, entry, params, model);
};

/**
 * Helper to extract association field for deletion logic by nature
 */
const getDeleteHandlerByNature = (association) => {
  const { nature, via, dominant } = association;

  switch (nature) {
    case 'oneWay':
    case 'manyWay': {
      return () => Promise.resolve();
    }
    case 'oneToMany':
    case 'oneToOne': {
      return async ({ targetModel, entryId, session }) => {
        if (!via) return;
        return targetModel.updateMany({ [via]: entryId }, { [via]: null }, { session });
      };
    }
    case 'manyToMany':
    case 'manyToOne': {
      return async ({ targetModel, entryId, session }) => {
        if (!via || dominant) return;
        return targetModel.updateMany(
          { [via]: entryId },
          { $pull: { [via]: entryId } },
          { session }
        );
      };
    }
    case 'oneToManyMorph':
    case 'manyToManyMorph': {
      return async ({ targetModel, association, entryId, session }) => {
        if (!targetModel) return;

        const element = {
          ref: entryId,
          kind: association._model.globalId,
          [association.filter]: association.alias,
        };

        return targetModel.updateMany(
          { [via]: { $elemMatch: element } },
          { $pull: { [via]: element } },
          { session }
        );
      };
    }
    case 'manyMorphToMany':
    case 'manyMorphToOne': {
      return async ({ association, entry, session }) => {
        if (!Array.isArray(entry[association.alias])) return;

        return Promise.all(
          entry[association.alias].map(val => {
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
                { session }
              );
            }

            return targetModel.updateMany(
              {
                [targetModel.primaryKey]: val.ref && (val.ref._id || val.ref),
              },
              {
                $pull: { [field]: val.ref && (val.ref._id || val.ref) },
              },
              { session }
            );
          })
        );
      };
    }
    case 'oneMorphToOne':
    case 'oneMorphToMany': {
      return () => Promise.resolve();
    }
    default:
      return () => Promise.resolve();
  }
};

/**
 * Delete relations by delegating to handlers by nature
 */
const handleDeleteRelations = async (association, entry, { session = null } = {}) => {
  const { nature, via, dominant } = association;

  const targetModel = strapi.db.getModel(
    association.model || association.collection,
    association.plugin
  );

  const handler = getDeleteHandlerByNature(association);
  return handler({
    nature,
    via,
    dominant,
    targetModel,
    entryId: entry[this.primaryKey],
    association,
    entry,
    session,
    _model: this,
  });
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

      if (!association && _.get(details, 'isVirtual') !== true) {
        return _.set(acc, attribute, newValue);
      }

      return processRelationUpdates(association, acc, entry, {
        currentValue,
        newValue,
        session,
        relationUpdates
      }, this);
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

  async deleteRelations(entry, { session = null } = {}) {
    const primaryKeyValue = entry[this.primaryKey];

    const deletePromises = this.associations.map(async (association) => {
      return handleDeleteRelations.call(this, association, entry, { session });
    });

    return Promise.all(deletePromises).then(results => results.flat());
  },
};