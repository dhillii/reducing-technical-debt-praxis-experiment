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

const fetchMorphRelations = async function(populate, params, transacting) {
  if (!_.isEmpty(populate)) {
    return;
  }

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

  return related;
};

const applyMorphRelations = function(data, related) {
  related.forEach((value, index) => {
    data[this.associations[index].alias] = value ? value.toJSON() : value;
  });
};

const handleOneToOneRelation = async (acc, current, property, response, details, assocModel, primaryKeyValue, relationUpdates, transacting) => {
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
  return _.set(acc, current, property);
};

const handleOneToManyRelation = (acc, current, property, response, details, assocModel, primaryKeyValue, relationUpdates, transacting) => {
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
};

const handleManyToManyRelation = (acc, current, property, response, association, primaryKeyValue, relationUpdates, transacting) => {
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
  return acc;
};

const handleMorphRelationForOneToManyMorph = async (obj, association, details, response, relationUpdates, transacting) => {
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
};

const handleManyMorphRelation = async (acc, current, property, response, association, details, relationUpdates, transacting) => {
  const refs = property;

  if (Array.isArray(refs) && refs.length === 0) {
    relationUpdates.push(
      removeRelationMorph(this, { params: { id: response[this.primaryKey] }, transacting })
    );
    return acc;
  }

  for (const obj of refs) {
    await handleMorphRelationForOneToManyMorph.call(this, obj, association, details, response, relationUpdates, transacting);
  }

  return acc;
};

const handleMorphToManyRelation = async (acc, current, property, response, association, details, relationUpdates, transacting) => {
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
  return acc;
};

const processAssociationUpdate = async function(acc, current, response, params, relationUpdates, transacting) {
  const property = params.values[current];
  const association = this.associations.filter(x => x.alias === current)[0];
  const details = this._attributes[current];

  if (!association && _.get(details, 'isVirtual') !== true) {
    return _.set(acc, current, property);
  }

  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  switch (association.nature) {
    case 'oneWay': {
      return _.set(acc, current, _.get(property, assocModel.primaryKey, property));
    }
    case 'oneToOne': {
      return await handleOneToOneRelation.call(this, acc, current, property, response, details, assocModel, getValuePrimaryKey(params, this.primaryKey), relationUpdates, transacting);
    }
    case 'oneToMany': {
      return handleOneToManyRelation.call(this, acc, current, property, response, details, assocModel, getValuePrimaryKey(params, this.primaryKey), relationUpdates, transacting);
    }
    case 'manyToOne': {
      return _.set(acc, current, _.get(property, assocModel.primaryKey, property));
    }
    case 'manyWay':
    case 'manyToMany': {
      return handleManyToManyRelation.call(this, acc, current, property, response, association, getValuePrimaryKey(params, this.primaryKey), relationUpdates, transacting);
    }
    case 'manyMorphToMany':
    case 'manyMorphToOne': {
      return await handleManyMorphRelation.call(this, acc, current, property, response, association, details, relationUpdates, transacting);
    }
    case 'oneToManyMorph':
    case 'manyToManyMorph': {
      return await handleMorphToManyRelation.call(this, acc, current, property, response, association, details, relationUpdates, transacting);
    }
    case 'oneMorphToOne':
    case 'oneMorphToMany': {
      return acc;
    }
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

    const related = await fetchMorphRelations.call(this, populate, params, transacting);
    if (related) {
      applyMorphRelations.call(this, data, related);
    }

    return data;
  },

  async update(params, { transacting } = {}) {
    const relationUpdates = [];
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, {
      transacting,
    });

    const values = {};
    const cleanParams = removeUndefinedKeys(params.values);

    for (const current of Object.keys(cleanParams)) {
      const result = await processAssociationUpdate.call(this, values, current, response, params, relationUpdates, transacting);
      Object.assign(values, result);
    }

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