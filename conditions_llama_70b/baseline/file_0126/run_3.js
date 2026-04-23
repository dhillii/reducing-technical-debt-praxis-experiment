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

const updateOneWayRelation = (acc, current, property, association, details) => {
  return _.set(acc, current, _.get(property, details.model.primaryKey, property));
};

const updateOneToOneRelation = async (acc, current, property, association, details, transacting, primaryKeyValue, response) => {
  if (response[current] === property) return acc;

  if (_.isNull(property)) {
    const updatePromise = details.model
      .where({
        [details.model.primaryKey]: getValuePrimaryKey(
          response[current],
          details.model.primaryKey
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

    return _.set(acc, current, null);
  }

  const updateLink = details.model.where({ [details.via]: property }).save(
    { [details.via]: primaryKeyValue },
    {
      method: 'update',
      patch: true,
      require: false,
      transacting,
    }
  );

  return _.set(acc, current, property);
};

const updateOneToManyRelation = async (acc, current, property, association, details, transacting, primaryKeyValue, response) => {
  const currentIds = response[current];
  const toRemove = _.differenceWith(currentIds, property, (a, b) => {
    return `${a[details.model.primaryKey] || a}` === `${b[details.model.primaryKey] || b}`;
  });

  const updatePromise = details.model
    .where(
      details.model.primaryKey,
      'in',
      toRemove.map(val => val[details.model.primaryKey] || val)
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
      return details.model
        .where(
          details.model.primaryKey,
          'in',
          property.map(val => val[details.model.primaryKey] || val)
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

  return acc;
};

const updateManyToManyRelation = async (acc, current, property, association, details, transacting, primaryKeyValue, response) => {
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

  return acc;
};

const updateManyMorphToManyRelation = async (acc, current, property, association, details, transacting, primaryKeyValue, response) => {
  const refs = property;

  if (Array.isArray(refs) && refs.length === 0) {
    await removeRelationMorph(this, { params: { id: primaryKeyValue }, transacting });
    return acc;
  }

  const promises = refs.map(obj => {
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

    return addRelationMorph(this, {
      params: {
        id: response[this.primaryKey],
        alias: association.alias,
        ref: targetModel.collectionName,
        refId: obj.refId,
        field: obj.field,
        order: 1,
      },
      transacting,
    });
  });

  await Promise.all(promises);

  return acc;
};

const updateManyMorphToOneRelation = async (acc, current, property, association, details, transacting, primaryKeyValue, response) => {
  const refs = property;

  if (Array.isArray(refs) && refs.length === 0) {
    await removeRelationMorph(this, { params: { id: primaryKeyValue }, transacting });
    return acc;
  }

  const promises = refs.map(obj => {
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

    return addRelationMorph(this, {
      params: {
        id: response[this.primaryKey],
        alias: association.alias,
        ref: targetModel.collectionName,
        refId: obj.refId,
        field: obj.field,
        order: 1,
      },
      transacting,
    });
  });

  await Promise.all(promises);

  return acc;
};

const updateOneMorphToOneRelation = async (acc, current, property, association, details, transacting, primaryKeyValue, response) => {
  return acc;
};

const updateOneMorphToManyRelation = async (acc, current, property, association, details, transacting, primaryKeyValue, response) => {
  return acc;
};

const updateManyToOneRelation = (acc, current, property, association, details) => {
  return _.set(acc, current, _.get(property, details.model.primaryKey, property));
};

const updateManyToManyMorphRelation = async (acc, current, property, association, details, transacting, primaryKeyValue, response) => {
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

  await promise;

  return acc;
};

const updateOneToManyMorphRelation = async (acc, current, property, association, details, transacting, primaryKeyValue, response) => {
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

  await promise;

  return acc;
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

    const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, current) => {
      const property = params.values[current];
      const association = this.associations.filter(x => x.alias === current)[0];
      const details = this._attributes[current];

      if (!association && _.get(details, 'isVirtual') !== true) {
        return _.set(acc, current, property);
      }

      switch (association.nature) {
        case 'oneWay':
          return updateOneWayRelation(acc, current, property, association, details);
        case 'oneToOne':
          return updateOneToOneRelation(acc, current, property, association, details, transacting, primaryKeyValue, response);
        case 'oneToMany':
          return updateOneToManyRelation(acc, current, property, association, details, transacting, primaryKeyValue, response);
        case 'manyToOne':
          return updateManyToOneRelation(acc, current, property, association, details);
        case 'manyWay':
        case 'manyToMany':
          return updateManyToManyRelation(acc, current, property, association, details, transacting, primaryKeyValue, response);
        case 'manyMorphToMany':
          return updateManyMorphToManyRelation(acc, current, property, association, details, transacting, primaryKeyValue, response);
        case 'manyMorphToOne':
          return updateManyMorphToOneRelation(acc, current, property, association, details, transacting, primaryKeyValue, response);
        case 'oneMorphToOne':
          return updateOneMorphToOneRelation(acc, current, property, association, details, transacting, primaryKeyValue, response);
        case 'oneMorphToMany':
          return updateOneMorphToManyRelation(acc, current, property, association, details, transacting, primaryKeyValue, response);
        case 'manyToManyMorph':
          return updateManyToManyMorphRelation(acc, current, property, association, details, transacting, primaryKeyValue, response);
        case 'oneToManyMorph':
          return updateOneToManyMorphRelation(acc, current, property, association, details, transacting, primaryKeyValue, response);
        default:
          return acc;
      }
    }, {});

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