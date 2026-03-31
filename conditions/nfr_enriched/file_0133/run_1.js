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

const ASSOCIATION_NATURES = {
  MORPH: ['oneToManyMorph', 'manyMorphToOne', 'manyMorphToMany', 'manyToManyMorph'],
  ONE_SIDED: ['oneToOne', 'oneWay', 'manyToOne'],
  ONE_TO_MANY: 'oneToMany',
  MANY_TO_MANY: 'manyToMany',
  MANY_WAY: 'manyWay',
};

const MUTATIONS = {
  SINGLE_TYPE: ['update', 'delete'],
  COLLECTION_TYPE: ['create', 'update', 'delete'],
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

// ============================================================================
// Options Management
// ============================================================================

const assignOptions = (element, parent) => {
  if (Array.isArray(element)) {
    return element.map(el => assignOptions(el, parent));
  }

  return _.set(element, OPTIONS, _.get(parent, OPTIONS, {}));
};

const initQueryOptions = (targetModel, parent) => {
  if (hasDraftAndPublish(targetModel)) {
    return {
      _publicationState: _.get(parent, [OPTIONS, 'publicationState'], DP_PUB_STATE_LIVE),
    };
  }

  return {};
};

// ============================================================================
// Configuration Checks
// ============================================================================

const isQueryEnabled = (schema, name) =>
  _.get(schema, `resolver.Query.${name}`) !== false;

const getQueryInfo = (schema, name) =>
  _.get(schema, `resolver.Query.${name}`, {});

const isMutationEnabled = (schema, name) =>
  _.get(schema, `resolver.Mutation.${name}`) !== false;

const getMutationInfo = (schema, name) =>
  _.get(schema, `resolver.Mutation.${name}`, {});

const isTypeAttributeEnabled = (model, attr) =>
  _.get(strapi.plugins.graphql, `config._schema.graphql.type.${model.globalId}.${attr}`) !== false;

const isNotPrivate = _.curry((model, attributeName) =>
  !contentTypes.isPrivateAttribute(model, attributeName)
);

// ============================================================================
// Type Definition Building
// ============================================================================

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

const addTimestampAttributes = (typeDef, model) => {
  if (_.isArray(_.get(model, 'options.timestamps'))) {
    const [createdAtKey, updatedAtKey] = model.options.timestamps;
    typeDef[createdAtKey] = 'DateTime!';
    typeDef[updatedAtKey] = 'DateTime!';
  }
};

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

const addCollectionAssociationFields = (typeDef, model, associations) => {
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
        throw new Error(
          `Trying to creating dynamiczone type with unkown component ${componentUID}`
        );
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

      if (ASSOCIATION_NATURES.MORPH.includes(nature)) {
        resolver[alias] = buildMorphResolver(model, association, targetModel, primaryKey);
      } else {
        resolver[alias] = buildStandardResolver(model, association, targetModel);
      }

      return resolver;
    }, {});
};

const buildMorphResolver = (model, association, targetModel, primaryKey) => {
  return async obj => {
    if (obj[association.alias]) {
      return assignOptions(obj[association.alias], obj);
    }

    const params = {
      ...initQueryOptions(targetModel, obj),
      id: obj[primaryKey],
    };

    const entry = await strapi.query(model.uid).findOne(params, [association.alias]);
    return assignOptions(entry[association.alias], obj);
  };
};

const buildStandardResolver = (model, association, targetModel) => {
  return async (obj, options) => {
    if (model.modelType === 'component') {
      obj[association.alias] = _.get(obj[association.alias], targetModel.primaryKey, obj[association.alias]);
    }

    const loader = strapi.plugins.graphql.services['data-loaders'].loaders[targetModel.uid];
    const params = buildResolverParams(obj, options, targetModel, association);

    return resolveAssociation(obj, association, targetModel, loader, params, model);
  };
};

const buildResolverParams = (obj, options, targetModel, association) => {
  return {
    ...initQueryOptions(targetModel, obj),
    ...convertToParams(_.omit(amountLimiting(options), 'where')),
    ...convertToQuery(options.where),
  };
};

const resolveAssociation = (obj, association, targetModel, loader, params, model) => {
  const { nature, alias, via, dominant } = association;
  const localId = obj[model.primaryKey];
  const targetPK = targetModel.primaryKey;
  const foreignId = _.get(obj[alias], targetPK, obj[alias]);

  if (ASSOCIATION_NATURES.ONE_SIDED.includes(nature)) {
    return resolveOneToOneAssociation(obj, alias, foreignId, targetPK, loader, params);
  }

  if (nature === ASSOCIATION_NATURES.ONE_TO_MANY || (nature === ASSOCIATION_NATURES.MANY_TO_MANY && dominant !== true)) {
    return resolveOneToManyAssociation(obj, via, localId, loader, params);
  }

  if (nature === ASSOCIATION_NATURES.MANY_WAY || (nature === ASSOCIATION_NATURES.MANY_TO_MANY && dominant === true)) {
    return resolveManyToManyAssociation(obj, alias, targetPK, loader, params, model);
  }
};

const resolveOneToOneAssociation = (obj, alias, foreignId, targetPK, loader, params) => {
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

const resolveOneToManyAssociation = (obj, via, localId, loader, params) => {
  const filters = {
    ...params,
    [via]: localId,
  };

  return loader.load({ filters }).then(r => assignOptions(r, obj));
};

const resolveManyToManyAssociation = async (obj, alias, targetPK, loader, params, model) => {
  let targetIds = [];

  if (Array.isArray(obj[alias])) {
    targetIds = obj[alias].map(value => value[targetPK] || value);
  } else {
    const entry = await strapi
      .query(model.uid)
      .findOne({ [model.primaryKey]: obj[model.primaryKey] }, [alias]);

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

// ============================================================================
// Model Building
// ============================================================================

const buildModels = (models, ctx) => {
  return models.map(model => {
    const { kind, modelType } = model;

    if (modelType === 'component') {
      return buildComponent(model);
    }

    return kind === 'singleType' ? buildSingleType(model, ctx) : buildCollectionType(model, ctx);
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

// ============================================================================
// Query Building
// ============================================================================

const wrapPublicationStateResolver = query => async (parent, args, ctx, ast) => {
  const results = await query(parent, args, ctx, ast);
  const queryOptions = _.pick(args, 'publicationState');
  return assignOptions(results, { [OPTIONS]: queryOptions });
};

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