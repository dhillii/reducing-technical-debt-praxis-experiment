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
 * Add a morph relation.
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
 * Remove a morph relation.
 */
const removeRelationMorph = async (model, params, { session = null } = {}) => {
  const { alias } = params;

  let opts;
  // if entry id is provided simply query it
  if (params?.id) {
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
 * Handlers for association natures during update.
 */
const handleOneWay = ({ assocModel, newValue }) => _.get(newValue, assocModel.primaryKey, newValue);

const handleManyToOne = ({ assocModel, newValue }) => _.get(newValue, assocModel.primaryKey, newValue);

const handleOneToMany = ({
  thisModel,
  entry,
  attribute,
  currentValue,
  newValue,
  assocModel,
  details,
  primaryKeyValue,
  session,
}) => {
  const toRemove = _.differenceWith(currentValue, newValue, (a, b) => {
    return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
  });

  const removePromise = assocModel
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

  return { promise: removePromise, accUpdate: {} };
};

const handleOneToOne = async ({
  thisModel,
  entry,
  attribute,
  currentValue,
  newValue,
  assocModel,
  details,
  primaryKeyValue,
  session,
}) => {
  if (currentValue === newValue) return { accUpdate: {} };

  if (_.isNull(newValue)) {
    const nullPromise = assocModel.updateOne(
      {
        [assocModel.primaryKey]: getValuePrimaryKey(currentValue, assocModel.primaryKey),
      },
      { [details.via]: null },
      { session }
    );
    return { promise: nullPromise, accUpdate: { [attribute]: null } };
  }

  const linkPromise = thisModel
    .updateOne(
      { [attribute]: new mongoose.Types.ObjectId(newValue) },
      { [attribute]: null },
      { session }
    )
    .then(() => {
      return assocModel.updateOne(
        {
          [thisModel.primaryKey]: new mongoose.Types.ObjectId(newValue),
        },
        { [details.via]: primaryKeyValue },
        { session }
      );
    });

  return { promise: linkPromise, accUpdate: { [attribute]: newValue } };
};

const handleManyToManyOrManyWay = ({
  thisModel,
  entry,
  attribute,
  currentValue,
  newValue,
  assocModel,
  details,
  association,
  primaryKeyValue,
  session,
}) => {
  if (association.dominant) {
    const normalized = newValue ? newValue.map(val => val[assocModel.primaryKey] || val) : newValue;
    return { accUpdate: { [attribute]: normalized } };
  }

  const updatePromise = assocModel
    .updateMany(
      {
        [assocModel.primaryKey]: {
          $in: currentValue.map(val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)),
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
              ? newValue.map(val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val))
              : newValue,
          },
        },
        {
          $addToSet: { [association.via]: [primaryKeyValue] },
        },
        { session }
      );
    });

  return { promise: updatePromise, accUpdate: {} };
};

const handleMorphToMany = ({
  thisModel,
  entry,
  attribute,
  currentValue,
  newValue,
  association,
  details,
  primaryKeyValue,
  session,
}) => {
  const currentIds = transformToArrayID(currentValue, thisModel.primaryKey);
  const newIds = transformToArrayID(newValue, thisModel.primaryKey);

  const toAdd = _.difference(newIds, currentIds);
  const toRemove = _.difference(currentIds, newIds);

  const targetModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  const accUpdate = Array.isArray(newValue) ? { [attribute]: newIds } : { [attribute]: newIds[0] };

  const addPromise = Promise.all(
    toAdd.map(id =>
      addRelationMorph(
        targetModel,
        {
          id,
          alias: association.via,
          ref: thisModel.globalId,
          refId: entry._id,
          field: association.alias,
          filter: association.filter,
        },
        { session }
      )
    )
  );

  const removePromises = toRemove.map(id =>
    removeRelationMorph(
      targetModel,
      {
        id,
        alias: association.via,
        ref: thisModel.globalId,
        refId: entry._id,
        field: association.alias,
        filter: association.filter,
      },
      { session }
    )
  );

  return { promise: Promise.all([addPromise, ...removePromises]), accUpdate };
};

const handleMorphToOneOrMany = ({
  thisModel,
  entry,
  attribute,
  newValue,
  association,
  session,
}) => {
  const promises = [];

  newValue.forEach(obj => {
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
        { session }
      );

    const reverseAssoc = refModel.associations.find(assoc => assoc.alias === obj.field);
    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      promises.push(
        removeRelationMorph(
          thisModel,
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
          .then(() =>
            refModel.updateMany(
              {
                [refModel.primaryKey]: new mongoose.Types.ObjectId(obj.refId),
              },
              {
                [obj.field]: new mongoose.Types.ObjectId(entry[thisModel.primaryKey]),
              },
              { session }
            )
          )
      );
    } else {
      promises.push(
        createRelation().then(() =>
          refModel.updateMany(
            {
              [refModel.primaryKey]: new mongoose.Types.ObjectId(obj.refId),
            },
            {
              $push: { [obj.field]: new mongoose.Types.ObjectId(entry[thisModel.primaryKey]) },
            },
            { session }
          )
        )
      );
    }
  });

  return { promise: Promise.all(promises), accUpdate: {} };
};

