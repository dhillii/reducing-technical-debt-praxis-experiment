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
  ...(params.order !== undefined && { order: params.order }),
});

const addRelationMorph = async (model, { params, transacting } = {}) => {
  return model.morph.forge().save(buildMorphParams(model, params), { transacting });
};

const removeRelationMorph = async (model, { params, transacting } = {}) => {
  const whereClause = _.omitBy(buildMorphParams(model, params), _.isUndefined);
  return model.morph.forge().where(whereClause).destroy({
    require: false,
    transacting,
  });
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

  oneToOne: async (property, assocModel, details, context) => {
    const { response, primaryKeyValue, transacting } = context;
    const relationUpdates = context.relationUpdates;

    if (response[context.current] === property) return null;

    if (_.isNull(property)) {
      relationUpdates.push(
        assocModel
          .where({ [assocModel.primaryKey]: getValuePrimaryKey(response[context.current], assocModel.primaryKey) })
          .save({ [details.via]: null }, {
            method: 'update',
            patch: true,
            require: false,
            transacting,
          })
      );
      return null;
    }

    const updateLink = context.model
      .where({ [context.current]: property })
      .save({ [context.current]: null }, {
        method: 'update',
        patch: true,
        require: false,
        transacting,
      })
      .then(() =>
        assocModel.where({ [context.model.primaryKey]: property }).save(
          { [details.via]: primaryKeyValue },
          {
            method: 'update',
            patch: true,
            require: false,
            transacting,
          }
        )
      );

    relationUpdates.push(updateLink);
    return property;
  },

  oneToMany: async (property, assocModel, details, context) => {
    const { response, primaryKeyValue, transacting } = context;
    const relationUpdates = context.relationUpdates;
    const currentIds = response[context.current];

    const toRemove = _.differenceWith(currentIds, property, (a, b) => {
      return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
    });

    const updatePromise = assocModel
      .where(assocModel.primaryKey, 'in', toRemove.map(val => val[assocModel.primaryKey] || val))
      .save({ [details.via]: null }, {
        method: 'update',
        patch: true,
        require: false,
        transacting,
      })
      .then(() =>
        assocModel
          .where(assocModel.primaryKey, 'in', property.map(val => val[assocModel.primaryKey] || val))
          .save({ [details.via]: primaryKeyValue }, {
            method: 'update',
            patch: true,
            require: false,
            transacting,
          })
      );

    relationUpdates.push(updatePromise);
    return undefined;
  },

  manyWay: async (property, assocModel, details, context) => {
    const { response, primaryKeyValue, transacting } = context;
    const relationUpdates = context.relationUpdates;
    const association = context.association;

    const storedValue = transformToArrayID(response[context.current]);
    const currentValue = transformToArrayID(property);

    const toAdd = _.difference(currentValue, storedValue);
    const toRemove = _.difference(storedValue, currentValue);

    const collection = context.model.forge({ [context.model.primaryKey]: primaryKeyValue })[association.alias]();

    const updatePromise = collection
      .detach(toRemove, { transacting })
      .then(() => collection.attach(toAdd, { transacting }));

    relationUpdates.push(updatePromise);
    return undefined;
  },

  manyToMany: async (property, assocModel, details, context) => {
    return associationHandlers.manyWay(property, assocModel, details, context);
  },

  manyMorphToOne: async (property, assocModel, details, context) => {
    return associationHandlers.manyMorphToMany(property, assocModel, details, context);
  },

  manyMorphToMany: async (property, assocModel, details, context) => {
    const { response, transacting } = context;
    const relationUpdates = context.relationUpdates;
    const association = context.association;
    const model = context.model;

    const refs = property;

    if (Array.isArray(refs) && refs.length === 0) {
      relationUpdates.push(
        removeRelationMorph(model, { params: { id: response[model.primaryKey] }, transacting })
      );
      return undefined;
    }

    refs.forEach(obj => {
      const targetModel = strapi.db.getModel(
        obj.ref,
        obj.source !== 'content-manager' ? obj.source : null
      );

      const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

      if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
        relationUpdates.push(
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
        return;
      }

      const addRelation = async () => {
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
      };

      relationUpdates.push(addRelation());
    });

    return undefined;
  },

  oneToManyMorph: async (property, assocModel, details, context) => {
    const { response, transacting } = context;
    const relationUpdates = context.relationUpdates;
    const association = context.association;

    const currentValue = transformToArrayID(property);
    const model = strapi.db.getModel(details.collection || details.model, details.plugin);

    const promise = removeRelationMorph(model, {
      params: {
        alias: association.via,
        ref: context.model.collectionName,
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
              ref: context.model.collectionName,
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
    return undefined;
  },

  manyToManyMorph: async (property, assocModel, details, context) => {
    return associationHandlers.oneToManyMorph(property, assocModel, details, context);
  },

  oneMorphToOne: () => undefined,
  oneMorphToMany: () => undefined,
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
      const arrayOfPromises = this.associations
        .filter(association => ['manyMorphToOne', 'manyMorphToMany'].includes(association.nature))
        .map(() =>
          this.morph
            .forge()
            .where({ [`${this.collectionName}_id`]: getValuePrimaryKey(params, this.primaryKey) })
            .fetchAll({ transacting })
        );

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
    const response = await module.exports.findOne.call(this, params, null, { transacting });

    const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, current) => {
      const property = params.values[current];
      const association = this.associations.find(x => x.alias === current);
      const details = this._attributes[current];

      if (!association && _.get(details, 'isVirtual') !== true) {
        return _.set(acc, current, property);
      }

      if (!association) {
        return acc;
      }

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
      const handler = associationHandlers[association.nature];

      if (!handler) {
        return acc;
      }

      const context = {
        model: this,
        current,
        association,
        response,
        primaryKeyValue,
        transacting,
        relationUpdates,
      };

      const result = handler(property, assocModel, details, context);

      if (result instanceof Promise) {
        return acc;
      }

      return result !== undefined ? _.set(acc, current, result) : acc;
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
    }).fetch({ transacting });

    return result && result.toJSON ? result.toJSON() : result;
  },

  deleteRelations(id, { transacting }) {
    const values = {};

    this.associations.forEach(association => {
      const singleRelationTypes = ['oneWay', 'oneToOne', 'manyToOne', 'oneToManyMorph'];
      const multiRelationTypes = ['manyWay', 'oneToMany', 'manyToMany', 'manyToManyMorph', 'manyMorphToMany', 'manyMorphToOne'];

      if (singleRelationTypes.includes(association.nature)) {
        values[association.alias] = null;
      } else if (multiRelationTypes.includes(association.nature)) {
        values[association.alias] = [];
      }
    });

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};
```