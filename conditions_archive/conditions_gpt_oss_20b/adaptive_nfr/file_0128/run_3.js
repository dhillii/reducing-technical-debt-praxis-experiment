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
      const currentValue = entry?.[attribute];
      const newValue = params.values?.[attribute];
      const association = this.associations.find(x => x.alias === attribute);
      const details = this._attributes?.[attribute];

      // set simple attributes
      if (!association && details?.isVirtual !== true) {
        acc[attribute] = newValue;
        return acc;
      }

      const assocModel = strapi.db.getModel(details?.model || details?.collection, details?.plugin);

      const handlers = {
        oneWay: () => {
          acc[attribute] = newValue?.[assocModel.primaryKey] ?? newValue;
          return acc;
        },
        oneToOne: () => {
          if (currentValue === newValue) return acc;
          if (newValue == null) {
            const updatePromise = assocModel.updateOne(
              {
                [assocModel.primaryKey]: getValuePrimaryKey(currentValue, assocModel.primaryKey),
              },
              { [details.via]: null },
              { session }
            );
            relationUpdates.push(updatePromise);
            acc[attribute] = null;
            return acc;
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
          acc[attribute] = newValue;
          return acc;
        },
        oneToMany: () => {
          const attributeIds = currentValue;
          const toRemove = _.differenceWith(
            attributeIds,
            newValue,
            (a, b) => `${a?.[assocModel.primaryKey] ?? a}` === `${b?.[assocModel.primaryKey] ?? b}`
          );

          const updatePromise = assocModel
            .updateMany(
              {
                [assocModel.primaryKey]: {
                  $in: toRemove.map(
                    val => new mongoose.Types.ObjectId(val?.[assocModel.primaryKey] ?? val)
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
                      val => new mongoose.Types.ObjectId(val?.[assocModel.primaryKey] ?? val)
                    ),
                  },
                },
                { [details.via]: primaryKeyValue },
                { session }
              );
            });

          relationUpdates.push(updatePromise);
          return acc;
        },
        manyToOne: () => {
          acc[attribute] = newValue?.[assocModel.primaryKey] ?? newValue;
          return acc;
        },
        manyWay: () => handlers.manyToMany(),
        manyToMany: () => {
          if (association.dominant) {
            acc[attribute] = newValue
              ? newValue.map(val => val?.[assocModel.primaryKey] ?? val)
              : newValue;
            return acc;
          }

          const updatePromise = assocModel
            .updateMany(
              {
                [assocModel.primaryKey]: {
                  $in: currentValue.map(
                    val => new mongoose.Types.ObjectId(val?.[assocModel.primaryKey] ?? val)
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
                          val => new mongoose.Types.ObjectId(val?.[assocModel.primaryKey] ?? val)
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
        },
        manyMorphToMany: () => handlers.manyMorphToOne(),
        manyMorphToOne: () => {
          newValue?.forEach(obj => {
            const refModel = strapi.db.getModel(obj.ref, obj.source);

            const createRelation = () => {
              return addRelationMorph(
                this,
                {
                  id: entry?.[this.primaryKey],
                  alias: association.alias,
                  ref: obj.kind ?? refModel.globalId,
                  refId: new mongoose.Types.ObjectId(obj.refId),
                  field: obj.field,
                  filter: association.filter,
                },
                { session }
              );
            };

            const reverseAssoc = refModel.associations.find(
              assoc => assoc.alias === obj.field
            );
            if (reverseAssoc?.nature === 'oneToManyMorph') {
              relationUpdates.push(
                removeRelationMorph(
                  this,
                  {
                    alias: association.alias,
                    ref: obj.kind ?? refModel.globalId,
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
                        [obj.field]: new mongoose.Types.ObjectId(entry?.[this.primaryKey]),
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
                      $push: { [obj.field]: new mongoose.Types.ObjectId(entry?.[this.primaryKey]) },
                    },
                    { session }
                  );
                })
              );
            }
          });
          return acc;
        },
        oneToManyMorph: () => handlers.manyToManyMorph(),
        manyToManyMorph: () => handlers.manyToManyMorph(),
        manyToManyMorph: () => {
          const currentIds = transformToArrayID(currentValue, this.primaryKey);
          const newIds = transformToArrayID(newValue, this.primaryKey);

          const toAdd = _.difference(newIds, currentIds);
          const toRemove = _.difference(currentIds, newIds);

          const model = strapi.db.getModel(
            details?.model ?? details?.collection,
            details?.plugin
          );

          acc[attribute] = Array.isArray(newValue) ? newIds : newIds[0];

          const addPromise = Promise.all(
            toAdd.map(id => {
              return addRelationMorph(
                model,
                {
                  id,
                  alias: association.via,
                  ref: this.globalId,
                  refId: entry?._id,
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
                  refId: entry?._id,
                  field: association.alias,
                  filter: association.filter,
                },
                { session }
              )
            );
          });

          return acc;
        },
        oneMorphToOne: () => acc,
        oneMorphToMany: () => acc,
      };

      const handler = handlers[association?.nature];
      return handler ? handler() : acc;
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

    return updatedEntity?.toObject ? updatedEntity.toObject() : updatedEntity;
  },

  deleteRelations(entry, { session = null } = {}) {
    const primaryKeyValue = entry?.[this.primaryKey];

    return Promise.all(
      this.associations.map(async association => {
        const { nature, via, dominant } = association;

        const handlers = {
          oneWay: () => Promise.resolve(),
          manyWay: () => Promise.resolve(),
          oneToMany: () => {
            if (!via) return;
            const targetModel = strapi.db.getModel(
              association.model ?? association.collection,
              association.plugin
            );
            return targetModel.updateMany({ [via]: primaryKeyValue }, { [via]: null }, { session });
          },
          oneToOne: () => {
            if (!via) return;
            const targetModel = strapi.db.getModel(
              association.model ?? association.collection,
              association.plugin
            );
            return targetModel.updateMany({ [via]: primaryKeyValue }, { [via]: null }, { session });
          },
          manyToMany: () => {
            if (!via || dominant) return;
            const targetModel = strapi.db.getModel(
              association.model ?? association.collection,
              association.plugin
            );
            return targetModel.updateMany(
              { [via]: primaryKeyValue },
              { $pull: { [via]: primaryKeyValue } },
              { session }
            );
          },
          manyToOne: () => {
            if (!via || dominant) return;
            const targetModel = strapi.db.getModel(
              association.model ?? association.collection,
              association.plugin
            );
            return targetModel.updateMany(
              { [via]: primaryKeyValue },
              { $pull: { [via]: primaryKeyValue } },
              { session }
            );
          },
          oneToManyMorph: () => {
            const targetModel = strapi.db.getModel(
              association.model ?? association.collection,
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
          },
          manyToManyMorph: () => handlers.oneToManyMorph(),
          manyMorphToMany: () => {
            if (!Array.isArray(entry?.[association.alias])) return;
            return Promise.all(
              entry[association.alias].map(val => {
                const targetModel = strapi.db.getModelByGlobalId(val.kind);
                if (!targetModel) return;
                const field = val[association.filter];
                const reverseAssoc = targetModel.associations.find(
                  assoc => assoc.alias === field
                );
                if (reverseAssoc?.nature === 'oneToManyMorph') {
                  return targetModel.updateMany(
                    {
                      [targetModel.primaryKey]: val.ref && (val.ref._id ?? val.ref),
                    },
                    {
                      [field]: null,
                    },
                    { session }
                  );
                }
                return targetModel.updateMany(
                  {
                    [targetModel.primaryKey]: val.ref && (val.ref._id ?? val.ref),
                  },
                  {
                    $pull: { [field]: primaryKeyValue },
                  },
                  { session }
                );
              })
            );
          },
          oneMorphToOne: () => Promise.resolve(),
          oneMorphToMany: () => Promise.resolve(),
        };

        const handler = handlers[nature];
        return handler ? handler() : undefined;
      })
    );
  },
};