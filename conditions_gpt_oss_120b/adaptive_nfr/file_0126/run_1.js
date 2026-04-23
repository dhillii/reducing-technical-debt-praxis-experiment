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

const transformToArrayID = array => {
  if (_.isArray(array)) {
    return array
      .map(value => _.get(value, 'id') || value)
      .filter(n => n)
      .map(val => _.toString(val));
  }

  return transformToArrayID([array]);
};

const removeUndefinedKeys = obj => _.pickBy(obj, _.negate(_.isUndefined));

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
 * Retrieve the model instance for a given attribute definition.
 * @param {Object} details Attribute definition.
 * @returns {Object} Model instance.
 */
const getAssociatedModel = details => {
  return strapi.db.getModel(details.model || details.collection, details.plugin);
};

/**
 * Handles oneWay association updates.
 * @returns {Object}
 */
const handleOneWay = ({ property, assocModel }) => ({
  value: _.get(property, assocModel.primaryKey, property),
});

/**
 * Handles manyToOne association updates.
 * @returns {Object}
 */
const handleManyToOne = ({ property, assocModel }) => ({
  value: _.get(property, assocModel.primaryKey, property),
});

/**
 * Handles oneToOne association updates.
 * @returns {Object}
 */
const handleOneToOne = async ({
  property,
  response,
  current,
  assocModel,
  details,
  primaryKeyValue,
  transacting,
  context,
}) => {
  if (response[current] === property) {
    return {};
  }

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

    return { value: null, promises: [updatePromise] };
  }

  const updateLink = context
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
      return assocModel.where({ [assocModel.primaryKey]: property }).save(
        { [details.via]: primaryKeyValue },
        {
          method: 'update',
          patch: true,
          require: false,
          transacting,
        }
      );
    });

  return { value: property, promises: [updateLink] };
};

/**
 * Handles oneToMany association updates.
 * @returns {Object}
 */
const handleOneToMany = ({
  property,
  response,
  current,
  assocModel,
  details,
  primaryKeyValue,
  transacting,
}) => {
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

  return { promises: [updatePromise] };
};

/**
 * Handles manyWay and manyToMany association updates.
 * @returns {Object}
 */
const handleManyWayOrManyToMany = ({
  association,
  current,
  response,
  primaryKeyValue,
  transacting,
  context,
}) => {
  const storedValue = transformToArrayID(response[current]);
  const currentValue = transformToArrayID(context.values[current]);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = context.forge({ [context.primaryKey]: primaryKeyValue })[association.alias]();

  const promise = collection.detach(toRemove, { transacting }).then(() => collection.attach(toAdd, { transacting }));

  return { promises: [promise] };
};

/**
 * Handles manyMorphToMany and manyMorphToOne association updates.
 * @returns {Object}
 */
const handleManyMorph = async ({
  association,
  property,
  response,
  primaryKeyValue,
  transacting,
  context,
}) => {
  const promises = [];

  if (Array.isArray(property) && property.length === 0) {
    promises.push(removeRelationMorph(context, { params: { id: primaryKeyValue }, transacting }));
    return { promises };
  }

  for (const obj of property) {
    const targetModel = strapi.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );

    const reverseAssoc = targetModel.associations.find(a => a.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      const p = removeRelationMorph(context, {
        params: {
          alias: association.alias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
        },
        transacting,
      }).then(() =>
        addRelationMorph(context, {
          params: {
            id: response[context.primaryKey],
            alias: association.alias,
            ref: targetModel.collectionName,
            refId: obj.refId,
            field: obj.field,
            order: 1,
          },
          transacting,
        })
      );
      promises.push(p);
      continue;
    }

    const addRelation = async () => {
      const maxOrder = await context.morph.query(qb => {
        qb.max('order as order').where({
          [`${association.alias}_id`]: obj.refId,
          [`${association.alias}_type`]: targetModel.collectionName,
          field: obj.field,
        });
      }).fetch({ transacting });

      const { order = 0 } = maxOrder.toJSON();

      await addRelationMorph(context, {
        params: {
          id: response[context.primaryKey],
          alias: association.alias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
          order: order + 1,
        },
        transacting,
      });
    };

    promises.push(addRelation());
  }

  return { promises };
};

/**
 * Handles oneToManyMorph and manyToManyMorph association updates.
 * @returns {Object}
 */
const handleOneOrManyMorph = ({
  association,
  property,
  response,
  primaryKeyValue,
  transacting,
  context,
}) => {
  const currentValue = transformToArrayID(property);
  const model = getAssociatedModel(context._attributes[association.alias]);

  const promise = removeRelationMorph(model, {
    params: {
      alias: association.via,
      ref: context.collectionName,
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
            ref: context.collectionName,
            refId: response.id,
            field: association.alias,
            order: idx + 1,
          },
          transacting,
        });
      })
    );
  });

  return { promises: [promise] };
};

/**
 * Dispatches association handling based on its nature.
 * @returns {Object}
 */
const dispatchAssociationHandler = async ({
  association,
  property,
  response,
  primaryKeyValue,
  transacting,
  context,
  key,
}) => {
  const details = context._attributes[key];
  const assocModel = getAssociatedModel(details);

  switch (association.nature) {
    case 'oneWay':
      return handleOneWay({ property, assocModel });
    case 'manyToOne':
      return handleManyToOne({ property, assocModel });
    case 'oneToOne':
      return await handleOneToOne({
        property,
        response,
        current: key,
        assocModel,
        details,
        primaryKeyValue,
        transacting,
        context,
      });
    case 'oneToMany':
      return handleOneToMany({
        property,
        response,
        current: key,
        assocModel,
        details,
        primaryKeyValue,
        transacting,
      });
    case 'manyWay':
    case 'manyToMany':
      return handleManyWayOrManyToMany({
        association,
        current: key,
        response,
        primaryKeyValue,
        transacting,
        context,
      });
    case 'manyMorphToMany':
    case 'manyMorphToOne':
      return await handleManyMorph({
        association,
        property,
        response,
        primaryKeyValue,
        transacting,
        context,
      });
    case 'oneToManyMorph':
    case 'manyToManyMorph':
      return handleOneOrManyMorph({
        association,
        property,
        response,
        primaryKeyValue,
        transacting,
        context,
      });
    case 'oneMorphToOne':
    case 'oneMorphToMany':
      return {};
    default:
      return {};
  }
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
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, { transacting });

    const values = {};
    const relationPromises = [];

    for (const [key, property] of Object.entries(params.values || {})) {
      const association = this.associations.find(a => a.alias === key);
      const details = this._attributes[key];

      if (!association && _.get(details, 'isVirtual') !== true) {
        values[key] = property;
        continue;
      }

      const handlerResult = await dispatchAssociationHandler({
        association,
        property,
        response,
        primaryKeyValue,
        transacting,
        context: this,
        key,
      });

      if (handlerResult.value !== undefined) {
        values[key] = handlerResult.value;
      }

      if (handlerResult.promises && handlerResult.promises.length) {
        relationPromises.push(...handlerResult.promises);
      }
    }

    await Promise.all(relationPromises);

    delete values[this.primaryKey];
    if (!_.isEmpty(values)) {
      await this.forge({
        [this.primaryKey]: primaryKeyValue,
      }).save(values, {
        patch: true,
        transacting,
      });
    }

    const result = await this.forge({
      [this.primaryKey]: primaryKeyValue,
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
      }
    });

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};