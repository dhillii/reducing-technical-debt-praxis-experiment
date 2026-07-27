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

/**
 * Helper to add a morph relation with order calculation.
 * @param {Object} self - The model instance.
 * @param {Object} association - Association definition.
 * @param {Object} obj - Reference object containing refId, ref, field.
 * @param {Object} response - Current record data.
 * @param {Object} transacting - Transaction context.
 */
const addMorphRelation = async (self, association, obj, response, transacting) => {
  const maxOrder = await self.morph
    .query(qb => {
      qb.max('order as order').where({
        [`${association.alias}_id`]: obj.refId,
        [`${association.alias}_type`]: obj.ref,
        field: obj.field,
      });
    })
    .fetch({ transacting });

  const { order = 0 } = maxOrder.toJSON();

  await addRelationMorph(self, {
    params: {
      id: response[self.primaryKey],
      alias: association.alias,
      ref: obj.ref,
      refId: obj.refId,
      field: obj.field,
      order: order + 1,
    },
    transacting,
  });
};

/**
 * Process a single association update.
 * @param {Object} self - The model instance.
 * @param {Object} association - Association definition.
 * @param {*} property - New value for the association.
 * @param {Object} response - Current record data.
 * @param {string} primaryKeyValue - Primary key of the record.
 * @param {Object} transacting - Transaction context.
 * @returns {Object} { values, relationUpdates }
 */
const processAssociationUpdate = async (
  self,
  association,
  property,
  response,
  primaryKeyValue,
  transacting
) => {
  const values = {};
  const relationUpdates = [];
  const details = self._attributes[association.alias];
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  switch (association.nature) {
    case 'oneWay':
      values[association.alias] = _.get(property, assocModel.primaryKey, property);
      break;

    case 'oneToOne':
      if (response[association.alias] === property) break;

      if (_.isNull(property)) {
        const updatePromise = assocModel
          .where({
            [assocModel.primaryKey]: getValuePrimaryKey(
              response[association.alias],
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
        values[association.alias] = null;
        break;
      }

      const updateLink = self
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
          return assocModel
            .where({ [self.primaryKey]: property })
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

      relationUpdates.push(updateLink);
      values[association.alias] = property;
      break;

    case 'oneToMany':
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

    case 'manyToOne':
      values[association.alias] = _.get(property, assocModel.primaryKey, property);
      break;

    case 'manyWay':
    case 'manyToMany':
      const storedValue = transformToArrayID(response[association.alias]);
      const currentValue = transformToArrayID(property);

      const toAdd = _.difference(currentValue, storedValue);
      const toRemove = _.difference(storedValue, currentValue);

      const collection = self
        .forge({
          [self.primaryKey]: primaryKeyValue,
        })[association.alias]();

      const updatePromiseMany = collection
        .detach(toRemove, { transacting })
        .then(() => collection.attach(toAdd, { transacting }));

      relationUpdates.push(updatePromiseMany);
      break;

    case 'manyMorphToMany':
    case 'manyMorphToOne':
      const refs = property;

      if (Array.isArray(refs) && refs.length === 0) {
        relationUpdates.push(
          removeRelationMorph(self, { params: { id: primaryKeyValue }, transacting })
        );
        break;
      }

      refs.forEach(async obj => {
        const targetModel = strapi.db.getModel(
          obj.ref,
          obj.source !== 'content-manager' ? obj.source : null
        );

        const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

        if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
          relationUpdates.push(
            removeRelationMorph(self, {
              params: {
                alias: association.alias,
                ref: targetModel.collectionName,
                refId: obj.refId,
                field: obj.field,
              },
              transacting,
            }).then(() =>
              addRelationMorph(self, {
                params: {
                  id: response[self.primaryKey],
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

        await addMorphRelation(self, association, obj, response, transacting);
      });
      break;

    case 'oneToManyMorph':
    case 'manyToManyMorph':
      const currentValueMorph = transformToArrayID(property);

      const model = strapi.db.getModel(details.collection || details.model, details.plugin);

      const promiseMorph = removeRelationMorph(model, {
        params: {
          alias: association.via,
          ref: self.collectionName,
          refId: response.id,
          field: association.alias,
        },
        transacting,
      }).then(() => {
        return Promise.all(
          currentValueMorph.map((id, idx) => {
            return addRelationMorph(model, {
              params: {
                id,
                alias: association.via,
                ref: self.collectionName,
                refId: response.id,
                field: association.alias,
                order: idx + 1,
              },
              transacting,
            });
          })
        );
      });

      relationUpdates.push(promiseMorph);
      break;

    case 'oneMorphToOne':
    case 'oneMorphToMany':
      // No action required for these natures.
      break;

    default:
      break;
  }

  return { values, relationUpdates };
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
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, {
      transacting,
    });

    const values = Object.keys(removeUndefinedKeys(params.values)).reduce(
      async (accPromise, current) => {
        const acc = await accPromise;
        const property = params.values[current];
        const association = this.associations.find(x => x.alias === current);
        const details = this._attributes[current];

        if (!association && _.get(details, 'isVirtual') !== true) {
          acc[current] = property;
          return acc;
        }

        const { values: newValues, relationUpdates } = await processAssociationUpdate(
          this,
          association,
          property,
          response,
          primaryKeyValue,
          transacting
        );

        Object.assign(acc, newValues);
        relationUpdates.forEach(p => acc.relationUpdates?.push(p) ?? (acc.relationUpdates = [p]));
        return acc;
      },
      Promise.resolve({ relationUpdates: [] })
    );

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
          break;
      }
    });

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};