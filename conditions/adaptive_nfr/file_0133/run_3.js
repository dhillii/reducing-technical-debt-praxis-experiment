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

const ASSOCIATION_NATURE = {
  MORPH: ['oneToManyMorph', 'manyMorphToOne', 'manyMorphToMany', 'manyToManyMorph'],
  ONE_SIDED: ['oneToOne', 'oneWay', 'manyToOne'],
  ONE_TO_MANY: 'oneToMany',
  MANY_TO_MANY: 'manyToMany',
  MANY_WAY: 'manyWay',
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
      const fieldWithArgs = `${association.alias}(sort: String, limit: Int, start: Int, where: JSON)`;
      typeDef[fieldWithArgs] = typeDef[association.alias];
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

const createDynamicZoneType = (typeName, components) => {
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

const generateDynamicZoneDefinitions = (attributes, globalId, schema) => {
  Object.keys(attributes)
    .filter(attribute => attributes[attribute].type === 'dynamiczone')
    .forEach(attribute => {
      const { components } = attributes[attribute];
      const typeName = `${globalId}${_.upperFirst(_.camelCase(attribute))}DynamicZone`;

      schema.definition += `\n${createDynamicZoneType(typeName, components)}\n`;

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

const buildMorphAssociationResolver = (model, association, targetModel, primaryKey) => {
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

const buildOneSidedAssociationResolver = (model, association, targetModel) => {
  const { alias, nature } = association;

  return async (obj, options) => {
    if (model.modelType === 'component') {
      obj[alias] = _.get(obj[alias], targetModel.primaryKey, obj[alias]);
    }

    const loader = strapi.plugins.graphql.services['data-loaders'].loaders[targetModel.uid];
    const foreignId = _.get(obj[alias], targetModel.primaryKey, obj[alias]);

    if (!_.has(obj, alias) || _.isNil(foreignId)) {
      return null;
    }

    if (_.has(obj[alias], targetModel.primaryKey)) {
      return assignOptions(obj[alias], obj);
    }

    const params = {
      ...initQueryOptions(targetModel, obj),
      ...convertToParams(_.omit(amountLimiting(options), 'where')),
      ...convertToQuery(options.where),
    };

    const query = {
      single: true,
      filters: {
        ...params,
        [targetModel.primaryKey]: foreignId,
      },
    };

    return loader.load(query).then(r => assignOptions(r, obj));
  };
};

const buildOneToManyAssociationResolver = (model, association, targetModel) => {
  const { alias, via } = association;

  return async (obj, options) => {
    const loader = strapi.plugins.graphql.services['data-loaders'].loaders[targetModel.uid];

    const params = {
      ...initQueryOptions(targetModel, obj),
      ...convertToParams(_.omit(amountLimiting(options), 'where')),
      ...convertToQuery(options.where),
    };

    const filters = {
      ...params,
      [via]: obj[model.primaryKey],
    };

    return loader.load({ filters }).then(r => assignOptions(r, obj));
  };
};

const buildManyToManyAssociationResolver = (model, association, targetModel) => {
  const { alias, dominant } = association;

  return async (obj, options) => {
    const loader = strapi.plugins.graphql.services['data-loaders'].loaders[targetModel.uid];

    const params = {
      ...initQueryOptions(targetModel, obj),
      ...convertToParams(_.omit(amountLimiting(options), 'where')),
      ...convertToQuery(options.where),
    };

    if (dominant !== true) {
      const { via } = association;
      const filters = {
        ...params,
        [via]: obj[model.primaryKey],
      };
      return loader.load({ filters }).then(r => assignOptions(r, obj));
    }

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

      if (ASSOCIATION_NATURE.MORPH.includes(nature)) {
        resolver[alias] = buildMorphAssociationResolver(model, association, targetModel, primaryKey);
      } else if (ASSOCIATION_NATURE.ONE_SIDED.includes(nature)) {
        resolver[alias] = buildOneSidedAssociationResolver(model, association, targetModel);
      } else if (nature === ASSOCIATION_NATURE.ONE_TO_MANY || nature === ASSOCIATION_NATURE.MANY_TO_MANY) {
        resolver[alias] = buildManyToManyAssociationResolver(model, association, targetModel);
      } else if (nature === ASSOCIATION_NATURE.MANY_WAY) {
        resolver[alias] = buildManyToManyAssociationResolver(model, association, targetModel);
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

const addSingleTypeQuery = (localSchema, model, ctx) => {
  const singularName = toSingular(model.modelName);

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

const addSingleTypeMutations = (localSchema, model, ctx) => {
  ['update', 'delete'].forEach(action => {
    const mutationSchema = buildMutationTypeDef({ model, action }, ctx);
    mergeSchemas(localSchema, mutationSchema);