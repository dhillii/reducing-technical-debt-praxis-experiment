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
  const componentAttributes = [];
  const scalarAttributes = [];
  const relationalAttributes = [];

  Object.keys(attributes).forEach(key => {
    const { type } = attributes[key];
    if (['component', 'dynamiczone'].includes(type)) {
      componentAttributes.push(key);
    } else if (type !== undefined && type !== null) {
      scalarAttributes.push(key);
    } else {
      relationalAttributes.push(key);
    }
  });

  return { componentAttributes, scalarAttributes, relationalAttributes };
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
  const userAttribute = {
    model: 'user',
    plugin: 'admin',
    configurable: false,
    writable: false,
    visible: false,
    private: isPrivate,
  };

  definition.attributes[CREATED_BY_ATTRIBUTE] = userAttribute;
  definition.attributes[UPDATED_BY_ATTRIBUTE] = userAttribute;
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

const loadRelationalAttributes = (definition, relationalAttributes, model, instance) => {
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

  schema.options.toObject = schema.options.toJSON = {
    virtuals: true,
    transform: (doc, returned) => {
      transformDecimalFields(returned);
      transformMorphAssociations(returned, morphAssociations, refToStrapiRef);
      transformComponentAttributes(returned, definition, componentAttributes, parseComponentRef, parseDynamicZoneRef);
      transformRelationalAssociations(returned, associations);
    },
  };
};

const transformDecimalFields = returned => {
  Object.keys(returned)
    .filter(key => returned[key] instanceof mongoose.Types.Decimal128)
    .forEach(key => {
      returned[key] = parseFloat(returned[key].toString());
    });
};

const transformMorphAssociations = (returned, morphAssociations, refToStrapiRef) => {
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

const transformComponentAttributes = (returned, definition, componentAttributes, parseComponentRef, parseDynamicZoneRef) => {
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

const transformRelationalAssociations = (returned, associations) => {
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
// Schema Indexes
// ============================================================================

const setupSchemaIndexes = Model => {
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
// Schema Timestamps
// ============================================================================

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
// Model Mounting
// ============================================================================

const mountModel = (models, target, instance) => model => {
  const definition = models[model];
  setupDefinitionDefaults(definition);
  addSystemAttributes(definition);

  const hasDraftAndPublish = contentTypesUtils.hasDraftAndPublish(definition);
  const { componentAttributes, scalarAttributes, relationalAttributes } = classifyAttributes(definition);

  loadComponentAttributes(definition, componentAttributes);
  loadScalarAttributes(definition, scalarAttributes, instance, hasDraftAndPublish);
  loadRelationalAttributes(definition, relationalAttributes, model, instance);

  const schema = new instance.Schema(
    _.omitBy(definition.loadedModel, ({ type }) => type === 'virtual')
  );

  const morphAssociations = definition.associations.filter(isPolymorphicAssoc);
  const associations = definition.associations.filter(assoc => !isPolymorphicAssoc(assoc));

  const populateFn = createOnFetchPopulateFn({
    componentAttributes,
    morphAssociations,
    definition,
  });

  ['find', 'findOne', 'findOneAndUpdate', 'findOneAndRemove'].forEach(key => {
    schema.pre(key, populateFn);
  });

  addVirtualFields(schema, definition);
  configureSchemaTransform(schema, definition, componentAttributes, morphAssociations, associations);

  target[model].allAttributes = _.clone(definition.attributes);
  configureSchemaTimestamps(schema, definition, target, model);

  schema.set('minimize', _.get(definition, 'options.minimize', false) === true);

  const Model = instance.model(definition.globalId, schema, definition.collectionName);
  setupSchemaIndexes(Model);

  target[model] = _.assign(Model, target[model]);
  target[model]._attributes = definition.attributes;
  target[model].updateRelations = relations.update;
  target[model].deleteRelations = relations.deleteRelations;
  target[model].privateAttributes = contentTypesUtils.getPrivateAttributes(target[model]);
};

// ============================================================================
// Populate Function
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
      populateMorphRelations(this, morphAssociations, populatedPaths, getMatchQuery, publicationState);
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

const populateMorphRelations = (query, morphAssociations, populatedPaths, getMatchQuery, publicationState) => {
  morphAssociations.forEach(association => {
    const matchQuery = getMatchQuery(association);
    const { alias, nature } = association;

    if (['oneToManyMorph', 'manyToManyMorph'].includes(nature)) {
      query.populate({ path: alias, match: matchQuery, options: { publicationState } });
    } else if (populatedPaths.includes(alias)) {
      _.set(query._mongooseOptions.populate, [alias, 'path'], `${alias}.ref`);
      _.set(query._mongooseOptions.populate, [alias, 'options'], { publicationState });
      if (matchQuery !== undefined) {
        _.set(query._mongooseOptions.populate, [alias, 'match'], matchQuery);
      }
    }
  });
};

// ============================================================================
// Relation Building
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

  belongsToMany: (definition, name, attribute, instance