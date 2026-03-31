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

// ============================================================================
// MORPH RELATION OPERATIONS
// ============================================================================

const addRelationMorph = async (model, { params, transacting } = {}) => {
  const morphData = buildMorphParams(model, params);
  return model.morph.forge().save(
    { ...morphData, order: params.order },
    { transacting }
  );
};

const removeRelationMorph = async (model, { params, transacting } = {}) => {
  const morphData = _.omitBy(buildMorphParams(model, params), _.isUndefined);
  return model.morph
    .forge()
    .where(morphData)
    .destroy({ require: false, transacting });
};

// ============================================================================
// ASSOCIATION UPDATE HANDLERS
// ============================================================================

const associationHandlers = {
  oneWay: (property, assocModel, details) => {
    return _.get(property, assocModel.primaryKey, property);
  },

  manyToOne: (property, assocModel, details) => {
    return _.get(property, assocModel.primaryKey, property);
  },

  oneToOne: async (current, property, response, details, assocModel, primaryKeyValue, transacting) => {
    if (response[current] === property) return { skip: true };
    if (_.isNull(property)) {
      await assocModel
        .where({ [assocModel.primaryKey]: getValuePrimaryKey(response[current], assocModel.primaryKey) })
        .save({ [details.via]: null }, { method: 'update', patch: true, require: false, transacting });
      return null;
    }

    await this.where({ [current]: property })
      .save({ [current]: null }, { method: 'update', patch: true, require: false, transacting });
    
    await assocModel
      .where({ [this.primaryKey]: property })
      .save({ [details.via]: primaryKeyValue }, { method: 'update', patch: true, require: false, transacting });
    
    return property;
  },

  oneToMany: async (current, property, response, details, assocModel, primaryKeyValue, transacting) => {
    const currentIds = response[current];
    const toRemove = _.differenceWith(currentIds, property, (a, b) => {
      return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
    });

    await assocModel
      .where(assocModel.primaryKey, 'in', toRemove.map(val => val[assocModel.primaryKey] || val))
      .save({ [details.via]: null }, { method: 'update', patch: true, require: false, transacting });

    await assocModel
      .where(assocModel.primaryKey, 'in', property.map(val => val[assocModel.primaryKey] || val))
      .save({ [details.via]: primaryKeyValue }, { method: 'update', patch: true, require: false, transacting });

    return { skip: true };
  },

  manyToMany: async (current, property, response, association, primaryKeyValue, transacting) => {
    const storedValue = transformToArrayID(response[current]);
    const currentValue = transformToArrayID(property);
    const toAdd = _.difference(currentValue, storedValue);
    const toRemove = _.difference(storedValue, currentValue);

    const collection = this.forge({ [this.primaryKey]: primaryKeyValue })[association.alias]();
    await collection.detach(toRemove, { transacting });
    await collection.attach(toAdd, { transacting });

    return { skip: true };
  },

  manyWay: async (current, property, response, association, primaryKeyValue, transacting) => {
    return associationHandlers.manyToMany.call(this, current, property, response, association, primaryKeyValue, transacting);
  },

  manyMorphToOne: async (current, property, response, association, details, primaryKeyValue, transacting) => {
    return associationHandlers.manyMorphToMany.call(this, current, property, response, association, details, primaryKeyValue, transacting);
  },

  manyMorphToMany: async (current, property, response, association, details, primaryKeyValue, transacting) => {
    const refs = property;

    if (Array.isArray(refs) && refs.length === 0) {
      await removeRelationMorph(this, { params: { id: primaryKeyValue }, transacting });
      return { skip: true };
    }

    for (const obj of refs) {
      const targetModel = strapi.db.getModel(
        obj.ref,
        obj.source !== 'content-manager' ? obj.source : null
      );
      const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

      if (reverseAssoc?.nature === 'oneToManyMorph') {
        await removeRelationMorph(this, {
          params: {
            alias: association.alias,
            ref: targetModel.collectionName,
            refId: obj.refId,
            field: obj.field,
          },
          transacting,
        });
        await addRelationMorph(this, {
          params: {
            id: response[this.primaryKey],
            alias: association.alias,
            ref: targetModel.collectionName,
            refId: obj.refId,
            field: obj.field,
            order: 1,
          },
          transacting,
        });
      } else {
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
      }
    }

    return { skip: true };
  },

  oneToManyMorph: async (current, property, response, association, details, transacting) => {
    const currentValue = transformToArrayID(property);
    const model = strapi.db.getModel(details.collection || details.model, details.plugin);

    await removeRelationMorph(model, {
      params: {
        alias: association.via,
        ref: this.collectionName,
        refId: response.id,
        field: association.alias,
      },
      transacting,
    });

    await Promise.all(
      currentValue.map((id, idx) =>
        addRelationMorph(model, {
          params: {
            id,
            alias: association.via,
            ref: this.collectionName,
            refId: response.id,
            field: association.alias,
            order: idx + 1,
          },
          transacting,
        })
      )
    );

    return { skip: true };
  },

  manyToManyMorph: async (current, property, response, association, details, transacting) => {
    return associationHandlers.oneToManyMorph.call(this, current, property, response, association, details, transacting);
  },

  oneMorphToOne: () => ({ skip: true }),
  oneMorphToMany: () => ({ skip: true }),
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

      const morphData = await Promise.all(
        morphAssociations.map(() =>
          this.morph
            .forge()
            .where({ [`${this.collectionName}_id`]: getValuePrimaryKey(params, this.primaryKey) })
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
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, { transacting });
    const cleanParams = removeUndefinedKeys(params.values);

    const values = {};
    const relationUpdates = [];

    for (const current of Object.keys(cleanParams)) {
      const property = params.values[current];
      const association = this.associations.find(x => x.alias === current);
      const details = this._attributes[current];

      if (!association && _.get(details, 'isVirtual') !== true) {
        values[current] = property;
        continue;
      }

      if (!association) continue;

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
      const handler = associationHandlers[association.nature];

      if (!handler) continue;

      try {
        const result = await handler.call(
          this,
          current,
          property,
          response,
          association,
          details,
          primaryKeyValue,
          transacting
        );

        if (result && !result.skip) {
          values[current] = result;
        }
      } catch (error) {
        relationUpdates.push(Promise.reject(error));
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

    const values = {};
    this.associations.forEach(association => {
      values[association.alias] = relationDefaults[association.nature] ?? null;
    });

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};
```