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

const handleOneWayRelation = (property, assocModel, details) => {
  return _.set({}, 'value', _.get(property, assocModel.primaryKey, property));
};

const handleOneToOneRelation = async (current, property, response, assocModel, details, primaryKeyValue, transacting) => {
  const relationUpdates = [];
  
  if (response[current] === property) {
    return { acc: {}, updates: relationUpdates };
  }

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
    return { acc: _.set({}, current, null), updates: relationUpdates };
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
  return { acc: _.set({}, current, property), updates: relationUpdates };
};

const handleOneToManyRelation = async (current, property, response, assocModel, details, primaryKeyValue, transacting) => {
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
  return { acc: {}, updates: relationUpdates };
};

const handleManyToManyRelation = (current, property, response, association, primaryKeyValue, transacting) => {
  const relationUpdates = [];
  const storedValue = transformToArrayID(response[current]);
  const currentValue = transformToArrayID(property);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = this.forge({
    [this.primaryKey]: primaryKeyValue,
  })[association.alias]();

  const updatePromise = collection
    .detach(toRemove, { transacting })
    .then(() => collection.attach(toAdd, { transacting }));

  relationUpdates.push(updatePromise);
  return { acc: {}, updates: relationUpdates };
};

const handleMorphRelationAdd = async (obj, association, response, primaryKeyValue, transacting) => {
  const targetModel = strapi.db.getModel(
    obj.ref,
    obj.source !== 'content-manager' ? obj.source : null
  );

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

  return addRelationMorph(this, {
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

const handleManyMorphRelation = async (current, property, response, association, details, transacting) => {
  const relationUpdates = [];
  const refs = property;

  if (Array.isArray(refs) && refs.length === 0) {
    relationUpdates.push(
      removeRelationMorph(this, { params: { id: response[this.primaryKey] }, transacting })
    );
    return { acc: {}, updates: relationUpdates };
  }

  const promises = refs.map(obj => handleMorphRelationAdd.call(this, obj, association, response, response[this.primaryKey], transacting));
  relationUpdates.push(...promises);

  return { acc: {}, updates: relationUpdates };
};

const handleOneToManyMorphRelation = async (current, property, response, association, details, transacting) => {
  const relationUpdates = [];
  const currentValue = transformToArrayID(property);
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
  return { acc: {}, updates: relationUpdates };
};

const processAssociationUpdate = async (current, property, response, association, details, primaryKeyValue, transacting) => {
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  switch (association.nature) {
    case 'oneWay': {
      return { acc: _.set({}, current, _.get(property, assocModel.primaryKey, property)), updates: [] };
    }
    case 'oneToOne': {
      return handleOneToOneRelation.call(this, current, property, response, assocModel, details, primaryKeyValue, transacting);
    }
    case 'oneToMany': {
      return handleOneToManyRelation.call(this, current, property, response, assocModel, details, primaryKeyValue, transacting);
    }
    case 'manyToOne': {
      return { acc: _.set({}, current, _.get(property, assocModel.primaryKey, property)), updates: [] };
    }
    case 'manyWay':
    case 'manyToMany': {
      return handleManyToManyRelation.call(this, current, property, response, association, primaryKeyValue, transacting);
    }
    case 'manyMorphToMany':
    case 'manyMorphToOne': {
      return handleManyMorphRelation.call(this, current, property, response, association, details, transacting);
    }
    case 'oneToManyMorph':
    case 'manyToManyMorph': {
      return handleOneToManyMorphRelation.call(this, current, property, response, association, details, transacting);
    }
    case 'oneMorphToOne':
    case 'oneMorphToMany': {
      return { acc: {}, updates: [] };
    }
    default:
      return { acc: {}, updates: [] };
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
    const values = Object.keys(removeUndefinedKeys(params.values)).reduce(async (accPromise, current) => {
      const acc = await accPromise;
      const property = params.values[current];
      const association = this.associations.filter(x => x.alias === current)[0];
      const details = this._attributes[current];

      if (!association && _.get(details, 'isVirtual') !== true) {
        return _.set(acc, current, property);
      }

      const result = await processAssociationUpdate.call(this, current, property, response, association, details, primaryKeyValue, transacting);
      relationUpdates.push(...result.updates);
      return _.assign(acc, result.acc);
    }, Promise.resolve({}));

    await Promise.all(relationUpdates);

    const resolvedValues = await values;
    delete resolvedValues[this.primaryKey];
    
    if (!_.isEmpty(resolvedValues)) {
      await this.forge({
        [this.primaryKey]: getValuePrimaryKey(params, this.primaryKey),
      }).save(resolvedValues, {
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