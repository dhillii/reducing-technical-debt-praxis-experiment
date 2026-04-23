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
 * Convert a value or array of values to an array of string IDs.
 *
 * @param {any} array
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
 *
 * @param {Object} obj
 * @returns {Object}
 */
const removeUndefinedKeys = obj => _.pickBy(obj, _.negate(_.isUndefined));

/**
 * Create a new morph relation record.
 *
 * @param {Object} model
 * @param {Object} options
 * @returns {Promise}
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
 * Remove an existing morph relation record.
 *
 * @param {Object} model
 * @param {Object} options
 * @returns {Promise}
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
 * Fetch morph relations for a record.
 *
 * @param {Object} context
 * @param {any} primaryKeyValue
 * @param {Object} options
 * @returns {Promise<Object[]>}
 */
const fetchMorphRelations = async (context, primaryKeyValue, { transacting } = {}) => {
  const arrayOfPromises = context.associations
    .filter(association => ['manyMorphToOne', 'manyMorphToMany'].includes(association.nature))
    .map(() => {
      return context.morph
        .forge()
        .where({
          [`${context.collectionName}_id`]: primaryKeyValue,
        })
        .fetchAll({
          transacting,
        });
    });

  return await Promise.all(arrayOfPromises);
};

/**
 * Handle manyMorphToMany and manyMorphToOne association updates.
 *
 * @param {Object} context
 * @param {Object} association
 * @param {Object} details
 * @param {Array} refs
 * @param {Object} response
 * @param {Object} options
 * @returns {Promise<void>}
 */
const handleManyMorphAssociations = async (context, association, details, refs, response, { transacting }) => {
  if (Array.isArray(refs) && refs.length === 0) {
    // clear related
    await removeRelationMorph(context, { params: { id: response[context.primaryKey] }, transacting });
    return;
  }

  for (const obj of refs) {
    const targetModel = strapi.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );

    const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      await removeRelationMorph(context, {
        params: {
          alias: association.alias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
        },
        transacting,
      });

      await addRelationMorph(context, {
        params: {
          id: response[context.primaryKey],
          alias: association.alias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
          order: 1,
        },
        transacting,
      });

      continue;
    }

    const maxOrderResult = await context.morph
      .query(qb => {
        qb.max('order as order').where({
          [`${association.alias}_id`]: obj.refId,
          [`${association.alias}_type`]: targetModel.collectionName,
          field: obj.field,
        });
      })
      .fetch({ transacting });

    const { order = 0 } = maxOrderResult.toJSON();

    await addRelationMorph(context, {
      params: {
        id: response[context.primaryKey],
        alias: association.alias,
        ref: targetModel.collectionName,
        refId: obj.refId,
        field: obj.field,
        order: order + 1,
      },
      transacting,
    });
  }
};

/**
 * Handle oneToManyMorph and manyToManyMorph association updates.
 *
 * @param {Object} context
 * @param {Object} association
 * @param {Object} details
 * @param {Array} currentValue
 * @param {Object} response
 * @param {Object} options
 * @returns {Promise<void>}
 */
const handleOneToManyMorphAssociations = async (context, association, details, currentValue, response, { transacting }) => {
  const model = strapi.db.getModel(details.collection || details.model, details.plugin);

  await removeRelationMorph(model, {
    params: {
      alias: association.via,
      ref: context.collectionName,
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
          ref: context.collectionName,
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
 * Build values and relation updates for an update operation.
 *
 * @param {Object} context
 * @param {Object} params
 * @param {Object} options
 * @returns {Promise<{values: Object, relationUpdates: Promise[]}>}
 */
const buildUpdatePayload = async (context, params, { transacting }) => {
  const primaryKeyValue = getValuePrimaryKey(params, context.primaryKey);
  const response = await context.findOne(params, null, { transacting });

  const values = {};
  const relationUpdates = [];

  for (const association of context.associations) {
    const property = params.values[association.alias];
    if (property === undefined) continue;

    const details = context._attributes[association.alias];
    const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

    switch (association.nature) {
      case 'oneWay':
        _.set(values, association.alias, property);
        break;

      case 'oneToOne':
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

        const updateLink = context
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
          .then(() => {
            return assocModel
              .where({ [context.primaryKey]: property })
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

        relationUpdates.push(updateLink);
        _.set(values, association.alias, property);
        break;

      case 'oneToMany':
        const currentIds = response[association.alias];
        const toRemove = _.differenceWith(
          currentIds,
          property,
          (a, b) => `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`
        );

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

        relationUpdates.push(updatePromise);
        break;

      case 'manyToOne':
        _.set(values, association.alias, _.get(property, assocModel.primaryKey, property));
        break;

      case 'manyWay':
      case 'manyToMany':
        const storedValue = transformToArrayID(response[association.alias]);
        const currentValue = transformToArrayID(params.values[association.alias]);

        const toAdd = _.difference(currentValue, storedValue);
        const toRemove = _.difference(storedValue, currentValue);

        const collection = context
          .forge({ [context.primaryKey]: primaryKeyValue })
          [association.alias]();

        const updatePromiseMany = collection
          .detach(toRemove, { transacting })
          .then(() => collection.attach(toAdd, { transacting }));

        relationUpdates.push(updatePromiseMany);
        break;

      case 'manyMorphToMany':
      case 'manyMorphToOne':
        await handleManyMorphAssociations(
          context,
          association,
          details,
          property,
          response,
          { transacting }
        );
        break;

      case 'oneToManyMorph':
      case 'manyToManyMorph':
        const currentValueMorph = transformToArrayID(params.values[association.alias]);
        await handleOneToManyMorphAssociations(
          context,
          association,
          details,
          currentValueMorph,
          response,
          { transacting }
        );
        break;

      case 'oneMorphToOne':
      case 'oneMorphToMany':
        // No action required
        break;

      default:
        break;
    }
  }

  return { values, relationUpdates };
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
      const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
      const related = await fetchMorphRelations(this, primaryKeyValue, { transacting });

      related.forEach((value, index) => {
        data[this.associations[index].alias] = value ? value.toJSON() : value;
      });
    }

    return data;
  },

  async update(params, { transacting } = {}) {
    const { values, relationUpdates } = await buildUpdatePayload(this, params, { transacting });

    await Promise.all(relationUpdates);

    delete values[this.primaryKey];
    if (!_.isEmpty(values)) {
      await this.forge({
        [this.primaryKey]: getValuePrimaryKey(params, this.primaryKey),
      }).save(values, {
        patch: true,
        transacting,
      });
    }

    const result = await this.forge({
      [this.primaryKey]: getValuePrimaryKey(params, this.primaryKey),
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
          break;
      }
    });

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};