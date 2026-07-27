'use strict';

const _ = require('lodash');
const mongoose = require('mongoose');

const { models: utilsModels, contentTypes: contentTypesUtils } = require('strapi-utils');
const utils = require('./utils');
const populateQueries = require('./utils/populate-queries');
const relations = require('./relations');
const { findComponentByGlobalId } = require('./utils/helpers');
const {
  didDefinitionChange,
  storeDefinition,
  getDefinitionFromStore,
} = require('./utils/store-definition');

const {
  PUBLISHED_AT_ATTRIBUTE,
  CREATED_BY_ATTRIBUTE,
  UPDATED_BY_ATTRIBUTE,
  DP_PUB_STATES,
} = contentTypesUtils.constants;

const isPolymorphicAssoc = assoc => assoc.nature.toLowerCase().indexOf('morph') !== -1;

/**
 * Checks if a value is a Decimal128 instance.
 * @param {*} value
 * @returns {boolean}
 */
function isDecimal128(value) {
  return value instanceof mongoose.Types.Decimal128;
}

/**
 * Checks if the provided value is a non‑empty array.
 * @param {*} arr
 * @returns {boolean}
 */
function isNonEmptyArray(arr) {
  return Array.isArray(arr) && arr.length > 0;
}

/**
 * Guard for morph association processing.
 * @param {Object} association
 * @param {Object} returned
 * @returns {boolean}
 */
function shouldProcessMorph(association, returned) {
  return isNonEmptyArray(returned[association.alias]);
}

/**
 * Guard for component attribute processing.
 * @param {Object} attribute
 * @param {*} value
 * @returns {boolean}
 */
function shouldProcessComponent(attribute, value) {
  return attribute.type === 'component' && Array.isArray(value);
}

/**
 * Guard for dynamic zone attribute processing.
 * @param {Object} attribute
 * @param {*} value
 * @returns {boolean}
 */
function shouldProcessDynamicZone(attribute, value) {
  return attribute.type === 'dynamiczone' && !!value;
}

/**
 * Guard for association processing.
 * @param {*} relation
 * @returns {boolean}
 */
function hasRelation(relation) {
  return !!relation;
}

/**
 * Guard for populate query existence.
 * @param {*} matchQuery
 * @returns {boolean}
 */
function hasMatchQuery(matchQuery) {
  return matchQuery !== undefined;
}

/**
 * Guard for morph nature that requires simple populate.
 * @param {string} nature
 * @returns {boolean}
 */
function isSimpleMorphNature(nature) {
  return ['oneToManyMorph', 'manyToManyMorph'].includes(nature);
}

/**
 * Guard for morph nature that requires custom path handling.
 * @param {string} nature
 * @returns {boolean}
 */
function isCustomMorphNature(nature) {
  return !isSimpleMorphNature(nature);
}

/**
 * Convert a reference object to Strapi reference format.
 * @param {Object} obj
 * @returns {Object}
 */
function refToStrapiRef(obj) {
  const ref = obj.ref;
  const plainData = ref && typeof ref.toJSON === 'function' ? ref.toJSON() : ref;
  if (typeof plainData !== 'object') return ref;
  return {
    __contentType: obj.kind,
    ...ref,
  };
}

/**
 * Parse component reference value.
 * @param {Object} el
 * @returns {string|Object}
 */
function parseComponentRef(el) {
  return el.ref instanceof mongoose.Types.ObjectId ? el.ref.toString() : el.ref;
}

/**
 * Parse dynamic zone reference value.
 * @param {Object} el
 * @returns {Object}
 */
function parseDynamicZoneRef(el) {
  return el.ref instanceof mongoose.Types.ObjectId ? { id: el.ref.toString() } : el.ref;
}

/**
 * Transform returned document according to Strapi conventions.
 * @param {Object} returned
 * @param {Object} context
 */
