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

const getAssociationUpdateStrategy = (association, params, transacting) => {
  const strategies = {
    oneWay: updateOneWayAssociation,
    oneToOne: updateOneToOneAssociation,
    oneToMany: updateOneToManyAssociation,
    manyToOne: updateManyToOneAssociation,
    manyWay: updateManyWayAssociation,
    manyToMany: updateManyToManyAssociation,
    manyMorphToMany: updateManyMorphToManyAssociation,
    manyMorphToOne: updateManyMorphToOneAssociation,
    oneToManyMorph: updateOneToManyMorphAssociation,
    manyToManyMorph: updateManyToManyMorphAssociation,
    oneMorphToOne: updateOneMorphToOneAssociation,
    oneMorphToMany: updateOneMorphToManyAssociation,
  };

  return strategies[association.nature];
};

const updateOneWayAssociation = (association, params, transacting) => {
  return Promise.resolve();
};

const updateOneToOneAssociation = (association, params, transacting) => {
  const assocModel = strapi.db.getModel(association.model || association.collection, association.plugin);
  const details = this._attributes[association.alias];

  if (params.values[association.alias] === null) {
    return assocModel
      .where({
        [assocModel.primaryKey]: getValuePrimaryKey(params, assocModel.primaryKey),
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
  }

  return this.where({ [association.alias]: params.values[association.alias] })
    .save(
      { [association.alias]: null },
      {
        method: 'update',
        patch: true,
        require: false,
        transacting,
      }
    )
    .then(() => {
      return assocModel.where({ [this.primaryKey]: params.values[association.alias] }).save(
        { [details.via]: getValuePrimaryKey(params, this.primaryKey) },
        {
          method: 'update',
          patch: true,
          require: false,
          transacting,
        }
      );
    });
};

const updateOneToManyAssociation = (association, params, transacting) => {
  const assocModel = strapi.db.getModel(association.model || association.collection, association.plugin);
  const details = this._attributes[association.alias];

  const currentIds = params.values[association.alias];
  const toRemove = _.differenceWith(currentIds, params.values[association.alias], (a, b) => {
    return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
  });

  return assocModel
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
          params.values[association.alias].map(val => val[assocModel.primaryKey] || val)
        )
        .save(
          { [details.via]: getValuePrimaryKey(params, this.primaryKey) },
          {
            method: 'update',
            patch: true,
            require: false,
            transacting,
          }
        );
    });
};

const updateManyToOneAssociation = (association, params, transacting) => {
  return Promise.resolve();
};

const updateManyWayAssociation = (association, params, transacting) => {
  const storedValue = transformToArrayID(params.values[association.alias]);
  const currentValue = transformToArrayID(params.values[association.alias]);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = this.forge({
    [this.primaryKey]: getValuePrimaryKey(params, this.primaryKey),
  })[association.alias]();

  return collection
    .detach(toRemove, { transacting })
    .then(() => collection.attach(toAdd, { transacting }));
};

const updateManyToManyAssociation = (association, params, transacting) => {
  const storedValue = transformToArrayID(params.values[association.alias]);
  const currentValue = transformToArrayID(params.values[association.alias]);

  const toAdd = _.difference(currentValue, storedValue);
  const toRemove = _.difference(storedValue, currentValue);

  const collection = this.forge({
    [this.primaryKey]: getValuePrimaryKey(params, this.primaryKey),
  })[association.alias]();

  return collection
    .detach(toRemove, { transacting })
    .then(() => collection.attach(toAdd, { transacting }));
};

const updateManyMorphToManyAssociation = (association, params, transacting) => {
  const refs = params.values[association.alias];

  if (Array.isArray(refs) && refs.length === 0) {
    return removeRelationMorph(this, { params: { id: getValuePrimaryKey(params, this.primaryKey) }, transacting });
  }

  return Promise.all(
    refs.map(obj => {
      const targetModel = strapi.db.getModel(obj.ref, obj.source !== 'content-manager' ? obj.source : null);

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
              id: getValuePrimaryKey(params, this.primaryKey),
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
          id: getValuePrimaryKey(params, this.primaryKey),
          alias: association.alias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
          order: 1,
        },
        transacting,
      });
    })
  );
};

const updateManyMorphToOneAssociation = (association, params, transacting) => {
  const refs = params.values[association.alias];

  if (Array.isArray(refs) && refs.length === 0) {
    return removeRelationMorph(this, { params: { id: getValuePrimaryKey(params, this.primaryKey) }, transacting });
  }

  return Promise.all(
    refs.map(obj => {
      const targetModel = strapi.db.getModel(obj.ref, obj.source !== 'content-manager' ? obj.source : null);

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
              id: getValuePrimaryKey(params, this.primaryKey),
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
          id: getValuePrimaryKey(params, this.primaryKey),
          alias: association.alias,
          ref: targetModel.collectionName,
          refId: obj.refId,
          field: obj.field,
          order: 1,
        },
        transacting,
      });
    })
  );
};

const updateOneToManyMorphAssociation = (association, params, transacting) => {
  const currentValue = transformToArrayID(params.values[association.alias]);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return removeRelationMorph(model, {
    params: {
      alias: association.via,
      ref: this.collectionName,
      refId: getValuePrimaryKey(params, this.primaryKey),
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
            refId: getValuePrimaryKey(params, this.primaryKey),
            field: association.alias,
            order: idx + 1,
          },
          transacting,
        });
      })
    );
  });
};

const updateManyToManyMorphAssociation = (association, params, transacting) => {
  const currentValue = transformToArrayID(params.values[association.alias]);

  const model = strapi.db.getModel(association.model || association.collection, association.plugin);

  return removeRelationMorph(model, {
    params: {
      alias: association.via,
      ref: this.collectionName,
      refId: getValuePrimaryKey(params, this.primaryKey),
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
            refId: getValuePrimaryKey(params, this.primaryKey),
            field: association.alias,
            order: idx + 1,
          },
          transacting,
        });
      })
    );
  });
};

const updateOneMorphToOneAssociation = (association, params, transacting) => {
  return Promise.resolve();
};

const updateOneMorphToManyAssociation = (association, params, transacting) => {
  return Promise.resolve();
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

      const updateStrategy = getAssociationUpdateStrategy.call(this, association, params, transacting);

      if (updateStrategy) {
        relationUpdates.push(updateStrategy);
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