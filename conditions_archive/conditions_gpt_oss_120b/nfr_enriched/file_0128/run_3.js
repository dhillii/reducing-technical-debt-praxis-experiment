```javascript
'use strict';

/**
 * Module dependencies
 */
const _ = require('lodash');
const mongoose = require('mongoose');
const {
  models: { getValuePrimaryKey },
} = require('strapi-utils');

/* -------------------------------------------------------------------------- */
/* Helper utilities                                                            */
/* -------------------------------------------------------------------------- */

const transformToArrayID = (array, pk) => {
  if (_.isArray(array)) {
    return array
      .map(v => v && (getValuePrimaryKey(v, pk) || v))
      .filter(Boolean)
      .map(v => _.toString(v));
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

/* -------------------------------------------------------------------------- */
/* Attribute handlers                                                          */
/* -------------------------------------------------------------------------- */

const handleSimpleAttribute = (acc, attribute, newValue) =>
  _.set(acc, attribute, newValue);

const handleOneWay = (acc, attribute, newValue, assocModel) =>
  _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));

const handleManyToOne = (acc, attribute, newValue, assocModel) =>
  _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));

const handleOneToOne = async ({
  entry,
  attribute,
  currentValue,
  newValue,
  details,
  primaryKeyValue,
  assocModel,
  session,
  relationUpdates,
}) => {
  if (currentValue === newValue) return;

  if (_.isNull(newValue)) {
    const promise = assocModel.updateOne(
      { [assocModel.primaryKey]: getValuePrimaryKey(currentValue, assocModel.primaryKey) },
      { [details.via]: null },
      { session }
    );
    relationUpdates.push(promise);
    return _.set({}, attribute, null);
  }

  const linkPromise = this.updateOne(
    { [attribute]: new mongoose.Types.ObjectId(newValue) },
    { [attribute]: null },
    { session }
  ).then(() =>
    assocModel.updateOne(
      { [this.primaryKey]: new mongoose.Types.ObjectId(newValue) },
      { [details.via]: primaryKeyValue },
      { session }
    )
  );

  relationUpdates.push(linkPromise);
  return _.set({}, attribute, newValue);
};

const handleOneToMany = async ({
  currentValue,
  newValue,
  details,
  assocModel,
  primaryKeyValue,
  session,
  relationUpdates,
}) => {
  const toRemove = _.differenceWith(
    currentValue,
    newValue,
    (a, b) => `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`
  );

  const removePromise = assocModel
    .updateMany(
      {
        [assocModel.primaryKey]: {
          $in: toRemove.map(v => new mongoose.Types.ObjectId(v[assocModel.primaryKey] || v)),
        },
      },
      { [details.via]: null },
      { session }
    )
    .then(() =>
      assocModel.updateMany(
        {
          [assocModel.primaryKey]: {
            $in: newValue.map(v => new mongoose.Types.ObjectId(v[assocModel.primaryKey] || v)),
          },
        },
        { [details.via]: primaryKeyValue },
        { session }
      )
    );

  relationUpdates.push(removePromise);
};

const handleManySide = async ({
  currentValue,
  newValue,
  details,
  assocModel,
  association,
  primaryKeyValue,
  session,
  relationUpdates,
}) => {
  if (association.dominant) {
    return _.set(
      {},
      association.alias,
      newValue ? newValue.map(v => v[assocModel.primaryKey] || v) : newValue
    );
  }

  const pullPromise = assocModel
    .updateMany(
      {
        [assocModel.primaryKey]: {
          $in: currentValue.map(v => new mongoose.Types.ObjectId(v[assocModel.primaryKey] || v)),
        },
      },
      { $pull: { [association.via]: new mongoose.Types.ObjectId(primaryKeyValue) } },
      { session }
    )
    .then(() =>
      assocModel.updateMany(
        {
          [assocModel.primaryKey]: {
            $in: newValue
              ? newValue.map(v => new mongoose.Types.ObjectId(v[assocModel.primaryKey] || v))
              : newValue,
          },
        },
        { $addToSet: { [association.via]: [primaryKeyValue] } },
        { session }
      )
    );

  relationUpdates.push(pullPromise);
};

const handleMorphToMany = async ({
  entry,
  attribute,
  newValue,
  association,
  details,
  primaryKeyValue,
  session,
  relationUpdates,
}) => {
  const currentIds = transformToArrayID(entry[attribute], this.primaryKey);
  const newIds = transformToArrayID(newValue, this.primaryKey);
  const toAdd = _.difference(newIds, currentIds);
  const toRemove = _.difference(currentIds, newIds);
  const targetModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  _.set(entry, attribute, _.isArray(newValue) ? newIds : newIds[0]);

  const addPromises = toAdd.map(id =>
    addRelationMorph(
      targetModel,
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
  relationUpdates.push(Promise.all(addPromises));

  toRemove.forEach(id => {
    relationUpdates.push(
      removeRelationMorph(
        targetModel,
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
};

const handleMorphFromMany = async ({
  entry,
  newValue,
  association,
  session,
  relationUpdates,
}) => {
  for (const obj of newValue) {
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

    const reverseAssoc = refModel.associations.find(a => a.alias === obj.field);
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
  }
};

/* -------------------------------------------------------------------------- */
/* Model methods                                                              */
/* -------------------------------------------------------------------------- */

module.exports = {
  async update(params, { session = null } = {}) {
    const relationUpdates = [];
    const populate = this.associations.map(a => a.alias);
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);

    const entry = await this.findOne({ [this.primaryKey]: primaryKeyValue })
      .session(session)
      .populate(populate)
      .lean();

    const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, attribute) => {
      const currentValue = entry[attribute];
      const newValue = params.values[attribute];
      const association = this.associations.find(a => a.alias === attribute);
      const details = this._attributes[attribute];

      // simple attribute
      if (!association && !details?.isVirtual) {
        return handleSimpleAttribute(acc, attribute, newValue);
      }

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

      switch (association.nature) {
        case 'oneWay':
          return handleOneWay(acc, attribute, newValue, assocModel);
        case 'manyToOne':
          return handleManyToOne(acc, attribute, newValue, assocModel);
        case 'oneToOne':
          Object.assign(
            acc,
            handleOneToOne.call(this, {
              entry,
              attribute,
              currentValue,
              newValue,
              details,
              primaryKeyValue,
              assocModel,
              session,
              relationUpdates,
            })
          );
          return acc;
        case 'oneToMany':
          handleOneToMany({
            currentValue,
            newValue,
            details,
            assocModel,
            primaryKeyValue,
            session,
            relationUpdates,
          });
          return acc;
        case 'manyToMany':
        case 'manyWay':
          handleManySide({
            currentValue,
            newValue,
            details,
            assocModel,
            association,
            primaryKeyValue,
            session,
            relationUpdates,
          });
          return acc;
        case 'manyMorphToMany':
        case 'manyMorphToOne':
          handleMorphFromMany({
            entry,
            newValue,
            association,
            session,
            relationUpdates,
          });
          break;
        case 'oneToManyMorph':
        case 'manyToManyMorph':
          handleMorphToMany({
            entry,
            attribute,
            newValue,
            association,
            details,
            primaryKeyValue,
            session,
            relationUpdates,
          });
          break;
        default:
          return acc;
      }
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

    return updatedEntity?.toObject ? updatedEntity.toObject() : updatedEntity;
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
                const reverseAssoc = targetModel.associations.find(a => a.alias === field);
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
        }
      })
    );
  },
};
```