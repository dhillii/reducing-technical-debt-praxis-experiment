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
  // Add a morph relation between the model and the target model
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
  // Update the morph relations for the given association and refs
  const promises = refs.map(async obj => {
    const targetModel = strapi.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );

    const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      await removeRelationMorph(model, {
        params: {
          alias: association.alias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
        },
        transacting: true,
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
        transacting: true,
      });
    } else {
      await addMorphRelation(model, association, obj, targetModel, response);
    }
  });

  await Promise.all(promises);
};

const updateManyToManyRelations = async (model, association, currentValue, response) => {
  // Update the many-to-many relations for the given association and current value
  const storedValue = transformToArrayID(response[association.alias]);
  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = model.forge({
    [model.primaryKey]: response[model.primaryKey],
  })[association.alias]();

  await collection.detach(toRemove, { transacting: true });
  await collection.attach(toAdd, { transacting: true });
};

const updateOneToManyRelations = async (model, association, currentValue, response, assocModel) => {
  // Update the one-to-many relations for the given association and current value
  const currentIds = response[association.alias];
  const toRemove = _.differenceWith(currentIds, currentValue, (a, b) => {
    return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
  });

  await assocModel
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
        transacting: true,
      }
    );

  await assocModel
    .where(
      assocModel.primaryKey,
      'in',
      currentValue.map(val => val[assocModel.primaryKey] || val)
    )
    .save(
      { [association.via]: response[model.primaryKey] },
      {
        method: 'update',
        patch: true,
        require: false,
        transacting: true,
      }
    );
};

const updateOneToOneRelations = async (model, association, currentValue, response, assocModel) => {
  // Update the one-to-one relations for the given association and current value
  if (response[association.alias] === currentValue) return;

  if (_.isNull(currentValue)) {
    await assocModel
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
          transacting: true,
        }
      );
  } else {
    await model
      .where({ [association.alias]: currentValue })
      .save(
        { [association.alias]: null },
        {
          method: 'update',
          patch: true,
          require: false,
          transacting: true,
        }
      )
      .then(() => {
        return assocModel.where({ [model.primaryKey]: currentValue }).save(
          { [association.via]: response[model.primaryKey] },
          {
            method: 'update',
            patch: true,
            require: false,
            transacting: true,
          }
        );
      });
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

          relationUpdates.push(updateOneToOneRelations(this, association, property, response, assocModel));
          return _.set(acc, current, property);
        }
        case 'oneToMany': {
          relationUpdates.push(updateOneToManyRelations(this, association, property, response, assocModel));
          return acc;
        }
        case 'manyToOne': {
          return _.set(acc, current, _.get(property, assocModel.primaryKey, property));
        }
        case 'manyWay':
        case 'manyToMany': {
          relationUpdates.push(updateManyToManyRelations(this, association, property, response));
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
              removeRelationMorph(this, { params: { id: primaryKeyValue }, transacting })
            );
            break;
          }

          relationUpdates.push(updateMorphRelations(this, association, refs, response));
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