'use strict';

/**
 * Module dependencies
 */
const _ = require('lodash');
const mongoose = require('mongoose');
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
 * Helper: update simple attribute
 */
const updateSimpleAttribute = (acc, attribute, newValue) => _.set(acc, attribute, newValue);

/**
 * Helper: handle oneWay association
 */
const handleOneWay = (acc, attribute, newValue, assocModel) => {
  const pk = _.get(newValue, assocModel.primaryKey, newValue);
  return updateSimpleAttribute(acc, attribute, pk);
};

/**
 * Helper: handle manyToOne association
 */
const handleManyToOne = (acc, attribute, newValue, assocModel) => {
  const pk = _.get(newValue, assocModel.primaryKey, newValue);
  return updateSimpleAttribute(acc, attribute, pk);
};

/**
 * Helper: handle manyWay / manyToMany association
 */
const handleManyWayOrManyToMany = async ({
  thisModel,
  entry,
  attribute,
  currentValue,
  newValue,
  association,
  details,
  assocModel,
  primaryKeyValue,
  session,
  relationUpdates,
}) => {
  if (association.dominant) {
    const mapped = newValue ? newValue.map(val => val[assocModel.primaryKey] || val) : newValue;
    updateSimpleAttribute(relationUpdates, attribute, mapped);
    return;
  }

  const currentIds = currentValue.map(val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val));
  const newIds = newValue ? newValue.map(val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)) : [];

  const pullPromise = assocModel
    .updateMany(
      { [assocModel.primaryKey]: { $in: currentIds } },
      { $pull: { [association.via]: new mongoose.Types.ObjectId(primaryKeyValue) } },
      { session }
    )
    .then(() =>
      assocModel.updateMany(
        { [assocModel.primaryKey]: { $in: newIds } },
        { $addToSet: { [association.via]: [primaryKeyValue] } },
        { session }
      )
    );

  relationUpdates.push(pullPromise);
};

/**
 * Helper: handle oneToOne association
 */
const handleOneToOne = async ({
  thisModel,
  entry,
  attribute,
  currentValue,
  newValue,
  association,
  details,
  assocModel,
  primaryKeyValue,
  session,
  relationUpdates,
}) => {
  if (currentValue === newValue) return;

  if (_.isNull(newValue)) {
    const nullifyPromise = assocModel.updateOne(
      { [assocModel.primaryKey]: getValuePrimaryKey(currentValue, assocModel.primaryKey) },
      { [details.via]: null },
      { session }
    );
    relationUpdates.push(nullifyPromise);
    updateSimpleAttribute(entry, attribute, null);
    return;
  }

  const unlinkPromise = thisModel
    .updateOne(
      { [attribute]: new mongoose.Types.ObjectId(newValue) },
      { [attribute]: null },
      { session }
    )
    .then(() =>
      assocModel.updateOne(
        { [thisModel.primaryKey]: new mongoose.Types.ObjectId(newValue) },
        { [details.via]: primaryKeyValue },
        { session }
      )
    );

  relationUpdates.push(unlinkPromise);
  updateSimpleAttribute(entry, attribute, newValue);
};

/**
 * Helper: handle oneToMany association
 */
const handleOneToMany = async ({
  thisModel,
  entry,
  attribute,
  currentValue,
  newValue,
  association,
  details,
  assocModel,
  primaryKeyValue,
  session,
  relationUpdates,
}) => {
  const toRemove = _.differenceWith(currentValue, newValue, (a, b) => {
    const aId = a[assocModel.primaryKey] || a;
    const bId = b[assocModel.primaryKey] || b;
    return `${aId}` === `${bId}`;
  });

  const removeIds = toRemove.map(v => new mongoose.Types.ObjectId(v[assocModel.primaryKey] || v));
  const addIds = newValue.map(v => new mongoose.Types.ObjectId(v[assocModel.primaryKey] || v));

  const promise = assocModel
    .updateMany(
      { [assocModel.primaryKey]: { $in: removeIds } },
      { [details.via]: null },
      { session }
    )
    .then(() =>
      assocModel.updateMany(
        { [assocModel.primaryKey]: { $in: addIds } },
        { [details.via]: primaryKeyValue },
        { session }
      )
    );

  relationUpdates.push(promise);
};

/**
 * Helper: handle manyMorph (media -> model) associations
 */
const handleManyMorph = async ({
  thisModel,
  entry,
  attribute,
  newValue,
  association,
  session,
  relationUpdates,
}) => {
  for (const obj of newValue) {
    const refModel = strapi.db.getModel(obj.ref, obj.source);
    const createRelation = () =>
      addRelationMorph(thisModel, {
        id: entry[thisModel.primaryKey],
        alias: association.alias,
        ref: obj.kind || refModel.globalId,
        refId: new mongoose.Types.ObjectId(obj.refId),
        field: obj.field,
        filter: association.filter,
      }, { session });

    const reverseAssoc = refModel.associations.find(assoc => assoc.alias === obj.field);
    if (reverseAssoc?.nature === 'oneToManyMorph') {
      const removal = removeRelationMorph(thisModel, {
        alias: association.alias,
        ref: obj.kind || refModel.globalId,
        refId: new mongoose.Types.ObjectId(obj.refId),
        field: obj.field,
        filter: association.filter,
      }, { session });

      relationUpdates.push(
        removal
          .then(createRelation)
          .then(() =>
            refModel.updateMany(
              { [refModel.primaryKey]: new mongoose.Types.ObjectId(obj.refId) },
              { [obj.field]: new mongoose.Types.ObjectId(entry[thisModel.primaryKey]) },
              { session }
            )
          )
      );
    } else {
      relationUpdates.push(
        createRelation().then(() =>
          refModel.updateMany(
            { [refModel.primaryKey]: new mongoose.Types.ObjectId(obj.refId) },
            { $push: { [obj.field]: new mongoose.Types.ObjectId(entry[thisModel.primaryKey]) } },
            { session }
          )
        )
      );
    }
  }
};

