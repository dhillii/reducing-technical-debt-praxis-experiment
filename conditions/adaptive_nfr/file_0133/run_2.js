```javascript
'use strict';

const _ = require('lodash');
const { contentTypes } = require('strapi-utils');

const {
  hasDraftAndPublish,
  constants: { DP_PUB_STATE_LIVE },
} = contentTypes;

const DynamicZoneScalar = require('../types/dynamiczoneScalar');

const { formatModelConnectionsGQL } = require('./build-aggregation');
const types = require('./type-builder');
const {
  actionExists,
  mergeSchemas,
  convertToParams,
  convertToQuery,
  amountLimiting,
  createDefaultSchema,
} = require('./utils');
const { toSDL, getTypeDescription } = require('./schema-definitions');
const { toSingular, toPlural } = require('./naming');
const { buildQuery, buildMutation } = require('./resolvers-builder');

const OPTIONS = Symbol();

const QUERY_ARGUMENTS = {
  FIND: {
    sort: 'String',
    limit: 'Int',
    start: 'Int',
    where: 'JSON',
    publicationState: 'PublicationState',
  },
  FIND_ONE: {
    id: 'ID!',
    publicationState: 'PublicationState',
  },
};

const MUTATION_ACTIONS = {
  COLLECTION: ['create', 'update', 'delete'],
  SINGLE: ['update', 'delete'],
};

// ============================================================================
// Schema Building
// ============================================================================

const buildShadowCrud = ctx => {
  const models = Object.values(strapi.contentTypes).filter(model => model.plugin !== 'admin');
  const components = Object.values(strapi.components);

  const allSchemas = buildModels([...models, ...components], ctx);

  return mergeSchemas(createDefaultSchema(), ...allSchemas);
};

const buildModels = (models, ctx) => {
  return models.map(model => {
    const { kind, modelType } = model;

    if (modelType === 'component') {
      return buildComponent(model);
    }

    return kind === 'singleType' ? buildSingleType(model, ctx) : buildCollectionType(model, ctx);
  });
};

// ============================================================================
// Model Definition Building
// ============================================================================

const buildModelDefinition = (model, globalType = {}) => {
  const { globalId, primaryKey } = model;
  const typeDefObj = buildTypeDefObj(model);

  const schema = {
    definition: '',
    query: {},
    mutation: {},
    resolvers: {
      Query: {},
      Mutation: {},
      [globalId]: {
        id: parent => parent[primaryKey] || parent.id,
        ...buildAssocResolvers(model),
      },
    },
    typeDefObj,
  };

  schema.definition += generateEnumDefinitions(model, globalId);
  generateDynamicZoneDefinitions(model.attributes, globalId, schema);

  const description = getTypeDescription(globalType, model);
  const fields = toSDL(typeDefObj, globalType, model);
  const typeDef = `${description}type ${globalId} {${fields}}\n`;

  schema.definition += typeDef;
  return schema;
};

const buildComponent = component => {
  const { globalId } = component;
  const schema = buildModelDefinition(component);

  schema.definition += types.generateInputModel(component, globalId, {
    allowIds: true,
  });

  return schema;
};

const buildSingleType = (model, ctx) => {
  const { uid, modelName } = model;
  const singularName = toSingular(modelName);
  const globalType = _.get(ctx.schema, `type.${model.globalId}`, {});

  const localSchema = buildModelDefinition(model, globalType);

  if (globalType === false) {
    return localSchema;
  }

  addQueryToSchema(localSchema, ctx, singularName, uid, model);
  localSchema.definition += types.generateInputModel(model, modelName);
  addMutationsToSchema(localSchema, ctx, model, MUTATION_ACTIONS.SINGLE);

  return localSchema;
};

const buildCollectionType = (model, ctx) => {
  const { plugin, modelName, uid } = model;
  const singularName = toSingular(modelName);
  const pluralName = toPlural(modelName);
  const globalType = _.get(ctx.schema, `type.${model.globalId}`, {});

  const localSchema = buildModelDefinition(model, globalType);

  if (globalType === false) {
    return localSchema;
  }

  addQueryToSchema(localSchema, ctx, singularName, uid, model, QUERY_ARGUMENTS.FIND_ONE);
  addQueryToSchema(localSchema, ctx, pluralName, uid, model, QUERY_ARGUMENTS.FIND, plugin);

  localSchema.definition += types.generateInputModel(model, modelName);
  addMutationsToSchema(localSchema, ctx, model, MUTATION_ACTIONS.COLLECTION);

  return localSchema;
};

// ============================================================================
// Query Building
// ============================================================================

const addQueryToSchema = (schema, ctx, queryName, uid, model, args = QUERY_ARGUMENTS.FIND, plugin = null) => {
  if (!isQueryEnabled(ctx.schema, queryName)) {
    return;
  }

  const resolverOpts = {
    resolver: `${uid}.${queryName === toSingular(model.modelName) ? 'findOne' : 'find'}`,
    ...getQueryInfo(ctx.schema, queryName),
  };

  if (!actionExists(resolverOpts)) {
    return;
  }

  const resolver = buildQuery(queryName, resolverOpts);
  const isPlural = queryName === toPlural(model.modelName);
  const returnType = isPlural ? `[${model.globalId}]` : model.globalId;

  const query = {
    query: {
      [queryName]: {
        args: {
          ...args,
          ...(resolverOpts.args || {}),
        },
        type: returnType,
      },
    },
    resolvers: {
      Query: {
        [queryName]: wrapPublicationStateResolver(resolver),
      },
    },
  };

  _.merge(schema, query);

  if (isPlural && isQueryEnabled(ctx.schema, `${queryName}Connection`)) {
    const aggregationSchema = formatModelConnectionsGQL({
      fields: schema.typeDefObj,
      model,
      name: model.modelName,
      resolver: resolverOpts,
      plugin,
    });

    mergeSchemas(schema, aggregationSchema);
  }
};

// ============================================================================
// Mutation Building
// ============================================================================

const addMutationsToSchema = (schema, ctx, model, actions) => {
  actions.forEach(action => {
    const mutationSchema = buildMutationTypeDef({ model, action }, ctx);
    mergeSchemas(schema, mutationSchema);
  });
};

const buildMutationTypeDef = ({ model, action }, ctx) => {
  const capitalizedName = _.upperFirst(toSingular(model.modelName));
  const mutationName = `${action}${capitalizedName}`;

  const resolverOpts = {
    resolver: `${model.uid}.${action}`,
    transformOutput: result => ({ [toSingular(model.modelName)]: result }),
    ...getMutationInfo(ctx.schema, mutationName),
    isShadowCrud: true,
  };

  if (!actionExists(resolverOpts)) {
    return {};
  }

  const definition = types.generateInputPayloadArguments({
    model,
    name: model.modelName,
    mutationName,
    action,
  });

  if (!isMutationEnabled(ctx.schema, mutationName)) {
    return { definition };
  }

  const args = buildMutationArgs(model, action, resolverOpts);

  return {
    definition,
    mutation: {
      [mutationName]: {
        args: {
          ...args,
          ...(resolverOpts.args || {}),
        },
        type: `${mutationName}Payload`,
      },
    },
    resolvers: {
      Mutation: {
        [mutationName]: buildMutation(mutationName, resolverOpts),
      },
    },
  };
};

const buildMutationArgs = (model, action, resolverOpts) => {
  const args = {};

  if (model.kind !== 'singleType' || action !== 'delete') {
    args.input = `${_.upperFirst(toSingular(model.modelName))}${_.upperFirst(action)}Input`;
  }

  return args;
};

// ============================================================================
// Type Definition Building
// ============================================================================

const buildTypeDefObj = model => {
  const { associations = [], attributes, primaryKey, globalId } = model;
  const typeDef = {
    id: 'ID!',
    [primaryKey]: 'ID!',
  };

  addTimestampAttributes(model, typeDef);
  addAttributesToTypeDef(model, attributes, globalId, typeDef);
  addCollectionAssociationsToTypeDef(associations, model, typeDef);

  return typeDef;
};

const addTimestampAttributes = (model, typeDef) => {
  if (_.isArray(_.get(model, 'options.timestamps'))) {
    const [createdAtKey, updatedAtKey] = model.options.timestamps;
    typeDef[createdAtKey] = 'DateTime!';
    typeDef[updatedAtKey] = 'DateTime!';
  }
};

const addAttributesToTypeDef = (model, attributes, globalId, typeDef) => {
  Object.keys(attributes)
    .filter(isNotPrivate(model))
    .filter(attributeName => isTypeAttributeEnabled(model, attributeName))
    .forEach(attributeName => {
      const attribute = attributes[attributeName];
      typeDef[attributeName] = types.convertType({
        attribute,
        modelName: globalId,
        attributeName,
      });
    });
};

const addCollectionAssociationsToTypeDef = (associations, model, typeDef) => {
  associations
    .filter(association => association.type === 'collection')
    .filter(association => isNotPrivate(model, association.alias))
    .filter(association => isTypeAttributeEnabled(model, association.alias))
    .forEach(association => {
      const fieldKey = `${association.alias}(sort: String, limit: Int, start: Int, where: JSON)`;
      typeDef[fieldKey] = typeDef[association.alias];
      delete typeDef[association.alias];
    });
};

// ============================================================================
// Enum & Dynamic Zone Definitions
// ============================================================================

const generateEnumDefinitions = (model, globalId) => {
  const { attributes } = model;
  return Object.keys(attributes)
    .filter(attribute => attributes[attribute].type === 'enumeration')
    .filter(attribute => isTypeAttributeEnabled(model, attribute))
    .map(attribute => {
      const definition = attributes[attribute];
      const name = types.convertEnumType(definition, globalId, attribute);
      const values = definition.enum.map(v => `\t${v}`).join('\n');
      return `enum ${name} {\n${values}\n}\n`;
    })
    .join('');
};

const generateDynamicZoneDefinitions = (attributes, globalId, schema) => {
  Object.keys(attributes)
    .filter(attribute => attributes[attribute].type === 'dynamiczone')
    .forEach(attribute => {
      const { components } = attributes[attribute];
      const typeName = `${globalId}${_.upperFirst(_.camelCase(attribute))}DynamicZone`;

      addDynamicZoneType(schema, typeName, components);
      addDynamicZoneInputType(schema, typeName);
      addDynamicZoneResolver(schema, typeName);
    });
};

const addDynamicZoneType = (schema, typeName, components) => {
  if (components.length === 0) {
    schema.definition += `type ${typeName} { _:Boolean}`;
  } else {
    const componentsTypeNames = components.map(componentUID => {
      const compo = strapi.components[componentUID];
      if (!compo) {
        throw new Error(`Trying to creating dynamiczone type with unkown component ${componentUID}`);
      }
      return compo.globalId;
    });

    const unionType = `union ${typeName} = ${componentsTypeNames.join(' | ')}`;
    schema.definition += `\n${unionType}\n`;
  }
};

const addDynamicZoneInputType = (schema, typeName) => {
  const inputTypeName = `${typeName}Input`;
  schema.definition += `\nscalar ${inputTypeName}\n`;
};

const addDynamicZoneResolver = (schema, typeName) => {
  const inputTypeName = `${typeName}Input`;

  schema.resolvers[typeName] = {
    __resolveType(obj) {
      return strapi.components[obj.__component].globalId;
    },
  };

  schema.resolvers[inputTypeName] = new DynamicZoneScalar({
    name: inputTypeName,
  });
};

// ============================================================================
// Association Resolvers
// ============================================================================

const buildAssocResolvers = model => {
  const { primaryKey, associations = [] } = model;

  return associations
    .filter(association => isNotPrivate(model, association.alias))
    .filter(association => isTypeAttributeEnabled(model, association.alias))
    .reduce((resolver, association) => {
      const target = association.model || association.collection;
      const targetModel = strapi.getModel(target, association.plugin);
      const { nature, alias } = association;

      resolver[alias] = buildAssociationResolver(model, association, targetModel, primaryKey);
      return resolver;
    }, {});
};

const buildAssociationResolver = (model, association, targetModel, primaryKey) => {
  const { nature, alias } = association;

  if (['oneToManyMorph', 'manyMorphToOne', 'manyMorphToMany', 'manyToManyMorph'].includes(nature)) {
    return buildMorphResolver(model, alias, targetModel, primaryKey);
  }

  return buildStandardResolver(model, association, targetModel, primaryKey);
};

const buildMorphResolver = (model, alias, targetModel, primaryKey) => {
  return async obj => {
    if (obj[alias]) {
      return assignOptions(obj[alias], obj);
    }

    const params = {
      ...initQueryOptions(targetModel, obj),
      id: obj[primaryKey],
    };

    const entry = await strapi.query(model.uid).findOne(params, [alias]);
    return assignOptions(entry[alias], obj);
  };
};

const buildStandardResolver = (model, association, targetModel, primaryKey) => {
  return async (obj, options) => {
    if (model.modelType === 'component') {
      obj[alias] = _.get(obj[alias], targetModel.primaryKey, obj[alias]);
    }

    const loader = strapi.plugins.graphql.services['data-loaders'].loaders[targetModel.uid];
    const { nature, alias, via } = association;
    const localId = obj[model.primaryKey];
    const targetPK = targetModel.primaryKey;
    const foreignId = _.get(obj[alias], targetModel.primaryKey, obj[alias]);

    const params = {
      ...initQueryOptions(targetModel, obj),
      ...convertToParams(_.omit(amountLimiting(options), 'where')),
      ...convertToQuery(options.where),
    };

    if (['oneToOne', 'oneWay', 'manyToOne'].includes(nature)) {
      return resolveOneToOneRelation(loader, obj, alias, targetPK, foreignId, params);
    }

    if (nature === 'oneToMany' || (nature === 'manyToMany'