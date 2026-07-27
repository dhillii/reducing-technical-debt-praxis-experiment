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

const getMaxOrder = async (morph, association, obj, targetModel, transacting) => {
  const maxOrder = await morph
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

const addRelationWithOrder = async (model, association, obj, response, targetModel, transacting) => {
  const order = await getMaxOrder(model.morph, association, obj, targetModel, transacting);

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

const processMorphRef = async (model, association, obj, response, transacting) => {
  const targetModel = strapi.db.getModel(
    obj.ref,
    obj.source !== 'content-manager' ? obj.source : null
  );

  const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

  if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
    return removeRelationMorph(model, {
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
    );
  }

  return addRelationWithOrder(model, association, obj, response, targetModel, transacting);
};

const handleManyMorphRelations = async (model, association, refs, response, transacting) => {
  if (Array.isArray(refs) && refs.length === 0) {
    return removeRelationMorph(model, { params: { id: response[model.primaryKey] }, transacting });
  }

  const promises = refs.map(obj => processMorphRef(model, association, obj, response, transacting));
  return Promise.all(promises);
};

const handleOneToManyMorphRelations = async (model, association, currentValue, details, response, transacting) => {
  const relatedModel = strapi.db.getModel(details.collection || details.model, details.plugin);

  return removeRelationMorph(relatedModel, {
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
        return addRelationMorph(relatedModel, {
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

const handleOneWayRelation = (acc, current, property, assocModel) => {
  return _.set(acc, current, _.get(property, assocModel.primaryKey, property));
};

const handleOneToOneRelation = async (acc, current, property, response, details, assocModel, primaryKeyValue, transacting) => {
  if (response[current] === property) return acc;

  if (_.isNull(property)) {
    await assocModel
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
    return _.set(acc, current, null);
  }

  await this.where({ [current]: property })
    .save(
      { [current]: null },
      {
        method: 'update',
        patch: true,
        require: false,
        transacting,
      }
    );

  await assocModel.where({ [this.primaryKey]: property }).save(
    { [details.via]: primaryKeyValue },
    {
      method: 'update',
      patch: true,
      require: false,
      transacting,
    }
  );

  return _.set(acc, current, property);
};

const handleOneToManyRelation = async (acc, current, property, response, details, assocModel, primaryKeyValue, transacting) => {
  const currentIds = response[current];
  const toRemove = _.differenceWith(currentIds, property, (a, b) => {
    return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
  });

  await assocModel
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
    );

  await assocModel
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

  return acc;
};

const handleManyToOneRelation = (acc, current, property, assocModel) => {
  return _.set(acc, current, _.get(property, assocModel.primaryKey, property));
};

const handleManyWayRelation = async (acc, current, property, response, association, primaryKeyValue, transacting) => {
  const storedValue = transformToArrayID(response[current]);
  const currentValue = transformToArrayID(property);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = this.forge({
    [this.primaryKey]: primaryKeyValue,
  })[association.alias]();

  await collection.detach(toRemove, { transacting });
  await collection.attach(toAdd, { transacting });

  return acc;
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

      switch (association.nature) {
        case 'oneWay': {
          return handleOneWayRelation(acc, current, property, assocModel);
        }
        case 'oneToOne': {
          relationUpdates.push(
            handleOneToOneRelation.call(this, acc, current, property, response, details, assocModel, primaryKeyValue, transacting)
          );
          return acc;
        }
        case 'oneToMany': {
          relationUpdates.push(
            handleOneToManyRelation.call(this, acc, current, property, response, details, assocModel, primaryKeyValue, transacting)
          );
          return acc;
        }
        case 'manyToOne': {
          return handleManyToOneRelation(acc, current, property, assocModel);
        }
        case 'manyWay':
        case 'manyToMany': {
          relationUpdates.push(
            handleManyWayRelation.call(this, acc, current, property, response, association, primaryKeyValue, transacting)
          );
          return acc;
        }
        case 'manyMorphToMany':
        case 'manyMorphToOne': {
          const refs = params.values[current];
          relationUpdates.push(
            handleManyMorphRelations(this, association, refs, response, transacting)
          );
          break;
        }
        case 'oneToManyMorph':
        case 'manyToManyMorph': {
          const currentValue = transformToArrayID(params.values[current]);
          relationUpdates.push(
            handleOneToManyMorphRelations(this, association, currentValue, details, response, transacting)
          );
          break;
        }
        case 'oneMorphToOne':
        case 'oneMorphToMany': {
          break;
        }
        default:
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