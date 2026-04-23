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
 * Resolve GraphQL scalar type from a Strapi attribute.
 * @param {Object} attribute Strapi attribute definition.
 * @returns {String} GraphQL scalar type.
 */
function resolveScalarType(attribute) {
  switch (attribute.type) {
    case 'boolean':
      return 'Boolean';
    case 'integer':
      return 'Int';
    case 'biginteger':
      return 'Long';
    case 'float':
    case 'decimal':
      return 'Float';
    case 'json':
      return 'JSON';
    case 'date':
      return 'Date';
    case 'time':
      return 'Time';
    case 'datetime':
    case 'timestamp':
      return 'DateTime';
    case 'enumeration':
      // Handled separately via convertEnumType
      return null;
    default:
      return 'String';
  }
}

/**
 * Build GraphQL type string for component attributes.
 */
function buildComponentType({ attribute, modelName, attributeName, rootType, action }) {
  const { required, repeatable, component } = attribute;
  const globalId = strapi.components[component].globalId;

  let typeName = required === true ? `${globalId}` : globalId;

  if (rootType === 'mutation') {
    typeName =
      action === 'update'
        ? `edit${_.upperFirst(toSingular(globalId))}Input`
        : `${_.upperFirst(toSingular(globalId))}Input${required ? '!' : ''}`;
  }

  return repeatable ? `[${typeName}]` : `${typeName}`;
}

/**
 * Build GraphQL type string for dynamic zone attributes.
 */
function buildDynamicZoneType({ attribute, modelName, attributeName, rootType }) {
  const { required } = attribute;
  const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
  const typeName = rootType === 'mutation' ? `${unionName}Input!` : unionName;
  return `[${typeName}]${required ? '!' : ''}`;
}

/**
 * Build GraphQL type string for relational attributes.
 */
function buildAssociationType({ attribute, rootType }) {
  const ref = attribute.model || attribute.collection;
  if (!ref || ref === '*') {
    return null;
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
 * @param {Object} params Conversion parameters.
 * @returns {String} GraphQL type.
 */
function convertType({
  attribute = {},
  modelName = '',
  attributeName = '',
  rootType = 'query',
  action = '',
}) {
  // Scalar handling
  if (isScalarAttribute(attribute)) {
    let type = resolveScalarType(attribute) || this.convertEnumType(attribute, modelName, attributeName);
    if (attribute.required) {
      if (rootType !== 'mutation' || (action !== 'update' && attribute.default === undefined)) {
        type += '!';
      }
    }
    return type;
  }

  // Component handling
  if (attribute.type === 'component') {
    return buildComponentType({ attribute, modelName, attributeName, rootType, action });
  }

  // Dynamic zone handling
  if (attribute.type === 'dynamiczone') {
    return buildDynamicZoneType({ attribute, modelName, attributeName, rootType });
  }

  // Association handling
  const assocType = buildAssociationType({ attribute, rootType });
  if (assocType) {
    return assocType;
  }

  // Fallback for polymorphic relations
  if (rootType === 'mutation') {
    return attribute.model ? 'ID' : '[ID]';
  }
  return attribute.model ? 'Morph' : '[Morph]';
}

/**
 * Convert Strapi enumeration to GraphQL Enum.
 * @param {Object} definition Definition of the attribute.
 * @param {String} model Name of the model which owns the attribute.
 * @param {String} field Name of the attribute.
 * @return String
 */
function convertEnumType(definition, model, field) {
  return definition.enumName
    ? definition.enumName
    : `ENUM_${model.toUpperCase()}_${field.toUpperCase()}`;
}

/**
 * Return custom scalar mappings.
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
 * Generate a polymorphic union type definition and resolver.
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
 * Simple InputID type definition.
 */
function addInput() {
  return `
    input InputID { id: ID!}
  `;
}

/**
 * Generate GraphQL input types for a model.
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

  const enabledAttrs = Object.keys(model.attributes).filter((attr) =>
    isTypeAttributeEnabled(model, attr)
  );

  const createFields = enabledAttrs
    .map((attributeName) => {
      const attr = model.attributes[attributeName];
      return `${attributeName}: ${this.convertType({
        attribute: attr,
        modelName: globalId,
        attributeName,
        rootType: 'mutation',
      })}`;
    })
    .join('\n');

  const editFields = enabledAttrs
    .map((attributeName) => {
      const attr = model.attributes[attributeName];
      return `${attributeName}: ${this.convertType({
        attribute: attr,
        modelName: globalId,
        attributeName,
        rootType: 'mutation',
        action: 'update',
      })}`;
    })
    .join('\n');

  return `
    input ${inputName} {
      ${createFields}
    }

    input edit${inputName} {
      ${allowIds ? 'id: ID' : ''}
      ${editFields}
    }
  `;
}

/**
 * Generate GraphQL input and payload definitions for mutations.
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