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
 * Fetch a single record and optionally populate manual morph relations.
 */
const fetchRecord = async (model, params, populate, { transacting } = {}) => {
  const record = await model
    .forge({
      [model.primaryKey]: getValuePrimaryKey(params, model.primaryKey),
    })
    .fetch({
      transacting,
      withRelated: populate,
    });

  const data = record ? record.toJSON() : record;

  if (_.isEmpty(populate)) {
    await populateManualMorphRelations(model, params, data, { transacting });
  }

  return data;
};

/**
 * Populate manyMorphToOne / manyMorphToMany relations manually.
 */
const populateManualMorphRelations = async (model, params, data, { transacting } = {}) => {
  const morphPromises = model.associations
    .filter(association => ['manyMorphToOne', 'manyMorphToMany'].includes(association.nature))
    .map(() => {
      return model.morph
        .forge()
        .where({
          [`${model.collectionName}_id`]: getValuePrimaryKey(params, model.primaryKey),
        })
        .fetchAll({ transacting });
    });

  const related = await Promise.all(morphPromises);

  related.forEach((value, index) => {
    const alias = model.associations[index].alias;
    data[alias] = value ? value.toJSON() : value;
  });
};

/**
 * Build update payload for non‑relation fields.
 */
const buildNonRelationValues = (params, model, response, primaryKeyValue, relationUpdates) => {
  const values = {};

  Object.keys(removeUndefinedKeys(params.values)).forEach(key => {
    const property = params.values[key];
    const association = model.associations.find(x => x.alias === key);
    const details = model._attributes[key];

    if (!association && _.get(details, 'isVirtual') !== true) {
      values[key] = property;
      return;
    }

    // Delegate relation handling.
    handleRelation({
      key,
      property,
      association,
      details,
      model,
      response,
      primaryKeyValue,
      relationUpdates,
    });
  });

  return values;
};

/**
 * Dispatch handling based on association nature.
 */
const handleRelation = ({
  key,
  property,
  association,
  details,
  model,
  response,
  primaryKeyValue,
  relationUpdates,
}) => {
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  switch (association.nature) {
    case 'oneWay':
      // Store foreign key directly.
      relationUpdates.push(
        Promise.resolve().then(() => {
          // No extra DB work needed; value will be saved later.
        })
      );
      break;

    case 'oneToOne':
      handleOneToOne({
        key,
        property,
        association,
        details,
        model,
        response,
        primaryKeyValue,
        assocModel,
        relationUpdates,
      });
      break;

    case 'oneToMany':
      handleOneToMany({
        key,
        property,
        association,
        details,
        model,
        response,
        primaryKeyValue,
        assocModel,
        relationUpdates,
      });
      break;

    case 'manyToOne':
      // Store foreign key directly.
      relationUpdates.push(
        Promise.resolve().then(() => {
          // No extra DB work needed; value will be saved later.
        })
      );
      break;

    case 'manyWay':
    case 'manyToMany':
      handleManyToMany({
        key,
        property,
        association,
        model,
        response,
        primaryKeyValue,
        relationUpdates,
      });
      break;

    case 'manyMorphToMany':
    case 'manyMorphToOne':
      handleMorphRelations({
        key,
        property,
        association,
        model,
        response,
        primaryKeyValue,
        relationUpdates,
      });
      break;

    case 'oneToManyMorph':
    case 'manyToManyMorph':
      handleInverseMorphRelations({
        key,
        property,
        association,
        details,
        model,
        response,
        relationUpdates,
      });
      break;

    // No‑op for unsupported or virtual types.
    case 'oneMorphToOne':
    case 'oneMorphToMany':
    default:
      break;
  }
};

/**
 * Handle one‑to‑one relation updates.
 */
const handleOneToOne = async ({
  key,
  property,
  association,
  details,
  model,
  response,
  primaryKeyValue,
  assocModel,
  relationUpdates,
}) => {
  if (response[key] === property) return;

  if (_.isNull(property)) {
    const updatePromise = assocModel
      .where({
        [assocModel.primaryKey]: getValuePrimaryKey(response[key], assocModel.primaryKey),
      })
      .save(
        { [details.via]: null },
        {
          method: 'update',
          patch: true,
          require: false,
          transacting: relationUpdates.transacting,
        }
      );

    relationUpdates.push(updatePromise);
    return;
  }

  const updateLink = model
    .where({ [key]: property })
    .save(
      { [key]: null },
      {
        method: 'update',
        patch: true,
        require: false,
        transacting: relationUpdates.transacting,
      }
    )
    .then(() => {
      return assocModel
        .where({ [assocModel.primaryKey]: property })
        .save(
          { [details.via]: primaryKeyValue },
          {
            method: 'update',
            patch: true,
            require: false,
            transacting: relationUpdates.transacting,
          }
        );
    });

  relationUpdates.push(updateLink);
};

