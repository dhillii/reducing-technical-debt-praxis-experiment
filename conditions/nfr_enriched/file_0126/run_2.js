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

// Retrieve morph relations for a record
const retrieveMorphRelations = async function(populate, data, params, transacting) {
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

  related.forEach((value, index) => {
    data[this.associations[index].alias] = value ? value.toJSON() : value;
  });
};

// Handle oneWay and manyToOne association updates
const handleOneWayAssociation = (property, assocModel, acc, current) => {
  return _.set(acc, current, _.get(property, assocModel.primaryKey, property));
};

// Handle oneToOne association updates
const handleOneToOneAssociation = async (property, assocModel, details, response, current, primaryKeyValue, acc, transacting) => {
  const relationUpdates = [];

  if (response[current] === property) return { acc, relationUpdates };

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
    return { acc: _.set(acc, current, null), relationUpdates };
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
  return { acc: _.set(acc, current, property), relationUpdates };
};

// Handle oneToMany association updates
const handleOneToManyAssociation = (property, assocModel, details, response, current, primaryKeyValue, acc, transacting) => {
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
  return { acc, relationUpdates };
};

// Handle manyToMany and manyWay association updates
const handleManyToManyAssociation = (property, response, current, association, primaryKeyValue, acc, transacting) => {
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
  return { acc, relationUpdates };
};

// Handle adding morph relation with order calculation
const addMorphRelationWithOrder = async function(obj, association, response, transacting) {
  const targetModel = strapi.db.getModel(
    obj.ref,
    obj.source !== 'content-manager' ? obj.source : null
  );

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

// Handle manyMorphToMany and manyMorphToOne association updates
const handleManyMorphAssociation = async function(refs, association, response, primaryKeyValue, transacting) {
  const relationUpdates = [];

  if (Array.isArray(refs) && refs.length === 0) {
    relationUpdates.push(
      removeRelationMorph(this, { params: { id: primaryKeyValue }, transacting })
    );
    return relationUpdates;
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

    relationUpdates.push(addMorphRelationWithOrder.call(this, obj, association, response, transacting));
  });

  return relationUpdates;
};

// Handle oneToManyMorph and manyToManyMorph association updates
const handleMorphToManyAssociation = async (property, details, response, association, transacting) => {
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
  return relationUpdates;
};

// Process association update based on nature
const processAssociationUpdate = async function(current, property, association, details, response, primaryKeyValue, acc, transacting) {
  let relationUpdates = [];

  switch (association.nature) {
    case 'oneWay': {
      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
      return { acc: handleOneWayAssociation(property, assocModel, acc, current), relationUpdates };
    }
    case 'oneToOne': {
      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
      return await handleOneToOneAssociation.call(this, property, assocModel, details, response, current, primaryKeyValue, acc, transacting);
    }
    case 'oneToMany': {
      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
      return handleOneToManyAssociation.call(this, property, assocModel, details, response, current, primaryKeyValue, acc, transacting);
    }
    case 'manyToOne': {
      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
      return { acc: handleOneWayAssociation(property, assocModel, acc, current), relationUpdates };
    }
    case 'manyWay':
    case 'manyToMany': {
      return handleManyToManyAssociation.call(this, property, response, current, association, primaryKeyValue, acc, transacting);
    }
    case 'manyMorphToMany':
    case 'manyMorphToOne': {
      const updates = await handleManyMorphAssociation.call(this, property, association, response, primaryKeyValue, transacting);
      return { acc, relationUpdates: updates };
    }
    case 'oneToManyMorph':
    case 'manyToManyMorph': {
      const updates = await handleMorphToManyAssociation.call(this, property, details, response, association, transacting);
      return { acc, relationUpdates: updates };
    }
    case 'oneMorphToOne':
    case 'oneMorphToMany': {
      return { acc, relationUpdates };
    }
    default:
      return { acc, relationUpdates };
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

    await retrieveMorphRelations.call(this, populate, data, params, transacting);

    return data;
  },

  async update(params, { transacting } = {}) {
    const relationUpdates = [];
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, {
      transacting,
    });

    const values = Object.keys(removeUndefinedKeys(params.values)).reduce(async (accPromise, current) => {
      const acc = await accPromise;
      const property = params.values[current];
      const association = this.associations.filter(x => x.alias === current)[0];
      const details = this._attributes[current];

      if (!association && _.get(details, 'isVirtual') !== true) {
        return _.set(acc, current, property);
      }

      const { acc: updatedAcc, relationUpdates: updates } = await processAssociationUpdate.call(
        this,
        current,
        property,
        association,
        details,
        response,
        primaryKeyValue,
        acc,
        transacting
      );

      relationUpdates.push(...updates);
      return updatedAcc;
    }, Promise.resolve({}));

    const resolvedValues = await values;
    await Promise.all(relationUpdates);

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