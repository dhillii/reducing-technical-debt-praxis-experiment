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
 * Map scalar Strapi types to GraphQL types.
 * @type {Object<string,string>}
 */
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
 * Apply required modifier based on attribute metadata.
 * @param {string} baseType
 * @param {Object} attribute
 * @param {string} rootType
 * @param {string} action
 * @returns {string}
 */
function applyRequired(baseType, attribute, rootType, action) {
  if (attribute.required) {
    if (rootType !== 'mutation' || (action !== 'update' && attribute.default === undefined)) {
      return `${baseType}!`;
    }
  }
  return baseType;
}

/**
 * Handle scalar attribute conversion.
 * @param {Object} attribute
 * @param {string} rootType
 * @param {string} action
 * @returns {string}
 */
function handleScalar(attribute, rootType, action) {
  const base = SCALAR_TYPE_MAP[attribute.type] || 'String';
  const type = attribute.type === 'enumeration'
    ? this.convertEnumType(attribute, this.currentModelName, this.currentAttributeName)
    : base;
  return applyRequired(type, attribute, rootType, action);
}

/**
 * Handle component attribute conversion.
 * @param {Object} attribute
 * @param {string} modelName
 * @param {string} attributeName
 * @param {string} rootType
 * @param {string} action
 * @returns {string}
 */
function handleComponent(attribute, modelName, attributeName, rootType, action) {
  const { required, repeatable, component } = attribute;
  const globalId = strapi.components[component].globalId;

  let typeName = required === true ? `${globalId}` : globalId;

  if (rootType === 'mutation') {
    typeName =
      action === 'update'
        ? `edit${_.upperFirst(toSingular(globalId))}Input`
        : `${_.upperFirst(toSingular(globalId))}Input${required ? '!' : ''}`;
  }

  if (repeatable) {
    return `[${typeName}]`;
  }
  return `${typeName}`;
}

/**
 * Handle dynamic zone attribute conversion.
 * @param {Object} attribute
 * @param {string} modelName
 * @param {string} attributeName
 * @param {string} rootType
 * @returns {string}
 */
function handleDynamicZone(attribute, modelName, attributeName, rootType) {
  const { required } = attribute;
  const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
  let typeName = unionName;

  if (rootType === 'mutation') {
    typeName = `${unionName}Input!`;
  }

  return `[${typeName}]${required ? '!' : ''}`;
}

/**
 * Handle relational attribute conversion.
 * @param {Object} attribute
 * @param {string} rootType
 * @param {string} action
 * @returns {string}
 */
function handleRelation(attribute, rootType, action) {
  const ref = attribute.model || attribute.collection;

  if (ref && ref !== '*') {
    const globalId = strapi.db.getModel(ref, attribute.plugin).globalId;
    const isCollection = !_.isEmpty(attribute.collection);

    if (isCollection) {
      return rootType === 'mutation' ? '[ID]' : `[${globalId}]`;
    }

    return rootType === 'mutation' ? 'ID' : globalId;
  }

  if (rootType === 'mutation') {
    return attribute.model ? 'ID' : '[ID]';
  }

  return attribute.model ? 'Morph' : '[Morph]';
}

module.exports = {
  /**
   * Convert Strapi type to GraphQL type.
   * @param {Object} params
   * @param {Object} params.attribute Information about the attribute.
   * @param {string} params.modelName Name of the model which owns the attribute.
   * @param {string} params.attributeName Name of the attribute.
   * @param {string} [params.rootType='query']
   * @param {string} [params.action='']
   * @return {string}
   */
  convertType({
    attribute = {},
    modelName = '',
    attributeName = '',
    rootType = 'query',
    action = '',
  }) {
    // Preserve context for enum conversion
    this.currentModelName = modelName;
    this.currentAttributeName = attributeName;

    if (isScalarAttribute(attribute)) {
      return handleScalar.call(this, attribute, rootType, action);
    }

    if (attribute.type === 'component') {
      return handleComponent(attribute, modelName, attributeName, rootType, action);
    }

    if (attribute.type === 'dynamiczone') {
      return handleDynamicZone(attribute, modelName, attributeName, rootType);
    }

    return handleRelation(attribute, rootType, action);
  },

  /**
   * Convert Strapi enumeration to GraphQL Enum.
   * @param {Object} definition Definition of the attribute.
   * @param {string} model Model name.
   * @param {string} field Field name.
   * @return {string}
   */
  convertEnumType(definition, model, field) {
    return definition.enumName
      ? definition.enumName
      : `ENUM_${model.toUpperCase()}_${field.toUpperCase()}`;
  },

  /**
   * Add custom scalar type such as JSON.
   *
   * @return {Object}
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
   * @param {string} definition GraphQL schema definition.
   * @return {Object}
   */
  addPolymorphicUnionType(definition) {
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

  /**
   * Generate GraphQL input types for a model.
   *
   * @param {Object} model Strapi model.
   * @param {string} name Model name.
   * @param {Object} options Options.
   * @param {boolean} [options.allowIds=false]
   * @return {string}
   */
  generateInputModel(model, name, { allowIds = false } = {}) {
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
        return `${attributeName}: ${this.convertType({
          attribute: model.attributes[attributeName],
          modelName: globalId,
          attributeName,
          rootType: 'mutation',
        })}`;
      })
      .join('\n');

    const editFields = enabledAttrs
      .map((attributeName) => {
        return `${attributeName}: ${this.convertType({
          attribute: model.attributes[attributeName],
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
  },

  /**
   * Generate input and payload definitions for mutations.
   *
   * @param {Object} params
   * @param {Object} params.model Strapi model.
   * @param {string} params.name Model name.
   * @param {string} params.mutationName Mutation name.
   * @param {string} params.action Mutation action.
   * @return {string}
   */
  generateInputPayloadArguments({ model, name, mutationName, action }) {
    const singularName = toSingular(name);
    const inputName = toInputName(name);
    const { kind } = model;

    const payload = `type ${mutationName}Payload { ${singularName}: ${model.globalId} }`;

    switch (action) {
      case 'create':
        return `
          input ${mutationName}Input { data: ${inputName} }
          ${payload}
        `;
      case 'update':
        if (kind === 'singleType') {
          return `
          input ${mutationName}Input  { data: edit${inputName} }
          ${payload}
        `;
        }
        return `
          input ${mutationName}Input  { where: InputID, data: edit${inputName} }
          ${payload}
        `;
      case 'delete':
        if (kind === 'singleType') {
          return `
          ${payload}
        `;
        }
        return `
          input ${mutationName}Input  { where: InputID }
          ${payload}
        `;
      default:
        return '';
    }
  },
};