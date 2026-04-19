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
   * @param {Object} params
   * @param {Object} params.attribute Information about the attribute.
   * @param {String} params.modelName Name of the model which owns the attribute.
   * @param {String} params.attributeName Name of the attribute.
   * @param {String} params.rootType 'query' or 'mutation'.
   * @param {String} params.action Action name (e.g., 'update').
   * @return {String} GraphQL type string.
   */
  convertType({
    attribute = {},
    modelName = '',
    attributeName = '',
    rootType = 'query',
    action = '',
  }) {
    if (isScalarAttribute(attribute)) {
      return this._convertScalarType(attribute, rootType);
    }

    if (attribute.type === 'component') {
      return this._convertComponentType(attribute, rootType, action);
    }

    if (attribute.type === 'dynamiczone') {
      return this._convertDynamicZoneType(attribute, modelName, attributeName, rootType);
    }

    return this._convertAssociationType(attribute, rootType);
  },

  /**
   * Convert scalar attribute to GraphQL type.
   * @private
   */
  _convertScalarType(attribute, rootType) {
    let type = 'String';

    switch (attribute.type) {
      case 'boolean':
        type = 'Boolean';
        break;
      case 'integer':
        type = 'Int';
        break;
      case 'biginteger':
        type = 'Long';
        break;
      case 'float':
      case 'decimal':
        type = 'Float';
        break;
      case 'json':
        type = 'JSON';
        break;
      case 'date':
        type = 'Date';
        break;
      case 'time':
        type = 'Time';
        break;
      case 'datetime':
      case 'timestamp':
        type = 'DateTime';
        break;
      case 'enumeration':
        type = this.convertEnumType(attribute, attribute.modelName, attribute.attributeName);
        break;
    }

    if (attribute.required) {
      if (rootType !== 'mutation' || (action !== 'update' && attribute.default === undefined)) {
        type += '!';
      }
    }

    return type;
  },

  /**
   * Convert component attribute to GraphQL type.
   * @private
   */
  _convertComponentType(attribute, rootType, action) {
    const { required, repeatable, component } = attribute;
    const globalId = strapi.components[component].globalId;
    let typeName = required ? `${globalId}` : globalId;

    if (rootType === 'mutation') {
      const singular = _.upperFirst(toSingular(globalId));
      typeName =
        action === 'update'
          ? `edit${singular}Input`
          : `${singular}Input${required ? '!' : ''}`;
    }

    return repeatable ? `[${typeName}]` : typeName;
  },

  /**
   * Convert dynamiczone attribute to GraphQL type.
   * @private
   */
  _convertDynamicZoneType(attribute, modelName, attributeName, rootType) {
    const { required } = attribute;
    const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
    const typeName = rootType === 'mutation' ? `${unionName}Input!` : unionName;
    return `[${typeName}]${required ? '!' : ''}`;
  },

  /**
   * Convert association attribute to GraphQL type.
   * @private
   */
  _convertAssociationType(attribute, rootType) {
    const ref = attribute.model || attribute.collection;

    if (ref && ref !== '*') {
      const globalId = strapi.db.getModel(ref, attribute.plugin).globalId;
      const plural = !_.isEmpty(attribute.collection);

      if (plural) {
        return rootType === 'mutation' ? '[ID]' : `[${globalId}]`;
      }

      return rootType === 'mutation' ? 'ID' : globalId;
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
   * @return {String} Enum name.
   */
  convertEnumType(definition, model, field) {
    return definition.enumName
      ? definition.enumName
      : `ENUM_${model.toUpperCase()}_${field.toUpperCase()}`;
  },

  /**
   * Add custom scalar type such as JSON.
   * @return {Object} Scalars mapping.
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
   * @return {Object} Union definition and resolvers.
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
   * Generate input type for a model.
   * @param {Object} model Strapi model definition.
   * @param {String} name Name of the model.
   * @param {Object} options Options object.
   * @param {Boolean} options.allowIds Whether to allow IDs in input.
   * @return {String} GraphQL input type definitions.
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

  /**
   * Generate input payload arguments for mutations.
   * @param {Object} params Parameters object.
   * @param {Object} params.model Strapi model definition.
   * @param {String} params.name Name of the model.
   * @param {String} params.mutationName Name of the mutation.
   * @param {String} params.action Action type ('create', 'update', 'delete').
   * @return {String} GraphQL type definitions.
   */
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