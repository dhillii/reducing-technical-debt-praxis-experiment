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
 * Create a morph relation record.
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
 * Remove a morph relation record.
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
const fetchMorphRelations = async (context, primaryKeyValue, { transacting }) => {
  const promises = context.associations
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

  return await Promise.all(promises);
};

/**
 * Handle update for a single association.
 *
 * @param {Object} context
 * @param {Object} association
 * @param {Object} details
 * @param {any} property
 * @param {any} response
 * @param {any} primaryKeyValue
 * @param {Object} transacting
 * @param {Array} relationUpdates
 * @returns {Object}
 */
const handleAssociationUpdate = async (
  context,
  association,
  details,
  property,
  response,
  primaryKeyValue,
  transacting,
  relationUpdates
) => {
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  switch (association.nature) {
    case 'oneWay': {
      return _.set({}, association.alias, _.get(property, assocModel.primaryKey, property));
    }

    case 'oneToOne': {
      if (response[association.alias] === property) return {};

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
        return _.set({}, association.alias, null);
      }

      const updateLink = context.where({ [association.alias]: property })
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
          return assocModel.where({ [context.primaryKey]: property }).save(
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
      return _.set({}, association.alias, property);
    }

    case 'oneToMany': {
      const currentIds = response[association.alias];
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

      relationUpdates.push(updatePromise);
      return {};
    }

    case 'manyToOne': {
      return _.set({}, association.alias, _.get(property, assocModel.primaryKey, property));
    }

    case 'manyWay':
    case 'manyToMany': {
      const storedValue = transformToArrayID(response[association.alias]);
      const currentValue = transformToArrayID(property);

      const toAdd = _.difference(currentValue, storedValue);
      const toRemove = _.difference(storedValue, currentValue);

      const collection = context.forge({
        [context.primaryKey]: primaryKeyValue,
      })[association.alias]();

      const updatePromise = collection
        .detach(toRemove, { transacting })
        .then(() => collection.attach(toAdd, { transacting }));

      relationUpdates.push(updatePromise);
      return {};
    }

    case 'manyMorphToMany':
    case 'manyMorphToOne': {
      const refs = property;

      if (Array.isArray(refs) && refs.length === 0) {
        relationUpdates.push(
          removeRelationMorph(context, { params: { id: primaryKeyValue }, transacting })
        );
        return {};
      }

      refs.forEach(async obj => {
        const targetModel = strapi.db.getModel(
          obj.ref,
          obj.source !== 'content-manager' ? obj.source : null
        );

        const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

        if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
          relationUpdates.push(
            removeRelationMorph(context, {
              params: {
                alias: association.alias,
                ref: targetModel.collectionName,
                refId: obj.refId,
                field: obj.field,
              },
              transacting,
            }).then(() =>
              addRelationMorph(context, {
                params: {
                  id: response[context.primaryKey],
                  alias: association.alias,
                  ref: targetModel.collectionName,
                  refId: obj.refId,
                  field: obj.field,
                  order: 1,
                },
                transacting,
              })
            )
          );
          return;
        }

        const maxOrder = await context.morph
          .query(qb => {
            qb.max('order as order').where({
              [`${association.alias}_id`]: obj.refId,
              [`${association.alias}_type`]: targetModel.collectionName,
              field: obj.field,
            });
          })
          .fetch({ transacting });

        const { order = 0 } = maxOrder.toJSON();

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
      });

      return {};
    }

    case 'oneToManyMorph':
    case 'manyToManyMorph': {
      const currentValue = transformToArrayID(property);

      const model = strapi.db.getModel(details.collection || details.model, details.plugin);

      const promise = removeRelationMorph(model, {
        params: {
          alias: association.via,
          ref: context.collectionName,
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
                ref: context.collectionName,
                refId: response.id,
                field: association.alias,
                order: idx + 1,
              },
              transacting,
            });
          })
        );
      });

      relationUpdates.push(promise);
      return {};
    }

    case 'oneMorphToOne':
    case 'oneMorphToMany': {
      return {};
    }

    default:
      return {};
  }
};

/**
 * Build values object for deleteRelations.
 *
 * @param {Object} context
 * @returns {Object}
 */
const buildDeleteValues = context => {
  const values = {};

  context.associations.forEach(association => {
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
      const related = await fetchMorphRelations(this, getValuePrimaryKey(params, this.primaryKey), {
        transacting,
      });

      related.forEach((value, index) => {
        data[this.associations[index].alias] = value ? value.toJSON() : value;
      });
    }

    return data;
  },

  async update(params, { transacting } = {}) {
    const relationUpdates = [];
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, {
      transacting,
    });

    const values = Object.keys(removeUndefinedKeys(params.values)).reduce(
      async (accPromise, current) => {
        const acc = await accPromise;
        const property = params.values[current];
        const association = this.associations.find(x => x.alias === current);
        const details = this._attributes[current];

        if (!association && _.get(details, 'isVirtual') !== true) {
          return _.set(acc, current, property);
        }

        const updated = await handleAssociationUpdate(
          this,
          association,
          details,
          property,
          response,
          primaryKeyValue,
          transacting,
          relationUpdates
        );

        return _.merge(acc, updated);
      },
      Promise.resolve({})
    );

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
    const values = buildDeleteValues(this);
    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};