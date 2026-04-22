```javascript
'use strict';

const _ = require('lodash');
const {
  models: { getValuePrimaryKey },
} = require('strapi-utils');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const transformToArrayID = array => {
  if (_.isArray(array)) {
    return array
      .map(v => _.get(v, 'id') || v)
      .filter(Boolean)
      .map(v => _.toString(v));
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

const fetchMorphRelations = async (model, pk, transacting) => {
  return model.morph
    .forge()
    .where({ [`${model.collectionName}_id`]: pk })
    .fetchAll({ transacting });
};

const getMaxOrder = async (model, association, obj, transacting) => {
  const max = await model.morph
    .query(qb => {
      qb.max('order as order').where({
        [`${association.alias}_id`]: obj.refId,
        [`${association.alias}_type`]: obj.targetModel.collectionName,
        field: obj.field,
      });
    })
    .fetch({ transacting });
  return (max && max.toJSON().order) || 0;
};

const handleOneToOne = async ({
  association,
  details,
  property,
  response,
  primaryKeyValue,
  transacting,
  thisModel,
}) => {
  if (response[association.alias] === property) return {};

  if (_.isNull(property)) {
    const pk = getValuePrimaryKey(response[association.alias], association.model.primaryKey);
    await association.model
      .where({ [association.model.primaryKey]: pk })
      .save({ [details.via]: null }, { method: 'update', patch: true, require: false, transacting });
    return { [association.alias]: null };
  }

  await thisModel
    .where({ [association.alias]: property })
    .save({ [association.alias]: null }, { method: 'update', patch: true, require: false, transacting });

  await association.model
    .where({ [association.model.primaryKey]: property })
    .save({ [details.via]: primaryKeyValue }, { method: 'update', patch: true, require: false, transacting });

  return { [association.alias]: property };
};

const handleOneToMany = async ({
  assocModel,
  details,
  property,
  response,
  primaryKeyValue,
  transacting,
}) => {
  const currentIds = response[details.alias];
  const toRemove = _.differenceWith(currentIds, property, (a, b) =>
    `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`
  );

  await assocModel
    .where(assocModel.primaryKey, 'in', toRemove.map(v => v[assocModel.primaryKey] || v))
    .save({ [details.via]: null }, { method: 'update', patch: true, require: false, transacting });

  await assocModel
    .where(assocModel.primaryKey, 'in', property.map(v => v[assocModel.primaryKey] || v))
    .save({ [details.via]: primaryKeyValue }, { method: 'update', patch: true, require: false, transacting });
};

const handleManyToMany = async ({
  thisModel,
  association,
  primaryKeyValue,
  storedValue,
  currentValue,
  transacting,
}) => {
  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);
  const collection = thisModel.forge({ [thisModel.primaryKey]: primaryKeyValue })[association.alias]();

  await collection.detach(toRemove, { transacting });
  await collection.attach(toAdd, { transacting });
};

const handleMorphRelations = async ({
  thisModel,
  association,
  primaryKeyValue,
  refs,
  response,
  transacting,
}) => {
  if (Array.isArray(refs) && refs.length === 0) {
    await removeRelationMorph(thisModel, { params: { id: primaryKeyValue }, transacting });
    return;
  }

  for (const obj of refs) {
    const targetModel = strapi.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );

    const reverseAssoc = targetModel.associations.find(a => a.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      await removeRelationMorph(thisModel, {
        params: {
          alias: association.alias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
        },
        transacting,
      });
      await addRelationMorph(thisModel, {
        params: {
          id: response[thisModel.primaryKey],
          alias: association.alias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
          order: 1,
        },
        transacting,
      });
      continue;
    }

    const order = (await getMaxOrder(thisModel, association, { ...obj, targetModel }, transacting)) + 1;
    await addRelationMorph(thisModel, {
      params: {
        id: response[thisModel.primaryKey],
        alias: association.alias,
        ref: targetModel.collectionName,
        refId: obj.refId,
        field: obj.field,
        order,
      },
      transacting,
    });
  }
};

const handleModelToMorph = async ({
  thisModel,
  association,
  response,
  currentValue,
  transacting,
}) => {
  const targetModel = strapi.db.getModel(
    association.details.collection || association.details.model,
    association.details.plugin
  );

  await removeRelationMorph(targetModel, {
    params: {
      alias: association.via,
      ref: thisModel.collectionName,
      refId: response.id,
      field: association.alias,
    },
    transacting,
  });

  for (let i = 0; i < currentValue.length; i++) {
    await addRelationMorph(targetModel, {
      params: {
        id: currentValue[i],
        alias: association.via,
        ref: thisModel.collectionName,
        refId: response.id,
        field: association.alias,
        order: i + 1,
      },
      transacting,
    });
  }
};

// ---------------------------------------------------------------------------
// Exported methods
// ---------------------------------------------------------------------------
module.exports = {
  async findOne(params, populate, { transacting } = {}) {
    const pk = getValuePrimaryKey(params, this.primaryKey);
    const record = await this.forge({ [this.primaryKey]: pk }).fetch({
      transacting,
      withRelated: populate,
    });

    const data = record ? record.toJSON() : record;

    if (_.isEmpty(populate)) {
      const promises = this.associations
        .filter(a => ['manyMorphToOne', 'manyMorphToMany'].includes(a.nature))
        .map(() => fetchMorphRelations(this, pk, transacting));

      const related = await Promise.all(promises);
      related.forEach((value, idx) => {
        data[this.associations[idx].alias] = value ? value.toJSON() : value;
      });
    }

    return data;
  },

  async update(params, { transacting } = {}) {
    const pk = getValuePrimaryKey(params, this.primaryKey);
    const response = await this.findOne(params, null, { transacting });
    const values = {};

    for (const key of Object.keys(removeUndefinedKeys(params.values))) {
      const property = params.values[key];
      const association = this.associations.find(a => a.alias === key);
      const details = this._attributes[key];

      if (!association && _.get(details, 'isVirtual') !== true) {
        values[key] = property;
        continue;
      }

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

      switch (association.nature) {
        case 'oneWay':
          values[key] = _.get(property, assocModel.primaryKey, property);
          break;

        case 'oneToOne':
          Object.assign(values, await handleOneToOne({
            association,
            details,
            property,
            response,
            primaryKeyValue: pk,
            transacting,
            thisModel: this,
          }));
          break;

        case 'oneToMany':
          await handleOneToMany({
            assocModel,
            details,
            property,
            response,
            primaryKeyValue: pk,
            transacting,
          });
          break;

        case 'manyToOne':
          values[key] = _.get(property, assocModel.primaryKey, property);
          break;

        case 'manyWay':
        case 'manyToMany':
          const stored = transformToArrayID(response[key]);
          const current = transformToArrayID(params.values[key]);
          await handleManyToMany({
            thisModel: this,
            association,
            primaryKeyValue: pk,
            storedValue: stored,
            currentValue: current,
            transacting,
          });
          break;

        case 'manyMorphToMany':
        case 'manyMorphToOne':
          await handleMorphRelations({
            thisModel: this,
            association,
            primaryKeyValue: pk,
            refs: params.values[key],
            response,
            transacting,
          });
          break;

        case 'oneToManyMorph':
        case 'manyToManyMorph':
          await handleModelToMorph({
            thisModel: this,
            association: { ...association, details },
            response,
            currentValue: transformToArrayID(params.values[key]),
            transacting,
          });
          break;

        case 'oneMorphToOne':
        case 'oneMorphToMany':
          // No operation required
          break;

        default:
          break;
      }
    }

    await Promise.all([]); // placeholder for any async ops already awaited above

    if (!_.isEmpty(values)) {
      await this.forge({ [this.primaryKey]: pk }).save(values, { patch: true, transacting });
    }

    const result = await this.forge({ [this.primaryKey]: pk }).fetch({ transacting });
    return result && result.toJSON ? result.toJSON() : result;
  },

  deleteRelations(id, { transacting }) {
    const values = {};

    this.associations.forEach(assoc => {
      switch (assoc.nature) {
        case 'oneWay':
        case 'oneToOne':
        case 'manyToOne':
        case 'oneToManyMorph':
          values[assoc.alias] = null;
          break;
        case 'manyWay':
        case 'oneToMany':
        case 'manyToMany':
        case 'manyToManyMorph':
        case 'manyMorphToMany':
        case 'manyMorphToOne':
          values[assoc.alias] = [];
          break;
        default:
          break;
      }
    });

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};
```