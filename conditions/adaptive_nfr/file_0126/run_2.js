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
 * Determines if an association is a simple reference type
 */
const isSimpleReference = nature => ['oneWay', 'manyToOne'].includes(nature);

/**
 * Determines if an association is a many-to-many type
 */
const isManyToMany = nature => ['manyWay', 'manyToMany'].includes(nature);

/**
 * Determines if an association is a morph type
 */
const isMorphType = nature => 
  ['manyMorphToMany', 'manyMorphToOne', 'oneToManyMorph', 'manyToManyMorph', 'oneMorphToOne', 'oneMorphToMany'].includes(nature);

/**
 * Handles simple reference association updates (oneWay, manyToOne)
 */
const handleSimpleReference = (acc, current, property, assocModel) => {
  return _.set(acc, current, _.get(property, assocModel.primaryKey, property));
};

/**
 * Handles oneToOne association updates
 */
const handleOneToOne = async (acc, current, property, response, details, assocModel, primaryKeyValue, relationUpdates, transacting) => {
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

    relationUpdates.push(updatePromise);
    return _.set(acc, current, null);
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
  return _.set(acc, current, property);
};

/**
 * Handles oneToMany association updates
 */
const handleOneToMany = (acc, current, property, response, details, assocModel, primaryKeyValue, relationUpdates, transacting) => {
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
  return acc;
};

/**
 * Handles manyToMany association updates
 */
const handleManyToMany = (acc, current, property, response, association, primaryKeyValue, relationUpdates, transacting) => {
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
  return acc;
};

/**
 * Handles manyMorphToMany and manyMorphToOne association updates
 */
const handleManyMorph = async (acc, current, property, response, association, details, primaryKeyValue, relationUpdates, transacting) => {
  const refs = property;

  if (Array.isArray(refs) && refs.length === 0) {
    relationUpdates.push(
      removeRelationMorph(this, { params: { id: primaryKeyValue }, transacting })
    );
    return acc;
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

  return acc;
};

/**
 * Handles oneToManyMorph and manyToManyMorph association updates
 */
const handleOneToManyMorph = (acc, current, property, response, association, details, relationUpdates, transacting) => {
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
  return acc;
};

/**
 * Strategy map for handling different association natures
 */
const associationHandlers = {
  oneWay: (acc, current, property, response, association, details, assocModel, primaryKeyValue, relationUpdates, transacting) => {
    return handleSimpleReference(acc, current, property, assocModel);
  },
  manyToOne: (acc, current, property, response, association, details, assocModel, primaryKeyValue, relationUpdates, transacting) => {
    return handleSimpleReference(acc, current, property, assocModel);
  },
  oneToOne: handleOneToOne,
  oneToMany: handleOneToMany,
  manyWay: handleManyToMany,
  manyToMany: handleManyToMany,
  manyMorphToMany: handleManyMorph,
  manyMorphToOne: handleManyMorph,
  oneToManyMorph: handleOneToManyMorph,
  manyToManyMorph: handleOneToManyMorph,
  oneMorphToOne: (acc) => acc,
  oneMorphToMany: (acc) => acc,
};

/**
 * Processes a single attribute for update
 */
const processAttributeForUpdate = function(acc, current, params, response, relationUpdates, transacting) {
  const property = params.values[current];
  const association = this.associations.filter(x => x.alias === current)[0];
  const details = this._attributes[current];

  if (!association && _.get(details, 'isVirtual') !== true) {
    return _.set(acc, current, property);
  }

  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
  const handler = associationHandlers[association.nature];

  if (handler) {
    return handler.call(this, acc, current, property, response, association, details, assocModel, params.id || response[this.primaryKey], relationUpdates, transacting);
  }

  return acc;
};

/**
 * Determines which associations should be cleared on delete
 */
const getClearableAssociations = () => {
  const clearToNull = ['oneWay', 'oneToOne', 'manyToOne', 'oneToManyMorph'];
  const clearToEmpty = ['manyWay', 'oneToMany', 'manyToMany', 'manyToManyMorph', 'manyMorphToMany', 'manyMorphToOne'];

  return { clearToNull, clearToEmpty };
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
      return processAttributeForUpdate.call(this, acc, current, params, response, relationUpdates, transacting);
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
    const { clearToNull, clearToEmpty } = getClearableAssociations();

    this.associations.map(association => {
      if (clearToNull.includes(association.nature)) {
        values[association.alias] = null;
      } else if (clearToEmpty.includes(association.nature)) {
        values[association.alias] = [];
      }
    });

    return this.updateRelations({ [this.primaryKey]: id, values }, { transacting });
  },
};
```