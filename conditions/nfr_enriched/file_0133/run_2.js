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

const FIND_QUERY_ARGUMENTS = {
  sort: 'String',
  limit: 'Int',
  start: 'Int',
  where: 'JSON',
  publicationState: 'PublicationState',
};

const FIND_ONE_QUERY_ARGUMENTS = {
  id: 'ID!',
  publicationState: 'PublicationState',
};

/**
 * Builds a graphql schema from all the contentTypes & components loaded
 * @param {{ schema: object }} ctx
 * @returns {object}
 */
const buildShadowCrud = ctx => {
  const models = Object.values(strapi.contentTypes).filter(model => model.plugin !== 'admin');
  const components = Object.values(strapi.components);

  const allSchemas = buildModels([...models, ...components], ctx);

  return mergeSchemas(createDefaultSchema(), ...allSchemas);
};

const assignOptions = (element, parent) => {
  if (Array.isArray(element)) {
    return element.map(el => assignOptions(el, parent));
  }

  return _.set(element, OPTIONS, _.get(parent, OPTIONS, {}));
};

const isQueryEnabled = (schema, name) => {
  return _.get(schema, `resolver.Query.${name}`) !== false;
};

const getQueryInfo = (schema, name) => {
  return _.get(schema, `resolver.Query.${name}`, {});
};

const isMutationEnabled = (schema, name) => {
  return _.get(schema, `resolver.Mutation.${name}`) !== false;
};

const getMutationInfo = (schema, name) => {
  return _.get(schema, `resolver.Mutation.${name}`, {});
};

const isTypeAttributeEnabled = (model, attr) =>
  _.get(strapi.plugins.graphql, `config._schema.graphql.type.${model.globalId}.${attr}`) !== false;
const isNotPrivate = _.curry((model, attributeName) => {
  return !contentTypes.isPrivateAttribute(model, attributeName);
});

const wrapPublicationStateResolver = query => async (parent, args, ctx, ast) => {
  const results = await query(parent, args, ctx, ast);

  const queryOptions = _.pick(args, 'publicationState');
  return assignOptions(results, { [OPTIONS]: queryOptions });
};

const buildTypeDefObj = model => {
  const { associations = [], attributes, primaryKey, globalId } = model;

  const typeDef = {
    id: 'ID!',
    [primaryKey]: 'ID!',
  };

  addTimestampAttributes(typeDef, model);
  addAttributeFields(typeDef, model, attributes, globalId);
  addCollectionAssociationFields(typeDef, model, associations);

  return typeDef;
};

// Adds timestamp fields to type definition if configured
const addTimestampAttributes = (typeDef, model) => {
  if (_.isArray(_.get(model, 'options.timestamps'))) {
    const [createdAtKey, updatedAtKey] = model.options.timestamps;
    typeDef[createdAtKey] = 'DateTime!';
    typeDef[updatedAtKey] = 'DateTime!';
  }
};

