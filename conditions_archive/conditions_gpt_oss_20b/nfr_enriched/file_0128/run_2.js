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
 * Convert a value or array of values to an array of string IDs.
 * @param {any} array
 * @param {string} pk
 * @returns {string[]}
 */
const transformToArrayID = (array, pk) => {
  if (_.isArray(array)) {
    return array
      .map((value) => value && (getValuePrimaryKey(value, pk) || value))
      .filter((n) => n)
      .map((val) => _.toString(val));
  }

  return transformToArrayID([array], pk);
};

/**
 * Remove keys with undefined values from an object.
 * @param {object} obj
 * @returns {object}
 */
const removeUndefinedKeys = (obj = {}) => _.pickBy(obj, _.negate(_.isUndefined));

/**
 * Add a morph relation to a model.
 * @param {object} model
 * @param {object} params
 * @param {object} options
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
 * Remove a morph relation from a model.
 * @param {object} model
 * @param {object} params
 * @param {object} options
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
 * Handle a single association update.
 * @param {string} attribute
 * @param {any} currentValue
 * @param {any} newValue
 * @param {object} entry
 * @param {object} params
 * @param {object} session
 * @param {Array} relationUpdates
 * @param {object} acc
 * @returns {object} updated accumulator
 */
const handleAssociation = (
  attribute,
  currentValue,
  newValue,
  entry,
  params,
  session,
  relationUpdates,
  acc
) => {
  const association = this.associations.find((x) => x.alias === attribute);
  const details = this._attributes[attribute];

  // Simple attributes
  if (!association && details?.isVirtual !== true) {
    return _.set(acc, attribute, newValue);
  }

  const assocModel = strapi.db.getModel(
    details.model || details.collection,
    details.plugin
  );

  switch (association.nature) {
    case 'oneWay':
      return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));

    case 'oneToOne':
      return handleOneToOne(
        attribute,
        currentValue,
        newValue,
        entry,
        assocModel,
        details,
        session,
        relationUpdates,
        acc
      );

    case 'oneToMany':
      return handleOneToMany(
        attribute,
        currentValue,
        newValue,
        entry,
        assocModel,
        details,
        session,
        relationUpdates,
        acc
      );

    case 'manyToOne':
      return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));

    case 'manyWay':
    case 'manyToMany':
      return handleManyToMany(
        attribute,
        currentValue,
        newValue,
        entry,
        assocModel,
        details,
        association,
        session,
        relationUpdates,
        acc
      );

    case 'manyMorphToMany':
    case 'manyMorphToOne':
      return handleManyMorph(
        attribute,
        newValue,
        entry,
        association,
        session,
        relationUpdates,
        acc
      );

    case 'oneToManyMorph':
    case 'manyToManyMorph':
      return handleMorphToModel(
        attribute,
        currentValue,
        newValue,
        entry,
        assocModel,
        details,
        association,
        session,
        relationUpdates,
        acc
      );

    case 'oneMorphToOne':
    case 'oneMorphToMany':
      // No action needed
      return acc;

    default:
      return acc;
  }
};

/**
 * Handle one-to-one association updates.
 */
const handleOneToOne = (
  attribute,
  currentValue,
  newValue,
  entry,
  assocModel,
  details,
  session,
  relationUpdates,
  acc
) => {
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
      { [details.via]: getValuePrimaryKey(entry[this.primaryKey], this.primaryKey) },
      { session }
    );
  });

  relationUpdates.push(updateLink);
  return _.set(acc, attribute, newValue);
};

/**
 * Handle one-to-many association updates.
 */
const handleOneToMany = (
  attribute,
  currentValue,
  newValue,
  entry,
  assocModel,
  details,
  session,
  relationUpdates,
  acc
) => {
  const attributeIds = currentValue;
  const toRemove = _.differenceWith(attributeIds, newValue, (a, b) => {
    return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
  });

  const updatePromise = assocModel
    .updateMany(
      {
        [assocModel.primaryKey]: {
          $in: toRemove.map((val) => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)),
        },
      },
      { [details.via]: null },
      { session }
    )
    .then(() => {
      return assocModel.updateMany(
        {
          [assocModel.primaryKey]: {
            $in: newValue.map((val) => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)),
          },
        },
        { [details.via]: getValuePrimaryKey(entry[this.primaryKey], this.primaryKey) },
        { session }
      );
    });

  relationUpdates.push(updatePromise);
  return acc;
};

