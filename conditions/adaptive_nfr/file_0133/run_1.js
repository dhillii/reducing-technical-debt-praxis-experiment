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
 * Determines if association is a one-to-one style relationship
 * @param {string} nature - Association nature
 * @returns {boolean}
 */
const isOneToOneStyle = nature => ['oneToOne', 'oneWay', 'manyToOne'].includes(nature);

/**
 * Determines if association is a one-to-many style relationship
 * @param {string} nature - Association nature
 * @param {boolean} dominant - Whether association is dominant
 * @returns {boolean}
 */
const isOneToManyStyle = (nature, dominant) =>
  nature === 'oneToMany' || (nature === 'manyToMany' && dominant !== true);

/**
 * Determines if association is a many-way style relationship
 * @param {string} nature - Association nature
 * @param {boolean} dominant - Whether association is dominant
 * @returns {boolean}
 */
const isManyWayStyle = (nature, dominant) =>
  nature === 'manyWay' || (nature === 'manyToMany' && dominant === true);

/**
 * Builds resolver for one-to-one style associations
 * @param {Object} params - Resolver parameters
 * @returns {Function} Resolver function
 */
const buildOneToOneResolver = ({ obj, options, targetModel, foreignId, loader }) => {
  const targetPK = targetModel.primaryKey;

  if (!_.has(obj, 'alias') || _.isNil(foreignId)) {
    return null;
  }

  if (_.has(obj.alias, targetPK)) {
    return assignOptions(obj.alias, obj);
  }

  const query = {
    single: true,
    filters: {
      ...options,
      [targetPK]: foreignId,
    },
  };

  return loader.load(query).then(r => assignOptions(r, obj));
};

/**
 * Builds resolver for one-to-many style associations
 * @param {Object} params - Resolver parameters
 * @returns {Function} Resolver function
 */
const buildOneToManyResolver = ({ obj, options, association, loader }) => {
  const { via } = association;
  const localId = obj.localId;

  const filters = {
    ...options,
    [via]: localId,
  };

  return loader.load({ filters }).then(r => assignOptions(r, obj));
};

/**
 * Builds resolver for many-way style associations
 * @param {Object} params - Resolver parameters
 * @returns {Promise<Array>} Resolver function
 */
const buildManyWayResolver = async ({ obj, options, model, association, targetModel, loader, primaryKey }) => {
  const targetPK = targetModel.primaryKey;
  let targetIds = [];

  if (Array.isArray(obj.alias)) {
    targetIds = obj.alias.map(value => value[targetPK] || value);
  } else {
    const entry = await strapi
      .query(model.uid)
      .findOne({ [primaryKey]: obj.primaryKey }, [association.alias]);

    if (_.isEmpty(entry[association.alias])) {
      return [];
    }

    targetIds = entry[association.alias].map(el => el[targetPK]);
  }

  const filters = {
    ...options,
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
        const targetPK = targetModel.primaryKey;
        const foreignId = _.get(obj[alias], targetModel.primaryKey, obj[alias]);

        const params = {
          ...initQueryOptions(targetModel, obj),
          ...convertToParams(_.omit(amountLimiting(options), 'where')),
          ...convertToQuery(options.where),
        };

        if (isOneToOneStyle(nature)) {
          return buildOneToOneResolver({
            obj,
            options: params,
            targetModel,
            foreignId,
            loader,
          });
        }

        if (isOneToManyStyle(nature, association.dominant)) {
          return buildOneToManyResolver({
            obj,
            options: params,
            association,
            loader,
          });
        }

        if (isManyWayStyle(nature, association.dominant)) {
          return buildManyWayResolver({
            obj,
            options: params,
            model,
            association,
            targetModel,
            loader,
            primaryKey,
          });
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

  // Add definition to the schema but this type won't be "queriable" or "mutable".
  if (globalType === false) {
    return localSchema;
  }

  if (