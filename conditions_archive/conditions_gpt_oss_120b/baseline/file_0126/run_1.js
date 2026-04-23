```javascript
'use strict';

const _ = require('lodash');
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

const addRelationMorph = async (model, { params, transacting }) => {
  await model.morph.forge().save(
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

const removeRelationMorph = async (model, { params, transacting }) => {
  await model.morph
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
    .destroy({ require: false, transacting });
};

/* ---------- Helper Functions for Update ---------- */

const handleOneToOne = ({
  model,
  association,
  details,
  property,
  response,
  primaryKeyValue,
  transacting,
  relationUpdates,
}) => {
  if (response[association.alias] === property) return;

  if (_.isNull(property)) {
    const promise = model
      .where({
        [model.primaryKey]: getValuePrimaryKey(response[association.alias], model.primaryKey),
      })
      .save({ [details.via]: null }, { method: 'update', patch: true, require: false, transacting });
    relationUpdates.push(promise);
    return null;
  }

  const promise = model
    .where({ [association.alias]: property })
    .save({ [association.alias]: null }, { method: 'update', patch: true, require: false, transacting })
    .then(() =>
      strapi.db
        .getModel(details.model || details.collection, details.plugin)
        .where({ [model.primaryKey]: property })
        .save({ [details.via]: primaryKeyValue }, { method: 'update', patch: true, require: false, transacting })
    );

  relationUpdates.push(promise);
  return property;
};

const handleOneToMany = ({
  model,
  association,
  details,
  property,
  response,
  primaryKeyValue,
  transacting,
  relationUpdates,
}) => {
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
  const currentIds = response[association.alias] || [];

  const toRemove = _.differenceWith(currentIds, property, (a, b) => {
    return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
  });

  const promise = assocModel
    .where(assocModel.primaryKey, 'in', toRemove.map(v => v[assocModel.primaryKey] || v))
    .save({ [details.via]: null }, { method: 'update', patch: true, require: false, transacting })
    .then(() =>
      assocModel
        .where(assocModel.primaryKey, 'in', property.map(v => v[assocModel.primaryKey] || v))
        .save({ [details.via]: primaryKeyValue }, { method: 'update', patch: true, require: false, transacting })
    );

  relationUpdates.push(promise);
};

const handleManyToMany = ({
  model,
  association,
  primaryKeyValue,
  transacting,
  relationUpdates,
  storedValue,
  currentValue,
}) => {
  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);
  const collection = model.forge({ [model.primaryKey]: primaryKeyValue })[association.alias]();

  const promise = collection.detach(toRemove, { transacting }).then(() => collection.attach(toAdd, { transacting }));
  relationUpdates.push(promise);
};

const handleMorphRelations = async ({
  model,
  association,
  property,
  response,
  transacting,
  relationUpdates,
}) => {
  const refs = property;

  if (Array.isArray(refs) && refs.length === 0) {
    relationUpdates.push(
      removeRelationMorph(model, { params: { id: response[model.primaryKey] }, transacting })
    );
    return;
  }

  for (const obj of refs) {
    const targetModel = strapi.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );

    const reverseAssoc = targetModel.associations.find(a => a.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      const promise = removeRelationMorph(model, {
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
      );
      relationUpdates.push(promise);
      continue;
    }

    const maxOrderResult = await model.morph
      .query(qb => {
        qb.max('order as order').where({
          [`${association.alias}_id`]: obj.refId,
          [`${association.alias}_type`]: targetModel.collectionName,
          field: obj.field,
        });
      })
      .fetch({ transacting });

    const { order = 0 } = maxOrderResult.toJSON();

    const promise = addRelationMorph(model, {
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

    relationUpdates.push(promise);
  }
};

const handleReverseMorph = ({
  model,
  association,
  details,
  property,
  response,
  transacting,
  relationUpdates,
}) => {
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
  }).then(() => {
    return Promise.all(
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
    );
  });

  relationUpdates.push(promise);
};

/* ---------- Exported Methods ---------- */

module.exports = {
  async findOne(params, populate, { transacting } = {}) {
    const record = await this.forge({
      [this.primaryKey]: getValuePrimaryKey(params, this.primaryKey),
    }).fetch({ transacting, withRelated: populate });

    const data = record ? record.toJSON() : record;

    if (_.isEmpty(populate)) {
      const promises = this.associations
        .filter(a => ['manyMorphToOne', 'manyMorphToMany'].includes(a.nature))
        .map(() =>
          this.morph
            .forge()
            .where({ [`${this.collectionName}_id`]: getValuePrimaryKey(params, this.primaryKey) })
            .fetchAll({ transacting })
        );

      const related = await Promise.all(promises);
      related.forEach((value, idx) => {
        data[this.associations[idx].alias] = value ? value.toJSON() : value;
      });
    }

    return data;
  },

  async update(params, { transacting } = {}) {
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await this.findOne(params, null, { transacting });
    const relationUpdates = [];
    const values = {};

    for (const [key, property] of Object.entries(params.values || {})) {
      const association = this.associations.find(a => a.alias === key);
      const details = this._attributes[key];

      if (!association && _.get(details, 'isVirtual') !== true) {
        values[key] = property;
        continue;
      }

      switch (association.nature) {
        case 'oneWay':
          values[key] = _.get(property, details.model ? strapi.db.getModel(details.model).primaryKey : details.primaryKey, property);
          break;

        case 'oneToOne':
          values[key] = handleOneToOne({
            model: this,
            association,
            details,
            property,
            response,
            primaryKeyValue,
            transacting,
            relationUpdates,
          });
          break;

        case 'oneToMany':
          handleOneToMany({
            model: this,
            association,
            details,
            property,
            response,
            primaryKeyValue,
            transacting,
            relationUpdates,
          });
          break;

        case 'manyToOne':
          values[key] = _.get(property, details.model ? strapi.db.getModel(details.model).primaryKey : details.primaryKey, property);
          break;

        case 'manyWay':
        case 'manyToMany':
          handleManyToMany({
            model: this,
            association,
            primaryKeyValue,
            transacting,
            relationUpdates,
            storedValue: transformToArrayID(response[key]),
            currentValue: transformToArrayID(property),
          });
          break;

        case 'manyMorphToMany':
        case 'manyMorphToOne':
          await handleMorphRelations({
            model: this,
            association,
            property,
            response,
            transacting,
            relationUpdates,
          });
          break;

        case 'oneToManyMorph':
        case 'manyToManyMorph':
          handleReverseMorph({
            model: this,
            association,
            details,
            property,
            response,
            transacting,
            relationUpdates,
          });
          break;

        case 'oneMorphToOne':
        case 'oneMorphToMany':
          // No specific handling required
          break;

        default:
          break;
      }
    }

    await Promise.all(relationUpdates);

    delete values[this.primaryKey];
    if (!_.isEmpty(values)) {
      await this.forge({ [this.primaryKey]: primaryKeyValue }).save(values, {
        patch: true,
        transacting,
      });
    }

    const result = await this.forge({ [this.primaryKey]: primaryKeyValue }).fetch({ transacting });
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
```