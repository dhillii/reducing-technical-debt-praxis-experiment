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
 * Get GraphQL type for a component attribute.
 * @param {Object} attribute
 * @param {String} modelName
 * @param {String} rootType
 * @param {String} action
 * @returns {String}
 */
function getComponentGraphQLType(attribute, modelName, rootType, action) {
  const { required, repeatable, component } = attribute;
  const globalId = strapi.components[component].globalId;
  let typeName = required === true ? `${globalId}` : globalId;

  if (rootType === 'mutation') {
    if (action === 'update') {
      typeName = `edit${_.upperFirst(toSingular(globalId))}Input`;
    } else {
      typeName = `${_.upperFirst(toSingular(globalId))}Input${required ? '!' : ''}`;
    }
  }

  return repeatable === true ? `[${typeName}]` : `${typeName}`;
}

/**
 * Get GraphQL type for a dynamiczone attribute.
 * @param {Object} attribute
 * @param {String} modelName
 * @param {String} attributeName
 * @param {String} rootType
 * @returns {String}
 */
function getDynamicZoneGraphQLType(attribute, modelName, attributeName, rootType) {
  const { required } = attribute;
  const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
  let typeName = unionName;

  if (rootType === 'mutation') {
    typeName = `${unionName}Input!`;
  }

  return `[${typeName}]${required ? '!' : ''}`;
}

/**
 * Get GraphQL type for an association attribute.
 * @param {Object} attribute
 * @param {String} rootType
 * @returns {String}
 */
function getAssociationGraphQLType(attribute, rootType) {
  const ref = attribute.model || attribute.collection;

  if (ref && ref !== '*') {
    const globalId = strapi.db.getModel(ref, attribute.plugin).globalId;
    const plural = !_.isEmpty(attribute.collection);

    if (plural) {
      return rootType === 'mutation' ? '[ID]' : `[${globalId}]`;
    }

    return rootType === 'mutation' ? 'ID' : globalId;
  }

  return null;
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
      let type = SCALAR_TYPE_MAP[attribute.type] || 'String';

      if (attribute.type === 'enumeration') {
        type = this.convertEnumType(attribute, modelName, attributeName);
      }

      if (attribute.required) {
        if (rootType !== 'mutation' || (action !== 'update' && attribute.default === undefined)) {
          type += '!';
        }
      }

      return type;
    }

    if (attribute.type === 'component') {
      return getComponentGraphQLType(attribute, modelName, rootType, action);
    }

    if (attribute.type === 'dynamiczone') {
      return getDynamicZoneGraphQLType(attribute, modelName, attributeName, rootType);
    }

    // Association
    const assocType = getAssociationGraphQLType(attribute, rootType);
    if (assocType !== null) {
      return assocType;
    }

    // Default
    if (rootType === 'mutation') {
      return attribute.model ? 'ID' : '[ID]';
    }

    return attribute.model ? 'Morph' : '[Morph]';
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

  /**
   * Generate input payload arguments for mutations.
   * @param {Object} params
   * @param {Object} params.model
   * @param {String} params.name
   * @param {String} params.mutationName
   * @param {String} params.action
   * @returns {String|undefined}
   */
  generateInputPayloadArguments({ model, name, mutationName, action }) {
    const singularName = toSingular(name);
    const inputName = toInputName(name);

    const generators = {
      create: () => `
          input ${mutationName}Input { data: ${inputName} }
          type ${mutationName}Payload { ${singularName}: ${model.globalId} }
        `,
      update: () => {
        if (model.kind === 'singleType') {
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
        if (model.kind === 'singleType') {
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

    const generator = generators[action];
    return generator ? generator() : undefined;
  },
};