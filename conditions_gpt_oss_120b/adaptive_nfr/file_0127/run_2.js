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

/**
 * Checks if an association is polymorphic.
 * @param {Object} assoc
 * @returns {boolean}
 */
const isPolymorphicAssoc = assoc => {
  return assoc.nature.toLowerCase().indexOf('morph') !== -1;
};

/**
 * Determines if a model is a custom (non‑core) model.
 * @param {Object} definition
 * @returns {boolean}
 */
const isCustomModel = definition => {
  return !definition.uid.startsWith('strapi::') && definition.modelType !== 'component';
};

/**
 * Returns true when the model has draft‑and‑publish enabled.
 * @param {Object} definition
 * @returns {boolean}
 */
const hasDraftAndPublish = definition => {
  return contentTypesUtils.hasDraftAndPublish(definition);
};

/**
 * Returns true when creator fields should be private.
 * @param {Object} definition
 * @returns {boolean}
 */
const isPrivateCreatorFields = definition => {
  return !_.get(definition, 'options.populateCreatorFields', false);
};

/**
 * Retrieves attribute keys of type component or dynamiczone.
 * @param {Object} definition
 * @returns {string[]}
 */
const getComponentAttributes = definition => {
  return Object.keys(definition.attributes).filter(key => {
    const type = definition.attributes[key].type;
    return ['component', 'dynamiczone'].includes(type);
  });
};

/**
 * Retrieves scalar attribute keys (non‑component, non‑dynamiczone).
 * @param {Object} definition
 * @returns {string[]}
 */
const getScalarAttributes = definition => {
  return Object.keys(definition.attributes).filter(key => {
    const { type } = definition.attributes[key];
    return type !== undefined && type !== null && type !== 'component' && type !== 'dynamiczone';
  });
};

/**
 * Retrieves relational attribute keys (type undefined).
 * @param {Object} definition
 * @returns {string[]}
 */
const getRelationalAttributes = definition => {
  return Object.keys(definition.attributes).filter(key => {
    const { type } = definition.attributes[key];
    return type === undefined;
  });
};

/**
 * Adds draft‑and‑publish and creator fields to a custom model definition.
 * @param {Object} definition
 */
const addCreatorAndDraftFields = definition => {
  if (hasDraftAndPublish(definition)) {
    definition.attributes[PUBLISHED_AT_ATTRIBUTE] = {
      type: 'datetime',
      configurable: false,
      writable: true,
      visible: false,
    };
  }

  const privateFlag = isPrivateCreatorFields(definition);

  definition.attributes[CREATED_BY_ATTRIBUTE] = {
    model: 'user',
    plugin: 'admin',
    configurable: false,
    writable: false,
    visible: false,
    private: privateFlag,
  };

  definition.attributes[UPDATED_BY_ATTRIBUTE] = {
    model: 'user',
    plugin: 'admin',
    configurable: false,
    writable: false,
    visible: false,
    private: privateFlag,
  };
};

/**
 * Handles component attribute schema creation.
 * @param {Object} definition
 * @param {string[]} componentAttributes
 */
