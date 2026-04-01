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

// Handle oneWay and manyToOne relation updates
const handleSimpleRelationUpdate = (property, assocModel, details) => {
  return _.get(property, assocModel.primaryKey, property);
};

// Handle oneToOne relation updates
const handleOneToOneUpdate = async (current, property, response, details, assocModel, primaryKeyValue, transacting) => {
  if (response[current] === property) return { value: response[current], updates: [] };

  const relationUpdates = [];

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

// Handle oneToMany relation updates
const handleOneToManyUpdate = async (current, property, response, details, assocModel, primaryKeyValue, transacting) => {
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

// Handle manyToMany and manyWay relation updates
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

// Get max order for morph relations
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

// Handle adding morph relation with order calculation
const addMorphRelationWithOrder = async (model, association, obj, response, transacting) => {
  const targetModel = strapi.db.getModel(
    obj.ref,
    obj.source !== 'content-manager' ? obj.source : null
  );

  const maxOrder = await model.morph
    .query(qb => {
      qb.max('order as order').where({
        [`${association.alias}_id`]: obj.refId,
        [`${association.alias}_type`]: targetModel.collectionName,
        field: obj.field,
      });
    })
    .fetch({ transacting });

  const { order = 0 } = maxOrder.toJSON();

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

// Handle manyMorphToMany and manyMorphToOne relation updates
const handleManyMorphUpdate = async (current, property, response, association, primaryKeyValue, transacting) => {
  const relationUpdates = [];
  const refs = property;

  if (Array.isArray(refs) && refs.length === 0) {
    relationUpdates.push(
      removeRelationMorph(this, { params: { id: primaryKeyValue }, transacting })
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

    relationUpdates.push(addMorphRelationWithOrder(this, association, obj, response, transacting));
  });

  return { updates: relationUpdates };
};

// Handle oneToManyMorph and manyToManyMorph relation updates
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
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  switch (association.nature) {
    case 'oneWay':
    case 'manyToOne':
      return { value: handleSimpleRelationUpdate(property, assocModel, details), updates: [] };

    case 'oneToOne':
      return await handleOneToOneUpdate.call(this, current, property, response, details, assocModel, primaryKeyValue, transacting);

    case 'oneToMany':
      return await handleOneToManyUpdate.call(this, current, property, response, details, assocModel, primaryKeyValue, transacting);

    case 'manyWay':
    case 'manyToMany':
      return await handleManyToManyUpdate.call(this, current, property, response, association, primaryKeyValue, transacting);

    case 'manyMorphToMany':
    case 'manyMorphToOne':
      return await handleManyMorphUpdate.call(this, current, property, response, association, primaryKeyValue, transacting);

    case 'oneToManyMorph':
    case 'manyToManyMorph':
      return await handleMorphToManyUpdate.call(this, current, property, response, association, details, transacting);

    case 'oneMorphToOne':
    case 'oneMorphToMany':
      return { updates: [] };

    default:
      return { updates: [] };
  }
};

// Build values object for non-relation attributes
const buildAttributeValues = function(params, relationUpdates) {
  const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, current) => {
    const property = params.values[current];
    const association = this.associations.filter(x => x.alias === current)[0];
    const details = this._attributes[current];

    if (!association && _.get(details, 'isVirtual') !== true) {
      return _.set(acc, current, property);
    }

    return acc;
  }, {});

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
      const morphData = await fetchMorphRelations.call(this, params, transacting);
      Object.assign(data, morphData);
    }

    return data;
  },

  async update(params, { transacting } = {}) {
    const relationUpdates = [];
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, {
      transacting,
    });

    // Only update fields which are on this document.
    const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, current) => {
      const property = params.values[current];
      const association = this.associations.filter(x => x.alias === current)[0];
      const details = this._attributes[current];

      if (!association && _.get(details, 'isVirtual') !== true) {
        return _.set(acc, current, property);
      }

      return acc;
    }, {});

    // Process all relation updates
    for (const current of Object.keys(removeUndefinedKeys(params.values))) {
      const property = params.values[current];
      const association = this.associations.filter(x => x.alias === current)[0];
      const details = this._attributes[current];

      if (!association || _.get(details, 'isVirtual') === true) {
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
        _.set(values, current, result.value);
      }

      relationUpdates.push(...result.updates);
    }

    await Promise.all(relationUpdates);

    delete values[this.primaryKey];
    if (!_.isEmpty(values)) {
      await this.forge({
        [this.primaryKey]: getValuePrimaryKey(params, this.primaryKey),
      }).save(values, {
        patch: true,
        transacting,
      });
    }

    const result = await this.forge({
      [this.primaryKey]: getValuePrimaryKey(params, this.primaryKey),
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