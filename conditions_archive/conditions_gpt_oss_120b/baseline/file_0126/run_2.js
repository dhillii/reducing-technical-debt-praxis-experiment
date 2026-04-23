```javascript
'use strict';

/**
 * Module dependencies
 */

// Public node modules.
const _ = require('lodash');

// Utils
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
  return model.morph
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
    .destroy({
      require: false,
      transacting,
    });
};

/* -------------------------------------------------------------------------- */
/* Helper functions for relation handling                                      */
/* -------------------------------------------------------------------------- */

const handleOneToOne = async ({
  model,
  assoc,
  details,
  property,
  response,
  primaryKeyValue,
  transacting,
  updates,
}) => {
  if (response[assoc.alias] === property) return;

  if (_.isNull(property)) {
    const promise = strapi
      .db
      .getModel(details.model || details.collection, details.plugin)
      .where({
        [strapi.db.getModel(details.model || details.collection, details.plugin).primaryKey]:
          getValuePrimaryKey(response[assoc.alias], strapi.db.getModel(details.model || details.collection, details.plugin).primaryKey),
      })
      .save(
        { [details.via]: null },
        {
          method: 'update',
          patch: true,
          require: false,
          transacting,
        }
      );

    updates.push(promise);
    return null;
  }

  const promise = model
    .where({ [assoc.alias]: property })
    .save(
      { [assoc.alias]: null },
      {
        method: 'update',
        patch: true,
        require: false,
        transacting,
      }
    )
    .then(() => {
      const target = strapi.db.getModel(details.model || details.collection, details.plugin);
      return target
        .where({ [target.primaryKey]: property })
        .save(
          { [details.via]: primaryKeyValue },
          {
            method: 'update',
            patch: true,
            require: false,
            transacting,
          }
        );
    });

  updates.push(promise);
  return property;
};

const handleOneToMany = async ({
  model,
  assoc,
  details,
  property,
  response,
  primaryKeyValue,
  transacting,
  updates,
}) => {
  const target = strapi.db.getModel(details.model || details.collection, details.plugin);
  const currentIds = response[assoc.alias] || [];

  const toRemove = _.differenceWith(
    currentIds,
    property,
    (a, b) => `${a[target.primaryKey] || a}` === `${b[target.primaryKey] || b}`
  );

  const removePromise = target
    .where(
      target.primaryKey,
      'in',
      toRemove.map(v => v[target.primaryKey] || v)
    )
    .save(
      { [details.via]: null },
      {
        method: 'update',
        patch: true,
        require: false,
        transacting,
      }
    );

  const addPromise = target
    .where(
      target.primaryKey,
      'in',
      property.map(v => v[target.primaryKey] || v)
    )
    .save(
      { [details.via]: primaryKeyValue },
      {
        method: 'update',
        patch: true,
        require: false,
        transacting,
      }
    );

  updates.push(removePromise.then(() => addPromise));
};

const handleManyToMany = ({
  model,
  assoc,
  primaryKeyValue,
  storedValue,
  currentValue,
  transacting,
  updates,
}) => {
  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = model.forge({ [model.primaryKey]: primaryKeyValue })[assoc.alias]();

  const promise = collection
    .detach(toRemove, { transacting })
    .then(() => collection.attach(toAdd, { transacting }));

  updates.push(promise);
};

const handleMorphRelations = async ({
  model,
  assoc,
  property,
  response,
  primaryKeyValue,
  transacting,
  updates,
}) => {
  if (Array.isArray(property) && property.length === 0) {
    updates.push(
      removeRelationMorph(model, {
        params: { id: primaryKeyValue },
        transacting,
      })
    );
    return;
  }

  for (const obj of property) {
    const targetModel = strapi.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );

    const reverseAssoc = targetModel.associations.find(a => a.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      const promise = removeRelationMorph(model, {
        params: {
          alias: assoc.alias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
        },
        transacting,
      }).then(() =>
        addRelationMorph(model, {
          params: {
            id: response[model.primaryKey],
            alias: assoc.alias,
            ref: targetModel.collectionName,
            refId: obj.refId,
            field: obj.field,
            order: 1,
          },
          transacting,
        })
      );

      updates.push(promise);
      continue;
    }

    const maxOrderResult = await model.morph
      .query(qb => {
        qb.max('order as order').where({
          [`${assoc.alias}_id`]: obj.refId,
          [`${assoc.alias}_type`]: targetModel.collectionName,
          field: obj.field,
        });
      })
      .fetch({ transacting });

    const { order = 0 } = maxOrderResult.toJSON();

    const promise = addRelationMorph(model, {
      params: {
        id: response[model.primaryKey],
        alias: assoc.alias,
        ref: targetModel.collectionName,
        refId: obj.refId,
        field: obj.field,
        order: order + 1,
      },
      transacting,
    });

    updates.push(promise);
  }
};

const handleReverseMorph = async ({
  model,
  assoc,
  property,
  response,
  transacting,
  updates,
}) => {
  const currentIds = transformToArrayID(property);
  const target = strapi.db.getModel(assoc.collection || assoc.model, assoc.plugin);

  const cleanPromise = removeRelationMorph(target, {
    params: {
      alias: assoc.via,
      ref: model.collectionName,
      refId: response.id,
      field: assoc.alias,
    },
    transacting,
  });

  const attachPromises = currentIds.map((id, idx) =>
    addRelationMorph(target, {
      params: {
        id,
        alias: assoc.via,
        ref: model.collectionName,
        refId: response.id,
        field: assoc.alias,
        order: idx + 1,
      },
      transacting,
    })
  );

  updates.push(cleanPromise.then(() => Promise.all(attachPromises)));
};

/* -------------------------------------------------------------------------- */
/* Exported methods                                                            */
/* -------------------------------------------------------------------------- */

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
      const promises = this.associations
        .filter(a => ['manyMorphToOne', 'manyMorphToMany'].includes(a.nature))
        .map(() =>
          this.morph
            .forge()
            .where({
              [`${this.collectionName}_id`]: getValuePrimaryKey(params, this.primaryKey),
            })
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
    const relationUpdates = [];
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, {
      transacting,
    });

    const cleanValues = removeUndefinedKeys(params.values);
    const patch = {};

    for (const key of Object.keys(cleanValues)) {
      const property = cleanValues[key];
      const association = this.associations.find(a => a.alias === key);
      const details = this._attributes[key];

      if (!association && _.get(details, 'isVirtual') !== true) {
        _.set(patch, key, property);
        continue;
      }

      const targetModel = strapi.db.getModel(details.model || details.collection, details.plugin);

      switch (association.nature) {
        case 'oneWay':
          _.set(patch, key, _.get(property, targetModel.primaryKey, property));
          break;

        case 'oneToOne':
          _.set(
            patch,
            key,
            await handleOneToOne({
              model: this,
              assoc: association,
              details,
              property,
              response,
              primaryKeyValue,
              transacting,
              updates: relationUpdates,
            })
          );
          break;

        case 'oneToMany':
          await handleOneToMany({
            model: this,
            assoc: association,
            details,
            property,
            response,
            primaryKeyValue,
            transacting,
            updates: relationUpdates,
          });
          break;

        case 'manyToOne':
          _.set(patch, key, _.get(property, targetModel.primaryKey, property));
          break;

        case 'manyWay':
        case 'manyToMany':
          handleManyToMany({
            model: this,
            assoc: association,
            primaryKeyValue,
            storedValue: transformToArrayID(response[key]),
            currentValue: transformToArrayID(params.values[key]),
            transacting,
            updates: relationUpdates,
          });
          break;

        case 'manyMorphToMany':
        case 'manyMorphToOne':
          await handleMorphRelations({
            model: this,
            assoc: association,
            property,
            response,
            primaryKeyValue,
            transacting,
            updates: relationUpdates,
          });
          break;

        case 'oneToManyMorph':
        case 'manyToManyMorph':
          await handleReverseMorph({
            model: this,
            assoc: association,
            property,
            response,
            transacting,
            updates: relationUpdates,
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

    delete patch[this.primaryKey];
    if (!_.isEmpty(patch)) {
      await this.forge({
        [this.primaryKey]: primaryKeyValue,
      }).save(patch, { patch: true, transacting });
    }

    const result = await this.forge({
      [this.primaryKey]: primaryKeyValue,
    }).fetch({ transacting });

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