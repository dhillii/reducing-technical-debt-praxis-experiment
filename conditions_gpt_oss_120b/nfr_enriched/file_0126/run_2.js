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
 * Helper to retrieve the model for a given attribute details.
 */
const getAssociatedModel = (details) => {
  return strapi.db.getModel(details.model || details.collection, details.plugin);
};

/**
 * Handlers for each association nature.
 */
const handlers = {
  oneWay: async (ctx, { property, details }) => ({
    value: _.get(property, getAssociatedModel(details).primaryKey, property),
  }),

  manyToOne: async (ctx, { property, details }) => ({
    value: _.get(property, getAssociatedModel(details).primaryKey, property),
  }),

  oneToOne: async (ctx, { property, details, response, primaryKeyValue }) => {
    const assocModel = getAssociatedModel(details);
    if (response[details.alias] === property) {
      return {};
    }

    if (_.isNull(property)) {
      const updatePromise = assocModel
        .where({
          [assocModel.primaryKey]: getValuePrimaryKey(
            response[details.alias],
            assocModel.primaryKey
          ),
        })
        .save(
          { [details.via]: null },
          {
            method: 'update',
            patch: true,
            require: false,
            transacting: ctx.transacting,
          }
        );
      return { value: null, promise: updatePromise };
    }

    const updateLink = ctx
      .where({ [details.alias]: property })
      .save(
        { [details.alias]: null },
        {
          method: 'update',
          patch: true,
          require: false,
          transacting: ctx.transacting,
        }
      )
      .then(() => {
        return assocModel.where({ [assocModel.primaryKey]: property }).save(
          { [details.via]: primaryKeyValue },
          {
            method: 'update',
            patch: true,
            require: false,
            transacting: ctx.transacting,
          }
        );
      });

    return { value: property, promise: updateLink };
  },

  oneToMany: async (ctx, { property, details, response, primaryKeyValue }) => {
    const assocModel = getAssociatedModel(details);
    const currentIds = response[details.alias] || [];
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
          transacting: ctx.transacting,
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
              transacting: ctx.transacting,
            }
          );
      });

    return { promise: updatePromise };
  },

  manyToMany: async (ctx, { property, details, response, primaryKeyValue }) => {
    const storedValue = transformToArrayID(response[details.alias]);
    const currentValue = transformToArrayID(property);

    const toAdd = _.difference(currentValue, storedValue);
    const toRemove = _.difference(storedValue, currentValue);

    const collection = ctx.forge({ [ctx.primaryKey]: primaryKeyValue })[details.alias]();

    const updatePromise = collection
      .detach(toRemove, { transacting: ctx.transacting })
      .then(() => collection.attach(toAdd, { transacting: ctx.transacting }));

    return { promise: updatePromise };
  },

  manyMorphToMany: async (ctx, { property, association, response }) => {
    return await handleMorphRelations(ctx, {
      refs: property,
      association,
      response,
    });
  },

  manyMorphToOne: async (ctx, { property, association, response }) => {
    return await handleMorphRelations(ctx, {
      refs: property,
      association,
      response,
    });
  },

  oneToManyMorph: async (ctx, { property, association, response }) => {
    return await handleMorphFromModel(ctx, {
      ids: property,
      association,
      response,
    });
  },

  manyToManyMorph: async (ctx, { property, association, response }) => {
    return await handleMorphFromModel(ctx, {
      ids: property,
      association,
      response,
    });
  },

  oneMorphToOne: async () => ({}),
  oneMorphToMany: async () => ({}),
};

/**
 * Handles morph relations where the current model is the source.
 */
const handleMorphRelations = async (ctx, { refs, association, response }) => {
  const relationPromises = [];

  if (Array.isArray(refs) && refs.length === 0) {
    relationPromises.push(
      removeRelationMorph(ctx, {
        params: { id: response[ctx.primaryKey] },
        transacting: ctx.transacting,
      })
    );
    return { promise: Promise.all(relationPromises) };
  }

  for (const obj of refs) {
    const targetModel = strapi.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );

    const reverseAssoc = targetModel.associations.find(
      (assoc) => assoc.alias === obj.field
    );

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
      relationPromises.push(promise);
      continue;
    }

    const addRelation = async () => {
      const maxOrder = await ctx.morph
        .query((qb) => {
          qb.max('order as order').where({
            [`${association.alias}_id`]: obj.refId,
            [`${association.alias}_type`]: targetModel.collectionName,
            field: obj.field,
          });
        })
        .fetch({ transacting: ctx.transacting });

      const { order = 0 } = maxOrder.toJSON();

      await addRelationMorph(ctx, {
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
    };

    relationPromises.push(addRelation());
  }

  return { promise: Promise.all(relationPromises) };
};

/**
 * Handles morph relations where the current model is the target.
 */
const handleMorphFromModel = async (ctx, { ids, association, response }) => {
  const currentValue = transformToArrayID(ids);
  const targetModel = strapi.db.getModel(
    association.collection || association.model,
    association.plugin
  );

  const cleanup = removeRelationMorph(targetModel, {
    params: {
      alias: association.via,
      ref: ctx.collectionName,
      refId: response.id,
      field: association.alias,
    },
    transacting: ctx.transacting,
  });

  const attachPromises = currentValue.map((id, idx) =>
    addRelationMorph(targetModel, {
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
  );

  const promise = cleanup.then(() => Promise.all(attachPromises));
  return { promise };
};

/**
 * Builds the values to patch and collects relation promises.
 */
const buildUpdatePayload = async (ctx, params, response, primaryKeyValue) => {
  const valuesPatch = {};
  const relationPromises = [];

  const keys = Object.keys(removeUndefinedKeys(params.values));

  for (const key of keys) {
    const property = params.values[key];
    const association = ctx.associations.find((a) => a.alias === key);
    const details = ctx._attributes[key];

    if (!association && _.get(details, 'isVirtual') !== true) {
      valuesPatch[key] = property;
      continue;
    }

    const handler = handlers[association.nature];
    if (!handler) {
      continue;
    }

    const result = await handler(ctx, {
      property,
      details,
      association,
      response,
      primaryKeyValue,
    });

    if (result.value !== undefined) {
      valuesPatch[key] = result.value;
    }
    if (result.promise) {
      relationPromises.push(result.promise);
    }
  }

  return { valuesPatch, relationPromises };
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
        .filter((assoc) => ['manyMorphToOne', 'manyMorphToMany'].includes(assoc.nature))
        .map(() =>
          this.morph
            .forge()
            .where({
              [`${this.collectionName}_id`]: getValuePrimaryKey(params, this.primaryKey),
            })
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
    const response = await module.exports.findOne.call(this, params, null, {
      transacting,
    });

    const { valuesPatch, relationPromises } = await buildUpdatePayload(
      this,
      params,
      response,
      primaryKeyValue
    );

    await Promise.all(relationPromises);

    delete valuesPatch[this.primaryKey];
    if (!_.isEmpty(valuesPatch)) {
      await this.forge({
        [this.primaryKey]: primaryKeyValue,
      }).save(valuesPatch, {
        patch: true,
        transacting,
      });
    }

    const result = await this.forge({
      [this.primaryKey]: primaryKeyValue,
    }).fetch({ transacting });

    return result && result.toJSON ? result.toJSON() : result;
  },

  deleteRelations(id, { transacting }) {
    const values = {};

    this.associations.forEach((association) => {
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