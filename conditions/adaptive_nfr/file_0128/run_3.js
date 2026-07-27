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

/** @type {Object<string, Function>} Strategy handlers for association nature types */
const associationHandlers = {
  oneWay: (acc, attribute, newValue, assocModel) => {
    return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
  },

  manyToOne: (acc, attribute, newValue, assocModel) => {
    return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
  },
};

/** @type {Object<string, Function>} Strategy handlers for delete relation nature types */
const deleteRelationHandlers = {
  oneWay: () => undefined,
  manyWay: () => undefined,
  oneMorphToOne: () => undefined,
  oneMorphToMany: () => undefined,
};

/**
 * Determines if a value is null
 * @param {*} value - The value to check
 * @returns {boolean} True if value is null
 */
const isNullValue = (value) => _.isNull(value);

/**
 * Determines if values are equal
 * @param {*} current - Current value
 * @param {*} newVal - New value
 * @returns {boolean} True if values are equal
 */
const areValuesEqual = (current, newVal) => current === newVal;

/**
 * Extracts primary key from value
 * @param {*} value - The value to extract from
 * @param {string} primaryKey - The primary key field name
 * @returns {*} The primary key value
 */
const extractPrimaryKey = (value, primaryKey) => value?.[primaryKey] || value;

/**
 * Handles oneToOne association updates
 */
