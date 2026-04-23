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

/* -------------------------------------------------------------------------- */
/* Helper utilities */
/* -------------------------------------------------------------------------- */

/**
 * Convert various inputs to an array of string IDs.
 * @param {*} array
 * @returns {string[]}
 */
const transformToArrayID = array => {
  if (_.isArray(array)) {
    return array
      .map(value => _.get(value, 'id') || value)
      .filter(n => n)
      .map(val => _.toString(val));
  }
  return transformToArrayID([array]);
};

/**
 * Remove keys with undefined values.
 * @param {Object} obj
 * @returns {Object}
 */
const removeUndefinedKeys = obj => _.pickBy(obj, _.negate(_.isUndefined));

/**
 * Add a morph relation.
 */
const addRelationMorph = async (model, { params, transacting } = {}) => {
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

/**
 * Remove a morph relation.
 */
const removeRelationMorph = async (model, { params, transacting } = {}) => {
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
    .destroy({
      require: false,
      transacting,
    });
};

/* -------------------------------------------------------------------------- */
/* Association handlers (polymorphic strategy) */
/* -------------------------------------------------------------------------- */

const associationHandlers = {
  oneWay: ({ acc, current, property, assocModel }) => {
    _.set(acc, current, _.get(property, assocModel.primaryKey, property));
    return acc;
  },

  oneToOne: async ({
    acc,
    current,
    property,
    response,
    assocModel,
    details,
    primaryKeyValue,
    relationUpdates,
    transacting,
    thisModel,
  }) => {
    if (response[current] === property) return acc;

    if (_.isNull(property)) {
      const updatePromise = assocModel
        .where({
          [assocModel.primaryKey]: getValuePrimaryKey(
            response[current],
            assocModel.primaryKey
          ),
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
      relationUpdates.push(updatePromise);
      _.set(acc, current, null);
      return acc;
    }

    const updateLink = thisModel
      .where({ [current]: property })
      .save(
        { [current]: null },
        {
          method: 'update',
          patch: true,
          require: false,
          transacting,
        }
      )
      .then(() =>
        assocModel.where({ [assocModel.primaryKey]: property }).save(
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
    _.set(acc, current, property);
    return acc;
  },

  oneToMany: async ({
    acc,
    current,
    property,
    response,
    assocModel,
    details,
    primaryKeyValue,
    relationUpdates,
    transacting,
  }) => {
    const currentIds = response[current];
    const toRemove = _.differenceWith(currentIds, property, (a, b) => {
      return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
    });

    const updatePromise = assocModel
      .where(
        assocModel.primaryKey,
        'in',
        toRemove.map(val => val[assocModel.primaryKey] || val)
      )
      .save(
        { [details.via]: null },
        {
          method: 'update',
          patch: true,
          require: false,
          transacting,
        }
      )
      .then(() =>
        assocModel
          .where(
            assocModel.primaryKey,
            'in',
            property.map(val => val[assocModel.primaryKey] || val)
          )
          .save(
            { [details.via]: primaryKeyValue },
            {
              method: 'update',
              patch: true,
              require: false,
              transacting,
            }
          )
      );

    relationUpdates.push(updatePromise);
    return acc;
  },

  manyToOne: ({ acc, current, property, assocModel }) => {
    _.set(acc, current, _.get(property, assocModel.primaryKey, property));
    return acc;
  },

  manyWay: handleManyToMany,
  manyToMany: handleManyToMany,

  manyMorphToMany: handleManyMorph,
  manyMorphToOne: handleManyMorph,

  oneToManyMorph: handleMorphModelToMedia,
  manyToManyMorph: handleMorphModelToMedia,

  oneMorphToOne: () => {},
  oneMorphToMany: () => {},
};

/**
 * Handler for manyWay / manyToMany associations.
 */
async function handleManyToMany({
  acc,
  current,
  property,
  response,
  primaryKeyValue,
  relationUpdates,
  thisModel,
  transacting,
}) {
  const storedValue = transformToArrayID(response[current]);
  const currentValue = transformToArrayID(property);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = thisModel.forge({ [thisModel.primaryKey]: primaryKeyValue })[association.alias]();

  const updatePromise = collection
    .detach(toRemove, { transacting })
    .then(() => collection.attach(toAdd, { transacting }));

  relationUpdates.push(updatePromise);
  return acc;
}

/**
 * Handler for manyMorph* associations.
 */
async function handleManyMorph({
  acc,
  current,
  property,
  response,
  primaryKeyValue,
  relationUpdates,
  thisModel,
  transacting,
  association,
}) {
  const refs = property;

  if (Array.isArray(refs) && refs.length === 0) {
    relationUpdates.push(
      removeRelationMorph(thisModel, { params: { id: primaryKeyValue }, transacting })
    );
    return acc;
  }

  for (const obj of refs) {
    const targetModel = strapi.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );

    const reverseAssoc = targetModel.associations.find(a => a.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      relationUpdates.push(
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

    relationUpdates.push(addRelation());
  }

  return acc;
}

/**
 * Handler for model -> media morph relations.
 */
async function handleMorphModelToMedia({
  acc,
  current,
  property,
  response,
  thisModel,
  transacting,
  association,
  details,
}) {
  const currentValue = transformToArrayID(property);
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

  relationUpdates.push(promise);
  return acc;
}

/* -------------------------------------------------------------------------- */
/* Core module exports */
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
    const response = await module.exports.findOne.call(this, params, null, { transacting });

    const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, current) => {
      const property = params.values[current];
      const association = this.associations.find(a => a.alias === current);
      const details = this._attributes[current];

      if (!association && _.get(details, 'isVirtual') !== true) {
        _.set(acc, current, property);
        return acc;
      }

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
      const handler = associationHandlers[association.nature] || (() => {});

      // Some handlers are async; ensure we await them.
      const result = handler({
        acc,
        current,
        property,
        response,
        assocModel,
        details,
        primaryKeyValue,
        relationUpdates,
        transacting,
        thisModel: this,
        association,
      });

      // If handler returns a promise, we push it to a temporary list.
      if (result && typeof result.then === 'function') {
        relationUpdates.push(result);
        return acc;
      }

      return result || acc;
    }, {});

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

    const defaultValueMap = {
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

    this.associations.forEach(association => {
      const defaultValue = defaultValueMap[association.nature];
      if (defaultValue !== undefined) {
        values[association.alias] = _.cloneDeep(defaultValue);
      }
    });

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};
```