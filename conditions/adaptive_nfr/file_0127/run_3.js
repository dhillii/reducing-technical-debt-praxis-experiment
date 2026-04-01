```javascript
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

const isPolymorphicAssoc = assoc => {
  return assoc.nature.toLowerCase().indexOf('morph') !== -1;
};

const isSystemModel = definition => {
  return definition.uid.startsWith('strapi::');
};

const isComponentModel = definition => {
  return definition.modelType === 'component';
};

const shouldAddSystemAttributes = definition => {
  return !isSystemModel(definition) && !isComponentModel(definition);
};

const isComponentOrDynamicZoneType = type => {
  return ['component', 'dynamiczone'].includes(type);
};

const isScalarType = type => {
  return type !== undefined && type !== null && type !== 'component' && type !== 'dynamiczone';
};

const isRelationalType = type => {
  return type === undefined;
};

const isVirtualType = ({ type }) => type === 'virtual';

const isNonVirtualType = ({ type }) => type !== 'virtual';

const isDecimal128 = value => value instanceof mongoose.Types.Decimal128;

const isArrayWithLength = value => Array.isArray(value) && value.length > 0;

const shouldPopulateMorphAssociation = (association, populatedPaths) => {
  const { nature, alias } = association;
  return ['oneToManyMorph', 'manyToManyMorph'].includes(nature) || populatedPaths.includes(alias);
};

const isOneToOneRelation = nature => {
  return nature === 'oneToOne';
};

const isManyToOneRelation = nature => {
  return nature === 'manyToOne';
};

const isOneWayRelation = nature => {
  return nature === 'oneWay';
};

const isOneToMorphRelation = nature => {
  return nature === 'oneToMorph';
};

const isVirtualBelongsToRelation = (FK, nature) => {
  if (!FK) return false;
  return (
    !isOneToOneRelation(nature) &&
    !isManyToOneRelation(nature) &&
    !isOneWayRelation(nature) &&
    !isOneToMorphRelation(nature)
  );
};

const isManyWayRelation = nature => {
  return nature === 'manyWay';
};

const shouldBeVirtualBelongsToMany = (FK, attribute) => {
  return (FK && _.isUndefined(FK.via)) || attribute.dominant !== true;
};

const isProductionEnv = env => {
  return env === 'production';
};

const addSystemAttributes = (definition, isPrivate) => {
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
};

const addPublishedAtAttribute = definition => {
  definition.attributes[PUBLISHED_AT_ATTRIBUTE] = {
    type: 'datetime',
    configurable: false,
    writable: true,
    visible: false,
  };
};

const filterAttributesByType = (attributes, predicate) => {
  return Object.keys(attributes).filter(key => predicate(attributes[key]));
};

const getComponentAttributes = attributes => {
  return filterAttributesByType(attributes, attr => isComponentOrDynamicZoneType(attr.type));
};

const getScalarAttributes = attributes => {
  return filterAttributesByType(attributes, attr => isScalarType(attr.type));
};

const getRelationalAttributes = attributes => {
  return filterAttributesByType(attributes, attr => isRelationalType(attr.type));
};

const buildComponentLoadedModel = (name, componentAttributes) => {
  return [
    {
      kind: String,
      ref: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: `${name}.kind`,
      },
    },
  ];
};

const buildScalarLoadedModel = (attr, instance, hasDraftAndPublish, modelType) => {
  return {
    ...attr,
    ...utils(instance).convertType(attr.type, attr),
    required: modelType === 'compo' || hasDraftAndPublish ? false : attr.required,
  };
};

const setupComponentLoadedModels = (definition, componentAttributes) => {
  componentAttributes.forEach(name => {
    definition.loadedModel[name] = buildComponentLoadedModel(name, componentAttributes);
  });
};

const setupScalarLoadedModels = (definition, scalarAttributes, instance, hasDraftAndPublish) => {
  scalarAttributes.forEach(name => {
    const attr = definition.attributes[name];
    definition.loadedModel[name] = buildScalarLoadedModel(
      attr,
      instance,
      hasDraftAndPublish,
      definition.modelType
    );
  });
};

const setupRelationalLoadedModels = (definition, relationalAttributes, model, instance) => {
  relationalAttributes.forEach(name => {
    buildRelation({
      definition,
      model,
      instance,
      name,
      attribute: definition.attributes[name],
    });
  });
};

const createSchemaTransformFn = (definition, componentAttributes, morphAssociations, associations) => {
  return function(doc, returned) {
    handleDecimal128Fields(returned);
    handleMorphAssociations(returned, morphAssociations);
    handleComponentAttributes(returned, componentAttributes, definition);
    handleAssociations(returned, associations);
  };
};

const handleDecimal128Fields = returned => {
  Object.keys(returned)
    .filter(key => isDecimal128(returned[key]))
    .forEach(key => {
      returned[key] = parseFloat(returned[key].toString());
    });
};

const handleMorphAssociations = (returned, morphAssociations) => {
  morphAssociations.forEach(association => {
    if (!isArrayWithLength(returned[association.alias])) {
      return;
    }

    const { nature, alias } = association;

    if (nature === 'oneMorphToOne') {
      returned[alias] = refToStrapiRef(returned[alias][0]);
    } else if (nature === 'manyMorphToMany' || nature === 'manyMorphToOne') {
      returned[alias] = returned[alias].map(obj => refToStrapiRef(obj));
    }
  });
};

const refToStrapiRef = obj => {
  const ref = obj.ref;
  let plainData = ref && typeof ref.toJSON === 'function' ? ref.toJSON() : ref;

  if (typeof plainData !== 'object') {
    return ref;
  }

  return {
    __contentType: obj.kind,
    ...ref,
  };
};

const parseComponentRef = el => {
  if (el.ref instanceof mongoose.Types.ObjectId) {
    return el.ref.toString();
  }
  return el.ref;
};

const parseDynamicZoneRef = el => {
  if (el.ref instanceof mongoose.Types.ObjectId) {
    return { id: el.ref.toString() };
  }
  return el.ref;
};

const handleComponentAttributes = (returned, componentAttributes, definition) => {
  componentAttributes.forEach(name => {
    const attribute = definition.attributes[name];
    const { type } = attribute;

    if (type === 'component') {
      handleComponentType(returned, name, attribute);
    }

    if (type === 'dynamiczone') {
      handleDynamicZoneType(returned, name);
    }
  });
};

const handleComponentType = (returned, name, attribute) => {
  if (!Array.isArray(returned[name])) {
    return;
  }

  const components = returned[name].map(parseComponentRef);
  returned[name] = attribute.repeatable === true ? components : _.first(components) || null;
};

const handleDynamicZoneType = (returned, name) => {
  if (!returned[name]) {
    return;
  }

  returned[name] = returned[name]
    .filter(el => el && el.kind)
    .map(el => {
      return {
        __component: findComponentByGlobalId(el.kind).uid,
        ...parseDynamicZoneRef(el),
      };
    });
};

const handleAssociations = (returned, associations) => {
  associations.forEach(association => {
    const relation = returned[association.alias];

    if (!relation) {
      return;
    }

    returned[association.alias] = relation.toJSON ? relation.toJSON() : relation;

    if (_.isArray(association.populate)) {
      applyPopulateFilter(returned, association);
    }
  });
};

const applyPopulateFilter = (returned, association) => {
  const { alias, populate } = association;
  const pickPopulate = entry => _.pick(entry, populate);

  returned[alias] = _.isArray(returned[alias])
    ? _.map(returned[alias], pickPopulate)
    : pickPopulate(returned[alias]);
};

const setupSchemaOptions = (schema, definition) => {
  const createAtCol = _.get(definition, 'options.timestamps.0', 'createdAt');
  const updatedAtCol = _.get(definition, 'options.timestamps.1', 'updatedAt');

  if (_.get(definition, 'options.timestamps', false)) {
    _.set(definition, 'options.timestamps', [createAtCol, updatedAtCol]);
    schema.set('timestamps', { createdAt: createAtCol, updatedAt: updatedAtCol });
  } else {
    _.set(definition, 'options.timestamps', false);
  }

  schema.set('minimize', _.get(definition, 'options.minimize', false) === true);
};

const setupVirtualFields = (schema, definition) => {
  _.forEach(
    _.pickBy(definition.loadedModel, isVirtualType),
    (value, key) => {
      schema.virtual(key, {
        ref: value.ref,
        localField: '_id',
        foreignField: value.via,
        justOne: value.justOne || false,
      });
    }
  );
};

const setupPreHooks = (schema, findLifecycles, populateFn) => {
  findLifecycles.forEach(key => {
    schema.pre(key, populateFn);
  });
};

const handleIndexErrors = Model => {
  Model.on('index', error => {
    if (!error) {
      return;
    }

    if (error.code === 11000) {
      strapi.log.error(
        `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${error.message}`
      );
    } else {
      strapi.log.error(`An index error happened, it wasn't applied.\n\t- ${error.message}`);
    }
  });
};

