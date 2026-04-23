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
 * Transform various inputs to an array of string IDs.
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
 * Remove keys with undefined values from an object.
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
 * Fetch related morph data when populate is empty.
 * @param {Object} model
 * @param {Object} params
 * @param {Object} transacting
 * @returns {Promise<Object>}
 */
const fetchMorphRelations = async (model, params, transacting) => {
  const primaryKey = getValuePrimaryKey(params, model.primaryKey);
  const morphPromises = model.associations
    .filter(assoc => ['manyMorphToOne', 'manyMorphToMany'].includes(assoc.nature))
    .map(() =>
      model.morph
        .forge()
        .where({ [`${model.collectionName}_id`]: primaryKey })
        .fetchAll({ transacting })
    );

  const related = await Promise.all(morphPromises);
  const data = {};

  related.forEach((value, idx) => {
    const alias = model.associations[idx].alias;
    data[alias] = value ? value.toJSON() : value;
  });

  return data;
};

/**
 * Handle one-to-one association updates.
 */
const handleOneToOne = async ({
  property,
  assocModel,
  details,
  responseCurrent,
  primaryKeyValue,
  transacting,
}) => {
  if (responseCurrent === property) {
    return { valuesPatch: {}, relationPromise: null };
  }

  if (_.isNull(property)) {
    const promise = assocModel
      .where({ [assocModel.primaryKey]: getValuePrimaryKey(responseCurrent, assocModel.primaryKey) })
      .save({ [details.via]: null }, { method: 'update', patch: true, require: false, transacting });

    return { valuesPatch: { [details.alias]: null }, relationPromise: promise };
  }

  const unlinkOld = this.where({ [details.alias]: property })
    .save({ [details.alias]: null }, { method: 'update', patch: true, require: false, transacting })
    .then(() =>
      assocModel
        .where({ [assocModel.primaryKey]: property })
        .save({ [details.via]: primaryKeyValue }, {
          method: 'update',
          patch: true,
          require: false,
          transacting,
        })
    );

  return { valuesPatch: { [details.alias]: property }, relationPromise: unlinkOld };
};

/**
 * Handle one-to-many association updates.
 */
const handleOneToMany = ({
  property,
  assocModel,
  details,
  responseCurrent,
  primaryKeyValue,
  transacting,
}) => {
  const currentIds = responseCurrent || [];
  const toRemove = _.differenceWith(
    currentIds,
    property,
    (a, b) => `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`
  );

  const removePromise = assocModel
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

  return { valuesPatch: {}, relationPromise: removePromise };
};

/**
 * Handle many-to-many association updates.
 */
const handleManyToMany = ({
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

  const promise = collection
    .detach(toRemove, { transacting })
    .then(() => collection.attach(toAdd, { transacting }));

  return promise;
};

/**
 * Handle morph-to-many and morph-to-one updates.
 */
const handleMorphRelations = async ({
  model,
  association,
  primaryKeyValue,
  refs,
  response,
  transacting,
}) => {
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
 * Handle model-to-morph many-to-many updates.
 */
const handleModelToMorph = async ({
  model,
  association,
  primaryKeyValue,
  currentValue,
  response,
  transacting,
}) => {
  const targetModel = strapi.db.getModel(
    association.details.collection || association.details.model,
    association.details.plugin
  );

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
      const morphData = await fetchMorphRelations(this, params, transacting);
      Object.assign(data, morphData);
    }

    return data;
  },

  async update(params, { transacting } = {}) {
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, { transacting });

    const relationPromises = [];
    const valuesPatch = {};

    const paramKeys = Object.keys(removeUndefinedKeys(params.values));

    for (const key of paramKeys) {
      const property = params.values[key];
      const association = this.associations.find(a => a.alias === key);
      const details = this._attributes[key];

      // Skip virtual attributes without association
      if (!association && _.get(details, 'isVirtual') !== true) {
        valuesPatch[key] = property;
        continue;
      }

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

      switch (association.nature) {
        case 'oneWay':
          valuesPatch[key] = _.get(property, assocModel.primaryKey, property);
          break;

        case 'oneToOne': {
          const { valuesPatch: vp, relationPromise } = await handleOneToOne.call(
            this,
            {
              property,
              assocModel,
              details,
              responseCurrent: response[key],
              primaryKeyValue,
              transacting,
            }
          );
          Object.assign(valuesPatch, vp);
          if (relationPromise) relationPromises.push(relationPromise);
          break;
        }

        case 'oneToMany': {
          const { relationPromise } = handleOneToMany({
            property,
            assocModel,
            details,
            responseCurrent: response[key],
            primaryKeyValue,
            transacting,
          });
          if (relationPromise) relationPromises.push(relationPromise);
          break;
        }

        case 'manyToOne':
          valuesPatch[key] = _.get(property, assocModel.primaryKey, property);
          break;

        case 'manyWay':
        case 'manyToMany': {
          const storedValue = transformToArrayID(response[key]);
          const currentValue = transformToArrayID(params.values[key]);

          const promise = handleManyToMany({
            model: this,
            association,
            primaryKeyValue,
            storedValue,
            currentValue,
            transacting,
          });
          relationPromises.push(promise);
          break;
        }

        case 'manyMorphToMany':
        case 'manyMorphToOne': {
          await handleMorphRelations({
            model: this,
            association,
            primaryKeyValue,
            refs: property,
            response,
            transacting,
          });
          break;
        }

        case 'oneToManyMorph':
        case 'manyToManyMorph': {
          const currentValue = transformToArrayID(params.values[key]);

          await handleModelToMorph({
            model: this,
            association: { ...association, details },
            primaryKeyValue,
            currentValue,
            response,
            transacting,
          });
          break;
        }

        case 'oneMorphToOne':
        case 'oneMorphToMany':
          // No operation needed for these natures.
          break;

        default:
          break;
      }
    }

    if (relationPromises.length) {
      await Promise.all(relationPromises);
    }

    // Persist attribute changes
    if (!_.isEmpty(valuesPatch)) {
      await this.forge({ [this.primaryKey]: primaryKeyValue }).save(valuesPatch, {
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