/**
 * Handle many-to-many or many-way association updates.
 */
const handleManyToMany = (
  attribute,
  currentValue,
  newValue,
  entry,
  assocModel,
  details,
  association,
  session,
  relationUpdates,
  acc
) => {
  if (association.dominant) {
    return _.set(
      acc,
      attribute,
      newValue ? newValue.map((val) => val[assocModel.primaryKey] || val) : newValue
    );
  }

  const updatePromise = assocModel
    .updateMany(
      {
        [assocModel.primaryKey]: {
          $in: currentValue.map((val) => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)),
        },
      },
      {
        $pull: {
          [association.via]: new mongoose.Types.ObjectId(getValuePrimaryKey(entry[this.primaryKey], this.primaryKey)),
        },
      },
      { session }
    )
    .then(() => {
      return assocModel.updateMany(
        {
          [assocModel.primaryKey]: {
            $in: newValue
              ? newValue.map((val) => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val))
              : newValue,
          },
        },
        {
          $addToSet: { [association.via]: [getValuePrimaryKey(entry[this.primaryKey], this.primaryKey)] },
        },
        { session }
      );
    });

  relationUpdates.push(updatePromise);
  return acc;
};

/**
 * Handle many-morph-to-many or many-morph-to-one associations.
 */
const handleManyMorph = (
  attribute,
  newValue,
  entry,
  association,
  session,
  relationUpdates,
  acc
) => {
  newValue.forEach((obj) => {
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

    const reverseAssoc = refModel.associations.find((assoc) => assoc.alias === obj.field);
    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
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
};

/**
 * Handle one-to-many-morph or many-to-many-morph associations.
 */
const handleMorphToModel = (
  attribute,
  currentValue,
  newValue,
  entry,
  assocModel,
  details,
  association,
  session,
  relationUpdates,
  acc
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const newIds = transformToArrayID(newValue, this.primaryKey);

  const toAdd = _.difference(newIds, currentIds);
  const toRemove = _.difference(currentIds, newIds);

  if (!Array.isArray(newValue)) {
    _.set(acc, attribute, newIds[0]);
  } else {
    _.set(acc, attribute, newIds);
  }

  const addPromise = Promise.all(
    toAdd.map((id) => {
      return addRelationMorph(
        assocModel,
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

  toRemove.forEach((id) => {
    relationUpdates.push(
      removeRelationMorph(
        assocModel,
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
};

/**
 * Handle deletion of relations for a given entry.
 */
const handleDeleteRelation = async (association, entry, session) => {
  const { nature, via, dominant } = association;
  const primaryKeyValue = entry[this.primaryKey];

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
    case 'manyToManyMorph':
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

    case 'manyMorphToMany':
    case 'manyMorphToOne':
      if (!Array.isArray(entry[association.alias])) return;
      return Promise.all(
        entry[association.alias].map((val) => {
          const targetModel = strapi.db.getModelByGlobalId(val.kind);
          if (!targetModel) return;
          const field = val[association.filter];
          const reverseAssoc = targetModel.associations.find((assoc) => assoc.alias === field);
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

    case 'oneMorphToOne':
    case 'oneMorphToMany':
      return;
  }
};

module.exports = {
  async update(params, { session = null } = {}) {
    const relationUpdates = [];
    const populate = this.associations.map((x) => x.alias);
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);

    const entry = await this.findOne({ [this.primaryKey]: primaryKeyValue })
      .session(session)
      .populate(populate)
      .lean();

    const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, attribute) => {
      const currentValue = entry[attribute];
      const newValue = params.values[attribute];
      return handleAssociation.call(
        this,
        attribute,
        currentValue,
        newValue,
        entry,
        params,
        session,
        relationUpdates,
        acc
      );
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
    return Promise.all(
      this.associations.map((association) =>
        handleDeleteRelation.call(this, association, entry, session)
      )
    );
  },
};