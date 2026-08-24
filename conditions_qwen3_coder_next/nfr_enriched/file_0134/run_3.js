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
 * Determine GraphQL type string for a scalar attribute.
 * @param {Object} attribute - Attribute definition
 * @return {String} GraphQL type string
 */
function getScalarType(attribute) {
  switch (attribute.type) {
    case 'boolean': return 'Boolean';
    case 'integer': return 'Int';
    case 'biginteger': return 'Long';
    case 'float':
    case 'decimal': return 'Float';
    case 'json': return 'JSON';
    case 'date': return 'Date';
    case 'time': return 'Time';
    case 'datetime':
    case 'timestamp': return 'DateTime';
    case 'enumeration': return null; // handled separately
    default: return 'String';
  }
}

/**
 * Determine if a scalar type should be non-nullable.
 * @param {Object} attribute - Attribute definition
 * @param {String} rootType - Operation type (query/mutation)
 * @param {String} action - Mutation action (create/update)
 * @return {Boolean} true if type should be non-nullable
 */
function shouldMakeScalarNonNullable(attribute, rootType, action) {
  if (!attribute.required) return false;
  if (rootType !== 'mutation') return true;
  if (action === 'update' && attribute.default !== undefined) return false;
  return true;
}

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
      const baseType = getScalarType(attribute) || this.convertEnumType(attribute, modelName, attributeName);
      const isNonNullable = shouldMakeScalarNonNullable(attribute, rootType, action);
      return `${baseType}${isNonNullable ? '!' : ''}`;
    }

    // Handle component attributes
    if (attribute.type === 'component') {
      return this.convertComponentType(attribute, modelName, attributeName, rootType, action);
    }

    // Handle dynamiczone attributes
    if (attribute.type === 'dynamiczone') {
      return this.convertDynamicZoneType(attribute, modelName, attributeName, rootType);
    }

    // Handle association attributes
    if (attribute.model || attribute.collection) {
      return this.convertAssociationType(attribute, rootType, action);
    }

    // Handle fallback morph types
    return rootType === 'mutation' ? (attribute.model ? 'ID' : '[ID]') : (attribute.model ? 'Morph' : '[Morph]');
  },

  /**
   * Convert component attribute to GraphQL type.
   * @param {Object} attribute - Component attribute definition
   * @param {String} modelName - Parent model name
   * @param {String} attributeName - Component attribute name
   * @param {String} rootType - Operation type
   * @param {String} action - Mutation action
   * @return {String} GraphQL type string
   */
  convertComponentType(attribute, modelName, attributeName, rootType, action) {
    const { required, repeatable, component } = attribute;
    const globalId = strapi.components[component].globalId;
    let typeName = required === true ? `${globalId}` : globalId;

    if (rootType === 'mutation') {
      typeName = action === 'update'
        ? `edit${_.upperFirst(toSingular(globalId))}Input`
        : `${_.upperFirst(toSingular(globalId))}Input${required ? '!' : ''}`;
    }

    return repeatable === true ? `[${typeName}]` : typeName;
  },

  /**
   * Convert dynamiczone attribute to GraphQL type.
   * @param {Object} attribute - Dynamiczone attribute definition
   * @param {String} modelName - Parent model name
   * @param {String} attributeName - Dynamiczone attribute name
   * @param {String} rootType - Operation type
   * @return {String} GraphQL type string
   */
  convertDynamicZoneType(attribute, modelName, attributeName, rootType) {
    const { required } = attribute;
    const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
    let typeName = unionName;

    if (rootType === 'mutation') {
      typeName = `${unionName}Input!`;
    }

    return `[${typeName}]${required ? '!' : ''}`;
  },

  /**
   * Convert association attribute to GraphQL type.
   * @param {Object} attribute - Association attribute definition
   * @param {String} rootType - Operation type
   * @param {String} action - Mutation action
   * @return {String} GraphQL type string
   */
  convertAssociationType(attribute, rootType, action) {
    const ref = attribute.model || attribute.collection;
    if (ref === '*') return rootType === 'mutation' ? '[ID]' : '[Morph]';

    const globalId = strapi.db.getModel(ref, attribute.plugin).globalId;
    const plural = !_.isEmpty(attribute.collection);

    if (plural) {
      return rootType === 'mutation' ? '[ID]' : `[${globalId}]`;
    }

    return rootType === 'mutation' ? 'ID' : globalId;
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