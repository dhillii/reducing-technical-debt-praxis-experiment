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
 * Add a morph relation.
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
 * Populate morph relations manually when no populate options are provided.
 *
 * @param {Object} context
 * @param {Object} params
 * @param {Array} associations
 * @param {Object} data
 * @param {Object} transacting
 * @returns {Promise}
 */
const populateMorphRelations = async (context, params, associations, data, transacting) => {
  const arrayOfPromises = associations
    .filter(association => ['manyMorphToOne', 'manyMorphToMany'].includes(association.nature))
    .map(() => {
      return context.morph
        .forge()
        .where({
          [`${context.collectionName}_id`]: getValuePrimaryKey(params, context.primaryKey),
        })
        .fetchAll({
          transacting,
        });
    });

  const related = await Promise.all(arrayOfPromises);

  related.forEach((value, index) => {
    data[associations[index].alias] = value ? value.toJSON() : value;
  });
};

/**
 * Handlers for different association natures.
 */
const natureHandlers = {
  /**
   * Handle oneWay association.
   */
  oneWay: (acc, current, property, association, details, transacting) => {
    return _.set(acc, current, _.get(property, association.model.primaryKey, property));
  },

  /**
   * Handle oneToOne association.
   */
  oneToOne: async (
    acc,
    current,
    property,
    association,
    details,
    response,
    primaryKeyValue,
    transacting,
    relationUpdates
  ) => {
    if (response[current] === property) return acc;

    if (_.isNull(property)) {
      const updatePromise = association.model
        .where({
          [association.model.primaryKey]: getValuePrimaryKey(
            response[current],
            association.model.primaryKey
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
      return _.set(acc, current, null);
    }

    const updateLink = this.where({ [current]: property })
      .save(
        { [current]: null },
        {
          method: 'update',
          patch: true,
          require: false,
          transacting,
        }
      )
      .then(() => {
        return association.model.where({ [this.primaryKey]: property }).save(
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
    return _.set(acc, current, property);
  },

  /**
   * Handle oneToMany association.
   */
  oneToMany: async (
    acc,
    current,
    property,
    association,
    details,
    response,
    primaryKeyValue,
    transacting,
    relationUpdates
  ) => {
    const currentIds = response[current];
    const toRemove = _.differenceWith(currentIds, property, (a, b) => {
      return `${a[association.model.primaryKey] || a}` === `${b[association.model.primaryKey] || b}`;
    });

    const updatePromise = association.model
      .where(
        association.model.primaryKey,
        'in',
        toRemove.map(val => val[association.model.primaryKey] || val)
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
        return association.model
          .where(
            association.model.primaryKey,
            'in',
            property.map(val => val[association.model.primaryKey] || val)
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
  },

  /**
   * Handle manyToOne association.
   */
  manyToOne: (acc, current, property, association, details, transacting) => {
    return _.set(acc, current, _.get(property, association.model.primaryKey, property));
  },

  /**
   * Handle manyWay and manyToMany associations.
   */
  manyWay: async (
    acc,
    current,
    property,
    association,
    details,
    response,
    primaryKeyValue,
    transacting,
    relationUpdates
  ) => {
    const storedValue = transformToArrayID(response[current]);
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
  },

  /**
   * Handle manyMorphToMany and manyMorphToOne associations.
   */
  manyMorph: async (
    acc,
    current,
    property,
    association,
    details,
    response,
    primaryKeyValue,
    transacting,
    relationUpdates
  ) => {
    const refs = property;

    if (Array.isArray(refs) && refs.length === 0) {
      relationUpdates.push(
        removeRelationMorph(this, { params: { id: primaryKeyValue }, transacting })
      );
      return acc;
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

    return acc;
  },

  /**
   * Handle oneToManyMorph and manyToManyMorph associations.
   */
  morphToMany: async (
    acc,
    current,
    property,
    association,
    details,
    response,
    primaryKeyValue,
    transacting,
    relationUpdates
  ) => {
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
    return acc;
  },

  /**
   * Handle oneMorphToOne and oneMorphToMany associations (no-op).
   */
  oneMorph: (acc) => acc,
};

module.exports = {
  /**
   * Find a single record with optional population.
   *
   * @param {Object} params
   * @param {Array} populate
   * @param {Object} options
   * @returns {Promise<Object|null>}
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
      await populateMorphRelations(this, params, this.associations, data, transacting);
    }

    return data;
  },

  /**
   * Update a record and its relations.
   *
   * @param {Object} params
   * @param {Object} options
   * @returns {Promise<Object>}
   */
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

        const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

        const handler = natureHandlers[association.nature];
        if (!handler) return acc;

        const result = await handler(
          acc,
          current,
          property,
          association,
          details,
          response,
          primaryKeyValue,
          transacting,
          relationUpdates
        );

        return result;
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

  /**
   * Delete all relations for a given record.
   *
   * @param {any} id
   * @param {Object} options
   * @returns {Promise}
   */
  deleteRelations(id, { transacting }) {
    const values = {};

    this.associations.forEach(association => {
      const nature = association.nature;
      if (['oneWay', 'oneToOne', 'manyToOne', 'oneToManyMorph'].includes(nature)) {
        values[association.alias] = null;
      } else if (
        [
          'manyWay',
          'oneToMany',
          'manyToMany',
          'manyToManyMorph',
          'manyMorphToMany',
          'manyMorphToOne',
        ].includes(nature)
      ) {
        values[association.alias] = [];
      }
    });

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};