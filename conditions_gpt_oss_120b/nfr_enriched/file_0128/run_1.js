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
 * Transform any value(s) to an array of string IDs.
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
 * Resolve the model for a given attribute definition.
 */
const resolveAttributeModel = (details) =>
  strapi.db.getModel(details.model || details.collection, details.plugin);

/**
 * Process a single attribute update based on its association nature.
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
  const association = this.associations.find((x) => x.alias === attribute);
  const details = this._attributes[attribute];

  // Simple attribute (no association)
  if (!association && !details?.isVirtual) {
    return { [attribute]: newValue };
  }

  const assocModel = resolveAttributeModel(details);

  switch (association.nature) {
    case 'oneWay':
      return {
        [attribute]: newValue?.[assocModel.primaryKey] ?? newValue,
      };

    case 'oneToOne':
      return await handleOneToOne({
        attribute,
        currentValue,
        newValue,
        assocModel,
        details,
        primaryKeyValue,
        relationUpdates,
      });

    case 'oneToMany':
      return await handleOneToMany({
        attribute,
        currentValue,
        newValue,
        assocModel,
        details,
        primaryKeyValue,
        relationUpdates,
      });

    case 'manyToOne':
      return {
        [attribute]: newValue?.[assocModel.primaryKey] ?? newValue,
      };

    case 'manyWay':
    case 'manyToMany':
      return await handleManyToMany({
        attribute,
        currentValue,
        newValue,
        assocModel,
        association,
        primaryKeyValue,
        relationUpdates,
      });

    case 'manyMorphToMany':
    case 'manyMorphToOne':
      await handleManyMorph({
        entry,
        association,
        newValue,
        relationUpdates,
        primaryKeyValue,
      });
      return {};

    case 'oneToManyMorph':
    case 'manyToManyMorph':
      await handleOneMorph({
        entry,
        association,
        currentValue,
        newValue,
        relationUpdates,
        primaryKeyValue,
        details,
      });
      return {};

    default:
      return {};
  }
};

/**
 * Handle one-to-one relation updates.
 */
const handleOneToOne = async ({
  attribute,
  currentValue,
  newValue,
  assocModel,
  details,
  primaryKeyValue,
  relationUpdates,
}) => {
  // No change
  if (currentValue === newValue) {
    return {};
  }

  // Unset relation
  if (_.isNull(newValue)) {
    const promise = assocModel.updateOne(
      {
        [assocModel.primaryKey]: getValuePrimaryKey(currentValue, assocModel.primaryKey),
      },
      { [details.via]: null },
      { session: relationUpdates.session }
    );
    relationUpdates.push(promise);
    return { [attribute]: null };
  }

  // Switch links
  const linkPromise = this.updateOne(
    { [attribute]: new mongoose.Types.ObjectId(newValue) },
    { [attribute]: null },
    { session: relationUpdates.session }
  ).then(() =>
    assocModel.updateOne(
      { [this.primaryKey]: new mongoose.Types.ObjectId(newValue) },
      { [details.via]: primaryKeyValue },
      { session: relationUpdates.session }
    )
  );

  relationUpdates.push(linkPromise);
  return { [attribute]: newValue };
};

/**
 * Handle one-to-many relation updates.
 */
const handleOneToMany = async ({
  attribute,
  currentValue,
  newValue,
  assocModel,
  details,
  primaryKeyValue,
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
          $in: toRemove.map((val) => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)),
        },
      },
      { [details.via]: null },
      { session: relationUpdates.session }
    )
    .then(() =>
      assocModel.updateMany(
        {
          [assocModel.primaryKey]: {
            $in: newValue.map((val) => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)),
          },
        },
        { [details.via]: primaryKeyValue },
        { session: relationUpdates.session }
      )
    );

  relationUpdates.push(removePromise);
  return {};
};

/**
 * Handle many-to-many (or manyWay) relation updates.
 */
const handleManyToMany = async ({
  attribute,
  currentValue,
  newValue,
  assocModel,
  association,
  primaryKeyValue,
  relationUpdates,
}) => {
  if (association.dominant) {
    return {
      [attribute]: newValue ? newValue.map((val) => val[assocModel.primaryKey] || val) : newValue,
    };
  }

  const unlinkPromise = assocModel
    .updateMany(
      {
        [assocModel.primaryKey]: {
          $in: currentValue.map((val) => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)),
        },
      },
      {
        $pull: {
          [association.via]: new mongoose.Types.ObjectId(primaryKeyValue),
        },
      },
      { session: relationUpdates.session }
    )
    .then(() =>
      assocModel.updateMany(
        {
          [assocModel.primaryKey]: {
            $in: newValue
              ? newValue.map((val) => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val))
              : newValue,
          },
        },
        {
          $addToSet: { [association.via]: [primaryKeyValue] },
        },
        { session: relationUpdates.session }
      )
    );

  relationUpdates.push(unlinkPromise);
  return {};
};

/**
 * Handle many-to-morph relations (media -> model).
 */
