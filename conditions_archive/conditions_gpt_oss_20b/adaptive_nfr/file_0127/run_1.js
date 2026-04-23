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
 * Checks if a definition has Draft & Publish enabled.
 * @param {Object} definition
 * @returns {boolean}
 */
const hasDraftAndPublish = definition => {
  return contentTypesUtils.hasDraftAndPublish(definition);
};

/**
 * Checks if an attribute is a component or dynamic zone.
 * @param {Object} attr
 * @returns {boolean}
 */
const isComponentAttr = attr => {
  return ['component', 'dynamiczone'].includes(attr.type);
};

/**
 * Checks if an attribute is scalar.
 * @param {Object} attr
 * @returns {boolean}
 */
const isScalarAttr = attr => {
  const { type } = attr;
  return type !== undefined && type !== null && type !== 'component' && type !== 'dynamiczone';
};

/**
 * Checks if an attribute is relational (no type defined).
 * @param {Object} attr
 * @returns {boolean}
 */
const isRelationalAttr = attr => {
  return attr.type === undefined;
};

/**
 * Checks if a definition is private.
 * @param {Object} definition
 * @returns {boolean}
 */
const isPrivate = definition => {
  return !_.get(definition, 'options.populateCreatorFields', false);
};

/**
 * Sets default values for a definition.
 * @param {Object} definition
 */
const setDefaults = definition => {
  _.defaults(definition, {
    primaryKey: '_id',
    primaryKeyType: 'string',
  });
};

/**
 * Initializes definition properties.
 * @param {Object} definition
 * @param {string} model
 */
const initDefinition = (definition, model) => {
  definition.orm = 'mongoose';
  definition.associations = [];
  definition.globalName = _.upperFirst(_.camelCase(definition.globalId));
  definition.loadedModel = {};
};

/**
 * Handles component and dynamic zone attributes.
 * @param {Object} definition
 */
