const getPrimaryKey = (obj, model) => _.get(obj, model.primaryKey, obj);

const buildUpdateLinkPromise = ({ assocModel, assocDetails, response, property, primaryKeyValue, transacting }) => {
  return assocModel
    .where({ [assocModel.primaryKey]: getPrimaryKey(response[assocDetails.via], assocModel) })
    .save({ [assocDetails.via]: null }, { method: 'update', patch: true, require: false, transacting })
    .then(() => {
      return assocModel.where({ [assocModel.primaryKey]: getPrimaryKey(property, assocModel) }).save(
        { [assocDetails.via]: primaryKeyValue },
        { method: 'update', patch: true, require: false, transacting }
      );
    });
};

const buildOneToManyUpdatePromise = ({ assocModel, assocDetails, currentIds, property, primaryKeyValue, transacting }) => {
  const toRemove = _.differenceWith(currentIds, property, (a, b) =>
    `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`
  );

  return assocModel
    .where(
      assocModel.primaryKey,
      'in',
      toRemove.map(val => val[assocModel.primaryKey] || val)
    )
    .save({ [assocDetails.via]: null }, { method: 'update', patch: true, require: false, transacting })
    .then(() =>
      assocModel
        .where(
          assocModel.primaryKey,
          'in',
          property.map(val => val[assocModel.primaryKey] || val)
        )
        .save({ [assocDetails.via]: primaryKeyValue }, { method: 'update', patch: true, require: false, transacting })
    );
};

const buildManyWayManyToManyUpdatePromise = ({ association, currentIds, property, primaryKeyValue, transacting }) => {
  const collection = this.forge({ [this.primaryKey]: primaryKeyValue })[association.alias]();

  return collection
    .detach(property.toRemove, { transacting })
    .then(() => collection.attach(property.toAdd, { transacting }));
};

const buildManyMorphUpdatePromise = async ({ obj, association, response, targetModel, transacting }) => {
  const reverseAssoc = targetModel.associations.find(assoc => assoc.alias === obj.field);

  if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
    const removePromise = removeRelationMorph(this, {
      params: {
        alias: association.alias,
        ref: targetModel.collectionName,
        refId: obj.refId,
        field: obj.field,
      },
      transacting,
    });

    const addPromise = removePromise.then(() =>
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

    return addPromise;
  }

  const maxOrderResult = await this.morph
    .query(qb => {
      qb.max('order as order').where({
        [`${association.alias}_id`]: obj.refId,
        [`${association.alias}_type`]: targetModel.collectionName,
        field: obj.field,
      });
    })
    .fetch({ transacting });

  const { order = 0 } = maxOrderResult.toJSON();

  return addRelationMorph(this, {
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

const buildOneMorphToManyUpdatePromise = ({ currentValue, association, response, details, transacting }) => {
  const model = strapi.db.getModel(details.collection || details.model, details.plugin);

  const removePromise = removeRelationMorph(model, {
    params: {
      alias: association.via,
      ref: this.collectionName,
      refId: response.id,
      field: association.alias,
    },
    transacting,
  });

  return removePromise.then(() =>
    Promise.all(
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
    )
  );
};

/**
 * Update relations based on associations in the model.
 * @param {Object} params - Update parameters
 * @param {Object} options - Transaction options
 */
const updateRelations = async function (params, { transacting } = {}) {
  const relationUpdates = [];
  const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);
  const response = await module.exports.findOne.call(this, params, null, { transacting });

  const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, current) => {
    const property = params.values[current];
    const association = this.associations.find(x => x.alias === current);
    const details = this._attributes[current];
    const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

    if (!association && _.get(details, 'isVirtual') !== true) {
      return _.set(acc, current, property);
    }

    switch (association.nature) {
      case 'oneWay': {
        return _.set(acc, current, getPrimaryKey(property, assocModel));
      }
      case 'oneToOne': {
        if (response[current] === property) return acc;

        if (_.isNull(property)) {
          const updatePromise = assocModel
            .where({
              [assocModel.primaryKey]: getValuePrimaryKey(response[current], assocModel.primaryKey),
            })
            .save({ [details.via]: null }, { method: 'update', patch: true, require: false, transacting });

          relationUpdates.push(updatePromise);
          return _.set(acc, current, null);
        }

        const updateLink = buildUpdateLinkPromise({
          assocModel,
          assocDetails: details,
          response,
          property,
          primaryKeyValue,
          transacting,
        });

        relationUpdates.push(updateLink);
        return _.set(acc, current, property);
      }
      case 'oneToMany': {
        const currentIds = response[current];
        const updatePromise = buildOneToManyUpdatePromise({
          assocModel,
          assocDetails: details,
          currentIds,
          property,
          primaryKeyValue,
          transacting,
        });

        relationUpdates.push(updatePromise);
        return acc;
      }
      case 'manyToOne': {
        return _.set(acc, current, getPrimaryKey(property, assocModel));
      }
      case 'manyWay':
      case 'manyToMany': {
        const storedValue = transformToArrayID(response[current]);
        const currentValue = transformToArrayID(params.values[current]);
        const toAdd = _.difference(currentValue, storedValue);
        const toRemove = _.difference(storedValue, currentValue);

        const updatePromise = buildManyWayManyToManyUpdatePromise.call(this, {
          association,
          currentIds: storedValue,
          property: { toAdd, toRemove },
          primaryKeyValue,
          transacting,
        });

        relationUpdates.push(updatePromise);
        return acc;
      }
      case 'manyMorphToMany':
      case 'manyMorphToOne': {
        const refs = params.values[current];

        if (Array.isArray(refs) && refs.length === 0) {
          relationUpdates.push(
            removeRelationMorph(this, { params: { id: primaryKeyValue }, transacting })
          );
          break;
        }

        refs.forEach(obj => {
          const targetModel = strapi.db.getModel(
            obj.ref,
            obj.source !== 'content-manager' ? obj.source : null
          );

          const updatePromise = buildManyMorphUpdatePromise({
            obj,
            association,
            response,
            targetModel,
            transacting,
          });

          relationUpdates.push(updatePromise);
        });
        break;
      }
      case 'oneToManyMorph':
      case 'manyToManyMorph': {
        const currentValue = transformToArrayID(params.values[current]);
        const updatePromise = buildOneMorphToManyUpdatePromise.call(this, {
          currentValue,
          association,
          response,
          details,
          transacting,
        });

        relationUpdates.push(updatePromise);
        break;
      }
      case 'oneMorphToOne':
      case 'oneMorphToMany':
      default:
        break;
    }

    return acc;
  }, {});

  await Promise.all(relationUpdates);

  delete values[this.primaryKey];
  if (!_.isEmpty(values)) {
    await this.forge({ [this.primaryKey]: primaryKeyValue }).save(values, {
      patch: true,
      transacting,
    });
  }

  const result = await this.forge({ [this.primaryKey]: primaryKeyValue }).fetch({ transacting });
  return result && result.toJSON ? result.toJSON() : result;
};