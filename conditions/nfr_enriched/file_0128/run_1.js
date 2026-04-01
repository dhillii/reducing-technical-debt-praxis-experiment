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
const handleSimpleAssociation = (newValue, assocModel) => {
  return _.get(newValue, assocModel.primaryKey, newValue);
};

// Handles oneToOne association updates
const handleOneToOneAssociation = async (
  attribute,
  currentValue,
  newValue,
  assocModel,
  details,
  primaryKeyValue,
  session,
  model
) => {
  const relationUpdates = [];

  if (currentValue === newValue) {
    return { value: currentValue, updates: relationUpdates };
  }

  if (_.isNull(newValue)) {
    const updatePromise = assocModel.updateOne(
      {
        [assocModel.primaryKey]: getValuePrimaryKey(currentValue, assocModel.primaryKey),
      },
      { [details.via]: null },
      { session }
    );

    relationUpdates.push(updatePromise);
    return { value: null, updates: relationUpdates };
  }

  const updateLink = model
    .updateOne(
      { [attribute]: new mongoose.Types.ObjectId(newValue) },
      { [attribute]: null },
      { session }
    )
    .then(() => {
      return assocModel.updateOne(
        {
          [model.primaryKey]: new mongoose.Types.ObjectId(newValue),
        },
        { [details.via]: primaryKeyValue },
        { session }
      );
    });

  relationUpdates.push(updateLink);
  return { value: newValue, updates: relationUpdates };
};

// Handles oneToMany association updates
const handleOneToManyAssociation = async (
  currentValue,
  newValue,
  assocModel,
  details,
  primaryKeyValue,
  session
) => {
  const relationUpdates = [];
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
  return relationUpdates;
};

// Handles manyToMany and manyWay association updates
const handleManyToManyAssociation = async (
  currentValue,
  newValue,
  assocModel,
  association,
  primaryKeyValue,
  session
) => {
  const relationUpdates = [];

  if (association.dominant) {
    return {
      value: newValue ? newValue.map(val => val[assocModel.primaryKey] || val) : newValue,
      updates: relationUpdates,
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

  relationUpdates.push(updatePromise);
  return { updates: relationUpdates };
};

// Handles manyMorphToOne and manyMorphToMany association updates
const handleManyMorphAssociation = async (
  entry,
  newValue,
  association,
  relationUpdates,
  session,
  model
) => {
  newValue?.forEach(obj => {
    const refModel = strapi.db.getModel(obj.ref, obj.source);

    const createRelation = () => {
      return addRelationMorph(
        model,
        {
          id: entry[model.primaryKey],
          alias: association.alias,
          ref: obj.kind || refModel?.globalId,
          refId: new mongoose.Types.ObjectId(obj.refId),
          field: obj.field,
          filter: association.filter,
        },
        { session }
      );
    };

    const reverseAssoc = refModel?.associations?.find(assoc => assoc.alias === obj.field);

    if (reverseAssoc?.nature === 'oneToManyMorph') {
      relationUpdates.push(
        removeRelationMorph(
          model,
          {
            alias: association.alias,
            ref: obj.kind || refModel?.globalId,
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
                [obj.field]: new mongoose.Types.ObjectId(entry[model.primaryKey]),
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
              $push: { [obj.field]: new mongoose.Types.ObjectId(entry[model.primaryKey]) },
            },
            { session }
          );
        })
      );
    }
  });
};

