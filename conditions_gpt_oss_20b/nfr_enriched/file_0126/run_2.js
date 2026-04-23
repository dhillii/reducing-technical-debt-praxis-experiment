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
 * Remove an existing morph relation record.
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
 * Fetch morph relations for a record.
 *
 * @param {Object} model - The model instance.
 * @param {any} id - The primary key value.
 * @param {Object} options - Options containing transacting.
 * @returns {Promise<Array>} Array of fetched morph relations.
 */
const fetchMorphRelations = async (model, id, { transacting } = {}) => {
  const promises = model.associations
    .filter(association => ['manyMorphToOne', 'manyMorphToMany'].includes(association.nature))
    .map(() => {
      return model.morph
        .forge()
        .where({
          [`${model.collectionName}_id`]: getValuePrimaryKey(id, model.primaryKey),
        })
        .fetchAll({
          transacting,
        });
    });

  return await Promise.all(promises);
};

/**
 * Handle a one-way association update.
 *
 * @param {Object} acc - Accumulator object.
 * @param {string} key - Association alias.
 * @param {any} property - New value.
 * @returns {Object} Updated accumulator.
 */
const handleOneWay = (acc, key, property) => _.set(acc, key, property);

/**
 * Handle a one-to-one association update.
 *
 * @param {Object} acc - Accumulator object.
 * @param {string} key - Association alias.
 * @param {any} property - New value.
 * @param {Object} association - Association definition.
 * @param {Object} details - Attribute details.
 * @param {Object} response - Current record data.
 * @param {any} primaryKeyValue - Primary key value.
 * @param {Object} transacting - Transaction object.
 * @param {Array} relationUpdates - Array to push relation promises.
 * @returns {Object} Updated accumulator.
 */
const handleOneToOne = async (
  acc,
  key,
  property,
  association,
  details,
  response,
  primaryKeyValue,
  transacting,
  relationUpdates
) => {
  if (response[key] === property) return acc;

  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

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
    return _.set(acc, key, null);
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
  return _.set(acc, key, property);
};

/**
 * Handle a one-to-many association update.
 *
 * @param {Object} acc - Accumulator object.
 * @param {string} key - Association alias.
 * @param {any} property - New value (array).
 * @param {Object} association - Association definition.
 * @param {Object} details - Attribute details.
 * @param {Object} response - Current record data.
 * @param {any} primaryKeyValue - Primary key value.
 * @param {Object} transacting - Transaction object.
 * @param {Array} relationUpdates - Array to push relation promises.
 * @returns {Object} Updated accumulator.
 */
