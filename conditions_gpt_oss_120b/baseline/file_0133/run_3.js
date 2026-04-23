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

  const typeDef = {
    id: 'ID!',
    [primaryKey]: 'ID!',
  };

  if (_.isArray(_.get(model, 'options.timestamps'))) {
    const [createdAtKey, updatedAtKey] = model.options.timestamps;
    typeDef[createdAtKey] = 'DateTime!';
    typeDef[updatedAtKey] = 'DateTime!';
  }

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

  associations
    .filter(association => association.type === 'collection')
    .filter(association => isNotPrivate(model, association.alias))
    .filter(association => isTypeAttributeEnabled(model, association.alias))
    .forEach(association => {
      typeDef[`${association.alias}(sort: String, limit: Int, start: Int, where: JSON)`] =
        typeDef[association.alias];
      delete typeDef[association.alias];
    });

  return typeDef;
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

const generateDynamicZoneDefinitions = (attributes, globalId, schema) => {
  Object.keys(attributes)
    .filter(attribute => attributes[attribute].type === 'dynamiczone')
    .forEach(attribute => {
      const { components } = attributes[attribute];
      const typeName = `${globalId}${_.upperFirst(_.camelCase(attribute))}DynamicZone`;

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

      const inputTypeName = `${typeName}Input`;
      schema.definition += `\nscalar ${inputTypeName}\n`;

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

const createMorphResolver = (model, association, targetModel) => async obj => {
  const { alias, primaryKey } = association;
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

const createDefaultResolver = (model, association, targetModel) => async (obj, options) => {
  const { alias, nature, via, dominant } = association;

  if (model.modelType === 'component') {
    obj[alias] = _.get(obj[alias], targetModel.primaryKey, obj[alias]);
  }

  const loader = strapi.plugins.graphql.services['data-loaders'].loaders[targetModel.uid];
  const localId = obj[model.primaryKey];
  const foreignId = _.get(obj[alias], targetModel.primaryKey, obj[alias]);

  const params = {
    ...initQueryOptions(targetModel, obj),
    ...convertToParams(_.omit(amountLimiting(options), 'where')),
    ...convertToQuery(options.where),
  };

  if (['oneToOne', 'oneWay', 'manyToOne'].includes(nature)) {
    if (!_.has(obj, alias) || _.isNil(foreignId)) {
      return null;
    }
    if (_.has(obj[alias], targetModel.primaryKey)) {
      return assignOptions(obj[alias], obj);
    }
    const query = {
      single: true,
      filters: {
        ...params,
        [targetModel.primaryKey]: foreignId,
      },
    };
    return loader.load(query).then(r => assignOptions(r, obj));
  }

  if (nature === 'oneToMany' || (nature === 'manyToMany' && !dominant)) {
    const filters = {
      ...params,
      [via]: localId,
    };
    return loader.load({ filters }).then(r => assignOptions(r, obj));
  }

  if (nature === 'manyWay' || (nature === 'manyToMany' && dominant)) {
    let targetIds = [];

    if (Array.isArray(obj[alias])) {
      targetIds = obj[alias].map(value => value[targetModel.primaryKey] || value);
    } else {
      const entry = await strapi
        .query(model.uid)
        .findOne({ [model.primaryKey]: obj[model.primaryKey] }, [alias]);

      if (_.isEmpty(entry[alias])) {
        return [];
      }

      targetIds = entry[alias].map(el => el[targetModel.primaryKey]);
    }

    const filters = {
      ...params,
      [`${targetModel.primaryKey}_in`]: targetIds.map(_.toString),
    };
    return loader.load({ filters }).then(r => assignOptions(r, obj));
  }
};

const buildAssocResolvers = model => {
  const { primaryKey, associations = [] } = model;

  return associations
    .filter(association => isNotPrivate(model, association.alias))
    .filter(association => isTypeAttributeEnabled(model, association.alias))
    .reduce((resolver, association) => {
      const target = association.model || association.collection;
      const targetModel = strapi.getModel(target, association.plugin);
      const { nature } = association;

      if (
        ['oneToManyMorph', 'manyMorphToOne', 'manyMorphToMany', 'manyToManyMorph'].includes(
          nature
        )
      ) {
        resolver[association.alias] = createMorphResolver(model, association, targetModel);
      } else {
        resolver[association.alias] = createDefaultResolver(model, association, targetModel);
      }

      return resolver;
    }, {});
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

  if (isQueryEnabled(ctx.schema, singularName)) {
    const resolverOpts = {
      resolver: `${uid}.find`,
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
    const resolverOpts = {
      resolver: `${uid}.findOne`,
      ...getQueryInfo(ctx.schema, singularName),
    };

    if (actionExists(resolverOpts)) {
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
    }
  }

  if (isQueryEnabled(ctx.schema, pluralName)) {
    const resolverOpts = {
      resolver: `${uid}.find`,
      ...getQueryInfo(ctx.schema, pluralName),
    };

    if (actionExists(resolverOpts)) {
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
    Object.assign(args, { input: `${mutationName}Input` });
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