function transformReturned(returned, context) {
  const {
    definition,
    morphAssociations,
    componentAttributes,
    associations,
    refToStrapiRef,
    parseComponentRef,
    parseDynamicZoneRef,
    findComponentByGlobalId,
  } = context;

  // Convert Decimal128 fields to numbers.
  Object.keys(returned).forEach(key => {
    if (isDecimal128(returned[key])) {
      returned[key] = parseFloat(returned[key].toString());
    }
  });

  // Process polymorphic morph associations.
  for (const association of morphAssociations) {
    if (!shouldProcessMorph(association, returned)) continue;
    const aliasData = returned[association.alias];
    switch (association.nature) {
      case 'oneMorphToOne':
        returned[association.alias] = refToStrapiRef(aliasData[0]);
        break;
      case 'manyMorphToMany':
      case 'manyMorphToOne':
        returned[association.alias] = aliasData.map(refToStrapiRef);
        break;
      default:
    }
  }

  // Process component and dynamic zone attributes.
  for (const name of componentAttributes) {
    const attribute = definition.attributes[name];
    const value = returned[name];
    if (shouldProcessComponent(attribute, value)) {
      const components = value.map(parseComponentRef);
      returned[name] = attribute.repeatable === true ? components : _.first(components) || null;
      continue;
    }
    if (shouldProcessDynamicZone(attribute, value)) {
      returned[name] = value
        .filter(el => el && el.kind)
        .map(el => ({
          __component: findComponentByGlobalId(el.kind).uid,
          ...parseDynamicZoneRef(el),
        }));
    }
  }

  // Process non‑polymorphic associations.
  for (const association of associations) {
    const relation = returned[association.alias];
    if (!hasRelation(relation)) continue;
    returned[association.alias] = relation.toJSON ? relation.toJSON() : relation;
    if (_.isArray(association.populate)) {
      const { alias, populate } = association;
      const pickPopulate = entry => _.pick(entry, populate);
      returned[alias] = _.isArray(returned[alias])
        ? _.map(returned[alias], pickPopulate)
        : pickPopulate(returned[alias]);
    }
  }
}

/**
 * Create a populate function executed on fetch.
 * @param {Object} params
 * @returns {Function}
 */
function createOnFetchPopulateFn({ morphAssociations, componentAttributes, definition }) {
  return function () {
    const populatedPaths = this.getPopulatedPaths();
    const {
      publicationState,
      _populateComponents = true,
      _populateMorphRelations = true,
    } = this.getOptions();

    const getMatchQuery = assoc => {
      const assocModel = strapi.db.getModelByAssoc(assoc);
      const hasDP = contentTypesUtils.hasDraftAndPublish(assocModel);
      if (hasDP && DP_PUB_STATES.includes(publicationState)) {
        return populateQueries.publicationState[publicationState];
      }
      return undefined;
    };

    if (_populateMorphRelations) {
      for (const association of morphAssociations) {
        const matchQuery = getMatchQuery(association);
        const { alias, nature } = association;
        if (isSimpleMorphNature(nature)) {
          this.populate({ path: alias, match: matchQuery, options: { publicationState } });
          continue;
        }
        if (!populatedPaths.includes(alias)) continue;
        _.set(this._mongooseOptions.populate, [alias, 'path'], `${alias}.ref`);
        _.set(this._mongooseOptions.populate, [alias, 'options'], { publicationState });
        if (hasMatchQuery(matchQuery)) {
          _.set(this._mongooseOptions.populate, [alias, 'match'], matchQuery);
        }
      }
    }

    if (_populateComponents) {
      for (const key of componentAttributes) {
        this.populate({ path: `${key}.ref`, options: { publicationState } });
      }
    }

    if (definition.modelType === 'component') {
      const nonPolyAssocs = definition.associations
        .filter(assoc => !isPolymorphicAssoc(assoc))
        .filter(ast => ast.autoPopulate !== false);
      for (const ast of nonPolyAssocs) {
        this.populate({
          path: ast.alias,
          match: getMatchQuery(ast),
          options: { publicationState, _populateComponents: false },
        });
      }
    }
  };
}

/**
 * Build relation fields for a model definition.
 * @param {Object} params
 */