/**
 * Handle one‑to‑many relation updates.
 */
const handleOneToMany = ({
  key,
  property,
  association,
  details,
  model,
  response,
  primaryKeyValue,
  assocModel,
  relationUpdates,
}) => {
  const currentIds = response[key];
  const toRemove = _.differenceWith(currentIds, property, (a, b) => {
    return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
  });

  const removePromise = assocModel
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
        transacting: relationUpdates.transacting,
      }
    );

  const addPromise = assocModel
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
        transacting: relationUpdates.transacting,
      }
    );

  relationUpdates.push(removePromise.then(() => addPromise));
};

/**
 * Handle many‑to‑many relation updates.
 */
const handleManyToMany = ({
  key,
  property,
  association,
  model,
  response,
  primaryKeyValue,
  relationUpdates,
}) => {
  const storedValue = transformToArrayID(response[key]);
  const currentValue = transformToArrayID(property);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = model.forge({ [model.primaryKey]: primaryKeyValue })[association.alias]();

  const promise = collection
    .detach(toRemove, { transacting: relationUpdates.transacting })
    .then(() => collection.attach(toAdd, { transacting: relationUpdates.transacting }));

  relationUpdates.push(promise);
};

/**
 * Handle morph (media ↔ model) relation updates.
 */
const handleMorphRelations = ({
  key,
  property,
  association,
  model,
  response,
  primaryKeyValue,
  relationUpdates,
}) => {
  const refs = property;

  if (Array.isArray(refs) && refs.length === 0) {
    relationUpdates.push(
      removeRelationMorph(model, { params: { id: primaryKeyValue }, transacting: relationUpdates.transacting })
    );
    return;
  }

  refs.forEach(obj => {
    const targetModel = strapi.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );

    const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      const promise = removeRelationMorph(model, {
        params: {
          alias: association.alias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
        },
        transacting: relationUpdates.transacting,
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
          transacting: relationUpdates.transacting,
        })
      );

      relationUpdates.push(promise);
      return;
    }

    const addRelation = async () => {
      const maxOrder = await model.morph.query(qb => {
        qb.max('order as order').where({
          [`${association.alias}_id`]: obj.refId,
          [`${association.alias}_type`]: targetModel.collectionName,
          field: obj.field,
        });
      }).fetch({ transacting: relationUpdates.transacting });

      const { order = 0 } = maxOrder.toJSON();

      await addRelationMorph(model, {
        params: {
          id: response[model.primaryKey],
          alias: association.alias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
          order: order + 1,
        },
        transacting: relationUpdates.transacting,
      });
    };

    relationUpdates.push(addRelation());
  });
};

/**
 * Handle inverse morph relations (model ↔ media).
 */
const handleInverseMorphRelations = ({
  key,
  property,
  association,
  details,
  model,
  response,
  relationUpdates,
}) => {
  const currentValue = transformToArrayID(property);
  const targetModel = strapi.db.getModel(details.collection || details.model, details.plugin);

  const cleanup = removeRelationMorph(targetModel, {
    params: {
      alias: association.via,
      ref: model.collectionName,
      refId: response.id,
      field: association.alias,
    },
    transacting: relationUpdates.transacting,
  });

  const attachAll = Promise.all(
    currentValue.map((id, idx) => {
      return addRelationMorph(targetModel, {
        params: {
          id,
          alias: association.via,
          ref: model.collectionName,
          refId: response.id,
          field: association.alias,
          order: idx + 1,
        },
        transacting: relationUpdates.transacting,
      });
    })
  );

  relationUpdates.push(cleanup.then(() => attachAll));
};

/**
 * Delete all relations for a given record.
 */
const deleteAllRelations = async (model, id, { transacting }) => {
  const values = {};

  model.associations.forEach(association => {
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
        break;
    }
  });

  return model.updateRelations({ [model.primaryKey]: id, values }, { transacting });
};

module.exports = {
  async findOne(params, populate, { transacting } = {}) {
    return await fetchRecord(this, params, populate, { transacting });
  },

  async update(params, { transacting } = {}) {
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await this.findOne(params, null, { transacting });

    const relationUpdates = [];

    const nonRelationValues = buildNonRelationValues(
      params,
      this,
      response,
      primaryKeyValue,
      relationUpdates
    );

    await Promise.all(relationUpdates);

    // Remove primary key from payload.
    delete nonRelationValues[this.primaryKey];

    if (!_.isEmpty(nonRelationValues)) {
      await this
        .forge({ [this.primaryKey]: primaryKeyValue })
        .save(nonRelationValues, { patch: true, transacting });
    }

    const result = await this
      .forge({ [this.primaryKey]: primaryKeyValue })
      .fetch({ transacting });

    return result && result.toJSON ? result.toJSON() : result;
  },

  deleteRelations(id, { transacting }) {
    return deleteAllRelations(this, id, { transacting });
  },
};