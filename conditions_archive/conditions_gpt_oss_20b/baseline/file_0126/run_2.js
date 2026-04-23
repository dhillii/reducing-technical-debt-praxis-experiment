'use strict';

const _ = require('lodash');
const { models: { getValuePrimaryKey } } = require('strapi-utils');

const transformToArrayID = array => {
  if (!_.isArray(array)) return transformToArrayID([array]);

  return array
    .map(v => _.get(v, 'id') || v)
    .filter(Boolean)
    .map(String);
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

const fetchRecord = async (model, params, populate, transacting) => {
  const record = await model.forge({
    [model.primaryKey]: getValuePrimaryKey(params, model.primaryKey),
  }).fetch({
    transacting,
    withRelated: populate,
  });

  return record ? record.toJSON() : record;
};

const updateAssociation = async (association, property, response, primaryKeyValue, transacting, model, details, assocModel, currentValue, storedValue) => {
  switch (association.nature) {
    case 'oneWay':
    case 'manyToOne':
      return property;

    case 'oneToOne': {
      if (response[association.alias] === property) return property;

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
        return updatePromise.then(() => null);
      }

      const updateLink = model
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
          assocModel
            .where({ [assocModel.primaryKey]: property })
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

      return updateLink.then(() => property);
    }

    case 'oneToMany': {
      const currentIds = response[association.alias];
      const toRemove = _.differenceWith(
        currentIds,
        property,
        (a, b) => `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`
      );

      const updatePromise = assocModel
        .where(
          assocModel.primaryKey,
          'in',
          toRemove.map(v => v[assocModel.primaryKey] || v)
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
              property.map(v => v[assocModel.primaryKey] || v)
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

      return updatePromise;
    }

    case 'manyWay':
    case 'manyToMany': {
      const toAdd = _.difference(currentValue, storedValue);
      const toRemove = _.difference(storedValue, currentValue);

      const collection = model.forge({ [model.primaryKey]: primaryKeyValue })[association.alias]();

      const updatePromise = collection
        .detach(toRemove, { transacting })
        .then(() => collection.attach(toAdd, { transacting }));

      return updatePromise;
    }

    case 'manyMorphToMany':
    case 'manyMorphToOne': {
      const refs = property;
      if (Array.isArray(refs) && refs.length === 0) {
        return removeRelationMorph(model, { params: { id: primaryKeyValue }, transacting });
      }

      const promises = refs.map(async obj => {
        const targetModel = strapi.db.getModel(
          obj.ref,
          obj.source !== 'content-manager' ? obj.source : null
        );

        const reverseAssoc = targetModel.associations.find(a => a.alias === obj.field);

        if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
          await removeRelationMorph(model, {
            params: {
              alias: association.alias,
              ref: targetModel.collectionName,
              refId: obj.refId,
              field: obj.field,
            },
            transacting,
          });

          return addRelationMorph(model, {
            params: {
              id: response[model.primaryKey],
              alias: association.alias,
              ref: targetModel.collectionName,
              refId: obj.refId,
              field: obj.field,
              order: 1,
            },
            transacting,
          });
        }

        const maxOrder = await model.morph
          .query(qb => {
            qb.max('order as order').where({
              [`${association.alias}_id`]: obj.refId,
              [`${association.alias}_type`]: targetModel.collectionName,
              field: obj.field,
            });
          })
          .fetch({ transacting });

        const { order = 0 } = maxOrder.toJSON();

        return addRelationMorph(model, {
          params: {
            id: response[model.primaryKey],
            alias: association.alias,
            ref: targetModel.collectionName,
            refId: obj.refId,
            field: obj.field,
            order: order + 1,
          },
          transacting,
        });
      });

      return Promise.all(promises);
    }

    case 'oneToManyMorph':
    case 'manyToManyMorph': {
      const currentValue = transformToArrayID(property);
      const modelTo = strapi.db.getModel(details.collection || details.model, details.plugin);

      const promise = removeRelationMorph(modelTo, {
        params: {
          alias: association.via,
          ref: model.collectionName,
          refId: response.id,
          field: association.alias,
        },
        transacting,
      }).then(() =>
        Promise.all(
          currentValue.map((id, idx) =>
            addRelationMorph(modelTo, {
              params: {
                id,
                alias: association.via,
                ref: model.collectionName,
                refId: response.id,
                field: association.alias,
                order: idx + 1,
              },
              transacting,
            })
          )
        )
      );

      return promise;
    }

    case 'oneMorphToOne':
    case 'oneMorphToMany':
      return Promise.resolve();

    default:
      return Promise.resolve();
  }
};

module.exports = {
  async findOne(params, populate, { transacting } = {}) {
    const data = await fetchRecord(this, params, populate, transacting);

    if (_.isEmpty(populate)) {
      const arrayOfPromises = this.associations
        .filter(a => ['manyMorphToOne', 'manyMorphToMany'].includes(a.nature))
        .map(() =>
          this.morph
            .forge()
            .where({
              [`${this.collectionName}_id`]: getValuePrimaryKey(params, this.primaryKey),
            })
            .fetchAll({ transacting })
        );

      const related = await Promise.all(arrayOfPromises);

      related.forEach((value, index) => {
        data[this.associations[index].alias] = value ? value.toJSON() : value;
      });
    }

    return data;
  },

  async update(params, { transacting } = {}) {
    const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
    const response = await this.findOne.call(this, params, null, { transacting });

    const values = Object.keys(removeUndefinedKeys(params.values)).reduce(
      (acc, current) => {
        const property = params.values[current];
        const association = this.associations.find(a => a.alias === current);
        const details = this._attributes[current];

        if (!association && _.get(details, 'isVirtual') !== true) {
          return _.set(acc, current, property);
        }

        const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
        const storedValue = transformToArrayID(response[current]);
        const currentValue = transformToArrayID(property);

        const updatePromise = updateAssociation(
          association,
          property,
          response,
          primaryKeyValue,
          transacting,
          this,
          details,
          assocModel,
          currentValue,
          storedValue
        );

        if (updatePromise) {
          if (!Array.isArray(updatePromise)) {
            this.relationUpdates = this.relationUpdates || [];
            this.relationUpdates.push(updatePromise);
          }
        }

        return acc;
      },
      {}
    );

    await Promise.all(this.relationUpdates || []);

    delete values[this.primaryKey];
    if (!_.isEmpty(values)) {
      await this.forge({
        [this.primaryKey]: getValuePrimaryKey(params, this.primaryKey),
      }).save(values, { patch: true, transacting });
    }

    const result = await this.forge({
      [this.primaryKey]: getValuePrimaryKey(params, this.primaryKey),
    }).fetch({ transacting });

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