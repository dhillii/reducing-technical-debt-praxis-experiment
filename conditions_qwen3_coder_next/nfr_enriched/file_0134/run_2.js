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
 * Extracts GraphQL type name for scalar attributes.
 * @param {Object} attribute - Attribute definition.
 * @return {String} GraphQL scalar type name.
 */
function getScalarTypeName(attribute) {
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
    default:
      return 'String';
  }
}

/**
 * Determines if a scalar type should be non-nullable.
 * @param {Object} attribute - Attribute definition.
 * @param {String} rootType - Operation type ('query' or 'mutation').
 * @param {String} action - Mutation action ('create', 'update', etc.).
 * @return {Boolean} True if type should be non-nullable.
 */
function shouldMakeScalarNonNullable(attribute, rootType, action) {
  if (!attribute.required) return false;
  if (rootType !== 'mutation') return true;
  if (action === 'update' && attribute.default !== undefined) return false;
  return true;
}

/**
 * Builds scalar type string with nullability suffix.
 * @param {Object} attribute - Attribute definition.
 * @param {String} rootType - Operation type.
 * @param {String} action - Mutation action.
 * @return {String} GraphQL scalar type with nullability.
 */
function buildScalarType(attribute, rootType, action) {
  const typeName = getScalarTypeName(attribute);
  const isNonNullable = shouldMakeScalarNonNullable(attribute, rootType, action);
  return isNonNullable ? `${typeName}!` : typeName;
}

/**
 * Builds component type string for GraphQL schema.
 * @param {Object} attribute - Component attribute definition.
 * @param {String} rootType - Operation type.
 * @param {String} action - Mutation action.
 * @return {String} GraphQL component type.
 */
function buildComponentType(attribute, rootType, action) {
  const { required, repeatable, component } = attribute;
  const globalId = strapi.components[component].globalId;
  let typeName = required === true ? globalId : globalId;

  if (rootType === 'mutation') {
    typeName = action === 'update'
      ? `edit${_.upperFirst(toSingular(globalId))}Input`
      : `${_.upperFirst(toSingular(globalId))}Input${required ? '!' : ''}`;
  }

  return repeatable === true ? `[${typeName}]` : typeName;
}

/**
 * Builds dynamic zone type string for GraphQL schema.
 * @param {Object} attribute - Dynamic zone attribute definition.
 * @param {String} modelName - Parent model name.
 * @param {String} attributeName - Attribute name.
 * @param {String} rootType - Operation type.
 * @return {String} GraphQL dynamic zone type.
 */
function buildDynamicZoneType(attribute, modelName, attributeName, rootType) {
  const { required } = attribute;
  const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
  let typeName = rootType === 'mutation' ? `${unionName}Input!` : unionName;
  return `[${typeName}]${required ? '!' : ''}`;
}

/**
 * Builds association type string for GraphQL schema.
 * @param {Object} attribute - Association attribute definition.
 * @param {String} rootType - Operation type.
 * @param {String} action - Mutation action.
 * @return {String} GraphQL association type.
 */
function buildAssociationType(attribute, rootType, action) {
  const ref = attribute.model || attribute.collection;
  if (!ref || ref === '*') {
    return rootType === 'mutation' ? (attribute.model ? 'ID' : '[ID]') : (attribute.model ? 'Morph' : '[Morph]');
  }

  const globalId = strapi.db.getModel(ref, attribute.plugin).globalId;
  const plural = !_.isEmpty(attribute.collection);

  if (plural) {
    return rootType === 'mutation' ? '[ID]' : `[${globalId}]`;
  }

  return rootType === 'mutation' ? 'ID' : globalId;
}

module.exports = {
  /**
   * Convert Strapi type to GraphQL type.
   * @param {Object} attribute Information about the attribute.
   * @param {Object} attribute.definition Definition of the attribute.
   * @param {String} attribute.modelName Name of the model which owns the attribute.
   * @param {String} attribute.attributeName Name of the attribute.
   * @return String
   */

  convertType({
    attribute = {},
    modelName = '',
    attributeName = '',
    rootType = 'query',
    action = '',
  }) {
    if (isScalarAttribute(attribute)) {
      return buildScalarType(attribute, rootType, action);
    }

    if (attribute.type === 'component') {
      return buildComponentType(attribute, rootType, action);
    }

    if (attribute.type === 'dynamiczone') {
      return buildDynamicZoneType(attribute, modelName, attributeName, rootType);
    }

    return buildAssociationType(attribute, rootType, action);
  },

  /**
   * Convert Strapi enumeration to GraphQL Enum.
   * @param {Object} definition Definition of the attribute.
   * @param {String} model Name of the model which owns the attribute.
   * @param {String} field Name of the attribute.
   * @return String
   */

  convertEnumType(definition, model, field) {
    return definition.enumName
      ? definition.enumName
      : `ENUM_${model.toUpperCase()}_${field.toUpperCase()}`;
  },

  /**
   * Add custom scalar type such as JSON.
   *
   * @return void
   */

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

  /**
   * Add Union Type that contains the types defined by the user.
   *
   * @return string
   */

  addPolymorphicUnionType(definition) {
    const types = graphql
      .parse(definition)
      .definitions.filter(def => def.kind === 'ObjectTypeDefinition' && def.name.value !== 'Query')
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

  generateInputModel(model, name, { allowIds = false } = {}) {
    const globalId = model.globalId;
    const inputName = `${_.upperFirst(toSingular(name))}Input`;
    const hasAllAttributesDisabled = Object.keys(model.attributes).every(attr => !isTypeAttributeEnabled(model, attr));

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

    const inputs = `
      input ${inputName} {

        ${Object.keys(model.attributes)
          .filter(attributeName => isTypeAttributeEnabled(model, attributeName))
          .map(attributeName => {
            return `${attributeName}: ${this.convertType({
              attribute: model.attributes[attributeName],
              modelName: globalId,
              attributeName,
              rootType: 'mutation',
            })}`;
          })
          .join('\n')}
      }

      input edit${inputName} {
        ${allowIds ? 'id: ID' : ''}
        ${Object.keys(model.attributes)
          .filter(attributeName => isTypeAttributeEnabled(model, attributeName))
          .map(attributeName => {
            return `${attributeName}: ${this.convertType({
              attribute: model.attributes[attributeName],
              modelName: globalId,
              attributeName,
              rootType: 'mutation',
              action: 'update',
            })}`;
          })
          .join('\n')}
      }
    `;

    return inputs;
  },

  generateInputPayloadArguments({ model, name, mutationName, action }) {
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
      // Nothing
    }
  },
};