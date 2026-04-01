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

const isSystemModel = definition => {
  return definition.uid.startsWith('strapi::');
};

const isComponentModel = definition => {
  return definition.modelType === 'component';
};

const shouldAddSystemAttributes = definition => {
  return !isSystemModel(definition) && !isComponentModel(definition);
};

const shouldPopulateCreatorFields = definition => {
  return _.get(definition, 'options.populateCreatorFields', false);
};

const isComponentOrDynamicZone = attr => {
  return ['component', 'dynamiczone'].includes(attr.type);
};

const isScalarAttribute = attr => {
  const { type } = attr;
  return type !== undefined && type !== null && type !== 'component' && type !== 'dynamiczone';
};

const isRelationalAttribute = attr => {
  return attr.type === undefined;
};

const isDecimal128 = value => {
  return value instanceof mongoose.Types.Decimal128;
};

const isArrayWithLength = value => {
  return Array.isArray(value) && value.length > 0;
};

const isMorphAssociationWithData = (association, returned) => {
  return isArrayWithLength(returned[association.alias]);
};

const isComponentType = attr => attr.type === 'component';

const isDynamicZoneType = attr => attr.type === 'dynamiczone';

const hasValidDynamicZoneData = value => {
  return value && Array.isArray(value);
};

const isValidDynamicZoneElement = el => {
  return el && el.kind;
};

const hasRelationData = (association, returned) => {
  return returned[association.alias];
};

const shouldPickPopulate = association => {
  return _.isArray(association.populate);
};

const isProductionEnv = env => {
  return env === 'production';
};

const isOneToManyMorph = nature => {
  return ['oneToManyMorph', 'manyToManyMorph'].includes(nature);
};

const shouldAutoPopulate = assoc => {
  return assoc.autoPopulate !== false;
};

const isNonPolymorphicAssoc = assoc => {
  return !isPolymorphicAssoc(assoc);
};

const isVirtualField = field => {
  return field.type === 'virtual';
};

const isNotVirtualField = field => {
  return field.type !== 'virtual';
};

const isOneToOneRelation = nature => {
  return nature === 'oneToOne';
};

const isManyToOneRelation = nature => {
  return nature === 'manyToOne';
};

const isOneWayRelation = nature => {
  return nature === 'oneWay';
};

const isOneToMorphRelation = nature => {
  return nature === 'oneToMorph';
};

const isVirtualBelongsToRelation = (FK, nature) => {
  if (!FK) return false;
  return !(
    isOneToOneRelation(nature) ||
    isManyToOneRelation(nature) ||
    isOneWayRelation(nature) ||
    isOneToMorphRelation(nature)
  );
};

const isManyWayRelation = nature => {
  return nature === 'manyWay';
};

const shouldBeVirtualBelongsToMany = (FK, attribute) => {
  return (FK && _.isUndefined(FK.via)) || attribute.dominant !== true;
};

