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
 * @param {any} array - The value or array of values to transform.
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
 * Remove keys with undefined values from an object.
 *
 * @param {Object} obj - The object to clean.
 * @returns {Object} The cleaned object.
 */
const removeUndefinedKeys = obj => _.pickBy(obj, _.negate(_.isUndefined));

/**
 * Create a new morph relation record.
 *
 * @param {Object} model - The model instance.
 * @param {Object} options - Options for the relation.
 * @param {Object} options.params - Parameters for the relation.
 * @param {Object} [options.transacting] - Transaction context.
 * @returns {Promise} The created relation.
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
 * @param {Object} options - Options for the relation.
 * @param {Object} options.params - Parameters for the relation.
 * @param {Object} [options.transacting] - Transaction context.
 * @returns {Promise} The removal operation.
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
 * Retrieve the maximum order value for a morph relation.
 *
 * @param {Object} self - The current model instance.
 * @param {Object} association - The association definition.
 * @param {Object} obj - The reference object.
 * @param {Object} transacting - Transaction context.
 * @returns {Promise<number>} The maximum order value.
 */
const getMaxMorphOrder = async (self, association, obj, transacting) => {
  const maxOrder = await self.morph
    .query(qb => {
      qb.max('order as order').where({
        [`${association.alias}_id`]: obj.refId,
        [`${association.alias}_type`]: obj.ref,
        field: obj.field,
      });
    })
    .fetch({ transacting });

  const { order = 0 } = maxOrder.toJSON();
  return order;
};

/**
 * Handle manyMorphToMany and manyMorphToOne association updates.
 *
 * @param {Object} self - The current model instance.
 * @param {Object} association - The association definition.
 * @param {Object} obj - The reference object.
 * @param {Object} response - The current record data.
 * @param {Object} transacting - Transaction context.
 * @returns {Promise} The relation update promise.
 */
const handleManyMorphRelation = async (self, association, obj, response, transacting) => {
  const maxOrder = await getMaxMorphOrder(self, association, obj, transacting);
  await addRelationMorph(self, {
    params: {
      id: response[self.primaryKey],
      alias: association.alias,
      ref: obj.ref,
      refId: obj.refId,
      field: obj.field,
      order: maxOrder + 1,
    },
    transacting,
  });
};

/**
 * Handle oneToOne association updates.
 *
 * @param {Object} self - The current model instance.
 * @param {Object} association - The association definition.
 * @param {any} property - The new value.
 * @param {Object} response - The current record data.
 * @param {string} primaryKeyValue - The primary key value.
 * @param {Object} transacting - Transaction context.
 * @param {Array} relationUpdates - Array to collect relation promises.
 * @returns {any} The updated value for the association.
 */
const handleOneToOne = (self, association, property, response, primaryKeyValue, transacting, relationUpdates) => {
  if (response[association.alias] === property) return response[association.alias];

  if (_.isNull(property)) {
    const assocModel = strapi.db.getModel(association.model || association.collection, association.plugin);
    const updatePromise = assocModel
      .where({
        [assocModel.primaryKey]: getValuePrimaryKey(
          response[association.alias],
          assocModel.primaryKey
        ),
      })
      .save(
        { [association.via]: null },
        {
          method: 'update',
          patch: true,
          require: false,
          transacting,
        }
      );

    relationUpdates.push(updatePromise);
    return null;
  }

  const assocModel = strapi.db.getModel(association.model || association.collection, association.plugin);
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
          { [association.via]: primaryKeyValue },
          {
            method: 'update',
            patch: true,
            require: false,
            transacting,
          }
        );
    });

  relationUpdates.push(updateLink);
  return property;
};

/**
 * Handle oneToMany association updates.
 *
 * @param {Object} self - The current model instance.
 * @param {Object} association - The association definition.
 * @param {Array} property - The new array of values.
 * @param {Object} response - The current record data.
 * @param {string} primaryKeyValue - The primary key value.
 * @param {Object} transacting - Transaction context.
 * @param {Array} relationUpdates - Array to collect relation promises.
 */
