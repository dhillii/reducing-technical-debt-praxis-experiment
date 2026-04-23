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
  return await model.morph.forge().save(
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
  return await model.morph
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

/* ---------- Predicate helpers ---------- */

/** @returns {boolean} */
const isNull = value => _.isNull(value);

/** @returns {boolean} */
const isEmptyArray = arr => Array.isArray(arr) && arr.length === 0;

/* ---------- Nature handlers ---------- */

const natureHandlers = {
  oneWay: ({ property, assocModel, acc, current }) =>
    _.set(acc, current, _.get(property, assocModel.primaryKey, property)),

  manyToOne: ({ property, assocModel, acc, current }) =>
    _.set(acc, current, _.get(property, assocModel.primaryKey, property)),

  oneToOne: async ({
    property,
    assocModel,
    response,
    primaryKeyValue,
    transacting,
    acc,
    current,
    details,
    thisModel,
  }) => {
    if (response[current] === property) return acc;

    if (isNull(property)) {
      const updatePromise = assocModel
        .where({
          [assocModel.primaryKey]: getValuePrimaryKey(response[current], assocModel.primaryKey),
        })
        .save({ [details.via]: null }, { method: 'update', patch: true, require: false, transacting });

      thisModel._relationUpdates.push(updatePromise);
      return _.set(acc, current, null);
    }

    const updateLink = thisModel
      .where({ [current]: property })
      .save({ [current]: null }, { method: 'update', patch: true, require: false, transacting })
      .then(() =>
        assocModel
          .where({ [assocModel.primaryKey]: property })
          .save({ [details.via]: primaryKeyValue }, { method: 'update', patch: true, require: false, transacting })
      );

    thisModel._relationUpdates.push(updateLink);
    return _.set(acc, current, property);
  },

  oneToMany: async ({
    property,
    assocModel,
    response,
    primaryKeyValue,
    transaging,
    acc,
    current,
    thisModel,
  }) => {
    const currentIds = response[current];
    const toRemove = _.differenceWith(currentIds, property, (a, b) => {
      return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
    });

    const updatePromise = assocModel
      .where(assocModel.primaryKey, 'in', toRemove.map(v => v[assocModel.primaryKey] || v))
      .save({ [details.via]: null }, { method: 'update', patch: true, require: false, transacting })
      .then(() =>
        assocModel
          .where(assocModel.primaryKey, 'in', property.map(v => v[assocModel.primaryKey] || v))
          .save({ [details.via]: primaryKeyValue }, { method: 'update', patch: true, require: false, transacting })
      );

    thisModel._relationUpdates.push(updatePromise);
    return acc;
  },

  manyWay: handleManyToMany,
  manyToMany: handleManyToMany,

  manyMorphToMany: handleManyMorph,
  manyMorphToOne: handleManyMorph,

  oneToManyMorph: handleMorphToManyOrManyToMany,
  manyToManyMorph: handleMorphToManyOrManyToMany,

  oneMorphToOne: () => {}, // no-op
  oneMorphToMany: () => {}, // no-op
};

/* ---------- Handler implementations ---------- */

async function handleManyToMany({
  response,
  params,
  primaryKeyValue,
  transacting,
  acc,
  current,
  thisModel,
}) {
  const storedValue = transformToArrayID(response[current]);
  const currentValue = transformToArrayID(params.values[current]);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = thisModel.forge({ [thisModel.primaryKey]: primaryKeyValue })[association.alias]();

  const updatePromise = collection.detach(toRemove, { transacting }).then(() => collection.attach(toAdd, { transacting }));
  thisModel._relationUpdates.push(updatePromise);
  return acc;
}

async function handleManyMorph({
  params,
  response,
  primaryKeyValue,
  transacting,
  acc,
  current,
  thisModel,
  association,
}) {
  const refs = params.values[current];

  if (isEmptyArray(refs)) {
    thisModel._relationUpdates.push(
      removeRelationMorph(thisModel, { params: { id: primaryKeyValue }, transacting })
    );
    return acc;
  }

  for (const obj of refs) {
    const targetModel = strapi.db.getModel(obj.ref, obj.source !== 'content-manager' ? obj.source : null);
    const reverseAssoc = targetModel.associations.find(a => a.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      thisModel._relationUpdates.push(
        removeRelationMorph(thisModel, {
          params: {
            alias: association.alias,
            ref: targetModel.collectionName,
            refId: obj.refId,
            field: obj.field,
          },
          transacting,
        }).then(() =>
          addRelationMorph(thisModel, {
            params: {
              id: response[thisModel.primaryKey],
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

    const addRelation = async () => {
      const maxOrder = await thisModel.morph
        .query(qb => {
          qb.max('order as order').where({
            [`${association.alias}_id`]: obj.refId,
            [`${association.alias}_type`]: targetModel.collectionName,
            field: obj.field,
          });
        })
        .fetch({ transacting });

      const { order = 0 } = maxOrder.toJSON();

      await addRelationMorph(thisModel, {
        params: {
          id: response[thisModel.primaryKey],
          alias: association.alias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
          order: order + 1,
        },
        transacting,
      });
    };

    thisModel._relationUpdates.push(addRelation());
  }

  return acc;
}

async function handleMorphToManyOrManyToMany({
  params,
  response,
  primaryKeyValue,
  transacting,
  acc,
  current,
  thisModel,
  association,
  details,
}) {
  const currentValue = transformToArrayID(params.values[current]);
  const model = strapi.db.getModel(details.collection || details.model, details.plugin);

  const promise = removeRelationMorph(model, {
    params: {
      alias: association.via,
      ref: thisModel.collectionName,
      refId: response.id,
      field: association.alias,
    },
    transacting,
  }).then(() => {
    return Promise.all(
      currentValue.map((id, idx) =>
        addRelationMorph(model, {
          params: {
            id,
            alias: association.via,
            ref: thisModel.collectionName,
            refId: response.id,
            field: association.alias,
            order: idx + 1,
          },
          transacting,
        })
      )
    );
  });

  thisModel._relationUpdates.push(promise);
  return acc;
}

/* ---------- Exported methods ---------- */

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
            .where({
              [`${this.collectionName}_id`]: getValuePrimaryKey(params, this.primaryKey),
            })
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
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, { transacting });

    this._relationUpdates = [];

    const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, current) => {
      const property = params.values[current];
      const association = this.associations.find(x => x.alias === current);
      const details = this._attributes[current];

      if (!association && _.get(details, 'isVirtual') !== true) {
        return _.set(acc, current, property);
      }

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
      const handler = natureHandlers[association.nature];

      if (!handler) return acc;

      const context = {
        property,
        assocModel,
        response,
        primaryKeyValue,
        transacting,
        acc,
        current,
        details,
        thisModel: this,
        association,
        params,
      };

      const result = handler(context);
      return result instanceof Promise ? result : result;
    }, {});

    await Promise.all(this._relationUpdates);

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
      }
    });

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};
```