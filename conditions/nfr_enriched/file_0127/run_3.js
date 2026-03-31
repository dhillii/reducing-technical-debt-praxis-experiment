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
  Object.keys(attributes).filter(key => types.includes(attributes[key].type));

const filterAttributesByAbsenceOfType = attributes =>
  Object.keys(attributes).filter(key => attributes[key].type === undefined);

const getTimestampColumns = definition => ({
  createdAt: _.get(definition, 'options.timestamps.0', 'createdAt'),
  updatedAt: _.get(definition, 'options.timestamps.1', 'updatedAt'),
});

const shouldPopulateCreatorFields = definition =>
  !_.get(definition, 'options.populateCreatorFields', false);

// ============================================================================
// ATTRIBUTE INITIALIZATION
// ============================================================================

const initializeSystemAttributes = (definition, hasDraftAndPublish) => {
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

  const isPrivate = shouldPopulateCreatorFields(definition);

  const creatorAttributes = {
    model: 'user',
    plugin: 'admin',
    configurable: false,
    writable: false,
    visible: false,
    private: isPrivate,
  };

  definition.attributes[CREATED_BY_ATTRIBUTE] = creatorAttributes;
  definition.attributes[UPDATED_BY_ATTRIBUTE] = creatorAttributes;
};

// ============================================================================
// SCALAR ATTRIBUTES HANDLING
// ============================================================================

const buildScalarAttribute = (name, attr, definition, instance, hasDraftAndPublish) => ({
  ...attr,
  ...utils(instance).convertType(name, attr),
  required:
    definition.modelType === 'compo' || hasDraftAndPublish ? false : definition.required,
});

const processScalarAttributes = (scalarAttributes, definition, instance, hasDraftAndPublish) => {
  const loadedModel = {};
  scalarAttributes.forEach(name => {
    loadedModel[name] = buildScalarAttribute(
      name,
      definition.attributes[name],
      definition,
      instance,
      hasDraftAndPublish
    );
  });
  return loadedModel;
};

// ============================================================================
// COMPONENT ATTRIBUTES HANDLING
// ============================================================================

const buildComponentAttribute = name => ({
  [name]: [
    {
      kind: String,
      ref: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: `${name}.kind`,
      },
    },
  ],
});

const processComponentAttributes = componentAttributes =>
  Object.assign({}, ...componentAttributes.map(buildComponentAttribute));

// ============================================================================
// SCHEMA TRANSFORMATION
// ============================================================================

const createDecimalTransformer = () => (returned, key) => {
  if (returned[key] instanceof mongoose.Types.Decimal128) {
    returned[key] = parseFloat(returned[key].toString());
  }
};

const transformMorphAssociations = (morphAssociations, returned) => {
  const refToStrapiRef = obj => {
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

const transformComponentAttributes = (componentAttributes, definition, returned) => {
  const parseComponentRef = el =>
    el.ref instanceof mongoose.Types.ObjectId ? el.ref.toString() : el.ref;

  const parseDynamicZoneRef = el =>
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
        .filter(el => el && el.kind)
        .map(el => ({
          __component: findComponentByGlobalId(el.kind).uid,
          ...parseDynamicZoneRef(el),
        }));
    }
  });
};

const transformAssociations = (associations, returned) => {
  associations.forEach(association => {
    const relation = returned[association.alias];

    if (relation) {
      returned[association.alias] = relation.toJSON ? relation.toJSON() : relation;

      if (_.isArray(association.populate)) {
        const pickPopulate = entry => _.pick(entry, association.populate);
        returned[association.alias] = _.isArray(returned[association.alias])
          ? _.map(returned[association.alias], pickPopulate)
          : pickPopulate(returned[association.alias]);
      }
    }
  });
};

const createSchemaTransformer = (morphAssociations, componentAttributes, associations, definition) =>
  function(doc, returned) {
    // Transform decimals
    Object.keys(returned)
      .filter(key => returned[key] instanceof mongoose.Types.Decimal128)
      .forEach(createDecimalTransformer());

    transformMorphAssociations(morphAssociations, returned);
    transformComponentAttributes(componentAttributes, definition, returned);
    transformAssociations(associations, returned);
  };

// ============================================================================
// SCHEMA CONFIGURATION
// ============================================================================

const configureSchemaOptions = (schema, definition, timestamps) => {
  const transformer = createSchemaTransformer(
    definition.associations.filter(isPolymorphicAssoc),
    Object.keys(definition.attributes).filter(
      key => ['component', 'dynamiczone'].includes(definition.attributes[key].type)
    ),
    definition.associations.filter(assoc => !isPolymorphicAssoc(assoc)),
    definition
  );

  schema.options.toObject = schema.options.toJSON = {
    virtuals: true,
    transform: transformer,
  };

  if (timestamps) {
    schema.set('timestamps', {
      createdAt: timestamps.createdAt,
      updatedAt: timestamps.updatedAt,
    });
  }

  schema.set('minimize', _.get(definition, 'options.minimize', false) === true);
};

// ============================================================================
// INDEX HANDLING
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
// VIRTUAL FIELDS
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
// RELATION BUILDING
// ============================================================================

const RelationBuilder = {
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
    const isVirtualRelation =
      FK &&
      !['oneToOne', 'manyToOne', 'oneWay', 'oneToMorph'].includes(FK.nature);

    if (isVirtualRelation) {
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
      return;
    }

    const FK = _.find(definition.associations, { alias: name });
    const isVirtualRelation = (FK && _.isUndefined(FK.via)) || attribute.dominant !== true;

    if (isVirtualRelation) {
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

  const builder = RelationBuilder[verbose];
  if (builder) {
    builder(definition, name, attribute, instance, nature);
  }
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

      return hasDraftAndPublish && DP_PUB_STATES.includes(publicationState)
        ? populateQueries.publicationState[publicationState]
        : undefined;
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
// MODEL MOUNTING
// ============================================================================

const mountModel = (models