const handleComponentAttributes = (definition, componentAttributes) => {
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

/**
 * Handles scalar attribute schema creation.
 * @param {Object} definition
 * @param {string} name
 * @param {boolean} hasDraftAndPublishFlag
 */
const handleScalarAttribute = (definition, name, hasDraftAndPublishFlag) => {
  const attr = definition.attributes[name];
  definition.loadedModel[name] = {
    ...attr,
    ...utils(instance).convertType(name, attr),
    required:
      definition.modelType === 'compo' || hasDraftAndPublishFlag ? false : definition.required,
  };
};

/**
 * Creates a Mongoose schema from the loaded model definition.
 * @param {Object} instance
 * @param {Object} definition
 * @returns {mongoose.Schema}
 */
const createSchema = (instance, definition) => {
  return new instance.Schema(
    _.omitBy(definition.loadedModel, ({ type }) => type === 'virtual')
  );
};

/**
 * Configures populate middleware for polymorphic and component relations.
 * @param {mongoose.Schema} schema
 * @param {Object} definition
 * @param {string[]} componentAttributes
 * @param {Object[]} morphAssociations
 */
const configurePopulate = (schema, definition, componentAttributes, morphAssociations) => {
  const populateFn = createOnFetchPopulateFn({
    componentAttributes,
    morphAssociations,
    definition,
  });

  ['find', 'findOne', 'findOneAndUpdate', 'findOneAndRemove'].forEach(key => {
    schema.pre(key, populateFn);
  });
};

/**
 * Adds virtual fields for reverse population.
 * @param {mongoose.Schema} schema
 * @param {Object} definition
 */
const configureVirtuals = (schema, definition) => {
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

/**
 * Configures timestamps on the schema and target model.
 * @param {mongoose.Schema} schema
 * @param {Object} definition
 * @param {Object} target
 * @param {string} modelKey
 */
const configureTimestamps = (schema, definition, target, modelKey) => {
  const createAtCol = _.get(definition, 'options.timestamps.0', 'createdAt');
  const updatedAtCol = _.get(definition, 'options.timestamps.1', 'updatedAt');

  if (_.get(definition, 'options.timestamps', false)) {
    _.set(definition, 'options.timestamps', [createAtCol, updatedAtCol]);

    _.assign(target[modelKey].allAttributes, {
      [createAtCol]: { type: 'timestamp' },
      [updatedAtCol]: { type: 'timestamp' },
    });

    schema.set('timestamps', { createdAt: createAtCol, updatedAt: updatedAtCol });
  } else {
    _.set(definition, 'options.timestamps', false);
  }
};

/**
 * Configures the minimize option on the schema.
 * @param {mongoose.Schema} schema
 * @param {Object} definition
 */
const configureMinimize = (schema, definition) => {
  const minimize = _.get(definition, 'options.minimize', false) === true;
  schema.set('minimize', minimize);
};

/**
 * Transforms documents before they are returned.
 * @param {mongoose.Schema} schema
 * @param {Object} definition
 * @param {string[]} componentAttributes
 * @param {Object[]} morphAssociations
 * @param {Object[]} associations
 */
const configureTransform = (schema, definition, componentAttributes, morphAssociations, associations) => {
  const refToStrapiRef = obj => {
    const ref = obj.ref;
    const plainData = ref && typeof ref.toJSON === 'function' ? ref.toJSON() : ref;
    if (typeof plainData !== 'object') return ref;
    return { __contentType: obj.kind, ...ref };
  };

  const parseComponentRef = el => {
    return el.ref instanceof mongoose.Types.ObjectId ? el.ref.toString() : el.ref;
  };

  const parseDynamicZoneRef = el => {
    return el.ref instanceof mongoose.Types.ObjectId ? { id: el.ref.toString() } : el.ref;
  };

  schema.options.toObject = schema.options.toJSON = {
    virtuals: true,
    transform: function (doc, returned) {
      // Remove Decimal128 nested property.
      Object.keys(returned)
        .filter(key => returned[key] instanceof mongoose.Types.Decimal128)
        .forEach(key => {
          returned[key] = parseFloat(returned[key].toString());
        });

      morphAssociations.forEach(association => {
        const aliasData = returned[association.alias];
        if (!Array.isArray(aliasData) || aliasData.length === 0) return;

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
      });

      componentAttributes.forEach(name => {
        const attribute = definition.attributes[name];
        const { type } = attribute;

        if (type === 'component' && Array.isArray(returned[name])) {
          const components = returned[name].map(parseComponentRef);
          returned[name] = attribute.repeatable === true ? components : _.first(components) || null;
        }

        if (type === 'dynamiczone' && returned[name]) {
          returned[name] = returned[name]
            .filter(el => el && el.kind)
            .map(el => ({
              __component: findComponentByGlobalId(el.kind).uid,
              ...parseDynamicZoneRef(el),
            }));
        }
      });

      associations.forEach(association => {
        const relation = returned[association.alias];
        if (!relation) return;

        returned[association.alias] = relation.toJSON ? relation.toJSON() : relation;

        if (_.isArray(association.populate)) {
          const { alias, populate } = association;
          const pickPopulate = entry => _.pick(entry, populate);
          returned[alias] = _.isArray(returned[alias])
            ? _.map(returned[alias], pickPopulate)
            : pickPopulate(returned[alias]);
        }
      });
    },
  };
};

/**
 * Instantiates the Mongoose model and syncs indexes.
 * @param {Object} definition
 * @param {mongoose.Schema} schema
 * @returns {mongoose.Model}
 */
const instantiateModel = (definition, schema) => {
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

  return Model;
};

/**
 * Finalizes the model by exposing ORM functions and attributes.
 * @param {Object} target
 * @param {string} modelKey
 * @param {mongoose.Model} Model
 * @param {Object} definition
 */
const finalizeModel = (target, modelKey, Model, definition) => {
  target[modelKey] = _.assign(Model, target[modelKey]);
  target[modelKey]._attributes = definition.attributes;
  target[modelKey].updateRelations = relations.update;
  target[modelKey].deleteRelations = relations.deleteRelations;
  target[modelKey].privateAttributes = contentTypesUtils.getPrivateAttributes(target[modelKey]);
};

/**
 * Main exported function.
 * @param {{ models: Object, target: Object }} param0
 * @param {Object} ctx
 */
module.exports = async ({ models, target }, ctx) => {
  const { instance } = ctx;

  /**
   * Mounts a single model.
   * @param {string} model
   */
  const mountModel = model => {
    const definition = models[model];
    definition.orm = 'mongoose';
    definition.associations = [];
    definition.globalName = _.upperFirst(_.camelCase(definition.globalId));
    definition.loadedModel = {};

    _.defaults(definition, {
      primaryKey: '_id',
      primaryKeyType: 'string',
    });

    if (isCustomModel(definition)) {
      addCreatorAndDraftFields(definition);
    }

    const componentAttributes = getComponentAttributes(definition);
    const scalarAttributes = getScalarAttributes(definition);
    const relationalAttributes = getRelationalAttributes(definition);
    const hasDraftAndPublishFlag = hasDraftAndPublish(definition);

    if (componentAttributes.length) {
      handleComponentAttributes(definition, componentAttributes);
    }

    scalarAttributes.forEach(name => {
      handleScalarAttribute(definition, name, hasDraftAndPublishFlag);
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

    const schema = createSchema(instance, definition);
    const morphAssociations = definition.associations.filter(isPolymorphicAssoc);
    const nonPolymorphicAssociations = definition.associations.filter(
      assoc => !isPolymorphicAssoc(assoc)
    );

    configurePopulate(schema, definition, componentAttributes, morphAssociations);
    configureVirtuals(schema, definition);
    configureTimestamps(schema, definition, target, model);
    configureMinimize(schema, definition);
    configureTransform(schema, definition, componentAttributes, morphAssociations, nonPolymorphicAssociations);

    const Model = instantiateModel(definition, schema);
    finalizeModel(target, model, Model, definition);
  };

  // Instantiate every model
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

// noop migration to match migration API
const migrateSchema = () => {};

/**
 * Creates a populate function for fetch operations.
 * @param {{ morphAssociations: Object[], componentAttributes: string[], definition: Object }} param0
 * @returns {Function}
 */
const createOnFetchPopulateFn = ({ morphAssociations, componentAttributes, definition }) => {
  /**
   * Determines the match query for a given association based on publication state.
   * @param {Object} assoc
   * @returns {Object|undefined}
   */
  const getMatchQuery = assoc => {
    const assocModel = strapi.db.getModelByAssoc(assoc);
    const hasDP = contentTypesUtils.hasDraftAndPublish(assocModel);
    if (hasDP && DP_PUB_STATES.includes(publicationState)) {
      return populateQueries.publicationState[publicationState];
    }
    return undefined;
  };

  return function () {
    const populatedPaths = this.getPopulatedPaths();
    const {
      publicationState,
      _populateComponents = true,
      _populateMorphRelations = true,
    } = this.getOptions();

    if (_populateMorphRelations) {
      morphAssociations.forEach(association => {
        const matchQuery = getMatchQuery(association);
        const { alias, nature } = association;

        if (['oneToManyMorph', 'manyToManyMorph'].includes(nature)) {
          this.populate({ path: alias, match: matchQuery, options: { publicationState } });
          return;
        }

        if (!populatedPaths.includes(alias)) return;

        _.set(this._mongooseOptions.populate, [alias, 'path'], `${alias}.ref`);
        _.set(this._mongooseOptions.populate, [alias, 'options'], { publicationState });

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

/**
 * Builds a relation for a given attribute.
 * @param {{ definition: Object, model: string, instance: Object, attribute: Object, name: string }} param0
 */
const buildRelation = ({ definition, model, instance, attribute, name }) => {
  const { nature, verbose } =
    utilsModels.getNature({
      attribute,
      attributeName: name,
      modelName: model.toLowerCase(),
    }) || {};

  utilsModels.defineAssociations(model.toLowerCase(), definition, attribute, name);

  const getRef = (modelName, plugin) => {
    return strapi.db.getModel(modelName, plugin).globalId;
  };

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
      break;
  }
};