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

// Helper predicates for relational nature types
const isToManyMorph = nature => ['manyMorphToMany', 'manyMorphToOne'].includes(nature);
const isOneMorph = nature => ['oneToManyMorph', 'manyToManyMorph'].includes(nature);
const isMorph = nature => isToManyMorph(nature) || isOneMorph(nature);
const isOneToOne = nature => nature === 'oneToOne';
const isOneToMany = nature => nature === 'oneToMany';
const isManyToOne = nature => nature === 'manyToOne';
const isManyToMany = nature => nature === 'manyToMany' || nature === 'manyWay';

/**
 * Updates relations for a single attribute in a Strapi entry.
 * Handles polymorphic and regular relations according to association nature.
 * @param {Object} params - Update parameters.
 * @param {Object} params.entry - Current entry with attributes and associations.
 * @param {Object} params.association - Association metadata for the attribute.
 * @param {Object} params.details - Attribute schema details.
 * @param {Object} params.newValue - New value for the attribute.
 * @param {Object} params.currentValue - Current relation value.
 * @param {Object} params.assocModel - Target model for non-polymorphic relations.
 * @param {Object} params.values - Accumulator object for direct field updates.
 * @param {Array} params.relationUpdates - Array of promises for relation side-effects.
 * @param {Object} params.session - Mongoose session object.
 * @returns {Object} - Updated accumulator object.
 */
