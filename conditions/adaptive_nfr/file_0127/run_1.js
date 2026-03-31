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
// Definition Setup
// ============================================================================

const setupDefinitionDefaults = definition => {
  _.defaults(definition, {
    primaryKey: '_id',
    primaryKeyType: 'string',
  });

  definition.orm = 'mongoose';
  definition.associations = [];
  definition.globalName = _.upperFirst(_.camelCase(definition.globalId));
  definition.loadedModel = {};
};

const addSystemAttributes = definition => {
  const isSystemModel = definition.uid.startsWith('strapi::') || definition.modelType === 'component';
  if (isSystemModel) return;

  if (contentTypesUtils.hasDraftAndPublish(definition)) {
    definition.attributes[PUBLISHED_AT_ATTRIBUTE] = {
      type: 'datetime',
      configurable: false,
      writable: true,
      visible: false,
    };
  }

  const isPrivate = !_.get(definition, 'options.populateCreatorFields', false);
  const userAttrConfig = {
    model: 'user',
    plugin: 'admin',
    configurable: false,
    writable: false,
    visible: false,
    private: isPrivate,
  };

  definition.attributes[CREATED_BY_ATTRIBUTE] = userAttrConfig;
  definition.attributes[UPDATED_BY_ATTRIBUTE] = userAttrConfig;
};

// ============================================================================
// Attribute Loading
// ============================================================================

