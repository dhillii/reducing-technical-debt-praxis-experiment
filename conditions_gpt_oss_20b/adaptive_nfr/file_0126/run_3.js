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
 * @param {any} array - The value or array of values.
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
 * Create a morph relation entry.
 *
 * @param {Object} model - The model instance.
 * @param {Object} options - Options containing params and transacting.
 * @returns {Promise} Promise resolving to the created morph relation.
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
 * Remove a morph relation entry.
 *
 * @param {Object} model - The model instance.
 * @param {Object} options - Options containing params and transacting.
 * @returns {Promise} Promise resolving to the removed morph relation.
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
 * Default values for each association nature when deleting relations.
 */
const natureDefaultValue = {
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

/**
 * Handlers for each association nature.
 */
const natureHandlers = {
  oneWay(association, property, response, values, relationUpdates, primaryKeyValue, transacting, assocModel, details) {
    values[association.alias] = _.get(property, assocModel.primaryKey, property);
  },

  oneToOne(association, property, response, values, relationUpdates, primaryKeyValue, transacting, assocModel, details) {
    if (response[association.alias] === property) return;

    if (_.isNull(property)) {
      const updatePromise = assocModel.where({
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
      values[association.alias] = null;
      return;
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
    values[association.alias] = property;
  },

  oneToMany(association, property, response, values, relationUpdates, primaryKeyValue, transacting, assocModel, details) {
    const currentIds = response[association.alias];
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
          .where(assocModel.primaryKey, 'in', property.map(val => val[assocModel.primaryKey] || val))
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

  manyToOne(association, property, response, values, relationUpdates, primaryKeyValue, transacting, assocModel, details) {
    values[association.alias] = _.get(property, assocModel.primaryKey, property);
  },

  manyWay(association, property, response, values, relationUpdates, primaryKeyValue, transacting, assocModel, details) {
    const storedValue = transformToArrayID(response[association.alias]);
    const currentValue = transformToArrayID(property);
    const toAdd = _.difference(currentValue, storedValue);
    const toRemove = _.difference(storedValue, currentValue);

    const collection = this.forge({ [this.primaryKey]: primaryKeyValue })[association.alias]();

    const updatePromise = collection
      .detach(toRemove, { transacting })
      .then(() => collection.attach(toAdd, { transacting }));

    relationUpdates.push(updatePromise);
  },

  manyToMany: function (association, property, response, values, relationUpdates, primaryKeyValue, transacting, assocModel, details) {
    // Same logic as manyWay
    this.manyWay(association, property, response, values, relationUpdates, primaryKeyValue, transacting, assocModel, details);
  },

  manyMorphToMany(association, property, response, values, relationUpdates, primaryKeyValue, transacting, assocModel, details) {
    const refs = property;
    if (Array.isArray(refs) && refs.length === 0) {
      relationUpdates.push(removeRelationMorph(this, { params: { id: primaryKeyValue }, transacting }));
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
  },

  manyMorphToOne: function (association, property, response, values, relationUpdates, primaryKeyValue, transacting, assocModel, details) {
    // Same logic as manyMorphToMany
    this.manyMorphToMany(association, property, response, values, relationUpdates, primaryKeyValue, transacting, assocModel, details);
  },

  oneToManyMorph(association, property, response, values, relationUpdates, primaryKeyValue, transacting, assocModel, details) {
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
  },

  manyToManyMorph: function (association, property, response, values, relationUpdates, primaryKeyValue, transacting, assocModel, details) {
    // Same logic as oneToManyMorph
    this.oneToManyMorph(association, property, response, values, relationUpdates, primaryKeyValue, transacting, assocModel, details);
  },

  oneMorphToOne: function () {
    // No operation
  },

  oneMorphToMany: function () {
    // No operation
  },
};

module.exports = {
  /**
   * Find a single record by ID, optionally populating relations.
   *
   * @param {Object} params - Parameters containing the ID.
   * @param {Array|string} populate - Relations to populate.
   * @param {Object} options - Options containing transacting.
   * @returns {Promise<Object|null>} The found record or null.
   */
  async findOne(params, populate, { transacting } = {}) {
    const record = await this.forge({
      [this.primaryKey]: getValuePrimaryKey(params, this.primaryKey),
    }).fetch({
      transacting,
      withRelated: populate,
    });

    const data = record ? record.toJSON() : record;

    // Retrieve data manually for morph relations when no populate is requested.
    if (_.isEmpty(populate)) {
      const morphPromises = this.associations
        .filter(association => ['manyMorphToOne', 'manyMorphToMany'].includes(association.nature))
        .map(() => {
          return this.morph
            .forge()
            .where({
              [`${this.collectionName}_id`]: getValuePrimaryKey(params, this.primaryKey),
            })
            .fetchAll({ transacting });
        });

      const related = await Promise.all(morphPromises);

      related.forEach((value, index) => {
        data[this.associations[index].alias] = value ? value.toJSON() : value;
      });
    }

    return data;
  },

  /**
   * Update a record and its relations.
   *
   * @param {Object} params - Parameters containing the ID and values to update.
   * @param {Object} options - Options containing transacting.
   * @returns {Promise<Object>} The updated record.
   */
  async update(params, { transacting } = {}) {
    const relationUpdates = [];
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, { transacting });

    const values = {};

    for (const current of Object.keys(params.values)) {
      const property = params.values[current];
      const association = this.associations.find(x => x.alias === current);
      const details = this._attributes[current];

      if (!association && _.get(details, 'isVirtual') !== true) {
        values[current] = property;
        continue;
      }

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
      const handler = natureHandlers[association.nature];

      if (handler) {
        await handler.call(
          this,
          association,
          property,
          response,
          values,
          relationUpdates,
          primaryKeyValue,
          transacting,
          assocModel,
          details
        );
      }
    }

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
   * @param {string|number} id - The ID of the record.
   * @param {Object} options - Options containing transacting.
   * @returns {Promise<Object>} The result of the update operation.
   */
  deleteRelations(id, { transacting }) {
    const values = {};

    this.associations.forEach(association => {
      values[association.alias] = natureDefaultValue[association.nature];
    });

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};