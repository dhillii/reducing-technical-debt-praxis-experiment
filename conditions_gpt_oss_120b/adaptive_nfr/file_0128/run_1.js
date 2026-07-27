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

/**
 * Handlers for each association nature.
 * Each handler receives a context object and mutates `acc` and `relationUpdates` as needed.
 */
const natureHandlers = {
  oneWay: handleOneWay,
  oneToOne: handleOneToOne,
  oneToMany: handleOneToMany,
  manyToOne: handleManyToOne,
  manyWay: handleManyWayOrManyToMany,
  manyToMany: handleManyWayOrManyToMany,
  manyMorphToMany: handleManyMorphToManyOrOne,
  manyMorphToOne: handleManyMorphToManyOrOne,
  oneToManyMorph: handleOneToManyMorphOrManyToManyMorph,
  manyToManyMorph: handleOneToManyMorphOrManyToManyMorph,
  oneMorphToOne: () => {},
  oneMorphToMany: () => {},
};

/**
 * Handler for 'oneWay' nature.
 */
function handleOneWay({ acc, attribute, newValue, assocModel, details }) {
  _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
}

/**
 * Handler for 'oneToOne' nature.
 */
function handleOneToOne({
  acc,
  attribute,
  currentValue,
  newValue,
  association,
  details,
  entry,
  primaryKeyValue,
  relationUpdates,
  session,
}) {
  if (currentValue === newValue) return;
  if (_.isNull(newValue)) {
    const updatePromise = strapi
      .db
      .getModel(details.model || details.collection, details.plugin)
      .updateOne(
        {
          [strapi.db.getModel(details.model || details.collection, details.plugin).primaryKey]:
            getValuePrimaryKey(currentValue, strapi.db.getModel(details.model || details.collection, details.plugin).primaryKey),
        },
        { [details.via]: null },
        { session }
      );
    relationUpdates.push(updatePromise);
    _.set(acc, attribute, null);
    return;
  }

  const updateLink = this.updateOne(
    { [attribute]: new mongoose.Types.ObjectId(newValue) },
    { [attribute]: null },
    { session }
  ).then(() => {
    const targetModel = strapi.db.getModel(details.model || details.collection, details.plugin);
    return targetModel.updateOne(
      {
        [this.primaryKey]: new mongoose.Types.ObjectId(newValue),
      },
      { [details.via]: primaryKeyValue },
      { session }
    );
  });

  relationUpdates.push(updateLink);
  _.set(acc, attribute, newValue);
}

/**
 * Handler for 'oneToMany' nature.
 */
function handleOneToMany({
  acc,
  attribute,
  currentValue,
  newValue,
  details,
  primaryKeyValue,
  relationUpdates,
  session,
}) {
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
  const attributeIds = currentValue;
  const toRemove = _.differenceWith(attributeIds, newValue, (a, b) => {
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
}

/**
 * Handler for 'manyToOne' nature.
 */
function handleManyToOne({ acc, attribute, newValue, assocModel }) {
  _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
}

/**
 * Handler for 'manyWay' and 'manyToMany' natures.
 */
function handleManyWayOrManyToMany({
  acc,
  attribute,
  currentValue,
  newValue,
  association,
  details,
  primaryKeyValue,
  relationUpdates,
  session,
}) {
  if (association.dominant) {
    _.set(
      acc,
      attribute,
      newValue ? newValue.map(val => val[details.model?.primaryKey] || val) : newValue
    );
    return;
  }

  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
  const updatePromise = assocModel
    .updateMany(
      {
        [assocModel.primaryKey]: {
          $in: currentValue.map(val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)),
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
}

/**
 * Handler for 'manyMorphToMany' and 'manyMorphToOne' natures.
 */
function handleManyMorphToManyOrOne({
  entry,
  association,
  newValue,
  relationUpdates,
  session,
}) {
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
}

/**
 * Handler for 'oneToManyMorph' and 'manyToManyMorph' natures.
 */
function handleOneToManyMorphOrManyToManyMorph({
  entry,
  association,
  currentValue,
  newValue,
  details,
  relationUpdates,
  session,
}) {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const newIds = transformToArrayID(newValue, this.primaryKey);

  const toAdd = _.difference(newIds, currentIds);
  const toRemove = _.difference(currentIds, newIds);

  const model = strapi.db.getModel(details.model || details.collection, details.plugin);

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
}

/**
 * Main exported module.
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

      if (!association && _.get(details, 'isVirtual') !== true) {
        _.set(acc, attribute, newValue);
        return acc;
      }

      const handler = natureHandlers[association.nature];
      if (handler) {
        handler.call(this, {
          acc,
          attribute,
          currentValue,
          newValue,
          association,
          details,
          entry,
          primaryKeyValue,
          relationUpdates,
          session,
        });
      }

      return acc;
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
        const { nature, via, dominant } = association;

        switch (nature) {
          case 'oneWay':
          case 'manyWay':
            return;
          case 'oneToMany':
          case 'oneToOne':
            if (!via) return;
            const targetModel1 = strapi.db.getModel(
              association.model || association.collection,
              association.plugin
            );
            return targetModel1.updateMany({ [via]: primaryKeyValue }, { [via]: null }, { session });
          case 'manyToMany':
          case 'manyToOne':
            if (!via || dominant) return;
            const targetModel2 = strapi.db.getModel(
              association.model || association.collection,
              association.plugin
            );
            return targetModel2.updateMany(
              { [via]: primaryKeyValue },
              { $pull: { [via]: primaryKeyValue } },
              { session }
            );
          case 'oneToManyMorph':
          case 'manyToManyMorph':
            const targetModel3 = strapi.db.getModel(
              association.model || association.collection,
              association.plugin
            );
            if (!targetModel3) return;
            const element = {
              ref: primaryKeyValue,
              kind: this.globalId,
              [association.filter]: association.alias,
            };
            return targetModel3.updateMany(
              { [via]: { $elemMatch: element } },
              { $pull: { [via]: element } },
              { session }
            );
          case 'manyMorphToMany':
          case 'manyMorphToOne':
            if (Array.isArray(entry[association.alias])) {
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
            }
            return;
          case 'oneMorphToOne':
          case 'oneMorphToMany':
            return;
        }
      })
    );
  },
};