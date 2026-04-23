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

/**
 * Convert any input to an array of string IDs.
 * @param {*} array
 * @returns {string[]}
 */
const transformToArrayID = array => {
  if (_.isArray(array)) {
    return array
      .map(value => _.get(value, 'id') || value)
      .filter(n => n)
      .map(val => _.toString(val));
  }
  return transformToArrayID([array]);
};

/**
 * Remove undefined keys from an object.
 * @param {Object} obj
 * @returns {Object}
 */
const removeUndefinedKeys = obj => _.pickBy(obj, _.negate(_.isUndefined));

/**
 * Add a morph relation entry.
 */
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

/**
 * Remove a morph relation entry.
 */
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

/**
 * Fetch a single record with optional population.
 */
const fetchRecord = async function (params, populate, { transacting } = {}) {
  const pk = getValuePrimaryKey(params, this.primaryKey);
  const record = await this.forge({ [this.primaryKey]: pk }).fetch({
    transacting,
    withRelated: populate,
  });
  return record ? record.toJSON() : null;
};

/**
 * Manually fetch morph relations for manyMorphToOne / manyMorphToMany.
 */
const fetchMorphRelations = async function (params, { transacting } = {}) {
  const pk = getValuePrimaryKey(params, this.primaryKey);
  const morphPromises = this.associations
    .filter(a => ['manyMorphToOne', 'manyMorphToMany'].includes(a.nature))
    .map(() =>
      this.morph
        .forge()
        .where({ [`${this.collectionName}_id`]: pk })
        .fetchAll({ transacting })
    );

  const results = await Promise.all(morphPromises);
  const data = {};

  results.forEach((value, idx) => {
    const alias = this.associations[idx].alias;
    data[alias] = value ? value.toJSON() : value;
  });

  return data;
};

/**
 * Update a one-to-one association.
 */
const updateOneToOne = async ({
  association,
  details,
  property,
  response,
  primaryKeyValue,
  transacting,
}) => {
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
  if (response[association.alias] === property) return null;

  if (_.isNull(property)) {
    return assocModel
      .where({
        [assocModel.primaryKey]: getValuePrimaryKey(response[association.alias], assocModel.primaryKey),
      })
      .save({ [details.via]: null }, { method: 'update', patch: true, require: false, transacting });
  }

  // detach old link
  const detachOld = this.where({ [association.alias]: property }).save(
    { [association.alias]: null },
    { method: 'update', patch: true, require: false, transacting }
  );

  // attach new link
  const attachNew = detachOld.then(() =>
    assocModel.where({ [assocModel.primaryKey]: property }).save(
      { [details.via]: primaryKeyValue },
      { method: 'update', patch: true, require: false, transacting }
    )
  );

  return attachNew;
};

/**
 * Update a one-to-many association.
 */
const updateOneToMany = ({
  assocModel,
  details,
  property,
  response,
  primaryKeyValue,
  transacting,
}) => {
  const currentIds = response[details.alias] || [];
  const toRemove = _.differenceWith(currentIds, property, (a, b) => {
    return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
  });

  const nullify = assocModel
    .where(assocModel.primaryKey, 'in', toRemove.map(v => v[assocModel.primaryKey] || v))
    .save({ [details.via]: null }, { method: 'update', patch: true, require: false, transacting });

  const setNew = nullify.then(() =>
    assocModel
      .where(assocModel.primaryKey, 'in', property.map(v => v[assocModel.primaryKey] || v))
      .save({ [details.via]: primaryKeyValue }, { method: 'update', patch: true, require: false, transacting })
  );

  return setNew;
};

/**
 * Update a many-to-many association.
 */
const updateManyToMany = ({
  thisModel,
  association,
  primaryKeyValue,
  storedValue,
  currentValue,
  transacting,
}) => {
  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);
  const collection = thisModel.forge({ [thisModel.primaryKey]: primaryKeyValue })[association.alias]();

  return collection.detach(toRemove, { transacting }).then(() => collection.attach(toAdd, { transacting }));
};

/**
 * Update morph-to-many / morph-to-one associations.
 */
