'use strict';

/**
 * Types.js service
 *
 * @description: A set of functions to make the schema easier to build.
 */

const _ = require('lodash');
const { GraphQLUpload } = require('graphql-upload');
const graphql = require('graphql');
const { GraphQLJSON } = require('graphql-type-json');
const { GraphQLDate, GraphQLDateTime } = require('graphql-iso-date');
const GraphQLLong = require('graphql-type-long');

const Time = require('../types/time');
const { toSingular, toInputName } = require('./naming');

const isScalarAttribute = ({ type }) => type && !['component', 'dynamiczone'].includes(type);
const isTypeAttributeEnabled = (model, attr) =>
  _.get(strapi.plugins.graphql, `config._schema.graphql.type.${model.globalId}.${attr}`) !== false;

/**
 * Resolve scalar GraphQL type based on Strapi attribute definition.
 */
function resolveScalarType(attribute, modelName, attributeName, rootType, action) {
  let gqlType = 'String';
  switch (attribute.type) {
    case 'boolean':
      gqlType = 'Boolean';
      break;
    case 'integer':
      gqlType = 'Int';
      break;
    case 'biginteger':
      gqlType = 'Long';
      break;
    case 'float':
    case 'decimal':
      gqlType = 'Float';
      break;
    case 'json':
      gqlType = 'JSON';
      break;
    case 'date':
      gqlType = 'Date';
      break;
    case 'time':
      gqlType = 'Time';
      break;
    case 'datetime':
    case 'timestamp':
      gqlType = 'DateTime';
      break;
    case 'enumeration':
      gqlType = module.exports.convertEnumType(attribute, modelName, attributeName);
      break;
  }

  if (attribute.required) {
    const isMutation = rootType === 'mutation';
    const needsNonNull = !isMutation || (action !== 'update' && attribute.default === undefined);
    if (needsNonNull) {
      gqlType += '!';
    }
  }

  return gqlType;
}

/**
 * Resolve component GraphQL type.
 */
function resolveComponentType(attribute, rootType, action) {
  const { required, repeatable, component } = attribute;
  const globalId = strapi.components[component].globalId;

  let typeName = required === true ? `${globalId}` : globalId;

  if (rootType === 'mutation') {
    const base = _.upperFirst(toSingular(globalId));
    typeName = action === 'update' ? `edit${base}Input` : `${base}Input${required ? '!' : ''}`;
  }

  return repeatable ? `[${typeName}]` : `${typeName}`;
}

/**
 * Resolve dynamic zone GraphQL type.
 */
function resolveDynamicZoneType(attribute, modelName, attributeName, rootType) {
  const { required } = attribute;
  const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
  const typeName = rootType === 'mutation' ? `${unionName}Input!` : unionName;
  return `[${typeName}]${required ? '!' : ''}`;
}

/**
 * Resolve association (relation) GraphQL type.
 */
function resolveAssociationType(attribute, rootType) {
  const ref = attribute.model || attribute.collection;
  if (!ref || ref === '*') {
    return rootType === 'mutation' ? (attribute.model ? 'ID' : '[ID]') : attribute.model ? 'Morph' : '[Morph]';
  }

  const globalId = strapi.db.getModel(ref, attribute.plugin).globalId;
  const isCollection = !!attribute.collection;

  if (isCollection) {
    return rootType === 'mutation' ? '[ID]' : `[${globalId}]`;
  }

  return rootType === 'mutation' ? 'ID' : globalId;
}

/**
 * Convert Strapi type to GraphQL type.
 */
function convertType({
  attribute = {},
  modelName = '',
  attributeName = '',
  rootType = 'query',
  action = '',
}) {
  if (isScalarAttribute(attribute)) {
    return resolveScalarType(attribute, modelName, attributeName, rootType, action);
  }

  if (attribute.type === 'component') {
    return resolveComponentType(attribute, rootType, action);
  }

  if (attribute.type === 'dynamiczone') {
    return resolveDynamicZoneType(attribute, modelName, attributeName, rootType);
  }

  // Association or fallback
  return resolveAssociationType(attribute, rootType);
}

