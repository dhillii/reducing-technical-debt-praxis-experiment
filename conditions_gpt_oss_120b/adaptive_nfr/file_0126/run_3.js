'use strict';

/**
 * Module dependencies
 */
const _ = require('lodash');
const {
  models: { getValuePrimaryKey },
} = require('strapi-utils');

/**
 * Transform input to array of string IDs.
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
 * Add a morph relation.
 * @param {Object} model
 * @param {Object} opts
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
 * Remove a morph relation.
 * @param {Object} model
 * @param {Object} opts
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
 * Get the maximum order for a given association and object.
 * @param {Object} ctx
 * @param {Object} obj
 * @returns {Promise<number>}
 */
const getMaxOrder = async (ctx, association, obj) => {
  const maxOrder = await ctx.morph
    .query(qb => {
      qb.max('order as order').where({
        [`${association.alias}_id`]: obj.refId,
        [`${association.alias}_type`]: obj.targetModel.collectionName,
        field: obj.field,
      });
    })
    .fetch({ transacting: ctx.transacting });

  const { order = 0 } = maxOrder.toJSON();
  return order;
};

/**
 * Handler map for association natures.
 */
const natureHandlers = {
  oneWay: async (ctx, { association, property, details, response }) => {
    return _.set(ctx.acc, association.alias, _.get(property, details.model?.primaryKey || details.collection, property));
  },

  manyToOne: async (ctx, { association, property, details }) => {
    return _.set(ctx.acc, association.alias, _.get(property, details.model?.primaryKey || details.collection, property));
  },

  manyWay: async (ctx, { association, property, response }) => {
    // falls through to manyToMany handling
    return natureHandlers.manyToMany(ctx, { association, property, response });
  },

  manyToMany: async (ctx, { association, property, response }) => {
    const storedValue = transformToArrayID(response[association.alias]);
    const currentValue = transformToArrayID(property);
    const toAdd = _.difference(currentValue, storedValue);
    const toRemove = _.difference(storedValue, currentValue);
    const collection = ctx.forge({ [ctx.primaryKey]: ctx.primaryKeyValue })[association.alias]();

    const promise = collection
      .detach(toRemove, { transacting: ctx.transacting })
      .then(() => collection.attach(toAdd, { transacting: ctx.transacting }));

    ctx.relationUpdates.push(promise);
    return ctx.acc;
  },

  oneToMany: async (ctx, { association, property, details, response }) => {
    const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
    const currentIds = response[association.alias];
    const toRemove = _.differenceWith(currentIds, property, (a, b) => {
      return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
    });

    const promise = assocModel
      .where(assocModel.primaryKey, 'in', toRemove.map(v => v[assocModel.primaryKey] || v))
      .save({ [details.via]: null }, { method: 'update', patch: true, require: false, transacting: ctx.transacting })
      .then(() =>
        assocModel
          .where(assocModel.primaryKey, 'in', property.map(v => v[assocModel.primaryKey] || v))
          .save({ [details.via]: ctx.primaryKeyValue }, { method: 'update', patch: true, require: false, transacting: ctx.transacting })
      );

    ctx.relationUpdates.push(promise);
    return ctx.acc;
  },

  oneToOne: async (ctx, { association, property, details, response }) => {
    const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
    if (response[association.alias] === property) return ctx.acc;

    if (_.isNull(property)) {
      const updatePromise = assocModel
        .where({ [assocModel.primaryKey]: getValuePrimaryKey(response[association.alias], assocModel.primaryKey) })
        .save({ [details.via]: null }, { method: 'update', patch: true, require: false, transacting: ctx.transacting });

      ctx.relationUpdates.push(updatePromise);
      return _.set(ctx.acc, association.alias, null);
    }

    const updateLink = ctx.where({ [association.alias]: property })
      .save({ [association.alias]: null }, { method: 'update', patch: true, require: false, transacting: ctx.transacting })
      .then(() =>
        assocModel.where({ [assocModel.primaryKey]: property }).save({ [details.via]: ctx.primaryKeyValue }, { method: 'update', patch: true, require: false, transacting: ctx.transacting })
      );

    ctx.relationUpdates.push(updateLink);
    return _.set(ctx.acc, association.alias, property);
  },

  manyMorphToMany: async (ctx, { association, property, response }) => {
    return handleMorphRelations(ctx, association, property, response);
  },

  manyMorphToOne: async (ctx, { association, property, response }) => {
    return handleMorphRelations(ctx, association, property, response);
  },

  oneToManyMorph: async (ctx, { association, property, details, response }) => {
    return handleModelToMediaMorph(ctx, association, property, details, response);
  },

  manyToManyMorph: async (ctx, { association, property, details, response }) => {
    return handleModelToMediaMorph(ctx, association, property, details, response);
  },

  oneMorphToOne: async () => {},
  oneMorphToMany: async () => {},
};

