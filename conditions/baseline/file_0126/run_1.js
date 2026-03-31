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
// ASSOCIATION TYPE HANDLERS
// ============================================================================

const associationHandlers = {
  oneWay: (property, assocModel, details) => {
    return _.get(property, assocModel.primaryKey, property);
  },

  manyToOne: (property, assocModel) => {
    return _.get(property, assocModel.primaryKey, property);
  },

  oneToOne: (property, assocModel, details, context) => {
    const { response, primaryKeyValue, relationUpdates, transacting } = context;
    
    if (response[context.current] === property) return null;

    if (_.isNull(property)) {
      relationUpdates.push(
        assocModel
          .where({ [assocModel.primaryKey]: getValuePrimaryKey(response[context.current], assocModel.primaryKey) })
          .save({ [details.via]: null }, { method: 'update', patch: true, require: false, transacting })
      );
      return null;
    }

    const updateLink = context.model
      .where({ [context.current]: property })
      .save({ [context.current]: null }, { method: 'update', patch: true, require: false, transacting })
      .then(() =>
        assocModel
          .where({ [context.model.primaryKey]: property })
          .save({ [details.via]: primaryKeyValue }, { method: 'update', patch: true, require: false, transacting })
      );

    relationUpdates.push(updateLink);
    return property;
  },

  oneToMany: (property, assocModel, details, context) => {
    const { response, primaryKeyValue, relationUpdates, transacting, current } = context;
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
    return undefined;
  },

  manyToMany: (property, assocModel, details, context) => {
    const { response, primaryKeyValue, relationUpdates, transacting, current, model, association } = context;
    
    const storedValue = transformToArrayID(response[current]);
    const currentValue = transformToArrayID(property);

    const toAdd = _.difference(currentValue, storedValue);
    const toRemove = _.difference(storedValue, currentValue);

    const collection = model.forge({ [model.primaryKey]: primaryKeyValue })[association.alias]();

    const updatePromise = collection
      .detach(toRemove, { transacting })
      .then(() => collection.attach(toAdd, { transacting }));

    relationUpdates.push(updatePromise);
    return undefined;
  },

  manyMorphToOne: (property, assocModel, details, context) => {
    return handleManyMorphRelation(property, context);
  },

  manyMorphToMany: (property, assocModel, details, context) => {
    return handleManyMorphRelation(property, context);
  },

  oneToManyMorph: (property, assocModel, details, context) => {
    return handleOneToManyMorph(property, context);
  },

  manyToManyMorph: (property, assocModel, details, context) => {
    return handleOneToManyMorph(property, context);
  },

  oneMorphToOne: () => undefined,
  oneMorphToMany: () => undefined,
};

const handleManyMorphRelation = (refs, context) => {
  const { model, association, response, relationUpdates, transacting } = context;

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

    if (reverseAssoc?.nature === 'oneToManyMorph') {
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
};

const handleOneToManyMorph = (property, context) => {
  const { model, association, response, relationUpdates, transacting, details } = context;
  
  const currentValue = transformToArrayID(property);
  const targetModel = strapi.db.getModel(details.collection || details.model, details.plugin);

  const promise = removeRelationMorph(targetModel, {
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
        addRelationMorph(targetModel, {
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
  );

  relationUpdates.push(promise);
  return undefined;
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

      const context = {
        model: this,
        association,
        current,
        response,
        primaryKeyValue,
        relationUpdates,
        transacting,
        details,
      };

      const result = handler(property, assocModel, details, context);
      return result !== undefined ? _.set(acc, current, result) : acc;
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