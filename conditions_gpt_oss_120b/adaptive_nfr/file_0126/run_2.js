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
 * Transform input to an array of string IDs.
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
 * Remove keys with undefined values.
 * @param {Object} obj
 * @returns {Object}
 */
const removeUndefinedKeys = obj => _.pickBy(obj, _.negate(_.isUndefined));

/**
 * Add a morph relation.
 * @param {Object} model
 * @param {Object} options
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
 * @param {Object} options
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
 * Handlers for each association nature.
 */
const associationHandlers = {
  oneWay: ({ property, assocModel, details }) => ({
    value: _.get(property, assocModel.primaryKey, property),
    promises: [],
  }),

  manyToOne: ({ property, assocModel }) => ({
    value: _.get(property, assocModel.primaryKey, property),
    promises: [],
  }),

  manyWay: ({ currentValue, storedValue, collection, transacting }) => {
    const toAdd = _.difference(currentValue, storedValue);
    const toRemove = _.difference(storedValue, currentValue);
    const promise = collection.detach(toRemove, { transacting }).then(() => collection.attach(toAdd, { transacting }));
    return { value: undefined, promises: [promise] };
  },

  manyToMany: ({ currentValue, storedValue, collection, transacting }) => {
    const toAdd = _.difference(currentValue, storedValue);
    const toRemove = _.difference(storedValue, currentValue);
    const promise = collection.detach(toRemove, { transacting }).then(() => collection.attach(toAdd, { transacting }));
    return { value: undefined, promises: [promise] };
  },

  oneToOne: async ({
    property,
    assocModel,
    details,
    response,
    primaryKeyValue,
    transacting,
    relationUpdates,
  }) => {
    if (_.isNull(property)) {
      const updatePromise = assocModel
        .where({
          [assocModel.primaryKey]: getValuePrimaryKey(response[details.alias], assocModel.primaryKey),
        })
        .save({ [details.via]: null }, { method: 'update', patch: true, require: false, transacting });
      relationUpdates.push(updatePromise);
      return { value: null, promises: [] };
    }

    const updateLink = this.where({ [details.alias]: property })
      .save({ [details.alias]: null }, { method: 'update', patch: true, require: false, transacting })
      .then(() =>
        assocModel.where({ [assocModel.primaryKey]: property }).save(
          { [details.via]: primaryKeyValue },
          { method: 'update', patch: true, require: false, transacting }
        )
      );

    relationUpdates.push(updateLink);
    return { value: property, promises: [] };
  },

  oneToMany: async ({
    property,
    assocModel,
    details,
    response,
    primaryKeyValue,
    transacting,
    relationUpdates,
  }) => {
    const currentIds = response[details.alias];
    const toRemove = _.differenceWith(currentIds, property, (a, b) => {
      return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
    });

    const updatePromise = assocModel
      .where(assocModel.primaryKey, 'in', toRemove.map(v => v[assocModel.primaryKey] || v))
      .save({ [details.via]: null }, { method: 'update', patch: true, require: false, transacting })
      .then(() =>
        assocModel
          .where(assocModel.primaryKey, 'in', property.map(v => v[assocModel.primaryKey] || v))
          .save({ [details.via]: primaryKeyValue }, { method: 'update', patch: true, require: false, transacting })
      );

    relationUpdates.push(updatePromise);
    return { value: undefined, promises: [] };
  },

  manyMorphToMany: handleMorphRelations.bind(null, 'manyMorphToMany'),
  manyMorphToOne: handleMorphRelations.bind(null, 'manyMorphToOne'),

  oneToManyMorph: handleReverseMorphRelations.bind(null, 'oneToManyMorph'),
  manyToManyMorph: handleReverseMorphRelations.bind(null, 'manyToManyMorph'),

  oneMorphToOne: () => ({ value: undefined, promises: [] }),
  oneMorphToMany: () => ({ value: undefined, promises: [] }),
};

/**
 * Handle morph relations (media -> model).
 * @param {string} nature
 * @param {Object} ctx
 */
