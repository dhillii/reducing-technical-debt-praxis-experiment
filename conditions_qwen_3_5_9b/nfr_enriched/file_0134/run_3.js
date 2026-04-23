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
    const scalarType = this.getScalarType(attribute);
    if (scalarType) {
      return this.buildScalarType(scalarType, attribute, rootType);
    }

    if (attribute.type === 'component') {
      return this.buildComponentType(attribute, rootType);
    }

    if (attribute.type === 'dynamiczone') {
      return this.buildDynamicZoneType(attribute, modelName, attributeName, rootType);
    }

    return this.buildAssociationType(attribute, rootType);
  },

  /**
   * Determines if an attribute is a scalar type and returns its base type.
   * @param {Object} attribute Information about the attribute.
   * @return {String|null} The base GraphQL type or null.
   */
  getScalarType(attribute) {
    if (!isScalarAttribute(attribute)) {
      return null;
    }

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
        return this.convertEnumType(attribute, attribute.modelName || '', attribute.attributeName || '');
      default:
        return 'String';
    }
  },

  /**
   * Builds the final GraphQL type string for a scalar attribute.
   * @param {String} baseType The base GraphQL type.
   * @param {Object} attribute Information about the attribute.
   * @param {String} rootType The root type ('query' or 'mutation').
   * @return {String} The complete GraphQL type string.
   */
  buildScalarType(baseType, attribute, rootType) {
    if (attribute.required) {
      if (rootType !== 'mutation' || (attribute.action !== 'update' && attribute.default === undefined)) {
        baseType += '!';
      }
    }
    return baseType;
  },

  /**
   * Builds the GraphQL type string for a component attribute.
   * @param {Object} attribute Information about the attribute.
   * @param {String} rootType The root type ('query' or 'mutation').
   * @return {String} The complete GraphQL type string.
   */
  buildComponentType(attribute, rootType) {
    const { required, repeatable, component } = attribute;
    const globalId = strapi.components[component].globalId;
    let typeName = required === true ? `${globalId}` : globalId;

    if (rootType === 'mutation') {
      typeName =
        attribute.action === 'update'
          ? `edit${_.upperFirst(toSingular(globalId))}Input`
          : `${_.upperFirst(toSingular(globalId))}Input${required ? '!' : ''}`;
    }

    if (repeatable === true) {
      return `[${typeName}]`;
    }
    return `${typeName}`;
  },

  /**
   * Builds the GraphQL type string for a dynamic zone attribute.
   * @param {Object} attribute Information about the attribute.
   * @param {String} modelName Name of the model which owns the attribute.
   * @param {String} attributeName Name of the attribute.
   * @param {String} rootType The root type ('query' or 'mutation').
   * @return {String} The complete GraphQL type string.
   */
  buildDynamicZoneType(attribute, modelName, attributeName, rootType) {
    const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
    let typeName = unionName;

    if (rootType === 'mutation') {
      typeName = `${unionName}Input!`;
    }

    return `[${typeName}]${attribute.required ? '!' : ''}`;
  },

  /**
   * Builds the GraphQL type string for an association attribute.
   * @param {Object} attribute Information about the attribute.
   * @param {String} rootType The root type ('query' or 'mutation').
   * @return {String} The complete GraphQL type string.
   */
  buildAssociationType(attribute, rootType) {
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

  /**
   * Generates the GraphQL input model for a Strapi model.
   * @param {Object} model The Strapi model object.
   * @param {String} name The name of the model.
   * @param {Object} options Configuration options.
   * @param {Boolean} options.allowIds Whether to allow IDs in the input.
   * @return {String} The generated GraphQL input model.
   */
  generateInputModel(model, name, { allowIds = false } = {}) {
    const globalId = model.globalId;
    const inputName = `${_.upperFirst(toSingular(name))}Input`;
    const hasAllAttributesDisabled = Object.keys(model.attributes).every(attr => !isTypeAttributeEnabled(model, attr));

    if (_.isEmpty(model.attributes) || hasAllAttributesDisabled) {
      return this.generateEmptyInputModel(inputName, allowIds);
    }

    return this.generatePopulatedInputModel(model, inputName, globalId, allowIds);
  },

  /**
   * Generates an empty input model when no attributes are enabled.
   * @param {String} inputName The name of the input.
   * @param {Boolean} allowIds Whether to allow IDs in the input.
   * @return {String} The generated GraphQL input model.
   */
  generateEmptyInputModel(inputName, allowIds) {
    const idField = allowIds ? 'id: ID' : '_: String';
    return `
      input ${inputName} {
        _: String
      }

      input edit${inputName} {
        ${idField}
      }
    `;
  },

  /**
   * Generates a populated input model with enabled attributes.
   * @param {Object} model The Strapi model object.
   * @param {String} inputName The name of the input.
   * @param {String} globalId The global ID of the model.
   * @param {Boolean} allowIds Whether to allow IDs in the input.
   * @return {String} The generated GraphQL input model.
   */
  generatePopulatedInputModel(model, inputName, globalId, allowIds) {
    const createAttributes = this.mapEnabledAttributes(model, 'query');
    const updateAttributes = this.mapEnabledAttributes(model, 'mutation', 'update');

    return `
      input ${inputName} {
        ${createAttributes.join('\n')}
      }

      input edit${inputName} {
        ${allowIds ? 'id: ID' : ''}
        ${updateAttributes.join('\n')}
      }
    `;
  },

  /**
   * Maps enabled attributes to their GraphQL type definitions.
   * @param {Object} model The Strapi model object.
   * @param {String} rootType The root type ('query' or 'mutation').
   * @param {String} action The action ('update' or undefined).
   * @return {Array} An array of attribute type strings.
   */
  mapEnabledAttributes(model, rootType, action) {
    return Object.keys(model.attributes)
      .filter(attributeName => isTypeAttributeEnabled(model, attributeName))
      .map(attributeName => {
        return `${attributeName}: ${this.convertType({
          attribute: model.attributes[attributeName],
          modelName: model.globalId,
          attributeName,
          rootType,
          action,
        })}`;
      });
  },

  /**
   * Generates the GraphQL input payload arguments for a mutation.
   * @param {Object} options Configuration options.
   * @param {Object} options.model The Strapi model object.
   * @param {String} options.name The name of the model.
   * @param {String} options.mutationName The name of the mutation.
   * @param {String} options.action The action ('create', 'update', 'delete').
   * @return {String} The generated GraphQL input payload arguments.
   */
  generateInputPayloadArguments({ model, name, mutationName, action }) {
    const singularName = toSingular(name);
    const inputName = toInputName(name);

    switch (action) {
      case 'create':
        return this.generateCreatePayload(mutationName, inputName, model.globalId);
      case 'update':
        return this.generateUpdatePayload(mutationName, inputName, model.globalId, model.kind);
      case 'delete':
        return this.generateDeletePayload(mutationName, inputName, model.globalId, model.kind);
      default:
        return '';
    }
  },

  /**
   * Generates the GraphQL schema for a create mutation.
   * @param {String} mutationName The name of the mutation.
   * @param {String} inputName The name of the input.
   * @param {String} globalId The global ID of the model.
   * @return {String} The generated GraphQL schema.
   */
  generateCreatePayload(mutationName, inputName, globalId) {
    return `
      input ${mutationName}Input { data: ${inputName} }
      type ${mutationName}Payload { ${toSingular(mutationName)}: ${globalId} }
    `;
  },

  /**
   * Generates the GraphQL schema for an update mutation.
   * @param {String} mutationName The name of the mutation.
   * @param {String} inputName The name of the input.
   * @param {String} globalId The global ID of the model.
   * @param {String} kind The kind of the model ('singleType' or 'collectionType').
   * @return {String} The generated GraphQL schema.
   */
  generateUpdatePayload(mutationName, inputName, globalId, kind) {
    if (kind === 'singleType') {
      return `
      input ${mutationName}Input  { data: edit${inputName} }
      type ${mutationName}Payload { ${toSingular(mutationName)}: ${globalId} }
    `;
    }

    return `
      input ${mutationName}Input  { where: InputID, data: edit${inputName} }
      type ${mutationName}Payload { ${toSingular(mutationName)}: ${globalId} }
    `;
  },

  /**
   * Generates the GraphQL schema for a delete mutation.
   * @param {String} mutationName The name of the mutation.
   * @param {String} inputName The name of the input.
   * @param {String} globalId The global ID of the model.
   * @param {String} kind The kind of the model ('singleType' or 'collectionType').
   * @return {String} The generated GraphQL schema.
   */
  generateDeletePayload(mutationName, inputName, globalId, kind) {
    if (kind === 'singleType') {
      return `
      type ${mutationName}Payload { ${toSingular(mutationName)}: ${globalId} }
    `;
    }

    return `
      input ${mutationName}Input  { where: InputID }
      type ${mutationName}Payload { ${toSingular(mutationName)}: ${globalId} }
    `;
  },
};