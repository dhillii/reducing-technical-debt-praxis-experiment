'use strict';

const _ = require('lodash');
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

const handleOneWay = (property, assocModel) => _.get(property, assocModel.primaryKey, property);

const handleManyToOne = (property, assocModel) => _.get(property, assocModel.primaryKey, property);

const handleOneToOne = async (
  model,
  key,
  property,
  assocModel,
  details,
  response,
  primaryKeyValue,
  relationUpdates
) => {
  if (response[key] === property) return response[key];
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
    relationUpdates.promises.push(updatePromise);
    return null;
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
      return assocModel.where({ [assocModel.primaryKey]: property }).save(
        { [details.via]: primaryKeyValue },
        {
          method: 'update',
          patch: true,
          require: false,
          transacting: relationUpdates.transacting,
        }
      );
    });

  relationUpdates.promises.push(updateLink);
  return property;
};

const handleOneToMany = async (
  model,
  key,
  property,
  assocModel,
  details,
  response,
  primaryKeyValue,
  relationUpdates
) => {
  const currentIds = response[key] || [];
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
        transacting: relationUpdates.transacting,
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
            transacting: relationUpdates.transacting,
          }
        );
    });

  relationUpdates.promises.push(updatePromise);
  return undefined;
};

const handleManyToMany = async (
  model,
  key,
  property,
  association,
  response,
  primaryKeyValue,
  relationUpdates
) => {
  const storedValue = transformToArrayID(response[key]);
  const currentValue = transformToArrayID(property);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = model.forge({ [model.primaryKey]: primaryKeyValue })[association.alias]();

  const updatePromise = collection
    .detach(toRemove, { transacting: relationUpdates.transacting })
    .then(() => collection.attach(toAdd, { transacting: relationUpdates.transacting }));

  relationUpdates.promises.push(updatePromise);
  return undefined;
};

const handleMorphToManyOrOne = async (
  model,
  key,
  refs,
  association,
  response,
  relationUpdates
) => {
  if (Array.isArray(refs) && refs.length === 0) {
    relationUpdates.promises.push(
      removeRelationMorph(model, { params: { id: response[model.primaryKey] }, transacting: relationUpdates.transacting })
    );
    return;
  }

  for (const obj of refs) {
    const targetModel = strapi.db.getModel(
      obj.ref,
      obj.source !== 'content-manager' ? obj.source : null
    );

    const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      relationUpdates.promises.push(
        removeRelationMorph(model, {
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
        )
      );
      continue;
    }

    const addRelation = async () => {
      const maxOrderResult = await model.morph
        .query(qb => {
          qb.max('order as order').where({
            [`${association.alias}_id`]: obj.refId,
            [`${association.alias}_type`]: targetModel.collectionName,
            field: obj.field,
          });
        })
        .fetch({ transacting: relationUpdates.transacting });

      const { order = 0 } = maxOrderResult ? maxOrderResult.toJSON() : {};

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

    relationUpdates.promises.push(addRelation());
  }
};

const handleMorphFromModel = async (
  model,
  key,
  property,
  association,
  details,
  response,
  relationUpdates
) => {
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

  const addAll = Promise.all(
    currentValue.map((id, idx) =>
      addRelationMorph(targetModel, {
        params: {
          id,
          alias: association.via,
          ref: model.collectionName,
          refId: response.id,
          field: association.alias,
          order: idx + 1,
        },
        transacting: relationUpdates.transacting,
      })
    )
  );

  relationUpdates.promises.push(cleanup.then(() => addAll));
};

const processAssociation = async (
  model,
  key,
  property,
  association,
  details,
  response,
  primaryKeyValue,
  relationUpdates
) => {
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  switch (association.nature) {
    case 'oneWay':
      return handleOneWay(property, assocModel);
    case 'oneToOne':
      return await handleOneToOne(
        model,
        key,
        property,
        assocModel,
        details,
        response,
        primaryKeyValue,
        relationUpdates
      );
    case 'oneToMany':
      await handleOneToMany(
        model,
        key,
        property,
        assocModel,
        details,
        response,
        primaryKeyValue,
        relationUpdates
      );
      return undefined;
    case 'manyToOne':
      return handleManyToOne(property, assocModel);
    case 'manyToMany':
    case 'manyWay':
      await handleManyToMany(
        model,
        key,
        property,
        association,
        response,
        primaryKeyValue,
        relationUpdates
      );
      return undefined;
    case 'manyMorphToMany':
    case 'manyMorphToOne':
      await handleMorphToManyOrOne(model, key, property, association, response, relationUpdates);
      return undefined;
    case 'oneToManyMorph':
    case 'manyToManyMorph':
      await handleMorphFromModel(model, key, property, association, details, response, relationUpdates);
      return undefined;
    case 'oneMorphToOne':
    case 'oneMorphToMany':
      return undefined;
    default:
      return undefined;
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
      const arrayOfPromises = this.associations
        .filter(association => ['manyMorphToOne', 'manyMorphToMany'].includes(association.nature))
        .map(() => {
          return this.morph
            .forge()
            .where({
              [`${this.collectionName}_id`]: getValuePrimaryKey(params, this.primaryKey),
            })
            .fetchAll({ transacting });
        });

      const related = await Promise.all(arrayOfPromises);
      related.forEach((value, index) => {
        data[this.associations[index].alias] = value ? value.toJSON() : value;
      });
    }

    return data;
  },

  async update(params, { transacting } = {}) {
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, { transacting });

    const relationUpdates = { promises: [], transacting };
    const values = {};

    const keys = Object.keys(removeUndefinedKeys(params.values));
    for (const key of keys) {
      const property = params.values[key];
      const association = this.associations.find(x => x.alias === key);
      const details = this._attributes[key];

      if (!association && _.get(details, 'isVirtual') !== true) {
        _.set(values, key, property);
        continue;
      }

      const result = await processAssociation(
        this,
        key,
        property,
        association,
        details,
        response,
        primaryKeyValue,
        relationUpdates
      );

      if (result !== undefined) {
        _.set(values, key, result);
      }
    }

    await Promise.all(relationUpdates.promises);

    delete values[this.primaryKey];
    if (!_.isEmpty(values)) {
      await this.forge({ [this.primaryKey]: primaryKeyValue }).save(values, {
        patch: true,
        transacting,
      });
    }

    const result = await this.forge({ [this.primaryKey]: primaryKeyValue }).fetch({ transacting });
    return result && result.toJSON ? result.toJSON() : result;
  },

  deleteRelations(id, { transacting }) {
    const values = {};

    this.associations.forEach(association => {
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