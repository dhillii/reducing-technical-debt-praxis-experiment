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

// Extract primary key value from entry
const getPrimaryKeyValue = (entry, primaryKey) => getValuePrimaryKey(entry, primaryKey);

// Get association by alias
const getAssociationByAlias = (associations, alias) =>
  associations?.find(x => x.alias === alias);

// Get model details for attribute
const getModelDetails = (attributes, attribute) => attributes?.[attribute];

// Get associated model
const getAssociatedModel = (details) => {
  if (!details) return null;
  return strapi.db.getModel(details.model || details.collection, details.plugin);
};

// Handle oneWay relation update
const handleOneWayUpdate = (acc, attribute, newValue, assocModel) => {
  return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
};

// Handle oneToOne relation update
const handleOneToOneUpdate = (acc, attribute, currentValue, newValue, assocModel, details, primaryKeyValue, relationUpdates, session) => {
  if (currentValue === newValue) return acc;

  if (_.isNull(newValue)) {
    const updatePromise = assocModel.updateOne(
      {
        [assocModel.primaryKey]: getPrimaryKeyValue(currentValue, assocModel.primaryKey),
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

// Handle oneToMany relation update
const handleOneToManyUpdate = (acc, currentValue, newValue, assocModel, details, primaryKeyValue, relationUpdates, session) => {
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

// Handle manyToOne relation update
const handleManyToOneUpdate = (acc, attribute, newValue, assocModel) => {
  return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
};

// Handle manyToMany/manyWay relation update
const handleManyToManyUpdate = (acc, attribute, currentValue, newValue, association, assocModel, primaryKeyValue, relationUpdates, session) => {
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

// Handle manyMorphToOne/manyMorphToMany relation update
const handleManyMorphUpdate = (entry, association, newValue, relationUpdates, session) => {
  newValue?.forEach(obj => {
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

// Handle oneToManyMorph/manyToManyMorph relation update
const handleMorphToManyUpdate = (acc, attribute, currentValue, newValue, association, details, entry, relationUpdates, session) => {
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

// Process attribute update based on association nature
const processAttributeUpdate = function(acc, attribute, currentValue, newValue, association, details, primaryKeyValue, entry, relationUpdates, session) {
  if (!association && _.get(details, 'isVirtual') !== true) {
    return _.set(acc, attribute, newValue);
  }

  const assocModel = getAssociatedModel(details);

  switch (association?.nature) {
    case 'oneWay':
      return handleOneWayUpdate(acc, attribute, newValue, assocModel);

    case 'oneToOne':
      return handleOneToOneUpdate.call(this, acc, attribute, currentValue, newValue, assocModel, details, primaryKeyValue, relationUpdates, session);

    case 'oneToMany':
      return handleOneToManyUpdate.call(this, acc, currentValue, newValue, assocModel, details, primaryKeyValue, relationUpdates, session);

    case 'manyToOne':
      return handleManyToOneUpdate(acc, attribute, newValue, assocModel);

    case 'manyWay':
    case 'manyToMany':
      return handleManyToManyUpdate(acc, attribute, currentValue, newValue, association, assocModel, primaryKeyValue, relationUpdates, session);

    case 'manyMorphToMany':
    case 'manyMorphToOne':
      handleManyMorphUpdate.call(this, entry, association, newValue, relationUpdates, session);
      return acc;

    case 'oneToManyMorph':
    case 'manyToManyMorph':
      return handleMorphToManyUpdate.call(this, acc, attribute, currentValue, newValue, association, details, entry, relationUpdates, session);

    case 'oneMorphToOne':
    case 'oneMorphToMany':
      return acc;

    default:
      return acc;
  }
};

// Handle oneWay/manyWay deletion
const handleOneWayDelete = () => undefined;

// Handle oneToOne/oneToMany deletion
const handleOneToOneDelete = (association, session) => {
  if (!association.via) return undefined;

  const targetModel = strapi.db.getModel(
    association.model || association.collection,
    association.plugin
  );

  return targetModel?.updateMany(
    { [association.via]: association.primaryKeyValue },
    { [association.via]: null },
    { session }
  );
};

// Handle manyToOne/manyToMany deletion
const handleManyToManyDelete = (association, session) => {
  if (!association.via || association.dominant) return undefined;

  const targetModel = strapi.db.getModel(
    association.model || association.collection,
    association.plugin
  );

  return targetModel?.updateMany(
    { [association.via]: association.primaryKeyValue },
    { $pull: { [association.via]: association.primaryKeyValue } },
    { session }
  );
};

// Handle oneToManyMorph/manyToManyMorph deletion
const handleMorphDelete = (association, primaryKeyValue, session) => {
  const targetModel = strapi.db.getModel(
    association.model || association.collection,
    association.plugin
  );

  if (!targetModel) return undefined;

  const element = {
    ref: primaryKeyValue,
    kind: association.globalId,
    [association.filter]: association.alias,
  };

  return targetModel.updateMany(
    { [association.via]: { $elemMatch: element } },
    { $pull: { [association.via]: element } },
    { session }
  );
};

// Handle manyMorphToOne/manyMorphToMany deletion
const handleManyMorphDelete = (entry, association, session) => {
  if (!Array.isArray(entry[association.alias])) return undefined;

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
          $pull: { [field]: entry[association.primaryKeyValue] },
        },
        { session }
      );
    })
  );
};

// Process relation deletion based on nature
const processRelationDeletion = function(association, entry, primaryKeyValue, session) {
  const { nature, via, dominant } = association;

  switch (nature) {
    case 'oneWay':
    case 'manyWay':
      return handleOneWayDelete();

    case 'oneToMany':
    case 'oneToOne':
      return handleOneToOneDelete(association, session);

    case 'manyToMany':
    case 'manyToOne':
      return handleManyToManyDelete(association, session);

    case 'oneToManyMorph':
    case 'manyToManyMorph':
      return handleMorphDelete({ ...association, globalId: this.globalId, primaryKeyValue }, primaryKeyValue, session);

    case 'manyMorphToMany':
    case 'manyMorphToOne':
      return handleManyMorphDelete(entry, association, session);

    case 'oneMorphToOne':
    case 'oneMorphToMany':
      return undefined;

    default:
      return undefined;
  }
};

module.exports = {
  async update(params, { session = null } = {}) {
    const relationUpdates = [];
    const populate = this.associations.map(x => x.alias);
    const primaryKeyValue = getPrimaryKeyValue(params, this.primaryKey);

    const entry = await this.findOne({ [this.primaryKey]: primaryKeyValue })
      .session(session)
      .populate(populate)
      .lean();

    const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, attribute) => {
      const currentValue = entry?.[attribute];
      const newValue = params.values?.[attribute];
      const association = getAssociationByAlias(this.associations, attribute);
      const details = getModelDetails(this._attributes, attribute);

      return processAttributeUpdate.call(
        this,
        acc,
        attribute,
        currentValue,
        newValue,
        association,
        details,
        primaryKeyValue,
        entry,
        relationUpdates,
        session
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

    return updatedEntity?.toObject?.() ?? updatedEntity;
  },

  deleteRelations(entry, { session = null } = {}) {
    const primaryKeyValue = entry[this.primaryKey];

    return Promise.all(
      this.associations.map(async association => {
        return processRelationDeletion.call(this, association, entry, primaryKeyValue, session);
      })
    );
  },
};