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

const addTimestampAttributes = (typeDef, model) => {
  if (_.isArray(_.get(model, 'options.timestamps'))) {
    const [createdAtKey, updatedAtKey] = model.options.timestamps;
    typeDef[createdAtKey] = 'DateTime!';
    typeDef[updatedAtKey] = 'DateTime!';
  }
};

const addAttributesToTypeDef = (typeDef, model) => {
  const { attributes, globalId } = model;
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

const addCollectionAssociationsToTypeDef = (typeDef, model) => {
  const { associations = [] } = model;
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

const buildTypeDefObj = model => {
  const { primaryKey } = model;

  const typeDef = {
    id: 'ID!',
    [primaryKey]: 'ID!',
  };

  addTimestampAttributes(typeDef, model);
  addAttributesToTypeDef(typeDef, model);
  addCollectionAssociationsToTypeDef(typeDef, model);

  return typeDef;
};

const buildEnumDefinition = (attribute, globalId, attributeName) => {
  const name = types.convertEnumType(attribute, globalId, attributeName);
  const values = attribute.enum.map(v => `\t${v}`).join('\n');
  return `enum ${name} {\n${values}\n}\n`;
};

const generateEnumDefinitions = (model, globalId) => {
  const { attributes } = model;
  return Object.keys(attributes)
    .filter(attribute => attributes[attribute].type === 'enumeration')
    .filter(attribute => isTypeAttributeEnabled(model, attribute))
    .map(attribute => buildEnumDefinition(attributes[attribute], globalId, attribute))
    .join('');
};

const buildEmptyDynamicZoneType = (typeName, schema) => {
  schema.definition += `type ${typeName} { _:Boolean}`;
};

const buildDynamicZoneUnion = (typeName, components, schema) => {
  const componentsTypeNames = components.map(componentUID => {
    const compo = strapi.components[componentUID];
    if (!compo) {
      throw new Error(
        `Trying to creating dynamiczone type with unkown component ${componentUID}`
      );
    }

    return compo.globalId;
  });

  const unionType = `union ${typeName} = ${componentsTypeNames.join(' | ')}`;
  schema.definition += `\n${unionType}\n`;
};

const addDynamicZoneResolvers = (typeName, inputTypeName, components, globalId, schema) => {
  schema.resolvers[typeName] = {
    __resolveType(obj) {
      return strapi.components[obj.__component].globalId;
    },
  };

  schema.resolvers[inputTypeName] = new DynamicZoneScalar({
    name: inputTypeName,
    attribute: globalId,
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

      if (components.length === 0) {
        buildEmptyDynamicZoneType(typeName, schema);
      } else {
        buildDynamicZoneUnion(typeName, components, schema);
      }

      const inputTypeName = `${typeName}Input`;
      schema.definition += `\nscalar ${inputTypeName}\n`;

      addDynamicZoneResolvers(typeName, inputTypeName, components, attribute, schema);
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

const buildMorphAssocResolver = (model, association, targetModel, primaryKey) => {
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

const buildOneToOneResolver = (targetModel, obj, options, model, association) => {
  const targetPK = targetModel.primaryKey;
  const foreignId = _.get(obj[association.alias], targetModel.primaryKey, obj[association.alias]);

  if (!_.has(obj, association.alias) || _.isNil(foreignId)) {
    return null;
  }

  if (_.has(obj[association.alias], targetPK)) {
    return assignOptions(obj[association.alias], obj);
  }

  const loader = strapi.plugins.graphql.services['data-loaders'].loaders[targetModel.uid];
  const params = {
    ...initQueryOptions(targetModel, obj),
    ...convertToParams(_.omit(amountLimiting(options), 'where')),
    ...convertToQuery(options.where),
  };

  const query = {
    single: true,
    filters: {
      ...params,
      [targetPK]: foreignId,
    },
  };

  return loader.load(query).then(r => assignOptions(r, obj));
};

const buildOneToManyResolver = (targetModel, obj, options, association) => {
  const loader = strapi.plugins.graphql.services['data-loaders'].loaders[targetModel.uid];
  const { via } = association;
  const localId = obj[association.model ? association.model.primaryKey : 'id'];

  const params = {
    ...initQueryOptions(targetModel, obj),
    ...convertToParams(_.omit(amountLimiting(options), 'where')),
    ...convertToQuery(options.where),
  };

  const filters = {
    ...params,
    [via]: localId,
  };

  return loader.load({ filters }).then(r => assignOptions(r, obj));
};

const buildManyToManyResolver = async (targetModel, obj, options, model, association, primaryKey) => {
  const loader = strapi.plugins.graphql.services['data-loaders'].loaders[targetModel.uid];
  const targetPK = targetModel.primaryKey;
  let targetIds = [];

  if (Array.isArray(obj[association.alias])) {
    targetIds = obj[association.alias].map(value => value[targetPK] || value);
  } else {
    const entry = await strapi
      .query(model.uid)
      .findOne({ [primaryKey]: obj[primaryKey] }, [association.alias]);

    if (_.isEmpty(entry[association.alias])) {
      return [];
    }

    targetIds = entry[association.alias].map(el => el[targetPK]);
  }

  const params = {
    ...initQueryOptions(targetModel, obj),
    ...convertToParams(_.omit(amountLimiting(options), 'where')),
    ...convertToQuery(options.where),
  };

  const filters = {
    ...params,
    [`${targetPK}_in`]: targetIds.map(_.toString),
  };

  return loader.load({ filters }).then(r => assignOptions(r, obj));
};

const buildDefaultAssocResolver = (model, association, targetModel, primaryKey) => {
  const { nature, alias } = association;

  return async (obj, options) => {
    if (model.modelType === 'component') {
      obj[alias] = _.get(obj[alias], targetModel.primaryKey, obj[alias]);
    }

    if (['oneToOne', 'oneWay', 'manyToOne'].includes(nature)) {
      return buildOneToOneResolver(targetModel, obj, options, model, association);
    }

    if (
      nature === 'oneToMany' ||
      (nature === 'manyToMany' && association.dominant !== true)
    ) {
      return buildOneToManyResolver(targetModel, obj, options, association);
    }

    if (
      nature === 'manyWay' ||
      (nature === 'manyToMany' && association.dominant === true)
    ) {
      return buildManyToManyResolver(targetModel, obj, options, model, association, primaryKey);
    }
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

      if (['oneToManyMorph', 'manyMorphToOne', 'manyMorphToMany', 'manyToManyMorph'].includes(nature)) {
        resolver[alias] = buildMorphAssocResolver(model, association, targetModel, primaryKey);
      } else {
        resolver[alias] = buildDefaultAssocResolver(model, association, targetModel, primaryKey);
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

const buildSingleTypeQuery = (model, ctx, singularName, localSchema) => {
  if (!isQueryEnabled(ctx.schema, singularName)) {
    return;
  }

  const resolverOpts = {
    resolver: `${model.uid}.find`,
    ...getQueryInfo(ctx.schema, singularName),
  };

  const resolver = buildQuery(singularName, resolverOpts);

  const query = {
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

  _.merge(localSchema, query);
};

const buildSingleTypeMutations = (model, ctx, localSchema) => {
  ['update', 'delete'].forEach(action => {
    const mutationSchema = buildMutationTypeDef({ model, action }, ctx);
    mergeSchemas(localSchema, mutationSchema);
  });
};

const buildSingleType = (model, ctx) => {
  const { modelName } = model;

  const singularName = toSingular(modelName);

  const globalType = _.get(ctx.schema, `type.${model.globalId}`, {});

  const localSchema = buildModelDefinition(model, globalType);

  if (globalType === false) {
    return localSchema;
  }

  buildSingleTypeQuery(model, ctx, singularName, localSchema);

  localSchema.definition += types.generateInputModel(model, modelName);

  buildSingleTypeMutations(model, ctx, localSchema);

  return localSchema;
};

const buildCollectionTypeSingularQuery = (model, ctx, singularName, localSchema) => {
  if (!isQueryEnabled(ctx.schema, singularName)) {
    return;
  }

  const resolverOpts = {
    resolver: `${model.uid}.findOne`,
    ...getQueryInfo(ctx.schema, singularName),
  };

  if (!actionExists(resolverOpts)) {
    return;
  }

  const resolver = buildQuery(singularName, resolverOpts);

  const query = {
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

  _.merge(localSchema, query);
};

const buildCollectionTypePluralQuery = (model, ctx, pluralName, localSchema) => {
  if (!isQueryEnabled(ctx.schema, pluralName)) {
    return;
  }

  const resolverOpts = {
    resolver: `${model.uid}.find`,
    ...getQueryInfo(ctx.schema, pluralName),
  };

  if (!actionExists(resolverOpts)) {
    return;
  }

  const resolver = buildQuery(pluralName, resolverOpts);

  const query = {
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

  _.merge(localSchema, query);

  if (isQueryEnabled(ctx.schema, `${pluralName}Connection`)) {
    const aggregationSchema = formatModelConnectionsGQL({
      fields: localSchema.typeDefObj,
      model,
      name: model.modelName,
      resolver: resolverOpts,
      plugin: model.plugin,
    });

    mergeSchemas(localSchema, aggregationSchema);
  }
};

const buildCollectionTypeMutations = (model, ctx, localSchema) => {
  ['create', 'update', 'delete'].forEach(action => {
    const mutationSchema = buildMutationTypeDef({ model, action }, ctx);
    mergeSchemas(localSchema, mutationSchema);
  });
};

const buildCollectionType = (model, ctx) => {
  const { modelName } = model;

  const singularName = toSingular(modelName);
  const pluralName = toPlural(modelName);

  const globalType = _.get(ctx.schema, `type.${model.globalId}`, {});

  const localSchema = buildModelDefinition(model, globalType);

  if (globalType === false) {
    return localSchema;
  }

  buildCollectionTypeSingularQuery(model, ctx, singularName, localSchema);
  buildCollectionTypePluralQuery(model, ctx, pluralName, localSchema);

  localSchema.definition += types.generateInputModel(model, modelName);

  buildCollectionTypeMutations(model, ctx, localSchema);

  return localSchema;
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