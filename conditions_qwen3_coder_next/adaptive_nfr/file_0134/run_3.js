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

// Strategy objects for scalar type mapping
const SCALAR_TYPE_MAP = {
  boolean: 'Boolean',
  integer: 'Int',
  biginteger: 'Long',
  float: 'Float',
  decimal: 'Float',
  json: 'JSON',
  date: 'Date',
  time: 'Time',
  datetime: 'DateTime',
  timestamp: 'DateTime',
};

/**
 * Convert scalar attribute type to GraphQL type string.
 * @param {Object} attribute - Attribute definition
 * @return {String} GraphQL scalar type
 */
const convertScalarType = (attribute) => {
  const baseType = SCALAR_TYPE_MAP[attribute.type] || 'String';
  let type = attribute.required ? `${baseType}!` : baseType;

  // Scalar type modifiers based on mutation context
  if (attribute.required) {
    const condition = attribute.default === undefined;
    type = condition ? `${baseType}!` : baseType;
  }

  return type;
};

/**
 * Build component GraphQL type based on mutation context and attributes.
 * @param {Object} attribute - Component attribute definition
 * @param {String} modelName - Parent model name
 * @param {String} attributeName - Component field name
 * @param {String} rootType - GraphQL root type ('mutation' or 'query')
 * @param {String} action - Mutation action ('create' or 'update')
 * @return {String} Component GraphQL type
 */
const buildComponentType = ({ attribute, modelName, attributeName, rootType, action }) => {
  const { required, repeatable, component } = attribute;
  const globalId = strapi.components[component].globalId;
  let typeName = required === true ? `${globalId}` : globalId;

  if (rootType === 'mutation') {
    typeName = action === 'update'
      ? `edit${_.upperFirst(toSingular(globalId))}Input`
      : `${_.upperFirst(toSingular(globalId))}Input${required ? '!' : ''}`;
  }

  return repeatable === true ? `[${typeName}]` : typeName;
};

/**
 * Build dynamic zone GraphQL type based on mutation context.
 * @param {Object} attribute - DynamicZone attribute definition
 * @param {String} modelName - Parent model name
 * @param {String} attributeName - DynamicZone field name
 * @param {String} rootType - GraphQL root type ('mutation' or 'query')
 * @return {String} DynamicZone GraphQL type
 */
const buildDynamicZoneType = ({ attribute, modelName, attributeName, rootType }) => {
  const { required } = attribute;
  const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;

  let typeName = unionName;
  if (rootType === 'mutation') {
    typeName = `${unionName}Input!`;
  }

  return `[${typeName}]${required ? '!' : ''}`;
};

/**
 * Build association (relation) GraphQL type.
 * @param {Object} attribute - Association attribute definition
 * @param {String} rootType - GraphQL root type ('mutation' or 'query')
 * @return {String} Association GraphQL type
 */
const buildAssociationType = (attribute, rootType) => {
  const ref = attribute.model || attribute.collection;
  const plural = !_.isEmpty(attribute.collection);

  if (plural) {
    return rootType === 'mutation' ? '[ID]' : `[${strapi.db.getModel(ref, attribute.plugin).globalId}]`;
  }

  return rootType === 'mutation' ? 'ID' : strapi.db.getModel(ref, attribute.plugin).globalId;
};

/**
 * Build morph type GraphQL type based on attribute and root context.
 * @param {Object} attribute - Morph attribute definition
 * @param {String} rootType - GraphQL root type ('mutation' or 'query')
 * @return {String} Morph GraphQL type
 */
const buildMorphType = (attribute, rootType) => {
  if (rootType === 'mutation') {
    return attribute.model ? 'ID' : '[ID]';
  }
  return attribute.model ? 'Morph' : '[Morph]';
};

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
    if (!isScalarAttribute(attribute)) {
      switch (attribute.type) {
        case 'component':
          return buildComponentType({ attribute, modelName, attributeName, rootType, action });
        case 'dynamiczone':
          return buildDynamicZoneType({ attribute, modelName, attributeName, rootType });
        default:
      }

      const ref = attribute.model || attribute.collection;
      if (ref && ref !== '*') {
        return buildAssociationType(attribute, rootType);
      }

      return buildMorphType(attribute, rootType);
    }

    const type = convertScalarType(attribute);
    if (attribute.required && rootType === 'mutation' && action === 'update' && attribute.default !== undefined) {
      return type.replace('!', '');
    }

    return type;
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