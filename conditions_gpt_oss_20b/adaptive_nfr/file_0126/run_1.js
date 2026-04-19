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
 * Create a morph relation.
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
 * Remove a morph relation.
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
 * Get the associated model for a given attribute.
 *
 * @param {Object} details
 * @returns {Object}
 */
const getAssocModel = details => {
  return strapi.db.getModel(details.model || details.collection, details.plugin);
};

/**
 * Check if a value is null or undefined.
 *
 * @param {any} value
 * @returns {boolean}
 */
const isNullOrUndefined = value => _.isNil(value);

/**
 * Check if a value is an array.
 *
 * @param {any} value
 * @returns {boolean}
 */
const isArray = value => _.isArray(value);

/**
 * Check if a value is empty.
 *
 * @param {any} value
 * @returns {boolean}
 */
const isEmpty = value => _.isEmpty(value);

/**
 * Handlers for different association natures.
 *
 * @param {Object} context
 * @returns {Object}
 */
const createNatureHandlers = context => {
  const { transacting, primaryKeyValue, response, relationUpdates, values } = context;

  return {
    /**
     * oneWay and manyToOne associations.
     *
     * @param {string} key
     * @param {any} property
     */
    oneWay: ({ key, property }) => {
      values[key] = property;
    },

    /**
     * manyToOne association.
     *
     * @param {string} key
     * @param {any} property
     */
    manyToOne: ({ key, property }) => {
      values[key] = property;
    },

    /**
     * oneToOne association.
     *
     * @param {string} key
     * @param {any} property
     * @param {Object} association
     * @param {Object} details
     * @param {Object} assocModel
     */
    oneToOne: ({ key, property, association, details, assocModel }) => {
      if (response[key] === property) return;

      if (isNullOrUndefined(property)) {
        const updatePromise = assocModel
          .where({
            [assocModel.primaryKey]: getValuePrimaryKey(response[key], assocModel.primaryKey),
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
        values[key] = null;
        return;
      }

      const updateLink = context.this
        .where({ [key]: property })
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
          return assocModel
            .where({ [context.this.primaryKey]: property })
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
      values[key] = property;
    },

    /**
     * oneToMany association.
     *
     * @param {string} key
     * @param {any} property
     * @param {Object} association
     * @param {Object} details
     * @param {Object} assocModel
     */
    oneToMany: ({ key, property, association, details, assocModel }) => {
      const currentIds = response[key];
      const toRemove = _.differenceWith(
        currentIds,
        property,
        (a, b) => `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`
      );

      const updatePromise = assocModel
        .where(assocModel.primaryKey, 'in', toRemove.map(val => val[assocModel.primaryKey] || val))
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
    },

    /**
     * manyWay and manyToMany associations.
     *
     * @param {string} key
     * @param {any} property
     * @param {Object} association
     */
    manyWay: ({ key, property, association }) => {
      const storedValue = transformToArrayID(response[key]);
      const currentValue = transformToArrayID(property);

      const toAdd = _.difference(currentValue, storedValue);
      const toRemove = _.difference(storedValue, currentValue);

      const collection = context.this
        .forge({ [context.this.primaryKey]: primaryKeyValue })
        [association.alias]();

      const updatePromise = collection
        .detach(toRemove, { transacting })
        .then(() => collection.attach(toAdd, { transacting }));

      relationUpdates.push(updatePromise);
    },

    /**
     * manyMorphToMany and manyMorphToOne associations.
     *
     * @param {string} key
     * @param {any} property
     * @param {Object} association
     * @param {Object} details
     */
    manyMorphToMany: ({ key, property, association, details }) => {
      const refs = property;

      if (isArray(refs) && refs.length === 0) {
        relationUpdates.push(
          removeRelationMorph(context.this, { params: { id: primaryKeyValue }, transacting })
        );
        return;
      }

      refs.forEach(obj => {
        const targetModel = strapi.db.getModel(
          obj.ref,
          obj.source !== 'content-manager' ? obj.source : null
        );

        const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

        if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
          relationUpdates.push(
            removeRelationMorph(context.this, {
              params: {
                alias: association.alias,
                ref: targetModel.collectionName,
                refId: obj.refId,
                field: obj.field,
              },
              transacting,
            }).then(() =>
              addRelationMorph(context.this, {
                params: {
                  id: response[context.this.primaryKey],
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
          const maxOrder = await context.this.morph
            .query(qb => {
              qb.max('order as order').where({
                [`${association.alias}_id`]: obj.refId,
                [`${association.alias}_type`]: targetModel.collectionName,
                field: obj.field,
              });
            })
            .fetch({ transacting });

          const { order = 0 } = maxOrder.toJSON();

          await addRelationMorph(context.this, {
            params: {
              id: response[context.this.primaryKey],
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
    },

    /**
     * oneToManyMorph and manyToManyMorph associations.
     *
     * @param {string} key
     * @param {any} property
     * @param {Object} association
     * @param {Object} details
     */
    oneToManyMorph: ({ key, property, association, details }) => {
      const currentValue = transformToArrayID(property);
      const model = strapi.db.getModel(details.collection || details.model, details.plugin);

      const promise = removeRelationMorph(model, {
        params: {
          alias: association.via,
          ref: context.this.collectionName,
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
                ref: context.this.collectionName,
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
    },

    /**
     * oneMorphToOne and oneMorphToMany associations.
     * No operation needed.
     *
     * @param {string} key
     * @param {any} property
     */
    oneMorphToOne: () => {},
    oneMorphToMany: () => {},
  };
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

    // Retrieve data manually.
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
    const relationUpdates = [];
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, {
      transacting,
    });

    const values = {};

    const handlers = createNatureHandlers({
      this: this,
      transacting,
      primaryKeyValue,
      response,
      relationUpdates,
      values,
    });

    Object.entries(params.values).forEach(([key, property]) => {
      const association = this.associations.find(a => a.alias === key);
      const details = this._attributes[key];

      if (!association && details?.isVirtual !== true) {
        values[key] = property;
        return;
      }

      const assocModel = getAssocModel(details);

      const handler = handlers[association.nature];
      if (handler) {
        handler({
          key,
          property,
          association,
          details,
          assocModel,
        });
      }
    });

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

    this.associations.map(association => {
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