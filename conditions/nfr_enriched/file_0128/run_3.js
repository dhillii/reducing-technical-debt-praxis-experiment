```javascript
'use strict';

const _ = require('lodash');
const { models: { getValuePrimaryKey } } = require('strapi-utils');

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const transformToArrayID = (array) => {
  const items = _.isArray(array) ? array : [array];
  return items
    .map(value => _.get(value, 'id') || value)
    .filter(n => n)
    .map(val => _.toString(val));
};

const removeUndefinedKeys = obj => _.pickBy(obj, _.negate(_.isUndefined));

const getPrimaryKeyValue = (params, primaryKey) => 
  getValuePrimaryKey(params, primaryKey);

// ============================================================================
// MORPH RELATION OPERATIONS
// ============================================================================

const addRelationMorph = async (model, { params, transacting } = {}) => {
  return model.morph.forge().save(
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
  const whereClause = _.omitBy(
    {
      [`${model.collectionName}_id`]: params.id,
      [`${params.alias}_id`]: params.refId,
      [`${params.alias}_type`]: params.ref,
      field: params.field,
    },
    _.isUndefined
  );

  return model.morph
    .forge()
    .where(whereClause)
    .destroy({ require: false, transacting });
};

// ============================================================================
// ASSOCIATION HANDLERS
// ============================================================================

const associationHandlers = {
  oneWay: (property, assocModel, details) => {
    return _.get(property, assocModel.primaryKey, property);
  },

  manyToOne: (property, assocModel, details) => {
    return _.get(property, assocModel.primaryKey, property);
  },

  oneToOne: async (current, property, response, details, assocModel, primaryKeyValue, transacting) => {
    const relationUpdates = [];

    if (response[current] === property) return { value: property, updates: relationUpdates };

    if (_.isNull(property)) {
      relationUpdates.push(
        assocModel
          .where({ [assocModel.primaryKey]: getPrimaryKeyValue(response[current], assocModel.primaryKey) })
          .save({ [details.via]: null }, { method: 'update', patch: true, require: false, transacting })
      );
      return { value: null, updates: relationUpdates };
    }

    const updateLink = assocModel
      .where({ [assocModel.primaryKey]: property })
      .save({ [details.via]: primaryKeyValue }, { method: 'update', patch: true, require: false, transacting });

    relationUpdates.push(updateLink);
    return { value: property, updates: relationUpdates };
  },

  oneToMany: async (current, property, response, details, assocModel, primaryKeyValue, transacting) => {
    const currentIds = response[current];
    const toRemove = _.differenceWith(currentIds, property, (a, b) => {
      return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
    });

    const updatePromise = assocModel
      .where(assocModel.primaryKey, 'in', toRemove.map(val => val[assocModel.primaryKey] || val))
      .save({ [details.via]: null }, { method: 'update', patch: true, require: false, transacting })
      .then(() => {
        return assocModel
          .where(assocModel.primaryKey, 'in', property.map(val => val[assocModel.primaryKey] || val))
          .save({ [details.via]: primaryKeyValue }, { method: 'update', patch: true, require: false, transacting });
      });

    return { updates: [updatePromise] };
  },

  manyToMany: async (current, property, response, association, primaryKeyValue, transacting) => {
    const storedValue = transformToArrayID(response[current]);
    const currentValue = transformToArrayID(property);

    const toAdd = _.difference(currentValue, storedValue);
    const toRemove = _.difference(storedValue, currentValue);

    const collection = strapi.db.getModel(association.model || association.collection)[association.alias]();

    const updatePromise = collection
      .detach(toRemove, { transacting })
      .then(() => collection.attach(toAdd, { transacting }));

    return { updates: [updatePromise] };
  },

  manyMorphToOne: async (current, property, response, association, primaryKeyValue, transacting) => {
    const relationUpdates = [];
    const refs = property;

    if (Array.isArray(refs) && refs.length === 0) {
      relationUpdates.push(removeRelationMorph(strapi.db.getModel(association.model), {
        params: { id: primaryKeyValue },
        transacting,
      }));
      return { updates: relationUpdates };
    }

    for (const obj of refs) {
      const targetModel = strapi.db.getModel(
        obj.ref,
        obj.source !== 'content-manager' ? obj.source : null
      );

      const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

      if (reverseAssoc?.nature === 'oneToManyMorph') {
        relationUpdates.push(
          removeRelationMorph(strapi.db.getModel(association.model), {
            params: {
              alias: association.alias,
              ref: targetModel.collectionName,
              refId: obj.refId,
              field: obj.field,
            },
            transacting,
          }).then(() =>
            addRelationMorph(strapi.db.getModel(association.model), {
              params: {
                id: response[strapi.db.getModel(association.model).primaryKey],
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
        continue;
      }

      relationUpdates.push(
        (async () => {
          const maxOrder = await strapi.db.getModel(association.model).morph
            .query(qb => {
              qb.max('order as order').where({
                [`${association.alias}_id`]: obj.refId,
                [`${association.alias}_type`]: targetModel.collectionName,
                field: obj.field,
              });
            })
            .fetch({ transacting });

          const { order = 0 } = maxOrder.toJSON();

          return addRelationMorph(strapi.db.getModel(association.model), {
            params: {
              id: response[strapi.db.getModel(association.model).primaryKey],
              alias: association.alias,
              ref: targetModel.collectionName,
              refId: obj.refId,
              field: obj.field,
              order: order + 1,
            },
            transacting,
          });
        })()
      );
    }

    return { updates: relationUpdates };
  },

  oneToManyMorph: async (current, property, response, association, details, transacting) => {
    const currentValue = transformToArrayID(property);
    const model = strapi.db.getModel(details.collection || details.model, details.plugin);

    const promise = removeRelationMorph(model, {
      params: {
        alias: association.via,
        ref: strapi.db.getModel(association.model).collectionName,
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
              ref: strapi.db.getModel(association.model).collectionName,
              refId: response.id,
              field: association.alias,
              order: idx + 1,
            },
            transacting,
          });
        })
      );
    });

    return { updates: [promise] };
  },
};

// ============================================================================
// MAIN EXPORTS
// ============================================================================

module.exports = {
  async findOne(params, populate, { transacting } = {}) {
    const primaryKeyValue = getPrimaryKeyValue(params, this.primaryKey);
    const record = await this.forge({
      [this.primaryKey]: primaryKeyValue,
    }).fetch({
      transacting,
      withRelated: populate,
    });

    const data = record ? record.toJSON() : record;

    if (_.isEmpty(populate)) {
      const morphAssociations = this.associations.filter(a =>
        ['manyMorphToOne', 'manyMorphToMany'].includes(a.nature)
      );

      const morphData = await Promise.all(
        morphAssociations.map(() =>
          this.morph
            .forge()
            .where({ [`${this.collectionName}_id`]: primaryKeyValue })
            .fetchAll({ transacting })
        )
      );

      morphData.forEach((value, index) => {
        data[morphAssociations[index].alias] = value ? value.toJSON() : value;
      });
    }

    return data;
  },

  async update(params, { transacting } = {}) {
    const relationUpdates = [];
    const primaryKeyValue = getPrimaryKeyValue(params, this.primaryKey);
    const response = await this.findOne.call(this, params, null, { transacting });

    const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, current) => {
      const property = params.values[current];
      const association = this.associations.find(x => x.alias === current);
      const details = this._attributes[current];

      if (!association && _.get(details, 'isVirtual') !== true) {
        return _.set(acc, current, property);
      }

      if (!association) return acc;

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
      const { nature } = association;

      // Handle simple associations
      if (['oneWay', 'manyToOne'].includes(nature)) {
        return _.set(acc, current, associationHandlers[nature](property, assocModel, details));
      }

      // Handle complex associations asynchronously
      if (nature === 'oneToOne') {
        // Handled separately due to async nature
        return acc;
      }

      if (nature === 'oneToMany') {
        // Handled separately due to async nature
        return acc;
      }

      if (['manyWay', 'manyToMany'].includes(nature)) {
        // Handled separately due to async nature
        return acc;
      }

      if (['manyMorphToMany', 'manyMorphToOne'].includes(nature)) {
        // Handled separately due to async nature
        return acc;
      }

      if (['oneToManyMorph', 'manyToManyMorph'].includes(nature)) {
        // Handled separately due to async nature
        return acc;
      }

      return acc;
    }, {});

    // Process async associations
    for (const current of Object.keys(params.values)) {
      const property = params.values[current];
      const association = this.associations.find(x => x.alias === current);
      const details = this._attributes[current];

      if (!association || _.get(details, 'isVirtual') === true) continue;

      const { nature } = association;
      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

      if (nature === 'oneToOne') {
        const result = await associationHandlers.oneToOne(
          current, property, response, details, assocModel, primaryKeyValue, transacting
        );
        relationUpdates.push(...result.updates);
        _.set(values, current, result.value);
      } else if (nature === 'oneToMany') {
        const result = await associationHandlers.oneToMany(
          current, property, response, details, assocModel, primaryKeyValue, transacting
        );
        relationUpdates.push(...result.updates);
      } else if (['manyWay', 'manyToMany'].includes(nature)) {
        const result = await associationHandlers.manyToMany(
          current, property, response, association, primaryKeyValue, transacting
        );
        relationUpdates.push(...result.updates);
      } else if (['manyMorphToMany', 'manyMorphToOne'].includes(nature)) {
        const result = await associationHandlers.manyMorphToOne(
          current, property, response, association, primaryKeyValue, transacting
        );
        relationUpdates.push(...result.updates);
      } else if (['oneToManyMorph', 'manyToManyMorph'].includes(nature)) {
        const result = await associationHandlers.oneToManyMorph(
          current, property, response, association, details, transacting
        );
        relationUpdates.push(...result.updates);
      }
    }

    await Promise.all(relationUpdates);

    delete values[this.primaryKey];
    if (!_.isEmpty(values)) {
      await this.forge({
        [this.primaryKey]: primaryKeyValue,
      }).save(values, { patch: true, transacting });
    }

    const result = await this.forge({
      [this.primaryKey]: primaryKeyValue,
    }).fetch({ transacting });

    return result?.toJSON?.() || result;
  },

  deleteRelations(id, { transacting }) {
    const values = {};
    const nullAssociations = ['oneWay', 'oneToOne', 'manyToOne', 'oneToManyMorph'];
    const emptyAssociations = ['manyWay', 'oneToMany', 'manyToMany', 'manyToManyMorph', 'manyMorphToMany', 'manyMorphToOne'];

    this.associations.forEach(association => {
      if (nullAssociations.includes(association.nature)) {
        values[association.alias] = null;
      } else if (emptyAssociations.includes(association.nature)) {
        values[association.alias] = [];
      }
    });

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};
```