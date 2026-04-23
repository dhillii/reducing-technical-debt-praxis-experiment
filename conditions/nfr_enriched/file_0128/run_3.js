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

// Extracts the association model for a given attribute
const getAssociationModel = (attribute, details) => {
  return strapi.db.getModel(details?.model || details?.collection, details?.plugin);
};

// Handles oneWay and manyToOne association updates
const handleOneWayOrManyToOne = (acc, attribute, newValue, assocModel) => {
  return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
};

// Handles oneToOne association updates
const handleOneToOne = async (
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

// Handles oneToMany association updates
const handleOneToMany = (
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

// Handles manyToMany and manyWay association updates
const handleManyToMany = (
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

// Handles manyMorphToOne and manyMorphToMany association updates
const handleManyMorphToMany = (
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

// Handles oneToManyMorph and manyToManyMorph association updates
const handleMorphToMany = (
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

  const model = strapi.db.getModel(details?.model || details?.collection, details?.plugin);

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

// Processes a single attribute update based on its association type
const processAttributeUpdate = (
  acc,
  attribute,
  currentValue,
  newValue,
  association,
  details,
  entry,
  primaryKeyValue,
  relationUpdates,
  session
) => {
  if (!association && _.get(details, 'isVirtual') !== true) {
    return _.set(acc, attribute, newValue);
  }

  if (!association) {
    return acc;
  }

  const assocModel = getAssociationModel(attribute, details);

  switch (association.nature) {
    case 'oneWay':
      return handleOneWayOrManyToOne(acc, attribute, newValue, assocModel);

    case 'oneToOne':
      return handleOneToOne.call(
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
      return handleOneToMany(
        acc,
        currentValue,
        newValue,
        details,
        assocModel,
        primaryKeyValue,
        session,
        relationUpdates
      );

    case 'manyToOne':
      return handleOneWayOrManyToOne(acc, attribute, newValue, assocModel);

    case 'manyWay':
    case 'manyToMany':
      return handleManyToMany(
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
      handleManyMorphToMany.call(
        this,
        newValue,
        association,
        entry,
        relationUpdates,
        session
      );
      return acc;

    case 'oneToManyMorph':
    case 'manyToManyMorph':
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

    case 'oneMorphToOne':
    case 'oneMorphToMany':
      return acc;

    default:
      return acc;
  }
};

// Handles oneWay and manyWay deletion
const deleteOneWayOrManyWay = () => {
  return;
};

// Handles oneToOne and oneToMany deletion
const deleteOneToOneOrOneToMany = (via, association, session) => {
  if (!via) {
    return;
  }

  const targetModel = strapi.db.getModel(
    association.model || association.collection,
    association.plugin
  );

  return targetModel.updateMany({ [via]: via }, { [via]: null }, { session });
};

// Handles manyToOne and manyToMany deletion
const deleteManyToOneOrManyToMany = (via, dominant, association, primaryKeyValue, session) => {
  if (!via || dominant) {
    return;
  }

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

// Handles oneToManyMorph and manyToManyMorph deletion
const deleteMorphToMany = (via, association, globalId, filter, alias, session) => {
  const targetModel = strapi.db.getModel(
    association.model || association.collection,
    association.plugin
  );

  if (!targetModel) return;

  const element = {
    ref: globalId,
    kind: globalId,
    [filter]: alias,
  };

  return targetModel.updateMany(
    { [via]: { $elemMatch: element } },
    { $pull: { [via]: element } },
    { session }
  );
};

// Handles manyMorphToOne and manyMorphToMany deletion
const deleteManyMorphToMany = (entry, association, primaryKeyValue, session) => {
  const aliasValue = entry[association.alias];

  if (!Array.isArray(aliasValue)) {
    return;
  }

  return Promise.all(
    aliasValue.map(val => {
      const targetModel = strapi.db.getModelByGlobalId(val.kind);

      if (!targetModel) return;

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

// Processes a single association deletion
const processAssociationDeletion = (association, entry, primaryKeyValue, session) => {
  const { nature, via, dominant, filter, alias } = association;

  switch (nature) {
    case 'oneWay':
    case 'manyWay':
      return deleteOneWayOrManyWay();

    case 'oneToMany':
    case 'oneToOne':
      return deleteOneToOneOrOneToMany(via, association, session);

    case 'manyToMany':
    case 'manyToOne':
      return deleteManyToOneOrManyToMany(via, dominant, association, primaryKeyValue, session);

    case 'oneToManyMorph':
    case 'manyToManyMorph':
      return deleteMorphToMany(via, association, entry[association.primaryKey], filter, alias, session);

    case 'manyMorphToMany':
    case 'manyMorphToOne':
      return deleteManyMorphToMany(entry, association, primaryKeyValue, session);

    case 'oneMorphToOne':
    case 'oneMorphToMany':
      return;

    default:
      return;
  }
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

      return processAttributeUpdate(
        acc,
        attribute,
        currentValue,
        newValue,
        association,
        details,
        entry,
        primaryKeyValue,
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
      this.associations.map(association =>
        processAssociationDeletion(association, entry, primaryKeyValue, session)
      )
    );
  },
};