const handleManyMorph = async ({
  entry,
  association,
  newValue,
  relationUpdates,
  primaryKeyValue,
}) => {
  const thisModel = this;
  for (const obj of newValue) {
    const refModel = strapi.db.getModel(obj.ref, obj.source);
    const createRelation = () =>
      addRelationMorph(
        thisModel,
        {
          id: entry[thisModel.primaryKey],
          alias: association.alias,
          ref: obj.kind || refModel.globalId,
          refId: new mongoose.Types.ObjectId(obj.refId),
          field: obj.field,
          filter: association.filter,
        },
        { session: relationUpdates.session }
      );

    const reverseAssoc = refModel.associations.find((assoc) => assoc.alias === obj.field);
    if (reverseAssoc?.nature === 'oneToManyMorph') {
      relationUpdates.push(
        removeRelationMorph(
          thisModel,
          {
            alias: association.alias,
            ref: obj.kind || refModel.globalId,
            refId: new mongoose.Types.ObjectId(obj.refId),
            field: obj.field,
            filter: association.filter,
          },
          { session: relationUpdates.session }
        )
          .then(createRelation)
          .then(() =>
            refModel.updateMany(
              { [refModel.primaryKey]: new mongoose.Types.ObjectId(obj.refId) },
              { [obj.field]: new mongoose.Types.ObjectId(entry[thisModel.primaryKey]) },
              { session: relationUpdates.session }
            )
          )
      );
    } else {
      relationUpdates.push(
        createRelation().then(() =>
          refModel.updateMany(
            { [refModel.primaryKey]: new mongoose.Types.ObjectId(obj.refId) },
            { $push: { [obj.field]: new mongoose.Types.ObjectId(entry[thisModel.primaryKey]) } },
            { session: relationUpdates.session }
          )
        )
      );
    }
  }
};

/**
 * Handle one-to-morph relations (model -> media).
 */
const handleOneMorph = async ({
  entry,
  association,
  currentValue,
  newValue,
  relationUpdates,
  primaryKeyValue,
  details,
}) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const newIds = transformToArrayID(newValue, this.primaryKey);

  const toAdd = _.difference(newIds, currentIds);
  const toRemove = _.difference(currentIds, newIds);

  const targetModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  // Update attribute value on the main document
  if (!Array.isArray(newValue)) {
    entry[association.alias] = newIds[0];
  } else {
    entry[association.alias] = newIds;
  }

  const addPromises = toAdd.map((id) =>
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
      { session: relationUpdates.session }
    )
  );

  relationUpdates.push(Promise.all(addPromises));

  toRemove.forEach((id) => {
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
        { session: relationUpdates.session }
      )
    );
  });
};

/**
 * Update an entity and its relations.
 */
module.exports = {
  async update(params, { session = null } = {}) {
    const relationUpdates = [];
    relationUpdates.session = session; // attach session for helper use

    const populate = this.associations.map((x) => x.alias);
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);

    const entry = await this.findOne({ [this.primaryKey]: primaryKeyValue })
      .session(session)
      .populate(populate)
      .lean();

    const values = await Object.keys(removeUndefinedKeys(params.values)).reduce(
      async (accPromise, attribute) => {
        const acc = await accPromise;
        const updateFragment = await processAttribute.call(
          this,
          {
            attribute,
            entry,
            params,
            primaryKeyValue,
            relationUpdates,
          }
        );
        return { ...acc, ...updateFragment };
      },
      Promise.resolve({})
    );

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

  async deleteRelations(entry, { session = null } = {}) {
    const primaryKeyValue = entry[this.primaryKey];

    return Promise.all(
      this.associations.map(async (association) => {
        const { nature, via, dominant } = association;

        switch (nature) {
          case 'oneWay':
          case 'manyWay':
            return;

          case 'oneToMany':
          case 'oneToOne':
            if (!via) return;
            const targetModel1 = strapi.db.getModel(
              association.model || association.collection,
              association.plugin
            );
            return targetModel1.updateMany({ [via]: primaryKeyValue }, { [via]: null }, { session });

          case 'manyToMany':
          case 'manyToOne':
            if (!via || dominant) return;
            const targetModel2 = strapi.db.getModel(
              association.model || association.collection,
              association.plugin
            );
            return targetModel2.updateMany(
              { [via]: primaryKeyValue },
              { $pull: { [via]: primaryKeyValue } },
              { session }
            );

          case 'oneToManyMorph':
          case 'manyToManyMorph': {
            const targetModel3 = strapi.db.getModel(
              association.model || association.collection,
              association.plugin
            );
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
          }

          case 'manyMorphToMany':
          case 'manyMorphToOne': {
            if (!Array.isArray(entry[association.alias])) return;

            return Promise.all(
              entry[association.alias].map((val) => {
                const targetModel = strapi.db.getModelByGlobalId(val.kind);
                if (!targetModel) return;

                const field = val[association.filter];
                const reverseAssoc = targetModel.associations.find(
                  (assoc) => assoc.alias === field
                );

                if (reverseAssoc?.nature === 'oneToManyMorph') {
                  return targetModel.updateMany(
                    {
                      [targetModel.primaryKey]: val.ref && (val.ref._id || val.ref),
                    },
                    { [field]: null },
                    { session }
                  );
                }

                return targetModel.updateMany(
                  {
                    [targetModel.primaryKey]: val.ref && (val.ref._id || val.ref),
                  },
                  { $pull: { [field]: primaryKeyValue } },
                  { session }
                );
              })
            );
          }

          case 'oneMorphToOne':
          case 'oneMorphToMany':
            return;
        }
      })
    );
  },
};