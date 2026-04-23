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
const isStrapiInternalModel = uid => {
  return uid.startsWith('strapi::');
};

/** @param {string} modelType - Model type */
const isComponentModel = modelType => {
  return modelType === 'component';
};

/** @param {Object} definition - Model definition */
const shouldAddPublishedAtAttribute = definition => {
  return contentTypesUtils.hasDraftAndPublish(definition);
};

/** @param {Object} definition - Model definition */
const shouldAddCreatorAttributes = definition => {
  return !isStrapiInternalModel(definition.uid) && !isComponentModel(definition.modelType);
};

/** @param {Object} definition - Model definition */
const getIsPrivateCreatorFields = definition => {
  return !_.get(definition, 'options.populateCreatorFields', false);
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

/** @param {Object} definition - Model definition */
const isComponentModelType = definition => {
  return definition.modelType === 'compo';
};

/** @param {Object} definition - Model definition */
const hasDraftAndPublishEnabled = definition => {
  return contentTypesUtils.hasDraftAndPublish(definition);
};

/** @param {Object} definition - Model definition */
const shouldRequireAttribute = (definition, hasDraftAndPublish) => {
  return !isComponentModelType(definition) && !hasDraftAndPublish;
};

/** @param {Object} assocModel - Association model */
const hasDraftAndPublishModel = assocModel => {
  return contentTypesUtils.hasDraftAndPublish(assocModel);
};

/** @param {string} publicationState - Publication state */
const isValidPublicationState = publicationState => {
  return DP_PUB_STATES.includes(publicationState);
};

/** @param {Object} association - Association object */
const isMorphRelationType = association => {
  return ['oneToManyMorph', 'manyToManyMorph'].includes(association.nature);
};

/** @param {Object} association - Association object */
const isAutoPopulateAssociation = association => {
  return association.autoPopulate !== false;
};

/** @param {Object} association - Association object */
const isNonPolymorphicAssociation = association => {
  return !isPolymorphicAssoc(association);
};

/** @param {Object} FK - Foreign key association */
const isVirtualRelation = FK => {
  return FK && FK.nature !== 'oneToOne' && FK.nature !== 'manyToOne' && FK.nature !== 'oneWay' && FK.nature !== 'oneToMorph';
};

/** @param {Object} FK - Foreign key association */
const isManyWayRelation = (FK, nature) => {
  return nature === 'manyWay';
};

/** @param {Object} FK - Foreign key association */
const shouldSetVirtualField = (FK, dominant) => {
  return (FK && _.isUndefined(FK.via)) || dominant !== true;
};

const addPublishedAtAttribute = definition => {
  definition.attributes[PUBLISHED_AT_ATTRIBUTE] = {
    type: 'datetime',
    configurable: false,
    writable: true,
    visible: false,
  };
};

const addCreatorAttributes = (definition, isPrivate) => {
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

const addSystemAttributes = definition => {
  if (!shouldAddCreatorAttributes(definition)) {
    return;
  }

  if (shouldAddPublishedAtAttribute(definition)) {
    addPublishedAtAttribute(definition);
  }

  const isPrivate = getIsPrivateCreatorFields(definition);
  addCreatorAttributes(definition, isPrivate);
};

const filterComponentAttributes = definition => {
  return Object.keys(definition.attributes).filter(key =>
    isComponentOrDynamicZone(definition.attributes[key])
  );
};

const filterScalarAttributes = definition => {
  return Object.keys(definition.attributes).filter(key =>
    isScalarAttribute(definition.attributes[key])
  );
};

const filterRelationalAttributes = definition => {
  return Object.keys(definition.attributes).filter(key =>
    isRelationalAttribute(definition.attributes[key])
  );
};

const processComponentAttributes = (definition, componentAttributes) => {
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

const processScalarAttributes = (definition, scalarAttributes, instance, hasDraftAndPublish) => {
  scalarAttributes.forEach(name => {
    const attr = definition.attributes[name];
    const required = shouldRequireAttribute(definition, hasDraftAndPublish) ? definition.required : false;

    definition.loadedModel[name] = {
      ...attr,
      ...utils(instance).convertType(name, attr),
      required,
    };
  });
};

const processRelationalAttributes = (definition, model, instance, relationalAttributes) => {
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

const addVirtualFields = (schema, definition) => {
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

const addPreHooks = (schema, populateFn) => {
  const findLifecycles = ['find', 'findOne', 'findOneAndUpdate', 'findOneAndRemove'];
  findLifecycles.forEach(key => {
    schema.pre(key, populateFn);
  });
};

const configureTimestamps = (definition, schema, target, model) => {
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

const processMorphAssociations = (returned, morphAssociations) => {
  morphAssociations.forEach(association => {
    if (!Array.isArray(returned[association.alias]) || returned[association.alias].length === 0) {
      return;
    }

    switch (association.nature) {
      case 'oneMorphToOne':
        returned[association.alias] = refToStrapiRef(returned[association.alias][0]);
        break;

      case 'manyMorphToMany':
      case 'manyMorphToOne':
        returned[association.alias] = returned[association.alias].map(obj =>
          refToStrapiRef(obj)
        );
        break;
      default:
    }
  });
};

const processComponentAttributesTransform = (returned, componentAttributes, definition) => {
  componentAttributes.forEach(name => {
    const attribute = definition.attributes[name];
    const { type } = attribute;

    if (type === 'component') {
      processComponentType(returned, name, attribute);
    }

    if (type === 'dynamiczone') {
      processDynamicZoneType(returned, name);
    }
  });
};

const processComponentType = (returned, name, attribute) => {
  if (!Array.isArray(returned[name])) {
    return;
  }

  const components = returned[name].map(parseComponentRef);
  returned[name] = attribute.repeatable === true ? components : _.first(components) || null;
};

const processDynamicZoneType = (returned, name) => {
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

const processAssociationsTransform = (returned, associations) => {
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

const processDecimalFields = returned => {
  Object.keys(returned)
    .filter(key => returned[key] instanceof mongoose.Types.Decimal128)
    .forEach(key => {
      returned[key] = parseFloat(returned[key].toString());
    });
};

const configureSchemaTransform = (schema, definition, morphAssociations, componentAttributes, associations) => {
  schema.options.toObject = schema.options.toJSON = {
    virtuals: true,
    transform: function(doc, returned) {
      processDecimalFields(returned);
      processMorphAssociations(returned, morphAssociations);
      processComponentAttributesTransform(returned, componentAttributes, definition);
      processAssociationsTransform(returned, associations);
    },
  };
};

const handleIndexesErrors = Model => {
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

const syncModelIndexes = Model => {
  if (strapi.app.env !== 'production') {
    Model.syncIndexes(null, () => handleIndexesErrors(Model));
  } else {
    handleIndexesErrors(Model);
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
    const hasDraftAndPublish = hasDraftAndPublishEnabled(definition);

    initializeDefinition(definition);
    addSystemAttributes(definition);

    const componentAttributes = filterComponentAttributes(definition);
    const scalarAttributes = filterScalarAttributes(definition);
    const relationalAttributes = filterRelationalAttributes(definition);

    processComponentAttributes(definition, componentAttributes);
    processScalarAttributes(definition, scalarAttributes, instance, hasDraftAndPublish);
    processRelationalAttributes(definition, model, instance, relationalAttributes);

    const schema = createSchema(instance, definition);
    addVirtualFields(schema, definition);

    const morphAssociations = definition.associations.filter(isPolymorphicAssoc);
    const populateFn = createOnFetchPopulateFn({
      componentAttributes,
      morphAssociations,
      definition,
    });

    addPreHooks(schema, populateFn);

    target[model].allAttributes = _.clone(definition.attributes);
    configureTimestamps(definition, schema, target, model);

    schema.set('minimize', _.get(definition, 'options.minimize', false) === true);

    const associations = definition.associations.filter(isNonPolymorphicAssociation);
    configureSchemaTransform(schema, definition, morphAssociations, componentAttributes, associations);

    const Model = instance.model(definition.globalId, schema, definition.collectionName);
    syncModelIndexes(Model);
    exposeOrmFunctions(target, model, Model, definition);
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

const getMatchQuery = (assoc, publicationState) => {
  const assocModel = strapi.db.getModelByAssoc(assoc);

  if (!hasDraftAndPublishModel(assocModel)) {
    return undefined;
  }

  if (!isValidPublicationState(publicationState)) {
    return undefined;
  }

  return populateQueries.publicationState[publicationState];
};

const populateMorphRelations = (morphAssociations, publicationState, populatedPaths) => {
  return function(association) {
    const matchQuery = getMatchQuery(association, publicationState);
    const { alias, nature } = association;

    if (isMorphRelationType(association)) {
      this.populate({ path: alias, match: matchQuery, options: { publicationState } });
      return;
    }

    if (!populatedPaths.includes(alias)) {
      return;
    }

    _.set(this._mongooseOptions.populate, [alias, 'path'], `${alias}.ref`);
    _.set(this._mongooseOptions.populate, [alias, 'options'], {
      publicationState,
    });

    if (matchQuery !== undefined) {
      _.set(this._mongooseOptions.populate, [alias, 'match'], matchQuery);
    }
  };
};

const populateComponentAttributes = (componentAttributes, publicationState) => {
  return function(key) {
    this.populate({ path: `${key}.ref`, options: { publicationState } });
  };
};

const populateComponentAssociations = (definition, publicationState) => {
  return function(ast) {
    this.populate({
      path: ast.alias,
      match: getMatchQuery(ast, publicationState),
      options: { publicationState, _populateComponents: false },
    });
  };
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
      morphAssociations.forEach(populateMorphRelations.call(this, morphAssociations, publicationState, populatedPaths));
    }

    if (_populateComponents) {
      componentAttributes.forEach(populateComponentAttributes.call(this, componentAttributes, publicationState));
    }

    if (!isComponentModel(definition.modelType)) {
      return;
    }

    definition.associations
      .filter(isNonPolymorphicAssociation)
      .filter(isAutoPopulateAssociation)
      .forEach(populateComponentAssociations.call(this, definition, publicationState));
  };
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

  switch (verbose) {
    case 'hasOne':
      buildHasOneRelation(attribute, getRef, setField, name);
      break;
    case 'hasMany':
      buildHasManyRelation(definition, attribute, getRef, setField, name);
      break;
    case 'belongsTo':
      buildBelongsToRelation(definition, attribute, getRef, setField, name);
      break;
    case 'belongsToMany':
      buildBelongsToManyRelation(definition, nature, attribute, getRef, setField, name);
      break;
    case 'morphOne':
      buildMorphOneRelation(attribute, getRef, setField, name);
      break;
    case 'morphMany':
      buildMorphManyRelation(attribute, getRef, setField, name);
      break;
    case 'belongsToMorph':
      buildBelongsToMorphRelation(attribute, setField, name);
      break;
    case 'belongsToManyMorph':
      buildBelongsToManyMorphRelation(attribute, setField, name);
      break;
    default:
      break;
  }
};

const buildHasOneRelation = (attribute, getRef, setField, name) => {
  const ref = getRef(attribute.model, attribute.plugin);
  setField(name, { type: mongoose.Schema.Types.ObjectId, ref });
};

const buildHasManyRelation = (definition, attribute, getRef, setField, name) => {
  const FK = _.find(definition.associations, { alias: name });
  const ref = getRef(attribute.collection, attribute.plugin);

  if (!FK) {
    setField(name, [{ type: mongoose.Schema.Types.ObjectId, ref }]);
    return;
  }

  setField(name, {
    type: 'virtual',
    ref,
    via: FK.via,
    justOne: false,
  });

  attribute.isVirtual = true;
};

const buildBelongsToRelation = (definition, attribute, getRef, setField, name) => {
  const FK = _.find(definition.associations, { alias: name });
  const ref = getRef(attribute.model, attribute.plugin);

  if (!FK || !isVirtualRelation(FK)) {
    setField(name, { type: mongoose.Schema.Types.ObjectId, ref });
    return;
  }

  setField(name, {
    type: 'virtual',
    ref,
    via: FK.via,
    justOne: true,
  });

  attribute.isVirtual = true;
};

const buildBelongsToManyRelation = (definition, nature, attribute, getRef, setField, name) => {
  const ref = getRef(attribute.collection, attribute.plugin);

  if (isManyWayRelation(null, nature)) {
    setField(name, [{ type: mongoose.Schema.Types.ObjectId, ref }]);
    return;
  }

  const FK = _.find(definition.associations, { alias: name });

  if (!shouldSetVirtualField(FK, attribute.dominant)) {
    setField(name, [{ type: mongoose.Schema.Types.ObjectId, ref }]);
    return;
  }

  setField(name, {
    type: 'virtual',
    ref,
    via: FK.via,
  });

  attribute.isVirtual = true;
};

const buildMorphOneRelation = (attribute, getRef, setField, name) => {
  const ref = getRef(attribute.model, attribute.plugin);
  setField(name, { type: mongoose.Schema.Types.ObjectId, ref });
};

const buildMorphManyRelation = (attribute, getRef, setField, name) => {
  const ref = getRef(attribute.collection, attribute.plugin);
  setField(name, [{ type: mongoose.Schema.Types.ObjectId, ref }]);
};

const buildBelongsToMorphRelation = (attribute, setField, name) => {
  setField(name, {
    kind: String,
    [attribute.filter]: String,
    ref: { type: mongoose.Schema.Types.ObjectId, refPath: `${name}.kind` },
  });
};

const buildBelongsToManyMorphRelation = (attribute, setField, name) => {
  setField(name, [
    {
      kind: String,
      [attribute.filter]: String,
      ref: { type: mongoose.Schema.Types.ObjectId, refPath: `${name}.kind` },
    },
  ]);
};