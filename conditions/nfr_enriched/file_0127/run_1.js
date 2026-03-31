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

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const isPolymorphicAssoc = assoc => assoc.nature.toLowerCase().includes('morph');

const getAttributesByType = (attributes, predicate) =>
  Object.keys(attributes).filter(key => predicate(attributes[key]));

const getComponentAttributes = attributes =>
  getAttributesByType(attributes, attr => ['component', 'dynamiczone'].includes(attr.type));

const getScalarAttributes = attributes =>
  getAttributesByType(attributes, attr => {
    const { type } = attr;
    return type !== undefined && type !== null && !['component', 'dynamiczone'].includes(type);
  });

const getRelationalAttributes = attributes =>
  getAttributesByType(attributes, attr => attr.type === undefined);

// ============================================================================
// ATTRIBUTE HANDLERS
// ============================================================================

const handleComponentAttributes = (componentAttributes, definition) => {
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

const handleScalarAttributes = (scalarAttributes, definition, instance, hasDraftAndPublish) => {
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

const handleRelationalAttributes = (relationalAttributes, definition, model, instance) => {
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
// SCHEMA CONFIGURATION
// ============================================================================

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

  const transformComponentAttributes = (returned, componentAttributes, definition) => {
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
      transformComponentAttributes(returned, componentAttributes, definition);
      transformAssociations(returned, associations);
    },
  };
};

const configureSchemaVirtuals = (schema, definition) => {
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

const configureSchemaTimestamps = (schema, definition, target, model) => {
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
// MODEL INITIALIZATION
// ============================================================================

const initializeModelDefinition = definition => {
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

const setupModelIndexes = (Model, instance) => {
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

const attachModelMethods = (target, model, Model, definition) => {
  target[model] = _.assign(Model, target[model]);
  target[model]._attributes = definition.attributes;
  target[model].updateRelations = relations.update;
  target[model].deleteRelations = relations.deleteRelations;
  target[model].privateAttributes = contentTypesUtils.getPrivateAttributes(target[model]);
};

// ============================================================================
// MAIN MOUNT FUNCTION
// ============================================================================

const mountModel = (models, target, instance) => (model) => {
  const definition = models[model];

  initializeModelDefinition(definition);
  addSystemAttributes(definition);

  const hasDraftAndPublish = contentTypesUtils.hasDraftAndPublish(definition);
  const componentAttributes = getComponentAttributes(definition.attributes);
  const scalarAttributes = getScalarAttributes(definition.attributes);
  const relationalAttributes = getRelationalAttributes(definition.attributes);

  handleComponentAttributes(componentAttributes, definition);
  handleScalarAttributes(scalarAttributes, definition, instance, hasDraftAndPublish);
  handleRelationalAttributes(relationalAttributes, definition, model, instance);

  const schema = new instance.Schema(
    _.omitBy(definition.loadedModel, ({ type }) => type === 'virtual')
  );

  const morphAssociations = definition.associations.filter(isPolymorphicAssoc);
  const populateFn = createOnFetchPopulateFn({
    componentAttributes,
    morphAssociations,
    definition,
  });

  ['find', 'findOne', 'findOneAndUpdate', 'findOneAndRemove'].forEach(key => {
    schema.pre(key, populateFn);
  });

  configureSchemaVirtuals(schema, definition);

  target[model].allAttributes = _.clone(definition.attributes);

  configureSchemaTimestamps(schema, definition, target, model);
  schema.set('minimize', _.get(definition, 'options.minimize', false) === true);

  const associations = definition.associations.filter(assoc => !isPolymorphicAssoc(assoc));
  configureSchemaTransform(schema, definition, componentAttributes, morphAssociations, associations);

  const Model = instance.model(definition.globalId, schema, definition.collectionName);

  setupModelIndexes(Model, instance);
  attachModelMethods(target, model, Model, definition);
};

// ============================================================================
// POPULATE FUNCTION
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
// RELATION BUILDERS
// ============================================================================

const RELATION_HANDLERS = {
  hasOne: (definition, name, attribute, instance) => {
    const ref = getRefModel(attribute.model, attribute.plugin);
    definition.loadedModel[name] = { type: instance.Schema.Types.ObjectId, ref };
  },

  hasMany: (definition, name, attribute, instance) => {
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
      definition.loadedModel[name] = [{ type: instance.Schema.Types.ObjectId, ref }];
    }
  },

  belongsTo: (definition, name, attribute, instance) => {
    const FK = _.find(definition.associations, { alias: name });
    const ref = getRefModel(attribute.model, attribute.plugin);

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

  belongsToMany: (definition, name, attribute, instance, nature) => {
    const ref = getRefModel(attribute.collection, attribute.plugin);

    if (nature === 'manyWay') {
      definition.loadedModel[name