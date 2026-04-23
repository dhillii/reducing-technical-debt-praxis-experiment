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
 * Transform a value or array of values to an array of string IDs.
 * @param {any|any[]} array
 * @param {string} pk
 * @returns {string[]}
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
 * Handlers for different association natures during update.
 */
const natureHandlers = {
  oneWay: ({
    acc,
    attribute,
    newValue,
    assocModel,
  }) => _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue)),

  oneToOne: ({
    acc,
    attribute,
    newValue,
    currentValue,
    assocModel,
    details,
    primaryKeyValue,
    relationUpdates,
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
      return _.set(acc, attribute, null);
    }

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

    relationUpdates.push(updateLink);
    return _.set(acc, attribute, newValue);
  },

  oneToMany: ({
    acc,
    attribute,
    newValue,
    currentValue,
    assocModel,
    details,
    primaryKeyValue,
    relationUpdates,
    session,
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
    return acc;
  },

  manyToOne: ({
    acc,
    attribute,
    newValue,
    assocModel,
  }) => _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue)),

  manyWay: handleManyToManyOrManyWay,
  manyToMany: handleManyToManyOrManyWay,

  manyMorphToMany: handleManyMorph,
  manyMorphToOne: handleManyMorph,

  oneToManyMorph: handleOneMorph,
  manyToManyMorph: handleOneMorph,

  oneMorphToOne: () => {},
  oneMorphToMany: () => {},
};

/**
 * Handler for many-to-many and many-way relations.
 */
function handleManyToManyOrManyWay({
  acc,
  attribute,
  newValue,
  currentValue,
  assocModel,
  association,
  primaryKeyValue,
  relationUpdates,
  session,
}) {
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

  relationUpdates.push(updatePromise);
  return acc;
}

/**
 * Handler for many morph relations.
 */
function handleManyMorph({
  acc,
  attribute,
  newValue,
  entry,
  association,
  relationUpdates,
  session,
}) {
  newValue.forEach(obj => {
    const refModel = strapi.db.getModel(obj.ref, obj.source);

    const createRelation = () => {
      return addRelationMorph(this, {
        id: entry[this.primaryKey],
        alias: association.alias,
        ref: obj.kind || refModel.globalId,
        refId: new mongoose.Types.ObjectId(obj.refId),
        field: obj.field,
        filter: association.filter,
      }, { session });
    };

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
          .then(() => {
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
  return acc;
}

/**
 * Handler for one morph relations (model -> media).
 */
function handleOneMorph({
  acc,
  attribute,
  newValue,
  currentValue,
  details,
  entry,
  association,
  relationUpdates,
  session,
}) {
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
      return addRelationMorph(model, {
        id,
        alias: association.via,
        ref: this.globalId,
        refId: entry._id,
        field: association.alias,
        filter: association.filter,
      }, { session });
    })
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

  return acc;
}

/**
 * Exported methods.
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

      // set simple attributes
      if (!association && details?.isVirtual !== true) {
        return _.set(acc, attribute, newValue);
      }

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
      const handler = natureHandlers[association.nature];

      if (handler) {
        return handler.call(this, {
          acc,
          attribute,
          newValue,
          currentValue,
          assocModel,
          details,
          primaryKeyValue,
          relationUpdates,
          session,
          entry,
          association,
        });
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

    const deleteHandlers = {
      oneWay: () => {},
      manyWay: () => {},
      oneToMany: handleDeleteOneToManyOrOneToOne,
      oneToOne: handleDeleteOneToManyOrOneToOne,
      manyToMany: handleDeleteManyToManyOrManyToOne,
      manyToOne: handleDeleteManyToManyOrManyToOne,
      oneToManyMorph: handleDeleteMorphRelations,
      manyToManyMorph: handleDeleteMorphRelations,
      manyMorphToMany: handleDeleteManyMorphToManyOrOne,
      manyMorphToOne: handleDeleteManyMorphToManyOrOne,
      oneMorphToOne: () => {},
      oneMorphToMany: () => {},
    };

    return Promise.all(
      this.associations.map(async association => {
        const handler = deleteHandlers[association.nature];
        if (handler) {
          return handler.call(this, association, entry, primaryKeyValue, session);
        }
      })
    );
  },
};

/**
 * Delete handler for one-to-many and one-to-one relations.
 */
function handleDeleteOneToManyOrOneToOne(association, entry, primaryKeyValue, session) {
  if (!association.via) return;
  const targetModel = strapi.db.getModel(
    association.model || association.collection,
    association.plugin
  );
  return targetModel.updateMany({ [association.via]: primaryKeyValue }, { [association.via]: null }, { session });
}

/**
 * Delete handler for many-to-many and many-to-one relations.
 */
function handleDeleteManyToManyOrManyToOne(association, entry, primaryKeyValue, session) {
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
}

/**
 * Delete handler for morph relations (one-to-many morph and many-to-many morph).
 */
function handleDeleteMorphRelations(association, entry, primaryKeyValue, session) {
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
}

/**
 * Delete handler for many morph to many/one relations.
 */
function handleDeleteManyMorphToManyOrOne(association, entry, primaryKeyValue, session) {
  if (!Array.isArray(entry[association.alias])) return;

  return Promise.all(
    entry[association.alias].map(val => {
      const targetModel = strapi.db.getModelByGlobalId(val.kind);
      if (!targetModel) return;

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
          $pull: { [field]: primaryKeyValue },
        },
        { session }
      );
    })
  );
}