const handleComponentAttributes = definition => {
  const componentAttributes = Object.keys(definition.attributes).filter(key =>
    isComponentAttr(definition.attributes[key])
  );

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

/**
 * Handles scalar attributes.
 * @param {Object} definition
 * @param {boolean} hasDraft
 */
const handleScalarAttributes = (definition, hasDraft) => {
  const scalarAttributes = Object.keys(definition.attributes).filter(key =>
    isScalarAttr(definition.attributes[key])
  );

  scalarAttributes.forEach(name => {
    const attr = definition.attributes[name];
    definition.loadedModel[name] = {
      ...attr,
      ...utils(instance).convertType(name, attr),
      required:
        definition.modelType === 'compo' || hasDraft ? false : definition.required,
    };
  });

  return scalarAttributes;
};

/**
 * Handles relational attributes.
 * @param {Object} definition
 * @param {string} model
 * @param {Object} instance
 */
const handleRelationalAttributes = (definition, model, instance) => {
  const relationalAttributes = Object.keys(definition.attributes).filter(key =>
    isRelationalAttr(definition.attributes[key])
  );

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

/**
 * Creates a Mongoose schema from a definition.
 * @param {Object} definition
 * @returns {mongoose.Schema}
 */
const createSchema = definition => {
  return new instance.Schema(
    _.omitBy(definition.loadedModel, ({ type }) => type === 'virtual')
  );
};

/**
 * Attaches pre hooks for populate.
 * @param {mongoose.Schema} schema
 * @param {Function} populateFn
 */
const attachPopulate = (schema, populateFn) => {
  const findLifecycles = ['find', 'findOne', 'findOneAndUpdate', 'findOneAndRemove'];
  findLifecycles.forEach(key => {
    schema.pre(key, populateFn);
  });
};

/**
 * Attaches virtual fields to the schema.
 * @param {mongoose.Schema} schema
 * @param {Object} definition
 */
const attachVirtuals = (schema, definition) => {
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
 * Configures timestamps on the schema.
 * @param {mongoose.Schema} schema
 * @param {Object} definition
 */
const configureTimestamps = (schema, definition) => {
  const createAtCol = _.get(definition, 'options.timestamps.0', 'createdAt');
  const updatedAtCol = _.get(definition, 'options.timestamps.1', 'updatedAt');

  if (_.get(definition, 'options.timestamps', false)) {
    _.set(definition, 'options.timestamps', [createAtCol, updatedAtCol]);

    _.assign(definition.allAttributes, {
      [createAtCol]: { type: 'timestamp' },
      [updatedAtCol]: { type: 'timestamp' },
    });

    schema.set('timestamps', { createdAt: createAtCol, updatedAt: updatedAtCol });
  } else {
    _.set(definition, 'options.timestamps', false);
  }

  schema.set('minimize', _.get(definition, 'options.minimize', false) === true);
};

/**
 * Configures the toObject transform for the schema.
 * @param {mongoose.Schema} schema
 * @param {Object} definition
 * @param {Array<string>} componentAttributes
 * @param {Array<Object>} morphAssociations
 */
const configureTransform = (schema, definition, componentAttributes, morphAssociations) => {
  const associations = definition.associations.filter(
    association => !isPolymorphicAssoc(association)
  );

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
    return el.ref instanceof mongoose.Types.ObjectId ? el.ref.toString() : el.ref;
  };

  const parseDynamicZoneRef = el => {
    return el.ref instanceof mongoose.Types.ObjectId
      ? { id: el.ref.toString() }
      : el.ref;
  };

  schema.options.toObject = schema.options.toJSON = {
    virtuals: true,
    transform: function(doc, returned) {
      // Remove $numberDecimal nested property.
      Object.keys(returned)
        .filter(key => returned[key] instanceof mongoose.Types.Decimal128)
        .forEach(key => {
          returned[key] = parseFloat(returned[key].toString());
        });

      morphAssociations.forEach(association => {
        if (
          Array.isArray(returned[association.alias]) &&
          returned[association.alias].length > 0
        ) {
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
        }
      });

      componentAttributes.forEach(name => {
        const attribute = definition.attributes[name];
        const { type } = attribute;

        if (type === 'component') {
          if (Array.isArray(returned[name])) {
            const components = returned[name].map(parseComponentRef);
            returned[name] =
              attribute.repeatable === true ? components : _.first(components) || null;
          }
        }

        if (type === 'dynamiczone') {
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

      associations.forEach(association => {
        const relation = returned[association.alias];
        if (relation) {
          returned[association.alias] = relation.toJSON ? relation.toJSON() : relation;
          if (_.isArray(association.populate)) {
            const { alias, populate } = association;
            const pickPopulate = entry => _.pick(entry, populate);
            returned[alias] = _.isArray(returned[alias])
              ? _.map(returned[alias], pickPopulate)
              : pickPopulate(returned[alias]);
          }
        }
      });
    },
  };
};

/**
 * Handles index errors for a model.
 * @param {mongoose.Model} Model
 */
const handleIndexes = Model => {
  const handleIndexesErrors = () => {
    Model.on('index', error => {
      if (error) {
        if (error.code === 11000) {
          strapi.log.error(
            `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${error.message}`
          );
        } else {
          strapi.log.error(`An index error happened, it wasn't applied.\n\t- ${error.message}`);
        }
      }
    });
  };

  if (strapi.app.env !== 'production') {
    Model.syncIndexes(null, handleIndexesErrors);
  } else {
    handleIndexesErrors();
  }
};

/**
 * Exposes ORM functions through the target object.
 * @param {Object} target
 * @param {string} model
 * @param {mongoose.Model} Model
 */
const exposeORM = (target, model, Model) => {
  target[model] = _.assign(Model, target[model]);
};

/**
 * Pushes attributes and relation helpers to the target model.
 * @param {Object} target
 * @param {string} model
 * @param {Object} definition
 */
const pushAttributes = (target, model, definition) => {
  target[model]._attributes = definition.attributes;
  target[model].updateRelations = relations.update;
  target[model].deleteRelations = relations.deleteRelations;
  target[model].privateAttributes = contentTypesUtils.getPrivateAttributes(target[model]);
};

/**
 * Main mount function for a single model.
 * @param {string} model
 */
const mountModel = model => {
  const definition = models[model];
  const hasDraft = hasDraftAndPublish(definition);

  setDefaults(definition);
  initDefinition(definition, model);

  // Set draft & publish attributes if needed
  if (!definition.uid.startsWith('strapi::') && definition.modelType !== 'component') {
    if (hasDraft) {
      definition.attributes[PUBLISHED_AT_ATTRIBUTE] = {
        type: 'datetime',
        configurable: false,
        writable: true,
        visible: false,
      };
    }

    const privateFlag = isPrivate(definition);

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
  }

  const componentAttributes = handleComponentAttributes(definition);
  handleScalarAttributes(definition, hasDraft);
  handleRelationalAttributes(definition, model, instance);

  const schema = createSchema(definition);

  const morphAssociations = definition.associations.filter(isPolymorphicAssoc);

  const populateFn = createOnFetchPopulateFn({
    componentAttributes,
    morphAssociations,
    definition,
  });

  attachPopulate(schema, populateFn);
  attachVirtuals(schema, definition);
  configureTimestamps(schema, definition);
  configureTransform(schema, definition, componentAttributes, morphAssociations);

  const Model = instance.model(definition.globalId, schema, definition.collectionName);

  handleIndexes(Model);
  exposeORM(target, model, Model);
  pushAttributes(target, model, definition);
};

module.exports = async ({ models, target }, ctx) => {
  const { instance } = ctx;

  // Instantiate every model
  Object.keys(models).forEach(mountModel);

  // Migrations + storing schema
  for (const model of Object.keys(models)) {
    const definition = models[model];
    const modelInstance = target[model];
    const definitionDidChange = await didDefinitionChange(definition, instance);

    const previousDefinition = await getDefinitionFromStore(definition, instance);

    // run migrations
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
 * @param {Object} params
 * @param {Array<string>} params.componentAttributes
 * @param {Array<Object>} params.morphAssociations
 * @param {Object} params.definition
 * @returns {Function}
 */
const createOnFetchPopulateFn = ({ morphAssociations, componentAttributes, definition }) => {
  /**
   * Returns a match query for a given association.
   * @param {Object} assoc
   * @returns {Object|undefined}
   */
  const getMatchQuery = assoc => {
    const assocModel = strapi.db.getModelByAssoc(assoc);
    const hasDraft = contentTypesUtils.hasDraftAndPublish(assocModel);
    if (hasDraft && DP_PUB_STATES.includes(publicationState)) {
      return populateQueries.publicationState[publicationState];
    }
    return undefined;
  };

  /**
   * Populates polymorphic associations.
   * @param {Object} this
   */
  const populateMorphAssociations = function() {
    morphAssociations.forEach(association => {
      const matchQuery = getMatchQuery(association);
      const { alias, nature } = association;

      if (['oneToManyMorph', 'manyToManyMorph'].includes(nature)) {
        this.populate({ path: alias, match: matchQuery, options: { publicationState } });
      } else if (populatedPaths.includes(alias)) {
        _.set(this._mongooseOptions.populate, [alias, 'path'], `${alias}.ref`);
        _.set(this._mongooseOptions.populate, [alias, 'options'], {
          publicationState,
        });

        if (matchQuery !== undefined) {
          _.set(this._mongooseOptions.populate, [alias, 'match'], matchQuery);
        }
      }
    });
  };

  /**
   * Populates component references.
   * @param {Object} this
   */
  const populateComponents = function() {
    componentAttributes.forEach(key => {
      this.populate({ path: `${key}.ref`, options: { publicationState } });
    });
  };

  /**
   * Populates component associations for component models.
   * @param {Object} this
   */
  const populateComponentAssociations = function() {
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
  };

  return function() {
    const populatedPaths = this.getPopulatedPaths();
    const {
      publicationState,
      _populateComponents = true,
      _populateMorphRelations = true,
    } = this.getOptions();

    if (_populateMorphRelations) {
      populateMorphAssociations.call(this);
    }

    if (_populateComponents) {
      populateComponents.call(this);
    }

    if (definition.modelType === 'component') {
      populateComponentAssociations.call(this);
    }
  };
};

/**
 * Builds a relation for a given attribute.
 * @param {Object} params
 * @param {Object} params.definition
 * @param {string} params.model
 * @param {Object} params.instance
 * @param {Object} params.attribute
 * @param {string} params.name
 */
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
      setField(name, { type: ObjectId, ref: getRef(attribute.model, attribute.plugin) });
      break;

    case 'hasMany': {
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
      break;
    }

    case 'belongsToMany': {
      const ref = getRef(attribute.collection, attribute.plugin);

      if (nature === 'manyWay') {
        setField(name, [{ type: ObjectId, ref }]);
      } else {
        const FK = _.find(definition.associations, { alias: name });

        if ((FK && _.isUndefined(FK.via)) || attribute.dominant !== true) {
          setField(name, {
            type: 'virtual',
            ref,
            via: FK.via,
          });
          attribute.isVirtual = true;
        } else {
          setField(name, [{ type: ObjectId, ref }]);
        }
      }
      break;
    }

    case 'morphOne':
      setField(name, { type: ObjectId, ref: getRef(attribute.model, attribute.plugin) });
      break;

    case 'morphMany':
      setField(name, [{ type: ObjectId, ref: getRef(attribute.collection, attribute.plugin) }]);
      break;

    case 'belongsToMorph':
      setField(name, {
        kind: String,
        [attribute.filter]: String,
        ref: { type: ObjectId, refPath: `${name}.kind` },
      });
      break;

    case 'belongsToManyMorph':
      setField(name, [
        {
          kind: String,
          [attribute.filter]: String,
          ref: { type: ObjectId, refPath: `${name}.kind` },
        },
      ]);
      break;

    default:
      break;
  }
};