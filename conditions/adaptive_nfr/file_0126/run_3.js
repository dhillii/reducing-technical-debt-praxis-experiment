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
  oneWay: (property, assocModel, details) => {
    return _.get(property, assocModel.primaryKey, property);
  },

  manyToOne: (property, assocModel, details) => {
    return _.get(property, assocModel.primaryKey, property);
  },
};

/** @type {Object<string, Function>} Relation update handlers for association nature types */
const relationUpdateHandlers = {
  oneToOne: async (context) => {
    const { property, response, current, assocModel, details, primaryKeyValue, transacting } = context;
    
    if (response[current] === property) return null;

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

      return updatePromise;
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

    return updateLink;
  },

  oneToMany: async (context) => {
    const { property, response, current, assocModel, details, primaryKeyValue, transacting } = context;
    
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

    return updatePromise;
  },

  manyWay: async (context) => {
    const { property, response, current, association, primaryKeyValue, transacting, model } = context;
    
    const storedValue = transformToArrayID(response[current]);
    const currentValue = transformToArrayID(property);

    const toAdd = _.difference(currentValue, storedValue);
    const toRemove = _.difference(storedValue, currentValue);

    const collection = model.forge({
      [model.primaryKey]: primaryKeyValue,
    })[association.alias]();

    return collection
      .detach(toRemove, { transacting })
      .then(() => collection.attach(toAdd, { transacting }));
  },

  manyToMany: async (context) => {
    return relationUpdateHandlers.manyWay(context);
  },
};

/** @type {Object<string, Function>} Morph relation handlers */
const morphRelationHandlers = {
  manyMorphToMany: async (context) => {
    const { refs, association, response, model, transacting } = context;

    if (Array.isArray(refs) && refs.length === 0) {
      return removeRelationMorph(model, { params: { id: response[model.primaryKey] }, transacting });
    }

    const promises = refs.map(obj => morphRelationHandlers._handleMorphRef(context, obj));
    return Promise.all(promises);
  },

  manyMorphToOne: async (context) => {
    return morphRelationHandlers.manyMorphToMany(context);
  },

  _handleMorphRef: async (context, obj) => {
    const { association, response, model, transacting } = context;
    const targetModel = strapi.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );

    const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      return removeRelationMorph(model, {
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
    }

    return morphRelationHandlers._addMorphRelationWithOrder(context, obj, targetModel);
  },

  _addMorphRelationWithOrder: async (context, obj, targetModel) => {
    const { association, response, model, transacting } = context;
    
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

    return addRelationMorph(model, {
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
  },

  oneToManyMorph: async (context) => {
    const { property, details, response, association, transacting } = context;
    const currentValue = transformToArrayID(property);
    const model = strapi.db.getModel(details.collection || details.model, details.plugin);

    return removeRelationMorph(model, {
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
  },

  manyToManyMorph: async (context) => {
    return morphRelationHandlers.oneToManyMorph(context);
  },
};

/** @type {Object<string, string>} Mapping of association natures to their value type */
const associationValueTypes = {
  oneWay: 'scalar',
  oneToOne: 'relation',
  oneToMany: 'relation',
  manyToOne: 'scalar',
  manyWay: 'relation',
  manyToMany: 'relation',
  manyMorphToMany: 'morph',
  manyMorphToOne: 'morph',
  oneToManyMorph: 'morph',
  manyToManyMorph: 'morph',
  oneMorphToOne: 'skip',
  oneMorphToMany: 'skip',
};

/** @type {Object<string, string>} Default values for association types in deleteRelations */
const deleteRelationDefaults = {
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

/**
 * Determines if association should be handled as a scalar value
 * @param {string} nature - Association nature type
 * @returns {boolean}
 */
const isScalarAssociation = (nature) => {
  return associationValueTypes[nature] === 'scalar';
};

/**
 * Determines if association should be handled as a relation update
 * @param {string} nature - Association nature type
 * @returns {boolean}
 */
const isRelationAssociation = (nature) => {
  return associationValueTypes[nature] === 'relation';
};

/**
 * Determines if association should be handled as a morph relation
 * @param {string} nature - Association nature type
 * @returns {boolean}
 */
const isMorphAssociation = (nature) => {
  return associationValueTypes[nature] === 'morph';
};

/**
 * Determines if association should be skipped
 * @param {string} nature - Association nature type
 * @returns {boolean}
 */
const isSkipAssociation = (nature) => {
  return associationValueTypes[nature] === 'skip';
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
      const nature = association.nature;

      if (isScalarAssociation(nature)) {
        const handler = associationHandlers[nature];
        return _.set(acc, current, handler(property, assocModel, details));
      }

      if (isRelationAssociation(nature)) {
        const handler = relationUpdateHandlers[nature];
        if (handler) {
          const updatePromise = handler({
            property,
            response,
            current,
            association,
            assocModel,
            details,
            primaryKeyValue,
            transacting,
            model: this,
          });
          relationUpdates.push(updatePromise);
        }
        return acc;
      }

      if (isMorphAssociation(nature)) {
        const refs = params.values[current];
        const handler = morphRelationHandlers[nature];
        if (handler) {
          const updatePromise = handler({
            refs,
            association,
            response,
            property,
            details,
            transacting,
            model: this,
          });
          relationUpdates.push(updatePromise);
        }
        return acc;
      }

      if (isSkipAssociation(nature)) {
        return acc;
      }

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

    this.associations.map(association => {
      const defaultValue = deleteRelationDefaults[association.nature];
      if (defaultValue !== undefined) {
        values[association.alias] = defaultValue;
      }
    });

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};