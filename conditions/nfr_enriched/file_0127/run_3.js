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

const isPolymorphicAssoc = assoc => {
  return assoc.nature.toLowerCase().indexOf('morph') !== -1;
};

// Initialize default model settings
const initializeModelDefaults = definition => {
  _.defaults(definition, {
    primaryKey: '_id',
    primaryKeyType: 'string',
  });
};

// Add system attributes (publishedAt, createdBy, updatedBy)
const addSystemAttributes = definition => {
  if (!definition.uid.startsWith('strapi::') && definition.modelType !== 'component') {
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
  }
};

// Categorize attributes by type
const categorizeAttributes = definition => {
  const componentAttributes = Object.keys(definition.attributes).filter(key =>
    ['component', 'dynamiczone'].includes(definition.attributes[key].type)
  );

  const scalarAttributes = Object.keys(definition.attributes).filter(key => {
    const { type } = definition.attributes[key];
    return type !== undefined && type !== null && type !== 'component' && type !== 'dynamiczone';
  });

  const relationalAttributes = Object.keys(definition.attributes).filter(key => {
    const { type } = definition.attributes[key];
    return type === undefined;
  });

  return { componentAttributes, scalarAttributes, relationalAttributes };
};

// Process component and dynamic zone attributes
const processComponentAttributes = (definition, componentAttributes) => {
  if (componentAttributes.length > 0) {
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
  }
};

// Process scalar attributes
const processScalarAttributes = (definition, scalarAttributes, instance, hasDraftAndPublish) => {
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

// Process relational attributes
const processRelationalAttributes = (definition, relationalAttributes, model, instance) => {
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

// Create schema and configure it
const createAndConfigureSchema = (instance, definition, componentAttributes, morphAssociations) => {
  const schema = new instance.Schema(
    _.omitBy(definition.loadedModel, ({ type }) => type === 'virtual')
  );

  const findLifecycles = ['find', 'findOne', 'findOneAndUpdate', 'findOneAndRemove'];
  const populateFn = createOnFetchPopulateFn({
    componentAttributes,
    morphAssociations,
    definition,
  });

  findLifecycles.forEach(key => {
    schema.pre(key, populateFn);
  });

  return schema;
};

// Add virtual fields to schema
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

// Configure schema timestamps
const configureTimestamps = (schema, definition, target, model) => {
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

// Create transformation functions for serialization
const createTransformFunctions = () => {
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
    } else {
      return el.ref;
    }
  };

  const parseDynamicZoneRef = el => {
    if (el.ref instanceof mongoose.Types.ObjectId) {
      return { id: el.ref.toString() };
    } else {
      return el.ref;
    }
  };

  return { refToStrapiRef, parseComponentRef, parseDynamicZoneRef };
};

// Transform morph associations in serialization
const transformMorphAssociations = (returned, morphAssociations, refToStrapiRef) => {
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
        case 'manyMorphToOne': {
          returned[association.alias] = returned[association.alias].map(obj =>
            refToStrapiRef(obj)
          );
          break;
        }
        default:
      }
    }
  });
};

// Transform component attributes in serialization
const transformComponentAttributes = (returned, componentAttributes, definition, parseComponentRef, parseDynamicZoneRef) => {
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
};

// Transform regular associations in serialization
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

// Configure schema serialization
const configureSchemaTransform = (schema, definition, componentAttributes, morphAssociations) => {
  const { refToStrapiRef, parseComponentRef, parseDynamicZoneRef } = createTransformFunctions();
  const associations = definition.associations.filter(
    association => !isPolymorphicAssoc(association)
  );

  schema.options.toObject = schema.options.toJSON = {
    virtuals: true,
    transform: function(doc, returned) {
      // Parse Decimal128 values
      Object.keys(returned)
        .filter(key => returned[key] instanceof mongoose.Types.Decimal128)
        .forEach(key => {
          returned[key] = parseFloat(returned[key].toString());
        });

      transformMorphAssociations(returned, morphAssociations, refToStrapiRef);
      transformComponentAttributes(returned, componentAttributes, definition, parseComponentRef, parseDynamicZoneRef);
      transformAssociations(returned, associations);
    },
  };
};

// Handle model index errors
const handleIndexesErrors = Model => {
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

// Sync model indexes based on environment
const syncModelIndexes = Model => {
  if (strapi.app.env !== 'production') {
    Model.syncIndexes(null, () => handleIndexesErrors(Model));
  } else {
    handleIndexesErrors(Model);
  }
};

// Instantiate and configure a single model
const mountModel = (model, models, target, instance) => {
  const definition = models[model];
  definition.orm = 'mongoose';
  definition.associations = [];
  definition.globalName = _.upperFirst(_.camelCase(definition.globalId));
  definition.loadedModel = {};

  const hasDraftAndPublish = contentTypesUtils.hasDraftAndPublish(definition);

  initializeModelDefaults(definition);
  addSystemAttributes(definition);

  const { componentAttributes, scalarAttributes, relationalAttributes } = categorizeAttributes(definition);

  processComponentAttributes(definition, componentAttributes);
  processScalarAttributes(definition, scalarAttributes, instance, hasDraftAndPublish);
  processRelationalAttributes(definition, relationalAttributes, model, instance);

  const morphAssociations = definition.associations.filter(isPolymorphicAssoc);
  const schema = createAndConfigureSchema(instance, definition, componentAttributes, morphAssociations);

  addVirtualFields(schema, definition);

  target[model].allAttributes = _.clone(definition.attributes);

  configureTimestamps(schema, definition, target, model);
  schema.set('minimize', _.get(definition, 'options.minimize', false) === true);

  configureSchemaTransform(schema, definition, componentAttributes, morphAssociations);

  // Instantiate model
  const Model = instance.model(definition.globalId, schema, definition.collectionName);

  syncModelIndexes(Model);

  // Expose ORM functions through the target object
  target[model] = _.assign(Model, target[model]);

  // Push attributes to be aware of model schema
  target[model]._attributes = definition.attributes;
  target[model].updateRelations = relations.update;
  target[model].deleteRelations = relations.deleteRelations;
  target[model].privateAttributes = contentTypesUtils.getPrivateAttributes(target[model]);
};

// Run migrations for a model
const runModelMigrations = async (model, models, target, instance) => {
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
};

module.exports = async ({ models, target }, ctx) => {
  const { instance } = ctx;

  // Instantiate every model
  Object.keys(models).forEach(model => mountModel(model, models, target, instance));

  // Migrations + storing schema
  for (const model of Object.keys(models)) {
    await runModelMigrations(model, models, target, instance);
  }
};

// noop migration to match migration API
const migrateSchema = () => {};

// Create populate function for fetch lifecycle hooks
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
      populateMorphRelations(this, morphAssociations, populatedPaths, getMatchQuery, publicationState);
    }

    if (_populateComponents) {
      componentAttributes.forEach(key => {
        this.populate({ path: `${key}.ref`, options: { publicationState } });
      });
    }

    if (definition.modelType === 'component') {
      populateComponentAssociations(this, definition, getMatchQuery, publicationState);
    }
  };
};

// Populate morph relations
const populateMorphRelations = (query, morphAssociations, populatedPaths, getMatchQuery, publicationState) => {
  morphAssociations.forEach(association => {
    const matchQuery = getMatchQuery(association);
    const { alias, nature } = association;

    if (['oneToManyMorph', 'manyToManyMorph'].includes(nature)) {
      query.populate({ path: alias, match: matchQuery, options: { publicationState } });
    } else if (populatedPaths.includes(alias