const handleOneToOne = async (
  acc,
  attribute,
  currentValue,
  newValue,
  assocModel,
  details,
  primaryKeyValue,
  relationUpdates,
  session
) => {
  if (areValuesEqual(currentValue, newValue)) return acc;

  if (isNullValue(newValue)) {
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
};

/**
 * Handles oneToMany association updates
 */
const handleOneToMany = async (
  acc,
  currentValue,
  newValue,
  assocModel,
  details,
  primaryKeyValue,
  relationUpdates,
  session
) => {
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
 * Handles manyToMany and manyWay association updates
 */
const handleManyToMany = async (
  acc,
  attribute,
  currentValue,
  newValue,
  association,
  assocModel,
  primaryKeyValue,
  relationUpdates,
  session
) => {
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
 * Handles manyMorphToMany and manyMorphToOne association updates
 */
const handleManyMorph = async (
  newValue,
  association,
  entry,
  relationUpdates,
  session
) => {
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

    const reverseAssoc = refModel.associations?.find(assoc => assoc.alias === obj.field);
    const isOneToManyMorph = reverseAssoc?.nature === 'oneToManyMorph';

    if (isOneToManyMorph) {
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
};

/**
 * Handles oneToManyMorph and manyToManyMorph association updates
 */
const handleMorphToMany = async (
  acc,
  attribute,
  currentValue,
  newValue,
  association,
  details,
  entry,
  relationUpdates,
  session
) => {
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

  return acc;
};

/**
 * Handles oneToMany and oneToOne delete relations
 */
const deleteOneToManyOrOneToOne = (via, primaryKeyValue, targetModel, session) => {
  if (!via) {
    return undefined;
  }

  return targetModel.updateMany({ [via]: primaryKeyValue }, { [via]: null }, { session });
};

/**
 * Handles manyToMany and manyToOne delete relations
 */
const deleteManyToManyOrManyToOne = (via, dominant, primaryKeyValue, targetModel, session) => {
  if (!via || dominant) {
    return undefined;
  }

  return targetModel.updateMany(
    { [via]: primaryKeyValue },
    { $pull: { [via]: primaryKeyValue } },
    { session }
  );
};

/**
 * Handles oneToManyMorph and manyToManyMorph delete relations
 */
const deleteMorphToMany = (via, primaryKeyValue, globalId, filter, alias, targetModel, session) => {
  if (!targetModel) return undefined;

  const element = {
    ref: primaryKeyValue,
    kind: globalId,
    [filter]: alias,
  };

  return targetModel.updateMany(
    { [via]: { $elemMatch: element } },
    { $pull: { [via]: element } },
    { session }
  );
};

/**
 * Handles manyMorphToMany and manyMorphToOne delete relations
 */
const deleteManyMorphToManyOrOne = (entry, association, primaryKeyValue, session) => {
  if (!Array.isArray(entry[association.alias])) {
    return undefined;
  }

  return Promise.all(
    entry[association.alias].map(val => {
      const targetModel = strapi.db.getModelByGlobalId(val.kind);

      if (!targetModel) return undefined;

      const field = val[association.filter];
      const reverseAssoc = targetModel.associations?.find(
        assoc => assoc.alias === field
      );

      if (reverseAssoc?.nature === 'oneToManyMorph') {
        return targetModel.updateMany(
          {
            [targetModel.primaryKey]: val.ref?._id || val.ref,
          },
          {
            [field]: null,
          },
          { session }
        );
      }

      return targetModel.updateMany(
        {
          [targetModel.primaryKey]: val.ref?._id || val.ref,
        },
        {
          $pull: { [field]: primaryKeyValue },
        },
        { session }
      );
    })
  );
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

      const nature = association.nature;

      // Handle simple lookups
      if (associationHandlers[nature]) {
        return associationHandlers[nature](acc, attribute, newValue, assocModel);
      }

      // Handle complex cases
      if (nature === 'oneToOne') {
        return handleOneToOne.call(
          this,
          acc,
          attribute,
          currentValue,
          newValue,
          assocModel,
          details,
          primaryKeyValue,
          relationUpdates,
          session
        );
      }

      if (nature === 'oneToMany') {
        return handleOneToMany.call(
          this,
          acc,
          currentValue,
          newValue,
          assocModel,
          details,
          primaryKeyValue,
          relationUpdates,
          session
        );
      }

      if (nature === 'manyWay' || nature === 'manyToMany') {
        return handleManyToMany.call(
          this,
          acc,
          attribute,
          currentValue,
          newValue,
          association,
          assocModel,
          primaryKeyValue,
          relationUpdates,
          session
        );
      }

      if (nature === 'manyMorphToMany' || nature === 'manyMorphToOne') {
        handleManyMorph.call(this, newValue, association, entry, relationUpdates, session);
        return acc;
      }

      if (nature === 'oneToManyMorph' || nature === 'manyToManyMorph') {
        return handleMorphToMany.call(
          this,
          acc,
          attribute,
          currentValue,
          newValue,
          association,
          details,
          entry,
          relationUpdates,
          session
        );
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

    return updatedEntity?.toObject?.() ?? updatedEntity;
  },

  deleteRelations(entry, { session = null } = {}) {
    const primaryKeyValue = entry[this.primaryKey];

    return Promise.all(
      this.associations.map(async association => {
        const { nature, via, dominant } = association;

        // Handle simple cases with lookup
        if (deleteRelationHandlers[nature]) {
          return deleteRelationHandlers[nature]();
        }

        const targetModel = strapi.db.getModel(
          association.model || association.collection,
          association.plugin
        );

        if (nature === 'oneToMany' || nature === 'oneToOne') {
          return deleteOneToManyOrOneToOne(via, primaryKeyValue, targetModel, session);
        }

        if (nature === 'manyToMany' || nature === 'manyToOne') {
          return deleteManyToManyOrManyToOne(via, dominant, primaryKeyValue, targetModel, session);
        }

        if (nature === 'oneToManyMorph' || nature === 'manyToManyMorph') {
          return deleteMorphToMany(
            via,
            primaryKeyValue,
            this.globalId,
            association.filter,
            association.alias,
            targetModel,
            session
          );
        }

        if (nature === 'manyMorphToMany' || nature === 'manyMorphToOne') {
          return deleteManyMorphToManyOrOne(entry, association, primaryKeyValue, session);
        }

        return undefined;
      })
    );
  },
};