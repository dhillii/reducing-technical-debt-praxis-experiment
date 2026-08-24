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
 * Get GraphQL scalar type for a given Strapi type
 * @param {Object} attribute
 * @param {String} attribute.type Strapi attribute type
 * @return {String} GraphQL scalar type
 */
function getScalarType({ type }) {
  switch (type) {
    case 'boolean': return 'Boolean';
    case 'integer': return 'Int';
    case 'biginteger': return 'Long';
    case 'float': case 'decimal': return 'Float';
    case 'json': return 'JSON';
    case 'date': return 'Date';
    case 'time': return 'Time';
    case 'datetime': case 'timestamp': return 'DateTime';
    default: return 'String';
  }
}

/**
 * Determine whether required field should be non-null in GraphQL schema
 * @param {Object} params
 * @param {Boolean} params.required
 * @param {String} params.rootType
 * @param {String} params.action
 * @param {Any} params.defaultValue
 * @return {Boolean}
 */
function shouldBeNonNullable({ required, rootType, action, defaultValue }) {
  return required &&
    (rootType !== 'mutation' || (action !== 'update' && defaultValue === undefined));
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
    if (!isScalarAttribute(attribute)) {
      return this.convertNonScalarType({ attribute, modelName, attributeName, rootType, action });
    }

    const scalarType = getScalarType(attribute);

    if (shouldBeNonNullable({
      required: attribute.required,
      rootType,
      action,
      defaultValue: attribute.default,
    })) {
      return `${scalarType}!`;
    }

    return scalarType;
  },

  /**
   * Handle conversion of non-scalar types (component, dynamiczone, relation)
   */
  convertNonScalarType({ attribute, modelName, attributeName, rootType, action }) {
    if (attribute.type === 'component') {
      return this.convertComponentType({ attribute, rootType, action, modelName });
    }

    if (attribute.type === 'dynamiczone') {
      return this.convertDynamicZoneType({ attribute, modelName, rootType, action });
    }

    return this.convertRelationType({ attribute, rootType, action });
  },

  /**
   * Convert component attribute to GraphQL type
   */
  convertComponentType({ attribute, rootType, action, modelName }) {
    const { required, repeatable, component } = attribute;
    const globalId = strapi.components[component].globalId;

    let typeName = required === true ? globalId : globalId;

    if (rootType === 'mutation') {
      typeName = action === 'update'
        ? `edit${_.upperFirst(toSingular(globalId))}Input`
        : `${_.upperFirst(toSingular(globalId))}Input${required ? '!' : ''}`;
    }

    const wrapper = repeatable === true ? '[' : '';
    const suffix = repeatable === true ? ']' : '';

    return `${wrapper}${typeName}${suffix}`;
  },

  /**
   * Convert dynamiczone attribute to GraphQL type
   */
  convertDynamicZoneType({ attribute, modelName, attributeName, rootType }) {
    const { required } = attribute;
    const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;

    let typeName = unionName;

    if (rootType === 'mutation') {
      typeName = `${unionName}Input!`;
    }

    const wrapper = `[${typeName}]`;

    return required ? `${wrapper}!` : wrapper;
  },

  /**
   * Convert relation attribute to GraphQL type
   */
  convertRelationType({ attribute, rootType, action }) {
    const ref = attribute.model || attribute.collection;

    if (!ref || ref === '*') {
      return rootType === 'mutation' ? (attribute.model ? 'ID' : '[ID]') : (attribute.model ? 'Morph' : '[Morph]');
    }

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

    const fields = this.buildInputFields(model, globalId, 'mutation', false, allowIds);
    const updateFields = this.buildInputFields(model, globalId, 'mutation', true, allowIds);

    return `
      input ${inputName} {
        ${fields}
      }

      input edit${inputName} {
        ${allowIds ? 'id: ID' : ''}
        ${updateFields}
      }
    `;
  },

  /**
   * Generate input fields for mutation schemas
   * @param {Object} model - Model definition
   * @param {String} globalId - Model global ID
   * @param {String} rootType - Root operation type
   * @param {Boolean} isUpdate - Whether this is an update input
   * @param {Boolean} allowIds - Whether ID field is allowed
   * @return {String} indented field definitions
   */
  buildInputFields(model, globalId, rootType, isUpdate, allowIds) {
    return Object.keys(model.attributes)
      .filter(attributeName => isTypeAttributeEnabled(model, attributeName))
      .map(attributeName => {
        const type = this.convertType({
          attribute: model.attributes[attributeName],
          modelName: globalId,
          attributeName,
          rootType,
          action: isUpdate ? 'update' : '',
        });

        return `${attributeName}: ${type}`;
      })
      .join('\n        ');
  },

  generateInputPayloadArguments({ model, name, mutationName, action }) {
    const singularName = toSingular(name);
    const inputName = toInputName(name);

    const { kind } = model;

    switch (action) {
      case 'create': {
        return `
          input ${mutationName}Input { data: ${inputName} }
          type ${mutationName}Payload { ${singularName}: ${model.globalId} }
        `;
      }
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
      case 'delete': {
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
      default:
        // Nothing
    }
  },
};