function buildRelation({ definition, model, instance, attribute, name }) {
  const { nature, verbose } =
    utilsModels.getNature({
      attribute,
      attributeName: name,
      modelName: model.toLowerCase(),
    }) || {};

  utilsModels.defineAssociations(model.toLowerCase(), definition, attribute, name);

  const getRef = (name, plugin) => strapi.db.getModel(name, plugin).globalId;
  const setField = (fieldName, val) => {
    definition.loadedModel[fieldName] = val;
  };
  const { ObjectId } = instance.Schema.Types;

  switch (verbose) {
    case 'hasOne': {
      const ref = getRef(attribute.model, attribute.plugin);
      setField(name, { type: ObjectId, ref });
      break;
    }
    case 'hasMany': {
      const FK = _.find(definition.associations, { alias: name });
      const ref = getRef(attribute.collection, attribute.plugin);
      if (FK) {
        setField(name, { type: 'virtual', ref, via: FK.via, justOne: false });
        attribute.isVirtual = true;
      } else {
        setField(name, [{ type: ObjectId, ref }]);
      }
      break;
    }
    case 'belongsTo': {
      const FK = _.find(definition.associations, { alias: name });
      const ref = getRef(attribute.model, attribute.plugin);
      if (
        FK &&
        FK.nature !== 'oneToOne' &&
        FK.nature !== 'manyToOne' &&
        FK.nature !== 'oneWay' &&
        FK.nature !== 'oneToMorph'
      ) {
        setField(name, { type: 'virtual', ref, via: FK.via, justOne: true });
        attribute.isVirtual = true;
      } else {
        setField(name, { type: ObjectId, ref });
      }
      break;
    }
    case 'belongsToMany': {
      const ref = getRef(attribute.collection, attribute.plugin);
      if (nature === 'manyWay') {
        setField(name, [{ type: ObjectId, ref }]);
      } else {
        const FK = _.find(definition.associations, { alias: name });
        if ((FK && _.isUndefined(FK.via)) || attribute.dominant !== true) {
          setField(name, { type: 'virtual', ref, via: FK.via });
          attribute.isVirtual = true;
        } else {
          setField(name, [{ type: ObjectId, ref }]);
        }
      }
      break;
    }
    case 'morphOne': {
      const ref = getRef(attribute.model, attribute.plugin);
      setField(name, { type: ObjectId, ref });
      break;
    }
    case 'morphMany': {
      const ref = getRef(attribute.collection, attribute.plugin);
      setField(name, [{ type: ObjectId, ref }]);
      break;
    }
    case 'belongsToMorph': {
      setField(name, {
        kind: String,
        [attribute.filter]: String,
        ref: { type: ObjectId, refPath: `${name}.kind` },
      });
      break;
    }
    case 'belongsToManyMorph': {
      setField(name, [
        {
          kind: String,
          [attribute.filter]: String,
          ref: { type: ObjectId, refPath: `${name}.kind` },
        },
      ]);
      break;
    }
    default:
  }
}

/**
 * Main module export.
 */
