```javascript
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

const fetchMorphRelations = async function(populate, params, transacting) {
  if (!_.isEmpty(populate)) {
    return null;
  }

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

  return await Promise.all(arrayOfPromises);
};

const processMorphRelations = function(data, related) {
  related.forEach((value, index) => {
    data[this.associations[index].alias] = value ? value.toJSON() : value;
  });
};

const handleOneWayRelation = (acc, current, property, assocModel, details) => {
  return _.set(acc, current, _.get(property, assocModel.primaryKey, property));
};

const handleOneToOneRelation = async (acc, current, property, response, assocModel, details, primaryKeyValue, transacting) => {
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

    return { acc: _.set(acc, current, null), promise: updatePromise };
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

  return { acc: _.set(acc, current, property), promise: updateLink };
};

const handleOneToManyRelation = (acc, current, property, response, assocModel, details, primaryKeyValue, transacting) => {
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

  return { acc, promise: updatePromise };
};

const handleManyToManyRelation = (acc, current, property, response, association, primaryKeyValue, transacting) => {
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

  return { acc, promise: updatePromise };
};

const getMaxOrder = async (morphModel, aliasId, aliasType, field, transacting) => {
  const maxOrder = await morphModel.morph
    .query(qb => {
      qb.max('order as order').where({
        [`${aliasId}`]: aliasType,
        [`${aliasType}`]: field,
        field: field,
      });
    })
    .fetch({ transacting });

  return maxOrder.toJSON().order || 0;
};

const handleMorphRelationAdd = async (morphModel, obj, association, response, transacting) => {
  const targetModel = strapi.db.getModel(
    obj.ref,
    obj.source !== 'content-manager' ? obj.source : null
  );

  const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

  if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
    return removeRelationMorph(morphModel, {
      params: {
        alias: association.alias,
        ref: targetModel.collectionName,
        refId: obj.refId,
        field: obj.field,
      },
      transacting,
    }).then(() =>
      addRelationMorph(morphModel, {
        params: {
          id: response[morphModel.primaryKey],
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

  const order = await getMaxOrder(morphModel, association.alias, targetModel.collectionName, obj.field, transacting);

  return addRelationMorph(morphModel, {
    params: {
      id: response[morphModel.primaryKey],
      alias: association.alias,
      ref: targetModel.collectionName,
      refId: obj.refId,
      field: obj.field,
      order: order + 1,
    },
    transacting,
  });
};

const handleManyMorphRelation = async (acc, current, params, response, association, details, transacting) => {
  const refs = params[current];

  if (Array.isArray(refs) && refs.length === 0) {
    return { acc, promise: removeRelationMorph(this, { params: { id: response[this.primaryKey] }, transacting }) };
  }

  const promises = refs.map(obj => handleMorphRelationAdd(this, obj, association, response, transacting));

  return { acc, promises };
};

const handleOneToManyMorphRelation = async (acc, current, property, response, association, details, transacting) => {
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

  return { acc, promise };
};

const processAssociationUpdate = async function(acc, current, association, details, response, params, primaryKeyValue, relationUpdates, transacting) {
  const property = params.values[current];

  if (!association && _.get(details, 'isVirtual') !== true) {
    return _.set(acc, current, property);
  }

  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  switch (association.nature) {
    case 'oneWay': {
      return handleOneWayRelation(acc, current, property, assocModel, details);
    }
    case 'oneToOne': {
      const result = await handleOneToOneRelation.call(this, acc, current, property, response, assocModel, details, primaryKeyValue, transacting);
      if (result.promise) relationUpdates.push(result.promise);
      return result.acc;
    }
    case 'oneToMany': {
      const result = handleOneToManyRelation.call(this, acc, current, property, response, assocModel, details, primaryKeyValue, transacting);
      relationUpdates.push(result.promise);
      return result.acc;
    }
    case 'manyToOne': {
      return _.set(acc, current, _.get(property, assocModel.primaryKey, property));
    }
    case 'manyWay':
    case 'manyToMany': {
      const result = handleManyToManyRelation.call(this, acc, current, property, response, association, primaryKeyValue, transacting);
      relationUpdates.push(result.promise);
      return result.acc;
    }
    case 'manyMorphToMany':
    case 'manyMorphToOne': {
      const result = await handleManyMorphRelation.call(this, acc, current, params.values, response, association, details, transacting);
      if (result.promise) relationUpdates.push(result.promise);
      if (result.promises) relationUpdates.push(...result.promises);
      return result.acc;
    }
    case 'oneToManyMorph':
    case 'manyToManyMorph': {
      const result = await handleOneToManyMorphRelation.call(this, acc, current, property, response, association, details, transacting);
      relationUpdates.push(result.promise);
      return result.acc;
    }
    case 'oneMorphToOne':
    case 'oneMorphToMany': {
      return acc;
    }
    default:
      return acc;
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

    const related = await fetchMorphRelations.call(this, populate, params, transacting);
    if (related) {
      processMorphRelations.call(this, data, related);
    }

    return data;
  },

  async update(params, { transacting } = {}) {
    const relationUpdates = [];
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, {
      transacting,
    });

    const values = Object.keys(removeUndefinedKeys(params.values)).reduce(async (accPromise, current) => {
      const acc = await accPromise;
      const association = this.associations.filter(x => x.alias === current)[0];
      const details = this._attributes[current];

      return processAssociationUpdate.call(
        this,
        acc,
        current,
        association,
        details,
        response,
        params,
        primaryKeyValue,
        relationUpdates,
        transacting
      );
    }, Promise.resolve({}));

    await Promise.all(relationUpdates);

    const resolvedValues = await values;
    delete resolvedValues[this.primaryKey];

    if (!_.isEmpty(resolvedValues)) {
      await this.forge({
        [this.primaryKey]: getValuePrimaryKey(params, this.primaryKey),
      }).save(resolvedValues, {
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
```