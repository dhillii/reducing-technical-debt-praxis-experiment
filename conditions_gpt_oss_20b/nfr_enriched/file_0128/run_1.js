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
 * Convert a value or array of values to an array of stringified primary keys.
 *
 * @param {any} array - The value or array of values to transform.
 * @param {string} pk - The primary key field name.
 * @returns {string[]} Array of stringified primary keys.
 */
const transformToArrayID = (array, pk) => {
  if (_.isArray(array)) {
    return array
      .map(value => value && (getValuePrimaryKey(value, pk) || value))
      .filter(n => n)
      .map(val => _.toString(val));
  }

  return transformToArrayID([array]);
};

/**
 * Remove keys with undefined values from an object.
 *
 * @param {Object} obj - The object to clean.
 * @returns {Object} New object without undefined values.
 */
const removeUndefinedKeys = (obj = {}) => _.pickBy(obj, _.negate(_.isUndefined));

/**
 * Add a morph relation to a model.
 *
 * @param {Object} model - The Mongoose model.
 * @param {Object} params - Parameters for the relation.
 * @param {Object} [options] - Options including session.
 * @returns {Promise<void>}
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
 *
 * @param {Object} model - The Mongoose model.
 * @param {Object} params - Parameters for the relation.
 * @param {Object} [options] - Options including session.
 * @returns {Promise<void>}
 */
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

/**
 * Handle one-to-one relation updates.
 *
 * @param {Object} self - The current model instance.
 * @param {Object} association - Association definition.
 * @param {Object} details - Attribute details.
 * @param {any} currentValue - Current value of the attribute.
 * @param {any} newValue - New value of the attribute.
 * @param {Object} entry - The current entry.
 * @param {Array} relationUpdates - Array to collect relation promises.
 * @param {Object} acc - Accumulator for updated values.
 * @returns {Object} Updated accumulator.
 */
const handleOneToOne = (self, association, details, currentValue, newValue, entry, relationUpdates, acc) => {
  if (currentValue === newValue) return acc;

  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  if (_.isNull(newValue)) {
    const updatePromise = assocModel.updateOne(
      {
        [assocModel.primaryKey]: getValuePrimaryKey(currentValue, assocModel.primaryKey),
      },
      { [details.via]: null },
      { session }
    );

    relationUpdates.push(updatePromise);
    return _.set(acc, association.alias, null);
  }

  const updateLink = self.updateOne(
    { [association.alias]: new mongoose.Types.ObjectId(newValue) },
    { [association.alias]: null },
    { session }
  ).then(() => {
    return assocModel.updateOne(
      {
        [self.primaryKey]: new mongoose.Types.ObjectId(newValue),
      },
      { [details.via]: getValuePrimaryKey(entry[self.primaryKey], self.primaryKey) },
      { session }
    );
  });

  relationUpdates.push(updateLink);
  return _.set(acc, association.alias, newValue);
};

/**
 * Handle one-to-many relation updates.
 *
 * @param {Object} self - The current model instance.
 * @param {Object} association - Association definition.
 * @param {Object} details - Attribute details.
 * @param {Array} currentValue - Current array of related ids.
 * @param {Array} newValue - New array of related ids.
 * @param {Array} relationUpdates - Array to collect relation promises.
 * @param {Object} acc - Accumulator for updated values.
 * @returns {Object} Updated accumulator.
 */
const handleOneToMany = (self, association, details, currentValue, newValue, relationUpdates, acc) => {
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

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
        { [details.via]: getValuePrimaryKey(self.primaryKey, self.primaryKey) },
        { session }
      );
    });

  relationUpdates.push(updatePromise);
  return acc;
};

/**
 * Handle many-to-one relation updates.
 *
 * @param {any} newValue - New value of the attribute.
 * @param {Object} assocModel - Associated model.
 * @returns {any} Updated value.
 */
const handleManyToOne = (newValue, assocModel) => {
  return _.get(newValue, assocModel.primaryKey, newValue);
};

/**
 * Handle many-to-many or many-way relation updates.
 *
 * @param {Object} self - The current model instance.
 * @param {Object} association - Association definition.
 * @param {Object} details - Attribute details.
 * @param {Array} currentValue - Current array of related ids.
 * @param {Array} newValue - New array of related ids.
 * @param {Array} relationUpdates - Array to collect relation promises.
 * @param {Object} acc - Accumulator for updated values.
 * @returns {Object} Updated accumulator.
 */
const handleManyWayManyToMany = (self, association, details, currentValue, newValue, relationUpdates, acc) => {
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  if (association.dominant) {
    return _.set(
      acc,
      association.alias,
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
          [association.via]: new mongoose.Types.ObjectId(getValuePrimaryKey(self.primaryKey, self.primaryKey)),
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
          $addToSet: { [association.via]: [getValuePrimaryKey(self.primaryKey, self.primaryKey)] },
        },
        { session }
      );
    });

  relationUpdates.push(updatePromise);
  return acc;
};

/**
 * Handle many-morph-to-many relation updates.
 *
 * @param {Object} self - The current model instance.
 * @param {Object} association - Association definition.
 * @param {Array} newValue - New array of morph objects.
 * @param {Object} entry - The current entry.
 * @param {Array} relationUpdates - Array to collect relation promises.
 * @param {Object} acc - Accumulator for updated values.
 * @returns {Object} Updated accumulator.
 */
