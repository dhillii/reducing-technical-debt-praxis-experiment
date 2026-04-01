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
const fetchMorphRelations = async function(data, populate, { transacting } = {}) {
  if (!_.isEmpty(populate)) {
    return data;
  }

  const arrayOfPromises = this.associations
    .filter(association => ['manyMorphToOne', 'manyMorphToMany'].includes(association.nature))
    .map(() => {
      return this.morph
        .forge()
        .where({
          [`${this.collectionName}_id`]: getValuePrimaryKey(data, this.primaryKey),
        })
        .fetchAll({
          transacting,
        });
    });

  const related = await Promise.all(arrayOfPromises);

  related.forEach((value, index) => {
    data[this.associations[index].alias] = value ? value.toJSON() : value;
  });

  return data;
};

// Handle oneWay and manyToOne relation updates
const handleOneWayRelation = (property, assocModel, details) => {
  return _.get(property, assocModel.primaryKey, property);
};

// Handle oneToOne relation updates
const handleOneToOneRelation = async (current, property, response, assocModel, details, primaryKeyValue, transacting) => {
  if (response[current] === property) {
    return { value: null, updates: [] };
  }

  const updates = [];

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

    updates.push(updatePromise);
    return { value: null, updates };
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

  updates.push(updateLink);
  return { value: property, updates };
};

// Handle oneToMany relation updates
const handleOneToManyRelation = async (current, property, response, assocModel, details, primaryKeyValue, transacting) => {
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
const handleManyToManyRelation = async (current, property, response, association, primaryKeyValue, transacting) => {
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

// Handle adding morph relation with order calculation
const addMorphRelationWithOrder = async (morphModel, obj, association, response, transacting) => {
  const targetModel = strapi.db.getModel(
    obj.ref,
    obj.source !== 'content-manager' ? obj.source : null
  );

  const maxOrder = await morphModel.morph
    .query(qb => {
      qb.max('order as order').where({
        [`${association.alias}_id`]: obj.refId,
        [`${association.alias}_type`]: targetModel.collectionName,
        field: obj.field,
      });
    })
    .fetch({ transacting });

  const { order = 0 } = maxOrder.toJSON();

  return addRelationMorph(morphModel, {
    params: {
      id: response[morphModel.primaryKey],
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
const handleManyMorphRelation = async (current, property, response, association, transacting) => {
  const updates = [];
  const refs = property;

  if (Array.isArray(refs) && refs.length === 0) {
    updates.push(
      removeRelationMorph(this, { params: { id: response[this.primaryKey] }, transacting })
    );
    return { updates };
  }

  refs.forEach(obj => {
    const targetModel = strapi.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );

    const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      updates.push(
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

    updates.push(addMorphRelationWithOrder(this, obj, association, response, transacting));
  });

  return { updates };
};

// Handle oneToManyMorph and manyToManyMorph relation updates
const handleMorphToManyRelation = async (current, property, response, association, details, transacting) => {
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

// Process a single attribute for update
const processAttributeUpdate = async function(acc, current, params, response, primaryKeyValue, transacting) {
  const property = params.values[current];
  const association = this.associations.filter(x => x.alias === current)[0];
  const details = this._attributes[current];

  if (!association && _.get(details, 'isVirtual') !== true) {
    return _.set(acc, current, property);
  }

  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
  const relationUpdates = acc.__relationUpdates || [];

  let result = { value: property, updates: [] };

  switch (association.nature) {
    case 'oneWay': {
      result.value = handleOneWayRelation(property, assocModel, details);
      break;
    }
    case 'oneToOne': {
      result = await handleOneToOneRelation.call(this, current, property, response, assocModel, details, primaryKeyValue, transacting);
      break;
    }
    case 'oneToMany': {
      result = await handleOneToManyRelation(current, property, response, assocModel, details, primaryKeyValue, transacting);
      break;
    }
    case 'manyToOne': {
      result.value = handleOneWayRelation(property, assocModel, details);
      break;
    }
    case 'manyWay':
    case 'manyToMany': {
      result = await handleManyToManyRelation.call(this, current, property, response, association, primaryKeyValue, transacting);
      break;
    }
    case 'manyMorphToMany':
    case 'manyMorphToOne': {
      result = await handleManyMorphRelation.call(this, current, property, response, association, transacting);
      break;
    }
    case 'oneToManyMorph':
    case 'manyToManyMorph': {
      result = await handleMorphToManyRelation.call(this, current, property, response, association, details, transacting);
      break;
    }
    case 'oneMorphToOne':
    case 'oneMorphToMany': {
      break;
    }
    default:
  }

  relationUpdates.push(...result.updates);
  acc.__relationUpdates = relationUpdates;

  if (result.value !== undefined) {
    return _.set(acc, current, result.value);
  }

  return acc;
};

// Build values object and collect relation updates
const buildUpdateValues = async function(params, response, primaryKeyValue, transacting) {
  const valueKeys = Object.keys(removeUndefinedKeys(params.values));
  const acc = { __relationUpdates: [] };

  for (const current of valueKeys) {
    await processAttributeUpdate.call(this, acc, current, params, response, primaryKeyValue, transacting);
  }

  const relationUpdates = acc.__relationUpdates;
  delete acc.__relationUpdates;

  return { values: acc, relationUpdates };
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

    return fetchMorphRelations.call(this, data, populate, { transacting });
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