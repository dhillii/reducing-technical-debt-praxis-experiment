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
 * Transforms input to an array of string IDs using the provided primary key.
 */
const transformToArrayID = (array, pk) => {
  if (!_.isArray(array)) {
    return transformToArrayID([array], pk);
  }

  return _.compact(
    array
      .map(value => {
        const id = getValuePrimaryKey(value, pk);
        return id || value;
      })
      .map(val => _.toString(val))
  );
};

/**
 * Removes undefined keys from an object.
 */
const removeUndefinedKeys = (obj = {}) => _.pickBy(obj, _.negate(_.isUndefined));

/**
 * Adds a morph relation to a model.
 */
const addRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  await model.updateOne(
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
 * Removes a morph relation from a model.
 */
const removeRelationMorph = async (model, params, { session = null } = {}) => {
  const { alias, refId, ref, field, filter } = params;

  const selector = params.id
    ? { [model.primaryKey]: params.id }
    : {
        [alias]: {
          $elemMatch: {
            ref: new mongoose.Types.ObjectId(refId),
            kind: ref,
            [filter]: field,
          },
        },
      };

  await model.updateMany(
    selector,
    {
      $pull: {
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
 * Updates relations for a single association based on its nature.
 */
const updateSingleAssociation = async (model, association, entry, values, params, session) => {
  const { nature, dominant, via } = association;
  const { alias, refId: _, ref: __, ...rest } = params;
  const assocModel = strapi.db.getModel(
    association.model || association.collection,
    association.plugin
  );
  const currentValue = entry[alias];
  const newValue = rest.values[alias];

  switch (nature) {
    case 'oneWay': {
      _.set(values, alias, _.get(newValue, assocModel.primaryKey, newValue));
      break;
    }
    case 'oneToOne': {
      if (currentValue === newValue) break;
      if (_.isNull(newValue)) {
        await assocModel.updateOne(
          { [assocModel.primaryKey]: getValuePrimaryKey(currentValue, assocModel.primaryKey) },
          { [via]: null },
          { session }
        );
        _.set(values, alias, null);
        break;
      }

      const updateLink = model.updateOne(
        { [alias]: new mongoose.Types.ObjectId(newValue) },
        { [alias]: null },
        { session }
      ).then(() => {
        return assocModel.updateOne(
          { [model.primaryKey]: new mongoose.Types.ObjectId(newValue) },
          { [via]: getValuePrimaryKey(entry, model.primaryKey) },
          { session }
        );
      });

      await updateLink;
      _.set(values, alias, newValue);
      break;
    }
    case 'oneToMany': {
      const attributeIds = currentValue;
      const toRemove = _.differenceWith(
        attributeIds,
        newValue,
        (a, b) =>
          `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`
      );

      const updatePromise = assocModel
        .updateMany(
          {
            [assocModel.primaryKey]: {
              $in: toRemove.map(val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)),
            },
          },
          { [via]: null },
          { session }
        )
        .then(() => {
          return assocModel.updateMany(
            {
              [assocModel.primaryKey]: {
                $in: newValue.map(val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)),
              },
            },
            { [via]: getValuePrivateKey(entry, model.primaryKey) },
            { session }
          );
        });

      await updatePromise;
      break;
    }
    case 'manyToOne': {
      _.set(values, alias, _.get(newValue, assocModel.primaryKey, newValue));
      break;
    }
    case 'manyWay':
    case 'manyToMany': {
      if (dominant) {
        _.set(
          values,
          alias,
          newValue ? newValue.map(val => getValuePrimaryKey(val, assocModel.primaryKey) || val) : newValue
        );
        break;
      }

      const oldValueIds = currentValue.map(val => getValuePrimaryKey(val, assocModel.primaryKey) || val);
      const newValueIds = newValue ? newValue.map(val => getValuePrimaryKey(val, assocModel.primaryKey) || val) : newValue;

      const updatePromise = assocModel
        .updateMany(
          { [assocModel.primaryKey]: { $in: oldValueIds.map(id => mongoose.Types.ObjectId(id)) } },
          { $pull: { [via]: mongoose.Types.ObjectId(getValuePrivateKey(entry, model.primaryKey)) } },
          { session }
        )
        .then(() => {
          return newValueIds.length === 0
            ? Promise.resolve()
            : assocModel.updateMany(
                { [assocModel.primaryKey]: { $in: newValueIds.map(id => mongoose.Types.ObjectId(id)) } },
                { $addToSet: { [via]: mongoose.Types.ObjectId(getValuePrivateKey(entry, model.primaryKey)) } },
                { session }
              );
        });

      await updatePromise;
      break;
    }
    case 'manyMorphToMany':
    case 'manyMorphToOne': {
      newValue.forEach(obj => {
        const refModel = strapi.db.getModel(obj.ref, obj.source);
        const createRelation = () => {
          return addRelationMorph(
            model,
            {
              id: entry[model.primaryKey],
              alias,
              ref: obj.kind || refModel.globalId,
              refId: new mongoose.Types.ObjectId(obj.refId),
              field: obj.field,
              filter: association.filter,
            },
            { session }
          );
        };

        const reverseAssoc = refModel.associations.find(a => a.alias === obj.field);

        if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
          relationUpdates.push(
            removeRelationMorph(
              model,
              {
                alias,
                ref: obj.kind || refModel.globalId,
                refId: new mongoose.Types.ObjectId(obj.refId),
                field: obj.field,
                filter: association.filter,
              },
              { session }
            ).then(createRelation)
          );
          await createRelation().then(() => {
            return refModel.updateMany(
              { [refModel.primaryKey]: new mongoose.Types.ObjectId(obj.refId) },
              { [obj.field]: entry[model.primaryKey] },
              { session }
            );
          });
        } else {
          relationUpdates.push(createRelation().then(() => {
            return refModel.updateMany(
              { [refModel.primaryKey]: new mongoose.Types.ObjectId(obj.refId) },
              { $push: { [obj.field]: entry[model.primaryKey] } },
              { session }
            );
          }));
        }
      });
      break;
    }
    case 'oneToManyMorph':
    case 'manyToManyMorph': {
      const currentIds = transformToArrayID(currentValue, model.primaryKey);
      const newIds = transformToArrayID(newValue, model.primaryKey);

      const toAdd = _.difference(newIds, currentIds);
      const toRemove = _.difference(currentIds, newIds);

      const morphModel = strapi.db.getModel(
        association.model || association.collection,
        association.plugin
      );

      _.set(values, alias, newValue ? newIds : null);

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

      await addPromise;

      toRemove.forEach(id => {
        relationUpdates.push(
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
    default:
      break;
  }

  return values;
};

/**
 * Handles deletion of relations for a single association.
 */
const deleteSingleAssociation = async (model, association, entry, session) => {
  const { nature, via, dominant } = association;
  const targetModel = strapi.db.getModel(
    association.model || association.collection,
    association.plugin
  );

  const pkValue = entry[model.primaryKey];

  switch (nature) {
    case 'oneWay':
    case 'manyWay':
      break;
    case 'oneToMany':
    case 'oneToOne': {
      if (!via) break;
      await targetModel.updateMany({ [via]: pkValue }, { [via]: null }, { session });
      break;
    }
    case 'manyToMany':
    case 'manyToOne': {
      if (!via || dominant) break;
      await targetModel.updateMany(
        { [via]: pkValue },
        { $pull: { [via]: pkValue } },
        { session }
      );
      break;
    }
    case 'oneToManyMorph':
    case 'manyToManyMorph': {
      if (!targetModel) break;

      const element = {
        ref: new mongoose.Types.ObjectId(pkValue),
        kind: model.globalId,
        [association.filter]: association.alias,
      };

      await targetModel.updateMany(
        { [via]: { $elemMatch: element } },
        { $pull: { [via]: element } },
        { session }
      );
      break;
    }
    case 'manyMorphToMany':
    case 'manyMorphToOne': {
      if (!Array.isArray(entry[association.alias])) break;

      await Promise.all(
        entry[association.alias].map(async val => {
          const target = strapi.db.getModelByGlobalId(val.kind);
          if (!target) return;

          const field = val[association.filter];
          const reverseAssoc = target.associations.find(a => a.alias === field);

          if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
            return target.updateOne(
              { [target.primaryKey]: val.ref && (val.ref._id || val.ref) },
              { [field]: null },
              { session }
            );
          }

          return target.updateOne(
            { [target.primaryKey]: val.ref && (val.ref._id || val.ref) },
            { $pull: { [field]: pkValue } },
            { session }
          );
        })
      );
      break;
    }
    case 'oneMorphToOne':
    case 'oneMorphToMany':
    default:
      break;
  }
};

/**
 * Helper to extract primary key correctly.
 */
const getValuePrivateKey = (obj, pk) => getValuePrimaryKey(obj, pk);

/**
 * Main update method refactored to delegate each relation type.
 */
module.exports = {
  async update(params, { session = null } = {}) {
    const relationUpdates = [];
    const populate = this.associations.map(x => x.alias);
    const primaryKeyValue = getValuePrivateKey(params, this.primaryKey);

    const entry = await this.findOne({ [this.primaryKey]: primaryKeyValue })
      .session(session)
      .populate(populate)
      .lean();

    const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, attribute) => {
      const association = this.associations.find(x => x.alias === attribute);
      const details = this._attributes[attribute];

      if (!association && _.get(details, 'isVirtual') !== true) {
        return _.set(acc, attribute, params.values[attribute]);
      }

      return acc;
    }, {});

    const updatedValues = await Promise.all(
      this.associations.map(async assoc => {
        if (!params.values[assoc.alias]) return;
        return updateSingleAssociation(
          this,
          assoc,
          entry,
          values,
          { ...params, values: params.values },
          session
        );
      })
    );

    for (const val of updatedValues) {
      Object.assign(values, val);
    }

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
    const promises = this.associations.map(async association =>
      deleteSingleAssociation(this, association, entry, session)
    );

    return Promise.all(promises);
  },
};