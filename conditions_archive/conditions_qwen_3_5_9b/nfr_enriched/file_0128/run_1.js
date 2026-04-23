```typescript
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
} = require('strapi-params');

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

const createUpdatePromise = (assocModel, condition, updateData, session) => {
  return assocModel.updateMany(condition, updateData, { session });
};

const handleOneWayRelation = (assocModel, newValue, session) => {
  return _.set({}, assocModel.primaryKey, newValue);
};

const handleOneToOneRelation = (assocModel, currentValue, newValue, details, session) => {
  if (currentValue === newValue) return {};

  if (_.isNull(newValue)) {
    const updatePromise = assocModel.updateOne(
      {
        [assocModel.primaryKey]: getValuePrimaryKey(currentValue, assocModel.primaryKey),
      },
      { [details.via]: null },
      { session }
    );

    return {
      updatePromise,
      newValue: null,
    };
  }

  const updateLink = assocModel.updateOne(
    { [assocModel.primaryKey]: new mongoose.Types.ObjectId(newValue) },
    { [assocModel.primaryKey]: null },
    { session }
  ).then(() => {
    return assocModel.updateOne(
      {
        [assocModel.primaryKey]: new mongoose.Types.ObjectId(newValue),
      },
      { [details.via]: getValuePrimaryKey(currentValue, assocModel.primaryKey) },
      { session }
    );
  });

  return {
    updateLink,
    newValue,
  };
};

const handleOneToManyRelation = (assocModel, currentValue, newValue, details, session) => {
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
        { [details.via]: getValuePrimaryKey(currentValue, assocModel.primaryKey) },
        { session }
      );
    });

  return updatePromise;
};

const handleManyToOneRelation = (assocModel, newValue) => {
  return _.set({}, assocModel.primaryKey, newValue);
};

const handleManyToManyRelation = (assocModel, currentValue, newValue, details, session) => {
  if (association.dominant) {
    return _.set(
      {},
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
          [association.via]: new mongoose.Types.ObjectId(getValuePrimaryKey(currentValue, assocModel.primaryKey)),
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
          $addToSet: { [association.via]: [getValuePrimaryKey(currentValue, assocModel.primaryKey)] },
        },
        { session }
      );
    });

  return updatePromise;
};

const handleManyMorphToManyRelation = (
  association,
  newValue,
  entry,
  session,
  createRelation,
  removeRelation
) => {
  return newValue.forEach(obj => {
    const refModel = strapi.db.getModel(obj.ref, obj.source);

    const createRelationPromise = createRelation();

    const reverseAssoc = refModel.associations.find(assoc => assoc.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      return removeRelation(
        association,
        {
          alias: association.alias,
          ref: obj.kind || refModel.globalId,
          refId: new mongoose.Types.ObjectId(obj.refId),
          field: obj.field,
          filter: association.filter,
        },
        session
      ).then(createRelationPromise).then(() => {
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
    }

    return createRelationPromise.then(() => {
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
  });
};

const handleOneToManyMorphRelation = (
  model,
  association,
  entry,
  newValue,
  session,
  addRelationMorph,
  removeRelationMorph
) => {
  const currentIds = transformToArrayID(currentValue, this.primaryKey);
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

  return addPromise;
};

const handleDeleteRelations = (association, entry, session) => {
  const { nature, via, dominant } = association;

  switch (nature) {
    case 'oneWay':
    case 'manyWay': {
      return Promise.resolve();
    }
    case 'oneToMany':
    case 'oneToOne': {
      if (!via) {
        return Promise.resolve();
      }

      const targetModel = strapi.db.getModel(
        association.model || association.collection,
        association.plugin
      );

      return targetModel.updateMany({ [via]: entry[this.primaryKey] }, { [via]: null }, { session });
    }
    case 'manyToMany':
    case 'manyToOne': {
      if (!via || dominant) {
        return Promise.resolve();
      }

      const targetModel = strapi.db.getModel(
        association.model || association.collection,
        association.plugin
      );

      return targetModel.updateMany(
        { [via]: entry[this.primaryKey] },
        { $pull: { [via]: entry[this.primaryKey] } },
        { session }
      );
    }
    case 'oneToManyMorph':
    case 'manyToManyMorph': {
      const targetModel = strapi.db.getModel(
        association.model || association.collection,
        association.plugin
      );

      if (!targetModel) return Promise.resolve();

      const element = {
        ref: entry[this.primaryKey],
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
          entry[association.alias].map(val => {
            const targetModel = strapi.db.getModelByGlobalId(val.kind);

            if (!targetModel) return Promise.resolve();

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

      return Promise.resolve();
    }
    case 'oneMorphToOne':
    case 'oneMorphToMany': {
      return Promise.resolve();
    }
    default:
      return Promise.resolve();
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

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

      switch (association.nature) {
        case 'oneWay': {
          return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
        }
        case 'oneToOne': {
          const result = handleOneToOneRelation(
            assocModel,
            currentValue,
            newValue,
            details,
            session
          );

          if (result.updatePromise) {
            relationUpdates.push(result.updatePromise);
          }

          return _.set(acc, attribute, result.newValue);
        }
        case 'oneToMany': {
          const updatePromise = handleOneToManyRelation(
            assocModel,
            currentValue,
            newValue,
            details,
            session
          );

          relationUpdates.push(updatePromise);
          return acc;
        }
        case 'manyToOne': {
          return _.set(acc, attribute, _.get(newValue, assocModel.primaryKey, newValue));
        }
        case 'manyWay':
        case 'manyToMany': {
          const updatePromise = handleManyToManyRelation(
            assocModel,
            currentValue,
            newValue,
            details,
            session
          );

          relationUpdates.push(updatePromise);
          return acc;
        }
        case 'manyMorphToMany':
        case 'manyMorphToOne': {
          const createRelation = () => {
            return addRelationMorph(
              this,
              {
                id: entry[this.primaryKey],
                alias: association.alias,
                ref: newValue ? newValue[0].kind || assocModel.globalId : assocModel.globalId,
                refId: new mongoose.Types.ObjectId(newValue ? newValue[0].refId : ''),
                field: newValue ? newValue[0].field : association.alias,
                filter: association.filter,
              },
              { session }
            );
          };

          const removeRelation = () => {
            return removeRelationMorph(
              this,
              {
                alias: association.alias,
                ref: newValue ? newValue[0].kind || assocModel.globalId : assocModel.globalId,
                refId: new mongoose.Types.ObjectId(newValue ? newValue[0].refId : ''),
                field: newValue ? newValue[0].field : association.alias,
                filter: association.filter,
              },
              { session }
            );
          };

          handleManyMorphToManyRelation(
            association,
            newValue,
            entry,
            session,
            createRelation,
            removeRelation
          );
          break;
        }
        case 'oneToManyMorph':
        case 'manyToManyMorph': {
          const addPromise = handleOneToManyMorphRelation(
            assocModel,
            association,
            entry,
            newValue,
            session,
            addRelationMorph,
            removeRelationMorph
          );

          relationUpdates.push(addPromise);
          break;
        }
        case 'oneMorphToOne':
        case 'oneMorphToMany':
          break;
        default:
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
        return handleDeleteRelations(association, entry, session);
      })
    );
  },
};
```