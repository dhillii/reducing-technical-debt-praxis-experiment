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
const isComponentAttribute = ({ type }) => type === 'component';
const isDynamicZoneAttribute = ({ type }) => type === 'dynamiczone';
const isAssociation = (attr) => (attr.model || attr.collection) && attr.model !== '*';

/**
 * Resolve scalar GraphQL type.
 * @param {Object} attribute
 * @param {string} rootType
 * @param {string} action
 * @returns {string}
 */
function resolveScalarType(attribute, rootType, action) {
  const scalarMap = {
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
    enumeration: null, // handled separately
  };

  let type = scalarMap[attribute.type] || 'String';

  if (attribute.type === 'enumeration') {
    type = module.exports.convertEnumType(attribute, attribute.modelName, attribute.attributeName);
  }

  if (attribute.required) {
    if (rootType !== 'mutation' || (action !== 'update' && attribute.default === undefined)) {
      type += '!';
    }
  }

  return type;
}

/**
 * Resolve component GraphQL type.
 * @param {Object} attribute
 * @param {string} modelName
 * @param {string} attributeName
 * @param {string} rootType
 * @param {string} action
 * @returns {string}
 */
function resolveComponentType(attribute, modelName, attributeName, rootType, action) {
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
 * @param {Object} attribute
 * @param {string} modelName
 * @param {string} attributeName
 * @param {string} rootType
 * @returns {string}
 */
function resolveDynamicZoneType(attribute, modelName, attributeName, rootType) {
  const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
  let typeName = unionName;

  if (rootType === 'mutation') {
    typeName = `${unionName}Input!`;
  }

  return `[${typeName}]${attribute.required ? '!' : ''}`;
}

/**
 * Resolve association GraphQL type.
 * @param {Object} attribute
 * @param {string} rootType
 * @returns {string}
 */
function resolveAssociationType(attribute, rootType) {
  const ref = attribute.model || attribute.collection;
  const globalId = strapi.db.getModel(ref, attribute.plugin).globalId;
  const isPlural = !!attribute.collection;

  if (isPlural) {
    return rootType === 'mutation' ? '[ID]' : `[${globalId}]`;
  }

  return rootType === 'mutation' ? 'ID' : globalId;
}

/**
 * Resolve fallback type for non‑scalar, non‑association attributes.
 * @param {Object} attribute
 * @param {string} rootType
 * @returns {string}
 */
function resolveFallbackType(attribute, rootType) {
  if (rootType === 'mutation') {
    return attribute.model ? 'ID' : '[ID]';
  }
  return attribute.model ? 'Morph' : '[Morph]';
}

/**
 * Convert Strapi type to GraphQL type.
 * @param {Object} opts
 * @param {Object} opts.attribute Attribute definition.
 * @param {string} opts.modelName Model global ID.
 * @param {string} opts.attributeName Attribute name.
 * @param {string} [opts.rootType='query'] Root operation type.
 * @param {string} [opts.action=''] Action name (create/update).
 * @returns {string}
 */
function convertType({
  attribute = {},
  modelName = '',
  attributeName = '',
  rootType = 'query',
  action = '',
}) {
  // Attach model/field info for enum handling
  attribute.modelName = modelName;
  attribute.attributeName = attributeName;

  if (isScalarAttribute(attribute)) {
    return resolveScalarType(attribute, rootType, action);
  }

  if (isComponentAttribute(attribute)) {
    return resolveComponentType(attribute, modelName, attributeName, rootType, action);
  }

  if (isDynamicZoneAttribute(attribute)) {
    return resolveDynamicZoneType(attribute, modelName, attributeName, rootType);
  }

  if (isAssociation(attribute)) {
    return resolveAssociationType(attribute, rootType);
  }

  return resolveFallbackType(attribute, rootType);
}

module.exports = {
  /**
   * Convert Strapi type to GraphQL type.
   */
  convertType,

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

    const inputs = `
      input ${inputName} {

        ${Object.keys(model.attributes)
          .filter((attributeName) => isTypeAttributeEnabled(model, attributeName))
          .map((attributeName) => {
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
          .filter((attributeName) => isTypeAttributeEnabled(model, attributeName))
          .map((attributeName) => {
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

    const payloadMap = {
      create: () => `
          input ${mutationName}Input { data: ${inputName} }
          type ${mutationName}Payload { ${singularName}: ${model.globalId} }
        `,
      update: () => {
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
      },
      delete: () => {
        if (kind === 'singleType') {
          return `
          type ${mutationName}Payload { ${singularName}: ${model.globalId} }
        `;
        }
        return `
          input ${mutationName}Input  { where: InputID }
          type ${mutationName}Payload { ${singularName}: ${model.globalId} }
        `;
      },
    };

    const resolver = payloadMap[action];
    return resolver ? resolver() : undefined;
  },
};