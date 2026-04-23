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

/** @returns {boolean} True if association is a simple reference type */
const isSimpleReference = (nature) => nature === 'oneWay' || nature === 'manyToOne';

/** @returns {boolean} True if association is a one-to-one relationship */
const isOneToOne = (nature) => nature === 'oneToOne';

/** @returns {boolean} True if association is a one-to-many relationship */
const isOneToMany = (nature) => nature === 'oneToMany';

/** @returns {boolean} True if association is a many-to-many relationship */
const isManyToMany = (nature) => nature === 'manyToMany' || nature === 'manyWay';

/** @returns {boolean} True if association is a morph-to-many relationship */
const isMorphToMany = (nature) => nature === 'manyMorphToMany' || nature === 'manyMorphToOne';

/** @returns {boolean} True if association is a morph-to-one relationship */
const isMorphToOne = (nature) => nature === 'oneToManyMorph' || nature === 'manyToManyMorph';

/** @returns {boolean} True if association is a one-morph relationship */
const isOneMorph = (nature) => nature === 'oneMorphToOne' || nature === 'oneMorphToMany';

/**
 * Handles simple reference type associations (oneWay, manyToOne)
 */
const handleSimpleReference = (acc, attribute, newValue, assocModel) => {
  return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
};

/**
 * Handles one-to-one associations
 */
