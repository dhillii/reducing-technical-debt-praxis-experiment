'use strict';

/**
 * Module dependencies
 */
const _ = require('lodash');
const mongoose = require('mongoose');
const {
  models: { getValuePrimaryKey },
} = require('strapi-utils');

/**
 * Transform any input to an array of string IDs.
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
 * Remove keys with undefined values.
 */
const removeUndefinedKeys = (obj = {}) => _.pickBy(obj, _.negate(_.isUndefined));

/**
 * Add a morph relation.
 */
const addRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  await model.updateMany(
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
 * Remove a morph relation.
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
 * Handle oneWay attribute updates.
 */
const handleOneWay = (attribute, newValue, assocModel, details) => {
  return _.set({}, attribute, _.get(newValue, assocModel.primaryKey, newValue));
};

/**
 * Handle manyToOne attribute updates.
 */
const handleManyToOne = (attribute, newValue, assocModel) => {
  return _.set({}, attribute, _.get(newValue, assocModel.primaryKey, newValue));
};

/**
 * Handle manyWay / manyToMany attribute updates.
 */
const handleManyWay = ({
  attribute,
  newValue,
  currentValue,
  association,
  assocModel,
  primaryKeyValue,
  session,
  relationUpdates,
}) => {
  if (association.dominant) {
    return _.set(
      {},
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
      { $pull: { [association.via]: new mongoose.Types.ObjectId(primaryKeyValue) } },
      { session }
    )
    .then(() => {
      return assocModel.updateMany(
        {
          [assocModel.primaryKey]: {
            $in: newValue
              ? newValue.map(val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val))
              : newValue,
          },
        },
        { $addToSet: { [association.via]: [primaryKeyValue] } },
        { session }
      );
    });

  relationUpdates.push(updatePromise);
  return {};
};

/**
 * Handle oneToOne attribute updates.
 */
const handleOneToOne = async ({
  attribute,
  newValue,
  currentValue,
  association,
  details,
  entry,
  primaryKeyValue,
  session,
  relationUpdates,
}) => {
  if (currentValue === newValue) return {};

  if (_.isNull(newValue)) {
    const updatePromise = association.model
      .updateOne(
        { [association.model.primaryKey]: getValuePrimaryKey(currentValue, association.model.primaryKey) },
        { [details.via]: null },
        { session }
      );
    relationUpdates.push(updatePromise);
    return _.set({}, attribute, null);
  }

  const linkPromise = this.updateOne(
    { [attribute]: new mongoose.Types.ObjectId(newValue) },
    { [attribute]: null },
    { session }
  ).then(() => {
    return association.model.updateOne(
      { [this.primaryKey]: new mongoose.Types.ObjectId(newValue) },
      { [details.via]: primaryKeyValue },
      { session }
    );
  });

  relationUpdates.push(linkPromise);
  return _.set({}, attribute, newValue);
};

/**
 * Handle oneToMany attribute updates.
 */
const handleOneToMany = ({
  attribute,
  currentValue,
  newValue,
  assocModel,
  details,
  primaryKeyValue,
  session,
  relationUpdates,
}) => {
  const toRemove = _.differenceWith(currentValue, newValue, (a, b) => {
    return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
  });

  const updatePromise = assocModel
    .updateMany(
      {
        [assocModel.primaryKey]: {
          $in: toRemove.map(val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)),
        },
      },
      { [details.via]: null },
      { session }
    )
    .then(() => {
      return assocModel.updateMany(
        {
          [assocModel.primaryKey]: {
            $in: newValue.map(val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)),
          },
        },
        { [details.via]: primaryKeyValue },
        { session }
      );
    });

  relationUpdates.push(updatePromise);
  return {};
};

/**
 * Handle manyMorph (manyMorphToMany / manyMorphToOne) updates.
 */
