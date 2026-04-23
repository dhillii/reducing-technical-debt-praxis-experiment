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
 * Transforms an array or single value into an array of string IDs.
 * @param {any} array - The input value or array.
 * @returns {string[]} - An array of string IDs.
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
 * Removes undefined keys from an object.
 * @param {Object} obj - The object to filter.
 * @returns {Object} - The filtered object.
 */
const removeUndefinedKeys = obj => _.pickBy(obj, _.negate(_.isUndefined));

/**
 * Adds a relation morph record.
 * @param {Object} model - The model instance.
 * @param {Object} options - The options object.
 * @param {Object} options.params - The parameters for the relation.
 * @param {Object} options.transacting - The transaction object.
 * @returns {Promise<Object>} - The saved relation record.
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
 * Removes a relation morph record.
 * @param {Object} model - The model instance.
 * @param {Object} options - The options object.
 * @param {Object} options.params - The parameters for the relation.
 * @param {Object} options.transacting - The transaction object.
 * @returns {Promise<Object>} - The destroyed relation record.
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
 * Determines the update action based on the association nature.
 * @param {Object} association - The association object.
 * @param {Object} assocModel - The associated model.
 * @param {Object} property - The property value.
 * @param {Object} response - The current relation data.
 * @param {string} current - The current alias.
 * @param {string} primaryKeyValue - The primary key value.
 * @param {Object} details - The attribute details.
 * @param {Object} acc - The accumulator object.
 * @param {Object} transacting - The transaction object.
 * @returns {Promise<Object>} - The updated accumulator.
 */
const handleAssociationUpdate = async (
  association,
  assocModel,
  property,
  response,
  current,
  primaryKeyValue,
  details,
  acc,
  transacting
) => {
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

        return Promise.resolve(_.set(acc, current, null).then(() => updatePromise));
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

      // set new relation
      return Promise.resolve(updateLink.then(() => _.set(acc, current, property)));
    }
    case 'oneToMany': {
      // receive array of ids or array of objects with ids

      // set relation to null for all the ids not in the list
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

      return Promise.resolve(updatePromise.then(() => acc));
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

      const collection = this.forge({
        [this.primaryKey]: primaryKeyValue,
      })[association.alias]();

      const updatePromise = collection
        .detach(toRemove, { transacting })
        .then(() => collection.attach(toAdd, { transacting }));

      return Promise.resolve(updatePromise.then(() => acc));
    }
    // media -> model
    case 'manyMorphToMany':
    case 'manyMorphToOne': {
      // Update the relational array.
      const refs = params.values[current];

      if (Array.isArray(refs) && refs.length === 0) {
        // clear related
        return Promise.resolve(
          removeRelationMorph(this, { params: { id: primaryKeyValue }, transacting })
            .then(() => acc)
        );
      }

      const morphUpdates = [];
      refs.forEach(obj => {
        const targetModel = strapi.db.getModel(
          obj.ref,
          obj.source !== 'content-manager' ? obj.source : null
        );

        const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

        // Remove existing relationship because only one file
        // can be related to this field.
        if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
          morphUpdates.push(
            removeRelationMorph(this, {
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
            )
          );

          return;
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

        morphUpdates.push(addRelation());
      });

      return Promise.resolve(Promise.all(morphUpdates).then(() => acc));
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

      return Promise.resolve(promise.then(() => acc));
    }
    case 'oneMorphToOne':
    case 'oneMorphToMany': {
      return acc;
    }
    default:
      return acc;
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

      return handleAssociationUpdate(
        association,
        assocModel,
        property,
        response,
        current,
        primaryKeyValue,
        details,
        acc,
        transacting
      ).then(updatedAcc => {
        relationUpdates.push(updatedAcc);
        return acc;
      });
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