const handleOneToOne = async (acc, attribute, currentValue, newValue, details, assocModel, primaryKeyValue, relationUpdates, session) => {
  // if value is the same don't do anything
  if (currentValue === newValue) return acc;

  // if the value is null, set field to null on both sides
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

  // set old relations to null
  const updateLink = this.updateOne(
    { [attribute]: new mongoose.Types.ObjectId(newValue) },
    { [attribute]: null },
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

  // set new relation
  relationUpdates.push(updateLink);
  return _.set(acc, attribute, newValue);
};

/**
 * Handles one-to-many associations
 */
const handleOneToMany = async (acc, currentValue, newValue, details, assocModel, primaryKeyValue, relationUpdates, session) => {
  // set relation to null for all the ids not in the list
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
};

/**
 * Handles many-to-many associations
 */
const handleManyToMany = async (acc, attribute, currentValue, newValue, association, assocModel, primaryKeyValue, relationUpdates, session) => {
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

  relationUpdates.push(updatePromise);
  return acc;
};

/**
 * Handles morph-to-many associations
 */
const handleMorphToMany = async (entry, newValue, association, relationUpdates, session) => {
  newValue.forEach(obj => {
    const refModel = strapi.db.getModel(obj.ref, obj.source);

    const createRelation = () => {
      return addRelationMorph(
        this,
        {
          id: entry[this.primaryKey],
          alias: association.alias,
          ref: obj.kind || refModel.globalId,
          refId: new mongoose.Types.ObjectId(obj.refId),
          field: obj.field,
          filter: association.filter,
        },
        { session }
      );
    };

    // Clear relations to refModel
    const reverseAssoc = refModel.associations.find(assoc => assoc.alias === obj.field);
    if (reverseAssoc?.nature === 'oneToManyMorph') {
      relationUpdates.push(
        removeRelationMorph(
          this,
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
          .then(() => {
            // set field inside refModel
            return refModel.updateMany(
              {
                [refModel.primaryKey]: new mongoose.Types.ObjectId(obj.refId),
              },
              {
                [obj.field]: new mongoose.Types.ObjectId(entry[this.primaryKey]),
              },
              { session }
            );
          })
      );
    } else {
      relationUpdates.push(
        createRelation().then(() => {
          // push to field inside refModel
          return refModel.updateMany(
            {
              [refModel.primaryKey]: new mongoose.Types.ObjectId(obj.refId),
            },
            {
              $push: { [obj.field]: new mongoose.Types.ObjectId(entry[this.primaryKey]) },
            },
            { session }
          );
        })
      );
    }
  });
};

/**
 * Handles morph-to-one associations
 */
const handleMorphToOne = async (acc, attribute, currentValue, newValue, association, details, relationUpdates, session) => {
  // Compare array of ID to find deleted files.
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const newIds = transformToArrayID(newValue, this.primaryKey);

  const toAdd = _.difference(newIds, currentIds);
  const toRemove = _.difference(currentIds, newIds);

  const model = strapi.db.getModel(details.model || details.collection, details.plugin);

  if (!Array.isArray(newValue)) {
    _.set(acc, attribute, newIds[0]);
  } else {
    _.set(acc, attribute, newIds);
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
};

/**
 * Association update strategy dispatcher
 */
const associationUpdateStrategies = {
  oneWay: (ctx) => handleSimpleReference(ctx.acc, ctx.attribute, ctx.newValue, ctx.assocModel),
  manyToOne: (ctx) => handleSimpleReference(ctx.acc, ctx.attribute, ctx.newValue, ctx.assocModel),
  oneToOne: (ctx) => handleOneToOne.call(ctx.self, ctx.acc, ctx.attribute, ctx.currentValue, ctx.newValue, ctx.details, ctx.assocModel, ctx.primaryKeyValue, ctx.relationUpdates, ctx.session),
  oneToMany: (ctx) => handleOneToMany.call(ctx.self, ctx.acc, ctx.currentValue, ctx.newValue, ctx.details, ctx.assocModel, ctx.primaryKeyValue, ctx.relationUpdates, ctx.session),
  manyToMany: (ctx) => handleManyToMany.call(ctx.self, ctx.acc, ctx.attribute, ctx.currentValue, ctx.newValue, ctx.association, ctx.assocModel, ctx.primaryKeyValue, ctx.relationUpdates, ctx.session),
  manyWay: (ctx) => handleManyToMany.call(ctx.self, ctx.acc, ctx.attribute, ctx.currentValue, ctx.newValue, ctx.association, ctx.assocModel, ctx.primaryKeyValue, ctx.relationUpdates, ctx.session),
  manyMorphToMany: (ctx) => handleMorphToMany.call(ctx.self, ctx.entry, ctx.newValue, ctx.association, ctx.relationUpdates, ctx.session),
  manyMorphToOne: (ctx) => handleMorphToMany.call(ctx.self, ctx.entry, ctx.newValue, ctx.association, ctx.relationUpdates, ctx.session),
  oneToManyMorph: (ctx) => handleMorphToOne.call(ctx.self, ctx.acc, ctx.attribute, ctx.currentValue, ctx.newValue, ctx.association, ctx.details, ctx.relationUpdates, ctx.session),
  manyToManyMorph: (ctx) => handleMorphToOne.call(ctx.self, ctx.acc, ctx.attribute, ctx.currentValue, ctx.newValue, ctx.association, ctx.details, ctx.relationUpdates, ctx.session),
  oneMorphToOne: (ctx) => ctx.acc,
  oneMorphToMany: (ctx) => ctx.acc,
};

/**
 * Delete relation strategy dispatcher
 */
const deleteRelationStrategies = {
  oneWay: () => undefined,
  manyWay: () => undefined,
  oneToMany: (ctx) => ctx.via ? ctx.targetModel.updateMany({ [ctx.via]: ctx.primaryKeyValue }, { [ctx.via]: null }, { session: ctx.session }) : undefined,
  oneToOne: (ctx) => ctx.via ? ctx.targetModel.updateMany({ [ctx.via]: ctx.primaryKeyValue }, { [ctx.via]: null }, { session: ctx.session }) : undefined,
  manyToMany: (ctx) => (ctx.via && !ctx.dominant) ? ctx.targetModel.updateMany({ [ctx.via]: ctx.primaryKeyValue }, { $pull: { [ctx.via]: ctx.primaryKeyValue } }, { session: ctx.session }) : undefined,
  manyToOne: (ctx) => (ctx.via && !ctx.dominant) ? ctx.targetModel.updateMany({ [ctx.via]: ctx.primaryKeyValue }, { $pull: { [ctx.via]: ctx.primaryKeyValue } }, { session: ctx.session }) : undefined,
  oneToManyMorph: (ctx) => {
    if (!ctx.targetModel) return undefined;
    const element = {
      ref: ctx.primaryKeyValue,
      kind: ctx.globalId,
      [ctx.filter]: ctx.alias,
    };
    return ctx.targetModel.updateMany(
      { [ctx.via]: { $elemMatch: element } },
      { $pull: { [ctx.via]: element } },
      { session: ctx.session }
    );
  },
  manyToManyMorph: (ctx) => {
    if (!Array.isArray(ctx.entryAlias)) return undefined;
    return Promise.all(
      ctx.entryAlias.map(val => {
        const targetModel = strapi.db.getModelByGlobalId(val.kind);
        if (!targetModel) return undefined;

        const field = val[ctx.filter];
        const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === field);

        if (reverseAssoc?.nature === 'oneToManyMorph') {
          return targetModel.updateMany(
            {
              [targetModel.primaryKey]: val.ref?._id || val.ref,
            },
            {
              [field]: null,
            },
            { session: ctx.session }
            );
        }

        return targetModel.updateMany(
          {
            [targetModel.primaryKey]: val.ref?._id || val.ref,
          },
          {
            $pull: { [field]: ctx.primaryKeyValue },
          },
          { session: ctx.session }
        );
      })
    );
  },
  manyMorphToMany: (ctx) => {
    if (!Array.isArray(ctx.entryAlias)) return undefined;
    return Promise.all(
      ctx.entryAlias.map(val => {
        const targetModel = strapi.db.getModelByGlobalId(val.kind);
        if (!targetModel) return undefined;

        const field = val[ctx.filter];
        const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === field);

        if (reverseAssoc?.nature === 'oneToManyMorph') {
          return targetModel.updateMany(
            {
              [targetModel.primaryKey]: val.ref?._id || val.ref,
            },
            {
              [field]: null,
            },
            { session: ctx.session }
          );
        }

        return targetModel.updateMany(
          {
            [targetModel.primaryKey]: val.ref?._id || val.ref,
          },
          {
            $pull: { [field]: ctx.primaryKeyValue },
          },
          { session: ctx.session }
        );
      })
    );
  },
  manyMorphToOne: (ctx) => {
    if (!Array.isArray(ctx.entryAlias)) return undefined;
    return Promise.all(
      ctx.entryAlias.map(val => {
        const targetModel = strapi.db.getModelByGlobalId(val.kind);
        if (!targetModel) return undefined;

        const field = val[ctx.filter];
        const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === field);

        if (reverseAssoc?.nature === 'oneToManyMorph') {
          return targetModel.updateMany(
            {
              [targetModel.primaryKey]: val.ref?._id || val.ref,
            },
            {
              [field]: null,
            },
            { session: ctx.session }
          );
        }

        return targetModel.updateMany(
          {
            [targetModel.primaryKey]: val.ref?._id || val.ref,
          },
          {
            $pull: { [field]: ctx.primaryKeyValue },
          },
          { session: ctx.session }
        );
      })
    );
  },
  oneMorphToOne: () => undefined,
  oneMorphToMany: () => undefined,
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

      // set simple attributes
      if (!association && _.get(details, 'isVirtual') !== true) {
        return _.set(acc, attribute, newValue);
      }

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

      const strategy = associationUpdateStrategies[association.nature];
      if (strategy) {
        return strategy({
          acc,
          attribute,
          currentValue,
          newValue,
          association,
          details,
          assocModel,
          primaryKeyValue,
          relationUpdates,
          session,
          self: this,
          entry,
        });
      }

      return acc;
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

    return updatedEntity?.toObject?.() || updatedEntity;
  },

  deleteRelations(entry, { session = null } = {}) {
    const primaryKeyValue = entry[this.primaryKey];

    return Promise.all(
      this.associations.map(async association => {
        const { nature, via, dominant, alias, filter } = association;

        const targetModel = strapi.db.getModel(
          association.model || association.collection,
          association.plugin
        );

        const strategy = deleteRelationStrategies[nature];
        if (strategy) {
          return strategy({
            via,
            dominant,
            primaryKeyValue,
            targetModel,
            session,
            globalId: this.globalId,
            alias,
            filter,
            entryAlias: entry[alias],
          });
        }

        return undefined;
      })
    );
  },
};