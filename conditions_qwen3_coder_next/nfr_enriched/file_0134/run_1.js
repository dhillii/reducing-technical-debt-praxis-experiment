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
 * Determines the base GraphQL scalar type for a Strapi attribute.
 */
function getScalarGraphQLType(attribute) {
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
      return 'ENUMERATION';
    default:
      return 'String';
  }
}

/**
 * Builds the required/enabled suffix for GraphQL type declarations.
 */
function buildTypeSuffix(attribute, rootType, action) {
  if (!attribute.required) return '';
  if (rootType === 'mutation' && action === 'update' && attribute.default !== undefined) return '';
  return '!';
}

/**
 * Generates component GraphQL type representation.
 */
function buildComponentType(attribute, modelName, attributeName, rootType, action) {
  const { required, repeatable, component } = attribute;
  const globalId = strapi.components[component].globalId;
  const singular = _.upperFirst(toSingular(globalId));

  let typeName = required ? `${globalId}` : globalId;

  if (rootType === 'mutation') {
    typeName = action === 'update'
      ? `edit${singular}Input`
      : `${singular}Input${required ? '!' : ''}`;
  }

  return repeatable ? `[${typeName}]` : typeName;
}

/**
 * Generates dynamic zone GraphQL type representation.
 */
function buildDynamicZoneType(attribute, modelName, attributeName, rootType) {
  const { required } = attribute;
  const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
  const typeName = rootType === 'mutation' ? `${unionName}Input!` : unionName;
  return `[${typeName}]${required ? '!' : ''}`;
}

/**
 * Builds association (relation) GraphQL type.
 */
function buildAssociationType(attribute, rootType) {
  const ref = attribute.model || attribute.collection;
  if (!ref || ref === '*') {
    return rootType === 'mutation' ? attribute.model ? 'ID' : '[ID]' : attribute.model ? 'Morph' : '[Morph]';
  }

  const model = strapi.db.getModel(ref, attribute.plugin);
  const globalId = model.globalId;

  if (attribute.collection && !_.isEmpty(attribute.collection)) {
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
    if (!isScalarAttribute(attribute)) {
      if (attribute.type === 'component') {
        return buildComponentType(attribute, modelName, attributeName, rootType, action);
      }
      if (attribute.type === 'dynamiczone') {
        return buildDynamicZoneType(attribute, modelName, attributeName, rootType);
      }
      return buildAssociationType(attribute, rootType);
    }

    let type = getScalarGraphQLType(attribute);

    if (type === 'ENUMERATION') {
      type = this.convertEnumType(attribute, modelName, attributeName);
    }

    const suffix = buildTypeSuffix(attribute, rootType, action);
    return type + suffix;
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

    if (types.length === 0) {
      return { definition: '', resolvers: {} };
    }

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

    const attributes = Object.keys(model.attributes).filter(attributeName => isTypeAttributeEnabled(model, attributeName));

    const baseInputFields = attributes.map(attributeName => {
      return `${attributeName}: ${this.convertType({
        attribute: model.attributes[attributeName],
        modelName: globalId,
        attributeName,
        rootType: 'mutation',
      })}`;
    }).join('\n');

    const updateInputFields = attributes.map(attributeName => {
      return `${attributeName}: ${this.convertType({
        attribute: model.attributes[attributeName],
        modelName: globalId,
        attributeName,
        rootType: 'mutation',
        action: 'update',
      })}`;
    }).join('\n');

    const idField = allowIds ? 'id: ID\n' : '';

    return `
      input ${inputName} {
        ${baseInputFields}
      }

      input edit${inputName} {
        ${idField}${updateInputFields ? `\n${updateInputFields}` : ''}
      }
    `;
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
          input ${mutationName}Input { data: edit${inputName} }
          type ${mutationName}Payload { ${singularName}: ${model.globalId} }
        `;
        }
        return `
          input ${mutationName}Input { where: InputID, data: edit${inputName} }
          type ${mutationName}Payload { ${singularName}: ${model.globalId} }
        `;
      case 'delete':
        if (kind === 'singleType') {
          return `
          type ${mutationName}Payload { ${singularName}: ${model.globalId} }
        `;
        }
        return `
          input ${mutationName}Input { where: InputID }
          type ${mutationName}Payload { ${singularName}: ${model.globalId} }
        `;
      default:
        return '';
    }
  },
};