/**
 * Helper: handle oneMorph (model -> media) associations
 */
const handleOneMorph = async ({
  thisModel,
  entry,
  attribute,
  currentValue,
  newValue,
  association,
  details,
  session,
  relationUpdates,
}) => {
  const currentIds = transformToArrayID(currentValue, thisModel.primaryKey);
  const newIds = transformToArrayID(newValue, thisModel.primaryKey);
  const toAdd = _.difference(newIds, currentIds);
  const toRemove = _.difference(currentIds, newIds);
  const targetModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  if (!Array.isArray(newValue)) {
    updateSimpleAttribute(entry, attribute, newIds[0]);
  } else {
    updateSimpleAttribute(entry, attribute, newIds);
  }

  const addPromises = toAdd.map(id =>
    addRelationMorph(targetModel, {
      id,
      alias: association.via,
      ref: thisModel.globalId,
      refId: entry._id,
      field: association.alias,
      filter: association.filter,
    }, { session })
  );
  relationUpdates.push(Promise.all(addPromises));

  toRemove.forEach(id => {
    relationUpdates.push(
      removeRelationMorph(targetModel, {
        id,
        alias: association.via,
        ref: thisModel.globalId,
        refId: entry._id,
        field: association.alias,
        filter: association.filter,
      }, { session })
    );
  });
};

/**
 * Exported methods
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
        return updateSimpleAttribute(acc, attribute, newValue);
      }

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

      switch (association.nature) {
        case 'oneWay':
          return handleOneWay(acc, attribute, newValue, assocModel);
        case 'oneToOne':
          handleOneToOne({
            thisModel: this,
            entry: acc,
            attribute,
            currentValue,
            newValue,
            association,
            details,
            assocModel,
            primaryKeyValue,
            session,
            relationUpdates,
          });
          return acc;
        case 'oneToMany':
          handleOneToMany({
            thisModel: this,
            entry: acc,
            attribute,
            currentValue,
            newValue,
            association,
            details,
            assocModel,
            primaryKeyValue,
            session,
            relationUpdates,
          });
          return acc;
        case 'manyToOne':
          return handleManyToOne(acc, attribute, newValue, assocModel);
        case 'manyWay':
        case 'manyToMany':
          handleManyWayOrManyToMany({
            thisModel: this,
            entry: acc,
            attribute,
            currentValue,
            newValue,
            association,
            details,
            assocModel,
            primaryKeyValue,
            session,
            relationUpdates,
          });
          return acc;
        case 'manyMorphToMany':
        case 'manyMorphToOne':
          handleManyMorph({
            thisModel: this,
            entry,
            attribute,
            newValue,
            association,
            session,
            relationUpdates,
          });
          break;
        case 'oneToManyMorph':
        case 'manyToManyMorph':
          handleOneMorph({
            thisModel: this,
            entry,
            attribute,
            currentValue,
            newValue,
            association,
            details,
            session,
            relationUpdates,
          });
          break;
        case 'oneMorphToOne':
        case 'oneMorphToMany':
          break;
        default:
          break;
      }
      return acc;
    }, {});

    await Promise.all(relationUpdates).then(() =>
      this.updateOne({ [this.primaryKey]: primaryKeyValue }, values, {
        strict: false,
        session,
      })
    );

    const updatedEntity = await this.findOne({ [this.primaryKey]: primaryKeyValue })
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
          case 'manyWay':
            return;
          case 'oneToMany':
          case 'oneToOne':
            if (!via) return;
            const targetModel1 = strapi.db.getModel(association.model || association.collection, association.plugin);
            return targetModel1.updateMany({ [via]: primaryKeyValue }, { [via]: null }, { session });
          case 'manyToMany':
          case 'manyToOne':
            if (!via || dominant) return;
            const targetModel2 = strapi.db.getModel(association.model || association.collection, association.plugin);
            return targetModel2.updateMany(
              { [via]: primaryKeyValue },
              { $pull: { [via]: primaryKeyValue } },
              { session }
            );
          case 'oneToManyMorph':
          case 'manyToManyMorph':
            const targetModel3 = strapi.db.getModel(association.model || association.collection, association.plugin);
            if (!targetModel3) return;
            const element = {
              ref: primaryKeyValue,
              kind: this.globalId,
              [association.filter]: association.alias,
            };
            return targetModel3.updateMany(
              { [via]: { $elemMatch: element } },
              { $pull: { [via]: element } },
              { session }
            );
          case 'manyMorphToMany':
          case 'manyMorphToOne':
            if (!Array.isArray(entry[association.alias])) return;
            return Promise.all(
              entry[association.alias].map(val => {
                const targetModel = strapi.db.getModelByGlobalId(val.kind);
                if (!targetModel) return;
                const field = val[association.filter];
                const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === field);
                if (reverseAssoc?.nature === 'oneToManyMorph') {
                  return targetModel.updateMany(
                    { [targetModel.primaryKey]: val.ref && (val.ref._id || val.ref) },
                    { [field]: null },
                    { session }
                  );
                }
                return targetModel.updateMany(
                  { [targetModel.primaryKey]: val.ref && (val.ref._id || val.ref) },
                  { $pull: { [field]: primaryKeyValue } },
                  { session }
                );
              })
            );
          case 'oneMorphToOne':
          case 'oneMorphToMany':
            return;
          default:
            return;
        }
      })
    );
  },
};