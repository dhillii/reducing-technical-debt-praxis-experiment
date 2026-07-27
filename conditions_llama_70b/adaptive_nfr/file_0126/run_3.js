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

const updateOneWayRelation = (acc, current, property, association, details) => {
  return _.set(acc, current, _.get(property, details.model.primaryKey, property));
};

const updateOneToOneRelation = async (acc, current, property, association, details, response, transacting) => {
  if (response[current] === property) return acc;

  if (_.isNull(property)) {
    const updatePromise = details.model
      .where({
        [details.model.primaryKey]: getValuePrimaryKey(
          response[current],
          details.model.primaryKey
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

    return _.set(acc, current, null);
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
      return details.model.where({ [this.primaryKey]: property }).save(
        { [details.via]: response[this.primaryKey] },
        {
          method: 'update',
          patch: true,
          require: false,
          transacting,
        }
      );
    });

  // set new relation
  return _.set(acc, current, property);
};

const updateOneToManyRelation = async (acc, current, property, association, details, response, transacting) => {
  // receive array of ids or array of objects with ids

  // set relation to null for all the ids not in the list
  const currentIds = response[current];
  const toRemove = _.differenceWith(currentIds, property, (a, b) => {
    return `${a[details.model.primaryKey] || a}` === `${b[details.model.primaryKey] || b}`;
  });

  const updatePromise = details.model
    .where(
      details.model.primaryKey,
      'in',
      toRemove.map(val => val[details.model.primaryKey] || val)
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
      return details.model
        .where(
          details.model.primaryKey,
          'in',
          property.map(val => val[details.model.primaryKey] || val)
        )
        .save(
          { [details.via]: response[this.primaryKey] },
          {
            method: 'update',
            patch: true,
            require: false,
            transacting,
          }
        );
    });

  return acc;
};

const updateManyToManyRelation = async (acc, current, property, association, response, transacting) => {
  const storedValue = transformToArrayID(response[current]);
  const currentValue = transformToArrayID(property);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = this.forge({
    [this.primaryKey]: response[this.primaryKey],
  })[association.alias]();

  const updatePromise = collection
    .detach(toRemove, { transacting })
    .then(() => collection.attach(toAdd, { transacting }));

  return acc;
};

const updateManyMorphToManyRelation = async (acc, current, property, association, response, transacting) => {
  // Update the relational array.
  const refs = property;

  if (Array.isArray(refs) && refs.length === 0) {
    // clear related
    return removeRelationMorph(this, { params: { id: response[this.primaryKey] }, transacting });
  }

  const promises = refs.map(obj => {
    const targetModel = strapi.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );

    const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

    // Remove existing relationship because only one file
    // can be related to this field.
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

    return addRelation();
  });

  return Promise.all(promises);
};

const updateManyToManyMorphRelation = async (acc, current, property, association, response, transacting) => {
  const currentValue = transformToArrayID(property);

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

const updateRelation = async (acc, current, property, association, response, transacting) => {
  switch (association.nature) {
    case 'oneWay':
      return updateOneWayRelation(acc, current, property, association, association.details);
    case 'oneToOne':
      return updateOneToOneRelation(acc, current, property, association, association.details, response, transacting);
    case 'oneToMany':
      return updateOneToManyRelation(acc, current, property, association, association.details, response, transacting);
    case 'manyToOne':
      return updateOneWayRelation(acc, current, property, association, association.details);
    case 'manyWay':
    case 'manyToMany':
      return updateManyToManyRelation(acc, current, property, association, response, transacting);
    case 'manyMorphToMany':
    case 'manyMorphToOne':
      return updateManyMorphToManyRelation(acc, current, property, association, response, transacting);
    case 'oneToManyMorph':
    case 'manyToManyMorph':
      return updateManyToManyMorphRelation(acc, current, property, association, response, transacting);
    default:
      return acc;
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

      return updateRelation(acc, current, property, association, response, transacting);
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