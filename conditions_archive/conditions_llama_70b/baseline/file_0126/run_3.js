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

const getRelatedData = async (model, params, populate, { transacting } = {}) => {
  const record = await model.forge({
    [model.primaryKey]: getValuePrimaryKey(params, model.primaryKey),
  }).fetch({
    transacting,
    withRelated: populate,
  });

  const data = record ? record.toJSON() : record;

  if (_.isEmpty(populate)) {
    const arrayOfPromises = model.associations
      .filter(association => ['manyMorphToOne', 'manyMorphToMany'].includes(association.nature))
      .map(() => {
        return model.morph
          .forge()
          .where({
            [`${model.collectionName}_id`]: getValuePrimaryKey(params, model.primaryKey),
          })
          .fetchAll({
            transacting,
          });
      });

    const related = await Promise.all(arrayOfPromises);

    related.forEach((value, index) => {
      data[model.associations[index].alias] = value ? value.toJSON() : value;
    });
  }

  return data;
};

const updateOneWayRelation = async (model, params, current, association, transacting) => {
  return _.set({}, current, _.get(params.values[current], model.primaryKey, params.values[current]));
};

const updateOneToOneRelation = async (model, params, current, association, transacting) => {
  const response = await getRelatedData(model, params, null, { transacting });
  const details = model._attributes[current];

  if (response[current] === params.values[current]) return {};

  if (_.isNull(params.values[current])) {
    const updatePromise = model
      .where({
        [model.primaryKey]: getValuePrimaryKey(response[current], model.primaryKey),
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

    await updatePromise;
    return _.set({}, current, null);
  }

  const updateLink = model
    .where({ [current]: params.values[current] })
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
      return model.where({ [model.primaryKey]: params.values[current] }).save(
        { [details.via]: getValuePrimaryKey(params, model.primaryKey) },
        {
          method: 'update',
          patch: true,
          require: false,
          transacting,
        }
      );
    });

  await updateLink;
  return _.set({}, current, params.values[current]);
};

const updateOneToManyRelation = async (model, params, current, association, transacting) => {
  const response = await getRelatedData(model, params, null, { transacting });
  const details = model._attributes[current];
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  const currentIds = response[current];
  const toRemove = _.differenceWith(currentIds, params.values[current], (a, b) => {
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
          params.values[current].map(val => val[assocModel.primaryKey] || val)
        )
        .save(
          { [details.via]: getValuePrimaryKey(params, model.primaryKey) },
          {
            method: 'update',
            patch: true,
            require: false,
            transacting,
          }
        );
    });

  await updatePromise;
  return {};
};

const updateManyToManyRelation = async (model, params, current, association, transacting) => {
  const response = await getRelatedData(model, params, null, { transacting });
  const storedValue = transformToArrayID(response[current]);
  const currentValue = transformToArrayID(params.values[current]);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = model.forge({
    [model.primaryKey]: getValuePrimaryKey(params, model.primaryKey),
  })[association.alias]();

  await collection.detach(toRemove, { transacting });
  await collection.attach(toAdd, { transacting });

  return {};
};

const updateManyMorphToManyRelation = async (model, params, current, association, transacting) => {
  const response = await getRelatedData(model, params, null, { transacting });
  const refs = params.values[current];

  if (Array.isArray(refs) && refs.length === 0) {
    await removeRelationMorph(model, { params: { id: getValuePrimaryKey(params, model.primaryKey) }, transacting });
    return {};
  }

  const promises = refs.map(obj => {
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

    return addRelationMorph(model, {
      params: {
        id: response[model.primaryKey],
        alias: association.alias,
        ref: targetModel.collectionName,
        refId: obj.refId,
        field: obj.field,
        order: 1,
      },
      transacting,
    });
  });

  await Promise.all(promises);
  return {};
};

const updateManyMorphToOneRelation = async (model, params, current, association, transacting) => {
  const response = await getRelatedData(model, params, null, { transacting });
  const refs = params.values[current];

  if (Array.isArray(refs) && refs.length === 0) {
    await removeRelationMorph(model, { params: { id: getValuePrimaryKey(params, model.primaryKey) }, transacting });
    return {};
  }

  const promises = refs.map(obj => {
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

    return addRelationMorph(model, {
      params: {
        id: response[model.primaryKey],
        alias: association.alias,
        ref: targetModel.collectionName,
        refId: obj.refId,
        field: obj.field,
        order: 1,
      },
      transacting,
    });
  });

  await Promise.all(promises);
  return {};
};

const updateRelations = async (model, params, { transacting } = {}) => {
  const relationUpdates = [];
  const primaryKeyValue = getValuePrimaryKey(params, model.primaryKey);
  const response = await getRelatedData(model, params, null, { transacting });

  const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, current) => {
    const property = params.values[current];
    const association = model.associations.filter(x => x.alias === current)[0];
    const details = model._attributes[current];

    if (!association && _.get(details, 'isVirtual') !== true) {
      return _.set(acc, current, property);
    }

    switch (association.nature) {
      case 'oneWay':
        return updateOneWayRelation(model, params, current, association, transacting).then(result => _.merge(acc, result));
      case 'oneToOne':
        return updateOneToOneRelation(model, params, current, association, transacting).then(result => _.merge(acc, result));
      case 'oneToMany':
        return updateOneToManyRelation(model, params, current, association, transacting).then(result => _.merge(acc, result));
      case 'manyToOne':
        return updateOneWayRelation(model, params, current, association, transacting).then(result => _.merge(acc, result));
      case 'manyWay':
      case 'manyToMany':
        return updateManyToManyRelation(model, params, current, association, transacting).then(result => _.merge(acc, result));
      case 'manyMorphToMany':
        return updateManyMorphToManyRelation(model, params, current, association, transacting).then(result => _.merge(acc, result));
      case 'manyMorphToOne':
        return updateManyMorphToOneRelation(model, params, current, association, transacting).then(result => _.merge(acc, result));
      default:
        return acc;
    }
  }, {});

  await Promise.all(relationUpdates);

  delete values[model.primaryKey];
  if (!_.isEmpty(values)) {
    await model.forge({
      [model.primaryKey]: getValuePrimaryKey(params, model.primaryKey),
    }).save(values, {
      patch: true,
      transacting,
    });
  }

  const result = await model.forge({
    [model.primaryKey]: getValuePrimaryKey(params, model.primaryKey),
  }).fetch({
    transacting,
  });

  return result && result.toJSON ? result.toJSON() : result;
};

const deleteRelations = async (model, id, { transacting }) => {
  const values = {};

  model.associations.map(association => {
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

  return updateRelations(model, { [model.primaryKey]: id, values }, { transacting });
};

module.exports = {
  async findOne(params, populate, { transacting } = {}) {
    return await getRelatedData(this, params, populate, { transacting });
  },

  async update(params, { transacting } = {}) {
    return await updateRelations(this, params, { transacting });
  },

  deleteRelations,
};
```