const handleManyMorph = ({
  newValue,
  entry,
  association,
  primaryKeyValue,
  session,
  relationUpdates,
}) => {
  newValue.forEach(obj => {
    const refModel = strapi.db.getModel(obj.ref, obj.source);

    const createRelation = () =>
      addRelationMorph(this, {
        id: entry[this.primaryKey],
        alias: association.alias,
        ref: obj.kind || refModel.globalId,
        refId: new mongoose.Types.ObjectId(obj.refId),
        field: obj.field,
        filter: association.filter,
      }, { session });

    const reverseAssoc = refModel.associations.find(assoc => assoc.alias === obj.field);
    if (reverseAssoc?.nature === 'oneToManyMorph') {
      relationUpdates.push(
        removeRelationMorph(this, {
          alias: association.alias,
          ref: obj.kind || refModel.globalId,
          refId: new mongoose.Types.ObjectId(obj.refId),
          field: obj.field,
          filter: association.filter,
        }, { session })
          .then(createRelation)
          .then(() =>
            refModel.updateMany(
              { [refModel.primaryKey]: new mongoose.Types.ObjectId(obj.refId) },
              { [obj.field]: new mongoose.Types.ObjectId(entry[this.primaryKey]) },
              { session }
            )
          )
      );
    } else {
      relationUpdates.push(
        createRelation().then(() =>
          refModel.updateMany(
            { [refModel.primaryKey]: new mongoose.Types.ObjectId(obj.refId) },
            { $push: { [obj.field]: new mongoose.Types.ObjectId(entry[this.primaryKey]) } },
            { session }
          )
        )
      );
    }
  });
};

/**
 * Handle oneToManyMorph / manyToManyMorph updates.
 */
const handleOneMorph = ({
  currentValue,
  newValue,
  association,
  details,
  entry,
  primaryKeyValue,
  session,
  relationUpdates,
}) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const newIds = transformToArrayID(newValue, this.primaryKey);
  const toAdd = _.difference(newIds, currentIds);
  const toRemove = _.difference(currentIds, newIds);
  const model = strapi.db.getModel(details.model || details.collection, details.plugin);

  if (!Array.isArray(newValue)) {
    _.set(entry, association.alias, newIds[0]);
  } else {
    _.set(entry, association.alias, newIds);
  }

  const addPromise = Promise.all(
    toAdd.map(id =>
      addRelationMorph(model, {
        id,
        alias: association.via,
        ref: this.globalId,
        refId: entry._id,
        field: association.alias,
        filter: association.filter,
      }, { session })
    )
  );
  relationUpdates.push(addPromise);

  toRemove.forEach(id => {
    relationUpdates.push(
      removeRelationMorph(model, {
        id,
        alias: association.via,
        ref: this.globalId,
        refId: entry._id,
        field: association.alias,
        filter: association.filter,
      }, { session })
    );
  });
};

/**
 * Process a single attribute based on its association nature.
 */
const processAttribute = async ({
  attribute,
  entry,
  params,
  primaryKeyValue,
  relationUpdates,
}) => {
  const currentValue = entry[attribute];
  const newValue = params.values[attribute];
  const association = this.associations.find(x => x.alias === attribute);
  const details = this._attributes[attribute];

  if (!association && _.get(details, 'isVirtual') !== true) {
    return _.set({}, attribute, newValue);
  }

  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  switch (association.nature) {
    case 'oneWay':
      return handleOneWay(attribute, newValue, assocModel, details);
    case 'oneToOne':
      return handleOneToOne.call(this, {
        attribute,
        newValue,
        currentValue,
        association,
        details,
        entry,
        primaryKeyValue,
        session: params.session,
        relationUpdates,
      });
    case 'oneToMany':
      return handleOneToMany({
        attribute,
        currentValue,
        newValue,
        assocModel,
        details,
        primaryKeyValue,
        session: params.session,
        relationUpdates,
      });
    case 'manyToOne':
      return handleManyToOne(attribute, newValue, assocModel);
    case 'manyWay':
    case 'manyToMany':
      return handleManyWay({
        attribute,
        newValue,
        currentValue,
        association,
        assocModel,
        primaryKeyValue,
        session: params.session,
        relationUpdates,
      });
    case 'manyMorphToMany':
    case 'manyMorphToOne':
      handleManyMorph({
        newValue,
        entry,
        association,
        primaryKeyValue,
        session: params.session,
        relationUpdates,
      });
      return {};
    case 'oneToManyMorph':
    case 'manyToManyMorph':
      handleOneMorph({
        currentValue,
        newValue,
        association,
        details,
        entry,
        primaryKeyValue,
        session: params.session,
        relationUpdates,
      });
      return {};
    case 'oneMorphToOne':
    case 'oneMorphToMany':
      return {};
    default:
      return {};
  }
};

/**
 * Exported model methods.
 */
