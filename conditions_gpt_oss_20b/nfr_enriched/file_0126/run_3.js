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
 * @param {any} array - The value or array to transform.
 * @returns {string[]} Array of string IDs.
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
 * @param {Object} obj - The object to clean.
 * @returns {Object} Cleaned object.
 */
const removeUndefinedKeys = obj => _.pickBy(obj, _.negate(_.isUndefined));

/**
 * Create a new morph relation record.
 *
 * @param {Object} model - The model instance.
 * @param {Object} options - Options containing params and transacting.
 * @returns {Promise} Promise resolving to the created record.
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
 * @param {Object} model - The model instance.
 * @param {Object} options - Options containing params and transacting.
 * @returns {Promise} Promise resolving to the deletion result.
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
 * Fetch morph relations for manyMorphToOne and manyMorphToMany associations.
 *
 * @param {Object} model - The model instance.
 * @param {Array} associations - Array of association objects.
 * @param {Object} params - Parameters containing the primary key.
 * @param {Object} options - Options containing transacting.
 * @returns {Promise<Object>} Promise resolving to an object mapping alias to related data.
 */
const fetchMorphRelations = async (model, associations, params, { transacting } = {}) => {
  const primaryKey = getValuePrimaryKey(params, model.primaryKey);
  const promises = associations
    .filter(association => ['manyMorphToOne', 'manyMorphToMany'].includes(association.nature))
    .map(association =>
      model.morph
        .forge()
        .where({
          [`${model.collectionName}_id`]: primaryKey,
        })
        .fetchAll({ transacting })
    );

  const results = await Promise.all(promises);

  return associations
    .filter(association => ['manyMorphToOne', 'manyMorphToMany'].includes(association.nature))
    .reduce((acc, association, index) => {
      acc[association.alias] = results[index] ? results[index].toJSON() : null;
      return acc;
    }, {});
};

/**
 * Process a single association update.
 *
 * @param {string} key - The association alias.
 * @param {any} property - The new value for the association.
 * @param {Object} association - The association definition.
 * @param {Object} details - The attribute details.
 * @param {Object} response - The current record data.
 * @param {string} primaryKeyValue - The primary key value of the record.
 * @param {Object} transacting - Transaction context.
 * @returns {Promise<{acc: Object, relationUpdates: Array}>} Updated accumulator and relation updates.
 */
const processAssociation = async (
  key,
  property,
  association,
  details,
  response,
  primaryKeyValue,
  transacting
) => {
  const acc = {};
  const relationUpdates = [];
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  switch (association.nature) {
    case 'oneWay':
      acc[key] = property;
      break;

    case 'oneToOne':
      if (response[key] === property) break;

      if (_.isNull(property)) {
        const updatePromise = assocModel
          .where({
            [assocModel.primaryKey]: getValuePrimaryKey(
              response[key],
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
        acc[key] = null;
        break;
      }

      const updateLink = this.where({ [key]: property })
        .save(
          { [key]: null },
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
      acc[key] = property;
      break;

    case 'oneToMany':
      const currentIds = response[key];
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
      acc[key] = _.get(property, assocModel.primaryKey, property);
      break;

    case 'manyWay':
    case 'manyToMany':
      {
        const storedValue = transformToArrayID(response[key]);
        const currentValue = transformToArrayID(property);

        const toAdd = _.difference(currentValue, storedValue);
        const toRemove = _.difference(storedValue, currentValue);

        const collection = this.forge({
          [this.primaryKey]: primaryKeyValue,
        })[association.alias]();

        const updatePromise = collection
          .detach(toRemove, { transacting })
          .then(() => collection.attach(toAdd, { transacting }));

        relationUpdates.push(updatePromise);
      }
      break;

    case 'manyMorphToMany':
    case 'manyMorphToOne':
      {
        const refs = property;

        if (Array.isArray(refs) && refs.length === 0) {
          relationUpdates.push(
            removeRelationMorph(this, { params: { id: primaryKeyValue }, transacting })
          );
          break;
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

          await addRelationMorph(this, {
            params: {
              id: response[this.primaryKey],
              alias: association.alias,
              ref: targetModel.collectionName,
              refId: obj.refId,
              field: obj.field,
              order: order + 1,
            },
            transacting,
          });
        });
      }
      break;

    case 'oneToManyMorph':
    case 'manyToManyMorph':
      {
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

        relationUpdates.push(promise);
      }
      break;

    case 'oneMorphToOne':
    case 'oneMorphToMany':
      // No action required for these natures.
      break;

    default:
      break;
  }

  return { acc, relationUpdates };
};

/**
 * Map associations to default values for deletion.
 *
 * @param {Array} associations - Array of association objects.
 * @returns {Object} Object mapping alias to default value.
 */
const mapAssociationsToValues = associations => {
  const values = {};

  associations.forEach(association => {
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
      const morphData = await fetchMorphRelations(this, this.associations, params, { transacting });
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
          acc[current] = property;
          return acc;
        }

        const { acc: newAcc, relationUpdates } = await processAssociation(
          current,
          property,
          association,
          details,
          response,
          primaryKeyValue,
          transacting
        );

        Object.assign(acc, newAcc);
        relationUpdates.forEach(p => acc.relationUpdates.push(p));

        return acc;
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
    const values = mapAssociationsToValues(this.associations);
    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};