module.exports = async ({ models, target }, ctx) => {
  const { instance } = ctx;

  function initializeDefinition(definition) {
    definition.orm = 'mongoose';
    definition.associations = [];
    definition.globalName = _.upperFirst(_.camelCase(definition.globalId));
    definition.loadedModel = {};

    _.defaults(definition, {
      primaryKey: '_id',
      primaryKeyType: 'string',
    });
  }

  function addSystemAttributes(definition) {
    if (!shouldAddSystemAttributes(definition)) {
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

    const isPrivate = !shouldPopulateCreatorFields(definition);

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

  function getAttributesByType(definition) {
    const componentAttributes = Object.keys(definition.attributes).filter(key =>
      isComponentOrDynamicZone(definition.attributes[key])
    );

    const scalarAttributes = Object.keys(definition.attributes).filter(key =>
      isScalarAttribute(definition.attributes[key])
    );

    const relationalAttributes = Object.keys(definition.attributes).filter(key =>
      isRelationalAttribute(definition.attributes[key])
    );

    return { componentAttributes, scalarAttributes, relationalAttributes };
  }

  function handleComponentAttributes(definition, componentAttributes) {
    if (componentAttributes.length === 0) {
      return;
    }

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

  function handleScalarAttributes(definition, scalarAttributes, instance) {
    const hasDraftAndPublish = contentTypesUtils.hasDraftAndPublish(definition);

    scalarAttributes.forEach(name => {
      const attr = definition.attributes[name];
      definition.loadedModel[name] = {
        ...attr,
        ...utils(instance).convertType(name, attr),
        required:
          definition.modelType === 'compo' || hasDraftAndPublish ? false : definition.required,
      };
    });
  }

  function handleRelationalAttributes(definition, relationalAttributes, model, instance) {
    relationalAttributes.forEach(name => {
      buildRelation({
        definition,
        model,
        instance,
        name,
        attribute: definition.attributes[name],
      });
    });
  }

  function createSchema(definition, instance) {
    return new instance.Schema(
      _.omitBy(definition.loadedModel, ({ type }) => type === 'virtual')
    );
  }

  function addPreHooks(schema, definition, componentAttributes) {
    const findLifecycles = ['find', 'findOne', 'findOneAndUpdate', 'findOneAndRemove'];
    const morphAssociations = definition.associations.filter(isPolymorphicAssoc);

    const populateFn = createOnFetchPopulateFn({
      componentAttributes,
      morphAssociations,
      definition,
    });

    findLifecycles.forEach(key => {
      schema.pre(key, populateFn);
    });
  }

  function addVirtualFields(schema, definition) {
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
  }

  function configureTimestamps(definition, schema, target, model) {
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
  }

  function refToStrapiRef(obj) {
    const ref = obj.ref;
    let plainData = ref && typeof ref.toJSON === 'function' ? ref.toJSON() : ref;

    if (typeof plainData !== 'object') return ref;

    return {
      __contentType: obj.kind,
      ...ref,
    };
  }

  function parseComponentRef(el) {
    if (el.ref instanceof mongoose.Types.ObjectId) {
      return el.ref.toString();
    }
    return el.ref;
  }

  function parseDynamicZoneRef(el) {
    if (el.ref instanceof mongoose.Types.ObjectId) {
      return { id: el.ref.toString() };
    }
    return el.ref;
  }

  function transformDecimalValues(returned) {
    Object.keys(returned)
      .filter(key => isDecimal128(returned[key]))
      .forEach(key => {
        returned[key] = parseFloat(returned[key].toString());
      });
  }

  function transformMorphAssociations(returned, morphAssociations) {
    morphAssociations.forEach(association => {
      if (!isMorphAssociationWithData(association, returned)) {
        return;
      }

      const { alias, nature } = association;

      if (nature === 'oneMorphToOne') {
        returned[alias] = refToStrapiRef(returned[alias][0]);
      } else if (nature === 'manyMorphToMany' || nature === 'manyMorphToOne') {
        returned[alias] = returned[alias].map(obj => refToStrapiRef(obj));
      }
    });
  }

  function transformComponentAttributes(returned, componentAttributes, definition) {
    componentAttributes.forEach(name => {
      const attribute = definition.attributes[name];

      if (isComponentType(attribute)) {
        transformComponentField(returned, name, attribute);
      }

      if (isDynamicZoneType(attribute)) {
        transformDynamicZoneField(returned, name);
      }
    });
  }

  function transformComponentField(returned, name, attribute) {
    if (!Array.isArray(returned[name])) {
      return;
    }

    const components = returned[name].map(parseComponentRef);
    returned[name] =
      attribute.repeatable === true ? components : _.first(components) || null;
  }

  function transformDynamicZoneField(returned, name) {
    if (!hasValidDynamicZoneData(returned[name])) {
      return;
    }

    returned[name] = returned[name]
      .filter(isValidDynamicZoneElement)
      .map(el => {
        return {
          __component: findComponentByGlobalId(el.kind).uid,
          ...parseDynamicZoneRef(el),
        };
      });
  }

  function transformAssociations(returned, associations) {
    associations.forEach(association => {
      if (!hasRelationData(association, returned)) {
        return;
      }

      const relation = returned[association.alias];
      returned[association.alias] = relation.toJSON ? relation.toJSON() : relation;

      if (shouldPickPopulate(association)) {
        applyPopulateFilter(returned, association);
      }
    });
  }

  function applyPopulateFilter(returned, association) {
    const { alias, populate } = association;
    const pickPopulate = entry => _.pick(entry, populate);

    returned[alias] = _.isArray(returned[alias])
      ? _.map(returned[alias], pickPopulate)
      : pickPopulate(returned[alias]);
  }

  function configureSchemaTransform(schema, definition, componentAttributes, morphAssociations) {
    const associations = definition.associations.filter(isNonPolymorphicAssoc);

    schema.options.toObject = schema.options.toJSON = {
      virtuals: true,
      transform: function(doc, returned) {
        transformDecimalValues(returned);
        transformMorphAssociations(returned, morphAssociations);
        transformComponentAttributes(returned, componentAttributes, definition);
        transformAssociations(returned, associations);
      },
    };
  }

  function handleIndexErrors(Model) {
    Model.on('index', error => {
      if (!error) {
        return;
      }

      if (error.code === 11000) {
        strapi.log.error(
          `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${error.message}`
        );
      } else {
        strapi.log.error(`An index error happened, it wasn't applied.\n\t- ${error.message}`);
      }
    });
  }

  function syncModelIndexes(Model) {
    if (isProductionEnv(strapi.app.env)) {
      handleIndexErrors(Model);
    } else {
      Model.syncIndexes(null, handleIndexErrors);
    }
  }

  function finalizeModel(Model, target, model, definition) {
    target[model] = _.assign(Model, target[model]);
    target[model]._attributes = definition.attributes;
    target[model].updateRelations = relations.update;
    target[model].deleteRelations = relations.deleteRelations;
    target[model].privateAttributes = contentTypesUtils.getPrivateAttributes(target[model]);
  }

  function mountModel(model) {
    const definition = models[model];

    initializeDefinition(definition);
    addSystemAttributes(definition);

    const { componentAttributes, scalarAttributes, relationalAttributes } = getAttributesByType(definition);

    handleComponentAttributes(definition, componentAttributes);
    handleScalarAttributes(definition, scalarAttributes, instance);
    handleRelationalAttributes(definition, relationalAttributes, model, instance);

    const schema = createSchema(definition, instance);

    addPreHooks(schema, definition, componentAttributes);
    addVirtualFields(schema, definition);

    target[model].allAttributes = _.clone(definition.attributes);

    configureTimestamps(definition, schema, target, model);

    schema.set('minimize', _.get(definition, 'options.minimize', false) === true);

    const morphAssociations = definition.associations.filter(isPolymorphicAssoc);
    configureSchemaTransform(schema, definition, componentAttributes, morphAssociations);

    const Model = instance.model(definition.globalId, schema, definition.collectionName);

    syncModelIndexes(Model);
    finalizeModel(Model, target, model, definition);
  }

  Object.keys(models).forEach(mountModel);

  // Migrations + storing schema
  for (const model of Object.keys(models)) {
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
  }
};

const migrateSchema = () => {};

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
      populateMorphRelations(this, morphAssociations, populatedPaths, publicationState, getMatchQuery);
    }

    if (_populateComponents) {
      componentAttributes.forEach(key => {
        this.populate({ path: `${key}.ref`, options: { publicationState } });
      });
    }

    if (definition.modelType === 'component') {
      populateComponentAssociations(this, definition, publicationState, getMatchQuery);
    }
  };
};

