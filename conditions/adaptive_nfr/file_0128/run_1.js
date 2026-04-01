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
    relationUpdates,
  } = params;

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
};

/**
 * Handles oneToMany association updates
 * @param {Object} params - Parameters object
 * @returns {Object} Updated accumulator
 */
const handleOneToMany = (params) => {
  const { acc, currentValue, newValue, assocModel, details, primaryKeyValue, session, relationUpdates } = params;

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
 * @param {Object} params - Parameters object
 * @returns {Object} Updated accumulator
 */
const handleManyToMany = (params) => {
  const { acc, attribute, currentValue, newValue, association, assocModel, primaryKeyValue, session, relationUpdates } = params;

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
 * @param {Object} params - Parameters object
 */
const handleManyMorphToMany = (params) => {
  const { newValue, association, entry, relationUpdates, session } = params;

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
 * @param {Object} params - Parameters object
 */
const handleOneToManyMorph = (params) => {
  const { attribute, currentValue, newValue, association, details, entry, relationUpdates, session } = params;

  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const newIds = transformToArrayID(newValue, this.primaryKey);

  const toAdd = _.difference(newIds, currentIds);
  const toRemove = _.difference(currentIds, newIds);

  const model = strapi.db.getModel(details.model || details.collection, details.plugin);

  if (!Array.isArray(newValue)) {
    _.set(params.acc, attribute, newIds[0]);
  } else {
    _.set(params.acc, attribute, newIds);
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
 * Association update handlers mapped by nature type
 */
const associationHandlers = {
  oneWay: (params) => handleSimpleAssociation(params.acc, params.attribute, params.newValue, params.assocModel),
  manyToOne: (params) => handleSimpleAssociation(params.acc, params.attribute, params.newValue, params.assocModel),
  oneToOne: handleOneToOne,
  oneToMany: handleOneToMany,
  manyWay: handleManyToMany,
  manyToMany: handleManyToMany,
  manyMorphToMany: handleManyMorphToMany,
  manyMorphToOne: handleManyMorphToMany,
  oneToManyMorph: handleOneToManyMorph,
  manyToManyMorph: handleOneToManyMorph,
  oneMorphToOne: (params) => params.acc,
  oneMorphToMany: (params) => params.acc,
};

/**
 * Processes association update based on nature type
 * @param {string} nature - Association nature
 * @param {Object} params - Parameters object
 * @returns {Object} Updated accumulator
 */
const processAssociationUpdate = (nature, params) => {
  const handler = associationHandlers[nature];
  return handler ? handler.call(params.context, params) : params.acc;
};

/**
 * Handles deletion of oneWay and manyWay relations
 * @returns {Promise<void>}
 */
const handleDeleteOneWay = () => Promise.resolve();

/**
 * Handles deletion of oneToMany and oneToOne relations
 * @param {Object} params - Parameters object
 * @returns {Promise<void>}
 */
const handleDeleteOneToMany = (params) => {
  const { via, association } = params;

  if (!via) return Promise.resolve();

  const targetModel = strapi.db.getModel(
    association.model || association.collection,
    association.plugin
  );

  return targetModel.updateMany({ [via]: params.primaryKeyValue }, { [via]: null }, { session: params.session });
};

/**
 * Handles deletion of manyToMany and manyToOne relations
 * @param {Object} params - Parameters object
 * @returns {Promise<void>}
 */
const handleDeleteManyToMany = (params) => {
  const { via, dominant, association, primaryKeyValue, session } = params;

  if (!via || dominant) return Promise.resolve();

  const targetModel = strapi.db.getModel(
    association.model || association.collection,
    association.plugin
  );

  return targetModel.updateMany(
    { [via]: primaryKeyValue },
    { $pull: { [via]: primaryKeyValue } },
    { session }
  );
};

/**
 * Handles deletion of oneToManyMorph and manyToManyMorph relations
 * @param {Object} params - Parameters object
 * @returns {Promise<void>}
 */
const handleDeleteMorphToMany = (params) => {
  const { via, association, primaryKeyValue, session } = params;

  const targetModel = strapi.db.getModel(
    association.model || association.collection,
    association.plugin
  );

  if (!targetModel) return Promise.resolve();

  const element = {
    ref: primaryKeyValue,
    kind: params.globalId,
    [association.filter]: association.alias,
  };

  return targetModel.updateMany(
    { [via]: { $elemMatch: element } },
    { $pull: { [via]: element } },
    { session }
  );
};

/**
 * Handles deletion of manyMorphToMany and manyMorphToOne relations
 * @param {Object} params - Parameters object
 * @returns {Promise<void>}
 */
const handleDeleteManyMorphToMany = (params) => {
  const { entry, association, primaryKeyValue, session } = params;

  if (!Array.isArray(entry[association.alias])) return Promise.resolve();

  return Promise.all(
    entry[association.alias].map(val => {
      const targetModel = strapi.db.getModelByGlobalId(val.kind);

      if (!targetModel) return Promise.resolve();

      const field = val[association.filter];
      const reverseAssoc = targetModel.associations.find(
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

/**
 * Handles deletion of oneMorphToOne and oneMorphToMany relations
 * @returns {Promise<void>}
 */
const handleDeleteOneMorph = () => Promise.resolve();

/**
 * Relation deletion handlers mapped by nature type
 */
const deleteHandlers = {
  oneWay: handleDeleteOneWay,
  manyWay: handleDeleteOneWay,
  oneToMany: handleDeleteOneToMany,
  oneToOne: handleDeleteOneToMany,
  manyToMany: handleDeleteManyToMany,
  manyToOne: handleDeleteManyToMany,
  oneToManyMorph: handleDeleteMorphToMany,
  manyToManyMorph: handleDeleteMorphToMany,
  manyMorphToMany: handleDeleteManyMorphToMany,
  manyMorphToOne: handleDeleteManyMorphToMany,
  oneMorphToOne: handleDeleteOneMorph,
  oneMorphToMany: handleDeleteOneMorph,
};

/**
 * Processes relation deletion based on nature type
 * @param {string} nature - Association nature
 * @param {Object} params - Parameters object
 * @returns {Promise<void>}
 */
const processRelationDeletion = (nature, params) => {
  const handler = deleteHandlers[nature];
  return handler ? handler(params) : Promise.resolve();
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

      return processAssociationUpdate(association.nature, {
        context: this,
        acc,
        attribute,
        currentValue,
        newValue,
        association,
        assocModel,
        details,
        primaryKeyValue,
        entry,
        relationUpdates,
        session,
      });
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

    return updatedEntity?.toObject?.() ?? updatedEntity;
  },

  deleteRelations(entry, { session = null } = {}) {
    const primaryKeyValue = entry[this.primaryKey];

    return Promise.all(
      this.associations.map(association => {
        const { nature, via, dominant } = association;

        return processRelationDeletion(nature, {
          via,
          dominant,
          association,
          primaryKeyValue,
          entry,
          session,
          globalId: this.globalId,
        });
      })
    );
  },
};
```