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

/* -------------------------------------------------------------------------- */
/* Morph helpers                                                             */
/* -------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------- */
/* Predicate helpers                                                         */
/* -------------------------------------------------------------------------- */
const isNull = value => _.isNull(value);
const isEmptyArray = arr => _.isArray(arr) && arr.length === 0;
const isMorphAssociation = nature =>
  ['manyMorphToMany', 'manyMorphToOne', 'oneToManyMorph', 'manyToManyMorph'].includes(
    nature
  );
const isStandardAssociation = nature =>
  ['oneWay', 'oneToOne', 'oneToMany', 'manyToOne', 'manyWay', 'manyToMany'].includes(nature);

/* -------------------------------------------------------------------------- */
/* Association handlers (polymorphic dispatch)                               */
/* -------------------------------------------------------------------------- */
const associationHandlers = {
  oneWay: async (ctx, { association, details, property, response, primaryKeyValue }) => {
    return _.set(ctx.acc, ctx.current, _.get(property, details.model?.primaryKey, property));
  },

  oneToOne: async (ctx, { association, details, property, response, primaryKeyValue }) => {
    if (response[ctx.current] === property) return ctx.acc;

    const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

    if (isNull(property)) {
      const updatePromise = assocModel
        .where({
          [assocModel.primaryKey]: getValuePrimaryKey(response[ctx.current], assocModel.primaryKey),
        })
        .save({ [details.via]: null }, { method: 'update', patch: true, require: false, transacting: ctx.transacting });

      ctx.relationUpdates.push(updatePromise);
      return _.set(ctx.acc, ctx.current, null);
    }

    const updateLink = ctx.model
      .where({ [ctx.current]: property })
      .save({ [ctx.current]: null }, { method: 'update', patch: true, require: false, transacting: ctx.transacting })
      .then(() =>
        assocModel
          .where({ [assocModel.primaryKey]: property })
          .save({ [details.via]: primaryKeyValue }, { method: 'update', patch: true, require: false, transacting: ctx.transacting })
      );

    ctx.relationUpdates.push(updateLink);
    return _.set(ctx.acc, ctx.current, property);
  },

  oneToMany: async (ctx, { association, details, property, response, primaryKeyValue }) => {
    const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
    const currentIds = response[ctx.current];
    const toRemove = _.differenceWith(currentIds, property, (a, b) => {
      return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
    });

    const updatePromise = assocModel
      .where(assocModel.primaryKey, 'in', toRemove.map(v => v[assocModel.primaryKey] || v))
      .save({ [details.via]: null }, { method: 'update', patch: true, require: false, transacting: ctx.transacting })
      .then(() =>
        assocModel
          .where(assocModel.primaryKey, 'in', property.map(v => v[assocModel.primaryKey] || v))
          .save({ [details.via]: primaryKeyValue }, { method: 'update', patch: true, require: false, transacting: ctx.transacting })
      );

    ctx.relationUpdates.push(updatePromise);
    return ctx.acc;
  },

  manyToOne: async (ctx, { association, details, property }) => {
    return _.set(ctx.acc, ctx.current, _.get(property, details.model?.primaryKey, property));
  },

  manyWay: async (ctx, { association, details, property, primaryKeyValue }) => {
    // falls through to manyToMany handler
    return associationHandlers.manyToMany(ctx, { association, details, property, primaryKeyValue });
  },

  manyToMany: async (ctx, { association, property, response, primaryKeyValue }) => {
    const storedValue = transformToArrayID(response[ctx.current]);
    const currentValue = transformToArrayID(property);
    const toAdd = _.difference(currentValue, storedValue);
    const toRemove = _.difference(storedValue, currentValue);

    const collection = ctx.model.forge({ [ctx.model.primaryKey]: primaryKeyValue })[association.alias]();

    const updatePromise = collection
      .detach(toRemove, { transacting: ctx.transacting })
      .then(() => collection.attach(toAdd, { transacting: ctx.transacting }));

    ctx.relationUpdates.push(updatePromise);
    return ctx.acc;
  },

  manyMorphToMany: async (ctx, opts) => {
    return associationHandlers.manyMorphHandler(ctx, opts);
  },

  manyMorphToOne: async (ctx, opts) => {
    return associationHandlers.manyMorphHandler(ctx, opts);
  },

  oneToManyMorph: async (ctx, opts) => {
    return associationHandlers.morphModelHandler(ctx, opts);
  },

  manyToManyMorph: async (ctx, opts) => {
    return associationHandlers.morphModelHandler(ctx, opts);
  },

  oneMorphToOne: async (ctx) => ctx.acc,
  oneMorphToMany: async (ctx) => ctx.acc,
};

