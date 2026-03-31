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
// Attribute Setup
// ============================================================================

const setupSystemAttributes = definition => {
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
// Schema Field Builders
// ============================================================================

const buildComponentFields = (loadedModel, componentAttributes) => {
  componentAttributes.forEach(name => {
    loadedModel[name] = [
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

const buildScalarFields = (loadedModel, definition, componentAttributes, instance, hasDraftAndPublish) => {
  const scalarAttributes = classifyAttributes(definition).scalar;
  
  scalarAttributes.forEach(name => {
    const attr = definition.attributes[name];
    loadedModel[name] = {
      ...attr,
      ...utils(instance).convertType(name, attr),
      required: definition.modelType === 'compo' || hasDraftAndPublish ? false : definition.required,
    };
  });
};

const buildRelationalFields = (loadedModel, definition, model, instance) => {
  const relationalAttributes = classifyAttributes(definition).relational;
  
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

// ============================================================================
// Schema Configuration
// ============================================================================

const configureSchemaOptions = (schema, definition) => {
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

const configureSchemaTransform = (schema, definition, componentAttributes, morphAssociations, associations) => {
  const refToStrapiRef = obj => {
    const ref = obj.ref;
    const plainData = ref && typeof ref.toJSON === 'function' ? ref.toJSON() : ref;
    return typeof plainData !== 'object' ? ref : { __contentType: obj.kind, ...ref };
  };

  const parseComponentRef = el =>
    el.ref instanceof mongoose.Types.ObjectId ? el.ref.toString() : el.ref;

  const parseDynamicZoneRef = el =>
    el.ref instanceof mongoose.Types.ObjectId ? { id: el.ref.toString() } : el.ref;

  const transformMorphAssociations = (returned, morphAssociations) => {
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
          returned[association.alias] = returned[association.alias].map(refToStrapiRef);
          break;
      }
    });
  };

  const transformComponents = (returned, componentAttributes, definition) => {
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
  };

  const transformAssociations = (returned, associations) => {
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
  };

  schema.options.toObject = schema.options.toJSON = {
    virtuals: true,
    transform: function(doc, returned) {
      // Parse Decimal128 values
      Object.keys(returned)
        .filter(key => returned[key] instanceof mongoose.Types.Decimal128)
        .forEach(key => {
          returned[key] = parseFloat(returned[key].toString());
        });

      transformMorphAssociations(returned, morphAssociations);
      transformComponents(returned, componentAttributes, definition);
      transformAssociations(returned, associations);
    },
  };
};

// ============================================================================
// Model Indexing
// ============================================================================

const setupModelIndexes = Model => {
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
};

// ============================================================================
// Populate Functions
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
      
      if (hasDraftAndPublish && DP_PUB_STATES.includes(publicationState)) {
        return populateQueries.publicationState[publicationState];
      }
      return undefined;
    };

    if (_populateMorphRelations) {
      morphAssociations.forEach(association => {
        const matchQuery = getMatchQuery(association);
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

    if (FK && !['oneToOne', 'manyToOne', 'oneWay', 'oneToMorph'].includes(FK.nature)) {
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

  belongsToMany: (definition, name, attribute, instance) => {
    const ref = strapi.db.getModel(attribute.collection, attribute.plugin).globalId;
    const FK = _.find(definition.associations, { alias: name });

    if (attribute.nature === 'manyWay') {
      definition.loadedModel[name] = [{ type: instance.Schema.Types.ObjectId, ref }];
    } else if ((FK && _.isUndefined(FK.via)) || attribute.dominant !== true) {
      definition.loadedModel[name] = {
        type: 'virtual',
        ref,
        via: FK.via,
      };
      attribute.isVirtual = true;
    } else {
      definition.loadedModel[name] = [{ type: instance.Schema.Types.ObjectId, ref }];
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
    handler(definition, name, attribute, instance);
  }
};

// ============================================================================
// Model Mounting
// ============================================================================

const mountModel = (models, target, instance) => (model) => {
  const definition = models[model];
  definition.orm = 'mongoose';
  definition.associations = [];
  definition.globalName = _.upperFirst(_.camelCase(definition.globalId));
  definition.loadedModel = {};

  _.defaults(definition, {
    primaryKey: '_id',
    primaryKeyType: 'string',
  });

  const hasDraftAndPublish = contentTypesUtils.hasDraftAndPublish(definition);
  setupSystemAttributes(definition);

  const { component: componentAttributes } = classifyAttributes(definition);
  buildComponentFields(definition.loadedModel, componentAttributes);
  buildScalarFields(definition.load