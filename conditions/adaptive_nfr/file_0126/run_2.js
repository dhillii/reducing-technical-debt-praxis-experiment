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

/** @description Handles oneWay association updates */
const handleOneWayUpdate = (property, assocModel, details) => {
  return _.set({}, 'value', _.get(property, assocModel.primaryKey, property));
};

/** @description Handles oneToOne association updates */
const handleOneToOneUpdate = async (current, property, response, assocModel, details, primaryKeyValue, transacting) => {
  const relationUpdates = [];
  let result = {};

  if (response[current] === property) return { result, relationUpdates };

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
    result = _.set({}, 'value', null);
    return { result, relationUpdates };
  }

  const updateLink = this.where({ [current]: property })
    .save(
      { [current]: null },
      {
        method: 'update',
        patch: true,
        require: false,
        transacting,
      }
    )
    .then(() => {
      return assocModel.where({ [this.primaryKey]: property }).save(
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
  result = _.set({}, 'value', property);
  return { result, relationUpdates };
};

/** @description Handles oneToMany association updates */
const handleOneToManyUpdate = (property, response, current, assocModel, details, primaryKeyValue, transacting) => {
  const relationUpdates = [];
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
  return { relationUpdates };
};

/** @description Handles manyToOne association updates */
const handleManyToOneUpdate = (property, assocModel) => {
  return _.set({}, 'value', _.get(property, assocModel.primaryKey, property));
};

/** @description Handles manyWay and manyToMany association updates */
const handleManyToManyUpdate = (association, primaryKeyValue, response, params, current, transacting) => {
  const relationUpdates = [];
  const storedValue = transformToArrayID(response[current]);
  const currentValue = transformToArrayID(params.values[current]);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = this.forge({
    [this.primaryKey]: primaryKeyValue,
  })[association.alias]();

  const updatePromise = collection
    .detach(toRemove, { transacting })
    .then(() => collection.attach(toAdd, { transacting }));

  relationUpdates.push(updatePromise);
  return { relationUpdates };
};

/** @description Handles manyMorphToMany and manyMorphToOne association updates */
const handleManyMorphUpdate = async (association, current, params, response, primaryKeyValue, transacting) => {
  const relationUpdates = [];
  const refs = params.values[current];

  if (Array.isArray(refs) && refs.length === 0) {
    relationUpdates.push(
      removeRelationMorph(this, { params: { id: primaryKeyValue }, transacting })
    );
    return { relationUpdates };
  }

  refs.forEach(obj => {
    const targetModel = strapi.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );

    const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      relationUpdates.push(
        removeRelationMorph(this, {
          params: {
            alias: association.alias,
            ref: targetModel.collectionName,
            refId: obj.refId,
            field: obj.field,
          },
          transacting,
        }).then(() =>
          addRelationMorph(this, {
            params: {
              id: response[this.primaryKey],
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
      const maxOrder = await this.morph
        .query(qb => {
          qb.max('order as order').where({
            [`${association.alias}_id`]: obj.refId,
            [`${association.alias}_type`]: targetModel.collectionName,
            field: obj.field,
          });
        })
        .fetch({ transacting });

      const { order = 0 } = maxOrder.toJSON();

      await addRelationMorph(this, {
        params: {
          id: response[this.primaryKey],
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

  return { relationUpdates };
};

/** @description Handles oneToManyMorph and manyToManyMorph association updates */
const handleMorphToManyUpdate = (association, current, params, response, details, transacting) => {
  const relationUpdates = [];
  const currentValue = transformToArrayID(params.values[current]);
  const model = strapi.db.getModel(details.collection || details.model, details.plugin);

  const promise = removeRelationMorph(model, {
    params: {
      alias: association.via,
      ref: this.collectionName,
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
            ref: this.collectionName,
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
  return { relationUpdates };
};

/** @description Strategy map for association nature handlers */
const associationUpdateStrategies = {
  oneWay: (ctx) => {
    const result = handleOneWayUpdate(ctx.property, ctx.assocModel, ctx.details);
    return { value: result.value, relationUpdates: [] };
  },
  oneToOne: (ctx) => {
    return handleOneToOneUpdate.call(ctx.self, ctx.current, ctx.property, ctx.response, ctx.assocModel, ctx.details, ctx.primaryKeyValue, ctx.transacting);
  },
  oneToMany: (ctx) => {
    const { relationUpdates } = handleOneToManyUpdate(ctx.property, ctx.response, ctx.current, ctx.assocModel, ctx.details, ctx.primaryKeyValue, ctx.transacting);
    return { relationUpdates };
  },
  manyToOne: (ctx) => {
    const result = handleManyToOneUpdate(ctx.property, ctx.assocModel);
    return { value: result.value, relationUpdates: [] };
  },
  manyWay: (ctx) => {
    return handleManyToManyUpdate.call(ctx.self, ctx.association, ctx.primaryKeyValue, ctx.response, ctx.params, ctx.current, ctx.transacting);
  },
  manyToMany: (ctx) => {
    return handleManyToManyUpdate.call(ctx.self, ctx.association, ctx.primaryKeyValue, ctx.response, ctx.params, ctx.current, ctx.transacting);
  },
  manyMorphToMany: (ctx) => {
    return handleManyMorphUpdate.call(ctx.self, ctx.association, ctx.current, ctx.params, ctx.response, ctx.primaryKeyValue, ctx.transacting);
  },
  manyMorphToOne: (ctx) => {
    return handleManyMorphUpdate.call(ctx.self, ctx.association, ctx.current, ctx.params, ctx.response, ctx.primaryKeyValue, ctx.transacting);
  },
  oneToManyMorph: (ctx) => {
    return handleMorphToManyUpdate.call(ctx.self, ctx.association, ctx.current, ctx.params, ctx.response, ctx.details, ctx.transacting);
  },
  manyToManyMorph: (ctx) => {
    return handleMorphToManyUpdate.call(ctx.self, ctx.association, ctx.current, ctx.params, ctx.response, ctx.details, ctx.transacting);
  },
  oneMorphToOne: () => ({ relationUpdates: [] }),
  oneMorphToMany: () => ({ relationUpdates: [] }),
};

/** @description Determines if a property should be treated as a relation */
const isRelationProperty = (association, details) => {
  return association || _.get(details, 'isVirtual') === true;
};

/** @description Processes a single property update */
const processPropertyUpdate = function(current, property, association, details, response, params, primaryKeyValue, transacting) {
  const relationUpdates = [];
  let acc = {};

  if (!association && _.get(details, 'isVirtual') !== true) {
    return { acc: _.set({}, current, property), relationUpdates };
  }

  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
  const nature = association.nature;

  const handler = associationUpdateStrategies[nature];
  if (!handler) {
    return { acc, relationUpdates };
  }

  const ctx = {
    self: this,
    current,
    property,
    association,
    details,
    response,
    params,
    primaryKeyValue,
    transacting,
    assocModel,
  };

  const result = handler(ctx);

  if (result.value !== undefined) {
    acc = _.set({}, current, result.value);
  }

  return { acc, relationUpdates: result.relationUpdates || [] };
};

/** @description Strategy map for deleteRelations */
const deleteRelationStrategies = {
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

      const { acc: updatedAcc, relationUpdates: updates } = processPropertyUpdate.call(
        this,
        current,
        property,
        association,
        details,
        response,
        params,
        primaryKeyValue,
        transacting
      );

      relationUpdates.push(...updates);
      return _.assign(acc, updatedAcc);
    }, {});

    await Promise.all(relation