// Adds attribute fields to type definition
const addAttributeFields = (typeDef, model, attributes, globalId) => {
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

// Adds collection association fields with query parameters to type definition
const addCollectionAssociationFields = (typeDef, model, associations) => {
  associations
    .filter(association => association.type === 'collection')
    .filter(association => isNotPrivate(model, association.alias))
    .filter(attributeName => isTypeAttributeEnabled(model, attributeName))
    .forEach(association => {
      typeDef[`${association.alias}(sort: String, limit: Int, start: Int, where: JSON)`] =
        typeDef[association.alias];

      delete typeDef[association.alias];
    });
};

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

// Generates union type or dummy type for dynamic zone
const generateDynamicZoneType = (typeName, components) => {
  if (components.length === 0) {
    return `type ${typeName} { _:Boolean}`;
  }

  const componentsTypeNames = components.map(componentUID => {
    const compo = strapi.components[componentUID];
    if (!compo) {
      throw new Error(
        `Trying to creating dynamiczone type with unkown component ${componentUID}`
      );
    }

    return compo.globalId;
  });

  return `union ${typeName} = ${componentsTypeNames.join(' | ')}`;
};

// Registers dynamic zone resolvers in schema
const registerDynamicZoneResolvers = (schema, typeName, inputTypeName, components, globalId, attribute) => {
  schema.resolvers[typeName] = {
    __resolveType(obj) {
      return strapi.components[obj.__component].globalId;
    },
  };

  schema.resolvers[inputTypeName] = new DynamicZoneScalar({
    name: inputTypeName,
    attribute,
    globalId,
    components,
  });
};

const generateDynamicZoneDefinitions = (attributes, globalId, schema) => {
  Object.keys(attributes)
    .filter(attribute => attributes[attribute].type === 'dynamiczone')
    .forEach(attribute => {
      const { components } = attributes[attribute];

      const typeName = `${globalId}${_.upperFirst(_.camelCase(attribute))}DynamicZone`;

      const typeDefinition = generateDynamicZoneType(typeName, components);
      schema.definition += `\n${typeDefinition}\n`;

      const inputTypeName = `${typeName}Input`;
      schema.definition += `\nscalar ${inputTypeName}\n`;

      registerDynamicZoneResolvers(schema, typeName, inputTypeName, components, globalId, attribute);
    });
};

const initQueryOptions = (targetModel, parent) => {
  if (hasDraftAndPublish(targetModel)) {
    return {
      _publicationState: _.get(parent, [OPTIONS, 'publicationState'], DP_PUB_STATE_LIVE),
    };
  }

  return {};
};

// Handles morphic association resolvers
const buildMorphicAssocResolver = (model, association, primaryKey) => {
  const target = association.model || association.collection;
  const targetModel = strapi.getModel(target, association.plugin);
  const { alias } = association;

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

// Handles one-to-one, one-way, and many-to-one association resolvers
const buildSingleAssocResolver = (model, association, targetModel, options) => {
  const { alias, nature } = association;
  const targetPK = targetModel.primaryKey;

  return async (obj, opts) => {
    if (model.modelType === 'component') {
      obj[alias] = _.get(obj[alias], targetModel.primaryKey, obj[alias]);
    }

    const loader = strapi.plugins.graphql.services['data-loaders'].loaders[targetModel.uid];
    const foreignId = _.get(obj[alias], targetModel.primaryKey, obj[alias]);

    const params = {
      ...initQueryOptions(targetModel, obj),
      ...convertToParams(_.omit(amountLimiting(opts), 'where')),
      ...convertToQuery(opts.where),
    };

    if (!_.has(obj, alias) || _.isNil(foreignId)) {
      return null;
    }

    if (_.has(obj[alias], targetPK)) {
      return assignOptions(obj[alias], obj);
    }

    const query = {
      single: true,
      filters: {
        ...params,
        [targetPK]: foreignId,
      },
    };

    return loader.load(query).then(r => assignOptions(r, obj));
  };
};

// Handles one-to-many and non-dominant many-to-many association resolvers
const buildOneToManyAssocResolver = (model, association, targetModel, options) => {
  const { alias, via } = association;

  return async (obj, opts) => {
    if (model.modelType === 'component') {
      obj[alias] = _.get(obj[alias], targetModel.primaryKey, obj[alias]);
    }

    const loader = strapi.plugins.graphql.services['data-loaders'].loaders[targetModel.uid];
    const localId = obj[model.primaryKey];

    const params = {
      ...initQueryOptions(targetModel, obj),
      ...convertToParams(_.omit(amountLimiting(opts), 'where')),
      ...convertToQuery(opts.where),
    };

    const filters = {
      ...params,
      [via]: localId,
    };

    return loader.load({ filters }).then(r => assignOptions(r, obj));
  };
};

// Handles many-way and dominant many-to-many association resolvers
const buildManyToManyAssocResolver = (model, association, targetModel, options) => {
  const { alias } = association;
  const targetPK = targetModel.primaryKey;
  const primaryKey = model.primaryKey;

  return async (obj, opts) => {
    if (model.modelType === 'component') {
      obj[alias] = _.get(obj[alias], targetModel.primaryKey, obj[alias]);
    }

    const loader = strapi.plugins.graphql.services['data-loaders'].loaders[targetModel.uid];

    const params = {
      ...initQueryOptions(targetModel, obj),
      ...convertToParams(_.omit(amountLimiting(opts), 'where')),
      ...convertToQuery(opts.where),
    };

    let targetIds = [];

    if (Array.isArray(obj[alias])) {
      targetIds = obj[alias].map(value => value[targetPK] || value);
    } else {
      const entry = await strapi
        .query(model.uid)
        .findOne({ [primaryKey]: obj[primaryKey] }, [alias]);

      if (_.isEmpty(entry[alias])) {
        return [];
      }

      targetIds = entry[alias].map(el => el[targetPK]);
    }

    const filters = {
      ...params,
      [`${targetPK}_in`]: targetIds.map(_.toString),
    };

    return loader.load({ filters }).then(r => assignOptions(r, obj));
  };
};

const buildAssocResolvers = model => {
  const { primaryKey, associations = [] } = model;

  return associations
    .filter(association => isNotPrivate(model, association.alias))
    .filter(association => isTypeAttributeEnabled(model, association.alias))
    .reduce((resolver, association) => {
      const target = association.model || association.collection;
      const targetModel = strapi.getModel(target, association.plugin);
      const { nature, alias } = association;

      switch (nature) {
        case 'oneToManyMorph':
        case 'manyMorphToOne':
        case 'manyMorphToMany':
        case 'manyToManyMorph': {
          resolver[alias] = buildMorphicAssocResolver(model, association, primaryKey);
          break;
        }
        case 'oneToOne':
        case 'oneWay':
        case 'manyToOne': {
          resolver[alias] = buildSingleAssocResolver(model, association, targetModel);
          break;
        }
        case 'oneToMany': {
          resolver[alias] = buildOneToManyAssocResolver(model, association, targetModel);
          break;
        }
        case 'manyToMany': {
          if (association.dominant !== true) {
            resolver[alias] = buildOneToManyAssocResolver(model, association, targetModel);
          } else {
            resolver[alias] = buildManyToManyAssocResolver(model, association, targetModel);
          }
          break;
        }
        case 'manyWay': {
          resolver[alias] = buildManyToManyAssocResolver(model, association, targetModel);
          break;
        }
      }

      return resolver;
    }, {});
};

/**
 * Construct the GraphQL query & definition and apply the right resolvers.
 *
 * @return Object
 */
const buildModels = (models, ctx) => {
  return models.map(model => {
    const { kind, modelType } = model;

    if (modelType === 'component') {
      return buildComponent(model);
    }

    switch (kind) {
      case 'singleType':
        return buildSingleType(model, ctx);
      default:
        return buildCollectionType(model, ctx);
    }
  });
};

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

// Builds query for single type
const buildSingleTypeQuery = (model, ctx, singularName) => {
  if (!isQueryEnabled(ctx.schema, singularName)) {
    return null;
  }

  const resolverOpts = {
    resolver: `${model.uid}.find`,
    ...getQueryInfo(ctx.schema, singularName),
  };

  const resolver = buildQuery(singularName, resolverOpts);

  return {
    query: {
      [singularName]: {
        args: {
          publicationState: 'PublicationState',
          ...(resolverOpts.args || {}),
        },
        type: model.globalId,
      },
    },
    resolvers: {
      Query: {
        [singularName]: wrapPublicationStateResolver(resolver),
      },
    },
  };
};

// Builds mutations for single type
const buildSingleTypeMutations = (model, ctx) => {
  const mutations = [];

  ['update', 'delete'].forEach(action => {
    const mutationSchema = buildMutationTypeDef({ model, action }, ctx);
    mutations.push(mutationSchema);
  });

  return mutations;
};

const buildSingleType = (model, ctx) => {
  const { modelName } = model;

  const singularName = toSingular(modelName);

  const globalType = _.get(ctx.schema, `type.${model.globalId}`, {});

  const localSchema = buildModelDefinition(model, globalType);

  // Add definition to the schema but this type won't be "queriable" or "mutable".
  if (globalType === false) {
    return localSchema;
  }

  const querySchema = buildSingleTypeQuery(model, ctx, singularName);
  if (querySchema) {
    _.merge(localSchema, querySchema);
  }

  // Add model Input definition.
  localSchema.definition += types.generateInputModel(model, modelName);

  // build every mutation
  const mutations = buildSingleTypeMutations(model, ctx);
  mutations.forEach(mutationSchema => {
    mergeSchemas(localSchema, mutationSchema);
  });

  return localSchema;
};

// Builds find-one query for collection type
const buildCollectionFindOneQuery = (model, ctx, singularName) => {
  if (!isQueryEnabled(ctx.schema, singularName)) {
    return null;
  }

  const resolverOpts = {
    resolver: `${model.uid}.findOne`,
    ...getQueryInfo(ctx.schema, singularName),
  };

  if (!actionExists(resolverOpts)) {
    return null;
  }

  const resolver = buildQuery(singularName, resolverOpts);

  return {
    query: {
      [singularName]: {
        args: {
          ...FIND_ONE_QUERY_ARGUMENTS,
          ...(resolverOpts.args || {}),
        },
        type: model.globalId,
      },
    },
    resolvers: {
      Query: {
        [singularName]: wrapPublicationStateResolver(resolver),
      },
    },
  };
};

// Builds find (plural) query for collection type
const buildCollectionFindQuery = (model, ctx, pluralName, typeDefObj, plugin) => {
  if (!isQueryEnabled(ctx.schema, pluralName)) {
    return null;
  }

  const resolverOpts = {
    resolver: `${model.uid}.find`,
    ...getQueryInfo(ctx.schema, pluralName),
  };

  if (!actionExists(resolverOpts)) {
    return null;
  }

  const resolver = buildQuery(pluralName, resolverOpts);

  const querySchema = {
    query: {
      [pluralName]: {
        args: {
          ...FIND_QUERY_ARGUMENTS,
          ...(resolverOpts.args || {}),
        },
        type: `[${model.globalId}]`,
      },
    },
    resolvers: {
      Query: {
        [pluralName]: wrapPublicationStateResolver(resolver),
      },
    },
  };

  // Add aggregation if connection query is enabled
  if (isQueryEnabled(ctx.schema, `${pluralName}Connection`)) {
    const aggregationSchema = formatModelConnectionsGQL({
      fields: typeDefObj,
      model,
      name: model.modelName,
      resolver: resolverOpts,
      plugin,
    });

    return {
      ...querySchema,
      aggregation: aggregationSchema,
    };
  }

  return querySchema;
};

// Builds mutations for collection type
const buildCollectionMutations = (model, ctx) => {
  const mutations = [];

  ['create', 'update', 'delete'].forEach(action => {
    const mutationSchema = buildMutationTypeDef({ model, action }, ctx);
    mutations.push(mutationSchema);
  });

  return mutations;
};

const buildCollectionType = (model, ctx) => {
  const { plugin, modelName } = model;

  const singularName = toSingular(modelName);
  const pluralName = toPlural(modelName);

  const globalType = _.get(ctx.schema, `type.${model.globalId}`, {});

  const localSchema = buildModelDefinition(model, globalType);
  const { typeDefObj } = localSchema;

  // Add definition to the schema but this type won't be "queriable" or "mutable".
  if (globalType === false) {
    return localSchema;
  }

  const findOneQuery = buildCollectionFindOneQuery(model, ctx, singularName);
  if (findOneQuery) {
    _.merge(localSchema, findOneQuery);
  }

  const findQuery = buildCollectionFindQuery(model, ctx, pluralName, typeDefObj, plugin);
  if (findQuery) {
    _.merge(localSchema, findQuery);
    if (findQuery.aggregation) {
      mergeSchemas(localSchema, findQuery.aggregation);
    }
  }

  // Add model Input definition.
  localSchema.definition += types.generateInputModel(model, modelName);

  // build every mutation
  const mutations = buildCollectionMutations(model, ctx);
  mutations.forEach(mutationSchema => {
    mergeSchemas(localSchema, mutationSchema);
  });

  return localSchema;
};

// TODO:
// - Implement batch methods (need to update the content-manager as well).
// - Implement nested transactional methods (create/update).
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

  // ignore if disabled
  if (!isMutationEnabled(ctx.schema, mutationName)) {
    return {
      definition,
    };
  }

  const { kind } = model;

  const args = {};

  if (kind !== 'singleType' || action !== 'delete') {
    Object.assign(args, {
      input: `${mutationName}Input`,
    });
  }

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

module.exports = buildShadowCrud;