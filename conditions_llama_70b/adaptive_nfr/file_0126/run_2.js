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

/**
 * @typedef {Object} UpdateParams
 * @property {Object} values
 * @property {Object} params
 * @property {Object} transacting
 */

/**
 * @typedef {Object} Association
 * @property {string} alias
 * @property {string} nature
 * @property {Object} details
 */

/**
 * @param {Object} association
 * @param {Object} params
 * @param {Object} response
 * @param {Object} transacting
 * @returns {Promise}
 */
const updateOneWayAssociation = async (association, params, response, transacting) => {
  return Promise.resolve();
};

/**
 * @param {Object} association
 * @param {Object} params
 * @param {Object} response
 * @param {Object} transacting
 * @returns {Promise}
 */
const updateOneToOneAssociation = async (association, params, response, transacting) => {
  const assocModel = strapi.db.getModel(association.details.model || association.details.collection, association.details.plugin);
  const primaryKeyValue = getValuePrimaryKey(params, assocModel.primaryKey);

  if (response[association.alias] === params.values[association.alias]) return Promise.resolve();

  if (_.isNull(params.values[association.alias])) {
    const updatePromise = assocModel
      .where({
        [assocModel.primaryKey]: getValuePrimaryKey(response[association.alias], assocModel.primaryKey),
      })
      .save(
        { [association.details.via]: null },
        {
          method: 'update',
          patch: true,
          require: false,
          transacting,
        }
      );

    return updatePromise;
  }

  const updateLink = this.where({ [association.alias]: params.values[association.alias] })
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
      return assocModel.where({ [this.primaryKey]: params.values[association.alias] }).save(
        { [association.details.via]: primaryKeyValue },
        {
          method: 'update',
          patch: true,
          require: false,
          transacting,
        }
      );
    });

  return updateLink;
};

/**
 * @param {Object} association
 * @param {Object} params
 * @param {Object} response
 * @param {Object} transacting
 * @returns {Promise}
 */
const updateOneToManyAssociation = async (association, params, response, transacting) => {
  const assocModel = strapi.db.getModel(association.details.model || association.details.collection, association.details.plugin);
  const primaryKeyValue = getValuePrimaryKey(params, assocModel.primaryKey);

  const currentIds = response[association.alias];
  const toRemove = _.differenceWith(currentIds, params.values[association.alias], (a, b) => {
    return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
  });

  const updatePromise = assocModel
    .where(
      assocModel.primaryKey,
      'in',
      toRemove.map(val => val[assocModel.primaryKey] || val)
    )
    .save(
      { [association.details.via]: null },
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
          params.values[association.alias].map(val => val[assocModel.primaryKey] || val)
        )
        .save(
          { [association.details.via]: primaryKeyValue },
          {
            method: 'update',
            patch: true,
            require: false,
            transacting,
          }
        );
    });

  return updatePromise;
};

/**
 * @param {Object} association
 * @param {Object} params
 * @param {Object} response
 * @param {Object} transacting
 * @returns {Promise}
 */
const updateManyToOneAssociation = async (association, params, response, transacting) => {
  return Promise.resolve();
};

/**
 * @param {Object} association
 * @param {Object} params
 * @param {Object} response
 * @param {Object} transacting
 * @returns {Promise}
 */
const updateManyToManyAssociation = async (association, params, response, transacting) => {
  const storedValue = transformToArrayID(response[association.alias]);
  const currentValue = transformToArrayID(params.values[association.alias]);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = this.forge({
    [this.primaryKey]: getValuePrimaryKey(params, this.primaryKey),
  })[association.alias]();

  const updatePromise = collection
    .detach(toRemove, { transacting })
    .then(() => collection.attach(toAdd, { transacting }));

  return updatePromise;
};

/**
 * @param {Object} association
 * @param {Object} params
 * @param {Object} response
 * @param {Object} transacting
 * @returns {Promise}
 */
const updateManyMorphToManyAssociation = async (association, params, response, transacting) => {
  const refs = params.values[association.alias];

  if (Array.isArray(refs) && refs.length === 0) {
    return removeRelationMorph(this, { params: { id: getValuePrimaryKey(params, this.primaryKey) }, transacting });
  }

  const promises = refs.map(obj => {
    const targetModel = strapi.db.getModel(obj.ref, obj.source !== 'content-manager' ? obj.source : null);

    const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      return removeRelationMorph(this, {
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
      );
    }

    return addRelationMorph(this, {
      params: {
        id: response[this.primaryKey],
        alias: association.alias,
        ref: targetModel.collectionName,
        refId: obj.refId,
        field: obj.field,
        order: 1,
      },
      transacting,
    });
  });

  return Promise.all(promises);
};

/**
 * @param {Object} association
 * @param {Object} params
 * @param {Object} response
 * @param {Object} transacting
 * @returns {Promise}
 */
const updateOneToManyMorphAssociation = async (association, params, response, transacting) => {
  const currentValue = transformToArrayID(params.values[association.alias]);

  const model = strapi.db.getModel(association.details.collection || association.details.model, association.details.plugin);

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

  return promise;
};

/**
 * @param {Object} association
 * @param {Object} params
 * @param {Object} response
 * @param {Object} transacting
 * @returns {Promise}
 */
const updateAssociation = async (association, params, response, transacting) => {
  switch (association.nature) {
    case 'oneWay':
      return updateOneWayAssociation(association, params, response, transacting);
    case 'oneToOne':
      return updateOneToOneAssociation(association, params, response, transacting);
    case 'oneToMany':
      return updateOneToManyAssociation(association, params, response, transacting);
    case 'manyToOne':
      return updateManyToOneAssociation(association, params, response, transacting);
    case 'manyWay':
    case 'manyToMany':
      return updateManyToManyAssociation(association, params, response, transacting);
    case 'manyMorphToMany':
    case 'manyMorphToOne':
      return updateManyMorphToManyAssociation(association, params, response, transacting);
    case 'oneToManyMorph':
    case 'manyToManyMorph':
      return updateOneToManyMorphAssociation(association, params, response, transacting);
    default:
      return Promise.resolve();
  }
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

      return acc;
    }, {});

    this.associations.forEach(association => {
      const updatePromise = updateAssociation(association, params, response, transacting);
      relationUpdates.push(updatePromise);
    });

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
```