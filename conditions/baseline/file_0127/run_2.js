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

const isPolymorphicAssoc = assoc => assoc.nature.toLowerCase().includes('morph');

const migrateSchema = () => {};

// ============================================================================
// Attribute Classification
// ============================================================================

const classifyAttributes = definition => {
  const attributes = definition.attributes;
  
  return {
    component: Object.keys(attributes).filter(key =>
      ['component', 'dynamiczone'].includes(attributes[key].type)
    ),
    scalar: Object.keys(attributes).filter(key => {
      const { type } = attributes[key];
      return type && type !== 'component' && type !== 'dynamiczone';
    }),
    relational: Object.keys(attributes).filter(key => !attributes[key].type),
  };
};

// ============================================================================
// Attribute Initialization
// ============================================================================

const initializeSystemAttributes = definition => {
  if (definition.uid.startsWith('strapi::') || definition.modelType === 'component') {
    return;
  }

  if (contentTypesUtils.hasDraftAndPublish(definition)) {
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
};

// ============================================================================
// Schema Building
// ============================================================================

const buildComponentAttributes = (definition, componentAttributes) => {
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

const buildScalarAttributes = (definition, scalarAttributes, instance, hasDraftAndPublish) => {
  scalarAttributes.forEach(name => {
    const attr = definition.attributes[name];
    definition.loadedModel[name] = {
      ...attr,
      ...utils(instance).convertType(name, attr),
      required: definition.modelType === 'compo' || hasDraftAndPublish ? false : definition.required,
    };
  });
};

// ============================================================================
// Schema Transformation
// ============================================================================

const createSchemaTransform = (definition, componentAttributes, morphAssociations, associations) => {
  const refToStrapiRef = obj => {
    const ref = obj.ref;
    const plainData = ref && typeof ref.toJSON === 'function' ? ref.toJSON() : ref;
    return typeof plainData !== 'object' ? ref : { __contentType: obj.kind, ...ref };
  };

  const parseComponentRef = el =>
    el.ref instanceof mongoose.Types.ObjectId ? el.ref.toString() : el.ref;

  const parseDynamicZoneRef = el =>
    el.ref instanceof mongoose.Types.ObjectId ? { id: el.ref.toString() } : el.ref;

  const transformMorphAssociations = (returned, association) => {
    if (!Array.isArray(returned[association.alias]) || returned[association.alias].length === 0) {
      return;
    }

    switch (association.nature) {
      case 'oneMorphToOne':
        returned[association.alias] = refToStrapiRef(returned[association.alias][0]);
        break;
      case 'manyMorphToMany':
      case 'manyMorphToOne':
        returned[association.alias] = returned[association.alias].map(refToStrapiRef);
        break;
    }
  };

  const transformComponentAttributes = (returned, name) => {
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
  };

  const transformAssociations = (returned, association) => {
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
  };

  return function(doc, returned) {
    // Parse Decimal128 values
    Object.keys(returned)
      .filter(key => returned[key] instanceof mongoose.Types.Decimal128)
      .forEach(key => {
        returned[key] = parseFloat(returned[key].toString());
      });

    morphAssociations.forEach(assoc => transformMorphAssociations(returned, assoc));
    componentAttributes.forEach(name => transformComponentAttributes(returned, name));
    associations.forEach(assoc => transformAssociations(returned, assoc));
  };
};

// ============================================================================
// Index Management
// ============================================================================

const setupIndexes = (Model, env) => {
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

  if (env !== 'production') {
    Model.syncIndexes(null, handleIndexesErrors);
  } else {
    handleIndexesErrors();
  }
};

// ============================================================================
// Timestamps Configuration
// ============================================================================

const configureTimestamps = (definition, schema, target, model) => {
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
};

// ============================================================================
// Virtual Fields
// ============================================================================

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

// ============================================================================
// Populate Functions
// ============================================================================

const createOnFetchPopulateFn = ({ morphAssociations, componentAttributes, definition }) => {
  const getMatchQuery = assoc => {
    const assocModel = strapi.db.getModelByAssoc(assoc);
    const hasDraftAndPublish = contentTypesUtils.hasDraftAndPublish(assocModel);
    
    if (hasDraftAndPublish && DP_PUB_STATES.includes(this.getOptions().publicationState)) {
      return populateQueries.publicationState[this.getOptions().publicationState];
    }
    return undefined;
  };

  const populateMorphAssociations = function(publicationState) {
    const populatedPaths = this.getPopulatedPaths();

    morphAssociations.forEach(association => {
      const matchQuery = getMatchQuery.call(this, association);
      const { alias, nature } = association;

      if (['oneToManyMorph', 'manyToManyMorph'].includes(nature)) {
        this.populate({ path: alias, match: matchQuery, options: { publicationState } });
      } else if (populatedPaths.includes(alias)) {
        _.set(this._mongooseOptions.populate, [alias, 'path'], `${alias}.ref`);
        _.set(this._mongooseOptions.populate, [alias, 'options'], { publicationState });
        if (matchQuery !== undefined) {
          _.set(this._mongooseOptions.populate, [alias, 'match'], matchQuery);
        }
      }
    });
  };

  const populateComponentAttributes = function(publicationState) {
    componentAttributes.forEach(key => {
      this.populate({ path: `${key}.ref`, options: { publicationState } });
    });
  };

  const populateComponentRelations = function(publicationState) {
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
  };

  return function() {
    const { publicationState, _populateComponents = true, _populateMorphRelations = true } =
      this.getOptions();

    if (_populateMorphRelations) {
      populateMorphAssociations.call(this, publicationState);
    }

    if (_populateComponents) {
      populateComponentAttributes.call(this, publicationState);
    }

    if (definition.modelType === 'component') {
      populateComponentRelations.call(this, publicationState);
    }
  };
};

// ============================================================================
// Relation Building
// ============================================================================

const RELATION_HANDLERS = {
  hasOne: (definition, name, attribute, instance) => {
    const ref = strapi.db.getModel(attribute.model, attribute.plugin).globalId;
    definition.loadedModel[name] = { type: instance.Schema.Types.ObjectId, ref };
  },

  hasMany: (definition, name, attribute, instance) => {
    const FK = _.find(definition.associations, { alias: name });
    const ref = strapi.db.getModel(attribute.collection, attribute.plugin).globalId;

    if (FK) {
      definition.loadedModel[name] = {
        type: 'virtual',
        ref,
        via: FK.via,
        justOne: false,
      };
      attribute.isVirtual = true;
    } else {
      definition.loadedModel[name] = [{ type: instance.Schema.Types.ObjectId, ref }];
    }
  },

  belongsTo: (definition, name, attribute, instance) => {
    const FK = _.find(definition.associations, { alias: name });
    const ref = strapi.db.getModel(attribute.model, attribute.plugin).globalId;

    if (
      FK &&
      !['oneToOne', 'manyToOne', 'oneWay', 'oneToMorph'].includes(FK.nature)
    ) {
      definition.loadedModel[name] = {
        type: 'virtual',
        ref,
        via: FK.via,
        justOne: true,
      };
      attribute.isVirtual = true;
    } else {
      definition.loadedModel[name] = { type: instance.Schema.Types.ObjectId, ref };
    }
  },

  belongsToMany: (definition, name, attribute, instance, nature) => {
    const ref = strapi.db.getModel(attribute.collection, attribute.plugin).globalId;

    if (nature === 'manyWay') {
      definition.loadedModel[name] = [{ type: instance.Schema.Types.ObjectId, ref }];
    } else {
      const FK = _.find(definition.associations, { alias: name });

      if ((FK && _.isUndefined(FK.via)) || attribute.dominant !== true) {
        definition.loadedModel[name] = {
          type: 'virtual',
          ref,
          via: FK.via,
        };
        attribute.isVirtual = true;
      } else {
        definition.loadedModel[name] = [{ type: instance.Schema.Types.ObjectId, ref }];
      }
    }
  },

  morphOne: (definition, name, attribute, instance) => {
    const ref = strapi.db.getModel(attribute.model, attribute.plugin).globalId;
    definition.loadedModel[name] = { type: instance.Schema.Types.ObjectId, ref };
  },

  morphMany: (definition, name, attribute, instance) => {
    const ref = strapi.db.getModel(attribute.collection, attribute.plugin).globalId;
    definition.loadedModel[name] = [{ type: instance.Schema.Types.ObjectId, ref }];
  },

  belongsToMorph: (definition, name, attribute, instance) => {
    definition.loadedModel[name] = {
      kind: String,
      [attribute.filter]: String,
      ref: { type: instance.Schema.Types.ObjectId, refPath: `${name}.kind` },
    };
  },

  belongsToManyMorph: (definition, name, attribute, instance) => {
    definition.loadedModel[name] = [
      {
        kind: String,
        [attribute.filter]: String,
        ref: { type: instance.Schema.Types.ObjectId, refPath: `${name}.kind` },
      },
    ];
  },
};

const buildRelation = ({ definition, model, instance, attribute, name }) => {
  const { nature, verbose } =
    utilsModels.getNature({
      attribute,
      attributeName: name,
      modelName: model.toLowerCase(),
    }) || {};

  utilsModels.defineAssociations(model.toLowerCase(), definition, attribute, name);

  const handler = RELATION_HANDLERS[verbose];
  if (handler) {
    handler(definition, name, attribute, instance, nature);
  }
};

// ============================================================================
// Model Mounting
// ============================================================================

const mountModel = (models, target, instance) => model => {
  const definition = models[model];
  definition.orm = 'mongoose';
  definition.associations = [];