/* -------------------------------------------------------------------------- */
/* Morph specific handlers                                                    */
/* -------------------------------------------------------------------------- */
associationHandlers.manyMorphHandler = async (ctx, { association, property, response }) => {
  const refs = property;
  if (isEmptyArray(refs)) {
    ctx.relationUpdates.push(
      removeRelationMorph(ctx.model, { params: { id: ctx.primaryKeyValue }, transacting: ctx.transacting })
    );
    return ctx.acc;
  }

  for (const obj of refs) {
    const targetModel = strapi.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );

    const reverseAssoc = targetModel.associations.find(a => a.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      ctx.relationUpdates.push(
        removeRelationMorph(ctx.model, {
          params: {
            alias: association.alias,
            ref: targetModel.collectionName,
            refId: obj.refId,
            field: obj.field,
          },
          transacting: ctx.transacting,
        }).then(() =>
          addRelationMorph(ctx.model, {
            params: {
              id: response[ctx.model.primaryKey],
              alias: association.alias,
              ref: targetModel.collectionName,
              refId: obj.refId,
              field: obj.field,
              order: 1,
            },
            transacting: ctx.transacting,
          })
        )
      );
      continue;
    }

    const addRelation = async () => {
      const maxOrder = await ctx.model.morph.query(qb => {
        qb.max('order as order').where({
          [`${association.alias}_id`]: obj.refId,
          [`${association.alias}_type`]: targetModel.collectionName,
          field: obj.field,
        });
      }).fetch({ transacting: ctx.transacting });

      const { order = 0 } = maxOrder.toJSON();

      await addRelationMorph(ctx.model, {
        params: {
          id: response[ctx.model.primaryKey],
          alias: association.alias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
          order: order + 1,
        },
        transacting: ctx.transacting,
      });
    };

    ctx.relationUpdates.push(addRelation());
  }

  return ctx.acc;
};

associationHandlers.morphModelHandler = async (ctx, { association, property, response }) => {
  const currentValue = transformToArrayID(property);
  const model = strapi.db.getModel(
    ctx.details.collection || ctx.details.model,
    ctx.details.plugin
  );

  const promise = removeRelationMorph(model, {
    params: {
      alias: association.via,
      ref: ctx.model.collectionName,
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
            ref: ctx.model.collectionName,
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
  return ctx.acc;
};

/* -------------------------------------------------------------------------- */
/* Core exported methods                                                     */
/* -------------------------------------------------------------------------- */
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
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, { transacting });

    const relationUpdates = [];
    const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, current) => {
      const property = params.values[current];
      const association = this.associations.find(a => a.alias === current);
      const details = this._attributes[current];
      const ctx = {
        model: this,
        acc,
        current,
        transacting,
        relationUpdates,
        primaryKeyValue,
        details,
        response,
      };

      if (!association && _.get(details, 'isVirtual') !== true) {
        return _.set(acc, current, property);
      }

      const handler = associationHandlers[association.nature] || (async () => acc);
      return handler(ctx, { association, property, response, primaryKeyValue });
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
    const defaults = {
      oneWay: null,
      oneToOne: null,
      manyToOne: null,
      oneToManyMorph: null,
      manyWay: [],
      oneToMany: [],
      manyToMany: [],
      manyToManyMorph: [],
      manyMorphToMany: [],
      manyMorphToOne: [],
    };

    const values = this.associations.reduce((acc, association) => {
      const defaultValue = defaults[association.nature];
      if (defaultValue !== undefined) {
        acc[association.alias] = _.cloneDeep(defaultValue);
      }
      return acc;
    }, {});

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};
```