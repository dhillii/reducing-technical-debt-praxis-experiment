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

const filterAttributesByType = (attributes, types) =>
  Object.keys(attributes).filter(key => {
    const { type } = attributes[key];
    return types.includes(type);
  });

const getComponentAttributes = attributes =>
  filterAttributesByType(attributes, ['component', 'dynamiczone']);

const getScalarAttributes = attributes =>
  filterAttributesByType(attributes, [undefined, null]).filter(
    key => !['component', 'dynamiczone'].includes(attributes[key].type)
  );

const getRelationalAttributes = attributes =>
  Object.keys(attributes).filter(key => attributes[key].type === undefined);

const parseDecimal128 = (obj, key) => {
  if (obj[key] instanceof mongoose.Types.Decimal128) {
    obj[key] = parseFloat(obj[key].toString());
  }
};

const parseComponentRef = el =>
  el.ref instanceof mongoose.Types.ObjectId ? el.ref.toString() : el.ref;

const parseDynamicZoneRef = el =>
  el.ref instanceof mongoose.Types.ObjectId ? { id: el.ref.toString() } : el.ref;

const refToStrapiRef = obj => {
  const ref = obj.ref;
  const plainData = ref && typeof ref.toJSON === 'function' ? ref.toJSON() : ref;
  return typeof plainData !== 'object' ? ref : { __contentType: obj.kind, ...ref };
};

// ============================================================================
// SCHEMA CONFIGURATION
// ============================================================================

const configureSystemAttributes = (definition, hasDraftAndPublish) => {
  if (definition.uid.startsWith('strapi::') || definition.modelType === 'component') {
    return;
  }

  if (hasDraftAndPublish) {
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
      required:
        definition.modelType === 'compo' || hasDraftAndPublish ? false : definition.required,
    };
  });
};

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

const configureVirtualFields = (definition, schema) => {
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
// SCHEMA TRANSFORMATION
// ============================================================================

const createTransformFn = (definition, componentAttributes, morphAssociations, associations) => {
  return function(doc, returned) {
    // Parse Decimal128 values
    Object.keys(returned)
      .filter(key => returned[key] instanceof mongoose.Types.Decimal128)
      .forEach(key => parseDecimal128(returned, key));

    // Transform morph associations
    transformMorphAssociations(returned, morphAssociations);

    // Transform component attributes
    transformComponentAttributes(returned, componentAttributes, definition);

    // Transform regular associations
    transformAssociations(returned, associations);
  };
};

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

// ============================================================================
// MODEL INDEXING
// ============================================================================

const handleIndexErrors = Model => {
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

const syncModelIndexes = Model => {
  if (strapi.app.env !== 'production') {
    Model.syncIndexes(null, () => handleIndexErrors(Model));
  } else {
    handleIndexErrors(Model);
  }
};

// ============================================================================
// RELATION BUILDING
// ============================================================================

const RelationBuilder = {
  getRef: (name, plugin) => strapi.db.getModel(name, plugin).globalId,

  setField: (definition, name, val) => {
    definition.loadedModel[name] = val;
  },

  buildHasOne: (definition, name, attribute) => {
    const ref = RelationBuilder.getRef(attribute.model, attribute.plugin);
    RelationBuilder.setField(definition, name, { type: mongoose.Schema.Types.ObjectId, ref });
  },

  buildHasMany: (definition, name, attribute) => {
    const FK = _.find(definition.associations, { alias: name });
    const ref = RelationBuilder.getRef(attribute.collection, attribute.plugin);

    if (FK) {
      RelationBuilder.setField(definition, name, {
        type: 'virtual',
        ref,
        via: FK.via,
        justOne: false,
      });
      attribute.isVirtual = true;
    } else {
      RelationBuilder.setField(definition, name, [
        { type: mongoose.Schema.Types.ObjectId, ref },
      ]);
    }
  },

  buildBelongsTo: (definition, name, attribute) => {
    const FK = _.find(definition.associations, { alias: name });
    const ref = RelationBuilder.getRef(attribute.model, attribute.plugin);
    const isVirtualRelation =
      FK &&
      !['oneToOne', 'manyToOne', 'oneWay', 'oneToMorph'].includes(FK.nature);

    if (isVirtualRelation) {
      RelationBuilder.setField(definition, name, {
        type: 'virtual',
        ref,
        via: FK.via,
        justOne: true,
      });
      attribute.isVirtual = true;
    } else {
      RelationBuilder.setField(definition, name, { type: mongoose.Schema.Types.ObjectId, ref });
    }
  },

  buildBelongsToMany: (definition, name, attribute, nature) => {
    const ref = RelationBuilder.getRef(attribute.collection, attribute.plugin);

    if (nature === 'manyWay') {
      RelationBuilder.setField(definition, name, [
        { type: mongoose.Schema.Types.ObjectId, ref },
      ]);
      return;
    }

    const FK = _.find(definition.associations, { alias: name });
    const isVirtualRelation = (FK && _.isUndefined(FK.via)) || attribute.dominant !== true;

    if (isVirtualRelation) {
      RelationBuilder.setField(definition, name, {
        type: 'virtual',
        ref,
        via: FK.via,
      });
      attribute.isVirtual = true;
    } else {
      RelationBuilder.setField(definition, name, [
        { type: mongoose.Schema.Types.ObjectId, ref },
      ]);
    }
  },

  buildMorphOne: (definition, name, attribute) => {
    const ref = RelationBuilder.getRef(attribute.model, attribute.plugin);
    RelationBuilder.setField(definition, name, { type: mongoose.Schema.Types.ObjectId, ref });
  },

  buildMorphMany: (definition, name, attribute) => {
    const ref = RelationBuilder.getRef(attribute.collection, attribute.plugin);
    RelationBuilder.setField(definition, name, [{ type: mongoose.Schema.Types.ObjectId, ref }]);
  },

  buildBelongsToMorph: (definition, name, attribute) => {
    RelationBuilder.setField(definition, name, {
      kind: String,
      [attribute.filter]: String,
      ref: { type: mongoose.Schema.Types.ObjectId, refPath: `${name}.kind` },
    });
  },

  buildBelongsToManyMorph: (definition, name, attribute) => {
    RelationBuilder.setField(definition, name, [
      {
        kind: String,
        [attribute.filter]: String,
        ref: { type: mongoose.Schema.Types.ObjectId, refPath: `${name}.kind` },
      },
    ]);
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

  const relationMap = {
    hasOne: () => RelationBuilder.buildHasOne(definition, name, attribute),
    hasMany: () => RelationBuilder.buildHasMany(definition, name, attribute),
    belongsTo: () => RelationBuilder.buildBelongsTo(definition, name, attribute),
    belongsToMany: () =>
      RelationBuilder.buildBelongsToMany(definition, name, attribute, nature),
    morphOne: () => RelationBuilder.buildMorphOne(definition, name, attribute),
    morphMany: () => RelationBuilder.buildMorphMany(definition, name, attribute),
    belongsToMorph: () => RelationBuilder.buildBelongsToMorph(definition, name, attribute),
    belongsToManyMorph: () =>
      RelationBuilder.buildBelongsToManyMorph(definition, name, attribute),
  };

  const builder = relationMap[verbose];
  if (builder) builder();
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

const populateMorphRelations = (query, morphAssociations, populatedPaths, getMatchQuery, publicationState) => {
  morphAssociations.forEach(association => {
    const matchQuery = getMatchQuery(association);
    const { alias, nature } = association;

    if (['oneToManyMorph', 'manyToManyMor