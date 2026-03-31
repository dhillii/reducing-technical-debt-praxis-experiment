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

  manyToOne: (property, assocModel) => {
    return _.get(property, assocModel.primaryKey, property);
  },

  oneToOne: async (current, property, response, details, assocModel, primaryKeyValue, transacting) => {
    const relationUpdates = [];

    if (response[current] === property) return { value: property, updates: relationUpdates };

    if (_.isNull(property)) {
      relationUpdates.push(
        assocModel
          .where({ [assocModel.primaryKey]: getValuePrimaryKey(response[current], assocModel.primaryKey) })
          .save({ [details.via]: null }, { method: 'update', patch: true, require: false, transacting })
      );
      return { value: null, updates: relationUpdates };
    }

    const updateLink = assocModel
      .where({ [current]: property })
      .save({ [current]: null }, { method: 'update', patch: true, require: false, transacting })
      .then(() =>
        assocModel
          .where({ [assocModel.primaryKey]: property })
          .save({ [details.via]: primaryKeyValue }, { method: 'update', patch: true, require: false, transacting })
      );

    relationUpdates.push(updateLink);
    return { value: property, updates: relationUpdates };
  },

  oneToMany: async (property, response, current, details, assocModel, primaryKeyValue, transacting) => {
    const relationUpdates = [];
    const currentIds = response[current];

    const toRemove = _.differenceWith(currentIds, property, (a, b) => {
      return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
    });

    const updatePromise = assocModel
      .where(assocModel.primaryKey, 'in', toRemove.map(val => val[assocModel.primaryKey] || val))
      .save({ [details.via]: null }, { method: 'update', patch: true, require: false, transacting })
      .then(() =>
        assocModel
          .where(assocModel.primaryKey, 'in', property.map(val => val[assocModel.primaryKey] || val))
          .save({ [details.via]: primaryKeyValue }, { method: 'update', patch: true, require: false, transacting })
      );

    relationUpdates.push(updatePromise);
    return { updates: relationUpdates };
  },

  manyToMany: async (current, property, response, association, primaryKeyValue, transacting) => {
    const relationUpdates = [];
    const storedValue = transformToArrayID(response[current]);
    const currentValue = transformToArrayID(property);

    const toAdd = _.difference(currentValue, storedValue);
    const toRemove = _.difference(storedValue, currentValue);

    const collection = this.forge({ [this.primaryKey]: primaryKeyValue })[association.alias]();

    const updatePromise = collection
      .detach(toRemove, { transacting })
      .then(() => collection.attach(toAdd, { transacting }));

    relationUpdates.push(updatePromise);
    return { updates: relationUpdates };
  },

  manyMorphToOne: async (refs, association, response, primaryKeyValue, transacting) => {
    const relationUpdates = [];

    if (Array.isArray(refs) && refs.length === 0) {
      relationUpdates.push(
        removeRelationMorph(this, { params: { id: primaryKeyValue }, transacting })
      );
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
        continue;
      }

      relationUpdates.push(
        (async () => {
          const maxOrder = await this.morph
            .query(qb => {
              qb.max('order as order').where({
                [buildMorphKey(null, association.alias, 'id')]: obj.refId,
                [buildMorphKey(null, association.alias, 'type')]: targetModel.collectionName,
                field: obj.field,
              });
            })
            .fetch({ transacting });

          const { order = 0 } = maxOrder.toJSON();

          return addRelationMorph(this, {
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
        })()
      );
    }

    return { updates: relationUpdates };
  },

  manyToManyMorph: async (current, property, response, details, association, transacting) => {
    const relationUpdates = [];
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
    }).then(() =>
      Promise.all(
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
      )
    );

    relationUpdates.push(promise);
    return { updates: relationUpdates };
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
      const morphAssociations = this.associations.filter(assoc =>
        ['manyMorphToOne', 'manyMorphToMany'].includes(assoc.nature)
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
      const { nature } = association;

      switch (nature) {
        case 'oneWay':
        case 'manyToOne':
          return _.set(acc, current, AssociationHandlers[nature](property, assocModel, details));

        case 'oneToOne': {
          const result = AssociationHandlers.oneToOne.call(
            this,
            current,
            property,
            response,
            details,
            assocModel,
            primaryKeyValue,
            transacting
          );
          relationUpdates.push(...result.updates);
          return _.set(acc, current, result.value);
        }

        case 'oneToMany': {
          const result = AssociationHandlers.oneToMany.call(
            this,
            property,
            response,
            current,
            details,
            assocModel,
            primaryKeyValue,
            transacting
          );
          relationUpdates.push(...result.updates);
          return acc;
        }

        case 'manyWay':
        case 'manyToMany': {
          const result = AssociationHandlers.manyToMany.call(
            this,
            current,
            property,
            response,
            association,
            primaryKeyValue,
            transacting
          );
          relationUpdates.push(...result.updates);
          return acc;
        }

        case 'manyMorphToMany':
        case 'manyMorphToOne': {
          const result = AssociationHandlers.manyMorphToOne.call(
            this,
            property,
            association,
            response,
            primaryKeyValue,
            transacting
          );
          relationUpdates.push(...result.updates);
          return acc;
        }

        case 'oneToManyMorph':
        case 'manyToManyMorph': {
          const result = AssociationHandlers.manyToManyMorph.call(
            this,
            current,
            property,
            response,
            details,
            association,
            transacting
          );
          relationUpdates.push(...result.updates);
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