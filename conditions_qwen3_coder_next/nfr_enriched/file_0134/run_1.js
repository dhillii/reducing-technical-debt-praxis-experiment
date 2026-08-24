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
 * @param {Object} attribute - Attribute definition object
 * @returns {String} GraphQL scalar type
 */
const getScalarType = (attribute) => {
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
    default:
      return 'String';
  }
};

/**
 * Determine type modifiers for scalar attributes based on requirements and mutation context.
 * @param {Object} attribute - Attribute definition object
 * @param {String} rootType - 'query' or 'mutation'
 * @param {String} action - mutation action ('create', 'update', etc.)
 * @param {String} baseType - GraphQL base type (e.g., 'String', 'Int')
 * @returns {String} Type with mandatory modifiers
 */
const applyScalarModifiers = (attribute, rootType, action, baseType) => {
  if (!attribute.required) return baseType;

  const shouldAppendExclamation =
    rootType !== 'mutation' ||
    (action !== 'update' && attribute.default === undefined);

  return shouldAppendExclamation ? `${baseType}!` : baseType;
};

/**
 * Retrieve component type name for mutation/input generation.
 * @param {Object} attribute - Component attribute definition
 * @param {String} rootType - 'query' or 'mutation'
 * @param {String} action - mutation action
 * @param {String} globalId - Component global ID
 * @returns {String} Component type name
 */
const getComponentTypeName = (attribute, rootType, action, globalId) => {
  const { required, repeatable, component } = attribute;
  const singularName = _.upperFirst(toSingular(globalId));

  if (rootType === 'mutation') {
    return action === 'update'
      ? `edit${singularName}Input`
      : `${singularName}Input${required ? '!' : ''}`;
  }

  return required ? globalId : globalId;
};

/**
 * Determine whether a field requires plates (array brackets).
 * @param {Object} attribute - Attribute definition
 * @param {String} rootType - 'query' or 'mutation'
 * @returns {Boolean}
 */
const needsPlates = (attribute, rootType) => {
  if (attribute.type === 'component') {
    return attribute.repeatable === true;
  }
  if (attribute.type === 'dynamiczone') {
    return true;
  }
  if (attribute.collection) {
    if (rootType === 'mutation') return false;
    return true;
  }
  return false;
};

/**
 * Build the GraphQL type string with collection/singular selection and optional plates.
 * @param {String} globalId - Model's global ID
 * @param {String} rootType - 'query' or 'mutation'
 * @param {String} baseType - 'ID', 'Morph', or model name
 * @returns {String} Full GraphQL type string
 */
const buildCollectionOrSingularType = (globalId, rootType, baseType) => {
  if (needsPlates({ collection: true }, rootType)) {
    return `[${globalId}]`;
  }
  return rootType === 'mutation' ? 'ID' : globalId;
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
      const baseType = getScalarType(attribute);
      let type;
      if (baseType === 'String' && attribute.type === 'enumeration') {
        type = this.convertEnumType(attribute, modelName, attributeName);
      } else {
        type = baseType;
      }
      return applyScalarModifiers(attribute, rootType, action, type);
    }

    if (attribute.type === 'component') {
      const { component } = attribute;
      const componentGlobalId = strapi.components[component].globalId;
      const typeName = getComponentTypeName(attribute, rootType, action, componentGlobalId);

      return attribute.repeatable === true ? `[${typeName}]` : typeName;
    }

    if (attribute.type === 'dynamiczone') {
      const { required } = attribute;
      const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;

      return `[${rootType === 'mutation' ? `${unionName}Input!` : unionName}]${required ? '!' : ''}`;
    }

    const ref = attribute.model || attribute.collection;

    if (ref && ref !== '*') {
      const model = strapi.db.getModel(ref, attribute.plugin);
      const globalId = model.globalId;
      const isCollection = !_.isEmpty(attribute.collection);

      if (isCollection) {
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

    const buildFields = (action) =>
      Object.keys(model.attributes)
        .filter(attributeName => isTypeAttributeEnabled(model, attributeName))
        .map(attributeName => {
          return `${attributeName}: ${this.convertType({
            attribute: model.attributes[attributeName],
            modelName: globalId,
            attributeName,
            rootType: 'mutation',
            action,
          })}`;
        })
        .join('\n');

    const baseFields = buildFields();
    const editFields = buildFields('update');

    return `
      input ${inputName} {
        ${baseFields}
      }

      input edit${inputName} {
        ${allowIds ? 'id: ID' : ''}
        ${editFields}
      }
    `;
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