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
// ASSOCIATION TYPE HANDLERS
// ============================================================================

const associationHandlers = {
  oneWay: (acc, current, property, assocModel) => {
    return _.set(acc, current, _.get(property, assocModel.primaryKey, property));
  },

  manyToOne: (acc, current, property, assocModel) => {
    return _.set(acc, current, _.get(property, assocModel.primaryKey, property));
  },

  oneToOne: (acc, current, property, response, details, assocModel, primaryKeyValue, relationUpdates, transacting) => {
    if (response[current] === property) return acc;

    if (_.isNull(property)) {
      relationUpdates.push(
        assocModel
          .where({ [assocModel.primaryKey]: getValuePrimaryKey(response[current], assocModel.primaryKey) })
          .save({ [details.via]: null }, { method: 'update', patch: true, require: false, transacting })
      );
      return _.set(acc, current, null);
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
    return _.set(acc, current, property);
  },

  oneToMany: (acc, current, property, response, details, assocModel, primaryKeyValue, relationUpdates, transacting) => {
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
    return acc;
  },

  manyToMany: (acc, current, property, response, association, primaryKeyValue, relationUpdates, transacting) => {
    const storedValue = transformToArrayID(response[current]);
    const currentValue = transformToArrayID(property);
    const toAdd = _.difference(currentValue, storedValue);
    const toRemove = _.difference(storedValue, currentValue);

    const collection = association.model.forge({ [association.model.primaryKey]: primaryKeyValue })[association.alias]();
    const updatePromise = collection
      .detach(toRemove, { transacting })
      .then(() => collection.attach(toAdd, { transacting }));

    relationUpdates.push(updatePromise);
    return acc;
  },
};

// ============================================================================
// MORPH ASSOCIATION HANDLERS
// ============================================================================

const handleManyMorphToOne = async (obj, association, response, relationUpdates, transacting) => {
  const targetModel = strapi.db.getModel(
    obj.ref,
    obj.source !== 'content-manager' ? obj.source : null
  );

  const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

  if (reverseAssoc?.nature === 'oneToManyMorph') {
    relationUpdates.push(
      removeRelationMorph(association.model, {
        params: {
          alias: association.alias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
        },
        transacting,
      }).then(() =>
        addRelationMorph(association.model, {
          params: {
            id: response[association.model.primaryKey],
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

  const maxOrder = await association.model.morph
    .query(qb => {
      qb.max('order as order').where({
        [`${association.alias}_id`]: obj.refId,
        [`${association.alias}_type`]: targetModel.collectionName,
        field: obj.field,
      });
    })
    .fetch({ transacting });

  const { order = 0 } = maxOrder.toJSON();

  relationUpdates.push(
    addRelationMorph(association.model, {
      params: {
        id: response[association.model.primaryKey],
        alias: association.alias,
        ref: targetModel.collectionName,
        refId: obj.refId,
        field: obj.field,
        order: order + 1,
      },
      transacting,
    })
  );
};

const handleOneToManyMorph = (currentValue, association, response, details, relationUpdates, transacting) => {
  const model = strapi.db.getModel(details.collection || details.model, details.plugin);

  const promise = removeRelationMorph(model, {
    params: {
      alias: association.via,
      ref: association.model.collectionName,
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
            ref: association.model.collectionName,
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
};

// ============================================================================
// MAIN EXPORT
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

      morphResults.forEach((value, index) => {
        data[morphAssociations[index].alias] = value ? value.toJSON() : value;
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
      const nature = association.nature;

      // Handle simple associations
      if (associationHandlers[nature]) {
        return associationHandlers[nature](
          acc,
          current,
          property,
          response,
          details,
          assocModel,
          primaryKeyValue,
          relationUpdates,
          transacting,
          association
        );
      }

      // Handle manyWay (alias for manyToMany)
      if (nature === 'manyWay') {
        return associationHandlers.manyToMany(
          acc,
          current,
          property,
          response,
          { ...association, model: this },
          primaryKeyValue,
          relationUpdates,
          transacting
        );
      }

      // Handle morph associations
      if (nature === 'manyMorphToMany' || nature === 'manyMorphToOne') {
        const refs = params.values[current];

        if (Array.isArray(refs) && refs.length === 0) {
          relationUpdates.push(
            removeRelationMorph(this, { params: { id: primaryKeyValue }, transacting })
          );
          return acc;
        }

        refs.forEach(obj => {
          handleManyMorphToOne(obj, association, response, relationUpdates, transacting);
        });
        return acc;
      }

      if (nature === 'oneToManyMorph' || nature === 'manyToManyMorph') {
        const currentValue = transformToArrayID(params.values[current]);
        handleOneToManyMorph(currentValue, association, response, details, relationUpdates, transacting);
        return acc;
      }

      return acc;
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

    const values = {};
    this.associations.forEach(association => {
      const defaultValue = relationDefaults[association.nature];
      if (defaultValue !== undefined) {
        values[association.alias] = defaultValue;
      }
    });

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};
```