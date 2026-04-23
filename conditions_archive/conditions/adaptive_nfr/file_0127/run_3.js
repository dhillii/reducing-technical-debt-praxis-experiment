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

const shouldPopulateCreatorFields = definition => {
  return _.get(definition, 'options.populateCreatorFields', false);
};

const isComponentOrDynamicZone = attr => {
  return ['component', 'dynamiczone'].includes(attr.type);
};

const isScalarAttribute = attr => {
  const { type } = attr;
  return type !== undefined && type !== null && type !== 'component' && type !== 'dynamiczone';
};

const isRelationalAttribute = attr => {
  return attr.type === undefined;
};

const filterComponentAttributes = attributes => {
  return Object.keys(attributes).filter(key =>
    isComponentOrDynamicZone(attributes[key])
  );
};

const filterScalarAttributes = attributes => {
  return Object.keys(attributes).filter(key =>
    isScalarAttribute(attributes[key])
  );
};

const filterRelationalAttributes = attributes => {
  return Object.keys(attributes).filter(key =>
    isRelationalAttribute(attributes[key])
  );
};

const isDecimal128 = value => {
  return value instanceof mongoose.Types.Decimal128;
};

const isObjectId = value => {
  return value instanceof mongoose.Types.ObjectId;
};

const isNonEmptyArray = value => {
  return Array.isArray(value) && value.length > 0;
};

const shouldProcessMorphAssociation = (returned, alias) => {
  return isNonEmptyArray(returned[alias]);
};

const shouldProcessComponentAttribute = (returned, name, type) => {
  return type === 'component' && isNonEmptyArray(returned[name]);
};

const shouldProcessDynamicZone = (returned, name, type) => {
  return type === 'dynamiczone' && returned[name];
};

const shouldProcessRelation = relation => {
  return relation !== undefined && relation !== null;
};

const shouldApplyPopulateFilter = association => {
  return _.isArray(association.populate);
};

const isProductionEnv = env => {
  return env === 'production';
};

const isUniqueConstraintError = error => {
  return error.code === 11000;
};

const isOneToManyMorphNature = nature => {
  return ['oneToManyMorph', 'manyToManyMorph'].includes(nature);
};

const isAutoPopulateAssociation = assoc => {
  return assoc.autoPopulate !== false;
};

const isNonPolymorphicAssociation = assoc => {
  return !isPolymorphicAssoc(assoc);
};

const isVirtualField = field => {
  return field.type === 'virtual';
};

const isNonVirtualField = field => {
  return field.type !== 'virtual';
};

const hasTimestamps = definition => {
  return _.get(definition, 'options.timestamps', false);
};

const shouldMinimizeSchema = definition => {
  return _.get(definition, 'options.minimize', false) === true;
};

const isOneToOneOrManyToOne = nature => {
  return nature === 'oneToOne' || nature === 'manyToOne';
};

const isOneWayOrMorph = nature => {
  return nature === 'oneWay' || nature === 'oneToMorph';
};

const isManyWayNature = nature => {
  return nature === 'manyWay';
};

const isVirtualRelation = (FK, isDominant) => {
  return (FK && _.isUndefined(FK.via)) || isDominant !== true;
};

const isOneMorphToOne = nature => {
  return nature === 'oneMorphToOne';
};

const isManyMorphNature = nature => {
  return nature === 'manyMorphToMany' || nature === 'manyMorphToOne';
};

const parseDecimal128 = value => {
  return parseFloat(value.toString());
};

const parseComponentRefValue = el => {
  if (isObjectId(el.ref)) {
    return el.ref.toString();
  }
  return el.ref;
};

