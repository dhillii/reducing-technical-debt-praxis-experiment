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

/** @param {Object} assoc - Association object */
const isPolymorphicAssoc = assoc => {
  return assoc.nature.toLowerCase().indexOf('morph') !== -1;
};

/** @param {string} uid - Model UID */
const isStrapiInternalModel = uid => uid.startsWith('strapi::');

/** @param {string} modelType - Model type */
const isComponentModel = modelType => modelType === 'component';

/** @param {Object} definition - Model definition */
const shouldSkipAuditAttributes = definition => {
  return isStrapiInternalModel(definition.uid) || isComponentModel(definition.modelType);
};

/** @param {Object} definition - Model definition */
const shouldPopulateCreatorFields = definition => {
  return _.get(definition, 'options.populateCreatorFields', false);
};

/** @param {Object} attr - Attribute object */
const isComponentOrDynamicZone = attr => {
  return ['component', 'dynamiczone'].includes(attr.type);
};

/** @param {Object} attr - Attribute object */
const isScalarAttribute = attr => {
  const { type } = attr;
  return type !== undefined && type !== null && !isComponentOrDynamicZone(attr);
};

/** @param {Object} attr - Attribute object */
const isRelationalAttribute = attr => {
  return attr.type === undefined;
};

/** @param {Object} attr - Attribute object */
const isVirtualAttribute = attr => {
  return attr.type === 'virtual';
};

/** @param {Object} attr - Attribute object */
const isComponentAttribute = attr => {
  return attr.type === 'component';
};

/** @param {Object} attr - Attribute object */
const isDynamicZoneAttribute = attr => {
  return attr.type === 'dynamiczone';
};

/** @param {Object} association - Association object */
const isNonPolymorphicAssoc = association => {
  return !isPolymorphicAssoc(association);
};

/** @param {Object} association - Association object */
const isMorphToOneOrMany = nature => {
  return ['oneToManyMorph', 'manyToManyMorph'].includes(nature);
};

/** @param {Object} association - Association object */
const shouldAutoPopulate = assoc => {
  return assoc.autoPopulate !== false;
};

/** @param {Object} fk - Foreign key association */
const isVirtualForeignKey = (fk, nature) => {
  if (!fk) return false;
  const nonVirtualNatures = ['oneToOne', 'manyToOne', 'oneWay', 'oneToMorph'];
  return !nonVirtualNatures.includes(nature);
};

/** @param {Object} fk - Foreign key association */
const isBidirectionalRelation = (fk, isDominant) => {
  return (fk && _.isUndefined(fk.via)) || isDominant !== true;
};