const handleOneToMany = (self, association, property, response, primaryKeyValue, transacting, relationUpdates) => {
  const assocModel = strapi.db.getModel(association.model || association.collection, association.plugin);
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
      { [association.via]: null },
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
          { [association.via]: primaryKeyValue },
          {
            method: 'update',
            patch: true,
            require: false,
            transacting,
          }
        );
    });

  relationUpdates.push(updatePromise);
};

/**
 * Handle manyToOne association updates.
 *
 * @param {any} property - The new value.
 * @returns {any} The updated value.
 */
const handleManyToOne = property => _.get(property, 'id', property);

/**
 * Handle manyWay and manyToMany association updates.
 *
 * @param {Object} self - The current model instance.
 * @param {Object} association - The association definition.
 * @param {Array} property - The new array of values.
 * @param {Object} response - The current record data.
 * @param {Object} transacting - Transaction context.
 * @param {Array} relationUpdates - Array to collect relation promises.
 */
const handleManyWayOrManyToMany = (self, association, property, response, transacting, relationUpdates) => {
  const storedValue = transformToArrayID(response[association.alias]);
  const currentValue = transformToArrayID(property);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = self
    .forge({ [self.primaryKey]: getValuePrimaryKey(response, self.primaryKey) })
    [association.alias]();

  const updatePromise = collection
    .detach(toRemove, { transacting })
    .then(() => collection.attach(toAdd, { transacting }));

  relationUpdates.push(updatePromise);
};

/**
 * Handle manyMorphToMany and manyMorphToOne association updates.
 *
 * @param {Object} self - The current model instance.
 * @param {Object} association - The association definition.
 * @param {Array} refs - The array of reference objects.
 * @param {Object} response - The current record data.
 * @param {Object} transacting - Transaction context.
 * @param {Array} relationUpdates - Array to collect relation promises.
 */
const handleManyMorphToManyOrOne = async (self, association, refs, response, transacting, relationUpdates) => {
  if (Array.isArray(refs) && refs.length === 0) {
    relationUpdates.push(
      removeRelationMorph(self, { params: { id: response[self.primaryKey] }, transacting })
    );
    return;
  }

  for (const obj of refs) {
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
      continue;
    }

    await handleManyMorphRelation(self, association, obj, response, transacting);
  }
};

/**
 * Handle oneToManyMorph and manyToManyMorph association updates.
 *
 * @param {Object} self - The current model instance.
 * @param {Object} association - The association definition.
 * @param {Array} currentValue - The array of current IDs.
 * @param {Object} response - The current record data.
 * @param {Object} transacting - Transaction context.
 * @param {Array} relationUpdates - Array to collect relation promises.
 */
const handleOneToManyMorphOrManyToManyMorph = (self, association, currentValue, response, transacting, relationUpdates) => {
  const model = strapi.db.getModel(association.collection || association.model, association.plugin);

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

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

      switch (association.nature) {
        case 'oneWay':
          return _.set(acc, current, property);

        case 'oneToOne':
          return _.set(acc, current, handleOneToOne(this, association, property, response, primaryKeyValue, transacting, relationUpdates));

        case 'oneToMany':
          handleOneToMany(this, association, property, response, primaryKeyValue, transacting, relationUpdates);
          return acc;

        case 'manyToOne':
          return _.set(acc, current, handleManyToOne(property));

        case 'manyWay':
        case 'manyToMany':
          handleManyWayOrManyToMany(this, association, property, response, transacting, relationUpdates);
          return acc;

        case 'manyMorphToMany':
        case 'manyMorphToOne':
          handleManyMorphToManyOrOne(this, association, property, response, transacting, relationUpdates);
          return acc;

        case 'oneToManyMorph':
        case 'manyToManyMorph':
          handleOneToManyMorphOrManyToManyMorph(this, association, property, response, transacting, relationUpdates);
          return acc;

        case 'oneMorphToOne':
        case 'oneMorphToMany':
          return acc;

        default:
          return acc;
      }
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