// Handles oneToManyMorph and manyToManyMorph association updates
const handleMorphToManyAssociation = async (
  currentValue,
  newValue,
  association,
  details,
  entry,
  relationUpdates,
  session,
  model
) => {
  const currentIds = transformToArrayID(currentValue, model.primaryKey);
  const newIds = transformToArrayID(newValue, model.primaryKey);

  const toAdd = _.difference(newIds, currentIds);
  const toRemove = _.difference(currentIds, newIds);

  const targetModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  const addPromise = Promise.all(
    toAdd.map(id => {
      return addRelationMorph(
        targetModel,
        {
          id,
          alias: association.via,
          ref: model.globalId,
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
        targetModel,
        {
          id,
          alias: association.via,
          ref: model.globalId,
          refId: entry._id,
          field: association.alias,
          filter: association.filter,
        },
        { session }
      )
    );
  });

  return Array.isArray(newValue) ? newIds : newIds[0];
};

// Processes attribute updates based on association type
const processAttributeUpdate = async (
  attribute,
  currentValue,
  newValue,
  association,
  details,
  primaryKeyValue,
  relationUpdates,
  entry,
  session,
  model
) => {
  if (!association && _.get(details, 'isVirtual') !== true) {
    return { attribute, value: newValue };
  }

  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  switch (association?.nature) {
    case 'oneWay': {
      return { attribute, value: handleSimpleAssociation(newValue, assocModel) };
    }
    case 'oneToOne': {
      const result = await handleOneToOneAssociation(
        attribute,
        currentValue,
        newValue,
        assocModel,
        details,
        primaryKeyValue,
        session,
        model
      );
      relationUpdates.push(...result.updates);
      return { attribute, value: result.value };
    }
    case 'oneToMany': {
      const updates = await handleOneToManyAssociation(
        currentValue,
        newValue,
        assocModel,
        details,
        primaryKeyValue,
        session
      );
      relationUpdates.push(...updates);
      return { attribute, skip: true };
    }
    case 'manyToOne': {
      return { attribute, value: handleSimpleAssociation(newValue, assocModel) };
    }
    case 'manyWay':
    case 'manyToMany': {
      const result = await handleManyToManyAssociation(
        currentValue,
        newValue,
        assocModel,
        association,
        primaryKeyValue,
        session
      );
      relationUpdates.push(...result.updates);
      return association.dominant
        ? { attribute, value: result.value }
        : { attribute, skip: true };
    }
    case 'manyMorphToMany':
    case 'manyMorphToOne': {
      await handleManyMorphAssociation(entry, newValue, association, relationUpdates, session, model);
      return { attribute, skip: true };
    }
    case 'oneToManyMorph':
    case 'manyToManyMorph': {
      const value = await handleMorphToManyAssociation(
        currentValue,
        newValue,
        association,
        details,
        entry,
        relationUpdates,
        session,
        model
      );
      return { attribute, value };
    }
    case 'oneMorphToOne':
    case 'oneMorphToMany':
      return { attribute, skip: true };
    default:
      return { attribute, skip: true };
  }
};

// Handles deletion of oneToMany and oneToOne relations
const deleteOneToManyOrOneToOne = async (association, session) => {
  if (!association.via) {
    return;
  }

  const targetModel = strapi.db.getModel(
    association.model || association.collection,
    association.plugin
  );

  return targetModel.updateMany(
    { [association.via]: association.primaryKeyValue },
    { [association.via]: null },
    { session }
  );
};

// Handles deletion of manyToMany and manyToOne relations
const deleteManyToManyOrManyToOne = async (association, session) => {
  if (!association.via || association.dominant) {
    return;
  }

  const targetModel = strapi.db.getModel(
    association.model || association.collection,
    association.plugin
  );

  return targetModel.updateMany(
    { [association.via]: association.primaryKeyValue },
    { $pull: { [association.via]: association.primaryKeyValue } },
    { session }
  );
};

// Handles deletion of morph relations
const deleteMorphRelations = async (association, session, globalId) => {
  const targetModel = strapi.db.getModel(
    association.model || association.collection,
    association.plugin
  );

  if (!targetModel) return;

  const element = {
    ref: association.primaryKeyValue,
    kind: globalId,
    [association.filter]: association.alias,
  };

  return targetModel.updateMany(
    { [association.via]: { $elemMatch: element } },
    { $pull: { [association.via]: element } },
    { session }
  );
};

// Handles deletion of many morph relations
const deleteManyMorphRelations = async (entry, association, session) => {
  if (!Array.isArray(entry[association.alias])) {
    return;
  }

  return Promise.all(
    entry[association.alias].map(val => {
      const targetModel = strapi.db.getModelByGlobalId(val.kind);

      if (!targetModel) return;

      const field = val[association.filter];
      const reverseAssoc = targetModel.associations?.find(assoc => assoc.alias === field);

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
          $pull: { [field]: association.primaryKeyValue },
        },
        { session }
      );
    })
  );
};

// Processes relation deletion based on association nature
const processRelationDeletion = async (association, entry, session, globalId) => {
  const { nature, via, dominant } = association;

  switch (nature) {
    case 'oneWay':
    case 'manyWay':
      return;
    case 'oneToMany':
    case 'oneToOne':
      return deleteOneToManyOrOneToOne(association, session);
    case 'manyToMany':
    case 'manyToOne':
      return deleteManyToManyOrManyToOne(association, session);
    case 'oneToManyMorph':
    case 'manyToManyMorph':
      return deleteMorphRelations(association, session, globalId);
    case 'manyMorphToMany':
    case 'manyMorphToOne':
      return deleteManyMorphRelations(entry, association, session);
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

      return acc;
    }, {});

    // Process all attribute updates
    for (const attribute of Object.keys(removeUndefinedKeys(params.values))) {
      const currentValue = entry[attribute];
      const newValue = params.values[attribute];
      const association = this.associations.find(x => x.alias === attribute);
      const details = this._attributes[attribute];

      const result = await processAttributeUpdate(
        attribute,
        currentValue,
        newValue,
        association,
        details,
        primaryKeyValue,
        relationUpdates,
        entry,
        session,
        this
      );

      if (!result.skip) {
        _.set(values, result.attribute, result.value);
      }
    }

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
        const enrichedAssociation = {
          ...association,
          primaryKeyValue,
        };

        return processRelationDeletion(enrichedAssociation, entry, session, this.globalId);
      })
    );
  },
};
```