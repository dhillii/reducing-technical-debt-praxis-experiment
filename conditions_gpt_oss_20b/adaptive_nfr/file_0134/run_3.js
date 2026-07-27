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
 * Map Strapi scalar types to GraphQL types.
 * @type {Object<string,string>}
 */
const scalarTypeMap = {
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
 * Apply required modifier to a GraphQL type based on attribute metadata.
 * @param {String} type - Base GraphQL type.
 * @param {Object} attribute - Attribute definition.
 * @param {String} rootType - Root GraphQL type (query/mutation).
 * @param {String} action - Mutation action (create/update/delete).
 * @return {String}
 */
function applyRequired(type, attribute, rootType, action) {
  if (attribute.required) {
    if (rootType !== 'mutation' || (action !== 'update' && attribute.default === undefined)) {
      return `${type}!`;
    }
  }
  return type;
}

/**
 * Resolve GraphQL type for scalar attributes.
 * @param {Object} attribute - Attribute definition.
 * @param {String} rootType - Root GraphQL type.
 * @param {String} action - Mutation action.
 * @return {String|null}
 */
function getScalarGraphQLType(attribute, rootType, action) {
  const baseType = scalarTypeMap[attribute.type];
  if (!baseType) return null;
  return applyRequired(baseType, attribute, rootType, action);
}

/**
 * Resolve GraphQL type for component attributes.
 * @param {Object} attribute - Attribute definition.
 * @param {String} rootType - Root GraphQL type.
 * @param {String} action - Mutation action.
 * @return {String}
 */
function componentHandler(attribute, rootType, action) {
  const { required, repeatable, component } = attribute;
  const globalId = strapi.components[component].globalId;
  let typeName = required === true ? `${globalId}` : globalId;

  if (rootType === 'mutation') {
    typeName =
      action === 'update'
        ? `edit${_.upperFirst(toSingular(globalId))}Input`
        : `${_.upperFirst(toSingular(globalId))}Input${required ? '!' : ''}`;
  }

  if (repeatable === true) {
    return `[${typeName}]`;
  }
  return `${typeName}`;
}

/**
 * Resolve GraphQL type for dynamiczone attributes.
 * @param {Object} attribute - Attribute definition.
 * @param {String} modelName - Name of the owning model.
 * @param {String} attributeName - Name of the attribute.
 * @param {String} rootType - Root GraphQL type.
 * @return {String}
 */
function dynamiczoneHandler(attribute, modelName, attributeName, rootType) {
  const { required } = attribute;
  const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
  let typeName = unionName;

  if (rootType === 'mutation') {
    typeName = `${unionName}Input!`;
  }

  return `[${typeName}]${required ? '!' : ''}`;
}

/**
 * Resolve GraphQL type for association attributes.
 * @param {Object} attribute - Attribute definition.
 * @param {String} rootType - Root GraphQL type.
 * @return {String|null}
 */
function associationHandler(attribute, rootType) {
  const ref = attribute.model || attribute.collection;
  if (ref && ref !== '*') {
    const globalId = strapi.db.getModel(ref, attribute.plugin).globalId;
    const plural = !_.isEmpty(attribute.collection);

    if (plural) {
      if (rootType === 'mutation') {
        return '[ID]';
      }
      return `[${globalId}]`;
    }

    if (rootType === 'mutation') {
      return 'ID';
    }
    return globalId;
  }
  return null;
}

/**
 * Resolve GraphQL type for non-association, non-scalar attributes.
 * @param {Object} attribute - Attribute definition.
 * @param {String} rootType - Root GraphQL type.
 * @return {String}
 */
function defaultHandler(attribute, rootType) {
  if (rootType === 'mutation') {
    return attribute.model ? 'ID' : '[ID]';
  }
  return attribute.model ? 'Morph' : '[Morph]';
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
    // Scalar attributes
    if (isScalarAttribute(attribute)) {
      if (attribute.type === 'enumeration') {
        const enumType = this.convertEnumType(attribute, modelName, attributeName);
        return applyRequired(enumType, attribute, rootType, action);
      }
      const scalarType = getScalarGraphQLType(attribute, rootType, action);
      if (scalarType) {
        return scalarType;
      }
    }

    // Component attribute
    if (attribute.type === 'component') {
      return componentHandler(attribute, rootType, action);
    }

    // Dynamiczone attribute
    if (attribute.type === 'dynamiczone') {
      return dynamiczoneHandler(attribute, modelName, attributeName, rootType);
    }

    // Association attribute
    const assocType = associationHandler(attribute, rootType);
    if (assocType) {
      return assocType;
    }

    // Default handling
    return defaultHandler(attribute, rootType);
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