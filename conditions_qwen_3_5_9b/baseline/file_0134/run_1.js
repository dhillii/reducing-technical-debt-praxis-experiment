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
    const { type, required, default: defaultValue } = attribute;

    if (isScalarAttribute({ type })) {
      return this._convertScalarType({ type, required, defaultValue, rootType });
    }

    if (type === 'component') {
      return this._convertComponentType({ attribute, rootType, action });
    }

    if (type === 'dynamiczone') {
      return this._convertDynamicZoneType({ attribute, rootType });
    }

    const ref = attribute.model || attribute.collection;

    if (ref && ref !== '*') {
      return this._convertAssociationType({ ref, rootType, attribute });
    }

    if (rootType === 'mutation') {
      return attribute.model ? 'ID' : '[ID]';
    }

    return attribute.model ? 'Morph' : '[Morph]';
  },

  _convertScalarType({ type, required, defaultValue, rootType }) {
    let graphqlType = 'String';

    switch (type) {
      case 'boolean':
        graphqlType = 'Boolean';
        break;
      case 'integer':
        graphqlType = 'Int';
        break;
      case 'biginteger':
        graphqlType = 'Long';
        break;
      case 'float':
      case 'decimal':
        graphqlType = 'Float';
        break;
      case 'json':
        graphqlType = 'JSON';
        break;
      case 'date':
        graphqlType = 'Date';
        break;
      case 'time':
        graphqlType = 'Time';
        break;
      case 'datetime':
      case 'timestamp':
        graphqlType = 'DateTime';
        break;
      case 'enumeration':
        graphqlType = this.convertEnumType(attribute, modelName, attributeName);
        break;
    }

    if (required) {
      if (rootType !== 'mutation' || (action !== 'update' && defaultValue === undefined)) {
        graphqlType += '!';
      }
    }

    return graphqlType;
  },

  _convertComponentType({ attribute, rootType, action }) {
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
  },

  _convertDynamicZoneType({ attribute, rootType }) {
    const { required } = attribute;
    const unionName = `${attribute.modelName}${_.upperFirst(_.camelCase(attribute.attributeName))}DynamicZone`;
    let typeName = unionName;

    if (rootType === 'mutation') {
      typeName = `${unionName}Input!`;
    }

    return `[${typeName}]${required ? '!' : ''}`;
  },

  _convertAssociationType({ ref, rootType, attribute }) {
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

    const enabledAttributes = Object.keys(model.attributes).filter(attributeName => isTypeAttributeEnabled(model, attributeName));

    const createInput = `
      input ${inputName} {
        ${enabledAttributes.map(attributeName => {
          return `${attributeName}: ${this.convertType({
            attribute: model.attributes[attributeName],
            modelName: globalId,
            attributeName,
            rootType: 'mutation',
          })}`;
        }).join('\n')}
      }
    `;

    const updateInput = `
      input edit${inputName} {
        ${allowIds ? 'id: ID' : ''}
        ${enabledAttributes.map(attributeName => {
          return `${attributeName}: ${this.convertType({
            attribute: model.attributes[attributeName],
            modelName: globalId,
            attributeName,
            rootType: 'mutation',
            action: 'update',
          })}`;
        }).join('\n')}
      }
    `;

    return `${createInput}\n\n${updateInput}`;
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