const parseDynamicZoneRefValue = el => {
  if (isObjectId(el.ref)) {
    return { id: el.ref.toString() };
  }
  return el.ref;
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

const processMorphAssociation = (returned, association) => {
  const { alias, nature } = association;

  if (!shouldProcessMorphAssociation(returned, alias)) {
    return;
  }

  if (isOneMorphToOne(nature)) {
    returned[alias] = refToStrapiRef(returned[alias][0]);
  } else if (isManyMorphNature(nature)) {
    returned[alias] = returned[alias].map(obj => refToStrapiRef(obj));
  }
};

const processComponentAttribute = (returned, name, attribute) => {
  const { type } = attribute;

  if (!shouldProcessComponentAttribute(returned, name, type)) {
    return;
  }

  const components = returned[name].map(parseComponentRefValue);
  returned[name] = attribute.repeatable === true ? components : _.first(components) || null;
};

const processDynamicZoneAttribute = (returned, name, attribute) => {
  const { type } = attribute;

  if (!shouldProcessDynamicZone(returned, name, type)) {
    return;
  }

  returned[name] = returned[name]
    .filter(el => el && el.kind)
    .map(el => {
      return {
        __component: findComponentByGlobalId(el.kind).uid,
        ...parseDynamicZoneRefValue(el),
      };
    });
};

const processRelationAttribute = (returned, association) => {
  const relation = returned[association.alias];

  if (!shouldProcessRelation(relation)) {
    return;
  }

  returned[association.alias] = relation.toJSON ? relation.toJSON() : relation;

  if (shouldApplyPopulateFilter(association)) {
    const { alias, populate } = association;
    const pickPopulate = entry => _.pick(entry, populate);

    returned[alias] = _.isArray(returned[alias])
      ? _.map(returned[alias], pickPopulate)
      : pickPopulate(returned[alias]);
  }
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

const initializeDefinition = definition => {
  definition.orm = 'mongoose';
  definition.associations = [];
  definition.globalName = _.upperFirst(_.camelCase(definition.globalId));
  definition.loadedModel = {};

  _.defaults(definition, {
    primaryKey: '_id',
    primaryKeyType: 'string',
  });
};

const setupSystemAttributes = definition => {
  if (!shouldAddSystemAttributes(definition)) {
    return;
  }

  if (contentTypesUtils.hasDraftAndPublish(definition)) {
    addPublishedAtAttribute(definition);
  }

  const isPrivate = !shouldPopulateCreatorFields(definition);
  addSystemAttributes(definition, isPrivate);
};

const setupComponentAttributes = (definition, instance) => {
  const componentAttributes = filterComponentAttributes(definition.attributes);

  if (componentAttributes.length === 0) {
    return componentAttributes;
  }

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

  return componentAttributes;
};

const setupScalarAttributes = (definition, instance, hasDraftAndPublish) => {
  const scalarAttributes = filterScalarAttributes(definition.attributes);

  scalarAttributes.forEach(name => {
    const attr = definition.attributes[name];
    definition.loadedModel[name] = {
      ...attr,
      ...utils(instance).convertType(name, attr),
      required:
        definition.modelType === 'compo' || hasDraftAndPublish ? false : definition.required,
    };
  });

  return scalarAttributes;
};

const setupRelationalAttributes = (definition, model, instance) => {
  const relationalAttributes = filterRelationalAttributes(definition.attributes);

  relationalAttributes.forEach(name => {
    buildRelation({
      definition,
      model,
      instance,
      name,
      attribute: definition.attributes[name],
    });
  });

  return relationalAttributes;
};

const setupSchemaTransform = (schema, morphAssociations, componentAttributes, associations, definition) => {
  schema.options.toObject = schema.options.toJSON = {
    virtuals: true,
    transform: function(doc, returned) {
      transformDecimalValues(returned);
      morphAssociations.forEach(association => {
        processMorphAssociation(returned, association);
      });
      componentAttributes.forEach(name => {
        const attribute = definition.attributes[name];
        processComponentAttribute(returned, name, attribute);
        processDynamicZoneAttribute(returned, name, attribute);
      });
      associations.forEach(association => {
        processRelationAttribute(returned, association);
      });
    },
  };
};

const transformDecimalValues = returned => {
  Object.keys(returned)
    .filter(key => isDecimal128(returned[key]))
    .forEach(key => {
      returned[key] = parseDecimal128(returned[key]);
    });
};

const setupVirtualFields = (schema, definition) => {
  _.forEach(
    _.pickBy(definition.loadedModel, ({ type }) => isVirtualField({ type })),
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

const setupTimestamps = (definition, schema, target, model) => {
  if (!hasTimestamps(definition)) {
    _.set(definition, 'options.timestamps', false);
    return;
  }

  const createAtCol = _.get(definition, 'options.timestamps.0', 'createdAt');
  const updatedAtCol = _.get(definition, 'options.timestamps.1', 'updatedAt');

  _.set(definition, 'options.timestamps', [createAtCol, updatedAtCol]);

  _.assign(target[model].allAttributes, {
    [createAtCol]: { type: 'timestamp' },
    [updatedAtCol]: { type: 'timestamp' },
  });

  schema.set('timestamps', { createdAt: createAtCol, updatedAt: updatedAtCol });
};

const handleIndexError = error => {
  if (!error) {
    return;
  }

  if (isUniqueConstraintError(error)) {
    strapi.log.error(
      `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${error.message}`
    );
  } else {
    strapi.log.error(`An index error happened, it wasn't applied.\n\t- ${error.message}`);
  }
};

const setupModelIndexes = Model => {
  const handleIndexesErrors = () => {
    Model.on('index', error => {
      handleIndexError(error);
    });
  };

  if (isProductionEnv(strapi.app.env)) {
    handleIndexesErrors();
  } else {
    Model.syncIndexes(null, handleIndexesErrors);
  }
};

const exposeModelFunctions = (target, model, Model, definition) => {
  target[model] = _.assign(Model, target[model]);
  target[model]._attributes = definition.attributes;
  target[model].updateRelations = relations.update;
  target[model].deleteRelations = relations.deleteRelations;
  target[model].privateAttributes = contentTypesUtils.getPrivateAttributes(target[model]);
};

const mountModel = (models, target, instance) => {
  return model => {
    const definition = models[model];

    initializeDefinition(definition);
    setupSystemAttributes(definition);

    const hasDraftAndPublish = contentTypesUtils.hasDraftAndPublish(definition);

    const componentAttributes = setupComponentAttributes(definition, instance);
    setupScalarAttributes(definition, instance, hasDraftAndPublish);
    setupRelationalAttributes(definition, model, instance);

    const schema = new instance.Schema(
      _.omitBy(definition.loadedModel, ({ type }) => isNonVirtualField({ type }))
    );

    const morphAssociations = definition.associations.filter(isPolymorphicAssoc);
    const associations = definition.associations.filter(isNonPolymorphicAssociation);

    const populateFn = createOnFetchPopulateFn({
      componentAttributes,
      morphAssociations,
      definition,
    });

    const findLifecycles = ['find', 'findOne', 'findOneAndUpdate', 'findOneAndRemove'];
    findLifecycles.forEach(key => {
      schema.pre(key, populateFn);
    });

    setupVirtualFields(schema, definition);

    target[model].allAttributes = _.clone(definition.attributes);

    setupTimestamps(definition, schema, target, model);

    schema.set('minimize', shouldMinimizeSchema(definition));

    setupSchemaTransform(schema, morphAssociations, componentAttributes, associations, definition);

    const Model = instance.model(definition.globalId, schema, definition.collectionName);

    setupModelIndexes(Model);
    exposeModelFunctions(target, model, Model, definition);
  };
};

module.exports = async ({ models, target }, ctx) => {
  const { instance } = ctx;

  const modelMounter = mountModel(models, target, instance);
  Object.keys(models).forEach(modelMounter);

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
    } = this.getOptions();

    const getMatchQuery = assoc => {
      const assocModel = strapi.db.getModelByAssoc(assoc);
      const hasDraftAndPublish = contentTypesUtils.hasDraftAndPublish(assocModel);

      if (hasDraftAndPublish && DP_PUB_STATES.includes(publicationState)) {
        return populateQueries.publicationState[publicationState];
      }

      return undefined;
    };

    if (_populateMorphRelations) {
      processMorphPopulations(this, morphAssociations, populatedPaths, publicationState, getMatchQuery);
    }

    if (_populateComponents) {
      componentAttributes.forEach(key => {
        this.populate({ path: `${key}.ref`, options: { publicationState } });
      });
    }

    if (definition.modelType === 'component') {
      processComponentPopulations(this, definition, publicationState, getMatchQuery);
    }
  };
};

const processMorphPopulations = (query, morphAssociations, populatedPaths, publicationState, getMatchQuery) => {
  morphAssociations.forEach(association => {
    const matchQuery = getMatchQuery(association);
    const { alias, nature } = association;

    if (isOneToManyMorphNature(nature)) {
      query.populate({ path: alias, match: matchQuery, options: { publicationState } });
    } else if (populatedPaths.includes(alias)) {
      setMorphPopulateOptions(query, alias, publicationState, matchQuery);
    }
  });
};

const setMorphPopulateOptions = (query, alias, publicationState, matchQuery) => {
  _.set(query._mongooseOptions.populate, [alias, 'path'], `${alias}.ref`);
  _.set(query._mongooseOptions.populate, [alias, 'options'], {
    publicationState,
  });

  if (matchQuery !== undefined) {
    _.set(query._mongooseOptions.populate, [alias, 'match'], matchQuery);
  }
};

const processComponentPopulations = (query, definition, publicationState, getMatchQuery) => {
  definition.associations
    .filter(isNonPolymorphicAssociation)
    .filter(isAutoPopulateAssociation)
    .forEach(ast => {
      query.populate({
        path: ast.alias,
        match: getMatchQuery(ast),
        options: { publicationState, _populateComponents: false },
      });
    });
};

const buildRelation = ({ definition, model, instance, attribute, name }) => {
  const { nature, verbose } =
    utilsModels.getNature({
      attribute,
      attributeName: name,
      modelName: model.toLowerCase(),
    }) || {};

  utilsModels.defineAssociations(model.toLowerCase(), definition, attribute, name);

  const getRef = (name, plugin) => {
    return strapi.db.getModel(name, plugin).globalId;
  };

  const setField = (name, val) => {
    definition.loadedModel[name] = val;
  };

  const { ObjectId } = instance.Schema.Types;

  buildRelationByVerbose(verbose, attribute, definition, name, getRef, setField, ObjectId, nature);
};

const buildRelationByVerbose = (verbose, attribute, definition, name, getRef, setField, ObjectId, nature) => {
  switch (verbose) {
    case 'hasOne':
      buildHasOneRelation(attribute, name, getRef, setField, ObjectId);
      break;
    case 'hasMany':
      buildHasManyRelation(definition, attribute, name, getRef, setField, ObjectId);
      break;
    case 'belongsTo':
      buildBelongsToRelation(definition, attribute, name, getRef, setField, ObjectId);
      break;
    case 'belongsToMany':
      buildBelongsToManyRelation(definition, attribute, name, getRef, setField, ObjectId, nature);
      break;
    case 'morphOne':
      buildMorphOneRelation(attribute, name, getRef, setField, ObjectId);
      break;
    case 'morphMany':
      buildMorphManyRelation(attribute, name, getRef, setField, ObjectId);
      break;
    case 'belongsToMorph':
      buildBelongsToMorphRelation(attribute, name, setField, ObjectId);
      break;
    case 'belongsToManyMorph':
      buildBelongsToManyMorphRelation(attribute, name, setField, ObjectId);
      break;
    default:
      break;
  }
};

const buildHasOneRelation = (attribute, name, getRef, setField, ObjectId) => {
  const ref = getRef(attribute.model, attribute.plugin);
  setField(name, { type: ObjectId, ref });
};

const buildHasManyRelation = (definition, attribute, name, getRef, setField, ObjectId) => {
  const FK = _.find(definition.associations, { alias: name });
  const ref = getRef(attribute.collection, attribute.plugin);

  if (FK) {
    setField(name, {
      type: 'virtual',
      ref,
      via: FK.via,
      justOne: false,
    });
    attribute.isVirtual = true;
  } else {
    setField(name, [{ type: ObjectId, ref }]);
  }
};

const buildBelongsToRelation = (definition, attribute, name, getRef, setField, ObjectId) => {
  const FK = _.find(definition.associations, { alias: name });
  const ref = getRef(attribute.model, attribute.plugin);

  if (FK && !isInvalidBelongsToNature(FK.nature)) {
    setField(name, {
      type: 'virtual',
      ref,
      via: FK.via,
      justOne: true,
    });
    attribute.isVirtual = true;
  } else {
    setField(name, { type: ObjectId, ref });
  }
};

const isInvalidBelongsToNature = nature => {
  return !isOneToOneOrManyToOne(nature) && !isOneWayOrMorph(nature);
};

const buildBelongsToManyRelation = (definition, attribute, name, getRef, setField, ObjectId, nature) => {
  const ref = getRef(attribute.collection, attribute.plugin);

  if (isManyWayNature(nature)) {
    setField(name, [{ type: ObjectId, ref }]);
    return;
  }

  const FK = _.find(definition.associations, { alias: name });

  if (isVirtualRelation(FK, attribute.dominant)) {
    setField(name, {
      type: 'virtual',
      ref,
      via: FK.via,
    });
    attribute.isVirtual = true;
  } else {
    setField(name, [{ type: ObjectId, ref }]);
  }
};

const buildMorphOneRelation = (attribute, name, getRef, setField, ObjectId) => {
  const ref = getRef(attribute.model, attribute.plugin);
  setField(name, { type: ObjectId, ref });
};

const buildMorphManyRelation = (attribute, name, getRef, setField, ObjectId) => {
  const ref = getRef(attribute.collection, attribute.plugin);
  setField(name, [{ type: ObjectId, ref }]);
};

const buildBelongsToMorphRelation = (attribute, name, setField, ObjectId) => {
  setField(name, {
    kind: String,
    [attribute.filter]: String,
    ref: { type: ObjectId, refPath: `${name}.kind` },
  });
};

const buildBelongsToManyMorphRelation = (attribute, name, setField, ObjectId) => {
  setField(name, [
    {
      kind: String,
      [attribute.filter]: String,
      ref: { type: ObjectId, refPath: `${name}.kind` },
    },
  ]);
};
```