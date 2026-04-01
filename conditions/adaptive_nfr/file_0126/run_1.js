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
 * Handles oneWay association update
 */
const handleOneWayUpdate = (property, assocModel, details) => {
  return _.get(property, assocModel.primaryKey, property);
};

/**
 * Handles oneToOne association update
 */
const handleOneToOneUpdate = async (
  current,
  property,
  response,
  assocModel,
  details,
  primaryKeyValue,
  transacting
) => {
  const relationUpdates = [];

  if (response[current] === property) return { value: null, updates: relationUpdates };

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
    return { value: null, updates: relationUpdates };
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
  return { value: property, updates: relationUpdates };
};

/**
 * Handles oneToMany association update
 */
const handleOneToManyUpdate = async (
  current,
  property,
  response,
  assocModel,
  details,
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

  return { updates: [updatePromise] };
};

/**
 * Handles manyToOne association update
 */
const handleManyToOneUpdate = (property, assocModel) => {
  return _.get(property, assocModel.primaryKey, property);
};

/**
 * Handles manyWay and manyToMany association update
 */
const handleManyToManyUpdate = (
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

  return { updates: [updatePromise] };
};

/**
 * Handles manyMorphToMany and manyMorphToOne association update
 */
const handleManyMorphUpdate = async (
  current,
  property,
  response,
  association,
  primaryKeyValue,
  transacting
) => {
  const relationUpdates = [];
  const refs = property;

  if (Array.isArray(refs) && refs.length === 0) {
    relationUpdates.push(
      removeRelationMorph(this, { params: { id: primaryKeyValue }, transacting })
    );
    return { updates: relationUpdates };
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
  });

  return { updates: relationUpdates };
};

/**
 * Handles oneToManyMorph and manyToManyMorph association update
 */
const handleMorphToManyUpdate = async (
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

  return { updates: [promise] };
};

/**
 * Association update strategy dispatcher
 */
const associationUpdateStrategies = {
  oneWay: handleOneWayUpdate,
  manyToOne: handleManyToOneUpdate,
  oneToOne: handleOneToOneUpdate,
  oneToMany: handleOneToManyUpdate,
  manyWay: handleManyToManyUpdate,
  manyToMany: handleManyToManyUpdate,
  manyMorphToMany: handleManyMorphUpdate,
  manyMorphToOne: handleManyMorphUpdate,
  oneToManyMorph: handleMorphToManyUpdate,
  manyToManyMorph: handleMorphToManyUpdate,
  oneMorphToOne: () => ({ value: undefined, updates: [] }),
  oneMorphToMany: () => ({ value: undefined, updates: [] }),
};

/**
 * Determines if association requires special handling
 */
const isAssociationRelation = (association, details) => {
  return association && _.get(details, 'isVirtual') !== true;
};

/**
 * Processes a single association update
 */
const processAssociationUpdate = async function (
  current,
  property,
  association,
  details,
  primaryKeyValue,
  response,
  transacting
) {
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
  const strategy = associationUpdateStrategies[association.nature];

  if (!strategy) {
    return { value: undefined, updates: [] };
  }

  const result = await strategy.call(
    this,
    current,
    property,
    response,
    association,
    primaryKeyValue,
    assocModel,
    details,
    transacting
  );

  return result || { value: undefined, updates: [] };
};

/**
 * Deletion value strategies for different association types
 */
const deletionValueStrategies = {
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
 * Gets deletion value for association type
 */
const getDeletionValue = (nature) => {
  return deletionValueStrategies[nature] !== undefined ? deletionValueStrategies[nature] : null;
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

        if (!isAssociationRelation(association, details)) {
          return _.set(acc, current, property);
        }

        const result = await processAssociationUpdate.call(
          this,
          current,
          property,
          association,
          details,
          primaryKeyValue,
          response,
          transacting
        );

        relationUpdates.push(...result.updates);

        if (result.value !== undefined) {
          return _.set(acc, current, result.value);
        }

        return acc;
      },
      Promise.resolve({})
    );

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

    this.associations.forEach(association => {
      values[association.alias] = getDeletionValue(association.nature);
    });

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};
```