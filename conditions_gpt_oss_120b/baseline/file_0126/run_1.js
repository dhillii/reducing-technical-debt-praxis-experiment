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

const processMorphRelation = (model, association, obj, response, transacting) => {
  const targetModel = strapi.db.getModel(
    obj.ref,
    obj.source !== 'content-manager' ? obj.source : null
  );

  const reverseAssoc = targetModel.associations.find(a => a.alias === obj.field);

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

  return (async () => {
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
        id: response[model.primaryKey],
        alias: association.alias,
        ref: targetModel.collectionName,
        refId: obj.refId,
        field: obj.field,
        order: order + 1,
      },
      transacting,
    });
  })();
};

const processOneToManyMorph = (model, association, currentValue, response, transacting) => {
  const details = model._attributes[association.alias];
  const targetModel = strapi.db.getModel(details.collection || details.model, details.plugin);

  return removeRelationMorph(targetModel, {
    params: {
      alias: association.via,
      ref: model.collectionName,
      refId: response.id,
      field: association.alias,
    },
    transacting,
  }).then(() => {
    return Promise.all(
      currentValue.map((id, idx) =>
        addRelationMorph(targetModel, {
          params: {
            id,
            alias: association.via,
            ref: model.collectionName,
            refId: response.id,
            field: association.alias,
            order: idx + 1,
          },
          transacting,
        })
      )
    );
  });
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
    const values = {};
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, { transacting });

    for (const [current, property] of Object.entries(params.values || {})) {
      const association = this.associations.find(x => x.alias === current);
      const details = this._attributes[current];

      if (!association && _.get(details, 'isVirtual') !== true) {
        values[current] = property;
        continue;
      }

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

      switch (association.nature) {
        case 'oneWay': {
          values[current] = _.get(property, assocModel.primaryKey, property);
          break;
        }
        case 'oneToOne': {
          if (response[current] === property) break;

          if (_.isNull(property)) {
            const updatePromise = assocModel
              .where({
                [assocModel.primaryKey]: getValuePrimaryKey(response[current], assocModel.primaryKey),
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
            values[current] = null;
          } else {
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
            values[current] = property;
          }
          break;
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
          break;
        }
        case 'manyToOne': {
          values[current] = _.get(property, assocModel.primaryKey, property);
          break;
        }
        case 'manyWay':
        case 'manyToMany': {
          const storedValue = transformToArrayID(response[current]);
          const currentValue = transformToArrayID(params.values[current]);

          const toAdd = _.difference(currentValue, storedValue);
          const toRemove = _.difference(storedValue, currentValue);

          const collection = this.forge({
            [this.primaryKey]: primaryKeyValue,
          })[association.alias]();

          const updatePromise = collection
            .detach(toRemove, { transacting })
            .then(() => collection.attach(toAdd, { transacting }));

          relationUpdates.push(updatePromise);
          break;
        }
        case 'manyMorphToMany':
        case 'manyMorphToOne': {
          const refs = params.values[current];

          if (Array.isArray(refs) && refs.length === 0) {
            relationUpdates.push(
              removeRelationMorph(this, { params: { id: primaryKeyValue }, transacting })
            );
            break;
          }

          refs.forEach(obj => {
            relationUpdates.push(
              processMorphRelation(this, association, obj, response, transacting)
            );
          });
          break;
        }
        case 'oneToManyMorph':
        case 'manyToManyMorph': {
          const currentValue = transformToArrayID(params.values[current]);

          relationUpdates.push(
            processOneToManyMorph(this, association, currentValue, response, transacting)
          );
          break;
        }
        case 'oneMorphToOne':
        case 'oneMorphToMany': {
          break;
        }
        default:
      }
    }

    await Promise.all(relationUpdates);

    delete values[this.primaryKey];
    if (!_.isEmpty(values)) {
      await this.forge({
        [this.primaryKey]: primaryKeyValue,
      }).save(values, {
        patch: true,
        transacting,
      });
    }

    const result = await this.forge({
      [this.primaryKey]: primaryKeyValue,
    }).fetch({ transacting });

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