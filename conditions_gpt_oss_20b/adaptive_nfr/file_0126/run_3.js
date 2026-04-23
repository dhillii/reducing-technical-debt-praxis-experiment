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
 * Creates a new morph relation record.
 *
 * @param {Object} model - The model instance.
 * @param {Object} options - Options containing params and transacting.
 * @returns {Promise} The created record.
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
 * Removes a morph relation record.
 *
 * @param {Object} model - The model instance.
 * @param {Object} options - Options containing params and transacting.
 * @returns {Promise} The deletion result.
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
 * Handles one-way associations.
 *
 * @param {Object} self - The model instance.
 * @param {Object} association - The association definition.
 * @param {Object} details - The attribute details.
 * @param {any} property - The new value.
 * @param {any} response - The current record.
 * @param {any} primaryKeyValue - The primary key value.
 * @param {Object} transacting - Transaction context.
 * @param {Array} relationUpdates - Array of relation update promises.
 * @param {Object} acc - Accumulator for updated values.
 * @returns {Object} Updated accumulator.
 */
const handleOneWay = (self, association, details, property, response, primaryKeyValue, transacting, relationUpdates, acc) => {
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
  return _.set(acc, association.alias, _.get(property, assocModel.primaryKey, property));
};

/**
 * Handles one-to-one associations.
 *
 * @param {Object} self - The model instance.
 * @param {Object} association - The association definition.
 * @param {Object} details - The attribute details.
 * @param {any} property - The new value.
 * @param {any} response - The current record.
 * @param {any} primaryKeyValue - The primary key value.
 * @param {Object} transacting - Transaction context.
 * @param {Array} relationUpdates - Array of relation update promises.
 * @param {Object} acc - Accumulator for updated values.
 * @returns {Object} Updated accumulator.
 */
