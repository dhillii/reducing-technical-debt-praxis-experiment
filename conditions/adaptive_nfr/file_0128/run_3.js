```javascript
'use strict';

const _ = require('lodash');
const { models: { getValuePrimaryKey } } = require('strapi-utils');

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const transformToArrayID = array => {
  const items = _.isArray(array) ? array : [array];
  return items
    .map(value => _.get(value, 'id') || value)
    .filter(n => n)
    .map(val => _.toString(val));
};

const removeUndefinedKeys = obj => _.pickBy(obj, _.negate(_.isUndefined));

const buildMorphKey = (collectionName, alias, suffix) => `${collectionName || alias}_${suffix}`;

// ============================================================================
// MORPH RELATION OPERATIONS
// ============================================================================

const addRelationMorph = async (model, { params, transacting } = {}) => {
  const morphData = {
    [buildMorphKey(model.collectionName, null, 'id')]: params.id,
    [buildMorphKey(null, params.alias, 'id')]: params.refId,
    [buildMorphKey(null, params.alias, 'type')]: params.ref,
    field: params.field,
    order: params.order,
  };

  return model.morph.forge().save(morphData, { transacting });
};

const removeRelationMorph = async (model, { params, transacting } = {}) => {
  const whereClause = removeUndefinedKeys({
    [buildMorphKey(model.collectionName, null, 'id')]: params.id,
    [buildMorphKey(null, params.alias, 'id')]: params.refId,
    [buildMorphKey(null, params.alias, 'type')]: params.ref,
    field: params.field,
  });

  return model.morph
    .forge()
    .where(whereClause)
    .destroy({ require: false, transacting });
};

// ============================================================================
// ASSOCIATION HANDLERS
// ============================================================================

const AssociationHandlers = {
  oneWay: (property, assocModel, details) => {
    return _.get(property, assocModel.primaryKey, property);
  },

  manyToOne: (property, assocModel, details) => {
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
      .save({ [details.via]: primaryKeyValue }, { method: 'update', patch: true, require: false, transacting });

    updates.push(updateLink);
    return { value: property, updates };
  },

  oneToMany: async (current, property, response, details, assocModel, primaryKeyValue, transacting) => {
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
          .then(() =>
            assocModel
              .where(assocModel.primaryKey, 'in', property.map(val => val[assocModel.primaryKey] || val))
              .save({ [details.via]: primaryKeyValue }, { method: 'update', patch: true, require: false, transacting })
          )
      );
    }

    return { value: undefined, updates };
  },

  manyToMany: async (current, property, response, association, primaryKeyValue, transacting) => {
    const storedValue = transformToArrayID(response[current]);
    const currentValue = transformToArrayID(property);

    const toAdd = _.difference(currentValue, storedValue);
    const toRemove = _.difference(storedValue, currentValue);

    const updates = [];
    if (toAdd.length > 0 || toRemove.length > 0) {
      const collection = this.forge({ [this.primaryKey]: primaryKeyValue })[association.alias]();
      updates.push(
        collection.detach(toRemove, { transacting }).then(() => collection.attach(toAdd, { transacting }))
      );
    }

    return { value: undefined, updates };
  },

  manyMorphToOne: async (current, refs, response, association, model, transacting) => {
    const updates = [];

    if (!Array.isArray(refs) || refs.length === 0) {
      updates.push(removeRelationMorph(model, { params: { id: response[model.primaryKey] }, transacting }));
      return { value: undefined, updates };
    }

    for (const obj of refs) {
      const targetModel = strapi.db.getModel(
        obj.ref,
        obj.source !== 'content-manager' ? obj.source : null
      );

      const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

      if (reverseAssoc?.nature === 'oneToManyMorph') {
        updates.push(
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
                id: response[model.primaryKey],
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

      updates.push(
        (async () => {
          const maxOrder = await model.morph
            .query(qb => {
              qb.max('order as order').where({
                [buildMorphKey(null, association.alias, 'id')]: obj.refId,
                [buildMorphKey(null, association.alias, 'type')]: targetModel.collectionName,
                field: obj.field,
              });
            })
            .fetch({ transacting });

          const { order = 0 } = maxOrder.toJSON();

          return addRelationMorph(model, {
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
        })()
      );
    }

    return { value: undefined, updates };
  },

  oneToManyMorph: async (current, property, response, association, details, transacting) => {
    const currentValue = transformToArrayID(property);
    const model = strapi.db.getModel(details.collection || details.model, details.plugin);

    const updates = [
      removeRelationMorph(model, {
        params: {
          alias: association.via,
          ref: model.collectionName,
          refId: response.id,
          field: association.alias,
        },
        transacting,
      }).then(() =>
        Promise.all(
          currentValue.map((id, idx) =>
            addRelationMorph(model, {
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
        )
      ),
    ];

    return { value: undefined, updates };
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
          .where({ [buildMorphKey(this.collectionName, null, 'id')]: getValuePrimaryKey(params, this.primaryKey) })
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

      switch (association.nature) {
        case 'oneWay':
        case 'manyToOne': {
          const value = AssociationHandlers[association.nature](property, assocModel, details);
          return _.set(acc, current, value);
        }

        case 'oneToOne': {
          const { value, updates } = AssociationHandlers.oneToOne.call(
            this,
            current,
            property,
            response,
            details,
            assocModel,
            primaryKeyValue,
            transacting
          );
          relationUpdates.push(...updates);
          return value !== undefined ? _.set(acc, current, value) : acc;
        }

        case 'oneToMany': {
          const { updates } = AssociationHandlers.oneToMany.call(
            this,
            current,
            property,
            response,
            details,
            assocModel,
            primaryKeyValue,
            transacting
          );
          relationUpdates.push(...updates);
          return acc;
        }

        case 'manyWay':
        case 'manyToMany': {
          const { updates } = AssociationHandlers.manyToMany.call(
            this,
            current,
            property,
            response,
            association,
            primaryKeyValue,
            transacting
          );
          relationUpdates.push(...updates);
          return acc;
        }

        case 'manyMorphToMany':
        case 'manyMorphToOne': {
          const { updates } = AssociationHandlers.manyMorphToOne.call(
            this,
            current,
            property,
            response,
            association,
            this,
            transacting
          );
          relationUpdates.push(...updates);
          return acc;
        }

        case 'oneToManyMorph':
        case 'manyToManyMorph': {
          const { updates } = AssociationHandlers.oneToManyMorph.call(
            this,
            current,
            property,
            response,
            association,
            details,
            transacting
          );
          relationUpdates.push(...updates);
          return acc;
        }

        case 'oneMorphToOne':
        case 'oneMorphToMany':
        default:
          return acc;
      }
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

    return result?.toJSON?.() || result;
  },

  deleteRelations(id, { transacting }) {
    const values = {};

    this.associations.forEach(association => {
      const isToMany = ['manyWay', 'oneToMany', 'manyToMany', 'manyToManyMorph', 'manyMorphToMany', 'manyMorphToOne'].includes(
        association.nature
      );
      values[association.alias] = isToMany ? [] : null;
    });

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};
```