const loadComponentAttributes = (definition, componentAttributes) => {
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

const loadScalarAttributes = (definition, scalarAttributes, instance, hasDraftAndPublish) => {
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
// Schema Configuration
// ============================================================================

const configureSchemaTransform = (schema, definition, componentAttributes, morphAssociations, associations) => {
  const transformers = {
    decimal: createDecimalTransformer(),
    morph: createMorphTransformer(morphAssociations),
    component: createComponentTransformer(definition, componentAttributes),
    association: createAssociationTransformer(associations),
  };

  schema.options.toObject = schema.options.toJSON = {
    virtuals: true,
    transform: (doc, returned) => {
      Object.values(transformers).forEach(transformer => transformer(returned));
    },
  };
};

const createDecimalTransformer = () => (returned) => {
  Object.keys(returned)
    .filter(key => returned[key] instanceof mongoose.Types.Decimal128)
    .forEach(key => {
      returned[key] = parseFloat(returned[key].toString());
    });
};

const createMorphTransformer = (morphAssociations) => (returned) => {
  const refToStrapiRef = (obj) => {
    const plainData = obj.ref && typeof obj.ref.toJSON === 'function' ? obj.ref.toJSON() : obj.ref;
    return typeof plainData !== 'object' ? obj.ref : { __contentType: obj.kind, ...obj.ref };
  };

  morphAssociations.forEach(association => {
    if (Array.isArray(returned[association.alias]) && returned[association.alias].length > 0) {
      switch (association.nature) {
        case 'oneMorphToOne':
          returned[association.alias] = refToStrapiRef(returned[association.alias][0]);
          break;
        case 'manyMorphToMany':
        case 'manyMorphToOne':
          returned[association.alias] = returned[association.alias].map(refToStrapiRef);
          break;
      }
    }
  });
};

const createComponentTransformer = (definition, componentAttributes) => (returned) => {
  const parseComponentRef = (el) => 
    el.ref instanceof mongoose.Types.ObjectId ? el.ref.toString() : el.ref;

  const parseDynamicZoneRef = (el) => 
    el.ref instanceof mongoose.Types.ObjectId ? { id: el.ref.toString() } : el.ref;

  componentAttributes.forEach(name => {
    const attribute = definition.attributes[name];
    const { type } = attribute;

    if (type === 'component' && Array.isArray(returned[name])) {
      const components = returned[name].map(parseComponentRef);
      returned[name] = attribute.repeatable === true ? components : _.first(components) || null;
    }

    if (type === 'dynamiczone' && returned[name]) {
      returned[name] = returned[name]
        .filter(el => el?.kind)
        .map(el => ({
          __component: findComponentByGlobalId(el.kind).uid,
          ...parseDynamicZoneRef(el),
        }));
    }
  });
};

const createAssociationTransformer = (associations) => (returned) => {
  associations.forEach(association => {
    const relation = returned[association.alias];
    if (!relation) return;

    returned[association.alias] = relation.toJSON ? relation.toJSON() : relation;

    if (_.isArray(association.populate)) {
      const pickPopulate = entry => _.pick(entry, association.populate);
      returned[association.alias] = _.isArray(returned[association.alias])
        ? _.map(returned[association.alias], pickPopulate)
        : pickPopulate(returned[association.alias]);
    }
  });
};

// ============================================================================
// Schema Lifecycle
// ============================================================================

const setupSchemaLifecycles = (schema, definition, componentAttributes, morphAssociations) => {
  const findLifecycles = ['find', 'findOne', 'findOneAndUpdate', 'findOneAndRemove'];
  const populateFn = createOnFetchPopulateFn({
    componentAttributes,
    morphAssociations,
    definition,
  });

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

const setupTimestamps = (schema, definition, target, model) => {
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
// Model Instantiation
// ============================================================================

const createAndConfigureModel = (instance, definition, model, target) => {
  const schema = new instance.Schema(
    _.omitBy(definition.loadedModel, ({ type }) => type === 'virtual')
  );

  schema.set('minimize', _.get(definition, 'options.minimize', false) === true);

  const Model = instance.model(definition.globalId, schema, definition.collectionName);
  
  setupIndexes(Model);
  
  return Model;
};

const setupIndexes = (Model) => {
  const handleIndexesErrors = () => {
    Model.on('index', error => {
      if (!error) return;
      
      const message = error.code === 11000
        ? `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${error.message}`
        : `An index error happened, it wasn't applied.\n\t- ${error.message}`;
      
      strapi.log.error(message);
    });
  };

  if (strapi.app.env !== 'production') {
    Model.syncIndexes(null, handleIndexesErrors);
  } else {
    handleIndexesErrors();
  }
};

const attachModelMetadata = (Model, definition, target, model) => {
  target[model] = _.assign(Model, target[model]);
  target[model]._attributes = definition.attributes;
  target[model].updateRelations = relations.update;
  target[model].deleteRelations = relations.deleteRelations;
  target[model].privateAttributes = contentTypesUtils.getPrivateAttributes(target[model]);
};

// ============================================================================
// Relation Building
// ============================================================================

const RELATION_HANDLERS = {
  hasOne: (definition, name, attribute, instance) => {
    const ref = getRef(attribute.model, attribute.plugin);
    definition.loadedModel[name] = { type: instance.Schema.Types.ObjectId, ref };
  },

  hasMany: (definition, name, attribute, instance) => {
    const FK = _.find(definition.associations, { alias: name });
    const ref = getRef(attribute.collection, attribute.plugin);

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
    const ref = getRef(attribute.model, attribute.plugin);
    const isVirtualCase = FK && !['oneToOne', 'manyToOne', 'oneWay', 'oneToMorph'].includes(FK.nature);

    if (isVirtualCase) {
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
    const ref = getRef(attribute.collection, attribute.plugin);

    if (nature === 'manyWay') {
      definition.loadedModel[name] = [{ type: instance.Schema.Types.ObjectId, ref }];
      return;
    }

    const FK = _.find(definition.associations, { alias: name });
    const isVirtualCase = (FK && _.isUndefined(FK.via)) || attribute.dominant !== true;

    if (isVirtualCase) {
      definition.loadedModel[name] = {
        type: 'virtual',
        ref,
        via: FK?.via,
      };
      attribute.isVirtual = true;
    } else {
      definition.loadedModel[name] = [{ type: instance.Schema.Types.ObjectId, ref }];
    }
  },

  morphOne: (definition, name, attribute, instance) => {
    const ref = getRef(attribute.model, attribute.plugin);
    definition.loadedModel[name] = { type: instance.Schema.Types.ObjectId, ref };
  },

  morphMany: (definition, name, attribute, instance) => {
    const ref = getRef(attribute.collection, attribute.plugin);
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

const getRef = (name, plugin) => strapi.db.getModel(name, plugin).globalId;

const buildRelation = ({ definition, model, instance, attribute, name }) => {
  const { nature, verbose } = utilsModels.getNature({
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
// Populate Configuration
// ============================================================================

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
      
      return hasDraftAndPublish && DP_PUB_STATES.includes(publicationState)
        ? populateQueries.publicationState[publicationState]
        : undefined;
    };

    if (_populateMorphRelations) {
      populateMorphRelations(this, morphAssociations, populatedPaths, publicationState, getMatchQuery);
    }

    if (_populateComponents) {
      componentAttributes.forEach(key => {
        this.populate({