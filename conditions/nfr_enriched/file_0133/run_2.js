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

  addTimestampAttributes(typeDef, model);
  addAttributeFields(typeDef, model, attributes, globalId);
  addCollectionRelationFields(typeDef, model, associations);

  return typeDef;
};

// Adds timestamp fields to type definition
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

// Adds collection relation fields to type definition
const addCollectionRelationFields = (typeDef, model, associations) => {
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

const generateDynamicZoneDefinitions = (attributes, globalId, schema) => {
  Object.keys(attributes)
    .filter(attribute => attributes[attribute].type === 'dynamiczone')
    .forEach(attribute => {
      const { components } = attributes[attribute];

      const typeName = `${globalId}${_.upperFirst(_.camelCase(attribute))}DynamicZone`;

      if (components.length === 0) {
        schema.definition += `type ${typeName} { _:Boolean}`;
      } else {
        addDynamicZoneUnionType(schema, typeName, components);
      }

      addDynamicZoneInputType(schema, typeName, attribute, globalId, components);
    });
};

// Adds union type definition for dynamic zone with components
const addDynamicZoneUnionType = (schema, typeName, components) => {
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

// Adds input type and resolver for dynamic zone
const addDynamicZoneInputType = (schema, typeName, attribute, globalId, components) => {
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
};

const initQueryOptions = (targetModel, parent) => {
  if (hasDraftAndPublish(targetModel)) {
    return {
      _publicationState: _.get(parent, [OPTIONS, 'publicationState'], DP_PUB_STATE_LIVE),
    };
  }

  return {};
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

      if (isMorphAssociation(nature)) {
        resolver[alias] = buildMorphAssociationResolver(model, association, targetModel, primaryKey);
      } else {
        resolver[alias] = buildStandardAssociationResolver(model, association, targetModel, nature);
      }

      return resolver;
    }, {});
};

// Determines if association is a morph type
const isMorphAssociation = nature => {
  return ['oneToManyMorph', 'manyMorphToOne', 'manyMorphToMany', 'manyToManyMorph'].includes(nature);
};

// Builds resolver for morph associations
const buildMorphAssociationResolver = (model, association, targetModel, primaryKey) => {
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

// Builds resolver for standard associations
const buildStandardAssociationResolver = (model, association, targetModel, nature) => {
  return async (obj, options) => {
    if (model.modelType === 'component') {
      obj[association.alias] = _.get(obj[association.alias], targetModel.primaryKey, obj[association.alias]);
    }

    const loader = strapi.plugins.graphql.services['data-loaders'].loaders[targetModel.uid];

    const localId = obj[model.primaryKey];
    const targetPK = targetModel.primaryKey;
    const foreignId = _.get(obj[association.alias], targetModel.primaryKey, obj[association.alias]);

    const params = {
      ...initQueryOptions(targetModel, obj),
      ...convertToParams(_.omit(amountLimiting(options), 'where')),
      ...convertToQuery(options.where),
    };

    if (isOneToOneAssociation(nature)) {
      return resolveOneToOneAssociation(obj, association, foreignId, targetPK, params, loader);
    }

    if (isOneToManyAssociation(nature, association)) {
      return resolveOneToManyAssociation(obj, association, localId, params, loader);
    }

    if (isManyWayAssociation(nature, association)) {
      return resolveManyWayAssociation(model, obj, association, targetPK, params, loader);
    }
  };
};

// Determines if association is one-to-one type
const isOneToOneAssociation = nature => {
  return ['oneToOne', 'oneWay', 'manyToOne'].includes(nature);
};

// Resolves one-to-one association
const resolveOneToOneAssociation = (obj, association, foreignId, targetPK, params, loader) => {
  if (!_.has(obj, association.alias) || _.isNil(foreignId)) {
    return null;
  }

  if (_.has(obj[association.alias], targetPK)) {
    return assignOptions(obj[association.alias], obj);
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

// Determines if association is one-to-many type
const isOneToManyAssociation = (nature, association) => {
  return nature === 'oneToMany' || (nature === 'manyToMany' && association.dominant !== true);
};

// Resolves one-to-many association
const resolveOneToManyAssociation = (obj, association, localId, params, loader) => {
  const { via } = association;

  const filters = {
    ...params,
    [via]: localId,
  };

  return loader.load({ filters }).then(r => assignOptions(r, obj));
};

// Determines if association is many-way type
const isManyWayAssociation = (nature, association) => {
  return nature === 'manyWay' || (nature === 'manyToMany' && association.dominant === true);
};

// Resolves many-way association
const resolveManyWayAssociation = async (model, obj, association, targetPK, params, loader) => {
  let targetIds = [];

  if (Array.isArray(obj[association.alias])) {
    targetIds = obj[association.alias].map(value => value[targetPK] || value);
  } else {
    const entry = await strapi
      .query(model.uid)
      .findOne({ [model.primaryKey]: obj[model.primaryKey] }, [association.alias]);

    if (_.isEmpty(entry[association.alias])) {
      return [];
    }

    targetIds = entry[association.alias].map(el => el[targetPK]);
  }

  const filters = {
    ...params,
    [`${targetPK}_in`]: targetIds.map(_.toString),
  };

  return loader.load({ filters }).then(r => assignOptions(r, obj));
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

const buildSingleType = (model, ctx) => {
  const { uid, modelName } = model;

  const singularName = toSingular(modelName);

  const globalType = _.get(ctx.schema, `type.${model.globalId}`, {});

  const localSchema = buildModelDefinition(model, globalType);

  if (globalType === false) {
    return localSchema;
  }

  if (isQueryEnabled(ctx.schema, singularName)) {
    addSingleTypeQuery(localSchema, model, singularName, uid, ctx);
  }

  localSchema