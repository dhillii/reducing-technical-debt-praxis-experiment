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

/**
 * Convert any value to an array of string IDs.
 */
const transformToArrayID = (array, pk) => {
  if (_.isArray(array)) {
    return array
      .map(value => value && (getValuePrimaryKey(value, pk) || value))
      .filter(Boolean)
      .map(val => _.toString(val));
  }
  return transformToArrayID([array], pk);
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
 * Process simple (non‑association) attributes.
 */
const processSimpleAttribute = (acc, attribute, newValue, details) => {
  if (details?.isVirtual !== true) {
    _.set(acc, attribute, newValue);
  }
  return acc;
};

/**
 * Process one‑to‑one relations.
 */
const processOneToOne = async (
  self,
  acc,
  attribute,
  currentValue,
  newValue,
  details,
  assocModel,
  primaryKeyValue,
  relationUpdates,
  session
) => {
  if (currentValue === newValue) return acc;

  if (_.isNull(newValue)) {
    const promise = assocModel.updateOne(
      { [assocModel.primaryKey]: getValuePrimaryKey(currentValue, assocModel.primaryKey) },
      { [details.via]: null },
      { session }
    );
    relationUpdates.push(promise);
    _.set(acc, attribute, null);
    return acc;
  }

  const linkPromise = self
    .updateOne(
      { [attribute]: new mongoose.Types.ObjectId(newValue) },
      { [attribute]: null },
      { session }
    )
    .then(() =>
      assocModel.updateOne(
        { [self.primaryKey]: new mongoose.Types.ObjectId(newValue) },
        { [details.via]: primaryKeyValue },
        { session }
      )
    );

  relationUpdates.push(linkPromise);
  _.set(acc, attribute, newValue);
  return acc;
};

/**
 * Process one‑to‑many relations.
 */
const processOneToMany = async (
  acc,
  attribute,
  currentValue,
  newValue,
  details,
  assocModel,
  primaryKeyValue,
  relationUpdates,
  session
) => {
  const toRemove = _.differenceWith(currentValue, newValue, (a, b) => {
    const aId = a[assocModel.primaryKey] || a;
    const bId = b[assocModel.primaryKey] || b;
    return `${aId}` === `${bId}`;
  });

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
  return acc;
};

/**
 * Process many‑to‑many (non‑dominant) relations.
 */
const processManyToMany = async (
  acc,
  attribute,
  currentValue,
  newValue,
  details,
  assocModel,
  association,
  primaryKeyValue,
  relationUpdates,
  session
) => {
  const updatePromise = assocModel
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

  relationUpdates.push(updatePromise);
  return acc;
};

/**
 * Process dominant many‑to‑many relations.
 */
const processDominantMany = (acc, attribute, newValue, assocModel) => {
  _.set(
    acc,
    attribute,
    newValue ? newValue.map(v => v[assocModel.primaryKey] || v) : newValue
  );
  return acc;
};

/**
 * Process morph relations where the current model is the source.
 */
const processMorphSource = async (
  self,
  entry,
  attribute,
  newValue,
  association,
  details,
  relationUpdates,
  session
) => {
  newValue.forEach(obj => {
    const refModel = strapi.db.getModel(obj.ref, obj.source);
    const createRelation = () =>
      addRelationMorph(self, {
        id: entry[self.primaryKey],
        alias: association.alias,
        ref: obj.kind || refModel.globalId,
        refId: new mongoose.Types.ObjectId(obj.refId),
        field: obj.field,
        filter: association.filter,
      }, { session });

    const reverseAssoc = refModel.associations.find(a => a.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      relationUpdates.push(
        removeRelationMorph(self, {
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
              { [obj.field]: new mongoose.Types.ObjectId(entry[self.primaryKey]) },
              { session }
            )
          )
      );
    } else {
      relationUpdates.push(
        createRelation().then(() =>
          refModel.updateMany(
            { [refModel.primaryKey]: new mongoose.Types.ObjectId(obj.refId) },
            { $push: { [obj.field]: new mongoose.Types.ObjectId(entry[self.primaryKey]) } },
            { session }
          )
        )
      );
    }
  });
};

/**
 * Process morph relations where the current model is the target.
 */
const processMorphTarget = async (
  self,
  entry,
  attribute,
  currentValue,
  newValue,
  association,
  details,
  relationUpdates,
  session
) => {
  const currentIds = transformToArrayID(currentValue, self.primaryKey);
  const newIds = transformToArrayID(newValue, self.primaryKey);
  const toAdd = _.difference(newIds, currentIds);
  const toRemove = _.difference(currentIds, newIds);
  const targetModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  _.set(self, attribute, _.isArray(newValue) ? newIds : newIds[0]);

  const addPromises = toAdd.map(id =>
    addRelationMorph(targetModel, {
      id,
      alias: association.via,
      ref: self.globalId,
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
        ref: self.globalId,
        refId: entry._id,
        field: association.alias,
        filter: association.filter,
      }, { session })
    );
  });
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

      // Simple attribute
      if (!association) {
        return processSimpleAttribute(acc, attribute, newValue, details);
      }

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

      switch (association.nature) {
        case 'oneWay':
          _.set(acc, attribute, newValue?.[assocModel.primaryKey] ?? newValue);
          break;

        case 'oneToOne':
          return processOneToOne(
            this,
            acc,
            attribute,
            currentValue,
            newValue,
            details,
            assocModel,
            primaryKeyValue,
            relationUpdates,
            session
          );

        case 'oneToMany':
          return processOneToMany(
            acc,
            attribute,
            currentValue,
            newValue,
            details,
            assocModel,
            primaryKeyValue,
            relationUpdates,
            session
          );

        case 'manyToOne':
          _.set(acc, attribute, newValue?.[assocModel.primaryKey] ?? newValue);
          break;

        case 'manyWay':
        case 'manyToMany':
          if (association.dominant) {
            return processDominantMany(acc, attribute, newValue, assocModel);
          }
          return processManyToMany(
            acc,
            attribute,
            currentValue,
            newValue,
            details,
            assocModel,
            association,
            primaryKeyValue,
            relationUpdates,
            session
          );

        case 'manyMorphToMany':
        case 'manyMorphToOne':
          processMorphSource(
            this,
            entry,
            attribute,
            newValue,
            association,
            details,
            relationUpdates,
            session
          );
          break;

        case 'oneToManyMorph':
        case 'manyToManyMorph':
          processMorphTarget(
            this,
            entry,
            attribute,
            currentValue,
            newValue,
            association,
            details,
            relationUpdates,
            session
          );
          break;

        case 'oneMorphToOne':
        case 'oneMorphToMany':
          // No action required
          break;

        default:
          break;
      }

      return acc;
    }, {});

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

                if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
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