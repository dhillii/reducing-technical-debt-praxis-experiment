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

/**
 * Fetch a single record with optional population.
 */
const fetchRecord = async (model, params, populate, { transacting } = {}) => {
  const pk = getValuePrimaryKey(params, model.primaryKey);
  const record = await model
    .forge({ [model.primaryKey]: pk })
    .fetch({ transacting, withRelated: populate });

  return record ? record.toJSON() : null;
};

/**
 * Manually populate morph relations when no populate is requested.
 */
const populateMorphRelations = async (model, params, data) => {
  const pk = getValuePrimaryKey(params, model.primaryKey);
  const morphAssociations = model.associations.filter(association =>
    ['manyMorphToOne', 'manyMorphToMany'].includes(association.nature)
  );

  const promises = morphAssociations.map(() =>
    model.morph
      .forge()
      .where({ [`${model.collectionName}_id`]: pk })
      .fetchAll()
  );

  const related = await Promise.all(promises);
  related.forEach((value, index) => {
    const alias = morphAssociations[index].alias;
    data[alias] = value ? value.toJSON() : null;
  });
};

/**
 * Update a one-to-one relation.
 */
const updateOneToOne = async ({
  model,
  association,
  details,
  property,
  response,
  primaryKeyValue,
  transacting,
}) => {
  if (response[association.alias] === property) return null;

  if (_.isNull(property)) {
    return model
      .where({ [model.primaryKey]: getValuePrimaryKey(response[association.alias], model.primaryKey) })
      .save({ [details.via]: null }, { method: 'update', patch: true, require: false, transacting });
  }

  // Unlink previous relation
  const unlink = model
    .where({ [association.alias]: property })
    .save({ [association.alias]: null }, { method: 'update', patch: true, require: false, transacting })
    .then(() =>
      strapi.db
        .getModel(details.model || details.collection, details.plugin)
        .where({ [model.primaryKey]: property })
        .save({ [details.via]: primaryKeyValue }, { method: 'update', patch: true, require: false, transacting })
    );

  return unlink;
};

/**
 * Update a one-to-many relation.
 */
const updateOneToMany = ({
  assocModel,
  details,
  primaryKeyValue,
  response,
  property,
  transacting,
}) => {
  const currentIds = response[details.alias] || [];
  const toRemove = _.differenceWith(currentIds, property, (a, b) => {
    return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
  });

  const removePromise = assocModel
    .where(assocModel.primaryKey, 'in', toRemove.map(v => v[assocModel.primaryKey] || v))
    .save({ [details.via]: null }, { method: 'update', patch: true, require: false, transacting })
    .then(() =>
      assocModel
        .where(assocModel.primaryKey, 'in', property.map(v => v[assocModel.primaryKey] || v))
        .save({ [details.via]: primaryKeyValue }, { method: 'update', patch: true, require: false, transacting })
    );

  return removePromise;
};

/**
 * Update many-to-many relations.
 */
const updateManyToMany = ({
  model,
  association,
  primaryKeyValue,
  response,
  params,
  transacting,
}) => {
  const storedValue = transformToArrayID(response[association.alias]);
  const currentValue = transformToArrayID(params.values[association.alias]);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = model.forge({ [model.primaryKey]: primaryKeyValue })[association.alias]();

  return collection.detach(toRemove, { transacting }).then(() => collection.attach(toAdd, { transacting }));
};

/**
 * Update morph-to-many or morph-to-one relations.
 */
const updateMorphRelations = async ({
  model,
  association,
  primaryKeyValue,
  response,
  params,
  transacting,
}) => {
  const refs = params.values[association.alias];

  if (Array.isArray(refs) && refs.length === 0) {
    await removeRelationMorph(model, { params: { id: primaryKeyValue }, transacting });
    return;
  }

  const promises = refs.map(async obj => {
    const targetModel = strapi.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );

    const reverseAssoc = targetModel.associations.find(a => a.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      await removeRelationMorph(model, {
        params: {
          alias: association.alias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
        },
        transacting,
      });
      await addRelationMorph(model, {
        params: {
          id: response[model.primaryKey],
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

    const maxOrderResult = await model.morph
      .query(qb => {
        qb.max('order as order').where({
          [`${association.alias}_id`]: obj.refId,
          [`${association.alias}_type`]: targetModel.collectionName,
          field: obj.field,
        });
      })
      .fetch({ transacting });

    const { order = 0 } = maxOrderResult.toJSON();

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
  });

  await Promise.all(promises);
};

/**
 * Update model-to-media morph relations.
 */
const updateModelToMediaMorph = async ({
  model,
  association,
  primaryKeyValue,
  response,
  params,
  transacting,
}) => {
  const currentValue = transformToArrayID(params.values[association.alias]);

  const targetModel = strapi.db.getModel(details.collection || details.model, details.plugin);

  await removeRelationMorph(targetModel, {
    params: {
      alias: association.via,
      ref: model.collectionName,
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
        ref: model.collectionName,
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
 * Process a single association update based on its nature.
 */
const processAssociation = async ({
  model,
  association,
  details,
  property,
  response,
  primaryKeyValue,
  params,
  transacting,
}) => {
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  switch (association.nature) {
    case 'oneWay':
      return _.set({}, association.alias, _.get(property, assocModel.primaryKey, property));

    case 'oneToOne':
      return await updateOneToOne({
        model,
        association,
        details,
        property,
        response,
        primaryKeyValue,
        transacting,
      });

    case 'oneToMany':
      return updateOneToMany({
        assocModel,
        details,
        primaryKeyValue,
        response,
        property,
        transacting,
      });

    case 'manyToOne':
      return _.set({}, association.alias, _.get(property, assocModel.primaryKey, property));

    case 'manyToMany':
    case 'manyWay':
      return updateManyToMany({
        model,
        association,
        primaryKeyValue,
        response,
        params,
        transacting,
      });

    case 'manyMorphToMany':
    case 'manyMorphToOne':
      await updateMorphRelations({
        model,
        association,
        primaryKeyValue,
        response,
        params,
        transacting,
      });
      return null;

    case 'oneToManyMorph':
    case 'manyToManyMorph':
      await updateModelToMediaMorph({
        model,
        association,
        primaryKeyValue,
        response,
        params,
        transacting,
      });
      return null;

    case 'oneMorphToOne':
    case 'oneMorphToMany':
      return null;

    default:
      return null;
  }
};

module.exports = {
  async findOne(params, populate, { transacting } = {}) {
    const data = await fetchRecord(this, params, populate, { transacting });

    if (_.isEmpty(populate) && data) {
      await populateMorphRelations(this, params, data);
    }

    return data;
  },

  async update(params, { transacting } = {}) {
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, { transacting });

    const values = {};
    const relationPromises = [];

    for (const key of Object.keys(removeUndefinedKeys(params.values))) {
      const property = params.values[key];
      const association = this.associations.find(a => a.alias === key);
      const details = this._attributes[key];

      if (!association && _.get(details, 'isVirtual') !== true) {
        _.set(values, key, property);
        continue;
      }

      const result = await processAssociation({
        model: this,
        association,
        details,
        property,
        response,
        primaryKeyValue,
        params,
        transacting,
      });

      if (result && typeof result.then === 'function') {
        relationPromises.push(result);
      } else if (result && typeof result === 'object') {
        _.assign(values, result);
      }
    }

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