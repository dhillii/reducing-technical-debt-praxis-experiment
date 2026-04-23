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
 * Transform a value or array of values to an array of string IDs.
 * @param {any|any[]} array
 * @param {string} pk
 * @returns {string[]}
 */
const transformToArrayID = (array, pk) => {
  if (_.isArray(array)) {
    return array
      .map(value => value && (getValuePrimaryKey(value, pk) || value))
      .filter(n => n)
      .map(val => _.toString(val));
  }

  return transformToArrayID([array], pk);
};

/**
 * Remove keys with undefined values from an object.
 * @param {Object} obj
 * @returns {Object}
 */
const removeUndefinedKeys = (obj = {}) => _.pickBy(obj, _.negate(_.isUndefined));

/**
 * Add a morph relation.
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
 * Remove a morph relation.
 */
const removeRelationMorph = async (model, params, { session = null } = {}) => {
  const { alias } = params;

  let opts;
  // if entry id is provided simply query it
  if (params?.id) {
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
 * Handlers for different association natures during update.
 */
const natureHandlers = {
  oneWay: ({ attribute, newValue, assocModel, acc }) => {
    return _.set(acc, attribute, newValue?.[assocModel.primaryKey] ?? newValue);
  },

  oneToOne: ({
    attribute,
    newValue,
    currentValue,
    assocModel,
    details,
    primaryKeyValue,
    relationUpdates,
    acc,
    session,
    thisModel,
  }) => {
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

    const updateLink = thisModel
      .updateOne(
        { [attribute]: new mongoose.Types.ObjectId(newValue) },
        { [attribute]: null },
        { session }
      )
      .then(() => {
        return assocModel.updateOne(
          {
            [thisModel.primaryKey]: new mongoose.Types.ObjectId(newValue),
          },
          { [details.via]: primaryKeyValue },
          { session }
        );
      });

    relationUpdates.push(updateLink);
    return _.set(acc, attribute, newValue);
  },

  oneToMany: ({
    attribute,
    newValue,
    currentValue,
    assocModel,
    details,
    primaryKeyValue,
    relationUpdates,
    session,
  }) => {
    const toRemove = _.differenceWith(currentValue, newValue, (a, b) => {
      return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
    });

    const updatePromise = assocModel
      .updateMany(
        {
          [assocModel.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)),
          },
        },
        { [details.via]: null },
        { session }
      )
      .then(() => {
        return assocModel.updateMany(
          {
            [assocModel.primaryKey]: {
              $in: newValue.map(val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)),
            },
          },
          { [details.via]: primaryKeyValue },
          { session }
        );
      });

    relationUpdates.push(updatePromise);
    return null;
  },

  manyToOne: ({ attribute, newValue, assocModel, acc }) => {
    return _.set(acc, attribute, newValue?.[assocModel.primaryKey] ?? newValue);
  },

  manyWay: ({ attribute, newValue, assocModel, details, primaryKeyValue, relationUpdates, session, association }) => {
    // shared with manyToMany
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
                ? newValue.map(val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val))
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
    return null;
  },

  manyToMany: ({ attribute, newValue, assocModel, details, primaryKeyValue, relationUpdates, session, association }) => {
    // delegate to manyWay handler (same logic)
    return natureHandlers.manyWay({
      attribute,
      newValue,
      assocModel,
      details,
      primaryKeyValue,
      relationUpdates,
      session,
      association,
    });
  },

  manyMorphToMany: ({ entry, association, newValue, relationUpdates, session }) => {
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

      const reverseAssoc = refModel.associations.find(assoc => assoc.alias === obj.field);
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
  },

  manyMorphToOne: ({ entry, association, newValue, relationUpdates, session }) => {
    // same handling as manyMorphToMany
    natureHandlers.manyMorphToMany({ entry, association, newValue, relationUpdates, session });
  },

  oneToManyMorph: ({ entry, association, currentValue, newValue, relationUpdates, session }) => {
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
      toAdd.map(id =>
        addRelationMorph(
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
      )
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
  },

  manyToManyMorph: ({ entry, association, currentValue, newValue, relationUpdates, session }) => {
    // same handling as oneToManyMorph
    natureHandlers.oneToManyMorph({ entry, association, currentValue, newValue, relationUpdates, session });
  },

  oneMorphToOne: () => null,
  oneMorphToMany: () => null,
};

/**
 * Exported module.
 */
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

      // set simple attributes
      if (!association && details?.isVirtual !== true) {
        return _.set(acc, attribute, newValue);
      }

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
      const handler = natureHandlers[association.nature];

      if (handler) {
        const result = handler({
          attribute,
          newValue,
          currentValue,
          assocModel,
          details,
          primaryKeyValue,
          relationUpdates,
          session,
          association,
          entry,
          thisModel: this,
          acc,
        });

        // Handlers may return a new accumulator or null (when they manage acc internally)
        if (result !== null && result !== undefined) {
          return result;
        }
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

    return updatedEntity && updatedEntity.toObject ? updatedEntity.toObject() : updatedEntity;
  },

  deleteRelations(entry, { session = null } = {}) {
    const primaryKeyValue = entry[this.primaryKey];

    const deleteHandlers = {
      oneWay: () => null,
      manyWay: () => null,
      oneToMany: ({ association }) => {
        if (!association.via) return null;
        const targetModel = strapi.db.getModel(
          association.model || association.collection,
          association.plugin
        );
        return targetModel.updateMany({ [association.via]: primaryKeyValue }, { [association.via]: null }, { session });
      },
      oneToOne: ({ association }) => {
        if (!association.via) return null;
        const targetModel = strapi.db.getModel(
          association.model || association.collection,
          association.plugin
        );
        return targetModel.updateMany({ [association.via]: primaryKeyValue }, { [association.via]: null }, { session });
      },
      manyToMany: ({ association }) => {
        if (!association.via || association.dominant) return null;
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
      manyToOne: ({ association }) => {
        if (!association.via || association.dominant) return null;
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
      oneToManyMorph: ({ association }) => {
        const targetModel = strapi.db.getModel(
          association.model || association.collection,
          association.plugin
        );
        if (!targetModel) return null;
        const element = {
          ref: primaryKeyValue,
          kind: this.globalId,
          [association.filter]: association.alias,
        };
        return targetModel.updateMany(
          { [association.via]: { $elemMatch: element } },
          { $pull: { [association.via]: element } },
          { session }
        );
      },
      manyToManyMorph: ({ association }) => {
        const targetModel = strapi.db.getModel(
          association.model || association.collection,
          association.plugin
        );
        if (!targetModel) return null;
        const element = {
          ref: primaryKeyValue,
          kind: this.globalId,
          [association.filter]: association.alias,
        };
        return targetModel.updateMany(
          { [association.via]: { $elemMatch: element } },
          { $pull: { [association.via]: element } },
          { session }
        );
      },
      manyMorphToMany: async ({ association }) => {
        if (!Array.isArray(entry[association.alias])) return null;
        return Promise.all(
          entry[association.alias].map(async val => {
            const targetModel = strapi.db.getModelByGlobalId(val.kind);
            if (!targetModel) return null;
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
      },
      manyMorphToOne: async ({ association }) => {
        // same as manyMorphToMany
        return deleteHandlers.manyMorphToMany({ association });
      },
      oneMorphToOne: () => null,
      oneMorphToMany: () => null,
    };

    return Promise.all(
      this.associations.map(async association => {
        const handler = deleteHandlers[association.nature];
        if (handler) {
          return handler({ association });
        }
        return null;
      })
    );
  },
};