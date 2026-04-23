'use strict';

const _ = require('lodash');
const {
  models: { getValuePrimaryKey },
} = require('strapi-utils');

const transformToArrayID = array => {
  if (!_.isArray(array)) {
    return transformToArrayID([array]);
  }
  return array
    .map(value => _.get(value, 'id') || value)
    .filter(n => n)
    .map(val => _.toString(val));
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

const handleOneToOne = async (association, details, response, property, primaryKeyValue, transacting) => {
  if (response[association.alias] === property) return { acc: {}, promise: null };

  if (_.isNull(property)) {
    const updatePromise = strapi.db
      .getModel(details.model || details.collection, details.plugin)
      .where({
        [strapi.db.getModel(details.model || details.collection, details.plugin).primaryKey]:
          getValuePrimaryKey(response[association.alias], strapi.db.getModel(details.model || details.collection, details.plugin).primaryKey),
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
    return { acc: { [association.alias]: null }, promise: updatePromise };
  }

  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
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

  return { acc: { [association.alias]: property }, promise: updateLink };
};

const handleOneToMany = async (association, details, response, property, primaryKeyValue, transacting) => {
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
  const currentIds = response[association.alias];
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

  return { acc: {}, promise: updatePromise };
};

const handleManyToMany = async (association, details, response, property, primaryKeyValue, transacting) => {
  const storedValue = transformToArrayID(response[association.alias]);
  const currentValue = transformToArrayID(property);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = this.forge({
    [this.primaryKey]: primaryKeyValue,
  })[association.alias]();

  const updatePromise = collection
    .detach(toRemove, { transacting })
    .then(() => collection.attach(toAdd, { transacting }));

  return { acc: {}, promise: updatePromise };
};

const handleManyMorphToMany = async (association, details, response, property, primaryKeyValue, transacting) => {
  const refs = property;
  if (Array.isArray(refs) && refs.length === 0) {
    const promise = removeRelationMorph(this, { params: { id: primaryKeyValue }, transacting });
    return { acc: {}, promise };
  }

  const promises = refs.map(async obj => {
    const targetModel = strapi.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );
    const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      const removePromise = removeRelationMorph(this, {
        params: {
          alias: association.alias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
        },
        transacting,
      });

      return removePromise.then(() =>
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
      );
    }

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

    return addRelationMorph(this, {
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
  });

  return { acc: {}, promise: Promise.all(promises) };
};

const handleOneToManyMorph = async (association, details, response, property, primaryKeyValue, transacting) => {
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

  return { acc: {}, promise };
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

    const relationUpdates = [];
    const values = {};

    for (const [key, property] of Object.entries(removeUndefinedKeys(params.values))) {
      const association = this.associations.find(x => x.alias === key);
      const details = this._attributes[key];

      if (!association && _.get(details, 'isVirtual') !== true) {
        values[key] = property;
        continue;
      }

      let handlerResult;
      switch (association.nature) {
        case 'oneWay':
        case 'manyToOne':
          values[key] = _.get(property, strapi.db.getModel(details.model || details.collection, details.plugin).primaryKey, property);
          break;
        case 'oneToOne':
          handlerResult = await handleOneToOne.call(this, association, details, response, property, primaryKeyValue, transacting);
          Object.assign(values, handlerResult.acc);
          if (handlerResult.promise) relationUpdates.push(handlerResult.promise);
          break;
        case 'oneToMany':
          handlerResult = await handleOneToMany.call(this, association, details, response, property, primaryKeyValue, transacting);
          if (handlerResult.promise) relationUpdates.push(handlerResult.promise);
          break;
        case 'manyWay':
        case 'manyToMany':
          handlerResult = await handleManyToMany.call(this, association, details, response, property, primaryKeyValue, transacting);
          if (handlerResult.promise) relationUpdates.push(handlerResult.promise);
          break;
        case 'manyMorphToMany':
        case 'manyMorphToOne':
          handlerResult = await handleManyMorphToMany.call(this, association, details, response, property, primaryKeyValue, transacting);
          if (handlerResult.promise) relationUpdates.push(handlerResult.promise);
          break;
        case 'oneToManyMorph':
        case 'manyToManyMorph':
          handlerResult = await handleOneToManyMorph.call(this, association, details, response, property, primaryKeyValue, transacting);
          if (handlerResult.promise) relationUpdates.push(handlerResult.promise);
          break;
        case 'oneMorphToOne':
        case 'oneMorphToMany':
          // No action needed
          break;
        default:
          break;
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