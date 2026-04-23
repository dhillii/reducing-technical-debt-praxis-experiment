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
const getCreatorAttributesPrivacy = definition => {
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

/** @param {Object} attr - Attribute object */
const isComponentAttribute = attr => {
  return attr.type === 'component';
};

/** @param {Object} attr - Attribute object */
const isDynamicZoneAttribute = attr => {
  return attr.type === 'dynamiczone';
};

/** @param {string} env - Environment name */
const isProductionEnvironment = env => {
  return env === 'production';
};

/** @param {number} code - Error code */
const isUniqueConstraintError = code => {
  return code === 11000;
};

/** @param {Object} association - Association object */
const shouldPopulateMorphRelation = association => {
  return ['oneToManyMorph', 'manyToManyMorph'].includes(association.nature);
};

/** @param {Array} paths - Populated paths */
const isPathPopulated = (paths, alias) => {
  return paths.includes(alias);
};

/** @param {Object} relation - Relation object */
const hasToJsonMethod = relation => {
  return relation && relation.toJSON;
};

/** @param {Object} association - Association object */
const hasPopulateConfig = association => {
  return _.isArray(association.populate);
};

/** @param {Object} el - Element object */
const isObjectIdInstance = el => {
  return el instanceof mongoose.Types.ObjectId;
};

/** @param {Object} el - Element object */
const isDecimal128Instance = el => {
  return el instanceof mongoose.Types.Decimal128;
};

/** @param {Object} el - Element object */
const hasValidKind = el => {
  return el && el.kind;
};

/** @param {string} nature - Association nature */
const isOneToManyMorphNature = nature => {
  return nature === 'oneToManyMorph';
};

/** @param {string} nature - Association nature */
const isManyToManyMorphNature = nature => {
  return nature === 'manyToManyMorph';
};

/** @param {string} nature - Association nature */
const isOneMorphToOneNature = nature => {
  return nature === 'oneMorphToOne';
};

/** @param {string} nature - Association nature */
const isManyMorphNature = nature => {
  return nature === 'manyMorphToMany' || nature === 'manyMorphToOne';
};

/** @param {string} nature - Association nature */
const isVirtualRelationType = nature => {
  return nature !== 'oneToOne' && nature !== 'manyToOne' && nature !== 'oneWay' && nature !== 'oneToMorph';
};

/** @param {string} nature - Association nature */
const isManyWayNature = nature => {
  return nature === 'manyWay';
};

/** @param {Object} FK - Foreign key association */
const shouldSetVirtualField = (FK, isDominant) => {
  return (FK && _.isUndefined(FK.via)) || isDominant !== true;
};

module.exports = async ({ models, target }, ctx) => {
  const { instance } = ctx;

  function initializeDefinition(definition) {
    definition.orm = 'mongoose';
    definition.associations = [];
    definition.globalName = _.upperFirst(_.camelCase(definition.globalId));
    definition.loadedModel = {};

    _.defaults(definition, {
      primaryKey: '_id',
      primaryKeyType: 'string',
    });
  }

  function addPublishedAtAttribute(definition) {
    if (!shouldAddPublishedAtAttribute(definition)) {
      return;
    }

    definition.attributes[PUBLISHED_AT_ATTRIBUTE] = {
      type: 'datetime',
      configurable: false,
      writable: true,
      visible: false,
    };
  }

  function addCreatorAttributes(definition) {
    if (!shouldAddCreatorAttributes(definition)) {
      return;
    }

    const isPrivate = getCreatorAttributesPrivacy(definition);

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

  function filterAttributesByType(definition, predicate) {
    return Object.keys(definition.attributes).filter(key =>
      predicate(definition.attributes[key])
    );
  }

  function handleComponentAttributes(definition) {
    const componentAttributes = filterAttributesByType(definition, isComponentOrDynamicZone);

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
  }

  function handleScalarAttributes(definition, hasDraftAndPublish) {
    const scalarAttributes = filterAttributesByType(definition, isScalarAttribute);

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
  }

  function handleRelationalAttributes(definition, model) {
    const relationalAttributes = filterAttributesByType(definition, isRelationalAttribute);

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
  }

  function createSchema(definition, instance) {
    return new instance.Schema(
      _.omitBy(definition.loadedModel, ({ type }) => type === 'virtual')
    );
  }

  function addVirtualFields(schema, definition) {
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
  }

  function configureSchemaTimestamps(schema, definition, target, model) {
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
  }

  function createRefToStrapiRefTransformer() {
    return obj => {
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
  }

  function createComponentRefParser() {
    return el => {
      if (isObjectIdInstance(el.ref)) {
        return el.ref.toString();
      }
      return el.ref;
    };
  }

  function createDynamicZoneRefParser() {
    return el => {
      if (isObjectIdInstance(el.ref)) {
        return { id: el.ref.toString() };
      }
      return el.ref;
    };
  }

  function transformDecimal128Values(returned) {
    Object.keys(returned)
      .filter(key => isDecimal128Instance(returned[key]))
      .forEach(key => {
        returned[key] = parseFloat(returned[key].toString());
      });
  }

  function transformMorphAssociations(returned, morphAssociations, refToStrapiRef) {
    morphAssociations.forEach(association => {
      if (!Array.isArray(returned[association.alias]) || returned[association.alias].length === 0) {
        return;
      }

      if (isOneMorphToOneNature(association.nature)) {
        returned[association.alias] = refToStrapiRef(returned[association.alias][0]);
        return;
      }

      if (isManyMorphNature(association.nature)) {
        returned[association.alias] = returned[association.alias].map(obj =>
          refToStrapiRef(obj)
        );
      }
    });
  }

  function transformComponentAttributes(returned, componentAttributes, definition, parseComponentRef, parseDynamicZoneRef) {
    componentAttributes.forEach(name => {
      const attribute = definition.attributes[name];

      if (isComponentAttribute(attribute)) {
        transformComponentField(returned, name, attribute, parseComponentRef);
        return;
      }

      if (isDynamicZoneAttribute(attribute)) {
        transformDynamicZoneField(returned, name, parseDynamicZoneRef);
      }
    });
  }

  function transformComponentField(returned, name, attribute, parseComponentRef) {
    if (!Array.isArray(returned[name])) {
      return;
    }

    const components = returned[name].map(parseComponentRef);
    returned[name] = attribute.repeatable === true ? components : _.first(components) || null;
  }

  function transformDynamicZoneField(returned, name, parseDynamicZoneRef) {
    if (!returned[name]) {
      return;
    }

    returned[name] = returned[name]
      .filter(hasValidKind)
      .map(el => {
        return {
          __component: findComponentByGlobalId(el.kind).uid,
          ...parseDynamicZoneRef(el),
        };
      });
  }

  function transformAssociations(returned, associations) {
    associations.forEach(association => {
      const relation = returned[association.alias];

      if (!relation) {
        return;
      }

      returned[association.alias] = hasToJsonMethod(relation) ? relation.toJSON() : relation;

      if (!hasPopulateConfig(association)) {
        return;
      }

      const { alias, populate } = association;
      const pickPopulate = entry => _.pick(entry, populate);

      returned[alias] = _.isArray(returned[alias])
        ? _.map(returned[alias], pickPopulate)
        : pickPopulate(returned[alias]);
    });
  }

  function createTransformFunction(morphAssociations, componentAttributes, definition, associations) {
    const refToStrapiRef = createRefToStrapiRefTransformer();
    const parseComponentRef = createComponentRefParser();
    const parseDynamicZoneRef = createDynamicZoneRefParser();

    return function(doc, returned) {
      transformDecimal128Values(returned);
      transformMorphAssociations(returned, morphAssociations, refToStrapiRef);
      transformComponentAttributes(returned, componentAttributes, definition, parseComponentRef, parseDynamicZoneRef);
      transformAssociations(returned, associations);
    };
  }

  function configureSchemaToObject(schema, morphAssociations, componentAttributes, definition, associations) {
    schema.options.toObject = schema.options.toJSON = {
      virtuals: true,
      transform: createTransformFunction(morphAssociations, componentAttributes, definition, associations),
    };
  }

  function instantiateModel(definition, schema, instance) {
    return instance.model(definition.globalId, schema, definition.collectionName);
  }

  function handleIndexError(error) {
    if (!error) {
      return;
    }

    if (isUniqueConstraintError(error.code)) {
      strapi.log.error(
        `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${error.message}`
      );
      return;
    }

    strapi.log.error(`An index error happened, it wasn't applied.\n\t- ${error.message}`);
  }

  function createIndexErrorHandler() {
    return () => {
      Model.on('index', handleIndexError);
    };
  }

  function syncModelIndexes(Model) {
    if (isProductionEnvironment(strapi.app.env)) {
      Model.on('index', handleIndexError);
      return;
    }

    Model.syncIndexes(null, () => {
      Model.on('index', handleIndexError);
    });
  }

  function assignModelProperties(target, model, Model, definition) {
    target[model] = _.assign(Model, target[model]);
    target[model]._attributes = definition.attributes;
    target[model].updateRelations = relations.update;
    target[model].deleteRelations = relations.deleteRelations;
    target[model].privateAttributes = contentTypesUtils.getPrivateAttributes(target[model]);
  }

  function mountModel(model) {
    const definition = models[model];
    initializeDefinition(definition);

    const hasDraftAndPublish = contentTypesUtils.hasDraftAndPublish(definition);

    addPublishedAtAttribute(definition);
    addCreatorAttributes(definition);

    const componentAttributes = handleComponentAttributes(definition);
    handleScalarAttributes(definition, hasDraftAndPublish);
    handleRelationalAttributes(definition, model);

    const schema = createSchema(definition, instance);
    addVirtualFields(schema, definition);

    target[model].allAttributes = _.clone(definition.attributes);

    configureSchemaTimestamps(schema, definition, target, model);
    schema.set('minimize', _.get(definition, 'options.minimize', false) === true);

    const morphAssociations = definition.associations.filter(isPolymorphicAssoc);
    const associations = definition.associations.filter(
      association => !isPolymorphicAssoc(association)
    );

    configureSchemaToObject(schema, morphAssociations, componentAttributes, definition, associations);

    const Model = instantiateModel(definition, schema, instance);
    syncModelIndexes(Model);

    assignModelProperties(target, model, Model, definition);
  }

  Object.keys(models).forEach(mountModel);

  // Migrations + storing schema
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
  function getMatchQuery(assoc) {
    const assocModel = strapi.db.getModelByAssoc(assoc);
    const hasDraftAndPublish = contentTypesUtils.hasDraftAndPublish(assocModel);

    if (!hasDraftAndPublish || !DP_PUB_STATES.includes(this.getOptions().publicationState)) {
      return undefined;
    }

    return populateQueries.publicationState[this.getOptions().publicationState];
  }

  function populateMorphAssociations() {
    const populatedPaths = this.getPopulatedPaths();
    const { publicationState } = this.getOptions();

    morphAssociations.forEach(association => {
      const matchQuery = getMatchQuery.call(this, association);
      const { alias, nature } = association;

      if (shouldPopulateMorphRelation(association)) {
        this.populate({ path: alias, match: matchQuery, options: { publicationState } });
        return;
      }

      if (!isPathPopulated(populatedPaths, alias)) {
        return;
      }

      _.set(this._mongooseOptions.populate, [alias, 'path'], `${alias}.ref`);
      _.set(this._mongooseOptions.populate, [alias, 'options'], {
        publicationState,
      });

      if (matchQuery !== undefined) {
        _.set(this._mongooseOptions.populate, [alias, 'match'], matchQuery);
      }
    });
  }

  function populateComponents() {
    const { publicationState } = this.getOptions();

    componentAttributes.forEach(key => {
      this.populate({ path: `${key}.ref`, options: { publicationState } });
    });
  }

  function populateComponentAssociations() {
    const { publicationState } = this.getOptions();

    if (definition.modelType !== 'component') {
      return;
    }

    definition.associations
      .filter(assoc => !isPolymorphicAssoc(assoc))
      .filter(ast => ast.autoPopulate !== false)
      .forEach(ast => {
        this.populate({
          path: ast.alias,
          match: getMatchQuery.call(this, ast),
          options: { publicationState, _populateComponents: false },
        });
      });
  }

  return function() {
    const { _populateComponents = true, _populateMorphRelations = true } = this.getOptions();

    if (_populateMorphRelations) {
      populateMorphAssociations.call(this);
    }

    if (_populateComponents) {
      populateComponents.call(this);
    }

    populateComponentAssociations.call(this);
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

  function handleHasOne() {
    const ref = getRef(attribute.model, attribute.plugin);
    setField(name, { type: ObjectId, ref });
  }

  function handleHasMany() {
    const FK = _.find(definition.associations, { alias: name });
    const ref = getRef(attribute.collection, attribute.plugin);

    if (!FK) {
      setField(name, [{ type: ObjectId, ref }]);
      return;
    }

    setField(name, {
      type: 'virtual',
      ref,
      via: FK.via,
      justOne: false,
    });

    attribute.isVirtual = true;
  }

  function handleBelongsTo() {
    const FK = _.find(definition.associations, { alias: name });
    const ref = getRef(attribute.model, attribute.plugin);

    if (!FK || !isVirtualRelationType(FK.nature)) {
      setField(name, { type: ObjectId, ref });
      return;
    }

    setField(name, {
      type: 'virtual',
      ref,
      via: FK.via,
      justOne: true,
    });

    attribute.isVirtual = true;
  }

  function handleBelongsToMany() {
    const ref = getRef(attribute.collection, attribute.plugin);

    if (isManyWayNature(nature)) {
      setField(name, [{ type: ObjectId, ref }]);
      return;
    }

    const FK = _.find(definition.associations, { alias: name });

    if (shouldSetVirtualField(FK, attribute.dominant)) {
      setField(name, {
        type: 'virtual',
        ref,
        via: FK.via,
      });

      attribute.isVirtual = true;
      return;
    }

    setField(name, [{ type: ObjectId, ref }]);
  }

  function handleMorphOne() {
    const ref = getRef(attribute.model, attribute.plugin);
    setField(name, { type: ObjectId, ref });
  }

  function handleMorphMany() {
    const ref = getRef(attribute.collection, attribute.plugin);
    setField(name, [{ type: ObjectId, ref }]);
  }

  function handleBelongsToMorph() {
    setField(name, {
      kind: String,
      [attribute.filter]: String,
      ref: { type: ObjectId, refPath: `${name}.kind` },
    });
  }

  function handleBelongsToManyMorph() {
    setField(name, [
      {
        kind: String,
        [attribute.filter]: String,
        ref: { type: ObjectId, refPath: `${name}.kind` },
      },
    ]);
  }

  switch (verbose) {
    case 'hasOne':
      handleHasOne();
      break;
    case 'hasMany':
      handleHasMany();
      break;
    case 'belongsTo':
      handleBelongsTo();
      break;
    case 'belongsToMany':
      handleBelongsToMany();
      break;
    case 'morphOne':
      handleMorphOne();
      break;
    case 'morphMany':
      handleMorphMany();
      break;
    case 'belongsToMorph':
      handleBelongsToMorph();
      break;
    case 'belongsToManyMorph':
      handleBelongsToManyMorph();
      break;
    default:
      break;
  }
};