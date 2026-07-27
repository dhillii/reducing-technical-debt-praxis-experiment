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

const getMaxOrder = async (model, association, obj, targetModel) => {
  // Get the max order for the given association and object
  const maxOrder = await model.morph
    .query(qb => {
      qb.max('order as order').where({
        [`${association.alias}_id`]: obj.refId,
        [`${association.alias}_type`]: targetModel.collectionName,
        field: obj.field,
      });
    })
    .fetch({ transacting: true });

  return maxOrder ? maxOrder.toJSON().order : 0;
};

const addMorphRelation = async (model, association, obj, targetModel, response) => {
  // Add a morph relation
  const maxOrder = await getMaxOrder(model, association, obj, targetModel);
  await addRelationMorph(model, {
    params: {
      id: response[model.primaryKey],
      alias: association.alias,
      ref: targetModel.collectionName,
      refId: obj.refId,
      field: obj.field,
      order: maxOrder + 1,
    },
    transacting: true,
  });
};

const updateMorphRelations = async (model, association, refs, response) => {
  // Update morph relations
  const relationUpdates = [];

  refs.forEach(obj => {
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
          transacting: true,
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
            transacting: true,
          })
        )
      );
    } else {
      relationUpdates.push(addMorphRelation(model, association, obj, targetModel, response));
    }
  });

  await Promise.all(relationUpdates);
};

const updateManyToManyRelations = async (model, association, property, response) => {
  // Update many to many relations
  const storedValue = transformToArrayID(response[association.alias]);
  const currentValue = transformToArrayID(property);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = model.forge({
    [model.primaryKey]: response[model.primaryKey],
  })[association.alias]();

  await collection.detach(toRemove, { transacting: true });
  await collection.attach(toAdd, { transacting: true });
};

const updateOneToManyRelations = async (model, association, property, response, transacting) => {
  // Update one to many relations
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
          { [association.via]: response[model.primaryKey] },
          {
            method: 'update',
            patch: true,
            require: false,
            transacting,
          }
        );
    });

  await updatePromise;
};

const updateOneToOneRelations = async (model, association, property, response, transacting) => {
  // Update one to one relations
  const assocModel = strapi.db.getModel(association.model || association.collection, association.plugin);

  if (response[association.alias] === property) return;

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

    await updatePromise;
    return;
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
      return assocModel.where({ [model.primaryKey]: property }).save(
        { [association.via]: response[model.primaryKey] },
        {
          method: 'update',
          patch: true,
          require: false,
          transacting,
        }
      );
    });

  await updateLink;
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
    const response = await module.exports.findOne.call(this, params, null, {
      transacting,
    });

    const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, current) => {
      const property = params.values[current];
      const association = this.associations.filter(x => x.alias === current)[0];
      const details = this._attributes[current];

      if (!association && _.get(details, 'isVirtual') !== true) {
        return _.set(acc, current, property);
      }

      switch (association.nature) {
        case 'oneWay': {
          return _.set(acc, current, _.get(property, association.model.primaryKey, property));
        }
        case 'oneToOne': {
          if (response[current] === property) return acc;

          relationUpdates.push(updateOneToOneRelations(this, association, property, response, transacting));
          return _.set(acc, current, property);
        }
        case 'oneToMany': {
          relationUpdates.push(updateOneToManyRelations(this, association, property, response, transacting));
          return acc;
        }
        case 'manyToOne': {
          return _.set(acc, current, _.get(property, association.model.primaryKey, property));
        }
        case 'manyWay':
        case 'manyToMany': {
          relationUpdates.push(updateManyToManyRelations(this, association, property, response));
          return acc;
        }
        case 'manyMorphToMany':
        case 'manyMorphToOne': {
          if (Array.isArray(property) && property.length === 0) {
            relationUpdates.push(
              removeRelationMorph(this, { params: { id: primaryKeyValue }, transacting })
            );
          } else {
            relationUpdates.push(updateMorphRelations(this, association, property, response));
          }
          return acc;
        }
        case 'oneToManyMorph':
        case 'manyToManyMorph': {
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

          relationUpdates.push(promise);
          return acc;
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