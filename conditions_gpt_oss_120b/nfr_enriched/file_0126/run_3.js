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
  const record = await model.forge({ [model.primaryKey]: pk }).fetch({
    transacting,
    withRelated: populate,
  });
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
      .fetchAll({ transacting: undefined })
  );

  const related = await Promise.all(promises);
  related.forEach((value, index) => {
    const alias = morphAssociations[index].alias;
    data[alias] = value ? value.toJSON() : value;
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
      .where({
        [model.primaryKey]: getValuePrimaryKey(response[association.alias], model.primaryKey),
      })
      .save({ [details.via]: null }, { method: 'update', patch: true, require: false, transacting });
  }

  // Unlink previous relation
  const unlink = model
    .where({ [association.alias]: property })
    .save({ [association.alias]: null }, { method: 'update', patch: true, require: false, transacting })
    .then(() =>
      strapi
        .db.getModel(details.model || details.collection, details.plugin)
        .where({ [model.primaryKey]: property })
        .save({ [details.via]: primaryKeyValue }, {
          method: 'update',
          patch: true,
          require: false,
          transacting,
        })
    );

  return unlink;
};

/**
 * Update a one-to-many relation.
 */
const updateOneToMany = async ({
  assocModel,
  details,
  property,
  response,
  primaryKeyValue,
  transacting,
}) => {
  const currentIds = response[details.alias];
  const toRemove = _.differenceWith(currentIds, property, (a, b) => {
    return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
  });

  const unlink = assocModel
    .where(assocModel.primaryKey, 'in', toRemove.map(v => v[assocModel.primaryKey] || v))
    .save({ [details.via]: null }, { method: 'update', patch: true, require: false, transacting })
    .then(() =>
      assocModel
        .where(assocModel.primaryKey, 'in', property.map(v => v[assocModel.primaryKey] || v))
        .save({ [details.via]: primaryKeyValue }, {
          method: 'update',
          patch: true,
          require: false,
          transacting,
        })
    );

  return unlink;
};

/**
 * Update many-to-many or many-way relations.
 */
const updateManyToMany = ({
  model,
  association,
  primaryKeyValue,
  storedValue,
  currentValue,
  transacting,
}) => {
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
  response,
  refs,
  transacting,
}) => {
  const promises = [];

  if (Array.isArray(refs) && refs.length === 0) {
    promises.push(removeRelationMorph(model, { params: { id: response[model.primaryKey] }, transacting }));
    return promises;
  }

  for (const obj of refs) {
    const targetModel = strapi.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );

    const reverseAssoc = targetModel.associations.find(a => a.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      const p = removeRelationMorph(model, {
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
            id: response[model.primaryKey],
            alias: association.alias,
            ref: targetModel.collectionName,
            refId: obj.refId,
            field: obj.field,
            order: 1,
          },
          transacting,
        })
      );
      promises.push(p);
      continue;
    }

    const addRelation = async () => {
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
    };

    promises.push(addRelation());
  }

  return promises;
};

/**
 * Update model-to-media morph relations.
 */
const updateModelToMediaMorph = async ({
  model,
  association,
  details,
  response,
  currentValue,
  transacting,
}) => {
  const targetModel = strapi.db.getModel(details.collection || details.model, details.plugin);

  const cleanup = removeRelationMorph(targetModel, {
    params: {
      alias: association.via,
      ref: model.collectionName,
      refId: response.id,
      field: association.alias,
    },
    transacting,
  });

  const attachAll = Promise.all(
    currentValue.map((id, idx) =>
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
    )
  );

  return cleanup.then(() => attachAll);
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
  transacting,
  relationUpdates,
}) => {
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
  const storedValue = transformToArrayID(response[association.alias]);
  const currentValue = transformToArrayID(property);

  switch (association.nature) {
    case 'oneWay':
      _.set(relationUpdates.values, association.alias, _.get(property, assocModel.primaryKey, property));
      break;

    case 'oneToOne':
      const oneToOnePromise = await updateOneToOne({
        model,
        association,
        details,
        property,
        response,
        primaryKeyValue,
        transacting,
      });
      if (oneToOnePromise) relationUpdates.promises.push(oneToOnePromise);
      _.set(relationUpdates.values, association.alias, property);
      break;

    case 'oneToMany':
      relationUpdates.promises.push(
        updateOneToMany({
          assocModel,
          details,
          property,
          response,
          primaryKeyValue,
          transacting,
        })
      );
      break;

    case 'manyToOne':
      _.set(relationUpdates.values, association.alias, _.get(property, assocModel.primaryKey, property));
      break;

    case 'manyWay':
    case 'manyToMany':
      relationUpdates.promises.push(
        updateManyToMany({
          model,
          association,
          primaryKeyValue,
          storedValue,
          currentValue,
          transacting,
        })
      );
      break;

    case 'manyMorphToMany':
    case 'manyMorphToOne':
      const morphPromises = await updateMorphRelations({
        model,
        association,
        response,
        refs: property,
        transacting,
      });
      relationUpdates.promises.push(...morphPromises);
      break;

    case 'oneToManyMorph':
    case 'manyToManyMorph':
      relationUpdates.promises.push(
        await updateModelToMediaMorph({
          model,
          association,
          details,
          response,
          currentValue,
          transacting,
        })
      );
      break;

    case 'oneMorphToOne':
    case 'oneMorphToMany':
      // No operation needed for these natures.
      break;

    default:
      break;
  }
};

/**
 * Public API
 */
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

    const relationUpdates = { promises: [], values: {} };
    const cleanParams = removeUndefinedKeys(params.values);

    for (const key of Object.keys(cleanParams)) {
      const property = cleanParams[key];
      const association = this.associations.find(a => a.alias === key);
      const details = this._attributes[key];

      if (!association && _.get(details, 'isVirtual') !== true) {
        _.set(relationUpdates.values, key, property);
        continue;
      }

      await processAssociation({
        model: this,
        association,
        details,
        property,
        response,
        primaryKeyValue,
        transacting,
        relationUpdates,
      });
    }

    await Promise.all(relationUpdates.promises);

    delete relationUpdates.values[this.primaryKey];
    if (!_.isEmpty(relationUpdates.values)) {
      await this.forge({ [this.primaryKey]: primaryKeyValue }).save(relationUpdates.values, {
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