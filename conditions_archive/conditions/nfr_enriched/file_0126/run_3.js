```javascript
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

// Retrieve morph relations manually when populate is empty
const fetchMorphRelations = async function(params, transacting) {
  const arrayOfPromises = this.associations
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
    });

  const related = await Promise.all(arrayOfPromises);
  const morphData = {};

  related.forEach((value, index) => {
    morphData[this.associations[index].alias] = value ? value.toJSON() : value;
  });

  return morphData;
};

// Handle oneWay relation update
const handleOneWayUpdate = (property, assocModel, details) => {
  return _.get(property, assocModel.primaryKey, property);
};

// Handle oneToOne relation update
const handleOneToOneUpdate = async (current, property, response, assocModel, details, primaryKeyValue, transacting) => {
  const relationUpdates = [];

  if (response[current] === property) return { value: property, updates: relationUpdates };

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

    relationUpdates.push(updatePromise);
    return { value: null, updates: relationUpdates };
  }

  const updateLink = this.where({ [current]: property })
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
      return assocModel.where({ [this.primaryKey]: property }).save(
        { [details.via]: primaryKeyValue },
        {
          method: 'update',
          patch: true,
          require: false,
          transacting,
        }
      );
    });

  relationUpdates.push(updateLink);
  return { value: property, updates: relationUpdates };
};

// Handle oneToMany relation update
const handleOneToManyUpdate = async (current, property, response, assocModel, details, primaryKeyValue, transacting) => {
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

// Handle manyToOne relation update
const handleManyToOneUpdate = (property, assocModel) => {
  return _.get(property, assocModel.primaryKey, property);
};

// Handle manyWay/manyToMany relation update
const handleManyToManyUpdate = async (current, property, response, association, primaryKeyValue, transacting) => {
  const storedValue = transformToArrayID(response[current]);
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
const getMaxMorphOrder = async (morphModel, aliasId, aliasType, field, transacting) => {
  const maxOrder = await morphModel
    .query(qb => {
      qb.max('order as order').where({
        [`${aliasId}`]: aliasId,
        [`${aliasType}`]: aliasType,
        field: field,
      });
    })
    .fetch({ transacting });

  return maxOrder.toJSON().order || 0;
};

// Handle adding morph relation with order
const addMorphRelationWithOrder = async (model, aliasId, aliasType, field, refId, response, association, transacting) => {
  const maxOrder = await model.morph
    .query(qb => {
      qb.max('order as order').where({
        [`${association.alias}_id`]: refId,
        [`${association.alias}_type`]: aliasType,
        field: field,
      });
    })
    .fetch({ transacting });

  const { order = 0 } = maxOrder.toJSON();

  await addRelationMorph(model, {
    params: {
      id: response[model.primaryKey],
      alias: association.alias,
      ref: aliasType,
      refId: refId,
      field: field,
      order: order + 1,
    },
    transacting,
  });
};

// Handle manyMorphToMany/manyMorphToOne relation update
const handleManyMorphUpdate = async (current, property, response, association, details, transacting) => {
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

    relationUpdates.push(addMorphRelationWithOrder(
      this,
      association.alias,
      targetModel.collectionName,
      obj.field,
      obj.refId,
      response,
      association,
      transacting
    ));
  });

  return { updates: relationUpdates };
};

// Handle oneToManyMorph/manyToManyMorph relation update
const handleMorphToManyUpdate = async (current, property, response, association, details, transacting) => {
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

// Process relation update based on association nature
const processRelationUpdate = async function(current, property, response, association, details, primaryKeyValue, transacting) {
  let result = { value: property, updates: [] };

  switch (association.nature) {
    case 'oneWay':
      result.value = handleOneWayUpdate(property, strapi.db.getModel(details.model || details.collection, details.plugin), details);
      break;

    case 'oneToOne':
      result = await handleOneToOneUpdate.call(this, current, property, response, strapi.db.getModel(details.model || details.collection, details.plugin), details, primaryKeyValue, transacting);
      break;

    case 'oneToMany':
      result = await handleOneToManyUpdate.call(this, current, property, response, strapi.db.getModel(details.model || details.collection, details.plugin), details, primaryKeyValue, transacting);
      break;

    case 'manyToOne':
      result.value = handleManyToOneUpdate(property, strapi.db.getModel(details.model || details.collection, details.plugin));
      break;

    case 'manyWay':
    case 'manyToMany':
      result = await handleManyToManyUpdate.call(this, current, property, response, association, primaryKeyValue, transacting);
      break;

    case 'manyMorphToMany':
    case 'manyMorphToOne':
      result = await handleManyMorphUpdate.call(this, current, property, response, association, details, transacting);
      break;

    case 'oneToManyMorph':
    case 'manyToManyMorph':
      result = await handleMorphToManyUpdate.call(this, current, property, response, association, details, transacting);
      break;

    case 'oneMorphToOne':
    case 'oneMorphToMany':
      break;

    default:
  }

  return result;
};

// Build values object for update, collecting relation updates
const buildUpdateValues = async function(params, response, primaryKeyValue, transacting) {
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

    const result = await processRelationUpdate.call(
      this,
      current,
      property,
      response,
      association,
      details,
      primaryKeyValue,
      transacting
    );

    if (result.value !== undefined) {
      values[current] = result.value;
    }

    if (result.updates && result.updates.length > 0) {
      relationUpdates.push(...result.updates);
    }
  }

  return { values, relationUpdates };
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
      const morphData = await fetchMorphRelations.call(this, params, transacting);
      Object.assign(data, morphData);
    }

    return data;
  },

  async update(params, { transacting } = {}) {
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, {
      transacting,
    });

    const { values, relationUpdates } = await buildUpdateValues.call(
      this,
      params,
      response,
      primaryKeyValue,
      transacting
    );

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
```