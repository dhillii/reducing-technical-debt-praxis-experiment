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

// Extract max order query logic
const getMaxOrderForMorphRelation = async (model, association, obj, transacting) => {
  const maxOrder = await model.morph
    .query(qb => {
      qb.max('order as order').where({
        [`${association.alias}_id`]: obj.refId,
        [`${association.alias}_type`]: obj.targetModelCollectionName,
        field: obj.field,
      });
    })
    .fetch({ transacting });

  return maxOrder.toJSON().order || 0;
};

// Extract relation addition logic for morph relations
const addMorphRelationWithOrder = async (model, association, obj, response, transacting) => {
  const order = await getMaxOrderForMorphRelation(model, association, obj, transacting);

  await addRelationMorph(model, {
    params: {
      id: response[model.primaryKey],
      alias: association.alias,
      ref: obj.targetModelCollectionName,
      refId: obj.refId,
      field: obj.field,
      order: order + 1,
    },
    transacting,
  });
};

// Handle oneWay and manyToOne associations
const handleOneWayAssociation = (acc, current, property, assocModel) => {
  return _.set(acc, current, _.get(property, assocModel.primaryKey, property));
};

// Handle oneToOne association
const handleOneToOneAssociation = async (
  acc,
  current,
  property,
  response,
  association,
  details,
  assocModel,
  primaryKeyValue,
  transacting
) => {
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

    return { updatePromise, acc: _.set(acc, current, null) };
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

  return { updatePromise: updateLink, acc: _.set(acc, current, property) };
};

// Handle oneToMany association
const handleOneToManyAssociation = async (
  acc,
  current,
  property,
  response,
  details,
  assocModel,
  primaryKeyValue,
  transacting
) => {
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

  return { updatePromise, acc };
};

// Handle manyToMany and manyWay associations
const handleManyToManyAssociation = async (
  acc,
  current,
  property,
  response,
  association,
  primaryKeyValue,
  transacting
) => {
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

  return { updatePromise, acc };
};

// Handle manyMorphToOne and manyMorphToMany associations
const handleManyMorphAssociation = async (
  current,
  refs,
  association,
  response,
  primaryKeyValue,
  transacting
) => {
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

    const addRelation = addMorphRelationWithOrder.call(this, this, association, {
      refId: obj.refId,
      field: obj.field,
      targetModelCollectionName: targetModel.collectionName,
    }, response, transacting);

    relationUpdates.push(addRelation);
  });

  return relationUpdates;
};

// Handle oneToManyMorph and manyToManyMorph associations
const handleMorphToManyAssociation = async (
  current,
  property,
  response,
  association,
  details,
  transacting
) => {
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

  return promise;
};

// Process association update based on nature
const processAssociationUpdate = async function(
  acc,
  current,
  property,
  association,
  details,
  response,
  primaryKeyValue,
  transacting
) {
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  switch (association.nature) {
    case 'oneWay':
    case 'manyToOne':
      return _.set(acc, current, _.get(property, assocModel.primaryKey, property));

    case 'oneToOne': {
      const result = await handleOneToOneAssociation.call(
        this,
        acc,
        current,
        property,
        response,
        association,
        details,
        assocModel,
        primaryKeyValue,
        transacting
      );
      return result.acc;
    }

    case 'oneToMany': {
      const result = await handleOneToManyAssociation.call(
        this,
        acc,
        current,
        property,
        response,
        details,
        assocModel,
        primaryKeyValue,
        transacting
      );
      return result.acc;
    }

    case 'manyWay':
    case 'manyToMany': {
      const result = await handleManyToManyAssociation.call(
        this,
        acc,
        current,
        property,
        response,
        association,
        primaryKeyValue,
        transacting
      );
      return result.acc;
    }

    case 'manyMorphToMany':
    case 'manyMorphToOne':
      return acc;

    case 'oneToManyMorph':
    case 'manyToManyMorph':
      return acc;

    case 'oneMorphToOne':
    case 'oneMorphToMany':
      return acc;

    default:
      return acc;
  }
};

// Collect relation updates based on association nature
const collectRelationUpdates = async function(
  relationUpdates,
  current,
  property,
  association,
  details,
  response,
  primaryKeyValue,
  transacting
) {
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  switch (association.nature) {
    case 'oneToOne': {
      const result = await handleOneToOneAssociation.call(
        this,
        {},
        current,
        property,
        response,
        association,
        details,
        assocModel,
        primaryKeyValue,
        transacting
      );
      if (result.updatePromise) {
        relationUpdates.push(result.updatePromise);
      }
      break;
    }

    case 'oneToMany': {
      const result = await handleOneToManyAssociation.call(
        this,
        {},
        current,
        property,
        response,
        details,
        assocModel,
        primaryKeyValue,
        transacting
      );
      if (result.updatePromise) {
        relationUpdates.push(result.updatePromise);
      }
      break;
    }

    case 'manyWay':
    case 'manyToMany': {
      const result = await handleManyToManyAssociation.call(
        this,
        {},
        current,
        property,
        response,
        association,
        primaryKeyValue,
        transacting
      );
      if (result.updatePromise) {
        relationUpdates.push(result.updatePromise);
      }
      break;
    }

    case 'manyMorphToMany':
    case 'manyMorphToOne': {
      const updates = await handleManyMorphAssociation.call(
        this,
        current,
        property,
        association,
        response,
        primaryKeyValue,
        transacting
      );
      relationUpdates.push(...updates);
      break;
    }

    case 'oneToManyMorph':
    case 'manyToManyMorph': {
      const promise = await handleMorphToManyAssociation.call(
        this,
        current,
        property,
        response,
        association,
        details,
        transacting
      );
      relationUpdates.push(promise);
      break;
    }

    default:
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
    const values = Object.keys(removeUndefinedKeys(params.values)).reduce(
      async (accPromise, current) => {
        const acc = await accPromise;
        const property = params.values[current];
        const association = this.associations.filter(x => x.alias === current)[0];
        const details = this._attributes[current];

        if (!association && _.get(details, 'isVirtual') !== true) {
          return _.set(acc, current, property);
        }

        await collectRelationUpdates.call(
          this,
          relationUpdates,
          current,
          property,
          association,
          details,
          response,
          primaryKeyValue,
          transacting
        );

        return await processAssociationUpdate.call(
          this,
          acc,
          current,
          property,
          association,
          details,
          response,
          primaryKeyValue,
          transacting
        );
      },
      Promise.resolve({})
    );

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