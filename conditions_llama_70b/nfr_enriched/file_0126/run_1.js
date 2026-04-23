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

const getAssociationUpdates = (model, params, response, transacting) => {
  const relationUpdates = [];
  const primaryKeyValue = getValuePrimaryKey(params, model.primaryKey);
  const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, current) => {
    const property = params.values[current];
    const association = model.associations.filter(x => x.alias === current)[0];
    const details = model._attributes[current];

    if (!association && _.get(details, 'isVirtual') !== true) {
      return _.set(acc, current, property);
    }

    switch (association.nature) {
      case 'oneWay':
        return _.set(acc, current, _.get(property, model.primaryKey, property));
      case 'oneToOne':
        return handleOneToOneAssociation(model, association, details, acc, current, property, primaryKeyValue, transacting);
      case 'oneToMany':
        return handleOneToManyAssociation(model, association, details, acc, current, property, primaryKeyValue, transacting);
      case 'manyToOne':
        return _.set(acc, current, _.get(property, model.primaryKey, property));
      case 'manyWay':
      case 'manyToMany':
        return handleManyToManyAssociation(model, association, acc, current, property, primaryKeyValue, transacting);
      case 'manyMorphToMany':
      case 'manyMorphToOne':
        return handleManyMorphAssociation(model, association, acc, current, property, primaryKeyValue, transacting);
      case 'oneToManyMorph':
      case 'manyToManyMorph':
        return handleMorphAssociation(model, association, details, acc, current, property, primaryKeyValue, transacting);
      default:
        return acc;
    }
  }, {});

  return { values, relationUpdates };
};

const handleOneToOneAssociation = (model, association, details, acc, current, property, primaryKeyValue, transacting) => {
  if (property === null) {
    const updatePromise = model
      .where({
        [model.primaryKey]: getValuePrimaryKey(property, model.primaryKey),
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

    acc.relationUpdates.push(updatePromise);
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
      return model.where({ [model.primaryKey]: property }).save(
        { [details.via]: primaryKeyValue },
        {
          method: 'update',
          patch: true,
          require: false,
          transacting,
        }
      );
    });

  acc.relationUpdates.push(updateLink);
  return _.set(acc, current, property);
};

const handleOneToManyAssociation = (model, association, details, acc, current, property, primaryKeyValue, transacting) => {
  const currentIds = property;
  const toRemove = _.differenceWith(currentIds, property, (a, b) => {
    return `${a[model.primaryKey] || a}` === `${b[model.primaryKey] || b}`;
  });

  const updatePromise = model
    .where(
      model.primaryKey,
      'in',
      toRemove.map(val => val[model.primaryKey] || val)
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
      return model
        .where(
          model.primaryKey,
          'in',
          property.map(val => val[model.primaryKey] || val)
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

  acc.relationUpdates.push(updatePromise);
  return acc;
};

const handleManyToManyAssociation = (model, association, acc, current, property, primaryKeyValue, transacting) => {
  const storedValue = transformToArrayID(property);
  const currentValue = transformToArrayID(property);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = model.forge({
    [model.primaryKey]: primaryKeyValue,
  })[association.alias]();

  const updatePromise = collection
    .detach(toRemove, { transacting })
    .then(() => collection.attach(toAdd, { transacting }));

  acc.relationUpdates.push(updatePromise);
  return acc;
};

const handleManyMorphAssociation = (model, association, acc, current, property, primaryKeyValue, transacting) => {
  const refs = property;

  if (Array.isArray(refs) && refs.length === 0) {
    acc.relationUpdates.push(
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
      acc.relationUpdates.push(
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

      return;
    }

    const addRelation = async () => {
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
          id: primaryKeyValue,
          alias: association.alias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
          order: order + 1,
        },
        transacting,
      });
    };

    acc.relationUpdates.push(addRelation());
  });

  return acc;
};

const handleMorphAssociation = (model, association, details, acc, current, property, primaryKeyValue, transacting) => {
  const currentValue = transformToArrayID(property);

  const modelInstance = strapi.db.getModel(details.collection || details.model, details.plugin);

  const promise = removeRelationMorph(modelInstance, {
    params: {
      alias: association.via,
      ref: model.collectionName,
      refId: primaryKeyValue,
      field: association.alias,
    },
    transacting,
  }).then(() => {
    return Promise.all(
      currentValue.map((id, idx) => {
        return addRelationMorph(modelInstance, {
          params: {
            id,
            alias: association.via,
            ref: model.collectionName,
            refId: primaryKeyValue,
            field: association.alias,
            order: idx + 1,
          },
          transacting,
        });
      })
    );
  });

  acc.relationUpdates.push(promise);

  return acc;
};

const updateModel = async (model, params, transacting) => {
  const primaryKeyValue = getValuePrimaryKey(params, model.primaryKey);
  const response = await model.forge({
    [model.primaryKey]: primaryKeyValue,
  }).fetch({
    transacting,
  });

  const { values, relationUpdates } = getAssociationUpdates(model, params, response, transacting);

  await Promise.all(relationUpdates);

  delete values[model.primaryKey];
  if (!_.isEmpty(values)) {
    await model.forge({
      [model.primaryKey]: primaryKeyValue,
    }).save(values, {
      patch: true,
      transacting,
    });
  }

  const result = await model.forge({
    [model.primaryKey]: primaryKeyValue,
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

  return updateModel(model, { [model.primaryKey]: id, values }, { transacting });
};

const findOne = async (model, params, populate, { transacting } = {}) => {
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

module.exports = {
  async findOne(params, populate, { transacting } = {}) {
    return await findOne(this, params, populate, { transacting });
  },

  async update(params, { transacting } = {}) {
    return await updateModel(this, params, { transacting });
  },

  deleteRelations(id, { transacting }) {
    return deleteRelations(this, id, { transacting });
  },
};