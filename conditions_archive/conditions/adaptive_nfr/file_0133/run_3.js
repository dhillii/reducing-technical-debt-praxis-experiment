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

  // Add timestamps attributes.
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
      // Convert our type to the GraphQL type.
      typeDef[attributeName] = types.convertType({
        attribute,
        modelName: globalId,
        attributeName,
      });
    });

  // Change field definition for collection relations
  associations
    .filter(association => association.type === 'collection')
    .filter(association => isNotPrivate(model, association.alias))
    .filter(attributeName => isTypeAttributeEnabled(model, attributeName))
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
        // Create dummy type because graphql doesn't support empty ones
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

/** @type {Object<string, Function>} Strategy map for morphic association types */
const morphicAssociationStrategy = {
  oneToManyMorph: true,
  manyMorphToOne: true,
  manyMorphToMany: true,
  manyToManyMorph: true,
};

/**
 * Builds resolver for morphic associations
 * @param {Object} association - Association configuration
 * @param {Object} model - Source model
 * @param {Object} targetModel - Target model
 * @returns {Function} Resolver function
 */
const buildMorphicAssocResolver = (association, model, targetModel) => {
  const { primaryKey } = model;
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

/**
 * Determines if association is one-to-one type
 * @param {string} nature - Association nature
 * @returns {boolean}
 */
const isOneToOneType = nature => ['oneToOne', 'oneWay', 'manyToOne'].includes(nature);

/**
 * Determines if association is one-to-many type
 * @param {string} nature - Association nature
 * @param {Object} association - Association configuration
 * @returns {boolean}
 */
const isOneToManyType = (nature, association) =>
  nature === 'oneToMany' || (nature === 'manyToMany' && association.dominant !== true);

/**
 * Determines if association is many-way type
 * @param {string} nature - Association nature
 * @param {Object} association - Association configuration
 * @returns {boolean}
 */
const isManyWayType = (nature, association) =>
  nature === 'manyWay' || (nature === 'manyToMany' && association.dominant === true);

/**
 * Builds resolver for one-to-one associations
 * @param {Object} params - Resolver parameters
 * @returns {Function} Resolver function
 */
const buildOneToOneResolver = ({ obj, options, targetModel, targetPK, foreignId, loader }) => {
  const { alias } = options;

  if (!_.has(obj, alias) || _.isNil(foreignId)) {
    return null;
  }

  // check this is an entity and not a mongo ID
  if (_.has(obj[alias], targetPK)) {
    return assignOptions(obj[alias], obj);
  }

  const query = {
    single: true,
    filters: {
      ...options.params,
      [targetPK]: foreignId,
    },
  };

  return loader.load(query).then(r => assignOptions(r, obj));
};

/**
 * Builds resolver for one-to-many associations
 * @param {Object} params - Resolver parameters
 * @returns {Function} Resolver function
 */
const buildOneToManyResolver = ({ obj, options, loader }) => {
  const { alias, via, localId, params } = options;

  const filters = {
    ...params,
    [via]: localId,
  };

  return loader.load({ filters }).then(r => assignOptions(r, obj));
};

/**
 * Builds resolver for many-way associations
 * @param {Object} params - Resolver parameters
 * @returns {Promise} Resolver promise
 */
const buildManyWayResolver = async ({ obj, options, model, targetModel, loader }) => {
  const { alias, params, targetPK } = options;
  const { primaryKey } = model;

  let targetIds = [];

  // find the related ids to query them and apply the filters
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

const buildAssocResolvers = model => {
  const { primaryKey, associations = [] } = model;

  return associations
    .filter(association => isNotPrivate(model, association.alias))
    .filter(association => isTypeAttributeEnabled(model, association.alias))
    .reduce((resolver, association) => {
      const target = association.model || association.collection;
      const targetModel = strapi.getModel(target, association.plugin);

      const { nature, alias } = association;

      if (morphicAssociationStrategy[nature]) {
        resolver[alias] = buildMorphicAssocResolver(association, model, targetModel);
        return resolver;
      }

      resolver[alias] = async (obj, options) => {
        // force component relations to be refetched
        if (model.modelType === 'component') {
          obj[alias] = _.get(obj[alias], targetModel.primaryKey, obj[alias]);
        }

        const loader = strapi.plugins.graphql.services['data-loaders'].loaders[targetModel.uid];

        const localId = obj[model.primaryKey];
        const targetPK = targetModel.primaryKey;
        const foreignId = _.get(obj[alias], targetModel.primaryKey, obj[alias]);

        const params = {
          ...initQueryOptions(targetModel, obj),
          ...convertToParams(_.omit(amountLimiting(options), 'where')),
          ...convertToQuery(options.where),
        };

        const resolverParams = {
          obj,
          options: { alias, via: association.via, localId, params, targetPK },
          model,
          targetModel,
          loader,
          targetPK,
          foreignId,
        };

        if (isOneToOneType(nature)) {
          return buildOneToOneResolver(resolverParams);
        }

        if (isOneToManyType(nature, association)) {
          return buildOneToManyResolver(resolverParams);
        }

        if (isManyWayType(nature, association)) {
          return buildManyWayResolver(resolverParams);
        }
      };

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

    if (kind === 'singleType') {
      return buildSingleType(model, ctx);
    }

    return buildCollectionType(model, ctx);
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

  // Add definition to the schema but this type won't be "queriable" or "mutable".
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

  // Add model Input definition.
  localSchema.definition += types.generateInputModel(model, modelName);

  // build every mutation
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

  // Add definition to the schema but this type won't be "queriable" or "mutable".
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
        // Generate the aggregation for the given model
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

  // Add model Input definition.
  localSchema.definition += types.generateInputModel(model, modelName);

  // build every mutation
  ['create', 'update', 'delete'].forEach(action => {
    const mutationSchema = buildMutationTypeDef({ model, action }, ctx);
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
```