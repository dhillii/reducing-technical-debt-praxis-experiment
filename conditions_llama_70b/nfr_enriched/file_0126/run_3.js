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

  return maxOrder.toJSON().order || 0;
};

const addMorphRelation = async (model, association, obj, transacting) => {
  // Add a morph relation
  const maxOrder = await getMaxOrder(model, association, obj, transacting);
  await addRelationMorph(model, {
    params: {
      id: obj.id,
      alias: association.alias,
      ref: obj.ref,
      refId: obj.refId,
      field: obj.field,
      order: maxOrder + 1,
    },
    transacting,
  });
};

const updateMorphRelations = async (model, association, refs, transacting) => {
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
            id: model.primaryKeyValue,
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

    return addMorphRelation(model, association, obj, transacting);
  });

  await Promise.all(promises);
};

const updateManyToManyMorphRelations = async (model, association, refs, transacting) => {
  // Update many to many morph relations
  const promises = refs.map((id, idx) => {
    return addRelationMorph(model, {
      params: {
        id,
        alias: association.via,
        ref: model.collectionName,
        refId: model.primaryKeyValue,
        field: association.alias,
        order: idx + 1,
      },
      transacting,
    });
  });

  await Promise.all(promises);
};

const updateOneToOneMorphRelations = async (model, association, refs, transacting) => {
  // Update one to one morph relations
  const promises = refs.map((id, idx) => {
    return addRelationMorph(model, {
      params: {
        id,
        alias: association.via,
        ref: model.collectionName,
        refId: model.primaryKeyValue,
        field: association.alias,
        order: idx + 1,
      },
      transacting,
    });
  });

  await Promise.all(promises);
};

const updateRelations = async (model, params, transacting) => {
  // Update relations
  const relationUpdates = [];
  const primaryKeyValue = getValuePrimaryKey(params, model.primaryKey);
  const response = await module.exports.findOne.call(model, params, null, {
    transacting,
  });

  const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, current) => {
    const property = params.values[current];
    const association = model.associations.filter(x => x.alias === current)[0];
    const details = model._attributes[current];

    if (!association && _.get(details, 'isVirtual') !== true) {
      return _.set(acc, current, property);
    }

    const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

    switch (association.nature) {
      case 'oneWay': {
        return _.set(acc, current, _.get(property, assocModel.primaryKey, property));
      }
      case 'oneToOne': {
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

          relationUpdates.push(updatePromise);
          return _.set(acc, current, null);
        }

        const updateLink = model.where({ [current]: property })
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
            return assocModel.where({ [model.primaryKey]: property }).save(
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
      }
      case 'oneToMany': {
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
      }
      case 'manyToOne': {
        return _.set(acc, current, _.get(property, assocModel.primaryKey, property));
      }
      case 'manyWay':
      case 'manyToMany': {
        const storedValue = transformToArrayID(response[current]);
        const currentValue = transformToArrayID(params.values[current]);

        const toAdd = _.difference(currentValue, storedValue);
        const toRemove = _.difference(storedValue, currentValue);

        const collection = model.forge({
          [model.primaryKey]: primaryKeyValue,
        })[association.alias]();

        const updatePromise = collection
          .detach(toRemove, { transacting })
          .then(() => collection.attach(toAdd, { transacting }));

        relationUpdates.push(updatePromise);
        return acc;
      }
      case 'manyMorphToMany':
      case 'manyMorphToOne': {
        const refs = params.values[current];

        if (Array.isArray(refs) && refs.length === 0) {
          relationUpdates.push(
            removeRelationMorph(model, { params: { id: primaryKeyValue }, transacting })
          );
          break;
        }

        await updateMorphRelations(model, association, refs, transacting);
        break;
      }
      case 'oneToManyMorph':
      case 'manyToManyMorph': {
        const currentValue = transformToArrayID(params.values[current]);

        await updateManyToManyMorphRelations(model, association, currentValue, transacting);
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