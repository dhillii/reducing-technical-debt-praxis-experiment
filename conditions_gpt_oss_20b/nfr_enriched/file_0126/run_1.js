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
 * Fetch morph relations for a record when populate is empty.
 *
 * @param {Object} model - The model instance.
 * @param {any} primaryKeyValue - The primary key value.
 * @param {Object} transacting - Transaction context.
 * @returns {Promise<Object[]>} Array of fetched morph relation collections.
 */
const fetchMorphRelations = async (model, primaryKeyValue, transacting) => {
  const morphAssociations = model.associations.filter(association =>
    ['manyMorphToOne', 'manyMorphToMany'].includes(association.nature)
  );

  const promises = morphAssociations.map(() =>
    model.morph
      .forge()
      .where({
        [`${model.collectionName}_id`]: primaryKeyValue,
      })
      .fetchAll({
        transacting,
      })
  );

  return await Promise.all(promises);
};

/**
 * Process a single association update within the update operation.
 *
 * @param {Object} association - The association definition.
 * @param {Object} details - Attribute details.
 * @param {any} property - New value for the association.
 * @param {Object} response - Current record data.
 * @param {any} primaryKeyValue - Primary key of the record being updated.
 * @param {Object} transacting - Transaction context.
 * @param {Array} relationUpdates - Array to collect relation update promises.
 * @param {Object} acc - Accumulator for fields to update.
 * @returns {Object} Updated accumulator.
 */
const processAssociation = async (
  association,
  details,
  property,
  response,
  primaryKeyValue,
  transacting,
  relationUpdates,
  acc
) => {
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  switch (association.nature) {
    case 'oneWay':
    case 'manyToOne':
      return _.set(acc, association.alias, _.get(property, assocModel.primaryKey, property));

    case 'oneToOne': {
      if (response[association.alias] === property) return acc;

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
        return _.set(acc, association.alias, null);
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
          return assocModel
            .where({ [this.primaryKey]: property })
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
      return _.set(acc, association.alias, property);
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
      return acc;
    }

    case 'manyWay':
    case 'manyToMany': {
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

      relationUpdates.push(updatePromise);
      return acc;
    }

    case 'manyMorphToMany':
    case 'manyMorphToOne': {
      const refs = property;

      if (Array.isArray(refs) && refs.length === 0) {
        relationUpdates.push(
          removeRelationMorph(this, { params: { id: primaryKeyValue }, transacting })
        );
        break;
      }

      refs.forEach(obj => {
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

        const addRelation = async () => {
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
        };

        relationUpdates.push(addRelation());
      });
      break;
    }

    case 'oneToManyMorph':
    case 'manyToManyMorph': {
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
      break;
    }

    case 'oneMorphToOne':
    case 'oneMorphToMany':
      // No action required for these natures.
      break;

    default:
      break;
  }

  return acc;
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
      const related = await fetchMorphRelations(this, getValuePrimaryKey(params, this.primaryKey), transacting);

      related.forEach((value, index) => {
        data[this.associations[index].alias] = value ? value.toJSON() : value;
      });
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
          return _.set(acc, current, property);
        }

        const relationUpdates = acc.relationUpdates || [];
        const updatedAcc = await processAssociation(
          association,
          details,
          property,
          response,
          primaryKeyValue,
          transacting,
          relationUpdates,
          acc
        );

        updatedAcc.relationUpdates = relationUpdates;
        return updatedAcc;
      },
      Promise.resolve({ relationUpdates: [] })
    );

    const { relationUpdates, ...updateFields } = values;

    await Promise.all(relationUpdates);

    delete updateFields[this.primaryKey];
    if (!_.isEmpty(updateFields)) {
      await this.forge({
        [this.primaryKey]: getValuePrimaryKey(params, this.primaryKey),
      }).save(updateFields, {
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
    const values = this.associations.reduce((acc, association) => {
      switch (association.nature) {
        case 'oneWay':
        case 'oneToOne':
        case 'manyToOne':
        case 'oneToManyMorph':
          acc[association.alias] = null;
          break;
        case 'manyWay':
        case 'oneToMany':
        case 'manyToMany':
        case 'manyToManyMorph':
        case 'manyMorphToMany':
        case 'manyMorphToOne':
          acc[association.alias] = [];
          break;
        default:
          break;
      }
      return acc;
    }, {});

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};