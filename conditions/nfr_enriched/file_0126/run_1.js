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
const handleOneToOneRelation = async (current, property, response, assocModel, details, primaryKeyValue, relationUpdates, transacting) => {
  if (response[current] === property) {
    return null;
  }

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
    return null;
  }

  // set old relations to null and new relation
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
  return property;
};

// Handle oneToMany relation updates
const handleOneToManyRelation = async (current, property, response, assocModel, details, primaryKeyValue, relationUpdates, transacting) => {
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

  relationUpdates.push(updatePromise);
};

// Handle manyToMany and manyWay relation updates
const handleManyToManyRelation = (current, property, response, association, primaryKeyValue, relationUpdates, transacting) => {
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

  relationUpdates.push(updatePromise);
};

// Handle adding morph relation with order calculation
const addMorphRelationWithOrder = async (model, obj, association, response, transacting) => {
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
const handleManyMorphRelation = async (current, property, response, association, relationUpdates, transacting) => {
  const refs = property;

  if (Array.isArray(refs) && refs.length === 0) {
    relationUpdates.push(
      removeRelationMorph(this, { params: { id: response[this.primaryKey] }, transacting })
    );
    return;
  }

  refs.forEach(obj => {
    const targetModel = strapi.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );

    const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

    // Remove existing relationship because only one file can be related to this field
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

    relationUpdates.push(addMorphRelationWithOrder(this, obj, association, response, transacting));
  });
};

// Handle oneToManyMorph and manyToManyMorph relation updates
const handleMorphToManyRelation = async (current, property, response, association, details, relationUpdates, transacting) => {
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

  relationUpdates.push(promise);
};

// Process a single attribute for relation updates
const processAttributeRelation = async function(current, property, response, primaryKeyValue, relationUpdates, transacting) {
  const association = this.associations.filter(x => x.alias === current)[0];
  const details = this._attributes[current];

  if (!association && _.get(details, 'isVirtual') !== true) {
    return { [current]: property };
  }

  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  switch (association.nature) {
    case 'oneWay':
    case 'manyToOne':
      return { [current]: handleOneWayRelation(property, assocModel, details) };

    case 'oneToOne':
      return { [current]: await handleOneToOneRelation.call(this, current, property, response, assocModel, details, primaryKeyValue, relationUpdates, transacting) };

    case 'oneToMany':
      await handleOneToManyRelation(current, property, response, assocModel, details, primaryKeyValue, relationUpdates, transacting);
      return {};

    case 'manyWay':
    case 'manyToMany':
      handleManyToManyRelation.call(this, current, property, response, association, primaryKeyValue, relationUpdates, transacting);
      return {};

    case 'manyMorphToMany':
    case 'manyMorphToOne':
      await handleManyMorphRelation.call(this, current, property, response, association, relationUpdates, transacting);
      return {};

    case 'oneToManyMorph':
    case 'manyToManyMorph':
      await handleMorphToManyRelation.call(this, current, property, response, association, details, relationUpdates, transacting);
      return {};

    case 'oneMorphToOne':
    case 'oneMorphToMany':
      return {};

    default:
      return {};
  }
};

// Build values object from params, processing relations
const buildValuesFromParams = async function(params, response, relationUpdates, transacting) {
  const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
  const cleanParams = removeUndefinedKeys(params.values);
  const values = {};

  for (const current of Object.keys(cleanParams)) {
    const property = params.values[current];
    const relationResult = await processAttributeRelation.call(this, current, property, response, primaryKeyValue, relationUpdates, transacting);
    Object.assign(values, relationResult);
  }

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

    return await fetchMorphRelations.call(this, data, populate, { transacting });
  },

  async update(params, { transacting } = {}) {
    const relationUpdates = [];
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, {
      transacting,
    });

    const values = await buildValuesFromParams.call(this, params, response, relationUpdates, transacting);

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