function populateMorphRelations(context, morphAssociations, populatedPaths, publicationState, getMatchQuery) {
  morphAssociations.forEach(association => {
    const matchQuery = getMatchQuery(association);
    const { alias, nature } = association;

    if (isOneToManyMorph(nature)) {
      context.populate({ path: alias, match: matchQuery, options: { publicationState } });
    } else if (populatedPaths.includes(alias)) {
      setMorphPopulateOptions(context, alias, publicationState, matchQuery);
    }
  });
}

function setMorphPopulateOptions(context, alias, publicationState, matchQuery) {
  _.set(context._mongooseOptions.populate, [alias, 'path'], `${alias}.ref`);
  _.set(context._mongooseOptions.populate, [alias, 'options'], {
    publicationState,
  });

  if (matchQuery !== undefined) {
    _.set(context._mongooseOptions.populate, [alias, 'match'], matchQuery);
  }
}

function populateComponentAssociations(context, definition, publicationState, getMatchQuery) {
  definition.associations
    .filter(isNonPolymorphicAssoc)
    .filter(shouldAutoPopulate)
    .forEach(ast => {
      context.populate({
        path: ast.alias,
        match: getMatchQuery(ast),
        options: { publicationState, _populateComponents: false },
      });
    });
}

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
      buildHasOneRelation(attribute, getRef, setField, name);
      break;
    case 'hasMany':
      buildHasManyRelation(definition, attribute, getRef, setField, name);
      break;
    case 'belongsTo':
      buildBelongsToRelation(definition, attribute, getRef, setField, name);
      break;
    case 'belongsToMany':
      buildBelongsToManyRelation(definition, attribute, nature, getRef, setField, name);
      break;
    case 'morphOne':
      buildMorphOneRelation(attribute, getRef, setField, name);
      break;
    case 'morphMany':
      buildMorphManyRelation(attribute, getRef, setField, name);
      break;
    case 'belongsToMorph':
      buildBelongsToMorphRelation(attribute, setField, name);
      break;
    case 'belongsToManyMorph':
      buildBelongsToManyMorphRelation(attribute, setField, name);
      break;
    default:
      break;
  }
};

