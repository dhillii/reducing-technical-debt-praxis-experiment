'use strict';

/**
 * Module dependencies
 */

// Public node modules.
const _ = require('lodash');

// Utils
const {
  models: { getValuePrimaryKey },
} = require('strapi-utils');

const transformToArrayID = array => {
  if (_.isArray(array)) {
    return array
      .map(value => _.get(value, 'id') || value)
      .filter(n => n)
      .map(val => _.toString(val));
  }

  return transformToArrayID([array]);
};

const removeUndefinedKeys = obj => _.pickBy(obj, _.negate(_.isUndefined));

const addRelationMorph = async (model, { params, transacting } = {}) => {
  return await model.morph.forge().save(
    {
      [`${model.collectionName}_id`]: params.id,
      [`${params.alias}_id`]: params.refId,
      [`${params.alias}_type`]: params.ref,
      field: params.field,
      order: params.order,
    },
    { transacting }
  );
};

const removeRelationMorph = async (model, { params, transacting } = {}) => {
  return await model.morph
    .forge()
    .where(
      _.omitBy(
        {
          [`${model.collectionName}_id`]: params.id,
          [`${params.alias}_id`]: params.refId,
          [`${params.alias}_type`]: params.ref,
          field: params.field,
        },
        _.isUndefined
      )
    )
    .destroy({
      require: false,
      transacting,
    });
};

const getAssociationUpdates = (model, params, transacting) => {
  const relationUpdates = [];
  const primaryKeyValue = getValuePrimaryKey(params, model.primaryKey);
  const associations = model.associations;

  associations.forEach(association => {
    const property = params.values[association.alias];
    const details = model._attributes[association.alias];

    switch (association.nature) {
      case 'oneWay':
        relationUpdates.push(updateOneWayAssociation(model, property, association, details));
        break;
      case 'oneToOne':
        relationUpdates.push(updateOneToOneAssociation(model, property, association, details, primaryKeyValue, transacting));
        break;
      case 'oneToMany':
        relationUpdates.push(updateOneToManyAssociation(model, property, association, details, primaryKeyValue, transacting));
        break;
      case 'manyToOne':
        relationUpdates.push(updateManyToOneAssociation(model, property, association, details));
        break;
      case 'manyWay':
      case 'manyToMany':
        relationUpdates.push(updateManyToManyAssociation(model, property, association, details, primaryKeyValue, transacting));
        break;
      case 'manyMorphToMany':
      case 'manyMorphToOne':
        relationUpdates.push(updateManyMorphAssociation(model, property, association, details, primaryKeyValue, transacting));
        break;
      case 'oneToManyMorph':
      case 'manyToManyMorph':
        relationUpdates.push(updateMorphAssociation(model, property, association, details, primaryKeyValue, transacting));
        break;
      default:
    }
  });

  return relationUpdates;
};

const updateOneWayAssociation = (model, property, association, details) => {
  return Promise.resolve(_.get(property, model.primaryKey, property));
};

const updateOneToOneAssociation = async (model, property, association, details, primaryKeyValue, transacting) => {
  if (property === null) {
    return model.where({ [model.primaryKey]: primaryKeyValue }).save({ [details.via]: null }, { method: 'update', patch: true, require: false, transacting });
  }

  return model.where({ [model.primaryKey]: primaryKeyValue }).save({ [details.via]: property }, { method: 'update', patch: true, require: false, transacting });
};

const updateOneToManyAssociation = async (model, property, association, details, primaryKeyValue, transacting) => {
  const currentIds = model.where({ [model.primaryKey]: primaryKeyValue }).fetch({ transacting });
  const toRemove = _.differenceWith(currentIds, property, (a, b) => {
    return `${a[model.primaryKey] || a}` === `${b[model.primaryKey] || b}`;
  });

  return model.where(model.primaryKey, 'in', toRemove.map(val => val[model.primaryKey] || val)).save({ [details.via]: null }, { method: 'update', patch: true, require: false, transacting })
    .then(() => {
      return model.where(model.primaryKey, 'in', property.map(val => val[model.primaryKey] || val)).save({ [details.via]: primaryKeyValue }, { method: 'update', patch: true, require: false, transacting });
    });
};

const updateManyToOneAssociation = (model, property, association, details) => {
  return Promise.resolve(_.get(property, model.primaryKey, property));
};

