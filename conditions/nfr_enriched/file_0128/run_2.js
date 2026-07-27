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

// Helper: Get association model
const getAssociationModel = (details) => {
  return strapi.db.getModel(details.model || details.collection, details.plugin);
};

// Helper: Handle oneToOne association
const handleOneToOne = (acc, attribute, currentValue, newValue, details, association, primaryKeyValue, relationUpdates, session) => {
  if (currentValue === newValue) return acc;

  if (_.isNull(newValue)) {
    const assocModel = getAssociationModel(details);
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

  const assocModel = getAssociationModel(details);
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

// Helper: Handle oneToMany association
const handleOneToMany = (acc, attribute, currentValue, newValue, details, association, primaryKeyValue, relationUpdates, session) => {
  const assocModel = getAssociationModel(details);
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

// Helper: Handle manyToMany association
const handleManyToMany = (acc, attribute, currentValue, newValue, details, association, primaryKeyValue, relationUpdates, session) => {
  const assocModel = getAssociationModel(details);

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

// Helper: Handle manyMorphToMany and manyMorphToOne associations
const handleManyMorphToOne = (newValue, association, entry, relationUpdates, session) => {
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

    // Clear relations to refModel
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
            // set field inside refModel
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
          // push to field inside refModel
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

// Helper: Handle oneToManyMorph and manyToManyMorph associations
const handleOneToManyMorph = (acc, attribute, currentValue, newValue, details, association, entry, relationUpdates, session) => {
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

// Helper: Process association based on nature
const processAssociation = (acc, attribute, currentValue, newValue, details, association, primaryKeyValue, entry, relationUpdates, session) => {
  switch (association.nature) {
    case 'oneWay': {
      const assocModel = getAssociationModel(details);
      return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
    }
    case 'oneToOne': {
      return handleOneToOne.call(this, acc, attribute, currentValue, newValue, details, association, primaryKeyValue, relationUpdates, session);
    }
    case 'oneToMany': {
      return handleOneToMany.call(this, acc, attribute, currentValue, newValue, details, association, primaryKeyValue, relationUpdates, session);
    }
    case 'manyToOne': {
      const assocModel = getAssociationModel(details);
      return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
    }
    case 'manyWay':
    case 'manyToMany': {
      return handleManyToMany.call(this, acc, attribute, currentValue, newValue, details, association, primaryKeyValue, relationUpdates, session);
    }
    case 'manyMorphToMany':
    case 'manyMorphToOne': {
      handleManyMorphToOne.call(this, newValue, association, entry, relationUpdates, session);
      break;
    }
    case 'oneToManyMorph':
    case 'manyToManyMorph': {
      return handleOneToManyMorph.call(this, acc, attribute, currentValue, newValue, details, association, entry, relationUpdates, session);
    }
    case 'oneMorphToOne':
    case 'oneMorphToMany':
      break;
    default:
  }

  return acc;
};

// Helper: Handle manyMorphToMany and manyMorphToOne deletion
const deleteManyMorphRelations = (entry, association, session) => {
  if (!Array.isArray(entry[association.alias])) {
    return;
  }

  return Promise.all(
    entry[association.alias].map(val => {
      const targetModel = strapi.db.getModelByGlobalId(val.kind);

      // ignore them ghost relations
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
          $pull: { [field]: entry[targetModel.primaryKey] },
        },
        { session }
      );
    })
  );
};

// Helper: Get target model for association
const getTargetModel = (association) => {
  return strapi.db.getModel(
    association.model || association.collection,
    association.plugin
  );
};

// Helper: Handle oneToMany and oneToOne deletion
const deleteOneToManyRelations = (association, primaryKeyValue, session) => {
  if (!association.via) {
    return;
  }

  const targetModel = getTargetModel(association);
  return targetModel.updateMany({ [association.via]: primaryKeyValue }, { [association.via]: null }, { session });
};

// Helper: Handle manyToMany and manyToOne deletion
const deleteManyToManyRelations = (association, primaryKeyValue, session) => {
  if (!association.via || association.dominant) {
    return;
  }

  const targetModel = getTargetModel(association);
  return targetModel.updateMany(
    { [association.via]: primaryKeyValue },
    { $pull: { [association.via]: primaryKeyValue } },
    { session }
  );
};

// Helper: Handle oneToManyMorph and manyToManyMorph deletion
const deleteOneToManyMorphRelations = (association, primaryKeyValue, globalId, session) => {
  const targetModel = getTargetModel(association);

  // ignore them ghost relations
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

      return processAssociation.call(this, acc, attribute, currentValue, newValue, details, association, primaryKeyValue, entry, relationUpdates, session);
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

    return updatedEntity?.toObject?.() || updatedEntity;
  },

  deleteRelations(entry, { session = null } = {}) {
    const primaryKeyValue = entry[this.primaryKey];

    return Promise.all(
      this.associations.map(async association => {
        const { nature, via, dominant } = association;

        // TODO: delete all the ref to the model

        switch (nature) {
          case 'oneWay':
          case 'manyWay': {
            return;
          }
          case 'oneToMany':
          case 'oneToOne': {
            return deleteOneToManyRelations(association, primaryKeyValue, session);
          }
          case 'manyToMany':
          case 'manyToOne': {
            return deleteManyToManyRelations(association, primaryKeyValue, session);
          }
          case 'oneToManyMorph':
          case 'manyToManyMorph': {
            return deleteOneToManyMorphRelations(association, primaryKeyValue, this.globalId, session);
          }
          case 'manyMorphToMany':
          case 'manyMorphToOne': {
            return deleteManyMorphRelations(entry, association, session);
          }
          case 'oneMorphToOne':
          case 'oneMorphToMany': {
            return;
          }
        }
      })
    );
  },
};