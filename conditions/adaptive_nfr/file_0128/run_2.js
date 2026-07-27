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

/** @type {Object<string, Function>} Strategy handlers for association nature types */
const associationStrategies = {
  oneWay: (acc, attribute, newValue, assocModel) => {
    return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
  },

  manyToOne: (acc, attribute, newValue, assocModel) => {
    return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
  },

  oneToOne: (acc, attribute, currentValue, newValue, assocModel, details, primaryKeyValue, relationUpdates, session) => {
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
  },

  oneToMany: (acc, attribute, currentValue, newValue, assocModel, details, primaryKeyValue, relationUpdates, session) => {
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
  },

  manyWay: (acc, attribute, newValue, assocModel, association, currentValue, primaryKeyValue, relationUpdates, session) => {
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
  },

  manyToMany: (acc, attribute, newValue, assocModel, association, currentValue, primaryKeyValue, relationUpdates, session) => {
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
  },
};

/** @type {Object<string, Function>} Strategy handlers for morph association types */
const morphStrategies = {
  manyMorphToMany: (newValue, obj, association, entry, relationUpdates, session) => {
    const refModel = strapi.db.getModel(obj.ref, obj.source);
    const reverseAssoc = refModel.associations.find(assoc => assoc.alias === obj.field);

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
  },

  manyMorphToOne: (newValue, obj, association, entry, relationUpdates, session) => {
    const refModel = strapi.db.getModel(obj.ref, obj.source);
    const reverseAssoc = refModel.associations.find(assoc => assoc.alias === obj.field);

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
  },
};

/** @type {Object<string, Function>} Strategy handlers for delete relation types */
const deleteRelationStrategies = {
  oneWay: () => undefined,

  manyWay: () => undefined,

  oneToMany: (association, primaryKeyValue, session) => {
    if (!association.via) {
      return undefined;
    }

    const targetModel = strapi.db.getModel(
      association.model || association.collection,
      association.plugin
    );

    return targetModel.updateMany({ [association.via]: primaryKeyValue }, { [association.via]: null }, { session });
  },

  oneToOne: (association, primaryKeyValue, session) => {
    if (!association.via) {
      return undefined;
    }

    const targetModel = strapi.db.getModel(
      association.model || association.collection,
      association.plugin
    );

    return targetModel.updateMany({ [association.via]: primaryKeyValue }, { [association.via]: null }, { session });
  },

  manyToMany: (association, primaryKeyValue, session) => {
    if (!association.via || association.dominant) {
      return undefined;
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
  },

  manyToOne: (association, primaryKeyValue, session) => {
    if (!association.via || association.dominant) {
      return undefined;
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
  },

  oneToManyMorph: (association, primaryKeyValue, session, globalId) => {
    const targetModel = strapi.db.getModel(
      association.model || association.collection,
      association.plugin
    );

    if (!targetModel) return undefined;

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
  },

  manyToManyMorph: (association, primaryKeyValue, session, globalId) => {
    const targetModel = strapi.db.getModel(
      association.model || association.collection,
      association.plugin
    );

    if (!targetModel) return undefined;

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
  },

  oneMorphToOne: () => undefined,

  oneMorphToMany: () => undefined,
};

/** @description Checks if association is a simple reference type */
const isSimpleReference = (nature) => nature === 'oneWay' || nature === 'manyToOne';

/** @description Checks if association is a many-to-many variant */
const isManyToManyVariant = (nature) => nature === 'manyWay' || nature === 'manyToMany';

/** @description Checks if association is a morph type */
const isMorphType = (nature) => nature === 'manyMorphToMany' || nature === 'manyMorphToOne';

/** @description Checks if association is a one-to-many morph type */
const isOneToManyMorphVariant = (nature) => nature === 'oneToManyMorph' || nature === 'manyToManyMorph';

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

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

      if (isSimpleReference(association.nature)) {
        return associationStrategies[association.nature](acc, attribute, newValue, assocModel);
      }

      if (association.nature === 'oneToOne') {
        return associationStrategies.oneToOne.call(
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
      }

      if (association.nature === 'oneToMany') {
        return associationStrategies.oneToMany.call(
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
      }

      if (isManyToManyVariant(association.nature)) {
        return associationStrategies[association.nature].call(
          this,
          acc,
          attribute,
          newValue,
          assocModel,
          association,
          currentValue,
          primaryKeyValue,
          relationUpdates,
          session
        );
      }

      if (isMorphType(association.nature)) {
        newValue.forEach(obj => {
          morphStrategies[association.nature].call(
            this,
            newValue,
            obj,
            association,
            entry,
            relationUpdates,
            session
          );
        });
        return acc;
      }

      if (isOneToManyMorphVariant(association.nature)) {
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
      }

      return acc;
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

    return updatedEntity?.toObject?.() ?? updatedEntity;
  },

  deleteRelations(entry, { session = null } = {}) {
    const primaryKeyValue = entry[this.primaryKey];

    return Promise.all(
      this.associations.map(async association => {
        const { nature } = association;

        const handler = deleteRelationStrategies[nature];

        if (!handler) {
          return undefined;
        }

        if (nature === 'manyMorphToMany' || nature === 'manyMorphToOne') {
          if (!Array.isArray(entry[association.alias])) {
            return undefined;
          }

          return Promise.all(
            entry[association.alias].map(val => {
              const targetModel = strapi.db.getModelByGlobalId(val.kind);

              if (!targetModel) return undefined;

              const field = val[association.filter];
              const reverseAssoc = targetModel.associations.find(
                assoc => assoc.alias === field
              );

              if (reverseAssoc?.nature === 'oneToManyMorph') {
                return targetModel.updateMany(
                  {
                    [targetModel.primaryKey]: val.ref?._id ?? val.ref,
                  },
                  {
                    [field]: null,
                  },
                  { session }
                );
              }

              return targetModel.updateMany(
                {
                  [targetModel.primaryKey]: val.ref?._id ?? val.ref,
                },
                {
                  $pull: { [field]: primaryKeyValue },
                },
                { session }
              );
            })
          );
        }

        return handler(association, primaryKeyValue, session, this.globalId);
      })
    );
  },
};