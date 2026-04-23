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
 * Transforms a value or array of values into an array of stringified IDs.
 *
 * @param {any} array - The value or array of values to transform.
 * @param {string} pk - The primary key field name.
 * @returns {string[]} An array of stringified IDs.
 */
const transformToArrayID = (array, pk) => {
  if (_.isArray(array)) {
    return array
      .map((value) => value && (getValuePrimaryKey(value, pk) || value))
      .filter((n) => n)
      .map((val) => _.toString(val));
  }

  return transformToArrayID([array]);
};

/**
 * Removes keys with undefined values from an object.
 *
 * @param {Object} obj - The object to clean.
 * @returns {Object} The cleaned object.
 */
const removeUndefinedKeys = (obj = {}) => _.pickBy(obj, _.negate(_.isUndefined));

/**
 * Adds a morph relation to a model.
 *
 * @param {Object} model - The Mongoose model.
 * @param {Object} params - Parameters for the relation.
 * @param {Object} options - Options including session.
 * @returns {Promise} The update promise.
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
 * Removes a morph relation from a model.
 *
 * @param {Object} model - The Mongoose model.
 * @param {Object} params - Parameters for the relation.
 * @param {Object} options - Options including session.
 * @returns {Promise} The update promise.
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
 * Handles association updates based on nature.
 *
 * @param {Object} params - Parameters for handling the association.
 * @returns {Object} Updated accumulator.
 */