const updateAttributeRelation = async (params, { session = null } = {}) => {
  const {
    entry,
    association,
    details,
    newValue,
    currentValue,
    assocModel,
    values,
    relationUpdates,
    primaryKeyValue,
  } = params;

  switch (association.nature) {
    case 'oneWay': {
      return _.set(values, details.attribute, _.get(newValue, assocModel.primaryKey, newValue));
    }

    case 'oneToOne': {
      if (currentValue === newValue) return values;

      if (_.isNull(newValue)) {
        const updatePromise = assocModel.updateOne(
          {
            [assocModel.primaryKey]: getValuePrimaryKey(currentValue, assocModel.primaryKey),
          },
          { [details.via]: null },
          { session }
        );
        relationUpdates.push(updatePromise);
        return _.set(values, details.attribute, null);
      }

      const updateLink = entry.updateOne(
        { [details.attribute]: new mongoose.Types.ObjectId(newValue) },
        { [details.attribute]: null },
        { session }
      ).then(() => {
        return assocModel.updateOne(
          {
            [entry.primaryKey]: new mongoose.Types.ObjectId(newValue),
          },
          { [details.via]: primaryKeyValue },
          { session }
        );
      });

      relationUpdates.push(updateLink);
      return _.set(values, details.attribute, newValue);
    }

    case 'oneToMany': {
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
      return values;
    }

    case 'manyToOne': {
      return _.set(values, details.attribute, _.get(newValue, assocModel.primaryKey, newValue));
    }

    case 'manyToMany': {
      if (association.dominant) {
        return _.set(
          values,
          details.attribute,
          newValue ? newValue.map(val => assocModel.primaryKey in val ? val[assocModel.primaryKey] : val) : newValue
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
      return values;
    }

    case 'manyWay': {
      // same logic as manyToMany but without $addToSet semantics
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
              $push: { [association.via]: new mongoose.Types.ObjectId(primaryKeyValue) },
            },
            { session }
          );
        });

      relationUpdates.push(updatePromise);
      return values;
    }

    // media -> model
    case 'manyMorphToMany':
    case 'manyMorphToOne': {
      newValue.forEach(obj => {
        const refModel = strapi.db.getModel(obj.ref, obj.source);
        const refId = new mongoose.Types.ObjectId(obj.refId);

        const createRelation = () => {
          return addRelationMorph(
            entry.model || entry,
            {
              id: entry[entry.primaryKey],
              alias: association.alias,
              ref: obj.kind || refModel.globalId,
              refId,
              field: obj.field,
              filter: association.filter,
            },
            { session }
          );
        };

        const reverseAssoc = refModel.associations.find(assoc => assoc.alias === obj.field);
        if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
          relationUpdates.push(
            removeRelationMorph(
              entry.model || entry,
              {
                alias: association.alias,
                ref: obj.kind || refModel.globalId,
                refId,
                field: obj.field,
                filter: association.filter,
              },
              { session }
            )
              .then(createRelation)
              .then(() => {
                return refModel.updateMany(
                  {
                    [refModel.primaryKey]: refId,
                  },
                  {
                    [obj.field]: new mongoose.Types.ObjectId(entry[entry.primaryKey]),
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
                  [refModel.primaryKey]: refId,
                },
                {
                  $push: { [obj.field]: new mongoose.Types.ObjectId(entry[entry.primaryKey]) },
                },
                { session }
              );
            })
          );
        }
      });
      break;
    }

    // model -> media
    case 'oneToManyMorph':
    case 'manyToManyMorph': {
      const currentIds = transformToArrayID(currentValue, entry.primaryKey);
      const newIds = transformToArrayID(newValue, entry.primaryKey);

      const toAdd = _.difference(newIds, currentIds);
      const toRemove = _.difference(currentIds, newIds);

      const model = strapi.db.getModel(details.model || details.collection, details.plugin);

      if (!Array.isArray(newValue)) {
        _.set(values, details.attribute, newIds[0]);
      } else {
        _.set(values, details.attribute, newIds);
      }

      const addPromise = Promise.all(
        toAdd.map(id => {
          return addRelationMorph(
            model,
            {
              id,
              alias: association.via,
              ref: entry.globalId,
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
              ref: entry.globalId,
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
      break;

    default:
  }

  return values;
};

/**
 * Updates relations for all associations in the entry by delegating per-attribute logic.
 * @param {Object} params - Parameters passed from main update function.
 * @param {Object} params.session - Mongoose session.
 * @param {Object} params.entry - Existing entry.
 * @param {Object} params.values - Accumulator for updated values.
 * @param {Array} params.relationUpdates - Relation update promises.
 * @param {Object} params.primaryKeyValue - Primary key value of the entry.
 * @param {Object} params.attributes - Model attributes.
 * @returns {Object} - Updated values object.
 */
const processAllAssociations = async (params, { session = null } = {}) => {
  const {
    entry,
    values,
    relationUpdates,
    primaryKeyValue,
    associations,
    attributes,
  } = params;

  for (const association of associations) {
    const attribute = association.alias;
    const currentValue = entry[attribute];
    const newValue = params.values[attribute];
    const details = attributes[attribute];

    if (!newValue && !currentValue) {
      continue;
    }

    if (!association)
      return _.set(values, attribute, newValue);

    const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

    if (association.nature === 'oneWay' || association.nature === 'manyToOne') {
      await updateAttributeRelation(
        {
          entry,
          association,
          details,
          newValue,
          currentValue,
          assocModel,
          values,
          relationUpdates,
          primaryKeyValue,
          attribute,
        },
        { session }
      );
    } else if (['oneToMany', 'manyToMany', 'manyWay'].includes(association.nature)) {
      await updateAttributeRelation(
        {
          entry,
          association,
          details,
          newValue,
          currentValue,
          assocModel,
          values,
          relationUpdates,
          primaryKeyValue,
          attribute,
        },
        { session }
      );
    } else if (isMorph(association.nature)) {
      await updateAttributeRelation(
        {
          entry,
          association,
          details,
          newValue,
          currentValue,
          values,
          relationUpdates,
          primaryKeyValue,
          attribute,
        },
        { session }
      );
    } else {
      // Handle remaining attributes (e.g., plain fields, virtuals) via direct update
      const associationNature = association.nature;
      if (associationNature === 'oneToOne') {
        await updateAttributeRelation(
          {
            entry,
            association,
            details,
            newValue,
            currentValue,
            assocModel,
            values,
            relationUpdates,
            primaryKeyValue,
            attribute,
          },
          { session }
        );
      } else if (associationNature === 'oneToMany') {
        await updateAttributeRelation(
          {
            entry,
            association,
            details,
            newValue,
            currentValue,
            assocModel,
            values,
            relationUpdates,
            primaryKeyValue,
            attribute,
          },
          { session }
        );
      }
    }
  }

  return values;
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

      // Handle simple attributes
      if (!association && _.get(details, 'isVirtual') !== true) {
        return _.set(acc, attribute, newValue);
      }

      return acc;
    }, {});

    // Process all associations
    await processAllAssociations(
      {
        entry,
        values,
        relationUpdates,
        primaryKeyValue,
        associations: this.associations,
        attributes: this._attributes,
        values: params.values,
      },
      { session }
    );

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

    return updatedEntity && updatedEntity.toObject ? updatedEntity.toObject() : updatedEntity;
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
            if (!via) {
              return;
            }

            const targetModel = strapi.db.getModel(
              association.model || association.collection,
              association.plugin
            );

            return targetModel.updateMany({ [via]: primaryKeyValue }, { [via]: null }, { session });
          }
          case 'manyToMany':
          case 'manyToOne': {
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
          }
          case 'oneToManyMorph':
          case 'manyToManyMorph': {
            // delete relation inside of the ref model

            const targetModel = strapi.db.getModel(
              association.model || association.collection,
              association.plugin
            );

            // ignore them ghost relations
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
            // delete relation inside of the ref model
            // console.log(entry[association.alias]);

            if (Array.isArray(entry[association.alias])) {
              return Promise.all(
                entry[association.alias].map(val => {
                  const targetModel = strapi.db.getModelByGlobalId(val.kind);

                  // ignore them ghost relations
                  if (!targetModel) return;

                  const field = val[association.filter];
                  const reverseAssoc = targetModel.associations.find(
                    assoc => assoc.alias === field
                  );

                  if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
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
            }

            return;
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