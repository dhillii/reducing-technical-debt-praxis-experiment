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

const updateSimpleAttribute = (acc, attribute, newValue, entry, details) => {
  // set simple attributes
  if (!details.association && _.get(details, 'isVirtual') !== true) {
    return _.set(acc, attribute, newValue);
  }
  return acc;
};

const updateOneWayAttribute = (acc, attribute, newValue, entry, details) => {
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
  return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
};

const updateOneToManyAttribute = async (acc, attribute, newValue, entry, details, session) => {
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
  const attributeIds = entry[attribute];
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
        { [details.via]: entry[this.primaryKey] },
        { session }
      );
    });

  return updatePromise;
};

const updateManyToOneAttribute = (acc, attribute, newValue, entry, details) => {
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
  return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
};

const updateManyToManyAttribute = async (acc, attribute, newValue, entry, details, session) => {
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
  const updatePomise = assocModel
    .updateMany(
      {
        [assocModel.primaryKey]: {
          $in: entry[attribute].map(
            val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)
          ),
        },
      },
      {
        $pull: {
          [details.via]: new mongoose.Types.ObjectId(entry[this.primaryKey]),
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
          $addToSet: { [details.via]: [entry[this.primaryKey]] },
        },
        { session }
      );
    });

  return updatePomise;
};

const updateMorphAttribute = async (acc, attribute, newValue, entry, details, session) => {
  const association = details.association;
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

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
    const reverseAssoc = refModel.associations.find(assoc => assoc.alias === obj.field);
    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      acc.push(
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
      acc.push(
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

  return acc;
};

const updateOneToManyMorphAttribute = async (acc, attribute, newValue, entry, details, session) => {
  const association = details.association;
  const model = strapi.db.getModel(details.model || details.collection, details.plugin);

  // Compare array of ID to find deleted files.
  const currentIds = transformToArrayID(entry[attribute], this.primaryKey);
  const newIds = transformToArrayID(newValue, this.primaryKey);

  const toAdd = _.difference(newIds, currentIds);
  const toRemove = _.difference(currentIds, newIds);

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

  acc.push(addPromise);

  toRemove.forEach(id => {
    acc.push(
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

const updateManyToManyMorphAttribute = async (acc, attribute, newValue, entry, details, session) => {
  const association = details.association;

  if (Array.isArray(entry[attribute])) {
    return Promise.all(
      entry[attribute].map(val => {
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
            $pull: { [field]: entry[this.primaryKey] },
          },
          { session }
        );
      })
    );
  }

  return;
};

const updateOneToOneAttribute = async (acc, attribute, newValue, entry, details, session) => {
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  // if value is the same don't do anything
  if (entry[attribute] === newValue) return acc;

  // if the value is null, set field to null on both sides
  if (_.isNull(newValue)) {
    const updatePromise = assocModel.updateOne(
      {
        [assocModel.primaryKey]: getValuePrimaryKey(entry[attribute], assocModel.primaryKey),
      },
      { [details.via]: null },
      { session }
    );

    acc.push(updatePromise);
    return _.set(acc, attribute, null);
  }

  // set old relations to null
  const updateLink = this.updateOne(
    { [attribute]: new mongoose.Types.ObjectId(newValue) },
    { [attribute]: null },
    { session }
  ).then(() => {
    return assocModel.updateOne(
      {
        [this.primaryKey]: new mongoose.Types.ObjectId(newValue),
      },
      { [details.via]: entry[this.primaryKey] },
      { session }
    );
  });

  // set new relation
  acc.push(updateLink);
  return _.set(acc, attribute, newValue);
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

      switch (association?.nature) {
        case 'oneWay':
          return updateOneWayAttribute(acc, attribute, newValue, entry, details);
        case 'oneToOne':
          return updateOneToOneAttribute(relationUpdates, attribute, newValue, entry, details, session);
        case 'oneToMany':
          return updateOneToManyAttribute(relationUpdates, attribute, newValue, entry, details, session);
        case 'manyToOne':
          return updateManyToOneAttribute(acc, attribute, newValue, entry, details);
        case 'manyToMany':
          return updateManyToManyAttribute(relationUpdates, attribute, newValue, entry, details, session);
        case 'manyMorphToMany':
        case 'manyMorphToOne':
          return updateMorphAttribute(relationUpdates, attribute, newValue, entry, details, session);
        case 'oneToManyMorph':
        case 'manyToManyMorph':
          return updateOneToManyMorphAttribute(relationUpdates, attribute, newValue, entry, details, session);
        default:
          return updateSimpleAttribute(acc, attribute, newValue, entry, details);
      }
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