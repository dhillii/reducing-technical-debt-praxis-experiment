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

// Retrieve morph relations for a record
const retrieveMorphRelations = async (model, primaryKeyValue, transacting) => {
  const arrayOfPromises = model.associations
    .filter(association => ['manyMorphToOne', 'manyMorphToMany'].includes(association.nature))
    .map(() => {
      return model.morph
        .forge()
        .where({
          [`${model.collectionName}_id`]: primaryKeyValue,
        })
        .fetchAll({
          transacting,
        });
    });

  return await Promise.all(arrayOfPromises);
};

// Populate morph relations into data object
const populateMorphRelations = (data, model, related) => {
  related.forEach((value, index) => {
    data[model.associations[index].alias] = value ? value.toJSON() : value;
  });
};

// Handle oneWay association update
const handleOneWayUpdate = (property, assocModel) => {
  return _.get(property, assocModel.primaryKey, property);
};

// Handle oneToOne association update
const handleOneToOneUpdate = async (current, property, response, details, assocModel, primaryKeyValue, transacting) => {
  if (response[current] === property) return { value: response[current], updates: [] };

  if (_.isNull(property)) {
    const updatePromise = assocModel
      .where({
        [assocModel.primaryKey]: getValuePrimaryKey(
          response[current],
          assocModel.primaryKey
        ),
      })
      .save(
        { [details.via]: null },
        {
          method: 'update',
          patch: true,
          require: false,
          transacting,
        }
      );

    return { value: null, updates: [updatePromise] };
  }

  const updateLink = assocModel.where({ [current]: property })
    .save(
      { [current]: null },
      {
        method: 'update',
        patch: true,
        require: false,
        transacting,
      }
    )
    .then(() => {
      return assocModel.where({ [assocModel.primaryKey]: property }).save(
        { [details.via]: primaryKeyValue },
        {
          method: 'update',
          patch: true,
          require: false,
          transacting,
        }
      );
    });

  return { value: property, updates: [updateLink] };
};

// Handle oneToMany association update
const handleOneToManyUpdate = (property, response, current, details, assocModel, primaryKeyValue, transacting) => {
  const currentIds = response[current];
  const toRemove = _.differenceWith(currentIds, property, (a, b) => {
    return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
  });

  const updatePromise = assocModel
    .where(
      assocModel.primaryKey,
      'in',
      toRemove.map(val => val[assocModel.primaryKey] || val)
    )
    .save(
      { [details.via]: null },
      {
        method: 'update',
        patch: true,
        require: false,
        transacting,
      }
    )
    .then(() => {
      return assocModel
        .where(
          assocModel.primaryKey,
          'in',
          property.map(val => val[assocModel.primaryKey] || val)
        )
        .save(
          { [details.via]: primaryKeyValue },
          {
            method: 'update',
            patch: true,
            require: false,
            transacting,
          }
        );
    });

  return { updates: [updatePromise] };
};

// Handle manyToOne association update
const handleManyToOneUpdate = (property, assocModel) => {
  return _.get(property, assocModel.primaryKey, property);
};

// Handle manyWay/manyToMany association update
const handleManyToManyUpdate = (association, primaryKeyValue, response, property, transacting) => {
  const storedValue = transformToArrayID(response[association.alias]);
  const currentValue = transformToArrayID(property);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = this.forge({
    [this.primaryKey]: primaryKeyValue,
  })[association.alias]();

  const updatePromise = collection
    .detach(toRemove, { transacting })
    .then(() => collection.attach(toAdd, { transacting }));

  return { updates: [updatePromise] };
};

// Get max order for morph relation
const getMaxMorphOrder = async (model, association, refId, collectionName, field, transacting) => {
  const maxOrder = await model.morph
    .query(qb => {
      qb.max('order as order').where({
        [`${association.alias}_id`]: refId,
        [`${association.alias}_type`]: collectionName,
        field: field,
      });
    })
    .fetch({ transacting });

  const { order = 0 } = maxOrder.toJSON();
  return order;
};

// Handle adding morph relation with order
const addMorphRelationWithOrder = async (model, association, response, targetModel, obj, transacting) => {
  const order = await getMaxMorphOrder(model, association, obj.refId, targetModel.collectionName, obj.field, transacting);

  await addRelationMorph(model, {
    params: {
      id: response[model.primaryKey],
      alias: association.alias,
      ref: targetModel.collectionName,
      refId: obj.refId,
      field: obj.field,
      order: order + 1,
    },
    transacting,
  });
};

