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

// Helper: Extract primary key value from entry
const getEntryPrimaryKeyValue = (entry, primaryKey) => {
  return getValuePrimaryKey(entry, primaryKey);
};

// Helper: Get association model
const getAssociationModel = (details) => {
  return strapi.db.getModel(details?.model || details?.collection, details?.plugin);
};

// Helper: Handle oneWay and manyToOne relations
const handleSimpleRelation = (acc, attribute, newValue, assocModel) => {
  return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
};

// Helper: Handle oneToOne relation
const handleOneToOneRelation = async (
  acc,
  attribute,
  currentValue,
  newValue,
  details,
  assocModel,
  primaryKeyValue,
  session,
  relationUpdates
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
      { [details.via]: primaryKeyValue },
      { session }
    );
  });

  relationUpdates.push(updateLink);
  return _.set(acc, attribute, newValue);
};

// Helper: Handle oneToMany relation
const handleOneToManyRelation = (
  acc,
  currentValue,
  newValue,
  details,
  assocModel,
  primaryKeyValue,
  session,
  relationUpdates
) => {
  const toRemove = _.differenceWith(currentValue, newValue, (a, b) => {
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

// Helper: Handle manyToMany and manyWay relations
const handleManyToManyRelation = (
  acc,
  attribute,
  currentValue,
  newValue,
  association,
  assocModel,
  primaryKeyValue,
  session,
  relationUpdates
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

// Helper: Handle manyMorphToOne and manyMorphToMany relations
const handleManyMorphRelation = (
  newValue,
  association,
  entry,
  session,
  relationUpdates
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

// Helper: Handle oneToManyMorph and manyToManyMorph relations
const handleMorphToManyRelation = (
  acc,
  attribute,
  currentValue,
  newValue,
  association,
  details,
  entry,
  session,
  relationUpdates
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const newIds = transformToArrayID(newValue, this.primaryKey);

  const toAdd = _.difference(newIds, currentIds);
  const toRemove = _.difference(currentIds, newIds);

  const model = getAssociationModel(details);

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

// Helper: Process relation update based on association nature
const processRelationUpdate = function(
  acc,
  attribute,
  currentValue,
  newValue,
  association,
  details,
  entry,
  primaryKeyValue,
  session,
  relationUpdates
) {
  const assocModel = getAssociationModel(details);

  switch (association.nature) {
    case 'oneWay':
    case 'manyToOne':
      return handleSimpleRelation(acc, attribute, newValue, assocModel);

    case 'oneToOne':
      return handleOneToOneRelation.call(
        this,
        acc,
        attribute,
        currentValue,
        newValue,
        details,
        assocModel,
        primaryKeyValue,
        session,
        relationUpdates
      );

    case 'oneToMany':
      return handleOneToManyRelation(
        acc,
        currentValue,
        newValue,
        details,
        assocModel,
        primaryKeyValue,
        session,
        relationUpdates
      );

    case 'manyWay':
    case 'manyToMany':
      return handleManyToManyRelation(
        acc,
        attribute,
        currentValue,
        newValue,
        association,
        assocModel,
        primaryKeyValue,
        session,
        relationUpdates
      );

    case 'manyMorphToMany':
    case 'manyMorphToOne':
      handleManyMorphRelation.call(this, newValue, association, entry, session, relationUpdates);
      return acc;

    case 'oneToManyMorph':
    case 'manyToManyMorph':
      return handleMorphToManyRelation.call(
        this,
        acc,
        attribute,
        currentValue,
        newValue,
        association,
        details,
        entry,
        session,
        relationUpdates
      );

    case 'oneMorphToOne':
    case 'oneMorphToMany':
      return acc;

    default:
      return acc;
  }
};

// Helper: Handle oneToMany and oneToOne deletion
const deleteOneToManyOrOneToOne = (association, primaryKeyValue, session) => {
  if (!association.via) {
    return;
  }

  const targetModel = strapi.db.getModel(
    association.model || association.collection,
    association.plugin
  );

  return targetModel.updateMany({ [association.via]: primaryKeyValue }, { [association.via]: null }, { session });
};

// Helper: Handle manyToMany and manyToOne deletion
const deleteManyToManyOrManyToOne = (association, primaryKeyValue, session) => {
  if (!association.via || association.dominant) {
    return;
  }

  const targetModel = strapi.db.getModel(
    association.model || association.collection,
    association.plugin
  );

  return targetModel.updateMany(
    { [association.via]: primaryKeyValue },
    { $pull: { [association.via]: primaryKeyValue } },
    { session }
  );
};

// Helper: Handle oneToManyMorph and manyToManyMorph deletion
const deleteMorphToMany = (association, primaryKeyValue, globalId, session) => {
  const targetModel = strapi.db.getModel(
    association.model || association.collection,
    association.plugin
  );

  if (!targetModel) return;

  const element = {
    ref: primaryKeyValue,
    kind: globalId,
    [association.filter]: association.alias,
  };

  return targetModel.updateMany(
    { [association.via]: { $elemMatch: element } },
    { $pull: { [association.via]: element } },
    { session }
  );
};

// Helper: Handle manyMorphToMany and manyMorphToOne deletion
const deleteManyMorphRelation = (entry, association, primaryKeyValue, session) => {
  const aliasValue = entry[association.alias];

  if (!Array.isArray(aliasValue)) {
    return;
  }

  return Promise.all(
    aliasValue.map(val => {
      const targetModel = strapi.db.getModelByGlobalId(val.kind);

      if (!targetModel) return;

      const field = val[association.filter];
      const reverseAssoc = targetModel.associations?.find(assoc => assoc.alias === field);
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
};

// Helper: Process relation deletion based on association nature
const processRelationDeletion = (association, entry, primaryKeyValue, globalId, session) => {
  const { nature, via } = association;

  switch (nature) {
    case 'oneWay':
    case 'manyWay':
      return;

    case 'oneToMany':
    case 'oneToOne':
      return deleteOneToManyOrOneToOne(association, primaryKeyValue, session);

    case 'manyToMany':
    case 'manyToOne