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
 * Map Strapi scalar types to GraphQL scalar types.
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
 * Resolve scalar GraphQL type (without required modifier).
 * @param {Object} attribute Strapi attribute definition.
 * @param {string} modelName Name of the model.
 * @param {string} attributeName Name of the attribute.
 * @returns {string}
 */
function resolveScalarType(attribute, modelName, attributeName) {
  if (attribute.type === 'enumeration') {
    return module.exports.convertEnumType(attribute, modelName, attributeName);
  }
  return SCALAR_TYPE_MAP[attribute.type] || 'String';
}

/**
 * Append required modifier based on attribute metadata.
 * @param {string} baseType Base GraphQL type.
 * @param {Object} attribute Strapi attribute definition.
 * @param {string} rootType 'query' | 'mutation'.
 * @param {string} action Action name (e.g., 'update').
 * @returns {string}
 */
function applyRequiredModifier(baseType, attribute, rootType, action) {
  if (!attribute.required) {
    return baseType;
  }
  if (rootType !== 'mutation' || (action !== 'update' && attribute.default === undefined)) {
    return `${baseType}!`;
  }
  return baseType;
}

/**
 * Resolve component GraphQL type.
 * @param {Object} attribute Strapi component attribute.
 * @param {string} rootType 'query' | 'mutation'.
 * @param {string} action Action name.
 * @returns {string}
 */
function resolveComponentType(attribute, rootType, action) {
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
 * Resolve dynamic zone GraphQL type.
 * @param {Object} attribute Strapi dynamic zone attribute.
 * @param {string} modelName Name of the model.
 * @param {string} attributeName Name of the attribute.
 * @param {string} rootType 'query' | 'mutation'.
 * @returns {string}
 */
function resolveDynamicZoneType(attribute, modelName, attributeName, rootType) {
  const { required } = attribute;
  const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
  let typeName = unionName;

  if (rootType === 'mutation') {
    typeName = `${unionName}Input!`;
  }

  return `[${typeName}]${required ? '!' : ''}`;
}

/**
 * Resolve association GraphQL type.
 * @param {Object} attribute Strapi association attribute.
 * @param {string} rootType 'query' | 'mutation'.
 * @returns {string|null} Returns null when not an association.
 */
function resolveAssociationType(attribute, rootType) {
  const ref = attribute.model || attribute.collection;
  if (!ref || ref === '*') {
    return null;
  }

  const globalId = strapi.db.getModel(ref, attribute.plugin).globalId;
  const plural = !!attribute.collection;

  if (plural) {
    return rootType === 'mutation' ? '[ID]' : `[${globalId}]`;
  }

  return rootType === 'mutation' ? 'ID' : globalId;
}

/**
 * Resolve fallback type for non‑association attributes.
 * @param {Object} attribute Strapi attribute.
 * @param {string} rootType 'query' | 'mutation'.
 * @returns {string}
 */
function resolveFallbackType(attribute, rootType) {
  if (rootType === 'mutation') {
    return attribute.model ? 'ID' : '[ID]';
  }
  return attribute.model ? 'Morph' : '[Morph]';
}

module.exports = {
  /**
   * Convert Strapi type to GraphQL type.
   * @param {Object} opts
   * @param {Object} opts.attribute Information about the attribute.
   * @param {string} opts.modelName Name of the model which owns the attribute.
   * @param {string} opts.attributeName Name of the attribute.
   * @param {string} [opts.rootType='query'] Root type ('query'|'mutation').
   * @param {string} [opts.action=''] Action name.
   * @return {string}
   */
  convertType({ attribute = {}, modelName = '', attributeName = '', rootType = 'query', action = '' }) {
    if (isScalarAttribute(attribute)) {
      const base = resolveScalarType(attribute, modelName, attributeName);
      return applyRequiredModifier(base, attribute, rootType, action);
    }

    if (attribute.type === 'component') {
      return resolveComponentType(attribute, rootType, action);
    }

    if (attribute.type === 'dynamiczone') {
      return resolveDynamicZoneType(attribute, modelName, attributeName, rootType);
    }

    const association = resolveAssociationType(attribute, rootType);
    if (association) {
      return association;
    }

    return resolveFallbackType(attribute, rootType);
  },

  /**
   * Convert Strapi enumeration to GraphQL Enum.
   * @param {Object} definition Definition of the attribute.
   * @param {String} model Name of the model which owns the attribute.
   * @param {String} field Name of the attribute.
   * @return {String}
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
   * @return {Object}
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