async function handleMorphRelations(nature, ctx) {
  const { params, assocModel, association, response, primaryKeyValue, transacting, relationUpdates } = ctx;
  const refs = params.values[association.alias];

  if (Array.isArray(refs) && refs.length === 0) {
    relationUpdates.push(removeRelationMorph(ctx.self, { params: { id: primaryKeyValue }, transacting }));
    return { value: undefined, promises: [] };
  }

  for (const obj of refs) {
    const targetModel = strapi.db.getModel(obj.ref, obj.source !== 'content-manager' ? obj.source : null);
    const reverseAssoc = targetModel.associations.find(a => a.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      const promise = removeRelationMorph(ctx.self, {
        params: {
          alias: association.alias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
        },
        transacting,
      }).then(() =>
        addRelationMorph(ctx.self, {
          params: {
            id: response[ctx.self.primaryKey],
            alias: association.alias,
            ref: targetModel.collectionName,
            refId: obj.refId,
            field: obj.field,
            order: 1,
          },
          transacting,
        })
      );
      relationUpdates.push(promise);
      continue;
    }

    const addRelation = async () => {
      const maxOrder = await ctx.self.morph
        .query(qb => {
          qb.max('order as order').where({
            [`${association.alias}_id`]: obj.refId,
            [`${association.alias}_type`]: targetModel.collectionName,
            field: obj.field,
          });
        })
        .fetch({ transacting });

      const { order = 0 } = maxOrder.toJSON();

      await addRelationMorph(ctx.self, {
        params: {
          id: response[ctx.self.primaryKey],
          alias: association.alias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
          order: order + 1,
        },
        transacting,
      });
    };

    relationUpdates.push(addRelation());
  }

  return { value: undefined, promises: [] };
}

/**
 * Handle reverse morph relations (model -> media).
 * @param {string} nature
 * @param {Object} ctx
 */
async function handleReverseMorphRelations(nature, ctx) {
  const { params, association, details, response, transacting, relationUpdates } = ctx;
  const currentValue = transformToArrayID(params.values[association.alias]);

  const model = strapi.db.getModel(details.collection || details.model, details.plugin);

  const promise = removeRelationMorph(model, {
    params: {
      alias: association.via,
      ref: ctx.self.collectionName,
      refId: response.id,
      field: association.alias,
    },
    transacting,
  }).then(() => {
    return Promise.all(
      currentValue.map((id, idx) =>
        addRelationMorph(model, {
          params: {
            id,
            alias: association.via,
            ref: ctx.self.collectionName,
            refId: response.id,
            field: association.alias,
            order: idx + 1,
          },
          transacting,
        })
      )
    );
  });

  relationUpdates.push(promise);
  return { value: undefined, promises: [] };
}

/**
 * Resolve the appropriate handler for a given nature.
 * @param {string} nature
 * @returns {Function}
 */
function getHandler(nature) {
  return associationHandlers[nature] || (() => ({ value: undefined, promises: [] }));
}

/**
 * Exported service methods.
 */
module.exports = {
  /**
   * Find one record with optional population.
   */
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

  /**
   * Update a record and its relations.
   */
  async update(params, { transacting } = {}) {
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, { transacting });
    const relationUpdates = [];

    const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, key) => {
      const property = params.values[key];
      const association = this.associations.find(a => a.alias === key);
      const details = this._attributes[key];
      const assocModel = association
        ? strapi.db.getModel(details.model || details.collection, details.plugin)
        : null;

      // Non-association fields
      if (!association && _.get(details, 'isVirtual') !== true) {
        return _.set(acc, key, property);
      }

      const handler = getHandler(association.nature);
      const ctx = {
        self: this,
        params,
        property,
        assocModel,
        association,
        details,
        response,
        primaryKeyValue,
        transacting,
        relationUpdates,
      };

      // Special handling for simple value returns
      if (['oneWay', 'manyToOne'].includes(association.nature)) {
        const { value } = handler(ctx);
        return _.set(acc, key, value);
      }

      // Complex handlers may be async
      const result = handler(ctx);
      if (result instanceof Promise) {
        // For async handlers like oneToOne, oneToMany, morph handlers
        // we push the promise handling inside the handler itself.
        // The handler returns an object with possible value and promises.
        // Since async handlers already manage relationUpdates, we just set value if present.
        result.then(res => {
          if (res.value !== undefined) _.set(acc, key, res.value);
        });
        return acc;
      }

      const { value, promises } = result;
      if (value !== undefined) _.set(acc, key, value);
      if (promises && promises.length) relationUpdates.push(...promises);
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

  /**
   * Delete all relations for a given record.
   */
  deleteRelations(id, { transacting }) {
    const values = {};

    this.associations.forEach(association => {
      const nullify = ['oneWay', 'oneToOne', 'manyToOne', 'oneToManyMorph'].includes(association.nature);
      values[association.alias] = nullify ? null : [];
    });

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};