const handleAssociation = ({
  attribute,
  newValue,
  acc,
  assocModel,
  details,
  entry,
  primaryKeyValue,
  session,
  relationUpdates,
  association,
}) => {
  const { nature, dominant, via, alias, filter, via: viaField } = association;

  switch (nature) {
    case 'oneWay': {
      return _.set(acc, attribute, newValue?.[assocModel.primaryKey] ?? newValue);
    }
    case 'oneToOne': {
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
    }
    case 'oneToMany': {
      const attributeIds = currentValue;
      const toRemove = _.differenceWith(
        attributeIds,
        newValue,
        (a, b) => `${a[assocModel.primaryKey] ?? a}` === `${b[assocModel.primaryKey] ?? b}`
      );

      const updatePromise = assocModel
        .updateMany(
          {
            [assocModel.primaryKey]: {
              $in: toRemove.map(
                (val) => new mongoose.Types.ObjectId(val[assocModel.primaryKey] ?? val)
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
                  (val) => new mongoose.Types.ObjectId(val[assocModel.primaryKey] ?? val)
                ),
              },
            },
            { [details.via]: primaryKeyValue },
            { session }
          );
        });

      relationUpdates.push(updatePromise);
      return acc;
    }
    case 'manyToOne': {
      return _.set(acc, attribute, newValue?.[assocModel.primaryKey] ?? newValue);
    }
    case 'manyWay':
    case 'manyToMany': {
      if (dominant) {
        return _.set(
          acc,
          attribute,
          newValue
            ? newValue.map((val) => val[assocModel.primaryKey] ?? val)
            : newValue
        );
      }

      const updatePomise = assocModel
        .updateMany(
          {
            [assocModel.primaryKey]: {
              $in: currentValue.map(
                (val) => new mongoose.Types.ObjectId(val[assocModel.primaryKey] ?? val)
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
                      (val) => new mongoose.Types.ObjectId(val[assocModel.primaryKey] ?? val)
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

      relationUpdates.push(updatePomise);
      return acc;
    }
    case 'manyMorphToMany':
    case 'manyMorphToOne': {
      newValue.forEach((obj) => {
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

        const reverseAssoc = refModel.associations.find(
          (assoc) => assoc.alias === obj.field
        );
        if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
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
      break;
    }
    case 'oneToManyMorph':
    case 'manyToManyMorph': {
      const currentIds = transformToArrayID(currentValue, this.primaryKey);
      const newIds = transformToArrayID(newValue, this.primaryKey);

      const toAdd = _.difference(newIds, currentIds);
      const toRemove = _.difference(currentIds, newIds);

      const model = strapi.db.getModel(
        details.model || details.collection,
        details.plugin
      );

      if (!Array.isArray(newValue)) {
        _.set(acc, attribute, newIds[0]);
      } else {
        _.set(acc, attribute, newIds);
      }

      const addPromise = Promise.all(
        toAdd.map((id) => {
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

      toRemove.forEach((id) => {
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
      break;
    }
    case 'oneMorphToOne':
    case 'oneMorphToMany':
      return acc;
    default:
      return acc;
  }
};

/**
 * Handles deletion of relations based on association nature.
 *
 * @param {Object} association - The association definition.
 * @param {Object} entry - The entry being deleted.
 * @param {Object} options - Options including session.
 * @returns {Promise} The deletion promise.
 */
const handleDeleteRelation = async (association, entry, { session = null } = {}) => {
  const { nature, via, dominant } = association;
  const primaryKeyValue = entry[this.primaryKey];

  switch (nature) {
    case 'oneWay':
    case 'manyWay':
      return;
    case 'oneToMany':
    case 'oneToOne': {
      if (!via) return;

      const targetModel = strapi.db.getModel(
        association.model || association.collection,
        association.plugin
      );

      return targetModel.updateMany({ [via]: primaryKeyValue }, { [via]: null }, { session });
    }
    case 'manyToMany':
    case 'manyToOne': {
      if (!via || dominant) return;

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
    case 'oneToManyMorph':
    case 'manyToManyMorph': {
      const targetModel = strapi.db.getModel(
        association.model || association.collection,
        association.plugin
      );

      if (!targetModel) return;

      const element = {
        ref: primaryKeyValue,
        kind: this.globalId,
        [association.filter]: association.alias,
      };

      return targetModel.updateMany(
        { [via]: { $elemMatch: element } },
        { $pull: { [via]: element } },
        { session }
      );
    }
    case 'manyMorphToMany':
    case 'manyMorphToOne': {
      if (Array.isArray(entry[association.alias])) {
        return Promise.all(
          entry[association.alias].map((val) => {
            const targetModel = strapi.db.getModelByGlobalId(val.kind);

            if (!targetModel) return;

            const field = val[association.filter];
            const reverseAssoc = targetModel.associations.find(
              (assoc) => assoc.alias === field
            );

            if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
              return targetModel.updateMany(
                {
                  [targetModel.primaryKey]:
                    val.ref && (val.ref._id || val.ref),
                },
                {
                  [field]: null,
                },
                { session }
              );
            }

            return targetModel.updateMany(
              {
                [targetModel.primaryKey]:
                  val.ref && (val.ref._id || val.ref),
              },
              {
                $pull: { [field]: primaryKeyValue },
              },
              { session }
            );
          })
        );
      }

      return;
    }
    case 'oneMorphToOne':
    case 'oneMorphToMany':
      return;
  }
};

module.exports = {
  async update(params, { session = null } = {}) {
    const relationUpdates = [];
    const populate = this.associations.map((x) => x.alias);
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);

    const entry = await this.findOne({ [this.primaryKey]: primaryKeyValue })
      .session(session)
      .populate(populate)
      .lean();

    const values = Object.keys(removeUndefinedKeys(params.values)).reduce(
      (acc, attribute) => {
        const currentValue = entry[attribute];
        const newValue = params.values[attribute];

        const association = this.associations.find((x) => x.alias === attribute);

        const details = this._attributes[attribute];

        if (!association && _.get(details, 'isVirtual') !== true) {
          return _.set(acc, attribute, newValue);
        }

        const assocModel = strapi.db.getModel(
          details.model || details.collection,
          details.plugin
        );

        return handleAssociation({
          attribute,
          newValue,
          acc,
          assocModel,
          details,
          entry,
          primaryKeyValue,
          session,
          relationUpdates,
          association,
          currentValue,
        });
      },
      {}
    );

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

    return updatedEntity && updatedEntity.toObject
      ? updatedEntity.toObject()
      : updatedEntity;
  },

  deleteRelations(entry, { session = null } = {}) {
    const primaryKeyValue = entry[this.primaryKey];

    return Promise.all(
      this.associations.map(async (association) => {
        return handleDeleteRelation.call(this, association, entry, { session });
      })
    );
  },
};