module.exports = async ({ models, target }, ctx) => {
  const { instance } = ctx;

  function mountModel(model) {
    const definition = models[model];
    definition.orm = 'mongoose';
    definition.associations = [];
    definition.globalName = _.upperFirst(_.camelCase(definition.globalId));
    definition.loadedModel = {};

    const hasDraftAndPublish = contentTypesUtils.hasDraftAndPublish(definition);

    _.defaults(definition, {
      primaryKey: '_id',
      primaryKeyType: 'string',
    });

    if (!definition.uid.startsWith('strapi::') && definition.modelType !== 'component') {
      if (hasDraftAndPublish) {
        definition.attributes[PUBLISHED_AT_ATTRIBUTE] = {
          type: 'datetime',
          configurable: false,
          writable: true,
          visible: false,
        };
      }

      const isPrivate = !_.get(definition, 'options.populateCreatorFields', false);

      definition.attributes[CREATED_BY_ATTRIBUTE] = {
        model: 'user',
        plugin: 'admin',
        configurable: false,
        writable: false,
        visible: false,
        private: isPrivate,
      };

      definition.attributes[UPDATED_BY_ATTRIBUTE] = {
        model: 'user',
        plugin: 'admin',
        configurable: false,
        writable: false,
        visible: false,
        private: isPrivate,
      };
    }

    const componentAttributes = Object.keys(definition.attributes).filter(key =>
      ['component', 'dynamiczone'].includes(definition.attributes[key].type)
    );

    const scalarAttributes = Object.keys(definition.attributes).filter(key => {
      const { type } = definition.attributes[key];
      return type !== undefined && type !== null && type !== 'component' && type !== 'dynamiczone';
    });

    const relationalAttributes = Object.keys(definition.attributes).filter(key => {
      const { type } = definition.attributes[key];
      return type === undefined;
    });

    if (componentAttributes.length > 0) {
      componentAttributes.forEach(name => {
        definition.loadedModel[name] = [
          {
            kind: String,
            ref: {
              type: mongoose.Schema.Types.ObjectId,
              refPath: `${name}.kind`,
            },
          },
        ];
      });
    }

    scalarAttributes.forEach(name => {
      const attr = definition.attributes[name];
      definition.loadedModel[name] = {
        ...attr,
        ...utils(instance).convertType(name, attr),
        required:
          definition.modelType === 'compo' || hasDraftAndPublish ? false : definition.required,
      };
    });

    relationalAttributes.forEach(name => {
      buildRelation({
        definition,
        model,
        instance,
        name,
        attribute: definition.attributes[name],
      });
    });

    const schema = new instance.Schema(
      _.omitBy(definition.loadedModel, ({ type }) => type === 'virtual')
    );

    const findLifecycles = ['find', 'findOne', 'findOneAndUpdate', 'findOneAndRemove'];
    const morphAssociations = definition.associations.filter(isPolymorphicAssoc);
    const populateFn = createOnFetchPopulateFn({
      componentAttributes,
      morphAssociations,
      definition,
    });

    findLifecycles.forEach(key => {
      schema.pre(key, populateFn);
    });

    _.forEach(
      _.pickBy(definition.loadedModel, ({ type }) => type === 'virtual'),
      (value, key) => {
        schema.virtual(key, {
          ref: value.ref,
          localField: '_id',
          foreignField: value.via,
          justOne: value.justOne || false,
        });
      }
    );

    target[model].allAttributes = _.clone(definition.attributes);

    const createAtCol = _.get(definition, 'options.timestamps.0', 'createdAt');
    const updatedAtCol = _.get(definition, 'options.timestamps.1', 'updatedAt');

    if (_.get(definition, 'options.timestamps', false)) {
      _.set(definition, 'options.timestamps', [createAtCol, updatedAtCol]);

      _.assign(target[model].allAttributes, {
        [createAtCol]: { type: 'timestamp' },
        [updatedAtCol]: { type: 'timestamp' },
      });

      schema.set('timestamps', { createdAt: createAtCol, updatedAt: updatedAtCol });
    } else {
      _.set(definition, 'options.timestamps', false);
    }

    schema.set('minimize', _.get(definition, 'options.minimize', false) === true);

    const associations = definition.associations.filter(
      association => !isPolymorphicAssoc(association)
    );

    schema.options.toObject = schema.options.toJSON = {
      virtuals: true,
      transform: function (doc, returned) {
        transformReturned(returned, {
          definition,
          morphAssociations,
          componentAttributes,
          associations,
          refToStrapiRef,
          parseComponentRef,
          parseDynamicZoneRef,
          findComponentByGlobalId,
        });
      },
    };

    const Model = instance.model(definition.globalId, schema, definition.collectionName);

    const handleIndexesErrors = () => {
      Model.on('index', error => {
        if (!error) return;
        if (error.code === 11000) {
          strapi.log.error(
            `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${error.message}`
          );
        } else {
          strapi.log.error(`An index error happened, it wasn't applied.\n\t- ${error.message}`);
        }
      });
    };

    if (strapi.app.env !== 'production') {
      Model.syncIndexes(null, handleIndexesErrors);
    } else {
      handleIndexesErrors();
    }

    target[model] = _.assign(Model, target[model]);
    target[model]._attributes = definition.attributes;
    target[model].updateRelations = relations.update;
    target[model].deleteRelations = relations.deleteRelations;
    target[model].privateAttributes = contentTypesUtils.getPrivateAttributes(target[model]);
  }

  Object.keys(models).forEach(mountModel);

  for (const model of Object.keys(models)) {
    const definition = models[model];
    const modelInstance = target[model];
    const definitionDidChange = await didDefinitionChange(definition, instance);
    const previousDefinition = await getDefinitionFromStore(definition, instance);

    await strapi.db.migrations.run(migrateSchema, {
      definition,
      previousDefinition,
      model: modelInstance,
      ORM: instance,
    });

    if (definitionDidChange) {
      await storeDefinition(definition, instance);
    }
  }
};

const migrateSchema = () => {};