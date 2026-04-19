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

const SCALAR_TYPE_REQUIRED_CONDITION = (rootType, action, attribute) =>
  rootType !== 'mutation' || (action !== 'update' && attribute.default === undefined);

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
    const { type } = attribute;

    if (isScalarAttribute(attribute)) {
      return this.convertScalarType(attribute, rootType, action);
    }

    if (type === 'component') {
      return this.convertComponentType(attribute, rootType, action);
    }

    if (type === 'dynamiczone') {
      return this.convertDynamicZoneType(attribute, rootType);
    }

    if (attribute.model || attribute.collection) {
      return this.convertAssociationType(attribute, rootType, action);
    }

    return this.convertMorphType(attribute, rootType);
  },

  /**
   * Convert scalar attribute to GraphQL type.
   * @param {Object} attribute Information about the attribute.
   * @param {String} rootType GraphQL root type.
   * @param {String} action GraphQL action.
   * @return String
   */
  convertScalarType(attribute, rootType, action) {
    const { type, required, default: defaultValue } = attribute;
    const baseType = SCALAR_TYPE_MAP[type];

    if (!baseType) {
      return 'String';
    }

    if (required && SCALAR_TYPE_REQUIRED_CONDITION(rootType, action, attribute)) {
      return `${baseType}!`;
    }

    return baseType;
  },

  /**
   * Convert component attribute to GraphQL type.
   * @param {Object} attribute Information about the attribute.
   * @param {String} rootType GraphQL root type.
   * @param {String} action GraphQL action.
   * @return String
   */
  convertComponentType(attribute, rootType, action) {
    const { required, repeatable, component } = attribute;
    const globalId = strapi.components[component].globalId;
    const singularName = toSingular(globalId);

    let typeName = required === true ? `${globalId}` : globalId;

    if (rootType === 'mutation') {
      typeName = action === 'update'
        ? `edit${_.upperFirst(singularName)}Input`
        : `${_.upperFirst(singularName)}Input${required ? '!' : ''}`;
    }

    if (repeatable === true) {
      return `[${typeName}]`;
    }

    return typeName;
  },

  /**
   * Convert dynamiczone attribute to GraphQL type.
   * @param {Object} attribute Information about the attribute.
   * @param {String} rootType GraphQL root type.
   * @return String
   */
  convertDynamicZoneType(attribute, rootType) {
    const { required } = attribute;
    const modelName = strapi.models[attribute.model].globalId;
    const unionName = `${modelName}${_.upperFirst(_.camelCase(attribute.attributeName))}DynamicZone`;

    let typeName = unionName;

    if (rootType === 'mutation') {
      typeName = `${unionName}Input!`;
    }

    return `[${typeName}]${required ? '!' : ''}`;
  },

  /**
   * Convert association attribute to GraphQL type.
   * @param {Object} attribute Information about the attribute.
   * @param {String} rootType GraphQL root type.
   * @param {String} action GraphQL action.
   * @return String
   */
  convertAssociationType(attribute, rootType, action) {
    const { model, collection } = attribute;
    const ref = model || collection;

    if (!ref || ref === '*') {
      return this.convertMorphType(attribute, rootType);
    }

    const globalId = strapi.db.getModel(ref, attribute.plugin).globalId;
    const plural = !_.isEmpty(collection);

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
   * Convert morph attribute to GraphQL type.
   * @param {Object} attribute Information about the attribute.
   * @param {String} rootType GraphQL root type.
   * @return String
   */
  convertMorphType(attribute, rootType) {
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

    const generateInputAttributes = (rootType, action) =>
      Object.keys(model.attributes)
        .filter(attributeName => isTypeAttributeEnabled(model, attributeName))
        .map(attributeName => {
          return `${attributeName}: ${this.convertType({
            attribute: model.attributes[attributeName],
            modelName: globalId,
            attributeName,
            rootType,
            action,
          })}`;
        })
        .join('\n');

    const inputs = `
      input ${inputName} {

        ${generateInputAttributes('mutation', '')}
      }

      input edit${inputName} {
        ${allowIds ? 'id: ID' : ''}
        ${generateInputAttributes('mutation', 'update')}
      }
    `;

    return inputs;
  },

  generateInputPayloadArguments({ model, name, mutationName, action }) {
    const singularName = toSingular(name);
    const inputName = toInputName(name);

    const { kind } = model;

    if (action === 'create') {
      return `
        input ${mutationName}Input { data: ${inputName} }
        type ${mutationName}Payload { ${singularName}: ${model.globalId} }
      `;
    }

    if (action === 'update') {
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
    }

    if (action === 'delete') {
      if (kind === 'singleType') {
        return `
        type ${mutationName}Payload { ${singularName}: ${model.globalId} }
      `;
      }

      return `
        input ${mutationName}Input  { where: InputID }
        type ${mutationName}Payload { ${singularName}: ${model.globalId} }
      `;
    }

    return '';
  },
};