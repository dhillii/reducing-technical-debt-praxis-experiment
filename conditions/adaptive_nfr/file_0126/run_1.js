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

/** @type {Object<string, Function>} Strategy handlers for association nature types */
const associationHandlers = {
  oneWay: (acc, current, property, assocModel, details) => {
    return _.set(acc, current, _.get(property, assocModel.primaryKey, property));
  },

  manyToOne: (acc, current, property, assocModel, details) => {
    return _.set(acc, current, _.get(property, assocModel.primaryKey, property));
  },

  oneToOne: (acc, current, property, assocModel, details, context) => {
    const { response, primaryKeyValue, relationUpdates, transacting } = context;
    
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
      return _.set(acc, current, null);
    }

    const updateLink = context.model.where({ [current]: property })
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
        return assocModel.where({ [context.model.primaryKey]: property }).save(
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
    return _.set(acc, current, property);
  },

  oneToMany: (acc, current, property, assocModel, details, context) => {
    const { response, primaryKeyValue, relationUpdates, transacting } = context;
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
    return acc;
  },

  manyWay: (acc, current, property, assocModel, details, context) => {
    return handleManyToMany(acc, current, property, assocModel, details, context);
  },

  manyToMany: (acc, current, property, assocModel, details, context) => {
    return handleManyToMany(acc, current, property, assocModel, details, context);
  },

  manyMorphToMany: (acc, current, property, assocModel, details, context) => {
    return handleManyMorphRelation(acc, current, property, assocModel, details, context);
  },

  manyMorphToOne: (acc, current, property, assocModel, details, context) => {
    return handleManyMorphRelation(acc, current, property, assocModel, details, context);
  },

  oneToManyMorph: (acc, current, property, assocModel, details, context) => {
    return handleOneToManyMorph(acc, current, property, assocModel, details, context);
  },

  manyToManyMorph: (acc, current, property, assocModel, details, context) => {
    return handleOneToManyMorph(acc, current, property, assocModel, details, context);
  },

  oneMorphToOne: (acc) => acc,

  oneMorphToMany: (acc) => acc,
};

/**
 * Handle manyToMany and manyWay association updates
 */
const handleManyToMany = (acc, current, property, assocModel, details, context) => {
  const { response, primaryKeyValue, relationUpdates, transacting, model } = context;
  const storedValue = transformToArrayID(response[current]);
  const currentValue = transformToArrayID(property);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = model.forge({
    [model.primaryKey]: primaryKeyValue,
  })[details.alias]();

  const updatePromise = collection
    .detach(toRemove, { transacting })
    .then(() => collection.attach(toAdd, { transacting }));

  relationUpdates.push(updatePromise);
  return acc;
};

/**
 * Handle manyMorphToMany and manyMorphToOne association updates
 */
const handleManyMorphRelation = (acc, current, property, assocModel, details, context) => {
  const { response, relationUpdates, transacting, model, association } = context;
  const refs = property;

  if (Array.isArray(refs) && refs.length === 0) {
    relationUpdates.push(
      removeRelationMorph(model, { params: { id: response[model.primaryKey] }, transacting })
    );
    return acc;
  }

  refs.forEach(obj => {
    processMorphRef(obj, model, association, response, relationUpdates, transacting);
  });

  return acc;
};

/**
 * Process individual morph reference
 */
const processMorphRef = (obj, model, association, response, relationUpdates, transacting) => {
  const targetModel = strapi.db.getModel(
    obj.ref,
    obj.source !== 'content-manager' ? obj.source : null
  );

  const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

  if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
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
};

/**
 * Handle oneToManyMorph and manyToManyMorph association updates
 */
const handleOneToManyMorph = (acc, current, property, assocModel, details, context) => {
  const { response, relationUpdates, transacting, association } = context;
  const currentValue = transformToArrayID(property);

  const model = strapi.db.getModel(details.collection || details.model, details.plugin);

  const promise = removeRelationMorph(model, {
    params: {
      alias: association.via,
      ref: context.model.collectionName,
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
            ref: context.model.collectionName,
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
  return acc;
};

/**
 * Determine if association should be handled by strategy
 */
const isAssociationHandled = (association) => {
  return association && associationHandlers[association.nature];
};

/**
 * Get deletion value for association nature
 */
const getDeletionValue = (nature) => {
  const nullableNatures = ['oneWay', 'oneToOne', 'manyToOne', 'oneToManyMorph'];
  return nullableNatures.includes(nature) ? null : [];
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

      if (!isAssociationHandled(association)) {
        return acc;
      }

      const handler = associationHandlers[association.nature];
      const context = {
        response,
        primaryKeyValue,
        relationUpdates,
        transacting,
        model: this,
        association,
      };

      return handler(acc, current, property, assocModel, details, context);
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
      values[association.alias] = getDeletionValue(association.nature);
    });

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};
```