/**
 * Handle morph relations (media <-> model).
 * @param {Object} ctx
 * @param {Object} association
 * @param {*} refs
 * @param {Object} response
 */
const handleMorphRelations = async (ctx, association, refs, response) => {
  if (Array.isArray(refs) && refs.length === 0) {
    ctx.relationUpdates.push(
      removeRelationMorph(ctx, { params: { id: ctx.primaryKeyValue }, transacting: ctx.transacting })
    );
    return;
  }

  for (const obj of refs) {
    const targetModel = strapi.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );

    const reverseAssoc = targetModel.associations.find(a => a.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      const promise = removeRelationMorph(ctx, {
        params: {
          alias: association.alias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
        },
        transacting: ctx.transacting,
      }).then(() =>
        addRelationMorph(ctx, {
          params: {
            id: response[ctx.primaryKey],
            alias: association.alias,
            ref: targetModel.collectionName,
            refId: obj.refId,
            field: obj.field,
            order: 1,
          },
          transacting: ctx.transacting,
        })
      );

      ctx.relationUpdates.push(promise);
      continue;
    }

    const order = await getMaxOrder(ctx, association, { refId: obj.refId, field: obj.field, targetModel });
    const promise = addRelationMorph(ctx, {
      params: {
        id: response[ctx.primaryKey],
        alias: association.alias,
        ref: targetModel.collectionName,
        refId: obj.refId,
        field: obj.field,
        order: order + 1,
      },
      transacting: ctx.transacting,
    });

    ctx.relationUpdates.push(promise);
  }
};

/**
 * Handle model-to-media morph relations.
 * @param {Object} ctx
 * @param {Object} association
 * @param {*} values
 * @param {Object} details
 * @param {Object} response
 */
const handleModelToMediaMorph = async (ctx, association, values, details, response) => {
  const currentValue = transformToArrayID(values);
  const model = strapi.db.getModel(details.collection || details.model, details.plugin);

  const promise = removeRelationMorph(model, {
    params: {
      alias: association.via,
      ref: ctx.collectionName,
      refId: response.id,
      field: association.alias,
    },
    transacting: ctx.transacting,
  }).then(() =>
    Promise.all(
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
          transacting: ctx.transacting,
        })
      )
    )
  );

  ctx.relationUpdates.push(promise);
};

/**
 * Exported service methods.
 */
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
        .filter(a => ['manyMorphToOne', 'manyMorphToMany'].includes(a.nature))
        .map(() =>
          this.morph
            .forge()
            .where({ [`${this.collectionName}_id`]: getValuePrimaryKey(params, this.primaryKey) })
            .fetchAll({ transacting })
        );

      const related = await Promise.all(promises);
      related.forEach((value, idx) => {
        data[this.associations[idx].alias] = value ? value.toJSON() : value;
      });
    }

    return data;
  },

  async update(params, { transacting } = {}) {
    const relationUpdates = [];
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, { transacting });

    const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, key) => {
      const property = params.values[key];
      const association = this.associations.find(a => a.alias === key);
      const details = this._attributes[key];

      if (!association && _.get(details, 'isVirtual') !== true) {
        return _.set(acc, key, property);
      }

      const ctx = {
        acc,
        relationUpdates,
        transacting,
        primaryKeyValue,
        primaryKey: this.primaryKey,
        collectionName: this.collectionName,
        forge: this.forge.bind(this),
        where: this.where.bind(this),
        transacting,
      };

      const handler = natureHandlers[association.nature];
      if (handler) {
        return handler(ctx, { association, property, details, response });
      }

      return acc;
    }, {});

    await Promise.all(relationUpdates);

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
      }
    });

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};