const handleOneToOne = async (self, association, details, property, response, primaryKeyValue, transacting, relationUpdates, acc) => {
  if (response[association.alias] === property) return acc;
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
  if (_.isNull(property)) {
    const updatePromise = assocModel
      .where({
        [assocModel.primaryKey]: getValuePrimaryKey(response[association.alias], assocModel.primaryKey),
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
  const updateLink = self
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
        .where({ [self.primaryKey]: property })
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
};

/**
 * Handles one-to-many associations.
 *
 * @param {Object} self - The model instance.
 * @param {Object} association - The association definition.
 * @param {Object} details - The attribute details.
 * @param {any} property - The new value.
 * @param {any} response - The current record.
 * @param {any} primaryKeyValue - The primary key value.
 * @param {Object} transacting - Transaction context.
 * @param {Array} relationUpdates - Array of relation update promises.
 * @param {Object} acc - Accumulator for updated values.
 * @returns {Object} Updated accumulator.
 */
const handleOneToMany = (self, association, details, property, response, primaryKeyValue, transacting, relationUpdates, acc) => {
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
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
};

/**
 * Handles many-to-one associations.
 *
 * @param {Object} self - The model instance.
 * @param {Object} association - The association definition.
 * @param {Object} details - The attribute details.
 * @param {any} property - The new value.
 * @param {any} response - The current record.
 * @param {any} primaryKeyValue - The primary key value.
 * @param {Object} transacting - Transaction context.
 * @param {Array} relationUpdates - Array of relation update promises.
 * @param {Object} acc - Accumulator for updated values.
 * @returns {Object} Updated accumulator.
 */
const handleManyToOne = (self, association, details, property, response, primaryKeyValue, transacting, relationUpdates, acc) => {
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
  return _.set(acc, association.alias, _.get(property, assocModel.primaryKey, property));
};

/**
 * Handles many-way and many-to-many associations.
 *
 * @param {Object} self - The model instance.
 * @param {Object} association - The association definition.
 * @param {Object} details - The attribute details.
 * @param {any} property - The new value.
 * @param {any} response - The current record.
 * @param {any} primaryKeyValue - The primary key value.
 * @param {Object} transacting - Transaction context.
 * @param {Array} relationUpdates - Array of relation update promises.
 * @param {Object} acc - Accumulator for updated values.
 * @returns {Object} Updated accumulator.
 */
const handleManyWayManyToMany = (self, association, details, property, response, primaryKeyValue, transacting, relationUpdates, acc) => {
  const storedValue = transformToArrayID(response[association.alias]);
  const currentValue = transformToArrayID(property);
  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);
  const collection = self
    .forge({ [self.primaryKey]: primaryKeyValue })
    [association.alias]();
  const updatePromise = collection
    .detach(toRemove, { transacting })
    .then(() => collection.attach(toAdd, { transacting }));
  relationUpdates.push(updatePromise);
  return acc;
};

/**
 * Handles many-morph-to-many and many-morph-to-one associations.
 *
 * @param {Object} self - The model instance.
 * @param {Object} association - The association definition.
 * @param {Object} details - The attribute details.
 * @param {any} property - The new value.
 * @param {any} response - The current record.
 * @param {any} primaryKeyValue - The primary key value.
 * @param {Object} transacting - Transaction context.
 * @param {Array} relationUpdates - Array of relation update promises.
 * @param {Object} acc - Accumulator for updated values.
 * @returns {Object} Updated accumulator.
 */
const handleManyMorphToMany = async (self, association, details, property, response, primaryKeyValue, transacting, relationUpdates, acc) => {
  const refs = property;
  if (Array.isArray(refs) && refs.length === 0) {
    relationUpdates.push(
      removeRelationMorph(self, { params: { id: primaryKeyValue }, transacting })
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
        removeRelationMorph(self, {
          params: {
            alias: association.alias,
            ref: targetModel.collectionName,
            refId: obj.refId,
            field: obj.field,
          },
          transacting,
        }).then(() =>
          addRelationMorph(self, {
            params: {
              id: response[self.primaryKey],
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
      const maxOrder = await self.morph
        .query(qb => {
          qb.max('order as order').where({
            [`${association.alias}_id`]: obj.refId,
            [`${association.alias}_type`]: targetModel.collectionName,
            field: obj.field,
          });
        })
        .fetch({ transacting });
      const { order = 0 } = maxOrder.toJSON();
      await addRelationMorph(self, {
        params: {
          id: response[self.primaryKey],
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
};

/**
 * Handles one-to-many-morph and many-to-many-morph associations.
 *
 * @param {Object} self - The model instance.
 * @param {Object} association - The association definition.
 * @param {Object} details - The attribute details.
 * @param {any} property - The new value.
 * @param {any} response - The current record.
 * @param {any} primaryKeyValue - The primary key value.
 * @param {Object} transacting - Transaction context.
 * @param {Array} relationUpdates - Array of relation update promises.
 * @param {Object} acc - Accumulator for updated values.
 * @returns {Object} Updated accumulator.
 */
const handleOneToManyMorph = async (self, association, details, property, response, primaryKeyValue, transacting, relationUpdates, acc) => {
  const currentValue = transformToArrayID(property);
  const model = strapi.db.getModel(details.collection || details.model, details.plugin);
  const promise = removeRelationMorph(model, {
    params: {
      alias: association.via,
      ref: self.collectionName,
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
            ref: self.collectionName,
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
};

/**
 * No-operation handler for associations that do not require updates.
 *
 * @param {Object} self - The model instance.
 * @param {Object} association - The association definition.
 * @param {Object} details - The attribute details.
 * @param {any} property - The new value.
 * @param {any} response - The current record.
 * @param {any} primaryKeyValue - The primary key value.
 * @param {Object} transacting - Transaction context.
 * @param {Array} relationUpdates - Array of relation update promises.
 * @param {Object} acc - Accumulator for updated values.
 * @returns {Object} Updated accumulator.
 */
const handleNoOp = (self, association, details, property, response, primaryKeyValue, transacting, relationUpdates, acc) => {
  return acc;
};

const associationHandlers = {
  oneWay: handleOneWay,
  oneToOne: handleOneToOne,
  oneToMany: handleOneToMany,
  manyToOne: handleManyToOne,
  manyWay: handleManyWayManyToMany,
  manyToMany: handleManyWayManyToMany,
  manyMorphToMany: handleManyMorphToMany,
  manyMorphToOne: handleManyMorphToMany,
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

      if (!association && _.get(details, 'isVirtual') !== true) {
        return _.set(acc, current, property);
      }

      const handler = associationHandlers[association.nature];
      if (handler) {
        return handler(
          this,
          association,
          details,
          property,
          response,
          primaryKeyValue,
          transacting,
          relationUpdates,
          acc
        );
      }

      return acc;
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

    const deleteActions = {
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

    this.associations.forEach(association => {
      const action = deleteActions[association.nature];
      if (action !== undefined) {
        values[association.alias] = action;
      }
    });

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};