// Handle manyMorphToMany/manyMorphToOne association update
const handleManyMorphUpdate = async (current, property, response, details, association, transacting) => {
  const relationUpdates = [];
  const refs = property;

  if (Array.isArray(refs) && refs.length === 0) {
    relationUpdates.push(
      removeRelationMorph(this, { params: { id: response[this.primaryKey] }, transacting })
    );
    return { updates: relationUpdates };
  }

  refs.forEach(obj => {
    const targetModel = strapi.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );

    const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      relationUpdates.push(
        removeRelationMorph(this, {
          params: {
            alias: association.alias,
            ref: targetModel.collectionName,
            refId: obj.refId,
            field: obj.field,
          },
          transacting,
        }).then(() =>
          addRelationMorph(this, {
            params: {
              id: response[this.primaryKey],
              alias: association.alias,
              ref: targetModel.collectionName,
              refId: obj.refId,
              field: obj.field,
              order: 1,
            },
            transacting,
          })
        )
      );

      return;
    }

    relationUpdates.push(addMorphRelationWithOrder(this, association, response, targetModel, obj, transacting));
  });

  return { updates: relationUpdates };
};

// Handle oneToManyMorph/manyToManyMorph association update
const handleMorphToManyUpdate = (current, property, response, details, association, transacting) => {
  const currentValue = transformToArrayID(property);
  const model = strapi.db.getModel(details.collection || details.model, details.plugin);

  const promise = removeRelationMorph(model, {
    params: {
      alias: association.via,
      ref: this.collectionName,
      refId: response.id,
      field: association.alias,
    },
    transacting,
  }).then(() => {
    return Promise.all(
      currentValue.map((id, idx) => {
        return addRelationMorph(model, {
          params: {
            id,
            alias: association.via,
            ref: this.collectionName,
            refId: response.id,
            field: association.alias,
            order: idx + 1,
          },
          transacting,
        });
      })
    );
  });

  return { updates: [promise] };
};

// Process association update based on nature
const processAssociationUpdate = async (current, property, response, association, details, primaryKeyValue, transacting) => {
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  switch (association.nature) {
    case 'oneWay':
      return { value: handleOneWayUpdate(property, assocModel), updates: [] };

    case 'oneToOne':
      return await handleOneToOneUpdate(current, property, response, details, assocModel, primaryKeyValue, transacting);

    case 'oneToMany':
      return handleOneToManyUpdate(property, response, current, details, assocModel, primaryKeyValue, transacting);

    case 'manyToOne':
      return { value: handleManyToOneUpdate(property, assocModel), updates: [] };

    case 'manyWay':
    case 'manyToMany':
      return handleManyToManyUpdate.call(this, association, primaryKeyValue, response, property, transacting);

    case 'manyMorphToMany':
    case 'manyMorphToOne':
      return await handleManyMorphUpdate.call(this, current, property, response, details, association, transacting);

    case 'oneToManyMorph':
    case 'manyToManyMorph':
      return handleMorphToManyUpdate.call(this, current, property, response, details, association, transacting);

    case 'oneMorphToOne':
    case 'oneMorphToMany':
      return { updates: [] };

    default:
      return { updates: [] };
  }
};

// Build values object from params, handling associations
const buildUpdateValues = async (params, response, primaryKeyValue, transacting) => {
  const relationUpdates = [];
  const values = {};

  const cleanParams = removeUndefinedKeys(params.values);

  for (const current of Object.keys(cleanParams)) {
    const property = params.values[current];
    const association = this.associations.filter(x => x.alias === current)[0];
    const details = this._attributes[current];

    if (!association && _.get(details, 'isVirtual') !== true) {
      values[current] = property;
      continue;
    }

    const result = await processAssociationUpdate(current, property, response, association, details, primaryKeyValue, transacting);

    if (result.value !== undefined) {
      values[current] = result.value;
    }

    relationUpdates.push(...result.updates);
  }

  return { values, relationUpdates };
};

// Build deletion values for all associations
const buildDeletionValues = (associations) => {
  const values = {};

  associations.forEach(association => {
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

  return values;
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

    // Retrieve data manually.
    if (_.isEmpty(populate)) {
      const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
      const related = await retrieveMorphRelations(this, primaryKeyValue, transacting);
      populateMorphRelations(data, this, related);
    }

    return data;
  },

  async update(params, { transacting } = {}) {
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, {
      transacting,
    });

    const { values, relationUpdates } = await buildUpdateValues.call(this, params, response, primaryKeyValue, transacting);

    await Promise.all(relationUpdates);

    delete values[this.primaryKey];
    if (!_.isEmpty(values)) {
      await this.forge({
        [this.primaryKey]: primaryKeyValue,
      }).save(values, {
        patch: true,
        transacting,
      });
    }

    const result = await this.forge({
      [this.primaryKey]: primaryKeyValue,
    }).fetch({
      transacting,
    });

    return result && result.toJSON ? result.toJSON() : result;
  },

  deleteRelations(id, { transacting }) {
    const values = buildDeletionValues(this.associations);
    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};