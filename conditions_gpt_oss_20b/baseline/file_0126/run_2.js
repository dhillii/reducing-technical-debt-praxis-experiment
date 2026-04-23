'use strict';

const _ = require('lodash');
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

const handleOneToOne = async (association, property, response, primaryKeyValue, values, relationUpdates, transacting) => {
  if (response[association.alias] === property) return;
  const assocModel = strapi.db.getModel(association.model || association.collection, association.plugin);
  if (_.isNull(property)) {
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
    values[association.alias] = null;
    return;
  }
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
  values[association.alias] = property;
};

const handleOneToMany = async (association, property, response, primaryKeyValue, values, relationUpdates, transacting) => {
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

const handleManyToMany = async (association, property, response, primaryKeyValue, values, relationUpdates, transacting) => {
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
  relationUpdates.push(updatePromise);
};

const handleManyMorphToMany = async (association, property, response, primaryKeyValue, values, relationUpdates, transacting) => {
  const refs = property;
  if (Array.isArray(refs) && refs.length === 0) {
    relationUpdates.push(
      removeRelationMorph(this, { params: { id: primaryKeyValue }, transacting })
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
      continue;
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
  }
};

const handleOneToManyMorph = async (association, property, response, primaryKeyValue, values, relationUpdates, transacting) => {
  const currentValue = transformToArrayID(property);
  const model = strapi.db.getModel(association.collection || association.model, association.plugin);
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
};

const processAssociation = async (association, property, response, primaryKeyValue, values, relationUpdates, transacting) => {
  const details = this._attributes[association.alias];
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
  switch (association.nature) {
    case 'oneWay':
    case 'manyToOne':
      values[association.alias] = _.get(property, assocModel.primaryKey, property);
      break;
    case 'oneToOne':
      await handleOneToOne.call(this, association, property, response, primaryKeyValue, values, relationUpdates, transacting);
      break;
    case 'oneToMany':
      await handleOneToMany.call(this, association, property, response, primaryKeyValue, values, relationUpdates, transacting);
      break;
    case 'manyWay':
    case 'manyToMany':
      await handleManyToMany.call(this, association, property, response, primaryKeyValue, values, relationUpdates, transacting);
      break;
    case 'manyMorphToMany':
    case 'manyMorphToOne':
      await handleManyMorphToMany.call(this, association, property, response, primaryKeyValue, values, relationUpdates, transacting);
      break;
    case 'oneToManyMorph':
    case 'manyToManyMorph':
      await handleOneToManyMorph.call(this, association, property, response, primaryKeyValue, values, relationUpdates, transacting);
      break;
    case 'oneMorphToOne':
    case 'oneMorphToMany':
      // No action needed
      break;
    default:
      break;
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
    const relationUpdates = [];
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, { transacting });
    const values = Object.keys(removeUndefinedKeys(params.values)).reduce(async (accPromise, current) => {
      const acc = await accPromise;
      const property = params.values[current];
      const association = this.associations.find(x => x.alias === current);
      if (!association && _.get(this._attributes[current], 'isVirtual') !== true) {
        return _.set(acc, current, property);
      }
      await processAssociation.call(this, association, property, response, primaryKeyValue, acc, relationUpdates, transacting);
      return acc;
    }, Promise.resolve({}));
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