module.exports = {
  /**
   * Update an entry and its relations.
   */
  async update(params, { session = null } = {}) {
    const relationUpdates = [];
    const populate = this.associations.map(x => x.alias);
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);

    const entry = await this.findOne({ [this.primaryKey]: primaryKeyValue })
      .session(session)
      .populate(populate)
      .lean();

    const values = await Object.keys(removeUndefinedKeys(params.values)).reduce(
      async (accPromise, attribute) => {
        const acc = await accPromise;
        const attrUpdate = await processAttribute.call(this, {
          attribute,
          entry,
          params,
          primaryKeyValue,
          relationUpdates,
        });
        return _.merge(acc, attrUpdate);
      },
      Promise.resolve({})
    );

    await Promise.all(relationUpdates);
    await this.updateOne({ [this.primaryKey]: primaryKeyValue }, values, {
      strict: false,
      session,
    });

    const updatedEntity = await this.findOne({ [this.primaryKey]: primaryKeyValue })
      .session(session)
      .populate(populate);

    return updatedEntity && updatedEntity.toObject ? updatedEntity.toObject() : updatedEntity;
  },

  /**
   * Delete all relations for a given entry.
   */
  async deleteRelations(entry, { session = null } = {}) {
    const primaryKeyValue = entry[this.primaryKey];

    const handlers = {
      oneWay: async () => {},
      manyWay: async () => {},
      oneToMany: async assoc => {
        if (!assoc.via) return;
        const targetModel = strapi.db.getModel(assoc.model || assoc.collection, assoc.plugin);
        return targetModel.updateMany({ [assoc.via]: primaryKeyValue }, { [assoc.via]: null }, { session });
      },
      oneToOne: async assoc => {
        if (!assoc.via) return;
        const targetModel = strapi.db.getModel(assoc.model || assoc.collection, assoc.plugin);
        return targetModel.updateMany({ [assoc.via]: primaryKeyValue }, { [assoc.via]: null }, { session });
      },
      manyToMany: async assoc => {
        if (!assoc.via || assoc.dominant) return;
        const targetModel = strapi.db.getModel(assoc.model || assoc.collection, assoc.plugin);
        return targetModel.updateMany(
          { [assoc.via]: primaryKeyValue },
          { $pull: { [assoc.via]: primaryKeyValue } },
          { session }
        );
      },
      manyToOne: async assoc => {
        if (!assoc.via || assoc.dominant) return;
        const targetModel = strapi.db.getModel(assoc.model || assoc.collection, assoc.plugin);
        return targetModel.updateMany(
          { [assoc.via]: primaryKeyValue },
          { $pull: { [assoc.via]: primaryKeyValue } },
          { session }
        );
      },
      oneToManyMorph: async assoc => {
        const targetModel = strapi.db.getModel(assoc.model || assoc.collection, assoc.plugin);
        if (!targetModel) return;
        const element = {
          ref: primaryKeyValue,
          kind: this.globalId,
          [assoc.filter]: assoc.alias,
        };
        return targetModel.updateMany(
          { [assoc.via]: { $elemMatch: element } },
          { $pull: { [assoc.via]: element } },
          { session }
        );
      },
      manyToManyMorph: async assoc => {
        const targetModel = strapi.db.getModel(assoc.model || assoc.collection, assoc.plugin);
        if (!targetModel) return;
        const element = {
          ref: primaryKeyValue,
          kind: this.globalId,
          [assoc.filter]: assoc.alias,
        };
        return targetModel.updateMany(
          { [assoc.via]: { $elemMatch: element } },
          { $pull: { [assoc.via]: element } },
          { session }
        );
      },
      manyMorphToMany: async assoc => {
        if (!Array.isArray(entry[assoc.alias])) return;
        await Promise.all(
          entry[assoc.alias].map(async val => {
            const targetModel = strapi.db.getModelByGlobalId(val.kind);
            if (!targetModel) return;
            const field = val[assoc.filter];
            const reverseAssoc = targetModel.associations.find(a => a.alias === field);
            if (reverseAssoc?.nature === 'oneToManyMorph') {
              await targetModel.updateMany(
                { [targetModel.primaryKey]: val.ref && (val.ref._id || val.ref) },
                { [field]: null },
                { session }
              );
            } else {
              await targetModel.updateMany(
                { [targetModel.primaryKey]: val.ref && (val.ref._id || val.ref) },
                { $pull: { [field]: primaryKeyValue } },
                { session }
              );
            }
          })
        );
      },
      manyMorphToOne: async assoc => {
        // Same handling as manyMorphToMany
        return handlers.manyMorphToMany(assoc);
      },
      oneMorphToOne: async () => {},
      oneMorphToMany: async () => {},
    };

    await Promise.all(
      this.associations.map(async association => {
        const handler = handlers[association.nature];
        if (handler) {
          await handler(association);
        }
      })
    );
  },
};