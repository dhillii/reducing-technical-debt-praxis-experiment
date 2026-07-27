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

/**
 * Handlers for different association natures
 * @private
 */

/**
 * @param {Object} ctx
 */
const handleOneWay = ctx => {
  const { association, property, values, assocModel } = ctx;
  _.set(values, association.alias, _.get(property, assocModel.primaryKey, property));
};

/**
 * @param {Object} ctx
 */
const handleManyToOne = ctx => {
  const { association, property, values, assocModel } = ctx;
  _.set(values, association.alias, _.get(property, assocModel.primaryKey, property));
};

/**
 * @param {Object} ctx
 */
const handleOneToOne = ctx => {
  const {
    association,
    property,
    response,
    values,
    relationUpdates,
    primaryKeyValue,
    transacting,
    details,
    assocModel,
    self,
  } = ctx;

  if (response[association.alias] === property) return;

  if (_.isNull(property)) {
    const updatePromise = assocModel
      .where({
        [assocModel.primaryKey]: getValuePrimaryKey(
          response[association.alias],
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
    _.set(values, association.alias, null);
    return;
  }

  const updateLink = self
    .where({ [association.alias]: property })
    .save(
      { [association.alias]: null },
      {
        method: 'update',
        patch: true,
        require: false,
        transacting,
      }
    )
    .then(() => {
      return assocModel
        .where({ [self.primaryKey]: property })
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

  relationUpdates.push(updateLink);
  _.set(values, association.alias, property);
};

/**
 * @param {Object} ctx
 */
const handleOneToMany = ctx => {
  const {
    association,
    property,
    response,
    relationUpdates,
    primaryKeyValue,
    transacting,
    details,
    assocModel,
  } = ctx;

  const currentIds = response[association.alias];
  const toRemove = _.differenceWith(
    currentIds,
    property,
    (a, b) => `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`
  );

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
    .then(() => {
      return assocModel
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
        );
    });

  relationUpdates.push(updatePromise);
};

/**
 * @param {Object} ctx
 */
const handleManyWayOrManyToMany = ctx => {
  const {
    association,
    response,
    values,
    relationUpdates,
    transacting,
    primaryKeyValue,
  } = ctx;

  const storedValue = transformToArrayID(response[association.alias]);
  const currentValue = transformToArrayID(values[association.alias]);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = ctx.self
    .forge({ [ctx.self.primaryKey]: primaryKeyValue })
    [association.alias]();

  const updatePromise = collection
    .detach(toRemove, { transacting })
    .then(() => collection.attach(toAdd, { transacting }));

  relationUpdates.push(updatePromise);
};

/**
 * @param {Object} ctx
 */
const handleManyMorph = async ctx => {
  const { association, refs, response, relationUpdates, transacting, primaryKeyValue } = ctx;

  if (Array.isArray(refs) && refs.length === 0) {
    relationUpdates.push(
      removeRelationMorph(ctx.self, { params: { id: primaryKeyValue }, transacting })
    );
    return;
  }

  refs.forEach(async obj => {
    const targetModel = strapi.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );

    const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      relationUpdates.push(
        removeRelationMorph(ctx.self, {
          params: {
            alias: association.alias,
            ref: targetModel.collectionName,
            refId: obj.refId,
            field: obj.field,
          },
          transacting,
        }).then(() =>
          addRelationMorph(ctx.self, {
            params: {
              id: response[ctx.self.primaryKey],
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

    const maxOrder = await ctx.self.morph
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
      addRelationMorph(ctx.self, {
        params: {
          id: response[ctx.self.primaryKey],
          alias: association.alias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
          order: order + 1,
        },
        transacting,
      })
    );
  });
};

/**
 * @param {Object} ctx
 */
const handleOneToManyMorphOrManyToManyMorph = ctx => {
  const {
    association,
    currentValue,
    response,
    relationUpdates,
    transacting,
    primaryKeyValue,
  } = ctx;

  const model = strapi.db.getModel(
    ctx.details.collection || ctx.details.model,
    ctx.details.plugin
  );

  const promise = removeRelationMorph(model, {
    params: {
      alias: association.via,
      ref: ctx.self.collectionName,
      refId: response.id,
      field: association.alias,
    },
    transacting,
  }).then(() => {
    return Promise.all(
      currentValue.map((id, idx) => {
        return addRelationMorph(model, {
          params: {
            id,
            alias: association.via,
            ref: ctx.self.collectionName,
            refId: response.id,
            field: association.alias,
            order: idx + 1,
          },
          transacting,
        });
      })
    );
  });

  relationUpdates.push(promise);
};

/**
 * @param {Object} ctx
 */
const handleOneMorphToOneOrMany = ctx => {
  // No operation needed for these natures
};

/**
 * Map of nature to handler
 */
const natureHandlers = {
  oneWay: handleOneWay,
  manyToOne: handleManyToOne,
  oneToOne: handleOneToOne,
  oneToMany: handleOneToMany,
  manyWay: handleManyWayOrManyToMany,
  manyToMany: handleManyWayOrManyToMany,
  manyMorphToMany: handleManyMorph,
  manyMorphToOne: handleManyMorph,
  oneToManyMorph: handleOneToManyMorphOrManyToManyMorph,
  manyToManyMorph: handleOneToManyMorphOrManyToManyMorph,
  oneMorphToOne: handleOneMorphToOneOrMany,
  oneMorphToMany: handleOneMorphToOneOrMany,
};

/**
 * Process a single association update
 * @private
 */
const processAssociation = async ({
  association,
  property,
  response,
  values,
  relationUpdates,
  primaryKeyValue,
  transacting,
  details,
  assocModel,
  self,
}) => {
  const handler = natureHandlers[association.nature];
  if (!handler) return;

  const ctx = {
    association,
    property,
    response,
    values,
    relationUpdates,
    primaryKeyValue,
    transacting,
    details,
    assocModel,
    self,
    selfModel: self,
  };

  if (association.nature === 'manyMorphToMany' || association.nature === 'manyMorphToOne') {
    ctx.refs = property;
    await handler(ctx);
  } else if (
    association.nature === 'oneToManyMorph' ||
    association.nature === 'manyToManyMorph'
  ) {
    ctx.currentValue = transformToArrayID(property);
    await handler(ctx);
  } else {
    handler(ctx);
  }
};

/**
 * Delete relations helper
 * @private
 */
const deleteRelationsMap = {
  oneWay: () => null,
  oneToOne: () => null,
  manyToOne: () => null,
  oneToManyMorph: () => null,
  manyWay: () => [],
  oneToMany: () => [],
  manyToMany: () => [],
  manyToManyMorph: () => [],
  manyMorphToMany: () => [],
  manyMorphToOne: () => [],
  oneMorphToOne: () => null,
  oneMorphToMany: () => null,
};

module.exports = {
  async findOne(params, populate, { transacting } = {}) {
    const record = await this.forge({
      [this.primaryKey]: getValuePrimaryKey(params, this.primaryKey),
    }).fetch({
      transacting,
      withRelated: populate,
    });

    const data = record ? record.toJSON() : record;

    // Retrieve data manually.
    if (_.isEmpty(populate)) {
      const arrayOfPromises = this.associations
        .filter(association => ['manyMorphToOne', 'manyMorphToMany'].includes(association.nature))
        .map(() => {
          return this.morph
            .forge()
            .where({
              [`${this.collectionName}_id`]: getValuePrimaryKey(params, this.primaryKey),
            })
            .fetchAll({
              transacting,
            });
        });

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
    const response = await module.exports.findOne.call(this, params, null, {
      transacting,
    });

    // Only update fields which are on this document.
    const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, current) => {
      const property = params.values[current];
      const association = this.associations.filter(x => x.alias === current)[0];
      const details = this._attributes[current];

      if (!association && _.get(details, 'isVirtual') !== true) {
        return _.set(acc, current, property);
      }

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

      processAssociation({
        association,
        property,
        response,
        values: acc,
        relationUpdates,
        primaryKeyValue,
        transacting,
        details,
        assocModel,
        self: this,
      });

      return acc;
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
    }).fetch({
      transacting,
    });

    return result && result.toJSON ? result.toJSON() : result;
  },

  deleteRelations(id, { transacting }) {
    const values = {};

    this.associations.forEach(association => {
      const action = deleteRelationsMap[association.nature];
      if (action) {
        values[association.alias] = action();
      }
    });

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};