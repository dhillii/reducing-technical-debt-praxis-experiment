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

const handleOneWayRelation = (assocModel, property, primaryKeyValue, transacting) => {
  return _.set({}, 'current', _.get(property, assocModel.primaryKey, property));
};

const handleOneToOneRelation = (response, property, assocModel, details, primaryKeyValue, transacting) => {
  if (response.current === property) return {};

  if (_.isNull(property)) {
    const updatePromise = assocModel
      .where({
        [assocModel.primaryKey]: getValuePrimaryKey(response.current, assocModel.primaryKey),
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

    return {
      relationUpdates: [updatePromise],
      newValue: null,
    };
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

  return {
    relationUpdates: [updateLink],
    newValue: property,
  };
};

const handleOneToManyRelation = (assocModel, response, property, transacting) => {
  const currentIds = response.current;
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

  return {
    relationUpdates: [updatePromise],
    newValue: {},
  };
};

const handleManyToManyRelation = (collection, storedValue, currentValue, transacting) => {
  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const updatePromise = collection
    .detach(toRemove, { transacting })
    .then(() => collection.attach(toAdd, { transacting }));

  return {
    relationUpdates: [updatePromise],
    newValue: {},
  };
};

const handleManyMorphRelation = (
  association,
  response,
  params,
  targetModel,
  reverseAssoc,
  thisObj,
  transacting
) => {
  const refs = params.values[current];

  if (Array.isArray(refs) && refs.length === 0) {
    return {
      relationUpdates: [
        removeRelationMorph(thisObj, { params: { id: primaryKeyValue }, transacting }),
      ],
      newValue: {},
    };
  }

  const addRelation = async () => {
    const maxOrder = await thisObj.morph
      .query(qb => {
        qb.max('order as order').where({
          [`${association.alias}_id`]: obj.refId,
          [`${association.alias}_type`]: targetModel.collectionName,
          field: obj.field,
        });
      })
      .fetch({ transacting });

    const { order = 0 } = maxOrder.toJSON();

    await addRelationMorph(thisObj, {
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

  return {
    relationUpdates: [addRelation()],
    newValue: {},
  };
};

const handleOneToManyMorphRelation = (
  model,
  association,
  response,
  params,
  transacting
) => {
  const currentValue = transformToArrayID(params.values[current]);

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

  return {
    relationUpdates: [promise],
    newValue: {},
  };
};

const getRelationHandler = (association) => {
  const handlers = {
    oneWay: handleOneWayRelation,
    oneToOne: handleOneToOneRelation,
    oneToMany: handleOneToManyRelation,
    manyToMany: handleManyToManyRelation,
    manyMorphToMany: handleManyMorphRelation,
    manyMorphToOne: handleManyMorphRelation,
    oneToManyMorph: handleOneToManyMorphRelation,
    manyToManyMorph: handleManyToManyRelation,
    oneMorphToOne: () => ({ relationUpdates: [], newValue: {} }),
    oneMorphToMany: () => ({ relationUpdates: [], newValue: {} }),
  };

  return handlers[association.nature] || (() => ({ relationUpdates: [], newValue: {} }));
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
    const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, current) => {
      const property = params.values[current];
      const association = this.associations.filter(x => x.alias === current)[0];
      const details = this._attributes[current];

      if (!association && _.get(details, 'isVirtual') !== true) {
        return _.set(acc, current, property);
      }

      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

      const handler = getRelationHandler(association);
      const result = handler(association, response, params, assocModel, details, primaryKeyValue, transacting);

      if (result.relationUpdates) {
        relationUpdates.push(...result.relationUpdates);
      }

      if (result.newValue !== undefined) {
        acc[current] = result.newValue;
      }

      return acc;
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
      const handler = getRelationHandler(association);
      const result = handler(association, {}, {}, {}, {}, {}, transacting);
      if (result.newValue !== undefined) {
        values[association.alias] = result.newValue;
      }
    });

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};