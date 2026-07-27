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
 * Removes keys with undefined values from an object.
 *
 * @param {Object} obj - The object to clean.
 * @returns {Object} The cleaned object.
 */
const removeUndefinedKeys = obj => _.pickBy(obj, _.negate(_.isUndefined));

/**
 * Adds a relation morph record.
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
 * Removes a relation morph record.
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
 * Adds a relation for manyMorphToMany or manyMorphToOne associations.
 *
 * @param {Object} obj - The reference object.
 * @param {Object} association - The association definition.
 * @param {Object} targetModel - The target model.
 * @param {Object} response - The current record response.
 * @param {Object} model - The current model instance.
 * @param {Object} transacting - The transaction context.
 * @returns {Promise} The promise of the add operation.
 */
const addRelationForManyMorph = async (obj, association, targetModel, response, model, transacting) => {
  const maxOrder = await model.morph
    .query(qb => {
      qb.max('order as order').where({
        [`${association.alias}_id`]: obj.refId,
        [`${association.alias}_type`]: targetModel.collectionName,
        field: obj.field,
      });
    })
    .fetch({ transacting });

  const { order = 0 } = maxOrder.toJSON();

  await addRelationMorph(model, {
    params: {
      id: response[model.primaryKey],
      alias: association.alias,
      ref: targetModel.collectionName,
      refId: obj.refId,
      field: obj.field,
      order: order + 1,
    },
    transacting,
  });
};

/**
 * Handles oneWay associations.
 */
const handleOneWay = (model, association, details, assocModel, params, response, primaryKeyValue, transacting, relationUpdates, acc, current, property) => {
  return _.set(acc, current, _.get(property, assocModel.primaryKey, property));
};

/**
 * Handles manyToOne associations.
 */
const handleManyToOne = (model, association, details, assocModel, params, response, primaryKeyValue, transacting, relationUpdates, acc, current, property) => {
  return _.set(acc, current, _.get(property, assocModel.primaryKey, property));
};

/**
 * Handles oneToOne associations.
 */
const handleOneToOne = (model, association, details, assocModel, params, response, primaryKeyValue, transacting, relationUpdates, acc, current, property) => {
  if (response[current] === property) return acc;

  if (_.isNull(property)) {
    const updatePromise = assocModel
      .where({
        [assocModel.primaryKey]: getValuePrimaryKey(response[current], assocModel.primaryKey),
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

  const updateLink = model
    .where({ [current]: property })
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
      return assocModel
        .where({ [model.primaryKey]: property })
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
  return _.set(acc, current, property);
};

/**
 * Handles oneToMany associations.
 */
const handleOneToMany = (model, association, details, assocModel, params, response, primaryKeyValue, transacting, relationUpdates, acc, current, property) => {
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
};

/**
 * Handles manyWay and manyToMany associations.
 */
const handleManyWayOrManyToMany = (model, association, details, assocModel, params, response, primaryKeyValue, transacting, relationUpdates, acc, current, property) => {
  const storedValue = transformToArrayID(response[current]);
  const currentValue = transformToArrayID(params.values[current]);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = model
    .forge({
      [model.primaryKey]: primaryKeyValue,
    })[association.alias]();

  const updatePromise = collection
    .detach(toRemove, { transacting })
    .then(() => collection.attach(toAdd, { transacting }));

  relationUpdates.push(updatePromise);
  return acc;
};

/**
 * Handles manyMorphToMany and manyMorphToOne associations.
 */
const handleManyMorphToManyOrOne = (model, association, details, assocModel, params, response, primaryKeyValue, transacting, relationUpdates, acc, current, property) => {
  const refs = params.values[current];

  if (Array.isArray(refs) && refs.length === 0) {
    relationUpdates.push(
      removeRelationMorph(model, { params: { id: primaryKeyValue }, transacting })
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
        removeRelationMorph(model, {
          params: {
            alias: association.alias,
            ref: targetModel.collectionName,
            refId: obj.refId,
            field: obj.field,
          },
          transacting,
        }).then(() =>
          addRelationMorph(model, {
            params: {
              id: response[model.primaryKey],
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

    relationUpdates.push(
      addRelationForManyMorph(obj, association, targetModel, response, model, transacting)
    );
  });

  return acc;
};

/**
 * Handles oneToManyMorph and manyToManyMorph associations.
 */
const handleOneToManyMorphOrManyToManyMorph = (model, association, details, assocModel, params, response, primaryKeyValue, transacting, relationUpdates, acc, current, property) => {
  const currentValue = transformToArrayID(params.values[current]);

  const modelToUse = strapi.db.getModel(details.collection || details.model, details.plugin);

  const promise = removeRelationMorph(modelToUse, {
    params: {
      alias: association.via,
      ref: model.collectionName,
      refId: response.id,
      field: association.alias,
    },
    transacting,
  }).then(() => {
    return Promise.all(
      currentValue.map((id, idx) => {
        return addRelationMorph(modelToUse, {
          params: {
            id,
            alias: association.via,
            ref: model.collectionName,
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
 * Handles oneMorphToOne and oneMorphToMany associations (no action).
 */
const handleOneMorphToOne = () => acc => acc;
const handleOneMorphToMany = () => acc => acc;

/**
 * Mapping of association nature to handler functions.
 */
const associationHandlers = {
  oneWay: handleOneWay,
  manyToOne: handleManyToOne,
  oneToOne: handleOneToOne,
  oneToMany: handleOneToMany,
  manyWay: handleManyWayOrManyToMany,
  manyToMany: handleManyWayOrManyToMany,
  manyMorphToMany: handleManyMorphToManyOrOne,
  manyMorphToOne: handleManyMorphToManyOrOne,
  oneToManyMorph: handleOneToManyMorphOrManyToManyMorph,
  manyToManyMorph: handleOneToManyMorphOrManyToManyMorph,
  oneMorphToOne: handleOneMorphToOne,
  oneMorphToMany: handleOneMorphToMany,
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

    // Only update fields which are on this document.
    const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, current) => {
      const property = params.values[current];
      const association = this.associations.filter(x => x.alias === current)[0];
      const details = this._attributes[current];

      if (!association && _.get(details, 'isVirtual') !== true) {
        return _.set(acc, current, property);
      }

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

      const handler = associationHandlers[association.nature];
      if (handler) {
        return handler(
          this,
          association,
          details,
          assocModel,
          params,
          response,
          primaryKeyValue,
          transacting,
          relationUpdates,
          acc,
          current,
          property
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
      }
    });

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};