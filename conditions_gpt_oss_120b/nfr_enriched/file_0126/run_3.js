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

/**
 * Persist a morph relation.
 */
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

/**
 * Remove a morph relation.
 */
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
 * Retrieve the maximum order for a given association and object.
 */
const getMaxOrder = async (self, association, obj, transacting) => {
  const maxOrderResult = await self.morph
    .query(qb => {
      qb.max('order as order').where({
        [`${association.alias}_id`]: obj.refId,
        [`${association.alias}_type`]: obj.targetModel.collectionName,
        field: obj.field,
      });
    })
    .fetch({ transacting });

  const { order = 0 } = maxOrderResult.toJSON();
  return order;
};

/**
 * Handle reverse one-to-many morph association.
 */
const handleReverseOneToManyMorph = async (
  self,
  association,
  targetModel,
  obj,
  response,
  transacting
) => {
  await removeRelationMorph(self, {
    params: {
      alias: association.alias,
      ref: targetModel.collectionName,
      refId: obj.refId,
      field: obj.field,
    },
    transacting,
  });

  await addRelationMorph(self, {
    params: {
      id: response[self.primaryKey],
      alias: association.alias,
      ref: targetModel.collectionName,
      refId: obj.refId,
      field: obj.field,
      order: 1,
    },
    transacting,
  });
};

/**
 * Add a new morph relation for a given object.
 */
const addMorphRelation = async (
  self,
  association,
  obj,
  response,
  transacting
) => {
  const targetModel = strapi.db.getModel(
    obj.ref,
    obj.source !== 'content-manager' ? obj.source : null
  );

  const order = await getMaxOrder(self, association, { ...obj, targetModel }, transacting);

  await addRelationMorph(self, {
    params: {
      id: response[self.primaryKey],
      alias: association.alias,
      ref: targetModel.collectionName,
      refId: obj.refId,
      field: obj.field,
      order: order + 1,
    },
    transacting,
  });
};

/**
 * Process a single association update based on its nature.
 */
const processAssociation = async (
  self,
  association,
  currentValues,
  response,
  primaryKeyValue,
  relationUpdates,
  transacting
) => {
  const property = currentValues[association.alias];
  const details = self._attributes[association.alias];
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  switch (association.nature) {
    case 'oneWay':
      _.set(self, association.alias, _.get(property, assocModel.primaryKey, property));
      break;

    case 'oneToOne':
      if (response[association.alias] === property) return;

      if (_.isNull(property)) {
        const updatePromise = assocModel
          .where({
            [assocModel.primaryKey]: getValuePrimaryKey(
              response[association.alias],
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
        _.set(self, association.alias, null);
        break;
      }

      const updateLink = self
        .where({ [association.alias]: property })
        .save(
          { [association.alias]: null },
          {
            method: 'update',
            patch: true,
            require: false,
            transacting,
          }
        )
        .then(() =>
          assocModel.where({ [self.primaryKey]: property }).save(
            { [details.via]: primaryKeyValue },
            {
              method: 'update',
              patch: true,
              require: false,
              transacting,
            }
          )
        );

      relationUpdates.push(updateLink);
      _.set(self, association.alias, property);
      break;

    case 'oneToMany':
      const currentIds = response[association.alias] || [];
      const toRemove = _.differenceWith(currentIds, property, (a, b) => {
        return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
      });

      const updatePromiseOneToMany = assocModel
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
        .then(() =>
          assocModel
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
            )
        );

      relationUpdates.push(updatePromiseOneToMany);
      break;

    case 'manyToOne':
      _.set(self, association.alias, _.get(property, assocModel.primaryKey, property));
      break;

    case 'manyWay':
    case 'manyToMany':
      const storedValue = transformToArrayID(response[association.alias]);
      const currentValue = transformToArrayID(property);

      const toAdd = _.difference(currentValue, storedValue);
      const toRemove = _.difference(storedValue, currentValue);

      const collection = self.forge({ [self.primaryKey]: primaryKeyValue })[association.alias]();

      const updatePromiseMany = collection
        .detach(toRemove, { transacting })
        .then(() => collection.attach(toAdd, { transacting }));

      relationUpdates.push(updatePromiseMany);
      break;

    case 'manyMorphToMany':
    case 'manyMorphToOne':
      const refs = property;

      if (Array.isArray(refs) && refs.length === 0) {
        relationUpdates.push(
          removeRelationMorph(self, { params: { id: primaryKeyValue }, transacting })
        );
        break;
      }

      for (const obj of refs) {
        const targetModel = strapi.db.getModel(
          obj.ref,
          obj.source !== 'content-manager' ? obj.source : null
        );

        const reverseAssoc = targetModel.associations.find(a => a.alias === obj.field);

        if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
          relationUpdates.push(
            handleReverseOneToManyMorph(self, association, targetModel, obj, response, transacting)
          );
          continue;
        }

        relationUpdates.push(
          addMorphRelation(self, association, obj, response, transacting)
        );
      }
      break;

    case 'oneToManyMorph':
    case 'manyToManyMorph':
      const currentIds = transformToArrayID(property);
      const model = strapi.db.getModel(details.collection || details.model, details.plugin);

      const promiseMorph = removeRelationMorph(model, {
        params: {
          alias: association.via,
          ref: self.collectionName,
          refId: response.id,
          field: association.alias,
        },
        transacting,
      }).then(() => {
        return Promise.all(
          currentIds.map((id, idx) =>
            addRelationMorph(model, {
              params: {
                id,
                alias: association.via,
                ref: self.collectionName,
                refId: response.id,
                field: association.alias,
                order: idx + 1,
              },
              transacting,
            })
          )
        );
      });

      relationUpdates.push(promiseMorph);
      break;

    case 'oneMorphToOne':
    case 'oneMorphToMany':
      // No operation needed for these natures in current implementation.
      break;

    default:
      break;
  }
};

/**
 * Exported service methods.
 */
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
      const promises = this.associations
        .filter(association => ['manyMorphToOne', 'manyMorphToMany'].includes(association.nature))
        .map(() =>
          this.morph
            .forge()
            .where({
              [`${this.collectionName}_id`]: getValuePrimaryKey(params, this.primaryKey),
            })
            .fetchAll({ transacting })
        );

      const related = await Promise.all(promises);
      related.forEach((value, index) => {
        data[this.associations[index].alias] = value ? value.toJSON() : value;
      });
    }

    return data;
  },

  async update(params, { transacting } = {}) {
    const relationUpdates = [];
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await module.exports.findOne.call(this, params, null, { transacting });

    const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, key) => {
      const property = params.values[key];
      const association = this.associations.find(a => a.alias === key);
      const details = this._attributes[key];

      if (!association && _.get(details, 'isVirtual') !== true) {
        _.set(acc, key, property);
        return acc;
      }

      processAssociation(
        this,
        association,
        params.values,
        response,
        primaryKeyValue,
        relationUpdates,
        transacting
      );

      return acc;
    }, {});

    await Promise.all(relationUpdates);

    delete values[this.primaryKey];
    if (!_.isEmpty(values)) {
      await this.forge({
        [this.primaryKey]: primaryKeyValue,
      }).save(values, { patch: true, transacting });
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
          break;
      }
    });

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};