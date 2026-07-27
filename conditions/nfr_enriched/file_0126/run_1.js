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

// Helper: Get max order for morph relation
const getMaxOrderForMorphRelation = async (model, association, obj, targetModel, transacting) => {
  const maxOrder = await model.morph
    .query(qb => {
      qb.max('order as order').where({
        [`${association.alias}_id`]: obj.refId,
        [`${association.alias}_type`]: targetModel.collectionName,
        field: obj.field,
      });
    })
    .fetch({ transacting });

  return maxOrder.toJSON().order || 0;
};

// Helper: Add relation with calculated order
const addRelationWithOrder = async (model, association, obj, targetModel, response, transacting) => {
  const order = await getMaxOrderForMorphRelation(model, association, obj, targetModel, transacting);

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

// Helper: Handle oneToOne relation update
const handleOneToOneRelation = async (current, property, response, details, assocModel, primaryKeyValue, transacting) => {
  if (response[current] === property) return null;

  if (_.isNull(property)) {
    return assocModel
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
  }

  return this.where({ [current]: property })
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
};

// Helper: Handle oneToMany relation update
const handleOneToManyRelation = async (property, response, current, details, assocModel, primaryKeyValue, transacting) => {
  const currentIds = response[current];
  const toRemove = _.differenceWith(currentIds, property, (a, b) => {
    return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
  });

  return assocModel
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
};

// Helper: Handle manyToMany relation update
const handleManyToManyRelation = (association, property, response, primaryKeyValue, transacting) => {
  const storedValue = transformToArrayID(response[association.alias]);
  const currentValue = transformToArrayID(property);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = this.forge({
    [this.primaryKey]: primaryKeyValue,
  })[association.alias]();

  return collection
    .detach(toRemove, { transacting })
    .then(() => collection.attach(toAdd, { transacting }));
};

// Helper: Handle manyMorphToOne/manyMorphToMany relation update
const handleManyMorphRelation = async (model, association, refs, response, transacting) => {
  const relationUpdates = [];
  const primaryKeyValue = response[model.primaryKey];

  if (Array.isArray(refs) && refs.length === 0) {
    return removeRelationMorph(model, { params: { id: primaryKeyValue }, transacting });
  }

  for (const obj of refs) {
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
              id: primaryKeyValue,
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
    } else {
      relationUpdates.push(
        addRelationWithOrder(model, association, obj, targetModel, response, transacting)
      );
    }
  }

  return Promise.all(relationUpdates);
};

// Helper: Handle oneToManyMorph/manyToManyMorph relation update
const handleMorphToManyRelation = async (model, association, details, currentValue, response, transacting) => {
  const targetModel = strapi.db.getModel(details.collection || details.model, details.plugin);

  return removeRelationMorph(targetModel, {
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
        return addRelationMorph(targetModel, {
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
};

// Helper: Process single attribute update
const processAttributeUpdate = async (model, current, property, response, primaryKeyValue, relationUpdates, transacting) => {
  const association = model.associations.filter(x => x.alias === current)[0];
  const details = model._attributes[current];

  if (!association && _.get(details, 'isVirtual') !== true) {
    return { [current]: property };
  }

  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  switch (association.nature) {
    case 'oneWay': {
      return { [current]: _.get(property, assocModel.primaryKey, property) };
    }
    case 'oneToOne': {
      const updatePromise = await handleOneToOneRelation.call(
        model,
        current,
        property,
        response,
        details,
        assocModel,
        primaryKeyValue,
        transacting
      );
      if (updatePromise) relationUpdates.push(updatePromise);
      return { [current]: property };
    }
    case 'oneToMany': {
      const updatePromise = await handleOneToManyRelation(
        property,
        response,
        current,
        details,
        assocModel,
        primaryKeyValue,
        transacting
      );
      relationUpdates.push(updatePromise);
      return {};
    }
    case 'manyToOne': {
      return { [current]: _.get(property, assocModel.primaryKey, property) };
    }
    case 'manyWay':
    case 'manyToMany': {
      const updatePromise = handleManyToManyRelation.call(
        model,
        association,
        property,
        response,
        primaryKeyValue,
        transacting
      );
      relationUpdates.push(updatePromise);
      return {};
    }
    case 'manyMorphToMany':
    case 'manyMorphToOne': {
      const updatePromise = handleManyMorphRelation(
        model,
        association,
        property,
        response,
        transacting
      );
      relationUpdates.push(updatePromise);
      return {};
    }
    case 'oneToManyMorph':
    case 'manyToManyMorph': {
      const currentValue = transformToArrayID(property);
      const updatePromise = handleMorphToManyRelation(
        model,
        association,
        details,
        currentValue,
        response,
        transacting
      );
      relationUpdates.push(updatePromise);
      return {};
    }
    case 'oneMorphToOne':
    case 'oneMorphToMany': {
      return {};
    }
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

      // Process relation updates asynchronously
      processAttributeUpdate(this, current, property, response, primaryKeyValue, relationUpdates, transacting)
        .then(result => {
          Object.assign(acc, result);
        });

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