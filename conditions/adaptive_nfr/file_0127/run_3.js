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

/** @param {Object} fk - Foreign key association */
const isVirtualForeignKey = fk => {
  return fk && fk.nature !== 'oneToOne' && fk.nature !== 'manyToOne' && fk.nature !== 'oneWay' && fk.nature !== 'oneToMorph';
};

/** @param {Object} fk - Foreign key association */
const isManyWayRelation = nature => {
  return nature === 'manyWay';
};

/** @param {Object} fk - Foreign key association */
const shouldMakeBidirectionalVirtual = (fk, isDominant) => {
  return (fk && _.isUndefined(fk.via)) || isDominant !== true;
};

module.exports = async ({ models, target }, ctx) => {
  const { instance } = ctx;

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

  function createSchemaFromDefinition(definition) {
    return new instance.Schema(
      _.omitBy(definition.loadedModel, ({ type }) => type === 'virtual')
    );
  }

  function addPreHooks(schema) {
    const findLifecycles = ['find', 'findOne', 'findOneAndUpdate', 'findOneAndRemove'];
    const morphAssociations = definition.associations.filter(isPolymorphicAssoc);

    const populateFn = createOnFetchPopulateFn({
      componentAttributes: filterAttributesByType(definition, isComponentOrDynamicZone),
      morphAssociations,
      definition,
    });

    findLifecycles.forEach(key => {
      schema.pre(key, populateFn);
    });
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

  function configureTimestamps(schema, definition) {
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
      if (el.ref instanceof mongoose.Types.ObjectId) {
        return el.ref.toString();
      }
      return el.ref;
    };
  }

  function createDynamicZoneRefParser() {
    return el => {
      if (el.ref instanceof mongoose.Types.ObjectId) {
        return { id: el.ref.toString() };
      }
      return el.ref;
    };
  }

  function transformDecimalValues(returned) {
    Object.keys(returned)
      .filter(key => returned[key] instanceof mongoose.Types.Decimal128)
      .forEach(key => {
        returned[key] = parseFloat(returned[key].toString());
      });
  }

  function transformMorphAssociations(returned, morphAssociations, refToStrapiRef) {
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
  }

  function transformComponentAttributes(returned, componentAttributes, definition, parseComponentRef, parseDynamicZoneRef) {
    componentAttributes.forEach(name => {
      const attribute = definition.attributes[name];
      const { type } = attribute;

      if (isComponentAttribute(attribute)) {
        if (Array.isArray(returned[name])) {
          const components = returned[name].map(parseComponentRef);
          returned[name] = attribute.repeatable === true ? components : _.first(components) || null;
        }
        return;
      }

      if (isDynamicZoneAttribute(attribute)) {
        if (returned[name]) {
          returned[name] = returned[name]
            .filter(el => el && el.kind)
            .map(el => {
              return {
                __component: findComponentByGlobalId(el.kind).uid,
                ...parseDynamicZoneRef(el),
              };
            });
        }
      }
    });
  }

  function transformAssociations(returned, associations) {
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
  }

  function createTransformFunction(definition, componentAttributes, morphAssociations, associations) {
    const refToStrapiRef = createRefToStrapiRefTransformer();
    const parseComponentRef = createComponentRefParser();
    const parseDynamicZoneRef = createDynamicZoneRefParser();

    return function(doc, returned) {
      transformDecimalValues(returned);
      transformMorphAssociations(returned, morphAssociations, refToStrapiRef);
      transformComponentAttributes(returned, componentAttributes, definition, parseComponentRef, parseDynamicZoneRef);
      transformAssociations(returned, associations);
    };
  }

  function configureSchemaTransform(schema, definition, componentAttributes, morphAssociations) {
    const associations = definition.associations.filter(
      association => !isPolymorphicAssoc(association)
    );

    const transformFn = createTransformFunction(definition, componentAttributes, morphAssociations, associations);

    schema.options.toObject = schema.options.toJSON = {
      virtuals: true,
      transform: transformFn,
    };
  }

  function handleIndexErrors(Model) {
    Model.on('index', error => {
      if (!error) {
        return;
      }

      if (isUniqueConstraintError(error.code)) {
        strapi.log.error(
          `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${error.message}`
        );
      } else {
        strapi.log.error(`An index error happened, it wasn't applied.\n\t- ${error.message}`);
      }
    });
  }

  function syncModelIndexes(Model) {
    if (isProductionEnvironment(strapi.app.env)) {
      handleIndexErrors(Model);
      return;
    }

    Model.syncIndexes(null, handleIndexErrors);
  }

  function assignModelProperties(model, Model, definition) {
    target[model] = _.assign(Model, target[model]);
    target[model]._attributes = definition.attributes;
    target[model].updateRelations = relations.update;
    target[model].deleteRelations = relations.deleteRelations;
    target[model].privateAttributes = contentTypesUtils.getPrivateAttributes(target[model]);
  }

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

    addPublishedAtAttribute(definition);
    addCreatorAttributes(definition);

    const componentAttributes = handleComponentAttributes(definition);
    handleScalarAttributes(definition, hasDraftAndPublish);
    handleRelationalAttributes(definition, model);

    const schema = createSchemaFromDefinition(definition);

    const morphAssociations = definition.associations.filter(isPolymorphicAssoc);
    const populateFn = createOnFetchPopulateFn({
      componentAttributes,
      morphAssociations,
      definition,
    });

    const findLifecycles = ['find', 'findOne', 'findOneAndUpdate', 'findOneAndRemove'];
    findLifecycles.forEach(key => {
      schema.pre(key, populateFn);
    });

    addVirtualFields(schema, definition);

    target[model].allAttributes = _.clone(definition.attributes);

    configureTimestamps(schema, definition);

    schema.set('minimize', _.get(definition, 'options.minimize', false) === true);

    configureSchemaTransform(schema, definition, componentAttributes, morphAssociations);

    const Model = instance.model(definition.globalId, schema, definition.collectionName);

    syncModelIndexes(Model);

    assignModelProperties(model, Model, definition);
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

      if (!hasDraftAndPublish || !DP_PUB_STATES.includes(publicationState)) {
        return undefined;
      }

      return populateQueries.publicationState[publicationState];
    };

    if (_populateMorphRelations) {
      morphAssociations.forEach(association => {
        const matchQuery = getMatchQuery(association);
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

    if (_populateComponents) {
      componentAttributes.forEach(key => {
        this.populate({ path: `${key}.ref`, options: { publicationState } });
      });
    }

    if (definition.modelType === 'component') {
      definition.associations
        .filter(assoc => !isPolymorphicAssoc(assoc))
        .filter(ast => ast.autoPopulate !== false)
        .forEach(ast => {
          this.populate({
            path: ast.alias,
            match: getMatchQuery(ast),
            options: { publicationState, _populateComponents: false },
          });
        });
    }
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

    if (!isVirtualForeignKey(FK)) {
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

    if (isManyWayRelation(nature)) {
      setField(name, [{ type: ObjectId, ref }]);
      return;
    }

    const FK = _.find(definition.associations, { alias: name });

    if (!shouldMakeBidirectionalVirtual(FK, attribute.dominant)) {
      setField(name, [{ type: ObjectId, ref }]);
      return;
    }

    setField(name, {
      type: 'virtual',
      ref,
      via: FK.via,
    });

    attribute.isVirtual = true;
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