const natureHandlers = {
  oneWay: ({ assocModel, newValue }) => ({ accUpdate: { value: handleOneWay({ assocModel, newValue }) } }),
  manyToOne: ({ assocModel, newValue }) => ({ accUpdate: { value: handleManyToOne({ assocModel, newValue }) } }),
  oneToMany: handleOneToMany,
  oneToOne: handleOneToOne,
  manyToMany: handleManyToManyOrManyWay,
  manyWay: handleManyToManyOrManyWay,
  manyMorphToMany: handleMorphToOneOrMany,
  manyMorphToOne: handleMorphToOneOrMany,
  oneToManyMorph: handleMorphToMany,
  manyToManyMorph: handleMorphToMany,
  oneMorphToOne: () => ({ accUpdate: {} }),
  oneMorphToMany: () => ({ accUpdate: {} }),
};

/**
 * Update method with reduced branching.
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
        return _.set(acc, attribute, newValue);
      }

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
      const handler = natureHandlers[association.nature];

      if (!handler) {
        return acc;
      }

      const result = handler({
        thisModel: this,
        entry,
        attribute,
        currentValue,
        newValue,
        assocModel,
        details,
        association,
        primaryKeyValue,
        session,
      });

      if (result.promise) {
        relationUpdates.push(result.promise);
      }

      if (result.accUpdate) {
        const updated = result.accUpdate;
        if (updated.value !== undefined) {
          _.set(acc, attribute, updated.value);
        } else {
          _.assign(acc, updated);
        }
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

  deleteRelations(entry, { session = null } = {}) {
    const primaryKeyValue = entry[this.primaryKey];

    const deleteHandlers = {
      oneWay: () => Promise.resolve(),
      manyWay: () => Promise.resolve(),
      oneToMany: async ({ association }) => {
        if (!association.via) return;
        const targetModel = strapi.db.getModel(
          association.model || association.collection,
          association.plugin
        );
        return targetModel.updateMany({ [association.via]: primaryKeyValue }, { [association.via]: null }, { session });
      },
      oneToOne: async ({ association }) => {
        if (!association.via) return;
        const targetModel = strapi.db.getModel(
          association.model || association.collection,
          association.plugin
        );
        return targetModel.updateMany({ [association.via]: primaryKeyValue }, { [association.via]: null }, { session });
      },
      manyToMany: async ({ association }) => {
        if (!association.via || association.dominant) return;
        const targetModel = strapi.db.getModel(
          association.model || association.collection,
          association.plugin
        );
        return targetModel.updateMany(
          { [association.via]: primaryKeyValue },
          { $pull: { [association.via]: primaryKeyValue } },
          { session }
        );
      },
      manyToOne: async ({ association }) => {
        if (!association.via || association.dominant) return;
        const targetModel = strapi.db.getModel(
          association.model || association.collection,
          association.plugin
        );
        return targetModel.updateMany(
          { [association.via]: primaryKeyValue },
          { $pull: { [association.via]: primaryKeyValue } },
          { session }
        );
      },
      oneToManyMorph: async ({ association }) => {
        const targetModel = strapi.db.getModel(
          association.model || association.collection,
          association.plugin
        );
        if (!targetModel) return;
        const element = {
          ref: primaryKeyValue,
          kind: this.globalId,
          [association.filter]: association.alias,
        };
        return targetModel.updateMany(
          { [association.via]: { $elemMatch: element } },
          { $pull: { [association.via]: element } },
          { session }
        );
      },
      manyToManyMorph: async ({ association }) => {
        const targetModel = strapi.db.getModel(
          association.model || association.collection,
          association.plugin
        );
        if (!targetModel) return;
        const element = {
          ref: primaryKeyValue,
          kind: this.globalId,
          [association.filter]: association.alias,
        };
        return targetModel.updateMany(
          { [association.via]: { $elemMatch: element } },
          { $pull: { [association.via]: element } },
          { session }
        );
      },
      manyMorphToMany: async ({ association }) => {
        if (!Array.isArray(entry[association.alias])) return;
        return Promise.all(
          entry[association.alias].map(val => {
            const targetModel = strapi.db.getModelByGlobalId(val.kind);
            if (!targetModel) return;
            const field = val[association.filter];
            const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === field);
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
      },
      manyMorphToOne: async ({ association }) => {
        // Same handling as manyMorphToMany
        return deleteHandlers.manyMorphToMany({ association });
      },
      oneMorphToOne: () => Promise.resolve(),
      oneMorphToMany: () => Promise.resolve(),
    };

    return Promise.all(
      this.associations.map(async association => {
        const handler = deleteHandlers[association.nature];
        if (handler) {
          return handler({ association });
        }
      })
    );
  },
};