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
 * Association handlers for update operation
 */
const associationHandlers = {
  oneWay: ({ acc, newValue, assocModel }) => {
    return _.set(acc, newValue, _.get(newValue, assocModel.primaryKey, newValue));
  },
  oneToOne: async ({
    acc,
    currentValue,
    newValue,
    details,
    assocModel,
    primaryKeyValue,
    session,
  }) => {
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
      return _.set(acc, newValue, null);
    }

    const updateLink = this.updateOne(
      { [details.via]: new mongoose.Types.ObjectId(newValue) },
      { [details.via]: null },
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
    return _.set(acc, newValue, newValue);
  },
  oneToMany: async ({
    acc,
    currentValue,
    newValue,
    details,
    assocModel,
    primaryKeyValue,
    session,
  }) => {
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
  },
  manyToOne: ({ acc, newValue, assocModel }) => {
    return _.set(acc, newValue, _.get(newValue, assocModel.primaryKey, newValue));
  },
  manyWay: async ({
    acc,
    currentValue,
    newValue,
    details,
    association,
    assocModel,
    primaryKeyValue,
    session,
  }) => {
    if (association.dominant) {
      return _.set(
        acc,
        newValue,
        newValue ? newValue.map(val => val[assocModel.primaryKey] || val) : newValue
      );
    }

    const updatePomise = assocModel
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

    relationUpdates.push(updatePomise);
    return acc;
  },
  manyToMany: associationHandlers.manyWay,
  manyMorphToMany: associationHandlers.manyWay,
  manyMorphToOne: associationHandlers.manyWay,
  oneToManyMorph: async ({
    acc,
    newValue,
    entry,
    association,
    session,
  }) => {
    const currentIds = transformToArrayID(entry[association.via], this.primaryKey);
    const newIds = transformToArrayID(newValue, this.primaryKey);

    const toAdd = _.difference(newIds, currentIds);
    const toRemove = _.difference(currentIds, newIds);

    const model = strapi.db.getModel(details.model || details.collection, details.plugin);

    if (!Array.isArray(newValue)) {
      _.set(acc, newIds[0]);
    } else {
      _.set(acc, newIds);
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
  },
  manyToManyMorph: associationHandlers.oneToManyMorph,
  oneMorphToOne: () => {},
  oneMorphToMany: () => {},
};

const deleteRelationHandlers = {
  oneWay: () => {},
  manyWay: () => {},
  oneToMany: async ({ association, via, primaryKeyValue, session }) => {
    if (!via) return;
    const targetModel = strapi.db.getModel(
      association.model || association.collection,
      association.plugin
    );
    return targetModel.updateMany({ [via]: primaryKeyValue }, { [via]: null }, { session });
  },
  oneToOne: async ({ association, via, primaryKeyValue, session }) => {
    if (!via) return;
    const targetModel = strapi.db.getModel(
      association.model || association.collection,
      association.plugin
    );
    return targetModel.updateMany({ [via]: primaryKeyValue }, { [via]: null }, { session });
  },
  manyToMany: async ({ association, via, dominant, primaryKeyValue, session }) => {
    if (!via || dominant) return;
    const targetModel = strapi.db.getModel(
      association.model || association.collection,
      association.plugin
    );
    return targetModel.updateMany(
      { [via]: primaryKeyValue },
      { $pull: { [via]: primaryKeyValue } },
      { session }
    );
  },
  manyToOne: async ({ association, via, dominant, primaryKeyValue, session }) => {
    if (!via || dominant) return;
    const targetModel = strapi.db.getModel(
      association.model || association.collection,
      association.plugin
    );
    return targetModel.updateMany(
      { [via]: primaryKeyValue },
      { $pull: { [via]: primaryKeyValue } },
      { session }
    );
  },
  oneToManyMorph: async ({ association, via, primaryKeyValue, session }) => {
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
      { [via]: { $elemMatch: element } },
      { $pull: { [via]: element } },
      { session }
    );
  },
  manyToManyMorph: deleteRelationHandlers.oneToManyMorph,
  manyMorphToMany: async ({ association, entry, primaryKeyValue, session }) => {
    if (!Array.isArray(entry[association.alias])) return;
    return Promise.all(
      entry[association.alias].map(val => {
        const targetModel = strapi.db.getModelByGlobalId(val.kind);
        if (!targetModel) return;
        const field = val[association.filter];
        const reverseAssoc = targetModel.associations.find(
          assoc => assoc.alias === field
        );
        if (reverseAssoc?.nature === 'oneToManyMorph') {
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
  manyMorphToOne: deleteRelationHandlers.manyMorphToMany,
  oneMorphToOne: () => {},
  oneMorphToMany: () => {},
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

    const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, attribute) => {
      const currentValue = entry[attribute];
      const newValue = params.values[attribute];

      const association = this.associations.find(x => x.alias === attribute);
      const details = this._attributes[attribute];

      if (!association && _.get(details, 'isVirtual') !== true) {
        return _.set(acc, attribute, newValue);
      }

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

      const handler = associationHandlers[association.nature];
      if (handler) {
        const result = handler({
          acc,
          attribute,
          currentValue,
          newValue,
          details,
          association,
          assocModel,
          primaryKeyValue,
          entry,
          session,
          relationUpdates,
        });
        return result instanceof Promise ? result : result;
      }

      return acc;
    }, {});

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

        const handler = deleteRelationHandlers[nature];
        if (handler) {
          return handler({
            association,
            via,
            dominant,
            primaryKeyValue,
            entry,
            session,
          });
        }
      })
    );
  },
};