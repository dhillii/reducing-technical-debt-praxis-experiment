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

/**
 * Transform input to an array of string IDs.
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
 * @param {Object} model
 * @param {Object} options
 */
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

/**
 * Remove a morph relation.
 * @param {Object} model
 * @param {Object} options
 */
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

/**
 * Handlers for each association nature.
 */
const associationHandlers = {
  oneWay: async ({ property, assocModel, details, acc, relationUpdates }) => {
    _.set(acc, details.alias, _.get(property, assocModel.primaryKey, property));
    return acc;
  },

  manyToOne: async ({ property, assocModel, details, acc }) => {
    _.set(acc, details.alias, _.get(property, assocModel.primaryKey, property));
    return acc;
  },

  oneToOne: async ({
    property,
    assocModel,
    details,
    response,
    primaryKeyValue,
    transacting,
    relationUpdates,
    acc,
  }) => {
    if (response[details.alias] === property) return acc;

    if (_.isNull(property)) {
      const updatePromise = assocModel
        .where({
          [assocModel.primaryKey]: getValuePrimaryKey(response[details.alias], assocModel.primaryKey),
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
      _.set(acc, details.alias, null);
      return acc;
    }

    const updateLink = this.where({ [details.alias]: property })
      .save(
        { [details.alias]: null },
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
    _.set(acc, details.alias, property);
    return acc;
  },

  oneToMany: async ({
    property,
    assocModel,
    details,
    response,
    primaryKeyValue,
    transacting,
    relationUpdates,
    acc,
  }) => {
    const currentIds = response[details.alias];
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

  manyWay: async ({ property, association, thisModel, primaryKeyValue, transacting, relationUpdates, acc }) => {
    // fallthrough to manyToMany handler
    return associationHandlers.manyToMany({
      property,
      association,
      thisModel,
      primaryKeyValue,
      transacting,
      relationUpdates,
      acc,
    });
  },

  manyToMany: async ({
    property,
    association,
    thisModel,
    primaryKeyValue,
    transacting,
    relationUpdates,
    acc,
  }) => {
    const storedValue = transformToArrayID(thisModel.forge({ [thisModel.primaryKey]: primaryKeyValue })[association.alias]().fetchAll({ transacting }).then(r => r.toJSON()));
    const currentValue = transformToArrayID(property);

    const toAdd = _.difference(currentValue, storedValue);
    const toRemove = _.difference(storedValue, currentValue);

    const collection = thisModel.forge({ [thisModel.primaryKey]: primaryKeyValue })[association.alias]();

    const updatePromise = collection
      .detach(toRemove, { transacting })
      .then(() => collection.attach(toAdd, { transacting }));

    relationUpdates.push(updatePromise);
    return acc;
  },

  manyMorphToMany: async ({
    property,
    association,
    thisModel,
    primaryKeyValue,
    transacting,
    relationUpdates,
    acc,
  }) => {
    // Shared logic with manyMorphToOne
    return handleMorphRelations({
      refs: property,
      association,
      thisModel,
      primaryKeyValue,
      transacting,
      relationUpdates,
    });
  },

  manyMorphToOne: async ({
    property,
    association,
    thisModel,
    primaryKeyValue,
    transacting,
    relationUpdates,
    acc,
  }) => {
    return handleMorphRelations({
      refs: property,
      association,
      thisModel,
      primaryKeyValue,
      transacting,
      relationUpdates,
    });
  },

  oneToManyMorph: async ({
    property,
    association,
    thisModel,
    primaryKeyValue,
    transacting,
    relationUpdates,
    acc,
  }) => {
    return handleReverseMorph({
      refs: property,
      association,
      thisModel,
      primaryKeyValue,
      transacting,
      relationUpdates,
    });
  },

  manyToManyMorph: async ({
    property,
    association,
    thisModel,
    primaryKeyValue,
    transacting,
    relationUpdates,
    acc,
  }) => {
    return handleReverseMorph({
      refs: property,
      association,
      thisModel,
      primaryKeyValue,
      transacting,
      relationUpdates,
    });
  },

  oneMorphToOne: async () => {
    // No operation needed
    return {};
  },

  oneMorphToMany: async () => {
    // No operation needed
    return {};
  },
};

/**
 * Handle morph relations (manyMorphToMany / manyMorphToOne).
 */
const handleMorphRelations = async ({
  refs,
  association,
  thisModel,
  primaryKeyValue,
  transacting,
  relationUpdates,
}) => {
  if (Array.isArray(refs) && refs.length === 0) {
    relationUpdates.push(
      removeRelationMorph(thisModel, { params: { id: primaryKeyValue }, transacting })
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
              id: primaryKeyValue,
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
          id: primaryKeyValue,
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
};

/**
 * Handle reverse morph relations (oneToManyMorph / manyToManyMorph).
 */
const handleReverseMorph = async ({
  refs,
  association,
  thisModel,
  primaryKeyValue,
  transacting,
  relationUpdates,
}) => {
  const currentValue = transformToArrayID(refs);
  const model = strapi.db.getModel(
    association.details.collection || association.details.model,
    association.details.plugin
  );

  const removal = removeRelationMorph(model, {
    params: {
      alias: association.via,
      ref: thisModel.collectionName,
      refId: primaryKeyValue,
      field: association.alias,
    },
    transacting,
  });

  const addition = Promise.all(
    currentValue.map((id, idx) =>
      addRelationMorph(model, {
        params: {
          id,
          alias: association.via,
          ref: thisModel.collectionName,
          refId: primaryKeyValue,
          field: association.alias,
          order: idx + 1,
        },
        transacting,
      })
    )
  );

  relationUpdates.push(removal.then(() => addition));
};

/**
 * Exported service methods.
 */
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
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, { transacting });

    const relationUpdates = [];

    const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, key) => {
      const property = params.values[key];
      const association = this.associations.find(a => a.alias === key);
      const details = this._attributes[key];

      if (!association && _.get(details, 'isVirtual') !== true) {
        _.set(acc, key, property);
        return acc;
      }

      const handler = associationHandlers[association.nature];
      if (handler) {
        handler.call(this, {
          property,
          assocModel: strapi.db.getModel(details.model || details.collection, details.plugin),
          details,
          response,
          primaryKeyValue,
          transacting,
          relationUpdates,
          acc,
          association,
          thisModel: this,
        });
      }

      return acc;
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

    this.associations.forEach(association => {
      const nullify = ['oneWay', 'oneToOne', 'manyToOne', 'oneToManyMorph'].includes(association.nature);
      values[association.alias] = nullify ? null : [];
    });

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};