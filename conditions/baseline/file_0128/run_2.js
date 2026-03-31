```javascript
'use strict';

const _ = require('lodash');
const { models: { getValuePrimaryKey } } = require('strapi-utils');

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const transformToArrayID = (array) => {
  if (!_.isArray(array)) {
    return transformToArrayID([array]);
  }
  return array
    .map(value => _.get(value, 'id') || value)
    .filter(n => n)
    .map(val => _.toString(val));
};

const removeUndefinedKeys = obj => _.pickBy(obj, _.negate(_.isUndefined));

const buildMorphParams = (model, params) => ({
  [`${model.collectionName}_id`]: params.id,
  [`${params.alias}_id`]: params.refId,
  [`${params.alias}_type`]: params.ref,
  field: params.field,
});

const addRelationMorph = async (model, { params, transacting } = {}) => {
  const morphData = buildMorphParams(model, params);
  return model.morph.forge().save(
    { ...morphData, order: params.order },
    { transacting }
  );
};

const removeRelationMorph = async (model, { params, transacting } = {}) => {
  const morphData = buildMorphParams(model, params);
  return model.morph
    .forge()
    .where(_.omitBy(morphData, _.isUndefined))
    .destroy({ require: false, transacting });
};

// ============================================================================
// ASSOCIATION HANDLERS
// ============================================================================

const associationHandlers = {
  oneWay: (property, assocModel, details) => {
    return _.get(property, assocModel.primaryKey, property);
  },

  manyToOne: (property, assocModel) => {
    return _.get(property, assocModel.primaryKey, property);
  },

  oneToOne: async (current, property, response, details, assocModel, primaryKeyValue, transacting) => {
    if (response[current] === property) return { value: null, updates: [] };

    const updates = [];

    if (_.isNull(property)) {
      updates.push(
        assocModel
          .where({ [assocModel.primaryKey]: getValuePrimaryKey(response[current], assocModel.primaryKey) })
          .save({ [details.via]: null }, { method: 'update', patch: true, require: false, transacting })
      );
      return { value: null, updates };
    }

    const updateLink = assocModel
      .where({ [assocModel.primaryKey]: property })
      .save(
        { [details.via]: primaryKeyValue },
        { method: 'update', patch: true, require: false, transacting }
      );

    updates.push(updateLink);
    return { value: property, updates };
  },

  oneToMany: async (property, response, current, details, assocModel, primaryKeyValue, transacting) => {
    const currentIds = response[current];
    const toRemove = _.differenceWith(currentIds, property, (a, b) => {
      return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
    });

    const updates = [];
    if (toRemove.length > 0) {
      updates.push(
        assocModel
          .where(assocModel.primaryKey, 'in', toRemove.map(val => val[assocModel.primaryKey] || val))
          .save({ [details.via]: null }, { method: 'update', patch: true, require: false, transacting })
      );
    }

    updates.push(
      assocModel
        .where(assocModel.primaryKey, 'in', property.map(val => val[assocModel.primaryKey] || val))
        .save({ [details.via]: primaryKeyValue }, { method: 'update', patch: true, require: false, transacting })
    );

    return { updates };
  },

  manyToMany: async (property, response, current, association, primaryKeyValue, transacting) => {
    const storedValue = transformToArrayID(response[current]);
    const currentValue = transformToArrayID(property);

    const toAdd = _.difference(currentValue, storedValue);
    const toRemove = _.difference(storedValue, currentValue);

    const collection = this.forge({ [this.primaryKey]: primaryKeyValue })[association.alias]();

    return {
      updates: [
        collection.detach(toRemove, { transacting }).then(() => collection.attach(toAdd, { transacting }))
      ]
    };
  },

  manyMorphToOne: async (refs, response, association, details, primaryKeyValue, transacting) => {
    const updates = [];

    if (Array.isArray(refs) && refs.length === 0) {
      updates.push(removeRelationMorph(this, { params: { id: primaryKeyValue }, transacting }));
      return { updates };
    }

    refs.forEach(obj => {
      const targetModel = strapi.db.getModel(
        obj.ref,
        obj.source !== 'content-manager' ? obj.source : null
      );

      const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

      if (reverseAssoc?.nature === 'oneToManyMorph') {
        updates.push(
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

      updates.push(addRelation());
    });

    return { updates };
  },

  oneToManyMorph: async (property, response, details, association, transacting) => {
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

    return { updates: [promise] };
  },
};

// ============================================================================
// MAIN EXPORTS
// ============================================================================

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
      const morphAssociations = this.associations.filter(a =>
        ['manyMorphToOne', 'manyMorphToMany'].includes(a.nature)
      );

      const morphPromises = morphAssociations.map(() =>
        this.morph
          .forge()
          .where({ [`${this.collectionName}_id`]: getValuePrimaryKey(params, this.primaryKey) })
          .fetchAll({ transacting })
      );

      const morphResults = await Promise.all(morphPromises);

      morphResults.forEach((result, index) => {
        data[morphAssociations[index].alias] = result ? result.toJSON() : result;
      });
    }

    return data;
  },

  async update(params, { transacting } = {}) {
    const relationUpdates = [];
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, { transacting });

    const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, current) => {
      const property = params.values[current];
      const association = this.associations.find(x => x.alias === current);
      const details = this._attributes[current];

      if (!association && _.get(details, 'isVirtual') !== true) {
        return _.set(acc, current, property);
      }

      if (!association) return acc;

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

      const handler = associationHandlers[association.nature];

      if (!handler) return acc;

      let result;
      if (association.nature === 'oneWay' || association.nature === 'manyToOne') {
        result = { value: handler(property, assocModel, details) };
      } else if (association.nature === 'oneToOne') {
        result = handler.call(this, current, property, response, details, assocModel, primaryKeyValue, transacting);
      } else if (association.nature === 'oneToMany') {
        result = handler.call(this, property, response, current, details, assocModel, primaryKeyValue, transacting);
      } else if (association.nature === 'manyToMany' || association.nature === 'manyWay') {
        result = handler.call(this, property, response, current, association, primaryKeyValue, transacting);
      } else if (association.nature === 'manyMorphToOne' || association.nature === 'manyMorphToMany') {
        result = handler.call(this, property, response, association, details, primaryKeyValue, transacting);
      } else if (association.nature === 'oneToManyMorph' || association.nature === 'manyToManyMorph') {
        result = handler.call(this, property, response, details, association, transacting);
      }

      if (result?.updates) {
        relationUpdates.push(...result.updates);
      }

      return result?.value !== undefined ? _.set(acc, current, result.value) : acc;
    }, {});

    await Promise.all(relationUpdates);

    delete values[this.primaryKey];
    if (!_.isEmpty(values)) {
      await this.forge({
        [this.primaryKey]: getValuePrimaryKey(params, this.primaryKey),
      }).save(values, { patch: true, transacting });
    }

    const result = await this.forge({
      [this.primaryKey]: getValuePrimaryKey(params, this.primaryKey),
    }).fetch({ transacting });

    return result?.toJSON ? result.toJSON() : result;
  },

  deleteRelations(id, { transacting }) {
    const relationDefaults = {
      oneWay: null,
      oneToOne: null,
      manyToOne: null,
      oneToManyMorph: null,
      manyWay: [],
      oneToMany: [],
      manyToMany: [],
      manyToManyMorph: [],
      manyMorphToMany: [],
      manyMorphToOne: [],
    };

    const values = this.associations.reduce((acc, association) => {
      const defaultValue = relationDefaults[association.nature];
      if (defaultValue !== undefined) {
        acc[association.alias] = defaultValue;
      }
      return acc;
    }, {});

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};
```