const addAuditAttributes = (definition, isPrivate) => {
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

const setupAuditAttributes = definition => {
  if (shouldSkipAuditAttributes(definition)) {
    return;
  }

  if (contentTypesUtils.hasDraftAndPublish(definition)) {
    addPublishedAtAttribute(definition);
  }

  const isPrivate = !shouldPopulateCreatorFields(definition);
  addAuditAttributes(definition, isPrivate);
};

const getAttributesByType = definition => {
  const componentAttributes = [];
  const scalarAttributes = [];
  const relationalAttributes = [];

  Object.keys(definition.attributes).forEach(key => {
    const attr = definition.attributes[key];
    if (isComponentOrDynamicZone(attr)) {
      componentAttributes.push(key);
    } else if (isScalarAttribute(attr)) {
      scalarAttributes.push(key);
    } else if (isRelationalAttribute(attr)) {
      relationalAttributes.push(key);
    }
  });

  return { componentAttributes, scalarAttributes, relationalAttributes };
};

const setupComponentAttributes = (definition, componentAttributes) => {
  if (componentAttributes.length === 0) {
    return;
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
};

const setupScalarAttributes = (definition, scalarAttributes, instance, hasDraftAndPublish) => {
  scalarAttributes.forEach(name => {
    const attr = definition.attributes[name];
    definition.loadedModel[name] = {
      ...attr,
      ...utils(instance).convertType(name, attr),
      required:
        definition.modelType === 'compo' || hasDraftAndPublish ? false : definition.required,
    };
  });
};

const setupRelationalAttributes = (definition, model, instance, relationalAttributes) => {
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

const createSchema = (instance, definition) => {
  return new instance.Schema(
    _.omitBy(definition.loadedModel, ({ type }) => type === 'virtual')
  );
};

const setupSchemaPreHooks = (schema, populateFn) => {
  const findLifecycles = ['find', 'findOne', 'findOneAndUpdate', 'findOneAndRemove'];
  findLifecycles.forEach(key => {
    schema.pre(key, populateFn);
  });
};

const setupVirtualFields = (schema, definition) => {
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
};

const setupTimestamps = (definition, schema, target, model) => {
  const createAtCol = _.get(definition, 'options.timestamps.0', 'createdAt');
  const updatedAtCol = _.get(definition, 'options.timestamps.1', 'updatedAt');

  if (!_.get(definition, 'options.timestamps', false)) {
    _.set(definition, 'options.timestamps', false);
    return;
  }

  _.set(definition, 'options.timestamps', [createAtCol, updatedAtCol]);

  _.assign(target[model].allAttributes, {
    [createAtCol]: { type: 'timestamp' },
    [updatedAtCol]: { type: 'timestamp' },
  });

  schema.set('timestamps', { createdAt: createAtCol, updatedAt: updatedAtCol });
};

const refToStrapiRef = obj => {
  const ref = obj.ref;
  let plainData = ref && typeof ref.toJSON === 'function' ? ref.toJSON() : ref;

  if (typeof plainData !== 'object') return ref;

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

const transformDecimalValues = returned => {
  Object.keys(returned)
    .filter(key => returned[key] instanceof mongoose.Types.Decimal128)
    .forEach(key => {
      returned[key] = parseFloat(returned[key].toString());
    });
};

const transformMorphAssociations = (returned, morphAssociations) => {
  morphAssociations.forEach(association => {
    if (!Array.isArray(returned[association.alias]) || returned[association.alias].length === 0) {
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

const transformComponentAttributes = (returned, componentAttributes, definition) => {
  componentAttributes.forEach(name => {
    const attribute = definition.attributes[name];

    if (isComponentAttribute(attribute)) {
      transformComponentAttribute(returned, name, attribute);
    } else if (isDynamicZoneAttribute(attribute)) {
      transformDynamicZoneAttribute(returned, name);
    }
  });
};

const transformComponentAttribute = (returned, name, attribute) => {
  if (!Array.isArray(returned[name])) {
    return;
  }

  const components = returned[name].map(parseComponentRef);
  returned[name] = attribute.repeatable === true ? components : _.first(components) || null;
};

const transformDynamicZoneAttribute = (returned, name) => {
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

const transformAssociations = (returned, associations) => {
  associations.forEach(association => {
    const relation = returned[association.alias];

    if (!relation) {
      return;
    }

    returned[association.alias] = relation.toJSON ? relation.toJSON() : relation;

    if (!_.isArray(association.populate)) {
      return;
    }

    const { alias, populate } = association;
    const pickPopulate = entry => _.pick(entry, populate);

    returned[alias] = _.isArray(returned[alias])
      ? _.map(returned[alias], pickPopulate)
      : pickPopulate(returned[alias]);
  });
};

const setupSchemaTransform = (schema, definition, componentAttributes, morphAssociations, associations) => {
  schema.options.toObject = schema.options.toJSON = {
    virtuals: true,
    transform: function(doc, returned) {
      transformDecimalValues(returned);
      transformMorphAssociations(returned, morphAssociations);
      transformComponentAttributes(returned, componentAttributes, definition);
      transformAssociations(returned, associations);
    },
  };
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

const setupIndexes = Model => {
  if (strapi.app.env !== 'production') {
    Model.syncIndexes(null, () => handleIndexErrors(Model));
  } else {
    handleIndexErrors(Model);
  }
};

const exposeOrmFunctions = (target, model, Model, definition) => {
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
    setupAuditAttributes(definition);

    const hasDraftAndPublish = contentTypesUtils.hasDraftAndPublish(definition);
    const { componentAttributes, scalarAttributes, relationalAttributes } = getAttributesByType(definition);

    setupComponentAttributes(definition, componentAttributes);
    setupScalarAttributes(definition, scalarAttributes, instance, hasDraftAndPublish);
    setupRelationalAttributes(definition, model, instance, relationalAttributes);

    const schema = createSchema(instance, definition);
    const morphAssociations = definition.associations.filter(isPolymorphicAssoc);
    const populateFn = createOnFetchPopulateFn({
      componentAttributes,
      morphAssociations,
      definition,
    });

    setupSchemaPreHooks(schema, populateFn);
    setupVirtualFields(schema, definition);

    target[model].allAttributes = _.clone(definition.attributes);

    setupTimestamps(definition, schema, target, model);

    schema.set('minimize', _.get(definition, 'options.minimize', false) === true);

    const associations = definition.associations.filter(isNonPolymorphicAssoc);
    setupSchemaTransform(schema, definition, componentAttributes, morphAssociations, associations);

    const Model = instance.model(definition.globalId, schema, definition.collectionName);

    setupIndexes(Model);
    exposeOrmFunctions(target, model, Model, definition);
  };
};

const runMigrations = async (models, target, instance) => {
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

module.exports = async ({ models, target }, ctx) => {
  const { instance } = ctx;

  Object.keys(models).forEach(mountModel(models, target, instance));
  await runMigrations(models, target, instance);
};

/** @returns {void} */
const migrateSchema = () => {};

const populateMorphAssociations = (query, morphAssociations, publicationState, populatedPaths) => {
  morphAssociations.forEach(association => {
    const matchQuery = getMatchQuery(association, publicationState);
    const { alias, nature } = association;

    if (isMorphToOneOrMany(nature)) {
      query.populate({ path: alias, match: matchQuery, options: { publicationState } });
    } else if (populatedPaths.includes(alias)) {
      _.set(query._mongooseOptions.populate, [alias, 'path'], `${alias}.ref`);
      _.set(query._mongooseOptions.populate, [alias, 'options'], { publicationState });

      if (matchQuery !== undefined) {
        _.set(query._mongooseOptions.populate, [alias, 'match'], matchQuery);
      }
    }
  });
};

const populateComponentAttributes = (query, componentAttributes, publicationState) => {
  componentAttributes.forEach(key => {
    query.populate({ path: `${key}.ref`, options: { publicationState } });
  });
};

const populateComponentRelations = (query, definition, publicationState) => {
  if (definition.modelType !== 'component') {
    return;
  }

  definition.associations
    .filter(isNonPolymorphicAssoc)
    .filter(shouldAutoPopulate)
    .forEach(ast => {
      query.populate({
        path: ast.alias,
        match: getMatchQuery(ast, publicationState),
        options: { publicationState, _populateComponents: false },
      });
    });
};

/** @param {Object} assoc - Association object */
const getMatchQuery = (assoc, publicationState) => {
  const assocModel = strapi.db.getModelByAssoc(assoc);
  const hasDraftAndPublish = contentTypesUtils.hasDraftAndPublish(assocModel);

  if (hasDraftAndPublish && DP_PUB_STATES.includes(publicationState)) {
    return populateQueries.publicationState[publicationState];
  }

  return undefined;
};

const createOnFetchPopulateFn = ({ morphAssociations, componentAttributes, definition }) => {
  return function() {
    const populatedPaths = this.getPopulatedPaths();
    const {
      publicationState,
      _populateComponents = true,
      _populateMorphRelations = true,
    } = this.getOptions();

    if (_populateMorphRelations) {
      populateMorphAssociations(this, morphAssociations, publicationState, populatedPaths);
    }

    if (_populateComponents) {
      populateComponentAttributes(this, componentAttributes, publicationState);
    }

    populateComponentRelations(this, definition, publicationState);
  };
};

const setHasOneRelation = (definition, name, attribute) => {
  const ref = getRefModel(attribute.model, attribute.plugin);
  definition.loadedModel[name] = { type: mongoose.Schema.Types.ObjectId, ref };
};

const setHasManyRelation = (definition, name, attribute) => {
  const FK = _.find(definition.associations, { alias: name });
  const ref = getRefModel(attribute.collection, attribute.plugin);

  if (FK) {
    definition.loadedModel[name] = {
      type: 'virtual',
      ref,
      via: FK.via,
      justOne: false,
    };
    attribute.isVirtual = true;
  } else {
    definition.loadedModel[name] = [{ type: mongoose.Schema.Types.ObjectId, ref }];
  }
};

const setBelongsToRelation = (definition, name, attribute) => {
  const FK = _.find(definition.associations, { alias: name });
  const ref = getRefModel(attribute.model, attribute.plugin);

  if (isVirtualForeignKey(FK, FK?.nature)) {
    definition.loadedModel[name] = {
      type: 'virtual',
      ref,
      via: FK.via,
      justOne: true,
    };
    attribute.isVirtual = true;
  } else {
    definition.loadedModel[name] = { type: mongoose.Schema.Types.ObjectId, ref };
  }
};

const setBelongsToManyRelation = (definition, name, attribute, nature) => {
  const ref = getRefModel(attribute.collection, attribute.plugin);

  if (nature === 'manyWay') {
    definition.loadedModel[name] = [{ type: mongoose.Schema.Types.ObjectId, ref }];
    return;
  }

  const FK = _.find(definition.associations, { alias: name });

  if (isBidirectionalRelation(FK, attribute.dominant)) {
    definition.loadedModel[name] = {
      type: 'virtual',
      ref,
      via: FK?.via,
    };
    attribute.isVirtual = true;
  } else {
    definition.loadedModel[name] = [{ type: mongoose.Schema.Types.ObjectId, ref }];
  }
};

const setMorphOneRelation = (definition, name, attribute) => {
  const ref = getRefModel(attribute.model, attribute.plugin);
  definition.loadedModel[name] = { type: mongoose.Schema.Types.ObjectId, ref };
};

const setMorphManyRelation = (definition, name, attribute) => {
  const ref = getRefModel(attribute.collection, attribute.plugin);
  definition.loadedModel[name] = [{ type: mongoose.Schema.Types.ObjectId, ref }];
};

const setBelongsToMorphRelation = (definition, name, attribute) => {
  const { ObjectId } = mongoose.Schema.Types;
  definition.loadedModel[name] = {
    kind: String,
    [attribute.filter]: String,
    ref: { type: ObjectId, refPath: `${name}.kind` },
  };
};

const setBelongsToManyMorphRelation = (definition, name, attribute) => {
  const { ObjectId } = mongoose.Schema.Types;
  definition.loadedModel[name] = [
    {
      kind: String,
      [attribute.filter]: String,
      ref: { type: ObjectId, refPath: `${name}.kind` },
    },
  ];
};

/** @param {string} name - Model name */
const getRefModel = (name, plugin) => {
  return strapi.db.getModel(name, plugin).globalId;
};

const buildRelation = ({ definition, model, instance, attribute, name }) => {
  const { nature, verbose } =
    utilsModels.getNature({
      attribute,
      attributeName: name,
      modelName: model.toLowerCase(),
    }) || {};

  utilsModels.defineAssociations(model.toLowerCase(), definition, attribute, name);

  switch (verbose) {
    case 'hasOne':
      setHasOneRelation(definition, name, attribute);
      break;
    case 'hasMany':
      setHasManyRelation(definition, name, attribute);
      break;
    case 'belongsTo':
      setBelongsToRelation(definition, name, attribute);
      break;
    case 'belongsToMany':
      setBelongsToManyRelation(definition, name, attribute, nature);
      break;
    case 'morphOne':
      setMorphOneRelation(definition, name, attribute);
      break;
    case 'morphMany':
      setMorphManyRelation(definition, name, attribute);
      break;
    case 'belongsToMorph':
      setBelongsToMorphRelation(definition, name, attribute);
      break;
    case 'belongsToManyMorph':
      setBelongsToManyMorphRelation(definition, name, attribute);
      break;
    default:
      break;
  }
};
```