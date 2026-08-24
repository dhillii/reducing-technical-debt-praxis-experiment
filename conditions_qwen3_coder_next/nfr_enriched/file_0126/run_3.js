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

const getMaxOrderForMorphRelation = async (model, params, { transacting }) => {
  // Returns the maximum order value for a given morph relation
  const result = await model.morph
    .query(qb => {
      qb.max('order as order').where({
        [`${params.alias}_id`]: params.refId,
        [`${params.alias}_type`]: params.ref,
        field: params.field,
      });
    })
    .fetch({ transacting });

  const { order = 0 } = result ? result.toJSON() : {};
  return order;
};

const handleOneToManyMorphRelationUpdate = async (model, assoc, response, { transacting }) => {
  // Updates a oneToManyMorph or manyToManyMorph relationship
  const currentValue = transformToArrayID(assoc.values);

  const reverseModel = strapi.db.getModel(assoc.details.collection || assoc.details.model, assoc.details.plugin);

  const promise = removeRelationMorph(reverseModel, {
    params: {
      alias: assoc.association.via,
      ref: response.collectionName,
      refId: response.id,
      field: assoc.association.alias,
    },
    transacting,
  }).then(() => {
    return Promise.all(
      currentValue.map((id, idx) => {
        return addRelationMorph(reverseModel, {
          params: {
            id,
            alias: assoc.association.via,
            ref: response.collectionName,
            refId: response.id,
            field: assoc.association.alias,
            order: idx + 1,
          },
          transacting,
        });
      })
    );
  });

  return promise;
};

const handleMorphToManyUpdate = async (model, currentKey, assoc, response, { transacting }) => {
  // Handles manyMorphToOne and manyMorphToMany updates
  const refs = assoc.values[currentKey];
  const updatePromises = [];

  if (Array.isArray(refs) && refs.length === 0) {
    updatePromises.push(
      removeRelationMorph(model, { params: { id: assoc.primaryKeyValue }, transacting })
    );
    return updatePromises;
  }

  for (const obj of refs) {
    const targetModel = strapi.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );

    const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      updatePromises.push(
        removeRelationMorph(model, {
          params: {
            alias: assoc.association.alias,
            ref: targetModel.collectionName,
            refId: obj.refId,
            field: obj.field,
          },
          transacting,
        }).then(() =>
          addRelationMorph(model, {
            params: {
              id: response[model.primaryKey],
              alias: assoc.association.alias,
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

    const order = await getMaxOrderForMorphRelation(model, {
      alias: assoc.association.alias,
      ref: targetModel.collectionName,
      refId: obj.refId,
      field: obj.field,
    }, { transacting });

    updatePromises.push(
      addRelationMorph(model, {
        params: {
          id: response[model.primaryKey],
          alias: assoc.association.alias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
          order: order + 1,
        },
        transacting,
      })
    );
  }

  return updatePromises;
};

const processFieldUpdate = (acc, current, property, association, details, assocModel, response, params, primaryKeyValue, transacting) => {
  if (!association && _.get(details, 'isVirtual') !== true) {
    return _.set(acc, current, property);
  }

  const { nature } = association || {};

  switch (nature) {
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

        acc.relationUpdates.push(updatePromise);
        return _.set(acc.values, current, null);
      }

      // set old relations to null
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

      acc.relationUpdates.push(updateLink);
      return _.set(acc.values, current, property);
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

      acc.relationUpdates.push(updatePromise);
      return acc.values;
    }
    case 'manyToOne': {
      return _.set(acc.values, current, _.get(property, assocModel.primaryKey, property));
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

      acc.relationUpdates.push(updatePromise);
      return acc.values;
    }
    case 'manyMorphToMany':
    case 'manyMorphToOne': {
      // Delegated to separate handler
      return acc.values;
    }
    case 'oneToManyMorph':
    case 'manyToManyMorph': {
      // Delegated to separate handler
      return acc.values;
    }
    case 'oneMorphToOne':
    case 'oneMorphToMany': {
      break;
    }
    default:
  }

  return acc.values;
};

const buildRelationUpdateSpec = (model, current, property, association, details, response) => {
  // Builds an object describing a field update
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  return {
    association: association,
    assocModel: assocModel,
    current: current,
    property: property,
    response: response,
    details: details,
    values: params => processFieldUpdate(
      { values: {}, relationUpdates: [] },
      current,
      property,
      association,
      details,
      assocModel,
      response,
      params,
      getValuePrimaryKey(params, model.primaryKey),
      params.transacting
    ),
  };
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
      const promises = this.associations
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

      const related = await Promise.all(promises);

      this.associations.forEach((assoc, index) => {
        if (['manyMorphToOne', 'manyMorphToMany'].includes(assoc.nature)) {
          data[assoc.alias] = related[index] ? related[index].toJSON() : related[index];
        }
      });
    }

    return data;
  },

  async update(params, { transacting } = {}) {
    const relationUpdates = [];
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, { transacting });

    // Only update fields which are on this document.
    const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, current) => {
      const property = params.values[current];
      const association = this.associations.find(x => x.alias === current);
      const details = this._attributes[current];

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

      if (!association && _.get(details, 'isVirtual') !== true) {
        acc.values[current] = property;
        return acc.values;
      }

      switch (association.nature) {
        case 'oneWay': {
          acc.values[current] = _.get(property, assocModel.primaryKey, property);
          return acc.values;
        }
        case 'oneToOne': {
          if (response[current] === property) return acc.values;

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
            acc.values[current] = null;
            return acc.values;
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
          acc.values[current] = property;
          return acc.values;
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
          return acc.values;
        }
        case 'manyToOne': {
          acc.values[current] = _.get(property, assocModel.primaryKey, property);
          return acc.values;
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
          return acc.values;
        }
        case 'manyMorphToMany':
        case 'manyMorphToOne': {
          const handled = await handleMorphToManyUpdate(
            this,
            current,
            { association, values: params.values },
            response,
            { transacting }
          );
          relationUpdates.push(...handled);
          return acc.values;
        }
        case 'oneToManyMorph':
        case 'manyToManyMorph': {
          const handled = await handleOneToManyMorphRelationUpdate(
            this,
            { association, values: params.values, details },
            response,
            { transacting }
          );
          relationUpdates.push(handled);
          return acc.values;
        }
        case 'oneMorphToOne':
        case 'oneMorphToMany': {
          break;
        }
        default:
      }

      return acc.values;
    }, { values: {}, relationUpdates });

    await Promise.all(values.relationUpdates);

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