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

const getAssociationUpdateStrategy = (association, response, params, transacting) => {
  switch (association.nature) {
    case 'oneWay':
      return {
        update: () => _.get(params.values[association.alias], response.collectionName + '_id', params.values[association.alias]),
      };
    case 'oneToOne':
      return {
        update: async () => {
          if (response[association.alias] === params.values[association.alias]) return;

          if (_.isNull(params.values[association.alias])) {
            const updatePromise = association.model
              .where({
                [association.model.primaryKey]: getValuePrimaryKey(
                  response[association.alias],
                  association.model.primaryKey
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

            return updatePromise;
          }

          // set old relations to null
          const updateLink = this.where({ [association.alias]: params.values[association.alias] })
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
              return association.model.where({ [this.primaryKey]: params.values[association.alias] }).save(
                { [association.via]: response[this.primaryKey] },
                {
                  method: 'update',
                  patch: true,
                  require: false,
                  transacting,
                }
              );
            });

          return updateLink;
        },
      };
    case 'oneToMany':
      return {
        update: async () => {
          // receive array of ids or array of objects with ids

          // set relation to null for all the ids not in the list
          const currentIds = response[association.alias];
          const toRemove = _.differenceWith(currentIds, params.values[association.alias], (a, b) => {
            return `${a[association.model.primaryKey] || a}` === `${b[association.model.primaryKey] || b}`;
          });

          const updatePromise = association.model
            .where(
              association.model.primaryKey,
              'in',
              toRemove.map(val => val[association.model.primaryKey] || val)
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
              return association.model
                .where(
                  association.model.primaryKey,
                  'in',
                  params.values[association.alias].map(val => val[association.model.primaryKey] || val)
                )
                .save(
                  { [association.via]: response[this.primaryKey] },
                  {
                    method: 'update',
                    patch: true,
                    require: false,
                    transacting,
                  }
                );
            });

          return updatePromise;
        },
      };
    case 'manyToOne':
      return {
        update: () => _.get(params.values[association.alias], association.model.primaryKey, params.values[association.alias]),
      };
    case 'manyWay':
    case 'manyToMany':
      return {
        update: async () => {
          const storedValue = transformToArrayID(response[association.alias]);
          const currentValue = transformToArrayID(params.values[association.alias]);

          const toAdd = _.difference(currentValue, storedValue);
          const toRemove = _.difference(storedValue, currentValue);

          const collection = this.forge({
            [this.primaryKey]: response[this.primaryKey],
          })[association.alias]();

          const updatePromise = collection
            .detach(toRemove, { transacting })
            .then(() => collection.attach(toAdd, { transacting }));

          return updatePromise;
        },
      };
    case 'manyMorphToMany':
    case 'manyMorphToOne':
      return {
        update: async () => {
          // Update the relational array.
          const refs = params.values[association.alias];

          if (Array.isArray(refs) && refs.length === 0) {
            // clear related
            return removeRelationMorph(this, { params: { id: response[this.primaryKey] }, transacting });
          }

          const promises = refs.map(obj => {
            const targetModel = strapi.db.getModel(
              obj.ref,
              obj.source !== 'content-manager' ? obj.source : null
            );

            const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

            // Remove existing relationship because only one file
            // can be related to this field.
            if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
              return removeRelationMorph(this, {
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
              );
            }

            const addRelation = async () => {
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
            };

            return addRelation();
          });

          return Promise.all(promises);
        },
      };
    case 'oneToManyMorph':
    case 'manyToManyMorph':
      return {
        update: async () => {
          const currentValue = transformToArrayID(params.values[association.alias]);

          const model = strapi.db.getModel(association.details.collection || association.details.model, association.details.plugin);

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

          return promise;
        },
      };
    default:
      return { update: () => {} };
  }
};

const getAssociationDeleteStrategy = (association, id, transacting) => {
  switch (association.nature) {
    case 'oneWay':
    case 'oneToOne':
    case 'manyToOne':
    case 'oneToManyMorph':
      return { delete: () => null };
    case 'manyWay':
    case 'oneToMany':
    case 'manyToMany':
    case 'manyToManyMorph':
    case 'manyMorphToMany':
    case 'manyMorphToOne':
      return { delete: () => [] };
    default:
      return { delete: () => {} };
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
    const relationUpdates = [];
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, {
      transacting,
    });

    // Only update fields which are on this document.
    const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, current) => {
      const property = params.values[current];
      const association = this.associations.filter(x => x.alias === current)[0];
      const details = this._attributes[current];

      if (!association && _.get(details, 'isVirtual') !== true) {
        return _.set(acc, current, property);
      }

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

      const strategy = getAssociationUpdateStrategy({ model: assocModel, ...association }, response, params, transacting);
      relationUpdates.push(strategy.update());

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
      const strategy = getAssociationDeleteStrategy(association, id, transacting);
      values[association.alias] = strategy.delete();
    });

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};