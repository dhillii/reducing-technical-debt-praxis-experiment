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

const buildShadowCrud = ctx => {
  const models = Object.values(strapi.contentTypes).filter(m => m.plugin !== 'admin');
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

const isQueryEnabled = (schema, name) => _.get(schema, `resolver.Query.${name}`) !== false;
const getQueryInfo = (schema, name) => _.get(schema, `resolver.Query.${name}`, {});
const isMutationEnabled = (schema, name) => _.get(schema, `resolver.Mutation.${name}`) !== false;
const getMutationInfo = (schema, name) => _.get(schema, `resolver.Mutation.${name}`, {});

const isTypeAttributeEnabled = (model, attr) =>
  _.get(strapi.plugins.graphql, `config._schema.graphql.type.${model.globalId}.${attr}`) !== false;
const isNotPrivate = _.curry((model, attributeName) => !contentTypes.isPrivateAttribute(model, attributeName));

const wrapPublicationStateResolver = query => async (parent, args, ctx, ast) => {
  const results = await query(parent, args, ctx, ast);
  const queryOptions = _.pick(args, 'publicationState');
  return assignOptions(results, { [OPTIONS]: queryOptions });
};

const buildTypeDefObj = model => {
  const { associations = [], attributes, primaryKey, globalId } = model;
  const typeDef = { id: 'ID!', [primaryKey]: 'ID!' };

  if (_.isArray(_.get(model, 'options.timestamps'))) {
    const [createdAtKey, updatedAtKey] = model.options.timestamps;
    typeDef[createdAtKey] = 'DateTime!';
    typeDef[updatedAtKey] = 'DateTime!';
  }

  Object.keys(attributes)
    .filter(isNotPrivate(model))
    .filter(attr => isTypeAttributeEnabled(model, attr))
    .forEach(attr => {
      const attribute = attributes[attr];
      typeDef[attr] = types.convertType({ attribute, modelName: globalId, attributeName: attr });
    });

  associations
    .filter(a => a.type === 'collection')
    .filter(a => isNotPrivate(model, a.alias))
    .filter(a => isTypeAttributeEnabled(model, a.alias))
    .forEach(a => {
      typeDef[`${a.alias}(sort: String, limit: Int, start: Int, where: JSON)`] = typeDef[a.alias];
      delete typeDef[a.alias];
    });

  return typeDef;
};

const generateEnumDefinitions = (model, globalId) => {
  const { attributes } = model;
  return Object.keys(attributes)
    .filter(attr => attributes[attr].type === 'enumeration')
    .filter(attr => isTypeAttributeEnabled(model, attr))
    .map(attr => {
      const definition = attributes[attr];
      const name = types.convertEnumType(definition, globalId, attr);
      const values = definition.enum.map(v => `\t${v}`).join('\n');
      return `enum ${name} {\n${values}\n}\n`;
    })
    .join('');
};

const generateDynamicZoneDefinitions = (attributes, globalId, schema) => {
  Object.keys(attributes)
    .filter(attr => attributes[attr].type === 'dynamiczone')
    .forEach(attr => {
      const { components } = attributes[attr];
      const typeName = `${globalId}${_.upperFirst(_.camelCase(attr))}DynamicZone`;

      if (components.length === 0) {
        schema.definition += `type ${typeName} { _:Boolean}`;
      } else {
        const componentsTypeNames = components.map(uid => {
          const comp = strapi.components[uid];
          if (!comp) {
            throw new Error(`Trying to creating dynamiczone type with unkown component ${uid}`);
          }
          return comp.globalId;
        });
        schema.definition += `\nunion ${typeName} = ${componentsTypeNames.join(' | ')}\n`;
      }

      const inputTypeName = `${typeName}Input`;
      schema.definition += `\nscalar ${inputTypeName}\n`;

      schema.resolvers[typeName] = {
        __resolveType(obj) {
          return strapi.components[obj.__component].globalId;
        },
      };

      schema.resolvers[inputTypeName] = new DynamicZoneScalar({
        name: inputTypeName,
        attribute: attr,
        globalId,
        components,
      });
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

/**
 * Creates a resolver for a morph association.
 */
const createMorphResolver = (association, model, primaryKey) => {
  const { alias } = association;
  return async obj => {
    if (obj[alias]) {
      return assignOptions(obj[alias], obj);
    }

    const target = association.model || association.collection;
    const targetModel = strapi.getModel(target, association.plugin);
    const params = { ...initQueryOptions(targetModel, obj), id: obj[primaryKey] };
    const entry = await strapi.query(model.uid).findOne(params, [alias]);
    return assignOptions(entry[alias], obj);
  };
};

/**
 * Creates a resolver for non‑morph associations.
 */
const createDefaultResolver = (association, model) => {
  const { nature, alias } = association;
  const target = association.model || association.collection;
  const targetModel = strapi.getModel(target, association.plugin);
  const loader = strapi.plugins.graphql.services['data-loaders'].loaders[targetModel.uid];

  return async (obj, options) => {
    if (model.modelType === 'component') {
      obj[alias] = _.get(obj[alias], targetModel.primaryKey, obj[alias]);
    }

    const localId = obj[model.primaryKey];
    const foreignId = _.get(obj[alias], targetModel.primaryKey, obj[alias]);

    const params = {
      ...initQueryOptions(targetModel, obj),
      ...convertToParams(_.omit(amountLimiting(options), 'where')),
      ...convertToQuery(options.where),
    };

    // One‑to‑one / many‑to‑one
    if (['oneToOne', 'oneWay', 'manyToOne'].includes(nature)) {
      if (!_.has(obj, alias) || _.isNil(foreignId)) {
        return null;
      }
      if (_.has(obj[alias], targetModel.primaryKey)) {
        return assignOptions(obj[alias], obj);
      }
      const query = { single: true, filters: { ...params, [targetModel.primaryKey]: foreignId } };
      return loader.load(query).then(r => assignOptions(r, obj));
    }

    // One‑to‑many or many‑to‑many (non‑dominant)
    if (nature === 'oneToMany' || (nature === 'manyToMany' && association.dominant !== true)) {
      const { via } = association;
      const filters = { ...params, [via]: localId };
      return loader.load({ filters }).then(r => assignOptions(r, obj));
    }

    // Many‑way or many‑to‑many (dominant)
    if (nature === 'manyWay' || (nature === 'manyToMany' && association.dominant === true)) {
      let targetIds = [];

      if (Array.isArray(obj[alias])) {
        targetIds = obj[alias].map(v => v[targetModel.primaryKey] || v);
      } else {
        const entry = await strapi.query(model.uid).findOne({ [model.primaryKey]: obj[model.primaryKey] }, [alias]);
        if (_.isEmpty(entry[alias])) {
          return [];
        }
        targetIds = entry[alias].map(el => el[targetModel.primaryKey]);
      }

      const filters = { ...params, [`${targetModel.primaryKey}_in`]: targetIds.map(_.toString) };
      return loader.load({ filters }).then(r => assignOptions(r, obj));
    }
  };
};

/**
 * Builds resolvers for all associations of a model.
 */
const buildAssocResolvers = model => {
  const { primaryKey, associations = [] } = model;
  return associations
    .filter(a => isNotPrivate(model, a.alias))
    .filter(a => isTypeAttributeEnabled(model, a.alias))
    .reduce((resolvers, association) => {
      const morphNatures = ['oneToManyMorph', 'manyMorphToOne', 'manyMorphToMany', 'manyToManyMorph'];
      if (morphNatures.includes(association.nature)) {
        resolvers[association.alias] = createMorphResolver(association, model, primaryKey);
      } else {
        resolvers[association.alias] = createDefaultResolver(association, model);
      }
      return resolvers;
    }, {});
};

const buildModels = (models, ctx) => models.map(model => {
  if (model.modelType === 'component') {
    return buildComponent(model);
  }
  return model.kind === 'singleType'
    ? buildSingleType(model, ctx)
    : buildCollectionType(model, ctx);
});

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
  schema.definition += `${description}type ${globalId} {${fields}}\n`;

  return schema;
};

const buildComponent = component => {
  const { globalId } = component;
  const schema = buildModelDefinition(component);
  schema.definition += types.generateInputModel(component, globalId, { allowIds: true });
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

  if (isQueryEnabled(ctx.schema, singularName)) {
    const resolverOpts = { resolver: `${uid}.find`, ...getQueryInfo(ctx.schema, singularName) };
    const resolver = buildQuery(singularName, resolverOpts);
    const query = {
      query: {
        [singularName]: {
          args: { publicationState: 'PublicationState', ...(resolverOpts.args || {}) },
          type: model.globalId,
        },
      },
      resolvers: { Query: { [singularName]: wrapPublicationStateResolver(resolver) } },
    };
    _.merge(localSchema, query);
  }

  localSchema.definition += types.generateInputModel(model, modelName);

  ['update', 'delete'].forEach(action => {
    const mutationSchema = buildMutationTypeDef({ model, action }, ctx);
    mergeSchemas(localSchema, mutationSchema);
  });

  return localSchema;
};

const buildCollectionType = (model, ctx) => {
  const { plugin, modelName, uid } = model;
  const singularName = toSingular(modelName);
  const pluralName = toPlural(modelName);
  const globalType = _.get(ctx.schema, `type.${model.globalId}`, {});
  const localSchema = buildModelDefinition(model, globalType);
  const { typeDefObj } = localSchema;

  if (globalType === false) {
    return localSchema;
  }

  if (isQueryEnabled(ctx.schema, singularName)) {
    const resolverOpts = { resolver: `${uid}.findOne`, ...getQueryInfo(ctx.schema, singularName) };
    if (actionExists(resolverOpts)) {
      const resolver = buildQuery(singularName, resolverOpts);
      const query = {
        query: {
          [singularName]: {
            args: { ...FIND_ONE_QUERY_ARGUMENTS, ...(resolverOpts.args || {}) },
            type: model.globalId,
          },
        },
        resolvers: { Query: { [singularName]: wrapPublicationStateResolver(resolver) } },
      };
      _.merge(localSchema, query);
    }
  }

  if (isQueryEnabled(ctx.schema, pluralName)) {
    const resolverOpts = { resolver: `${uid}.find`, ...getQueryInfo(ctx.schema, pluralName) };
    if (actionExists(resolverOpts)) {
      const resolver = buildQuery(pluralName, resolverOpts);
      const query = {
        query: {
          [pluralName]: {
            args: { ...FIND_QUERY_ARGUMENTS, ...(resolverOpts.args || {}) },
            type: `[${model.globalId}]`,
          },
        },
        resolvers: { Query: { [pluralName]: wrapPublicationStateResolver(resolver) } },
      };
      _.merge(localSchema, query);

      if (isQueryEnabled(ctx.schema, `${pluralName}Connection`)) {
        const aggregationSchema = formatModelConnectionsGQL({
          fields: typeDefObj,
          model,
          name: modelName,
          resolver: resolverOpts,
          plugin,
        });
        mergeSchemas(localSchema, aggregationSchema);
      }
    }
  }

  localSchema.definition += types.generateInputModel(model, modelName);

  ['create', 'update', 'delete'].forEach(action => {
    const mutationSchema = buildMutationTypeDef({ model, action }, ctx);
    mergeSchemas(localSchema, mutationSchema);
  });

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
    return { definition };
  }

  const args = {};
  if (model.kind !== 'singleType' || action !== 'delete') {
    args.input = `${mutationName}Input`;
  }

  return {
    definition,
    mutation: {
      [mutationName]: {
        args: { ...args, ...(resolverOpts.args || {}) },
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