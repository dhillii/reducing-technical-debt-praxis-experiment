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

const getMaxOrder = async (model, association, obj, transacting) => {
  // Get the max order for the given association and object
  const maxOrder = await model.morph
    .query(qb => {
      qb.max('order as order').where({
        [`${association.alias}_id`]: obj.refId,
        [`${association.alias}_type`]: obj.ref,
        field: obj.field,
      });
    })
    .fetch({ transacting });

  return maxOrder ? maxOrder.toJSON().order : 0;
};

const addMorphRelation = async (model, association, obj, response, transacting) => {
  // Add a morph relation
  const maxOrder = await getMaxOrder(model, association, obj, transacting);
  await addRelationMorph(model, {
    params: {
      id: response[model.primaryKey],
      alias: association.alias,
      ref: obj.ref,
      refId: obj.refId,
      field: obj.field,
      order: maxOrder + 1,
    },
    transacting,
  });
};

const updateMorphRelations = async (model, association, refs, response, transacting) => {
  // Update morph relations
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

    return addMorphRelation(model, association, obj, response, transacting);
  });

  await Promise.all(promises);
};

const updateOneToOneRelation = async (model, association, property, response, transacting) => {
  // Update one to one relation
  if (response[association.alias] === property) return;

  if (_.isNull(property)) {
    const updatePromise = model
      .where({
        [model.primaryKey]: getValuePrimaryKey(response[association.alias], model.primaryKey),
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

    return updatePromise;
  }

  const updateLink = model
    .where({ [association.alias]: property })
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
      return model.where({ [model.primaryKey]: property }).save(
        { [association.via]: response[model.primaryKey] },
        {
          method: 'update',
          patch: true,
          require: false,
          transacting,
        }
      );
    });

  return updateLink;
};

const updateOneToManyRelation = async (model, association, property, response, transacting) => {
  // Update one to many relation
  const assocModel = strapi.db.getModel(association._attributes.model || association._attributes.collection, association._attributes.plugin);

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
      { [association._attributes.via]: null },
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
          { [association._attributes.via]: response[model.primaryKey] },
          {
            method: 'update',
            patch: true,
            require: false,
            transacting,
          }
        );
    });

  return updatePromise;
};

const updateManyToManyRelation = async (model, association, property, response, transacting) => {
  // Update many to many relation
  const storedValue = transformToArrayID(response[association.alias]);
  const currentValue = transformToArrayID(property);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = model.forge({
    [model.primaryKey]: response[model.primaryKey],
  })[association.alias]();

  const updatePromise = collection
    .detach(toRemove, { transacting })
    .then(() => collection.attach(toAdd, { transacting }));

  return updatePromise;
};

const updateManyMorphRelation = async (model, association, property, response, transacting) => {
  // Update many morph relation
  if (Array.isArray(property) && property.length === 0) {
    // Clear related
    return removeRelationMorph(model, { params: { id: response[model.primaryKey] }, transacting });
  }

  return updateMorphRelations(model, association, property, response, transacting);
};

const updateRelation = async (model, association, property, response, transacting) => {
  // Update relation
  switch (association.nature) {
    case 'oneWay':
      return _.get(property, model.primaryKey, property);
    case 'oneToOne':
      return updateOneToOneRelation(model, association, property, response, transacting);
    case 'oneToMany':
      return updateOneToManyRelation(model, association, property, response, transacting);
    case 'manyToOne':
      return _.get(property, model.primaryKey, property);
    case 'manyWay':
    case 'manyToMany':
      return updateManyToManyRelation(model, association, property, response, transacting);
    case 'manyMorphToMany':
    case 'manyMorphToOne':
      return updateManyMorphRelation(model, association, property, response, transacting);
    default:
      return;
  }
};

const updateRelations = async (model, params, transacting) => {
  // Update relations
  const relationUpdates = [];
  const primaryKeyValue = getValuePrimaryKey(params, model.primaryKey);
  const response = await model.findOne.call(model, params, null, { transacting });

  const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, current) => {
    const property = params.values[current];
    const association = model.associations.filter(x => x.alias === current)[0];
    const details = model._attributes[current];

    if (!association && _.get(details, 'isVirtual') !== true) {
      return _.set(acc, current, property);
    }

    const updatePromise = updateRelation(model, association, property, response, transacting);

    if (updatePromise) {
      relationUpdates.push(updatePromise);
    }

    return acc;
  }, {});

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
    return await updateRelations(this, params, transacting);
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