/**
 * Build input fields for a model based on enabled attributes.
 */
function buildInputFields(model, globalId, rootType, action) {
  return Object.keys(model.attributes)
    .filter(attrName => isTypeAttributeEnabled(model, attrName))
    .map(attrName => {
      const gqlType = module.exports.convertType({
        attribute: model.attributes[attrName],
        modelName: globalId,
        attributeName: attrName,
        rootType,
        action,
      });
      return `${attrName}: ${gqlType}`;
    })
    .join('\n');
}

/**
 * Generate GraphQL input model definitions.
 */
function generateInputModel(model, name, { allowIds = false } = {}) {
  const globalId = model.globalId;
  const inputName = `${_.upperFirst(toSingular(name))}Input`;
  const hasAllAttributesDisabled = Object.keys(model.attributes).every(
    attr => !isTypeAttributeEnabled(model, attr)
  );

  if (_.isEmpty(model.attributes) || hasAllAttributesDisabled) {
    return `
      input ${inputName} {
        _: String
      }

      input edit${inputName} {
        ${allowIds ? 'id: ID' : '_: String'}
      }
     `;
  }

  const createFields = buildInputFields(model, globalId, 'mutation', '');
  const updateFields = buildInputFields(model, globalId, 'mutation', 'update');

  return `
    input ${inputName} {
      ${createFields}
    }

    input edit${inputName} {
      ${allowIds ? 'id: ID' : ''}
      ${updateFields}
    }
  `;
}

/**
 * Generate input payload arguments for mutations.
 */
function generateInputPayloadArguments({ model, name, mutationName, action }) {
  const singularName = toSingular(name);
  const inputName = toInputName(name);
  const { kind } = model;

  switch (action) {
    case 'create':
      return `
        input ${mutationName}Input { data: ${inputName} }
        type ${mutationName}Payload { ${singularName}: ${model.globalId} }
      `;
    case 'update':
      if (kind === 'singleType') {
        return `
          input ${mutationName}Input  { data: edit${inputName} }
          type ${mutationName}Payload { ${singularName}: ${model.globalId} }
        `;
      }
      return `
        input ${mutationName}Input  { where: InputID, data: edit${inputName} }
        type ${mutationName}Payload { ${singularName}: ${model.globalId} }
      `;
    case 'delete':
      if (kind === 'singleType') {
        return `
          type ${mutationName}Payload { ${singularName}: ${model.globalId} }
        `;
      }
      return `
        input ${mutationName}Input  { where: InputID }
        type ${mutationName}Payload { ${singularName}: ${model.globalId} }
      `;
    default:
      return '';
  }
}

module.exports = {
  convertType,
  convertEnumType(definition, model, field) {
    return definition.enumName
      ? definition.enumName
      : `ENUM_${model.toUpperCase()}_${field.toUpperCase()}`;
  },
  getScalars() {
    return {
      JSON: GraphQLJSON,
      DateTime: GraphQLDateTime,
      Time,
      Date: GraphQLDate,
      Long: GraphQLLong,
      Upload: GraphQLUpload,
    };
  },
  addPolymorphicUnionType(definition) {
    const types = graphql
      .parse(definition)
      .definitions.filter(
        def => def.kind === 'ObjectTypeDefinition' && def.name.value !== 'Query'
      )
      .map(def => def.name.value);

    if (types.length > 0) {
      return {
        definition: `union Morph = ${types.join(' | ')}`,
        resolvers: {
          Morph: {
            __resolveType(obj) {
              return obj.kind || obj.__contentType || null;
            },
          },
        },
      };
    }

    return {
      definition: '',
      resolvers: {},
    };
  },
  addInput() {
    return `
      input InputID { id: ID!}
    `;
  },
  generateInputModel,
  generateInputPayloadArguments,
};