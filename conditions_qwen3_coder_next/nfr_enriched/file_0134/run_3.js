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
 * @param {Object} attribute - Attribute definition
 * @return {String} - GraphQL scalar type name
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
 * Determines if a type requirement modifier should be applied.
 * @param {Object} params - Condition parameters
 * @param {String} params.rootType - Root operation type (query/mutation)
 * @param {String} params.action - Mutation action type (create/update)
 * @param {Boolean} params.required - Attribute required flag
 * @param {*} params.defaultValue - Default attribute value
 * @return {Boolean} - Whether to append '!' to type
 */
function shouldApplyRequiredModifier({ rootType, action, required, defaultValue }) {
  if (!required) {
    return false;
  }

  if (rootType !== 'mutation') {
    return true;
  }

  if (action !== 'update') {
    return defaultValue === undefined;
  }

  return false;
}

/**
 * Builds the GraphQL type string with modifiers for scalar attributes.
 * @param {Object} params - Conversion parameters
 * @param {Object} params.attribute - Attribute definition
 * @param {String} params.rootType - Root operation type
 * @param {String} params.action - Mutation action
 * @return {String} - GraphQL type string
 */
function buildScalarType({ attribute, rootType, action }) {
  const typeName = getScalarTypeName(attribute);
  const typeWithModification = shouldApplyRequiredModifier({
    rootType,
    action,
    required: attribute.required,
    defaultValue: attribute.default,
  })
    ? `${typeName}!`
    : typeName;

  return typeWithModification;
}

/**
 * Generates component type name for GraphQL.
 * @param {Object} params - Component parameters
 * @param {Boolean} params.required - Component required flag
 * @param {Boolean} params.repeatable - Component repeatable flag
 * @param {String} params.globalId - Component global ID
 * @param {String} params.rootType - Root operation type
 * @param {String} params.action - Mutation action
 * @return {String} - GraphQL component type name
 */
function buildComponentTypeName({ required, repeatable, globalId, rootType, action }) {
  let typeName = required === true ? `${globalId}` : globalId;

  if (rootType === 'mutation') {
    typeName = action === 'update'
      ? `edit${_.upperFirst(toSingular(globalId))}Input`
      : `${_.upperFirst(toSingular(globalId))}Input${required ? '!' : ''}`;
  }

  return repeatable === true ? `[${typeName}]` : typeName;
}

/**
 * Generates dynamic zone type name for GraphQL.
 * @param {Object} params - Dynamic zone parameters
 * @param {Boolean} params.required - Dynamic zone required flag
 * @param {String} params.modelName - Model name
 * @param {String} params.attributeName - Attribute name
 * @param {String} params.rootType - Root operation type
 * @return {String} - GraphQL dynamic zone type name
 */
function buildDynamicZoneTypeName({ required, modelName, attributeName, rootType }) {
  const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
  const typeName = rootType === 'mutation' ? `${unionName}Input!` : unionName;
  return `[${typeName}]${required ? '!' : ''}`;
}

/**
 * Generates association type name for GraphQL.
 * @param {Object} params - Association parameters
 * @param {Object} params.attribute - Attribute definition
 * @param {String} params.rootType - Root operation type
 * @param {String} params.modelName - Model name (not used but maintained for signature compatibility)
 * @param {String} params.attributeName - Attribute name (not used but maintained for signature compatibility)
 * @return {String} - GraphQL association type name
 */
function buildAssociationTypeName({ attribute, rootType, modelName, attributeName }) {
  const ref = attribute.model || attribute.collection;
  
  if (!ref || ref === '*') {
    return rootType === 'mutation' 
      ? attribute.model ? 'ID' : '[ID]'
      : attribute.model ? 'Morph' : '[Morph]';
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
    // Handle scalar attributes
    if (isScalarAttribute(attribute)) {
      return buildScalarType({ attribute, rootType, action });
    }

    // Handle component types
    if (attribute.type === 'component') {
      const { required, repeatable, component } = attribute;
      const globalId = strapi.components[component].globalId;
      
      return buildComponentTypeName({ required, repeatable, globalId, rootType, action });
    }

    // Handle dynamiczone types
    if (attribute.type === 'dynamiczone') {
      const { required } = attribute;
      return buildDynamicZoneTypeName({ required, modelName, attributeName, rootType });
    }

    // Handle associations and morph relations
    return buildAssociationTypeName({ attribute, rootType, modelName, attributeName });
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

  add PolymorphicUnionType(definition) {
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