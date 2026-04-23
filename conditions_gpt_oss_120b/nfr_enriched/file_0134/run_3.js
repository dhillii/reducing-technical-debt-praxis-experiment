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
function resolveScalarType(attribute, rootType, action) {
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
      // Handled separately
      break;
    default:
      break;
  }

  // Append non‑null marker when required
  if (attribute.required) {
    if (rootType !== 'mutation' || (action !== 'update' && attribute.default === undefined)) {
      gqlType += '!';
    }
  }

  return gqlType;
}

/**
 * Build GraphQL type for component attributes.
 */
function buildComponentType(attribute, modelName, rootType, action) {
  const { required, repeatable, component } = attribute;
  const globalId = strapi.components[component].globalId;

  let typeName = required === true ? `${globalId}` : globalId;

  if (rootType === 'mutation') {
    typeName =
      action === 'update'
        ? `edit${_.upperFirst(toSingular(globalId))}Input`
        : `${_.upperFirst(toSingular(globalId))}Input${required ? '!' : ''}`;
  }

  return repeatable ? `[${typeName}]` : typeName;
}

/**
 * Build GraphQL type for dynamic zone attributes.
 */
function buildDynamicZoneType(attribute, modelName, attributeName, rootType) {
  const { required } = attribute;
  const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
  const typeName = rootType === 'mutation' ? `${unionName}Input!` : unionName;
  return `[${typeName}]${required ? '!' : ''}`;
}

/**
 * Build GraphQL type for relational attributes.
 */
function buildAssociationType(attribute, rootType) {
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
 * @param {Object} params
 * @return {String}
 */
function convertType({
  attribute = {},
  modelName = '',
  attributeName = '',
  rootType = 'query',
  action = '',
}) {
  if (isScalarAttribute(attribute)) {
    if (attribute.type === 'enumeration') {
      return this.convertEnumType(attribute, modelName, attributeName);
    }
    return resolveScalarType(attribute, rootType, action);
  }

  if (attribute.type === 'component') {
    return buildComponentType(attribute, modelName, rootType, action);
  }

  if (attribute.type === 'dynamiczone') {
    return buildDynamicZoneType(attribute, modelName, attributeName, rootType);
  }

  // Association or fallback
  return buildAssociationType(attribute, rootType);
}

/**
 * Convert Strapi enumeration to GraphQL Enum.
 */
function convertEnumType(definition, model, field) {
  return definition.enumName
    ? definition.enumName
    : `ENUM_${model.toUpperCase()}_${field.toUpperCase()}`;
}

/**
 * Return scalar type mappings.
 */
function getScalars() {
  return {
    JSON: GraphQLJSON,
    DateTime: GraphQLDateTime,
    Time,
    Date: GraphQLDate,
    Long: GraphQLLong,
    Upload: GraphQLUpload,
  };
}

/**
 * Generate polymorphic union type definition and resolver.
 */
function addPolymorphicUnionType(definition) {
  const types = graphql
    .parse(definition)
    .definitions.filter(
      (def) => def.kind === 'ObjectTypeDefinition' && def.name.value !== 'Query'
    )
    .map((def) => def.name.value);

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

  return { definition: '', resolvers: {} };
}

/**
 * Simple InputID definition.
 */
function addInput() {
  return `
    input InputID { id: ID!}
  `;
}

/**
 * Build field lines for an input type.
 */
function buildInputFields(model, globalId, rootType, action) {
  return Object.keys(model.attributes)
    .filter((attr) => isTypeAttributeEnabled(model, attr))
    .map((attr) => {
      const fieldType = module.exports.convertType({
        attribute: model.attributes[attr],
        modelName: globalId,
        attributeName: attr,
        rootType,
        action,
      });
      return `${attr}: ${fieldType}`;
    })
    .join('\n');
}

/**
 * Generate GraphQL input models for a Strapi model.
 */
function generateInputModel(model, name, { allowIds = false } = {}) {
  const globalId = model.globalId;
  const inputName = `${_.upperFirst(toSingular(name))}Input`;
  const hasAllAttributesDisabled = Object.keys(model.attributes).every(
    (attr) => !isTypeAttributeEnabled(model, attr)
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
 * Generate input and payload definitions for mutations.
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
  convertEnumType,
  getScalars,
  addPolymorphicUnionType,
  addInput,
  generateInputModel,
  generateInputPayloadArguments,
};