const updateMorphRelations = async ({
  thisModel,
  association,
  details,
  refs,
  response,
  primaryKeyValue,
  transacting,
}) => {
  if (Array.isArray(refs) && refs.length === 0) {
    await removeRelationMorph(thisModel, { params: { id: primaryKeyValue }, transacting });
    return;
  }

  const promises = refs.map(async obj => {
    const targetModel = strapi.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );

    const reverseAssoc = targetModel.associations.find(a => a.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      await removeRelationMorph(thisModel, {
        params: {
          alias: association.alias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
        },
        transacting,
      });
      await addRelationMorph(thisModel, {
        params: {
          id: response[thisModel.primaryKey],
          alias: association.alias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
          order: 1,
        },
        transacting,
      });
      return;
    }

    const maxOrderResult = await thisModel.morph.query(qb => {
      qb.max('order as order').where({
        [`${association.alias}_id`]: obj.refId,
        [`${association.alias}_type`]: targetModel.collectionName,
        field: obj.field,
      });
    }).fetch({ transacting });

    const { order = 0 } = maxOrderResult.toJSON();

    await addRelationMorph(thisModel, {
      params: {
        id: response[thisModel.primaryKey],
        alias: association.alias,
        ref: targetModel.collectionName,
        refId: obj.refId,
        field: obj.field,
        order: order + 1,
      },
      transacting,
    });
  });

  await Promise.all(promises);
};

/**
 * Update model-to-media morph relations.
 */
const updateModelToMediaMorph = async ({
  thisModel,
  association,
  details,
  currentValue,
  response,
  transacting,
}) => {
  const targetModel = strapi.db.getModel(details.collection || details.model, details.plugin);

  await removeRelationMorph(targetModel, {
    params: {
      alias: association.via,
      ref: thisModel.collectionName,
      refId: response.id,
      field: association.alias,
    },
    transacting,
  });

  const attachPromises = currentValue.map((id, idx) =>
    addRelationMorph(targetModel, {
      params: {
        id,
        alias: association.via,
        ref: thisModel.collectionName,
        refId: response.id,
        field: association.alias,
        order: idx + 1,
      },
      transacting,
    })
  );

  await Promise.all(attachPromises);
};

/**
 * Public API
 */
module.exports = {
  async findOne(params, populate, { transacting } = {}) {
    const data = await fetchRecord.call(this, params, populate, { transacting });

    if (!data && _.isEmpty(populate)) {
      const morphData = await fetchMorphRelations.call(this, params, { transacting });
      Object.assign(data, morphData);
    }

    return data;
  },

  async update(params, { transacting } = {}) {
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, { transacting });
    const relationPromises = [];

    const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, key) => {
      const property = params.values[key];
      const association = this.associations.find(a => a.alias === key);
      const details = this._attributes[key];

      // Simple attribute
      if (!association && _.get(details, 'isVirtual') !== true) {
        return _.set(acc, key, property);
      }

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

      switch (association.nature) {
        case 'oneWay':
          return _.set(acc, key, _.get(property, assocModel.primaryKey, property));

        case 'oneToOne':
          relationPromises.push(
            updateOneToOne({
              association,
              details,
              property,
              response,
              primaryKeyValue,
              transacting,
            })
          );
          return _.set(acc, key, property);

        case 'oneToMany':
          relationPromises.push(
            updateOneToMany({
              assocModel,
              details,
              property,
              response,
              primaryKeyValue,
              transacting,
            })
          );
          return acc;

        case 'manyToOne':
          return _.set(acc, key, _.get(property, assocModel.primaryKey, property));

        case 'manyToMany':
        case 'manyWay':
          const storedValue = transformToArrayID(response[key]);
          const currentValue = transformToArrayID(params.values[key]);
          relationPromises.push(
            updateManyToMany({
              thisModel: this,
              association,
              primaryKeyValue,
              storedValue,
              currentValue,
              transacting,
            })
          );
          return acc;

        case 'manyMorphToMany':
        case 'manyMorphToOne':
          const refs = params.values[key];
          relationPromises.push(
            updateMorphRelations({
              thisModel: this,
              association,
              details,
              refs,
              response,
              primaryKeyValue,
              transacting,
            })
          );
          return acc;

        case 'oneToManyMorph':
        case 'manyToManyMorph':
          const currentValueMorph = transformToArrayID(params.values[key]);
          relationPromises.push(
            updateModelToMediaMorph({
              thisModel: this,
              association,
              details,
              currentValue: currentValueMorph,
              response,
              transacting,
            })
          );
          return acc;

        case 'oneMorphToOne':
        case 'oneMorphToMany':
          // No operation needed
          return acc;

        default:
          return acc;
      }
    }, {});

    await Promise.all(relationPromises);

    delete values[this.primaryKey];
    if (!_.isEmpty(values)) {
      await this.forge({ [this.primaryKey]: primaryKeyValue }).save(values, {
        patch: true,
        transacting,
      });
    }

    const result = await this.forge({ [this.primaryKey]: primaryKeyValue }).fetch({ transacting });
    return result && result.toJSON ? result.toJSON() : result;
  },

  deleteRelations(id, { transacting }) {
    const values = {};

    this.associations.forEach(association => {
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
          break;
      }
    });

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};
```