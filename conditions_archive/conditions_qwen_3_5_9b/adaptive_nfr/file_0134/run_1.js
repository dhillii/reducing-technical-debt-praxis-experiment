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
    let graphqlType = SCALAR_TYPE_MAP[type];

    if (required && SCALAR_TYPE_REQUIRED_CONDITION(rootType, action, attribute)) {
      graphqlType += '!';
    }

    return graphqlType;
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
    const upperFirstSingular = _.upperFirst(singularName);

    let typeName = required === true ? `${globalId}` : globalId;

    if (rootType === 'mutation') {
      typeName = action === 'update'
        ? `edit${upperFirstSingular}Input`
        : `${upperFirstSingular}Input${required ? '!' : ''}`;
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

    let typeName = rootType === 'mutation' ? `${unionName}Input!` : unionName;

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
    const isPlural = !_.isEmpty(collection);

    if (isPlural) {
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
    const isMorph = attribute.model || attribute.collection;

    if (rootType === 'mutation') {
      return isMorph ? 'ID' : '[ID]';
    }

    return isMorph ? 'Morph' : '[Morph]';
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
   * Generate input model for a Strapi model.
   * @param {Object} model The Strapi model.
   * @param {String} name The model name.
   * @param {Object} options Options for input generation.
   * @param {Boolean} options.allowIds Whether to allow IDs.
   * @return String
   */
  generateInputModel(model, name, { allowIds = false } = {}) {
    const globalId = model.globalId;
    const inputName = `${_.upperFirst(toSingular(name))}Input`;
    const hasAllAttributesDisabled = Object.keys(model.attributes).every(attr => !isTypeAttributeEnabled(model, attr));

    if (_.isEmpty(model.attributes) || hasAllAttributesDisabled) {
      return this.generateEmptyInputModel(inputName, allowIds);
    }

    return this.generateFullInputModel(model, globalId, inputName, allowIds);
  },

  /**
   * Generate empty input model when no attributes are enabled.
   * @param {String} inputName The input name.
   * @param {Boolean} allowIds Whether to allow IDs.
   * @return String
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
   * Generate full input model with all enabled attributes.
   * @param {Object} model The Strapi model.
   * @param {String} globalId The model global ID.
   * @param {String} inputName The input name.
   * @param {Boolean} allowIds Whether to allow IDs.
   * @return String
   */
  generateFullInputModel(model, globalId, inputName, allowIds) {
    const attributes = Object.keys(model.attributes)
      .filter(attributeName => isTypeAttributeEnabled(model, attributeName));

    const createFields = attributes.map(attributeName => {
      return `${attributeName}: ${this.convertType({
        attribute: model.attributes[attributeName],
        modelName: globalId,
        attributeName,
        rootType: 'mutation',
      })}`;
    });

    const updateFields = attributes.map(attributeName => {
      return `${attributeName}: ${this.convertType({
        attribute: model.attributes[attributeName],
        modelName: globalId,
        attributeName,
        rootType: 'mutation',
        action: 'update',
      })}`;
    });

    return `
      input ${inputName} {
        ${createFields.join('\n')}
      }

      input edit${inputName} {
        ${allowIds ? 'id: ID' : ''}
        ${updateFields.join('\n')}
      }
    `;
  },

  /**
   * Generate input payload arguments for mutations.
   * @param {Object} options Options for payload generation.
   * @param {Object} options.model The Strapi model.
   * @param {String} options.name The model name.
   * @param {String} options.mutationName The mutation name.
   * @param {String} options.action The mutation action.
   * @return String
   */
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