const syncModelIndexes = (Model, env) => {
  if (isProductionEnv(env)) {
    handleIndexErrors(Model);
  } else {
    Model.syncIndexes(null, () => handleIndexErrors(Model));
  }
};

const assignModelProperties = (target, model, Model, definition) => {
  target[model] = _.assign(Model, target[model]);
  target[model]._attributes = definition.attributes;
  target[model].updateRelations = relations.update;
  target[model].deleteRelations = relations.deleteRelations;
  target[model].privateAttributes = contentTypesUtils.getPrivateAttributes(target[model]);
};

const mountModel = (models, target, instance) => {
  return model => {
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

    if (shouldAddSystemAttributes(definition)) {
      addPublishedAtAttribute(definition);
      const isPrivate = !_.get(definition, 'options.populateCreatorFields', false);
      addSystemAttributes(definition, isPrivate);
    }

    const componentAttributes = getComponentAttributes(definition.attributes);
    const scalarAttributes = getScalarAttributes(definition.attributes);
    const relationalAttributes = getRelationalAttributes(definition.attributes);

    if (componentAttributes.length > 0) {
      setupComponentLoadedModels(definition, componentAttributes);
    }

    setupScalarLoadedModels(definition, scalarAttributes, instance, hasDraftAndPublish);
    setupRelationalLoadedModels(definition, relationalAttributes, model, instance);

    const schema = new instance.Schema(
      _.omitBy(definition.loadedModel, isVirtualType)
    );

    const findLifecycles = ['find', 'findOne', 'findOneAndUpdate', 'findOneAndRemove'];
    const morphAssociations = definition.associations.filter(isPolymorphicAssoc);

    const populateFn = createOnFetchPopulateFn({
      componentAttributes,
      morphAssociations,
      definition,
    });

    setupPreHooks(schema, findLifecycles, populateFn);
    setupVirtualFields(schema, definition);

    target[model].allAttributes = _.clone(definition.attributes);

    setupSchemaOptions(schema, definition);

    const associations = definition.associations.filter(
      association => !isPolymorphicAssoc(association)
    );

    schema.options.toObject = schema.options.toJSON = {
      virtuals: true,
      transform: createSchemaTransformFn(definition, componentAttributes, morphAssociations, associations),
    };

    const Model = instance.model(definition.globalId, schema, definition.collectionName);

    syncModelIndexes(Model, strapi.app.env);
    assignModelProperties(target, model, Model, definition);
  };
};

module.exports = async ({ models, target }, ctx) => {
  const { instance } = ctx;

  Object.keys(models).forEach(mountModel(models, target, instance));

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

const createOnFetchPopulateFn = ({ morphAssociations, componentAttributes, definition }) => {
  return function() {
    const populatedPaths = this.getPopulatedPaths();
    const {
      publicationState,
      _populateComponents = true,
      _populateMorphRelations = true,
    } = this.