function buildHasOneRelation(attribute, getRef, setField, name) {
  const ref = getRef(attribute.model, attribute.plugin);
  setField(name, { type: mongoose.Schema.Types.ObjectId, ref });
}

function buildHasManyRelation(definition, attribute, getRef, setField, name) {
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
    setField(name, [{ type: mongoose.Schema.Types.ObjectId, ref }]);
  }
}

function buildBelongsToRelation(definition, attribute, getRef, setField, name) {
  const FK = _.find(definition.associations, { alias: name });
  const ref = getRef(attribute.model, attribute.plugin);

  if (FK && isVirtualBelongsToRelation(FK, FK.nature)) {
    setField(name, {
      type: 'virtual',
      ref,
      via: FK.via,
      justOne: true,
    });
    attribute.isVirtual = true;
  } else {
    setField(name, { type: mongoose.Schema.Types.ObjectId, ref });
  }
}

function buildBelongsToManyRelation(definition, attribute, nature, getRef, setField, name) {
  const ref = getRef(attribute.collection, attribute.plugin);

  if (isManyWayRelation(nature)) {
    setField(name, [{ type: mongoose.Schema.Types.ObjectId, ref }]);
  } else {
    buildBelongsToManyNonManyWay(definition, attribute, ref, setField, name);
  }
}

function buildBelongsToManyNonManyWay(definition, attribute, ref, setField, name) {
  const FK = _.find(definition.associations, { alias: name });

  if (shouldBeVirtualBelongsToMany(FK, attribute)) {
    setField(name, {
      type: 'virtual',
      ref,
      via: FK.via,
    });
    attribute.isVirtual = true;
  } else {
    setField(name, [{ type: mongoose.Schema.Types.ObjectId, ref }]);
  }
}

function buildMorphOneRelation(attribute, getRef, setField, name) {
  const ref = getRef(attribute.model, attribute.plugin);
  setField(name, { type: mongoose.Schema.Types.ObjectId, ref });
}

function buildMorphManyRelation(attribute, getRef, setField, name) {
  const ref = getRef(attribute.collection, attribute.plugin);
  setField(name, [{ type: mongoose.Schema.Types.ObjectId, ref }]);
}

function buildBelongsToMorphRelation(attribute, setField, name) {
  setField(name, {
    kind: String,
    [attribute.filter]: String,
    ref: { type: mongoose.Schema.Types.ObjectId, refPath: `${name}.kind` },
  });
}

function buildBelongsToManyMorphRelation(attribute, setField, name) {
  setField(name, [
    {
      kind: String,
      [attribute.filter]: String,
      ref: { type: mongoose.Schema.Types.ObjectId, refPath: `${name}.kind` },
    },
  ]);
}
```