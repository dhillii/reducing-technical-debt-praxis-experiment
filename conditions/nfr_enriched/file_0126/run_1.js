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

// Helper: Retrieve morph relations manually when populate is empty
const fetchMorphRelations = async function(params, transacting) {
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
  const morphData = {};

  related.forEach((value, index) => {
    morphData[this.associations[index].alias] = value ? value.toJSON() : value;
  });

  return morphData;
};

// Helper: Handle oneWay relation update
const handleOneWayUpdate = (property, association, details, assocModel) => {
  return _.get(property, assocModel.primaryKey, property);
};

// Helper: Handle oneToOne relation update
const handleOneToOneUpdate = async (current, property, response, association, details, assocModel, primaryKeyValue, relationUpdates, transacting) => {
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

    relationUpdates.push(updatePromise);
    return null;
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
  return property;
};

// Helper: Handle oneToMany relation update
const handleOneToManyUpdate = (property, response, current, association, details, assocModel, primaryKeyValue, relationUpdates, transacting) => {
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
};

// Helper: Handle manyToOne relation update
const handleManyToOneUpdate = (property, association, details, assocModel) => {
  return _.get(property, assocModel.primaryKey, property);
};

// Helper: Handle manyWay/manyToMany relation update
const handleManyToManyUpdate = (response, current, params, association, primaryKeyValue, relationUpdates, transacting) => {
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
};

// Helper: Process single morph reference for manyMorphToMany/manyMorphToOne
const processMorphReference = async (obj, association, response, relationUpdates, transacting) => {
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

// Helper: Handle manyMorphToMany/manyMorphToOne relation update
const handleManyMorphUpdate = async (current, params, association, response, relationUpdates, transacting) => {
  const refs = params.values[current];

  if (Array.isArray(refs) && refs.length === 0) {
    relationUpdates.push(
      removeRelationMorph(this, { params: { id: response[this.primaryKey] }, transacting })
    );
    return;
  }

  for (const obj of refs) {
    await processMorphReference.call(this, obj, association, response, relationUpdates, transacting);
  }
};

// Helper: Handle oneToManyMorph/manyToManyMorph relation update
const handleMorphToManyUpdate = (current, params, association, details, response, relationUpdates, transacting) => {
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
};

// Helper: Process single attribute for update
const processAttributeForUpdate = async function(current, property, association, details, response, params, primaryKeyValue, relationUpdates, transacting) {
  if (!association && _.get(details, 'isVirtual') !== true) {
    return { [current]: property };
  }

  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  switch (association.nature) {
    case 'oneWay': {
      return { [current]: handleOneWayUpdate(property, association, details, assocModel) };
    }
    case 'oneToOne': {
      const value = await handleOneToOneUpdate.call(this, current, property, response, association, details, assocModel, primaryKeyValue, relationUpdates, transacting);
      return value !== null ? { [current]: value } : {};
    }
    case 'oneToMany': {
      handleOneToManyUpdate.call(this, property, response, current, association, details, assocModel, primaryKeyValue, relationUpdates, transacting);
      return {};
    }
    case 'manyToOne': {
      return { [current]: handleManyToOneUpdate(property, association, details, assocModel) };
    }
    case 'manyWay':
    case 'manyToMany': {
      handleManyToManyUpdate.call(this, response, current, params, association, primaryKeyValue, relationUpdates, transacting);
      return {};
    }
    case 'manyMorphToMany':
    case 'manyMorphToOne': {
      await handleManyMorphUpdate.call(this, current, params, association, response, relationUpdates, transacting);
      return {};
    }
    case 'oneToManyMorph':
    case 'manyToManyMorph': {
      handleMorphToManyUpdate.call(this, current, params, association, details, response, relationUpdates, transacting);
      return {};
    }
    case 'oneMorphToOne':
    case 'oneMorphToMany': {
      return {};
    }
    default:
      return {};
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

    if (_.isEmpty(populate)) {
      const morphData = await fetchMorphRelations.call(this, params, transacting);
      Object.assign(data, morphData);
    }

    return data;
  },

  async update(params, { transacting } = {}) {
    const relationUpdates = [];
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, {
      transacting,
    });

    const cleanParams = removeUndefinedKeys(params.values);
    const attributeKeys = Object.keys(cleanParams);
    const updatePromises = attributeKeys.map(current =>
      processAttributeForUpdate.call(
        this,
        current,
        params.values[current],
        this.associations.find(x => x.alias === current),
        this._attributes[current],
        response,
        params,
        primaryKeyValue,
        relationUpdates,
        transacting
      )
    );

    const attributeResults = await Promise.all(updatePromises);
    const values = Object.assign({}, ...attributeResults);

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