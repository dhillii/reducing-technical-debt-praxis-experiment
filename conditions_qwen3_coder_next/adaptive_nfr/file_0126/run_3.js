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
 * Extracted helper to handle oneWay relation updates
 */
const handleOneWayRelation = (acc, property, assocModel, current) => {
  return _.set(acc, current, _.get(property, assocModel.primaryKey, property));
};

/**
 * Extracted helper to handle oneToOne relation updates
 */
const handleOneToOneRelation = async (acc, response, property, details, assocModel, current, primaryKeyValue, transacting) => {
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

    return { acc, relationUpdates: [updatePromise] };
  }

  // set old relations to null
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

  return { acc, relationUpdates: [updateLink] };
};

/**
 * Extracted helper to handle oneToMany relation updates
 */
const handleOneToManyRelation = async (response, property, details, assocModel, current, primaryKeyValue, transacting) => {
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

  return { relationUpdates: [updatePromise] };
};

/**
 * Extracted helper to handle manyToOne relation updates
 */
const handleManyToOneRelation = (acc, property, assocModel, current) => {
  return _.set(acc, current, _.get(property, assocModel.primaryKey, property));
};

/**
 * Extracted helper to handle manyWay/manyToMany relation updates
 */
const handleManyToManyRelation = async (acc, response, params, association, current, primaryKeyValue, transacting) => {
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

  return { acc, relationUpdates: [updatePromise] };
};

/**
 * Extracted helper to handle manyMorph relations
 */
const handleManyMorphRelation = async (response, params, association, current, primaryKeyValue, transacting) => {
  const refs = params.values[current];
  const relationUpdates = [];

  if (Array.isArray(refs) && refs.length === 0) {
    relationUpdates.push(
      removeRelationMorph(this, { params: { id: primaryKeyValue }, transacting })
    );
    return { relationUpdates };
  }

  for (const obj of refs) {
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
      continue;
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
  }

  return { relationUpdates };
};

/**
 * Extracted helper to handle oneToManyMorph/manyToManyMorph relation updates
 */
const handleOneToManyMorphRelation = async (response, params, association, current, details, transacting) => {
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

  return { relationUpdates: [promise] };
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

      switch (association.nature) {
        case 'oneWay': {
          return handleOneWayRelation(acc, property, assocModel, current);
        }
        case 'oneToOne': {
          const result = handleOneToOneRelation(acc, response, property, details, assocModel, current, primaryKeyValue, transacting);
          if (result.relationUpdates) relationUpdates.push(...result.relationUpdates);
          return result.acc;
        }
        case 'oneToMany': {
          const result = handleOneToManyRelation(response, property, details, assocModel, current, primaryKeyValue, transacting);
          if (result.relationUpdates) relationUpdates.push(...result.relationUpdates);
          return acc;
        }
        case 'manyToOne': {
          return handleManyToOneRelation(acc, property, assocModel, current);
        }
        case 'manyWay':
        case 'manyToMany': {
          const result = handleManyToManyRelation(acc, response, params, association, current, primaryKeyValue, transacting);
          if (result.relationUpdates) relationUpdates.push(...result.relationUpdates);
          return result.acc;
        }
        // media -> model
        case 'manyMorphToMany':
        case 'manyMorphToOne': {
          const result = handleManyMorphRelation(response, params, association, current, primaryKeyValue, transacting);
          if (result.relationUpdates) relationUpdates.push(...result.relationUpdates);
          return acc;
        }
        // model -> media
        case 'oneToManyMorph':
        case 'manyToManyMorph': {
          const result = handleOneToManyMorphRelation(response, params, association, current, details, transacting);
          if (result.relationUpdates) relationUpdates.push(...result.relationUpdates);
          return acc;
        }
        case 'oneMorphToOne':
        case 'oneMorphToMany': {
          return acc;
        }
        default:
          return acc;
      }
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

    this.associations.map(association => {
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