const updateManyToManyAssociation = async (model, property, association, details, primaryKeyValue, transacting) => {
  const storedValue = transformToArrayID(model.where({ [model.primaryKey]: primaryKeyValue }).fetch({ transacting }));
  const currentValue = transformToArrayID(property);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = model.forge({ [model.primaryKey]: primaryKeyValue })[association.alias]();

  return collection.detach(toRemove, { transacting })
    .then(() => collection.attach(toAdd, { transacting }));
};

const updateManyMorphAssociation = async (model, property, association, details, primaryKeyValue, transacting) => {
  const refs = property;

  if (Array.isArray(refs) && refs.length === 0) {
    return removeRelationMorph(model, { params: { id: primaryKeyValue }, transacting });
  }

  const promises = refs.map(obj => {
    const targetModel = strapi.db.getModel(obj.ref, obj.source !== 'content-manager' ? obj.source : null);

    const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      return removeRelationMorph(model, {
        params: {
          alias: association.alias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
        },
        transacting,
      }).then(() =>
        addRelationMorph(model, {
          params: {
            id: primaryKeyValue,
            alias: association.alias,
            ref: targetModel.collectionName,
            refId: obj.refId,
            field: obj.field,
            order: 1,
          },
          transacting,
        })
      );
    }

    return addRelationMorph(model, {
      params: {
        id: primaryKeyValue,
        alias: association.alias,
        ref: targetModel.collectionName,
        refId: obj.refId,
        field: obj.field,
        order: 1,
      },
      transacting,
    });
  });

  return Promise.all(promises);
};

const updateMorphAssociation = async (model, property, association, details, primaryKeyValue, transacting) => {
  const currentValue = transformToArrayID(property);

  const modelInstance = strapi.db.getModel(details.collection || details.model, details.plugin);

  return removeRelationMorph(modelInstance, {
    params: {
      alias: association.via,
      ref: model.collectionName,
      refId: primaryKeyValue,
      field: association.alias,
    },
    transacting,
  }).then(() => {
    return Promise.all(
      currentValue.map((id, idx) => {
        return addRelationMorph(modelInstance, {
          params: {
            id,
            alias: association.via,
            ref: model.collectionName,
            refId: primaryKeyValue,
            field: association.alias,
            order: idx + 1,
          },
          transacting,
        });
      })
    );
  });
};

const updateModel = async (model, params, transacting) => {
  const values = removeUndefinedKeys(params.values);
  const primaryKeyValue = getValuePrimaryKey(params, model.primaryKey);

  await model.forge({ [model.primaryKey]: primaryKeyValue }).save(values, { patch: true, transacting });

  return model.forge({ [model.primaryKey]: primaryKeyValue }).fetch({ transacting });
};

module.exports = {
  async findOne(params, populate, { transacting } = {}) {
    const record = await this.forge({
      [this.primaryKey]: getValuePrimaryKey(params, this.primaryKey),
    }).fetch({
      transacting,
      withRelated: populate,
    });

    const data = record ? record.toJSON() : record;

    if (_.isEmpty(populate)) {
      const related = await Promise.all(
        this.associations
          .filter(association => ['manyMorphToOne', 'manyMorphToMany'].includes(association.nature))
          .map(() => {
            return this.morph
              .forge()
              .where({
                [`${this.collectionName}_id`]: getValuePrimaryKey(params, this.primaryKey),
              })
              .fetchAll({
                transacting,
              });
          })
      );

      related.forEach((value, index) => {
        data[this.associations[index].alias] = value ? value.toJSON() : value;
      });
    }

    return data;
  },

  async update(params, { transacting } = {}) {
    const relationUpdates = getAssociationUpdates(this, params, transacting);
    await Promise.all(relationUpdates);

    const updatedModel = await updateModel(this, params, transacting);

    return updatedModel && updatedModel.toJSON ? updatedModel.toJSON() : updatedModel;
  },

  deleteRelations(id, { transacting }) {
    const values = {};

    this.associations.map(association => {
      switch (association.nature) {
        case 'oneWay':
        case 'oneToOne':
        case 'manyToOne':
        case 'oneToManyMorph':
          values[association.alias] = null;
          break;
        case 'manyWay':
        case 'oneToMany':
        case 'manyToMany':
        case 'manyToManyMorph':
        case 'manyMorphToMany':
        case 'manyMorphToOne':
          values[association.alias] = [];
          break;
        default:
      }
    });

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};