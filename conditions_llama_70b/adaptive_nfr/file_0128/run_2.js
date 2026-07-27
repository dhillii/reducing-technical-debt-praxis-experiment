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

const updateOneWayAssociation = (acc, association, currentValue, newValue, assocModel) => {
  return _.set(acc, association.alias, _.get(newValue, assocModel.primaryKey, newValue));
};

const updateOneToOneAssociation = async (acc, association, currentValue, newValue, entry, session) => {
  if (currentValue === newValue) return acc;

  if (_.isNull(newValue)) {
    const updatePromise = assocModel.updateOne(
      {
        [assocModel.primaryKey]: getValuePrimaryKey(currentValue, assocModel.primaryKey),
      },
      { [association.via]: null },
      { session }
    );

    return updatePromise.then(() => _.set(acc, association.alias, null));
  }

  const updateLink = this.updateOne(
    { [association.alias]: new mongoose.Types.ObjectId(newValue) },
    { [association.alias]: null },
    { session }
  ).then(() => {
    return assocModel.updateOne(
      {
        [this.primaryKey]: new mongoose.Types.ObjectId(newValue),
      },
      { [association.via]: entry[this.primaryKey] },
      { session }
    );
  });

  return updateLink.then(() => _.set(acc, association.alias, newValue));
};

const updateOneToManyAssociation = async (acc, association, currentValue, newValue, entry, session) => {
  const attributeIds = currentValue;
  const toRemove = _.differenceWith(attributeIds, newValue, (a, b) => {
    return `${a[association.model.primaryKey] || a}` === `${b[association.model.primaryKey] || b}`;
  });

  const updatePromise = association.model
    .updateMany(
      {
        [association.model.primaryKey]: {
          $in: toRemove.map(
            val => new mongoose.Types.ObjectId(val[association.model.primaryKey] || val)
          ),
        },
      },
      { [association.via]: null },
      { session }
    )
    .then(() => {
      return association.model.updateMany(
        {
          [association.model.primaryKey]: {
            $in: newValue.map(
              val => new mongoose.Types.ObjectId(val[association.model.primaryKey] || val)
            ),
          },
        },
        { [association.via]: entry[this.primaryKey] },
        { session }
      );
    });

  return updatePromise.then(() => acc);
};

const updateManyToOneAssociation = (acc, association, currentValue, newValue, assocModel) => {
  return _.set(acc, association.alias, _.get(newValue, assocModel.primaryKey, newValue));
};

const updateManyToManyAssociation = async (acc, association, currentValue, newValue, entry, session) => {
  if (association.dominant) {
    return _.set(
      acc,
      association.alias,
      newValue ? newValue.map(val => val[association.model.primaryKey] || val) : newValue
    );
  }

  const updatePomise = association.model
    .updateMany(
      {
        [association.model.primaryKey]: {
          $in: currentValue.map(
            val => new mongoose.Types.ObjectId(val[association.model.primaryKey] || val)
          ),
        },
      },
      {
        $pull: {
          [association.via]: new mongoose.Types.ObjectId(entry[this.primaryKey]),
        },
      },
      { session }
    )
    .then(() => {
      return association.model.updateMany(
        {
          [association.model.primaryKey]: {
            $in: newValue
              ? newValue.map(
                  val => new mongoose.Types.ObjectId(val[association.model.primaryKey] || val)
                )
              : newValue,
          },
        },
        {
          $addToSet: { [association.via]: [entry[this.primaryKey]] },
        },
        { session }
      );
    });

  return updatePomise.then(() => acc);
};

const updateManyMorphToManyAssociation = async (acc, association, currentValue, newValue, entry, session) => {
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
      return removeRelationMorph(
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
        });
    } else {
      return createRelation().then(() => {
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
      });
    }
  });
  return acc;
};

const updateOneToManyMorphAssociation = async (acc, association, currentValue, newValue, entry, session) => {
  // Compare array of ID to find deleted files.
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const newIds = transformToArrayID(newValue, this.primaryKey);

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
          ref: this.globalId,
          refId: entry._id,
          field: association.alias,
          filter: association.filter,
        },
        { session }
      );
    })
  );

  toRemove.forEach(id => {
    return removeRelationMorph(
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
  });
  return acc;
};

const updateAssociation = async (acc, association, currentValue, newValue, entry, session) => {
  switch (association.nature) {
    case 'oneWay':
      return updateOneWayAssociation(acc, association, currentValue, newValue, association.model);
    case 'oneToOne':
      return updateOneToOneAssociation(acc, association, currentValue, newValue, entry, session);
    case 'oneToMany':
      return updateOneToManyAssociation(acc, association, currentValue, newValue, entry, session);
    case 'manyToOne':
      return updateManyToOneAssociation(acc, association, currentValue, newValue, association.model);
    case 'manyWay':
    case 'manyToMany':
      return updateManyToManyAssociation(acc, association, currentValue, newValue, entry, session);
    case 'manyMorphToMany':
    case 'manyMorphToOne':
      return updateManyMorphToManyAssociation(acc, association, currentValue, newValue, entry, session);
    case 'oneToManyMorph':
    case 'manyToManyMorph':
      return updateOneToManyMorphAssociation(acc, association, currentValue, newValue, entry, session);
    default:
      return acc;
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

    // Only update fields which are on this document.
    const values = Object.keys(removeUndefinedKeys(params.values)).reduce(async (acc, attribute) => {
      const currentValue = entry[attribute];
      const newValue = params.values[attribute];

      const association = this.associations.find(x => x.alias === attribute);

      const details = this._attributes[attribute];

      // set simple attributes
      if (!association && _.get(details, 'isVirtual') !== true) {
        return _.set(await acc, attribute, newValue);
      }

      return updateAssociation(await acc, association, currentValue, newValue, entry, session);
    }, {});

    // Update virtuals fields.
    await Promise.all(relationUpdates).then(() =>
      this.updateOne({ [this.primaryKey]: primaryKeyValue }, await values, {
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