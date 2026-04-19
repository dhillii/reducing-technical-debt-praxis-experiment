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
 * @param {Object} model
 * @param {any} primaryKeyValue
 * @param {Object} options
 * @returns {Promise<Object>}
 */
const fetchMorphRelations = async (model, primaryKeyValue, { transacting } = {}) => {
  const arrayOfPromises = model.associations
    .filter(association => ['manyMorphToOne', 'manyMorphToMany'].includes(association.nature))
    .map(() => {
      return model.morph
        .forge()
        .where({
          [`${model.collectionName}_id`]: primaryKeyValue,
        })
        .fetchAll({
          transacting,
        });
    });

  const related = await Promise.all(arrayOfPromises);

  const data = {};

  related.forEach((value, index) => {
    data[model.associations[index].alias] = value ? value.toJSON() : value;
  });

  return data;
};

/**
 * Handle updates for a single association.
 *
 * @param {Object} association
 * @param {Object} details
 * @param {any} property
 * @param {Object} response
 * @param {any} primaryKeyValue
 * @param {Object} options
 * @param {Array} relationUpdates
 * @param {Object} values
 * @returns {Object}
 */
const handleAssociationUpdate = async (
  association,
  details,
  property,
  response,
  primaryKeyValue,
  { transacting },
  relationUpdates,
  values
) => {
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  switch (association.nature) {
    case 'oneWay':
      _.set(values, association.alias, _.get(property, assocModel.primaryKey, property));
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

      relationUpdates.push(updateLink);
      _.set(values, association.alias, property);
      break;

    case 'oneToMany':
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
      break;

    case 'manyToOne':
      _.set(values, association.alias, _.get(property, assocModel.primaryKey, property));
      break;

    case 'manyWay':
    case 'manyToMany':
      const storedValue = transformToArrayID(response[association.alias]);
      const currentValue = transformToArrayID(property);

      const toAdd = _.difference(currentValue, storedValue);
      const toRemove = _.difference(storedValue, currentValue);

      const collection = this.forge({
        [this.primaryKey]: primaryKeyValue,
      })[association.alias]();

      const updatePromiseMany = collection
        .detach(toRemove, { transacting })
        .then(() => collection.attach(toAdd, { transacting }));

      relationUpdates.push(updatePromiseMany);
      break;

    case 'manyMorphToMany':
    case 'manyMorphToOne':
      await handleManyMorphToMany(
        association,
        details,
        property,
        response,
        primaryKeyValue,
        transacting,
        relationUpdates
      );
      break;

    case 'oneToManyMorph':
    case 'manyToManyMorph':
      await handleOneToManyMorph(
        association,
        details,
        property,
        response,
        primaryKeyValue,
        transacting,
        relationUpdates
      );
      break;

    case 'oneMorphToOne':
    case 'oneMorphToMany':
      // No action required
      break;

    default:
      break;
  }

  return values;
};

/**
 * Handle manyMorphToMany and manyMorphToOne updates.
 *
 * @param {Object} association
 * @param {Object} details
 * @param {Array} refs
 * @param {Object} response
 * @param {any} primaryKeyValue
 * @param {any} transacting
 * @param {Array} relationUpdates
 */
const handleManyMorphToMany = async (
  association,
  details,
  refs,
  response,
  primaryKeyValue,
  transacting,
  relationUpdates
) => {
  if (Array.isArray(refs) && refs.length === 0) {
    relationUpdates.push(
      removeRelationMorph(this, { params: { id: primaryKeyValue }, transacting })
    );
    return;
  }

  refs.forEach(async obj => {
    const targetModel = strapi.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );

    const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      relationUpdates.push(
        removeRelationMorph(this, {
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
        )
      );
      return;
    }

    const maxOrder = await this.morph
      .query(qb => {
        qb.max('order as order').where({
          [`${association.alias}_id`]: obj.refId,
          [`${association.alias}_type`]: targetModel.collectionName,
          field: obj.field,
        });
      })
      .fetch({ transacting });

    const { order = 0 } = maxOrder.toJSON();

    relationUpdates.push(
      addRelationMorph(this, {
        params: {
          id: response[this.primaryKey],
          alias: association.alias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
          order: order + 1,
        },
        transacting,
      })
    );
  });
};

/**
 * Handle oneToManyMorph and manyToManyMorph updates.
 *
 * @param {Object} association
 * @param {Object} details
 * @param {Array} currentValue
 * @param {Object} response
 * @param {any} primaryKeyValue
 * @param {any} transacting
 * @param {Array} relationUpdates
 */
const handleOneToManyMorph = async (
  association,
  details,
  currentValue,
  response,
  primaryKeyValue,
  transacting,
  relationUpdates
) => {
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

  relationUpdates.push(promise);
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
      const morphData = await fetchMorphRelations(this, getValuePrimaryKey(params, this.primaryKey), {
        transacting,
      });
      Object.assign(data, morphData);
    }

    return data;
  },

  async update(params, { transacting } = {}) {
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, { transacting });

    const values = Object.keys(removeUndefinedKeys(params.values)).reduce(
      async (accPromise, current) => {
        const acc = await accPromise;
        const property = params.values[current];
        const association = this.associations.find(x => x.alias === current);
        const details = this._attributes[current];

        if (!association && _.get(details, 'isVirtual') !== true) {
          _.set(acc, current, property);
          return acc;
        }

        const relationUpdates = acc.relationUpdates || [];
        const updatedValues = await handleAssociationUpdate(
          association,
          details,
          property,
          response,
          primaryKeyValue,
          { transacting },
          relationUpdates,
          acc
        );

        acc.relationUpdates = relationUpdates;
        return updatedValues;
      },
      Promise.resolve({ relationUpdates: [] })
    );

    await Promise.all(values.relationUpdates);

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