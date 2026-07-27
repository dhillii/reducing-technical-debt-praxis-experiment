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

/** @type {Object<string, string>} Maps Strapi scalar types to GraphQL types */
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
 * Converts a Strapi scalar type to its GraphQL equivalent.
 * @param {string} strapiType - The Strapi type name
 * @param {Object} attribute - The attribute definition
 * @param {string} modelName - The model name
 * @param {string} attributeName - The attribute name
 * @return {string} The GraphQL type name
 */
const convertScalarType = (strapiType, attribute, modelName, attributeName) => {
  if (strapiType === 'enumeration') {
    return module.exports.convertEnumType(attribute, modelName, attributeName);
  }
  return SCALAR_TYPE_MAP[strapiType] || 'String';
};

/**
 * Applies required modifier to a GraphQL type if needed.
 * @param {string} type - The GraphQL type
 * @param {Object} attribute - The attribute definition
 * @param {string} rootType - The root type (query/mutation)
 * @param {string} action - The mutation action
 * @return {string} The modified type
 */
const applyRequiredModifier = (type, attribute, rootType, action) => {
  if (attribute.required) {
    if (rootType !== 'mutation' || (action !== 'update' && attribute.default === undefined)) {
      return `${type}!`;
    }
  }
  return type;
};

/**
 * Converts a component attribute to its GraphQL type representation.
 * @param {Object} attribute - The attribute definition
 * @param {string} rootType - The root type (query/mutation)
 * @param {string} action - The mutation action
 * @return {string} The GraphQL type
 */
const convertComponentType = (attribute, rootType, action) => {
  const { required, repeatable, component } = attribute;
  const globalId = strapi.components[component].globalId;

  let typeName = globalId;

  if (rootType === 'mutation') {
    const singular = _.upperFirst(toSingular(globalId));
    typeName = action === 'update'
      ? `edit${singular}Input`
      : `${singular}Input${required ? '!' : ''}`;
  }

  if (repeatable === true) {
    return `[${typeName}]`;
  }
  return typeName;
};

/**
 * Converts a dynamic zone attribute to its GraphQL type representation.
 * @param {Object} attribute - The attribute definition
 * @param {string} modelName - The model name
 * @param {string} attributeName - The attribute name
 * @param {string} rootType - The root type (query/mutation)
 * @return {string} The GraphQL type
 */
const convertDynamicZoneType = (attribute, modelName, attributeName, rootType) => {
  const { required } = attribute;
  const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;

  let typeName = unionName;

  if (rootType === 'mutation') {
    typeName = `${unionName}Input!`;
  }

  return `[${typeName}]${required ? '!' : ''}`;
};

/**
 * Determines if an attribute is a plural association.
 * @param {Object} attribute - The attribute definition
 * @return {boolean} True if the attribute represents a collection
 */
const isPluralAssociation = (attribute) => !_.isEmpty(attribute.collection);

/**
 * Converts an association attribute to its GraphQL type representation.
 * @param {Object} attribute - The attribute definition
 * @param {string} rootType - The root type (query/mutation)
 * @return {string} The GraphQL type
 */
const convertAssociationType = (attribute, rootType) => {
  const ref = attribute.model || attribute.collection;

  if (ref && ref !== '*') {
    const globalId = strapi.db.getModel(ref, attribute.plugin).globalId;
    const plural = isPluralAssociation(attribute);

    if (plural) {
      return rootType === 'mutation' ? '[ID]' : `[${globalId}]`;
    }

    return rootType === 'mutation' ? 'ID' : globalId;
  }

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
    if (isScalarAttribute(attribute)) {
      let type = convertScalarType(attribute.type, attribute, modelName, attributeName);
      return applyRequiredModifier(type, attribute, rootType, action);
    }

    if (attribute.type === 'component') {
      return convertComponentType(attribute, rootType, action);
    }

    if (attribute.type === 'dynamiczone') {
      return convertDynamicZoneType(attribute, modelName, attributeName, rootType);
    }

    return convertAssociationType(attribute, rootType);
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

    const payloadStrategies = {
      create: () => `
        input ${mutationName}Input { data: ${inputName} }
        type ${mutationName}Payload { ${singularName}: ${model.globalId} }
      `,
      update: () => {
        const whereClause = kind === 'singleType' ? '' : 'where: InputID, ';
        return `
          input ${mutationName}Input  { ${whereClause}data: edit${inputName} }
          type ${mutationName}Payload { ${singularName}: ${model.globalId} }
        `;
      },
      delete: () => {
        const inputClause = kind === 'singleType'
          ? ''
          : `input ${mutationName}Input  { where: InputID }`;
        return `
          ${inputClause}
          type ${mutationName}Payload { ${singularName}: ${model.globalId} }
        `;
      },
    };

    return payloadStrategies[action]?.();
  },
};