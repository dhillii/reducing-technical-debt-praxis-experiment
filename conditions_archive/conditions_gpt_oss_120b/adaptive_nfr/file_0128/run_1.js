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

  const opts = params?.id
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
 * Handlers for each association nature during update.
 * Each handler receives (context, acc, attribute, details, association, currentValue, newValue)
 * and returns the possibly modified accumulator.
 */
const natureHandlers = {
  oneWay(context, acc, attribute, details, association, _, newValue) {
    const assocModel = context.strapi.db.getModel(details.model || details.collection, details.plugin);
    return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
  },

  oneToOne(context, acc, attribute, details, association, currentValue, newValue) {
    const { primaryKeyValue, relationUpdates, session } = context;
    const assocModel = context.strapi.db.getModel(details.model || details.collection, details.plugin);

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

    const updateLink = context.self
      .updateOne(
        { [attribute]: new mongoose.Types.ObjectId(newValue) },
        { [attribute]: null },
        { session }
      )
      .then(() =>
        assocModel.updateOne(
          {
            [context.self.primaryKey]: new mongoose.Types.ObjectId(newValue),
          },
          { [details.via]: primaryKeyValue },
          { session }
        )
      );

    context.relationUpdates.push(updateLink);
    return _.set(acc, attribute, newValue);
  },

  oneToMany(context, acc, attribute, details, association, currentValue, newValue) {
    const { primaryKeyValue, relationUpdates, session } = context;
    const assocModel = context.strapi.db.getModel(details.model || details.collection, details.plugin);

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
      .then(() =>
        assocModel.updateMany(
          {
            [assocModel.primaryKey]: {
              $in: newValue.map(val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)),
            },
          },
          { [details.via]: primaryKeyValue },
          { session }
        )
      );

    relationUpdates.push(updatePromise);
    return acc;
  },

  manyToOne(context, acc, attribute, details, association, _, newValue) {
    const assocModel = context.strapi.db.getModel(details.model || details.collection, details.plugin);
    return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
  },

  manyWay(context, acc, attribute, details, association, _, newValue) {
    return this.manyToMany(context, acc, attribute, details, association, _, newValue);
  },

  manyToMany(context, acc, attribute, details, association, _, newValue) {
    const { primaryKeyValue, relationUpdates, session } = context;
    const assocModel = context.strapi.db.getModel(details.model || details.collection, details.plugin);

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
            $in: context.currentValue.map(
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
      .then(() =>
        assocModel.updateMany(
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
        )
      );

    relationUpdates.push(updatePromise);
    return acc;
  },

  manyMorphToMany(context, acc, attribute, details, association, _, newValue) {
    return this._handleMorph(context, acc, attribute, details, association, newValue);
  },

  manyMorphToOne(context, acc, attribute, details, association, _, newValue) {
    return this._handleMorph(context, acc, attribute, details, association, newValue);
  },

  oneToManyMorph(context, acc, attribute, details, association, currentValue, newValue) {
    return this._handleReverseMorph(context, acc, attribute, details, association, currentValue, newValue);
  },

  manyToManyMorph(context, acc, attribute, details, association, currentValue, newValue) {
    return this._handleReverseMorph(context, acc, attribute, details, association, currentValue, newValue);
  },

  oneMorphToOne() {
    // No operation needed
    return null;
  },

  oneMorphToMany() {
    // No operation needed
    return null;
  },

  _handleMorph(context, acc, attribute, details, association, newValue) {
    const { entry, relationUpdates, session } = context;
    newValue.forEach(obj => {
      const refModel = context.strapi.db.getModel(obj.ref, obj.source);

      const createRelation = () =>
        addRelationMorph(
          context.self,
          {
            id: entry[context.self.primaryKey],
            alias: association.alias,
            ref: obj.kind || refModel.globalId,
            refId: new mongoose.Types.ObjectId(obj.refId),
            field: obj.field,
            filter: association.filter,
          },
          { session }
        );

      const reverseAssoc = refModel.associations.find(assoc => assoc.alias === obj.field);
      if (reverseAssoc?.nature === 'oneToManyMorph') {
        relationUpdates.push(
          removeRelationMorph(
            context.self,
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
                  [obj.field]: new mongoose.Types.ObjectId(entry[context.self.primaryKey]),
                },
                { session }
              )
            )
        );
      } else {
        relationUpdates.push(
          createRelation().then(() =>
            refModel.updateMany(
              {
                [refModel.primaryKey]: new mongoose.Types.ObjectId(obj.refId),
              },
              {
                $push: { [obj.field]: new mongoose.Types.ObjectId(entry[context.self.primaryKey]) },
              },
              { session }
            )
          )
        );
      }
    });
    return acc;
  },

  _handleReverseMorph(context, acc, attribute, details, association, currentValue, newValue) {
    const { entry, relationUpdates, session } = context;
    const currentIds = transformToArrayID(currentValue, context.self.primaryKey);
    const newIds = transformToArrayID(newValue, context.self.primaryKey);

    const toAdd = _.difference(newIds, currentIds);
    const toRemove = _.difference(currentIds, newIds);

    const model = context.strapi.db.getModel(details.model || details.collection, details.plugin);

    if (!Array.isArray(newValue)) {
      _.set(acc, attribute, newIds[0]);
    } else {
      _.set(acc, attribute, newIds);
    }

    const addPromise = Promise.all(
      toAdd.map(id =>
        addRelationMorph(
          model,
          {
            id,
            alias: association.via,
            ref: context.self.globalId,
            refId: entry._id,
            field: association.alias,
            filter: association.filter,
          },
          { session }
        )
      )
    );

    relationUpdates.push(addPromise);

    toRemove.forEach(id => {
      relationUpdates.push(
        removeRelationMorph(
          model,
          {
            id,
            alias: association.via,
            ref: context.self.globalId,
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
};

/**
 * Handlers for each association nature during deleteRelations.
 */
const deleteNatureHandlers = {
  oneWay() {
    return null;
  },

  manyWay() {
    return null;
  },

  oneToMany(context) {
    const { primaryKeyValue, session, association } = context;
    if (!association.via) return null;
    const targetModel = context.strapi.db.getModel(
      association.model || association.collection,
      association.plugin
    );
    return targetModel.updateMany({ [association.via]: primaryKeyValue }, { [association.via]: null }, {
      session,
    });
  },

  oneToOne(context) {
    return this.oneToMany(context);
  },

  manyToMany(context) {
    const { primaryKeyValue, session, association } = context;
    if (!association.via || association.dominant) return null;
    const targetModel = context.strapi.db.getModel(
      association.model || association.collection,
      association.plugin
    );
    return targetModel.updateMany(
      { [association.via]: primaryKeyValue },
      { $pull: { [association.via]: primaryKeyValue } },
      { session }
    );
  },

  manyToOne(context) {
    return this.manyToMany(context);
  },

  oneToManyMorph(context) {
    const { primaryKeyValue, session, association } = context;
    const targetModel = context.strapi.db.getModel(
      association.model || association.collection,
      association.plugin
    );
    if (!targetModel) return null;

    const element = {
      ref: primaryKeyValue,
      kind: context.self.globalId,
      [association.filter]: association.alias,
    };

    return targetModel.updateMany(
      { [association.via]: { $elemMatch: element } },
      { $pull: { [association.via]: element } },
      { session }
    );
  },

  manyToManyMorph(context) {
    return this.oneToManyMorph(context);
  },

  manyMorphToMany(context) {
    const { entry, session, association } = context;
    if (!Array.isArray(entry[association.alias])) return null;

    return Promise.all(
      entry[association.alias].map(val => {
        const targetModel = context.strapi.db.getModelByGlobalId(val.kind);
        if (!targetModel) return null;

        const field = val[association.filter];
        const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === field);

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
            $pull: { [field]: entry[self.primaryKey] },
          },
          { session }
        );
      })
    );
  },

  manyMorphToOne(context) {
    return this.manyMorphToMany(context);
  },

  oneMorphToOne() {
    return null;
  },

  oneMorphToMany() {
    return null;
  },
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

      const handler = natureHandlers[association?.nature];
      if (handler) {
        const context = {
          self: this,
          strapi,
          entry,
          primaryKeyValue,
          relationUpdates,
          session,
          currentValue,
        };
        const result = handler(context, acc, attribute, details, association, currentValue, newValue);
        return result ?? acc;
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
        const context = {
          self: this,
          strapi,
          entry,
          primaryKeyValue,
          session,
          association,
        };
        const handler = deleteNatureHandlers[association.nature];
        if (handler) {
          return handler(context);
        }
        return null;
      })
    );
  },
};