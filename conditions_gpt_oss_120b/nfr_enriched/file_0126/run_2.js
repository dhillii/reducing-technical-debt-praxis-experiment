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

/**
 * Transform input to array of string IDs.
 */
const transformToArrayID = array => {
  if (_.isArray(array)) {
    return array
      .map(value => _.get(value, 'id') || value)
      .filter(n => n)
      .map(val => _.toString(val));
  }

  return transformToArrayID([array]);
};

/**
 * Remove keys with undefined values.
 */
const removeUndefinedKeys = obj => _.pickBy(obj, _.negate(_.isUndefined));

/**
 * Add a morph relation entry.
 */
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

/**
 * Remove a morph relation entry.
 */
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

/**
 * Compute the next order value for a morph relation.
 */
const computeNextOrder = async (model, association, obj, transacting) => {
  const maxOrderResult = await model.morph
    .query(qb => {
      qb.max('order as order').where({
        [`${association.alias}_id`]: obj.refId,
        [`${association.alias}_type`]: obj.collectionName,
        field: obj.field,
      });
    })
    .fetch({ transacting });

  const { order = 0 } = maxOrderResult ? maxOrderResult.toJSON() : {};
  return order + 1;
};

/**
 * Add a morph relation for a given object, handling order.
 */
const addMorphRelationForObject = async (model, response, association, obj, transacting) => {
  const targetModel = strapi.db.getModel(
    obj.ref,
    obj.source !== 'content-manager' ? obj.source : null
  );

  const nextOrder = await computeNextOrder(model, association, {
    refId: obj.refId,
    collectionName: targetModel.collectionName,
    field: obj.field,
  }, transacting);

  await addRelationMorph(model, {
    params: {
      id: response[model.primaryKey],
      alias: association.alias,
      ref: targetModel.collectionName,
      refId: obj.refId,
      field: obj.field,
      order: nextOrder,
    },
    transacting,
  });
};

/**
 * Handle reverse one-to-many morph relationship.
 */
const handleReverseOneToManyMorph = async (model, association, obj, response, transacting) => {
  const targetModel = strapi.db.getModel(
    obj.ref,
    obj.source !== 'content-manager' ? obj.source : null
  );

  await removeRelationMorph(model, {
    params: {
      alias: association.alias,
      ref: targetModel.collectionName,
      refId: obj.refId,
      field: obj.field,
    },
    transacting,
  });

  await addRelationMorph(model, {
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
};

/**
 * Process manyMorphToMany / manyMorphToOne relations.
 */
const processMorphRelations = async ({
  model,
  response,
  association,
  refs,
  transacting,
}) => {
  const promises = [];

  if (Array.isArray(refs) && refs.length === 0) {
    promises.push(
      removeRelationMorph(model, {
        params: { id: response[model.primaryKey] },
        transacting,
      })
    );
    return promises;
  }

  for (const obj of refs) {
    const targetModel = strapi.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );

    const reverseAssoc = targetModel.associations.find(a => a.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      promises.push(
        handleReverseOneToManyMorph(model, association, obj, response, transacting)
      );
      continue;
    }

    promises.push(
      addMorphRelationForObject(model, response, association, obj, transacting)
    );
  }

  return promises;
};

/**
 * Exported service methods.
 */
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
            .fetchAll({ transacting });
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
      const association = this.associations.find(x => x.alias === current);
      const details = this._attributes[current];

      if (!association && _.get(details, 'isVirtual') !== true) {
        return _.set(acc, current, property);
      }

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

      switch (association.nature) {
        case 'oneWay':
          return _.set(acc, current, _.get(property, assocModel.primaryKey, property));

        case 'oneToOne':
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

          relationUpdates.push(updateLink);
          return _.set(acc, current, property);

        case 'oneToMany':
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

        case 'manyToOne':
          return _.set(acc, current, _.get(property, assocModel.primaryKey, property));

        case 'manyWay':
        case 'manyToMany':
          const storedValue = transformToArrayID(response[current]);
          const currentValue = transformToArrayID(params.values[current]);

          const toAdd = _.difference(currentValue, storedValue);
          const toRemove = _.difference(storedValue, currentValue);

          const collection = this.forge({
            [this.primaryKey]: primaryKeyValue,
          })[association.alias]();

          const manyPromise = collection
            .detach(toRemove, { transacting })
            .then(() => collection.attach(toAdd, { transacting }));

          relationUpdates.push(manyPromise);
          return acc;

        case 'manyMorphToMany':
        case 'manyMorphToOne':
          const morphPromises = processMorphRelations({
            model: this,
            response,
            association,
            refs: params.values[current],
            transacting,
          });
          relationUpdates.push(...morphPromises);
          break;

        case 'oneToManyMorph':
        case 'manyToManyMorph':
          const currentValue = transformToArrayID(params.values[current]);

          const model = strapi.db.getModel(details.collection || details.model, details.plugin);

          const morphPromise = removeRelationMorph(model, {
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

          relationUpdates.push(morphPromise);
          break;

        case 'oneMorphToOne':
        case 'oneMorphToMany':
          break;

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
      }
    });

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};