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

const getAssociationUpdates = (model, params, transacting) => {
  const relationUpdates = [];
  const primaryKeyValue = getValuePrimaryKey(params, model.primaryKey);
  const response = module.exports.findOne.call(model, params, null, {
    transacting,
  });

  return response.then(responseData => {
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
          if (responseData[current] === property) return acc;

          if (_.isNull(property)) {
            const updatePromise = assocModel
              .where({
                [assocModel.primaryKey]: getValuePrimaryKey(
                  responseData[current],
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

          // set old relations to null
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

          // set new relation
          relationUpdates.push(updateLink);
          return _.set(acc, current, property);
        }
        case 'oneToMany': {
          // receive array of ids or array of objects with ids

          // set relation to null for all the ids not in the list
          const currentIds = responseData[current];
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
          const storedValue = transformToArrayID(responseData[current]);
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
        // media -> model
        case 'manyMorphToMany':
        case 'manyMorphToOne': {
          // Update the relational array.
          const refs = params.values[current];

          if (Array.isArray(refs) && refs.length === 0) {
            // clear related
            relationUpdates.push(
              removeRelationMorph(model, { params: { id: primaryKeyValue }, transacting })
            );
            break;
          }

          refs.forEach(obj => {
            const targetModel = strapi.db.getModel(
              obj.ref,
              obj.source !== 'content-manager' ? obj.source : null
            );

            const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

            // Remove existing relationship because only one file
            // can be related to this field.
            if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
              relationUpdates.push(
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
                      id: responseData[model.primaryKey],
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
                  id: responseData[model.primaryKey],
                  alias: association.alias,
                  ref: targetModel.collectionName,
                  refId: obj.refId,
                  field: obj.field,
                  order: order + 1,
                },
                transacting,
              });
            };

            relationUpdates.push(addRelation());
          });
          break;
        }
        // model -> media
        case 'oneToManyMorph':
        case 'manyToManyMorph': {
          const currentValue = transformToArrayID(params.values[current]);

          const model = strapi.db.getModel(details.collection || details.model, details.plugin);

          const promise = removeRelationMorph(model, {
            params: {
              alias: association.via,
              ref: model.collectionName,
              refId: responseData.id,
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
                    ref: model.collectionName,
                    refId: responseData.id,
                    field: association.alias,
                    order: idx + 1,
                  },
                  transacting,
                });
              })
            );
          });

          relationUpdates.push(promise);

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

    return Promise.all(relationUpdates).then(() => values);
  });
};

const updateModel = async (model, params, transacting) => {
  const values = await getAssociationUpdates(model, params, transacting);

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

const getRelatedData = async (model, params, populate, transacting) => {
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

    const data = related.reduce((acc, value, index) => {
      acc[model.associations[index].alias] = value ? value.toJSON() : value;
      return acc;
    }, {});

    return data;
  }

  return {};
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

    const relatedData = await getRelatedData(this, params, populate, transacting);

    return { ...data, ...relatedData };
  },

  async update(params, { transacting } = {}) {
    return await updateModel(this, params, transacting);
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