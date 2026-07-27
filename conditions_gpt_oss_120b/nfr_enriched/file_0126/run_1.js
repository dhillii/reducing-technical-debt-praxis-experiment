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
 * Compute the next order value for a morph relation.
 * @param {Object} ctx - The current model context (this).
 * @param {Object} association - Association definition.
 * @param {Object} obj - Reference object containing refId, field, etc.
 * @param {Object} transacting - Transaction object.
 * @returns {Promise<number>} - Next order value.
 */
const computeNextOrder = async (ctx, association, obj, transacting) => {
  const maxOrderResult = await ctx.morph
    .query(qb => {
      qb.max('order as order').where({
        [`${association.alias}_id`]: obj.refId,
        [`${association.alias}_type`]: obj.collectionName,
        field: obj.field,
      });
    })
    .fetch({ transacting });

  const { order = 0 } = maxOrderResult ? maxOrderResult.toJSON() : {};
  return order + 1;
};

/**
 * Add a morph relation for a given object.
 * @param {Object} ctx - The current model context (this).
 * @param {Object} association - Association definition.
 * @param {Object} obj - Reference object.
 * @param {Object} response - Current record data.
 * @param {Object} transacting - Transaction object.
 */
const addMorphRelation = async (ctx, association, obj, response, transacting) => {
  const targetModel = strapi.db.getModel(
    obj.ref,
    obj.source !== 'content-manager' ? obj.source : null
  );

  const order = await computeNextOrder(ctx, association, {
    ...obj,
    collectionName: targetModel.collectionName,
  }, transacting);

  await addRelationMorph(ctx, {
    params: {
      id: response[ctx.primaryKey],
      alias: association.alias,
      ref: targetModel.collectionName,
      refId: obj.refId,
      field: obj.field,
      order,
    },
    transacting,
  });
};

/**
 * Handle reverse one-to-many morph association.
 * @param {Object} ctx - The current model context (this).
 * @param {Object} association - Association definition.
 * @param {Object} obj - Reference object.
 * @param {Object} response - Current record data.
 * @param {Object} transacting - Transaction object.
 * @returns {Promise<void>}
 */
const handleReverseOneToManyMorph = async (ctx, association, obj, response, transacting) => {
  const targetModel = strapi.db.getModel(
    obj.ref,
    obj.source !== 'content-manager' ? obj.source : null
  );

  await removeRelationMorph(ctx, {
    params: {
      alias: association.alias,
      ref: targetModel.collectionName,
      refId: obj.refId,
      field: obj.field,
    },
    transacting,
  });

  await addRelationMorph(ctx, {
    params: {
      id: response[ctx.primaryKey],
      alias: association.alias,
      ref: targetModel.collectionName,
      refId: obj.refId,
      field: obj.field,
      order: 1,
    },
    transacting,
  });
};

/**
 * Process manyMorphToOne / manyMorphToMany association updates.
 * @param {Object} ctx - The current model context (this).
 * @param {Object} association - Association definition.
 * @param {Array} refs - Array of reference objects.
 * @param {Object} response - Current record data.
 * @param {Object} transacting - Transaction object.
 * @returns {Array<Promise>} - Array of promises to be awaited.
 */
const processManyMorph = (ctx, association, refs, response, transacting) => {
  const promises = [];

  if (Array.isArray(refs) && refs.length === 0) {
    promises.push(
      removeRelationMorph(ctx, {
        params: { id: getValuePrimaryKey(response, ctx.primaryKey) },
        transacting,
      })
    );
    return promises;
  }

  refs.forEach(obj => {
    const targetModel = strapi.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );

    const reverseAssoc = targetModel.associations.find(a => a.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      promises.push(
        handleReverseOneToManyMorph(ctx, association, obj, response, transacting)
      );
      return;
    }

    promises.push(addMorphRelation(ctx, association, obj, response, transacting));
  });

  return promises;
};

/**
 * Process oneToManyMorph / manyToManyMorph association updates.
 * @param {Object} ctx - The current model context (this).
 * @param {Object} association - Association definition.
 * @param {Array} currentValue - Array of IDs.
 * @param {Object} response - Current record data.
 * @param {Object} transacting - Transaction object.
 * @returns {Promise}
 */
const processOneToManyMorph = async (ctx, association, currentValue, response, transacting) => {
  const model = strapi.db.getModel(
    ctx._attributes[association.alias].collection ||
      ctx._attributes[association.alias].model,
    ctx._attributes[association.alias].plugin
  );

  await removeRelationMorph(model, {
    params: {
      alias: association.via,
      ref: ctx.collectionName,
      refId: response.id,
      field: association.alias,
    },
    transacting,
  });

  await Promise.all(
    currentValue.map((id, idx) =>
      addRelationMorph(model, {
        params: {
          id,
          alias: association.via,
          ref: ctx.collectionName,
          refId: response.id,
          field: association.alias,
          order: idx + 1,
        },
        transacting,
      })
    )
  );
};

/**
 * Update a single association based on its nature.
 * @param {Object} ctx - The current model context (this).
 * @param {Object} association - Association definition.
 * @param {any} property - New value for the association.
 * @param {Object} response - Current record data.
 * @param {Object} primaryKeyValue - Primary key of the record.
 * @param {Object} transacting - Transaction object.
 * @param {Array} relationUpdates - Collector for async update promises.
 * @returns {Object} - Accumulated values to be saved on the main record.
 */
