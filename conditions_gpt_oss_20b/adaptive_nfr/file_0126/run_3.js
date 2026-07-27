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
 * Transforms a value or array of values into an array of string IDs.
 *
 * @param {any} array - The value or array to transform.
 * @returns {string[]} An array of string IDs.
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
 * Removes keys with undefined values from an object.
 *
 * @param {Object} obj - The object to clean.
 * @returns {Object} The cleaned object.
 */
const removeUndefinedKeys = obj => _.pickBy(obj, _.negate(_.isUndefined));

/**
 * Adds a relation morph entry.
 *
 * @param {Object} model - The model instance.
 * @param {Object} options - Options containing params and transacting.
 * @returns {Promise} The promise of the save operation.
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
 * Removes a relation morph entry.
 *
 * @param {Object} model - The model instance.
 * @param {Object} options - Options containing params and transacting.
 * @returns {Promise} The promise of the destroy operation.
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
 * Handles association updates based on nature.
 *
 * @param {string} current - The association alias.
 * @param {Object} association - The association definition.
 * @param {any} property - The new value for the association.
 * @param {Object} response - The current record data.
 * @param {any} primaryKeyValue - The primary key value of the record.
 * @param {Object} acc - Accumulator for updated values.
 * @param {Array} relationUpdates - Array of promises for relation updates.
 * @param {Object} transacting - Transaction context.
 * @param {Object} assocModel - The associated model instance.
 * @param {Object} details - Attribute details.
 * @returns {Object} Updated accumulator.
 */
function processAssociation(
  current,
  association,
  property,
  response,
  primaryKeyValue,
  acc,
  relationUpdates,
  transacting,
  details
) {
  if (!association && _.get(details, 'isVirtual') !== true) {
    return _.set(acc, current, property);
  }

  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  const handler = natureHandlers[association.nature];
  if (handler) {
    return handler.call(this, current, association, property, response, primaryKeyValue, acc, relationUpdates, transacting, assocModel, details);
  }

  return acc;
}

/**
 * Handlers for each association nature.
 */
const natureHandlers = {
  oneWay: function (current, association, property, response, primaryKeyValue, acc, relationUpdates, transacting, assocModel, details) {
    return _.set(acc, current, _.get(property, assocModel.primaryKey, property));
  },

  oneToOne: function (current, association, property, response, primaryKeyValue, acc, relationUpdates, transacting, assocModel, details) {
    if (response[current] === property) return acc;

    if (_.isNull(property)) {
      const updatePromise = assocModel
        .where({
          [assocModel.primaryKey]: getValuePrimaryKey(
            response[current],
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
    return _.set(acc, current, property);
  },

  oneToMany: function (current, association, property, response, primaryKeyValue, acc, relationUpdates, transacting, assocModel, details) {
    const currentIds = response[current];
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
  },

  manyToOne: function (current, association, property, response, primaryKeyValue, acc, relationUpdates, transacting, assocModel, details) {
    return _.set(acc, current, _.get(property, assocModel.primaryKey, property));
  },

  manyWay: function (current, association, property, response, primaryKeyValue, acc, relationUpdates, transacting, assocModel, details) {
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

  manyToMany: function (current, association, property, response, primaryKeyValue, acc, relationUpdates, transacting, assocModel, details) {
    // Same logic as manyWay
    return this.natureHandlers.manyWay.call(this, current, association, property, response, primaryKeyValue, acc, relationUpdates, transacting, assocModel, details);
  },

  manyMorphToMany: function (current, association, property, response, primaryKeyValue, acc, relationUpdates, transacting, assocModel, details) {
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

  manyMorphToOne: function (current, association, property, response, primaryKeyValue, acc, relationUpdates, transacting, assocModel, details) {
    // Reuse manyMorphToMany logic
    return this.natureHandlers.manyMorphToMany.call(this, current, association, property, response, primaryKeyValue, acc, relationUpdates, transacting, assocModel, details);
  },

  oneToManyMorph: function (current, association, property, response, primaryKeyValue, acc, relationUpdates, transacting, assocModel, details) {
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

  manyToManyMorph: function (current, association, property, response, primaryKeyValue, acc, relationUpdates, transacting, assocModel, details) {
    // Reuse oneToManyMorph logic
    return this.natureHandlers.oneToManyMorph.call(this, current, association, property, response, primaryKeyValue, acc, relationUpdates, transacting, assocModel, details);
  },

  oneMorphToOne: function () {
    // No operation
    return acc;
  },

  oneMorphToMany: function () {
    // No operation
    return acc;
  },
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

    const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, current) => {
      const property = params.values[current];
      const association = this.associations.find(x => x.alias === current);
      const details = this._attributes[current];

      return processAssociation.call(
        this,
        current,
        association,
        property,
        response,
        primaryKeyValue,
        acc,
        relationUpdates,
        transacting,
        details
      );
    }, {});

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
      const nature = association.nature;
      if (['oneWay', 'oneToOne', 'manyToOne', 'oneToManyMorph'].includes(nature)) {
        values[association.alias] = null;
      } else if (['manyWay', 'oneToMany', 'manyToMany', 'manyToManyMorph', 'manyMorphToMany', 'manyMorphToOne'].includes(nature)) {
        values[association.alias] = [];
      }
    });

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};