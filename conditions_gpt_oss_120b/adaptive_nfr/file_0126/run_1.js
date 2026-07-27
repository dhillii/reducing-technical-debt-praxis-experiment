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
 * Compute next order value for a morph relation.
 *
 * @param {Object} context - The model instance (`this`).
 * @param {Object} association - Association definition.
 * @param {Object} obj - Reference object containing `refId` and `field`.
 * @param {Object} transacting - Transaction object.
 * @returns {Promise<number>} Next order value.
 */
const computeNextOrder = async (context, association, obj, transacting) => {
  const maxOrder = await context.morph
    .query(qb => {
      qb.max('order as order').where({
        [`${association.alias}_id`]: obj.refId,
        [`${association.alias}_type`]: strapi.db.getModel(
          obj.ref,
          obj.source !== 'content-manager' ? obj.source : null
        ).collectionName,
        field: obj.field,
      });
    })
    .fetch({ transacting });

  const { order = 0 } = maxOrder.toJSON();
  return order + 1;
};

/**
 * Handler for 'oneWay' nature.
 */
const handleOneWay = async function ({ property, assocModel }) {
  return { value: _.get(property, assocModel.primaryKey, property) };
};

/**
 * Handler for 'oneToOne' nature.
 */
const handleOneToOne = async function ({
  property,
  association,
  response,
  primaryKeyValue,
  transacting,
  details,
}) {
  if (response[association.alias] === property) {
    return {};
  }

  if (_.isNull(property)) {
    const updatePromise = strapi.db
      .getModel(details.model || details.collection, details.plugin)
      .where({
        [strapi.db.getModel(details.model || details.collection, details.plugin).primaryKey]: getValuePrimaryKey(
          response[association.alias],
          strapi.db.getModel(details.model || details.collection, details.plugin).primaryKey
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

    return { value: null, promise: updatePromise };
  }

  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
  const updateLink = this.where({ [association.alias]: property })
    .save(
      { [association.alias]: null },
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

  return { value: property, promise: updateLink };
};

/**
 * Handler for 'oneToMany' nature.
 */
const handleOneToMany = async function ({
  property,
  association,
  response,
  primaryKeyValue,
  transacting,
  details,
}) {
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
  const currentIds = response[association.alias] || [];

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

  return { promise: updatePromise };
};

/**
 * Handler for 'manyToOne' nature.
 */
const handleManyToOne = async function ({ property, assocModel }) {
  return { value: _.get(property, assocModel.primaryKey, property) };
};

/**
 * Handler for 'manyWay' and 'manyToMany' natures.
 */
const handleManyWayOrManyToMany = async function ({
  property,
  association,
  response,
  primaryKeyValue,
  transacting,
}) {
  const storedValue = transformToArrayID(response[association.alias]);
  const currentValue = transformToArrayID(property);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = this.forge({
    [this.primaryKey]: primaryKeyValue,
  })[association.alias]();

  const updatePromise = collection
    .detach(toRemove, { transacting })
    .then(() => collection.attach(toAdd, { transacting }));

  return { promise: updatePromise };
};

/**
 * Handler for 'manyMorphToMany' and 'manyMorphToOne' natures.
 */
const handleManyMorph = async function ({
  property,
  association,
  response,
  primaryKeyValue,
  transacting,
}) {
  const refs = property;
  const promises = [];

  if (Array.isArray(refs) && refs.length === 0) {
    promises.push(removeRelationMorph(this, { params: { id: primaryKeyValue }, transacting }));
    return { promise: Promise.all(promises) };
  }

  for (const obj of refs) {
    const targetModel = strapi.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );

    const reverseAssoc = targetModel.associations.find(a => a.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      const p = removeRelationMorph(this, {
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
      );
      promises.push(p);
      continue;
    }

    const p = (async () => {
      const order = await computeNextOrder(this, association, obj, transacting);
      await addRelationMorph(this, {
        params: {
          id: response[this.primaryKey],
          alias: association.alias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
          order,
        },
        transacting,
      });
    })();

    promises.push(p);
  }

  return { promise: Promise.all(promises) };
};

/**
 * Handler for 'oneToManyMorph' and 'manyToManyMorph' natures.
 */
const handleOneToManyMorph = async function ({
  property,
  association,
  response,
  transacting,
  details,
}) {
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

  return { promise };
};

/**
 * No-op handler for 'oneMorphToOne' and 'oneMorphToMany'.
 */
const handleNoOp = async () => ({});

/**
 * Dispatch table for association nature handlers.
 */
const natureHandlers = {
  oneWay: handleOneWay,
  oneToOne: handleOneToOne,
  oneToMany: handleOneToMany,
  manyToOne: handleManyToOne,
  manyWay: handleManyWayOrManyToMany,
  manyToMany: handleManyWayOrManyToMany,
  manyMorphToMany: handleManyMorph,
  manyMorphToOne: handleManyMorph,
  oneToManyMorph: handleOneToManyMorph,
  manyToManyMorph: handleOneToManyMorph,
  oneMorphToOne: handleNoOp,
  oneMorphToMany: handleNoOp,
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
      const arrayOfPromises = this.associations
        .filter(association => ['manyMorphToOne', 'manyMorphToMany'].includes(association.nature))
        .map(() => {
          return this.morph
            .forge()
            .where({
              [`${this.collectionName}_id`]: getValuePrimaryKey(params, this.primaryKey),
            })
            .fetchAll({
              transacting,
            });
        });

      const related = await Promise.all(arrayOfPromises);

      related.forEach((value, index) => {
        data[this.associations[index].alias] = value ? value.toJSON() : value;
      });
    }

    return data;
  },

  async update(params, { transacting } = {}) {
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, {
      transacting,
    });

    const relationUpdates = [];
    const values = {};

    for (const key of Object.keys(params.values)) {
      const property = params.values[key];
      const association = this.associations.find(a => a.alias === key);
      const details = this._attributes[key];

      if (!association && _.get(details, 'isVirtual') !== true) {
        const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
        values[key] = _.get(property, assocModel.primaryKey, property);
        continue;
      }

      const handler = natureHandlers[association.nature];
      if (!handler) {
        continue;
      }

      const result = await handler.call(this, {
        association,
        property,
        response,
        primaryKeyValue,
        transacting,
        details,
      });

      if (result && result.value !== undefined) {
        values[key] = result.value;
      }
      if (result && result.promise) {
        relationUpdates.push(result.promise);
      }
    }

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