const handleManyMorphToMany = (self, association, newValue, entry, relationUpdates, acc) => {
  newValue.forEach(obj => {
    const refModel = strapi.db.getModel(obj.ref, obj.source);

    const createRelation = () => {
      return addRelationMorph(
        self,
        {
          id: entry[self.primaryKey],
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
    if (reverseAssoc?.nature === 'oneToManyMorph') {
      relationUpdates.push(
        removeRelationMorph(
          self,
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
                [obj.field]: new mongoose.Types.ObjectId(entry[self.primaryKey]),
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
              $push: { [obj.field]: new mongoose.Types.ObjectId(entry[self.primaryKey]) },
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
 * Handle one-to-many-morph or many-to-many-morph relation updates.
 *
 * @param {Object} self - The current model instance.
 * @param {Object} association - Association definition.
 * @param {Array} currentValue - Current array of related ids.
 * @param {Array} newValue - New array of related ids.
 * @param {Object} entry - The current entry.
 * @param {Array} relationUpdates - Array to collect relation promises.
 * @param {Object} acc - Accumulator for updated values.
 * @returns {Object} Updated accumulator.
 */
const handleOneToManyMorph = (self, association, currentValue, newValue, entry, relationUpdates, acc) => {
  const currentIds = transformToArrayID(currentValue, self.primaryKey);
  const newIds = transformToArrayID(newValue, self.primaryKey);

  const toAdd = _.difference(newIds, currentIds);
  const toRemove = _.difference(currentIds, newIds);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  if (!Array.isArray(newValue)) {
    _.set(acc, association.alias, newIds[0]);
  } else {
    _.set(acc, association.alias, newIds);
  }

  const addPromise = Promise.all(
    toAdd.map(id => {
      return addRelationMorph(
        model,
        {
          id,
          alias: association.via,
          ref: self.globalId,
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
          ref: self.globalId,
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
 * Process a single attribute during update.
 *
 * @param {Object} self - The current model instance.
 * @param {string} attribute - Attribute name.
 * @param {any} currentValue - Current value of the attribute.
 * @param {any} newValue - New value of the attribute.
 * @param {Object} association - Association definition.
 * @param {Object} details - Attribute details.
 * @param {Object} entry - The current entry.
 * @param {Array} relationUpdates - Array to collect relation promises.
 * @param {Object} acc - Accumulator for updated values.
 * @returns {Object} Updated accumulator.
 */
const processAttribute = (self, attribute, currentValue, newValue, association, details, entry, relationUpdates, acc) => {
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  switch (association.nature) {
    case 'oneWay':
      return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));

    case 'oneToOne':
      return handleOneToOne(self, association, details, currentValue, newValue, entry, relationUpdates, acc);

    case 'oneToMany':
      return handleOneToMany(self, association, details, currentValue, newValue, relationUpdates, acc);

    case 'manyToOne':
      return _.set(acc, attribute, handleManyToOne(newValue, assocModel));

    case 'manyWay':
    case 'manyToMany':
      return handleManyWayManyToMany(self, association, details, currentValue, newValue, relationUpdates, acc);

    case 'manyMorphToMany':
    case 'manyMorphToOne':
      return handleManyMorphToMany(self, association, newValue, entry, relationUpdates, acc);

    case 'oneToManyMorph':
    case 'manyToManyMorph':
      return handleOneToManyMorph(self, association, currentValue, newValue, entry, relationUpdates, acc);

    case 'oneMorphToOne':
    case 'oneMorphToMany':
      return acc;

    default:
      return acc;
  }
};

/**
 * Handle deletion of relations for a given entry.
 *
 * @param {Object} self - The current model instance.
 * @param {Object} association - Association definition.
 * @param {Object} entry - The entry to delete relations from.
 * @param {Object} [options] - Options including session.
 * @returns {Promise<void>}
 */
const deleteRelationForAssociation = async (self, association, entry, { session = null } = {}) => {
  const { nature, via, dominant } = association;
  const primaryKeyValue = entry[self.primaryKey];

  switch (nature) {
    case 'oneWay':
    case 'manyWay':
      return;

    case 'oneToMany':
    case 'oneToOne':
      if (!via) return;
      const targetModel1 = strapi.db.getModel(association.model || association.collection, association.plugin);
      return targetModel1.updateMany({ [via]: primaryKeyValue }, { [via]: null }, { session });

    case 'manyToMany':
    case 'manyToOne':
      if (!via || dominant) return;
      const targetModel2 = strapi.db.getModel(association.model || association.collection, association.plugin);
      return targetModel2.updateMany(
        { [via]: primaryKeyValue },
        { $pull: { [via]: primaryKeyValue } },
        { session }
      );

    case 'oneToManyMorph':
    case 'manyToManyMorph':
      const targetModel3 = strapi.db.getModel(association.model || association.collection, association.plugin);
      if (!targetModel3) return;
      const element = {
        ref: primaryKeyValue,
        kind: self.globalId,
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
        entry[association.alias].map(val => {
          const targetModel = strapi.db.getModelByGlobalId(val.kind);
          if (!targetModel) return;
          const field = val[association.filter];
          const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === field);
          if (reverseAssoc?.nature === 'oneToManyMorph') {
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

      return processAttribute(
        this,
        attribute,
        currentValue,
        newValue,
        association,
        details,
        entry,
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
    const primaryKeyValue = entry[this.primaryKey];

    return Promise.all(
      this.associations.map(async association => {
        await deleteRelationForAssociation(this, association, entry, { session });
      })
    );
  },
};