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

const getAssociationUpdates = (association, response, params, transacting) => {
  const assocModel = strapi.db.getModel(association.details.model || association.details.collection, association.details.plugin);
  const updates = [];

  switch (association.nature) {
    case 'oneWay':
      return updates;
    case 'oneToOne':
      return handleOneToOne(association, response, params, transacting);
    case 'oneToMany':
      return handleOneToMany(association, response, params, transacting);
    case 'manyToOne':
      return updates;
    case 'manyWay':
    case 'manyToMany':
      return handleManyToMany(association, response, params, transacting);
    case 'manyMorphToMany':
    case 'manyMorphToOne':
      return handleManyMorph(association, response, params, transacting);
    case 'oneToManyMorph':
    case 'manyToManyMorph':
      return handleMorph(association, response, params, transacting);
    default:
      return updates;
  }
};

const handleOneToOne = async (association, response, params, transacting) => {
  const updates = [];
  const assocModel = strapi.db.getModel(association.details.model || association.details.collection, association.details.plugin);

  if (response[association.alias] === params.values[association.alias]) return updates;

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

    updates.push(updatePromise);
    return updates;
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
        { [association.details.via]: getValuePrimaryKey(response, this.primaryKey) },
        {
          method: 'update',
          patch: true,
          require: false,
          transacting,
        }
      );
    });

  updates.push(updateLink);
  return updates;
};

const handleOneToMany = async (association, response, params, transacting) => {
  const updates = [];
  const assocModel = strapi.db.getModel(association.details.model || association.details.collection, association.details.plugin);

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
          { [association.details.via]: getValuePrimaryKey(response, this.primaryKey) },
          {
            method: 'update',
            patch: true,
            require: false,
            transacting,
          }
        );
    });

  updates.push(updatePromise);
  return updates;
};

const handleManyToMany = async (association, response, params, transacting) => {
  const updates = [];
  const storedValue = transformToArrayID(response[association.alias]);
  const currentValue = transformToArrayID(params.values[association.alias]);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = this.forge({
    [this.primaryKey]: getValuePrimaryKey(response, this.primaryKey),
  })[association.alias]();

  const updatePromise = collection
    .detach(toRemove, { transacting })
    .then(() => collection.attach(toAdd, { transacting }));

  updates.push(updatePromise);
  return updates;
};

const handleManyMorph = async (association, response, params, transacting) => {
  const updates = [];
  const refs = params.values[association.alias];

  if (Array.isArray(refs) && refs.length === 0) {
    updates.push(
      removeRelationMorph(this, { params: { id: getValuePrimaryKey(response, this.primaryKey) }, transacting })
    );
    return updates;
  }

  refs.forEach(obj => {
    const targetModel = strapi.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );

    const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      updates.push(
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

    updates.push(addRelation());
  });

  return updates;
};

const handleMorph = async (association, response, params, transacting) => {
  const updates = [];
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

  updates.push(promise);

  return updates;
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
      const updates = getAssociationUpdates(association, response, params, transacting);
      relationUpdates.push(...updates);
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