const handleOneToMany = async (
  acc,
  key,
  property,
  association,
  details,
  response,
  primaryKeyValue,
  transacting,
  relationUpdates
) => {
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  const currentIds = response[key];
  const toRemove = _.differenceWith(
    currentIds,
    property,
    (a, b) => `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`
  );

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
 * Handle a many-to-one association update.
 *
 * @param {Object} acc - Accumulator object.
 * @param {string} key - Association alias.
 * @param {any} property - New value.
 * @param {Object} association - Association definition.
 * @param {Object} details - Attribute details.
 * @param {Object} transacting - Transaction object.
 * @returns {Object} Updated accumulator.
 */
const handleManyToOne = (acc, key, property, association, details, transacting) => {
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
  return _.set(acc, key, _.get(property, assocModel.primaryKey, property));
};

/**
 * Handle many-to-many or many-way association update.
 *
 * @param {Object} acc - Accumulator object.
 * @param {string} key - Association alias.
 * @param {any} property - New value (array).
 * @param {Object} association - Association definition.
 * @param {Object} response - Current record data.
 * @param {Object} transacting - Transaction object.
 * @param {Array} relationUpdates - Array to push relation promises.
 * @returns {Object} Updated accumulator.
 */
const handleManyWayManyToMany = async (
  acc,
  key,
  property,
  association,
  response,
  transacting,
  relationUpdates
) => {
  const storedValue = transformToArrayID(response[key]);
  const currentValue = transformToArrayID(property);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = this.forge({
    [this.primaryKey]: getValuePrimaryKey(this.primaryKey, this.primaryKey),
  })[association.alias]();

  const updatePromise = collection
    .detach(toRemove, { transacting })
    .then(() => collection.attach(toAdd, { transacting }));

  relationUpdates.push(updatePromise);
  return acc;
};

/**
 * Handle many-morph-to-many association update.
 *
 * @param {Object} acc - Accumulator object.
 * @param {string} key - Association alias.
 * @param {Array} refs - Array of reference objects.
 * @param {Object} association - Association definition.
 * @param {Object} response - Current record data.
 * @param {Object} transacting - Transaction object.
 * @param {Array} relationUpdates - Array to push relation promises.
 * @returns {Object} Updated accumulator.
 */
const handleManyMorphToMany = async (
  acc,
  key,
  refs,
  association,
  response,
  transacting,
  relationUpdates
) => {
  if (Array.isArray(refs) && refs.length === 0) {
    relationUpdates.push(
      removeRelationMorph(this, { params: { id: response[this.primaryKey] }, transacting })
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
};

/**
 * Handle many-morph-to-one association update.
 *
 * @param {Object} acc - Accumulator object.
 * @param {string} key - Association alias.
 * @param {Array} refs - Array of reference objects.
 * @param {Object} association - Association definition.
 * @param {Object} response - Current record data.
 * @param {Object} transacting - Transaction object.
 * @param {Array} relationUpdates - Array to push relation promises.
 * @returns {Object} Updated accumulator.
 */
const handleManyMorphToOne = async (
  acc,
  key,
  refs,
  association,
  response,
  transacting,
  relationUpdates
) => {
  // Reuse manyMorphToMany logic as they are identical.
  return await handleManyMorphToMany(acc, key, refs, association, response, transacting, relationUpdates);
};

/**
 * Handle one-to-many-morph association update.
 *
 * @param {Object} acc - Accumulator object.
 * @param {string} key - Association alias.
 * @param {Array} currentValue - Array of IDs.
 * @param {Object} association - Association definition.
 * @param {Object} response - Current record data.
 * @param {Object} transacting - Transaction object.
 * @param {Array} relationUpdates - Array to push relation promises.
 * @returns {Object} Updated accumulator.
 */
const handleOneToManyMorph = async (
  acc,
  key,
  currentValue,
  association,
  response,
  transacting,
  relationUpdates
) => {
  const model = strapi.db.getModel(
    association.via,
    association.plugin
  );

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
};

/**
 * Handle many-to-many-morph association update.
 *
 * @param {Object} acc - Accumulator object.
 * @param {string} key - Association alias.
 * @param {Array} currentValue - Array of IDs.
 * @param {Object} association - Association definition.
 * @param {Object} response - Current record data.
 * @param {Object} transacting - Transaction object.
 * @param {Array} relationUpdates - Array to push relation promises.
 * @returns {Object} Updated accumulator.
 */
const handleManyToManyMorph = async (
  acc,
  key,
  currentValue,
  association,
  response,
  transacting,
  relationUpdates
) => {
  const model = strapi.db.getModel(
    association.via,
    association.plugin
  );

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
};

/**
 * Handle one-morph-to-one or one-morph-to-many associations (no-op).
 *
 * @param {Object} acc - Accumulator object.
 * @returns {Object} Unchanged accumulator.
 */
const handleOneMorph = acc => acc;

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
      const related = await fetchMorphRelations(this, params, { transacting });

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

        const assocModel = strapi.db.getModel(
          details.model || details.collection,
          details.plugin
        );

        switch (association.nature) {
          case 'oneWay':
            return handleOneWay(acc, current, property);

          case 'oneToOne':
            return await handleOneToOne(
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

          case 'oneToMany':
            return await handleOneToMany(
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

          case 'manyToOne':
            return handleManyToOne(acc, current, property, association, details, transacting);

          case 'manyWay':
          case 'manyToMany':
            return await handleManyWayManyToMany(
              acc,
              current,
              property,
              association,
              response,
              transacting,
              relationUpdates
            );

          case 'manyMorphToMany':
          case 'manyMorphToOne':
            return await handleManyMorphToMany(
              acc,
              current,
              property,
              association,
              response,
              transacting,
              relationUpdates
            );

          case 'oneToManyMorph':
            return await handleOneToManyMorph(
              acc,
              current,
              property,
              association,
              response,
              transacting,
              relationUpdates
            );

          case 'manyToManyMorph':
            return await handleManyToManyMorph(
              acc,
              current,
              property,
              association,
              response,
              transacting,
              relationUpdates
            );

          case 'oneMorphToOne':
          case 'oneMorphToMany':
            return handleOneMorph(acc);

          default:
            return acc;
        }
      },
      {}
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