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

const filterRelationalAttributes = attributes =>
  Object.keys(attributes).filter(key => attributes[key].type === undefined);

const getTimestampColumns = definition => [
  _.get(definition, 'options.timestamps.0', 'createdAt'),
  _.get(definition, 'options.timestamps.1', 'updatedAt'),
];

const parseDecimal128 = value => parseFloat(value.toString());

const parseComponentRef = el =>
  el.ref instanceof mongoose.Types.ObjectId ? el.ref.toString() : el.ref;

const parseDynamicZoneRef = el =>
  el.ref instanceof mongoose.Types.ObjectId ? { id: el.ref.toString() } : el.ref;

// ============================================================================
// ATTRIBUTE SETUP
// ============================================================================

const setupSystemAttributes = (definition, isPrivate) => {
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

const setupComponentAttributes = (definition, loadedModel) => {
  const componentAttributes = filterAttributesByType(definition.attributes, [
    'component',
    'dynamiczone',
  ]);

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

  return componentAttributes;
};

const setupScalarAttributes = (definition, loadedModel, instance, hasDraftAndPublish) => {
  const scalarAttributes = filterAttributesByType(definition.attributes, [
    'component',
    'dynamiczone',
  ]).map(key => key).filter(
    key =>
      !['component', 'dynamiczone'].includes(definition.attributes[key].type)
  );

  Object.keys(definition.attributes).forEach(name => {
    const attr = definition.attributes[name];
    if (attr.type !== undefined && attr.type !== null && !['component', 'dynamiczone'].includes(attr.type)) {
      loadedModel[name] = {
        ...attr,
        ...utils(instance).convertType(name, attr),
        required:
          definition.modelType === 'compo' || hasDraftAndPublish ? false : definition.required,
      };
    }
  });
};

// ============================================================================
// SCHEMA TRANSFORMATION
// ============================================================================

const createToObjectTransform = (definition, morphAssociations, componentAttributes, associations) => {
  return {
    virtuals: true,
    transform: (doc, returned) => {
      transformDecimalValues(returned);
      transformMorphAssociations(returned, morphAssociations);
      transformComponentAttributes(returned, definition, componentAttributes);
      transformRelations(returned, associations);
    },
  };
};

const transformDecimalValues = returned => {
  Object.keys(returned)
    .filter(key => returned[key] instanceof mongoose.Types.Decimal128)
    .forEach(key => {
      returned[key] = parseDecimal128(returned[key]);
    });
};

const transformMorphAssociations = (returned, morphAssociations) => {
  morphAssociations.forEach(association => {
    if (!Array.isArray(returned[association.alias]) || returned[association.alias].length === 0) {
      return;
    }

    const { alias, nature } = association;
    const refToStrapiRef = obj => ({
      __contentType: obj.kind,
      ...(obj.ref && typeof obj.ref.toJSON === 'function' ? obj.ref.toJSON() : obj.ref),
    });

    switch (nature) {
      case 'oneMorphToOne':
        returned[alias] = refToStrapiRef(returned[alias][0]);
        break;
      case 'manyMorphToMany':
      case 'manyMorphToOne':
        returned[alias] = returned[alias].map(refToStrapiRef);
        break;
    }
  });
};

const transformComponentAttributes = (returned, definition, componentAttributes) => {
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

const transformRelations = (returned, associations) => {
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
// SCHEMA CONFIGURATION
// ============================================================================

const configureSchemaIndexes = (Model, env) => {
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

  if (env !== 'production') {
    Model.syncIndexes(null, handleIndexesErrors);
  } else {
    handleIndexesErrors();
  }
};

const setupSchemaVirtuals = (schema, loadedModel) => {
  _.forEach(
    _.pickBy(loadedModel, ({ type }) => type === 'virtual'),
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

const setupSchemaTimestamps = (schema, definition, target, model) => {
  const [createAtCol, updatedAtCol] = getTimestampColumns(definition);

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
// RELATION BUILDING
// ============================================================================

const getRef = (name, plugin) => strapi.db.getModel(name, plugin).globalId;

const setField = (definition, name, val) => {
  definition.loadedModel[name] = val;
};

const buildRelationField = (verbose, attribute, definition, name, ObjectId) => {
  const relationHandlers = {
    hasOne: () => {
      const ref = getRef(attribute.model, attribute.plugin);
      setField(definition, name, { type: ObjectId, ref });
    },
    hasMany: () => {
      const FK = _.find(definition.associations, { alias: name });
      const ref = getRef(attribute.collection, attribute.plugin);

      if (FK) {
        setField(definition, name, {
          type: 'virtual',
          ref,
          via: FK.via,
          justOne: false,
        });
        attribute.isVirtual = true;
      } else {
        setField(definition, name, [{ type: ObjectId, ref }]);
      }
    },
    belongsTo: () => {
      const FK = _.find(definition.associations, { alias: name });
      const ref = getRef(attribute.model, attribute.plugin);

      if (FK && !['oneToOne', 'manyToOne', 'oneWay', 'oneToMorph'].includes(FK.nature)) {
        setField(definition, name, {
          type: 'virtual',
          ref,
          via: FK.via,
          justOne: true,
        });
        attribute.isVirtual = true;
      } else {
        setField(definition, name, { type: ObjectId, ref });
      }
    },
    belongsToMany: () => {
      const ref = getRef(attribute.collection, attribute.plugin);
      const FK = _.find(definition.associations, { alias: name });
      const nature = utilsModels.getNature({
        attribute,
        attributeName: name,
        modelName: definition.globalId.toLowerCase(),
      })?.nature;

      if (nature === 'manyWay') {
        setField(definition, name, [{ type: ObjectId, ref }]);
      } else if ((FK && _.isUndefined(FK.via)) || attribute.dominant !== true) {
        setField(definition, name, {
          type: 'virtual',
          ref,
          via: FK?.via,
        });
        attribute.isVirtual = true;
      } else {
        setField(definition, name, [{ type: ObjectId, ref }]);
      }
    },
    morphOne: () => {
      const ref = getRef(attribute.model, attribute.plugin);
      setField(definition, name, { type: ObjectId, ref });
    },
    morphMany: () => {
      const ref = getRef(attribute.collection, attribute.plugin);
      setField(definition, name, [{ type: ObjectId, ref }]);
    },
    belongsToMorph: () => {
      setField(definition, name, {
        kind: String,
        [attribute.filter]: String,
        ref: { type: ObjectId, refPath: `${name}.kind` },
      });
    },
    belongsToManyMorph: () => {
      setField(definition, name, [
        {
          kind: String,
          [attribute.filter]: String,
          ref: { type: ObjectId, refPath: `${name}.kind` },
        },
      ]);
    },
  };

  const handler = relationHandlers[verbose];
  if (handler) handler();
};

const buildRelation = ({ definition, model, instance, attribute, name }) => {
  const { verbose } =
    utilsModels.getNature({
      attribute,
      attributeName: name,
      modelName: model.toLowerCase(),
    }) || {};

  utilsModels.defineAssociations(model.toLowerCase(), definition, attribute, name);

  const { ObjectId } = instance.Schema.Types;
  buildRelationField(verbose, attribute, definition, name, ObjectId);
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
// MAIN MODEL MOUNTING
// ============================================================================

const mountModel = (models, target, instance) => (model) => {
  const definition = models[model];
  definition.orm = 'mongoose';
  definition.associations = [];
  definition.globalName = _.upperFirst(_.camelCase(definition.globalId));
  definition.loadedModel = {};

  const hasDraftAndPublish = contentTypesUtils.hasDraftAndPublish(definition);

  _.defaults(definition, {
    primaryKey: '_id',
    primaryKeyType: 'string',
  });

  const isPrivate = !_.get(definition, 'options.populateCreatorFields', false);
  setup