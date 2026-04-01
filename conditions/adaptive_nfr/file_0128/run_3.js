```javascript
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
 * Extracts primary key value from association value
 * @param {*} value - The value to extract from
 * @param {Object} assocModel - The associated model
 * @returns {*} The primary key value
 */
const extractPrimaryKeyValue = (value, assocModel) => {
  return _.get(value, assocModel.primaryKey, value);
};

/**
 * Handles oneWay and manyToOne association updates
 * @param {Object} acc - Accumulator object
 * @param {string} attribute - Attribute name
 * @param {*} newValue - New value
 * @param {Object} assocModel - Associated model
 * @returns {Object} Updated accumulator
 */
const handleSimpleAssociation = (acc, attribute, newValue, assocModel) => {
  return _.set(acc, attribute, extractPrimaryKeyValue(newValue, assocModel));
};

/**
 * Handles oneToOne association updates
 * @param {Object} params - Parameters object
 * @returns {Promise<Object>} Updated accumulator and relation updates
 */
const handleOneToOne = async (params) => {
  const {
    acc,
    attribute,
    currentValue,
    newValue,
    assocModel,
    details,
    primaryKeyValue,
    session,
  } = params;

  if (currentValue === newValue) return { acc, updates: [] };

  const updates = [];

  if (_.isNull(newValue)) {
    const updatePromise = assocModel.updateOne(
      {
        [assocModel.primaryKey]: getValuePrimaryKey(currentValue, assocModel.primaryKey),
      },
      { [details.via]: null },
      { session }
    );

    updates.push(updatePromise);
    return { acc: _.set(acc, attribute, null), updates };
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

  updates.push(updateLink);
  return { acc: _.set(acc, attribute, newValue), updates };
};

/**
 * Handles oneToMany association updates
 * @param {Object} params - Parameters object
 * @returns {Object} Updated accumulator and relation updates
 */
const handleOneToMany = (params) => {
  const { acc, currentValue, newValue, assocModel, details, primaryKeyValue, session } = params;

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

  return { acc, updates: [updatePromise] };
};

/**
 * Handles manyToMany and manyWay association updates
 * @param {Object} params - Parameters object
 * @returns {Object} Updated accumulator and relation updates
 */
const handleManyToMany = (params) => {
  const { acc, attribute, currentValue, newValue, assocModel, association, primaryKeyValue, session } = params;

  if (association.dominant) {
    return {
      acc: _.set(
        acc,
        attribute,
        newValue ? newValue.map(val => val[assocModel.primaryKey] || val) : newValue
      ),
      updates: [],
    };
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

  return { acc, updates: [updatePromise] };
};

/**
 * Handles manyMorphToMany and manyMorphToOne association updates
 * @param {Object} params - Parameters object
 * @returns {Object} Relation updates
 */
const handleManyMorphToMany = (params) => {
  const { newValue, association, entry, session } = params;
  const updates = [];

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

    const reverseAssoc = refModel.associations.find(assoc => assoc.alias === obj.field);
    const isOneToManyMorph = reverseAssoc?.nature === 'oneToManyMorph';

    if (isOneToManyMorph) {
      updates.push(
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
      updates.push(
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

  return updates;
};

/**
 * Handles oneToManyMorph and manyToManyMorph association updates
 * @param {Object} params - Parameters object
 * @returns {Object} Updated accumulator and relation updates
 */
const handleOneToManyMorph = (params) => {
  const { acc, attribute, currentValue, newValue, association, entry, details, session } = params;

  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const newIds = transformToArrayID(newValue, this.primaryKey);

  const toAdd = _.difference(newIds, currentIds);
  const toRemove = _.difference(currentIds, newIds);

  const model = strapi.db.getModel(details.model || details.collection, details.plugin);

  const newAttribute = !Array.isArray(newValue) ? newIds[0] : newIds;
  _.set(acc, attribute, newAttribute);

  const updates = [];

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

  updates.push(addPromise);

  toRemove.forEach(id => {
    updates.push(
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

  return { acc, updates };
};

/**
 * Association update handlers mapped by nature type
 */
const associationHandlers = {
  oneWay: (acc, attribute, newValue, assocModel) =>
    ({ acc: handleSimpleAssociation(acc, attribute, newValue, assocModel), updates: [] }),
  manyToOne: (acc, attribute, newValue, assocModel) =>
    ({ acc: handleSimpleAssociation(acc, attribute, newValue, assocModel), updates: [] }),
  oneToOne: handleOneToOne,
  oneToMany: handleOneToMany,
  manyWay: handleManyToMany,
  manyToMany: handleManyToMany,
  manyMorphToMany: handleManyMorphToMany,
  manyMorphToOne: handleManyMorphToMany,
  oneToManyMorph: handleOneToManyMorph,
  manyToManyMorph: handleOneToManyMorph,
  oneMorphToOne: () => ({ acc: {}, updates: [] }),
  oneMorphToMany: () => ({ acc: {}, updates: [] }),
};

/**
 * Processes a single attribute update
 * @param {Object} params - Parameters object
 * @returns {Promise<Object>} Result with accumulator and updates
 */
const processAttributeUpdate = async (params) => {
  const {
    acc,
    attribute,
    currentValue,
    newValue,
    association,
    details,
    entry,
    primaryKeyValue,
    session,
  } = params;

  if (!association && _.get(details, 'isVirtual') !== true) {
    return { acc: _.set(acc, attribute, newValue), updates: [] };
  }

  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
  const nature = association?.nature;

  if (!nature || !associationHandlers[nature]) {
    return { acc, updates: [] };
  }

  const handler = associationHandlers[nature];
  const result = await handler.call(
    { updateOne: this.updateOne.bind(this), primaryKey: this.primaryKey, globalId: this.globalId },
    {
      acc,
      attribute,
      currentValue,
      newValue,
      assocModel,
      association,
      details,
      entry,
      primaryKeyValue,
      session,
    }
  );

  return result;
};

/**
 * Deletion handlers mapped by association nature
 */
const deleteHandlers = {
  oneWay: () => undefined,
  manyWay: () => undefined,
  oneToMany: deleteOneToMany,
  oneToOne: deleteOneToMany,
  manyToMany: deleteManyToMany,
  manyToOne: deleteManyToMany,
  oneToManyMorph: deleteOneToManyMorph,
  manyToManyMorph: deleteManyMorphToMany,
  manyMorphToMany: deleteManyMorphToMany,
  manyMorphToOne: deleteManyMorphToMany,
  oneMorphToOne: () => undefined,
  oneMorphToMany: () => undefined,
};

/**
 * Deletes oneToOne and oneToMany relations
 * @param {Object} params - Parameters object
 * @returns {Promise}
 */
function deleteOneToMany(params) {
  const { via, association, session } = params;

  if (!via) return undefined;

  const targetModel = strapi.db.getModel(
    association.model || association.collection,
    association.plugin
  );

  return targetModel.updateMany({ [via]: params.primaryKeyValue }, { [via]: null }, { session });
}

/**
 * Deletes manyToMany and manyToOne relations
 * @param {Object} params - Parameters object
 * @returns {Promise}
 */
function deleteManyToMany(params) {
  const { via, dominant, association, session, primaryKeyValue } = params;

  if (!via || dominant) return undefined;

  const targetModel = strapi.db.getModel(
    association.model || association.collection,
    association.plugin
  );

  return targetModel.updateMany(
    { [via]: primaryKeyValue },
    { $pull: { [via]: primaryKeyValue } },
    { session }
  );
}

/**
 * Deletes oneToManyMorph and manyToManyMorph relations
 * @param {Object} params - Parameters object
 * @returns {Promise}
 */
function deleteOneToManyMorph(params) {
  const { via, association, session, primaryKeyValue, globalId } = params;

  const targetModel = strapi.db.getModel(
    association.model || association.collection,
    association.plugin
  );

  if (!targetModel) return undefined;

  const element = {
    ref: primaryKeyValue,
    kind: globalId,
    [association.filter]: association.alias,
  };

  return targetModel.updateMany(
    { [via]: { $elemMatch: element } },
    { $pull: { [via]: element } },
    { session }
  );
}

/**
 * Deletes manyMorphToMany and manyMorphToOne relations
 * @param {Object} params - Parameters object
 * @returns {Promise}
 */
function deleteManyMorphToMany(params) {
  const { entry, association, session, primaryKeyValue } = params;

  if (!Array.isArray(entry[association.alias])) return undefined;

  return Promise.all(
    entry[association.alias].map(val => {
      const targetModel = strapi.db.getModelByGlobalId(val.kind);

      if (!targetModel) return undefined;

      const field = val[association.filter];
      const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === field);
      const isOneToManyMorph = reverseAssoc?.nature === 'oneToManyMorph';

      if (isOneToManyMorph) {
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
}

module.exports = {
  async update(params, { session = null } = {}) {
    const relationUpdates = [];
    const populate = this.associations.map(x => x.alias);
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);

    const entry = await this.findOne({ [this.primaryKey]: primaryKeyValue })
      .session(session)
      .populate(populate)
      .lean();

    const values = Object.keys(removeUndefinedKeys(params.values)).reduce(async (accPromise, attribute) => {
      const acc = await accPromise;
      const currentValue = entry[attribute];
      const newValue = params.values[attribute];

      const association = this.associations.find(x => x.alias === attribute);
      const details = this._attributes[attribute];

      const result = await processAttributeUpdate.call(this, {
        acc,
        attribute,
        currentValue,
        newValue,
        association,
        details,
        entry,
        primaryKeyValue,
        session,
      });

      relationUpdates.push(...result.updates);
      return result.acc;
    }, Promise.resolve({}));

    const resolvedValues = await values;

    await Promise.all(relationUpdates).then(() =>
      this.updateOne({ [this.primaryKey]: primaryKeyValue }, resolvedValues, {
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

        const handler = deleteHandlers[nature];

        if (!handler) return undefined;

        return handler.call(this, {
          via,
          dominant,
          association,
          session,
          primaryKeyValue,
          entry,
          globalId: this.globalId,
        });
      })
    );
  },
};
```