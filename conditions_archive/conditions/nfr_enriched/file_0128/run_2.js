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

// Handles oneWay and manyToOne association updates
const handleSimpleAssociation = (acc, attribute, newValue, assocModel) => {
  return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
};

// Handles oneToOne association updates
const handleOneToOneAssociation = (
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
const handleOneToManyAssociation = (
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

// Handles manyToMany and manyWay association updates
const handleManyToManyAssociation = (
  acc,
  attribute,
  currentValue,
  newValue,
  assocModel,
  association,
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

// Handles manyMorphToOne and manyMorphToMany association updates
const handleManyMorphAssociation = (
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

// Handles oneToManyMorph and manyToManyMorph association updates
const handleMorphToManyAssociation = (
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

// Processes a single attribute update based on association type
const processAttributeUpdate = function(
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
) {
  if (!association && _.get(details, 'isVirtual') !== true) {
    return _.set(acc, attribute, newValue);
  }

  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  switch (association?.nature) {
    case 'oneWay':
    case 'manyToOne':
      return handleSimpleAssociation(acc, attribute, newValue, assocModel);

    case 'oneToOne':
      return handleOneToOneAssociation.call(
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

    case 'oneToMany':
      return handleOneToManyAssociation(
        acc,
        currentValue,
        newValue,
        assocModel,
        details,
        primaryKeyValue,
        relationUpdates,
        session
      );

    case 'manyWay':
    case 'manyToMany':
      return handleManyToManyAssociation(
        acc,
        attribute,
        currentValue,
        newValue,
        assocModel,
        association,
        primaryKeyValue,
        relationUpdates,
        session
      );

    case 'manyMorphToMany':
    case 'manyMorphToOne':
      handleManyMorphAssociation.call(
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
      return handleMorphToManyAssociation.call(
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
    default:
      return acc;
  }
};

// Handles oneWay and manyWay deletion
const deleteOneWayRelation = () => {
  return;
};

// Handles oneToOne and oneToMany deletion
const deleteOneToManyRelation = (association, primaryKeyValue, session) => {
  if (!association.via) {
    return;
  }

  const targetModel = strapi.db.getModel(
    association.model || association.collection,
    association.plugin
  );

  return targetModel.updateMany({ [association.via]: primaryKeyValue }, { [association.via]: null }, { session });
};

// Handles manyToMany and manyToOne deletion
const deleteManyToManyRelation = (association, primaryKeyValue, session) => {
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

// Handles oneToManyMorph and manyToManyMorph deletion
const deleteMorphRelation = (association, primaryKeyValue, globalId, session) => {
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

// Handles manyMorphToMany and manyMorphToOne deletion
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

      const refValue = val.ref?._id || val.ref;

      if (isOneToManyMorph) {
        return targetModel.updateMany(
          {
            [targetModel.primaryKey]: refValue,
          },
          {
            [field]: null,
          },
          { session }
        );
      }

      return targetModel.updateMany(
        {
          [targetModel.primaryKey]: refValue,
        },
        {
          $pull: { [field]: primaryKeyValue },
        },
        { session }
      );
    })
  );
};

// Handles oneMorphToOne and oneMorphToMany deletion
const deleteOneMorphRelation = () => {
  return;
};

// Deletes relations for a single association
const deleteAssociationRelations = function(association, entry, session) {
  const { nature, via, dominant } = association;
  const primaryKeyValue = entry[this.primaryKey];

  switch (nature) {
    case 'oneWay':
    case 'manyWay':
      return deleteOneWayRelation();

    case 'oneToMany':
    case 'oneToOne':
      return deleteOneToManyRelation(association, primaryKeyValue, session);

    case 'manyToMany':
    case 'manyToOne':
      return deleteManyToManyRelation(association, primaryKeyValue, session);

    case 'oneToManyMorph':
    case 'manyToManyMorph':
      return deleteMorphRelation(association, primaryKeyValue, this.globalId, session);

    case 'manyMorphToMany':
    case 'manyMorphToOne':
      return deleteManyMorphRelation(entry, association, primaryKeyValue, session);

    case 'oneMorphToOne':
    case 'oneMorphToMany':
      return deleteOneMorphRelation();

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
    return Promise.all(
      this.associations.map(association =>
        deleteAssociationRelations.call(this, association, entry, session)
      )
    );
  },
};
```