const updateAssociation = async (
  ctx,
  association,
  property,
  response,
  primaryKeyValue,
  transacting,
  relationUpdates
) => {
  const details = ctx._attributes[association.alias];
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
  const values = {};

  switch (association.nature) {
    case 'oneWay':
      _.set(values, association.alias, _.get(property, assocModel.primaryKey, property));
      break;

    case 'oneToOne': {
      if (response[association.alias] === property) break;

      if (_.isNull(property)) {
        const updatePromise = assocModel
          .where({
            [assocModel.primaryKey]: getValuePrimaryKey(
              response[association.alias],
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
        _.set(values, association.alias, null);
        break;
      }

      const updateLink = ctx
        .where({ [association.alias]: property })
        .save(
          { [association.alias]: null },
          {
            method: 'update',
            patch: true,
            require: false,
            transacting,
          }
        )
        .then(() =>
          assocModel
            .where({ [assocModel.primaryKey]: property })
            .save(
              { [details.via]: primaryKeyValue },
              {
                method: 'update',
                patch: true,
                require: false,
                transacting,
              }
            )
        );

      relationUpdates.push(updateLink);
      _.set(values, association.alias, property);
      break;
    }

    case 'oneToMany': {
      const currentIds = response[association.alias] || [];
      const toRemove = _.differenceWith(
        currentIds,
        property,
        (a, b) => `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`
      );

      const updatePromise = assocModel
        .where(assocModel.primaryKey, 'in', toRemove.map(v => v[assocModel.primaryKey] || v))
        .save(
          { [details.via]: null },
          {
            method: 'update',
            patch: true,
            require: false,
            transacting,
          }
        )
        .then(() =>
          assocModel
            .where(
              assocModel.primaryKey,
              'in',
              property.map(v => v[assocModel.primaryKey] || v)
            )
            .save(
              { [details.via]: primaryKeyValue },
              {
                method: 'update',
                patch: true,
                require: false,
                transacting,
              }
            )
        );

      relationUpdates.push(updatePromise);
      break;
    }

    case 'manyToOne':
      _.set(values, association.alias, _.get(property, assocModel.primaryKey, property));
      break;

    case 'manyWay':
    case 'manyToMany': {
      const storedValue = transformToArrayID(response[association.alias]);
      const currentValue = transformToArrayID(property);

      const toAdd = _.difference(currentValue, storedValue);
      const toRemove = _.difference(storedValue, currentValue);

      const collection = ctx.forge({ [ctx.primaryKey]: primaryKeyValue })[association.alias]();

      const updatePromise = collection
        .detach(toRemove, { transacting })
        .then(() => collection.attach(toAdd, { transacting }));

      relationUpdates.push(updatePromise);
      break;
    }

    case 'manyMorphToMany':
    case 'manyMorphToOne': {
      const refs = property;
      const promises = processManyMorph(ctx, association, refs, response, transacting);
      relationUpdates.push(...promises);
      break;
    }

    case 'oneToManyMorph':
    case 'manyToManyMorph': {
      const currentValue = transformToArrayID(property);
      const promise = processOneToManyMorph(
        ctx,
        association,
        currentValue,
        response,
        transacting
      );
      relationUpdates.push(promise);
      break;
    }

    case 'oneMorphToOne':
    case 'oneMorphToMany':
      // No operation needed for these natures.
      break;

    default:
      break;
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

    if (_.isEmpty(populate)) {
      const promises = this.associations
        .filter(assoc => ['manyMorphToOne', 'manyMorphToMany'].includes(assoc.nature))
        .map(() =>
          this.morph
            .forge()
            .where({
              [`${this.collectionName}_id`]: getValuePrimaryKey(params, this.primaryKey),
            })
            .fetchAll({ transacting })
        );

      const related = await Promise.all(promises);
      related.forEach((value, index) => {
        data[this.associations[index].alias] = value ? value.toJSON() : value;
      });
    }

    return data;
  },

  async update(params, { transacting } = {}) {
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, { transacting });
    const relationUpdates = [];

    const values = await Object.keys(removeUndefinedKeys(params.values)).reduce(
      async (accPromise, current) => {
        const acc = await accPromise;
        const property = params.values[current];
        const association = this.associations.find(a => a.alias === current);
        if (!association && _.get(this._attributes[current], 'isVirtual') !== true) {
          _.set(acc, current, property);
          return acc;
        }

        const assocValues = await updateAssociation(
          this,
          association,
          property,
          response,
          primaryKeyValue,
          transacting,
          relationUpdates
        );

        return _.assign(acc, assocValues);
      },
      Promise.resolve({})
    );

    await Promise.all(relationUpdates);

    delete values[this.primaryKey];
    if (!_.isEmpty(values)) {
      await this.forge({ [this.primaryKey]: primaryKeyValue }).save(values, {
        patch: true,
        transacting,
      });
    }

    const result = await this.forge({ [this.primaryKey]: primaryKeyValue }).fetch({
      transacting,
    });

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