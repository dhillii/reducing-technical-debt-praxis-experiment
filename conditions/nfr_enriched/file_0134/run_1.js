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

// Scalar type mapping for Strapi to GraphQL conversion
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
 * Determine if a required scalar type should have non-null modifier
 */
const shouldAddNonNullModifier = (attribute, rootType, action) => {
  if (!attribute.required) {
    return false;
  }
  if (rootType === 'mutation' && action === 'update' && attribute.default === undefined) {
    return true;
  }
  return rootType !== 'mutation';
};

/**
 * Convert scalar attribute to GraphQL type
 */
const convertScalarType = function(attribute) {
  let type = SCALAR_TYPE_MAP[attribute.type] || 'String';

  if (attribute.type === 'enumeration') {
    type = this.convertEnumType(attribute, attribute.modelName, attribute.attributeName);
  }

  if (shouldAddNonNullModifier(attribute, attribute.rootType, attribute.action)) {
    type += '!';
  }

  return type;
};

/**
 * Convert component attribute to GraphQL type
 */
const convertComponentType = function(attribute) {
  const { required, repeatable, component } = attribute;
  const globalId = strapi.components[component].globalId;
  const { rootType, action } = attribute;

  let typeName = globalId;

  if (rootType === 'mutation') {
    const singularName = _.upperFirst(toSingular(globalId));
    typeName = action === 'update'
      ? `edit${singularName}Input`
      : `${singularName}Input${required ? '!' : ''}`;
  }

  if (repeatable === true) {
    return `[${typeName}]`;
  }

  return typeName;
};

/**
 * Convert dynamiczone attribute to GraphQL type
 */
const convertDynamicZoneType = function(attribute) {
  const { required, modelName, attributeName, rootType } = attribute;
  const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
  let typeName = unionName;

  if (rootType === 'mutation') {
    typeName = `${unionName}Input!`;
  }

  return `[${typeName}]${required ? '!' : ''}`;
};

/**
 * Convert association attribute to GraphQL type
 */
const convertAssociationType = function(attribute) {
  const { model, collection, plugin, rootType } = attribute;
  const ref = model || collection;

  if (!ref || ref === '*') {
    if (rootType === 'mutation') {
      return model ? 'ID' : '[ID]';
    }
    return model ? 'Morph' : '[Morph]';
  }

  const globalId = strapi.db.getModel(ref, plugin).globalId;
  const isPlural = !_.isEmpty(collection);

  if (isPlural) {
    return rootType === 'mutation' ? '[ID]' : `[${globalId}]`;
  }

  return rootType === 'mutation' ? 'ID' : globalId;
};

/**
 * Extract enabled attributes from model
 */
const getEnabledAttributes = (model) => {
  return Object.keys(model.attributes).filter(attr => isTypeAttributeEnabled(model, attr));
};

/**
 * Check if model has any enabled attributes
 */
const hasEnabledAttributes = (model) => {
  return getEnabledAttributes(model).length > 0;
};

/**
 * Generate input field for attribute
 */
const generateInputField = function(attributeName, attribute, globalId, action) {
  const typeStr = this.convertType({
    attribute,
    modelName: globalId,
    attributeName,
    rootType: 'mutation',
    action,
  });
  return `${attributeName}: ${typeStr}`;
};

/**
 * Generate create/update input fields
 */
const generateInputFields = function(model, action) {
  const globalId = model.globalId;
  const enabledAttrs = getEnabledAttributes(model);

  return enabledAttrs
    .map(attributeName => this.generateInputField(attributeName, model.attributes[attributeName], globalId, action))
    .join('\n');
};

/**
 * Generate input type definition for empty model
 */
const generateEmptyModelInput = (inputName, allowIds) => {
  return `
    input ${inputName} {
      _: String
    }

    input edit${inputName} {
      ${allowIds ? 'id: ID' : '_: String'}
    }
  `;
};

/**
 * Generate input type definition for model with attributes
 */
const generateModelInputWithAttributes = function(model, inputName, allowIds) {
  const globalId = model.globalId;
  const createFields = generateInputFields.call(this, model, undefined);
  const updateFields = generateInputFields.call(this, model, 'update');

  return `
    input ${inputName} {
      ${createFields}
    }

    input edit${inputName} {
      ${allowIds ? 'id: ID' : ''}
      ${updateFields}
    }
  `;
};

/**
 * Generate payload for create mutation
 */
const generateCreatePayload = (mutationName, singularName, globalId) => {
  return `
    input ${mutationName}Input { data: ${singularName} }
    type ${mutationName}Payload { ${_.camelCase(singularName)}: ${globalId} }
  `;
};

/**
 * Generate payload for update mutation
 */
const generateUpdatePayload = (mutationName, singularName, globalId, isSingleType) => {
  const whereClause = isSingleType ? '' : 'where: InputID, ';
  return `
    input ${mutationName}Input { ${whereClause}data: edit${singularName} }
    type ${mutationName}Payload { ${_.camelCase(singularName)}: ${globalId} }
  `;
};

/**
 * Generate payload for delete mutation
 */
const generateDeletePayload = (mutationName, singularName, globalId, isSingleType) => {
  const inputDef = isSingleType ? '' : `input ${mutationName}Input { where: InputID }\n`;
  return `
    ${inputDef}
    type ${mutationName}Payload { ${_.camelCase(singularName)}: ${globalId} }
  `;
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
    const enrichedAttribute = {
      ...attribute,
      modelName,
      attributeName,
      rootType,
      action,
    };

    if (isScalarAttribute(attribute)) {
      return convertScalarType.call(this, enrichedAttribute);
    }

    if (attribute.type === 'component') {
      return convertComponentType.call(this, enrichedAttribute);
    }

    if (attribute.type === 'dynamiczone') {
      return convertDynamicZoneType.call(this, enrichedAttribute);
    }

    return convertAssociationType.call(this, enrichedAttribute);
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
    const inputName = `${_.upperFirst(toSingular(name))}Input`;

    if (!hasEnabledAttributes(model)) {
      return generateEmptyModelInput(inputName, allowIds);
    }

    return generateModelInputWithAttributes.call(this, model, inputName, allowIds);
  },

  generateInputPayloadArguments({ model, name, mutationName, action }) {
    const singularName = toInputName(name);
    const isSingleType = model.kind === 'singleType';

    switch (action) {
      case 'create':
        return generateCreatePayload(mutationName, singularName, model.globalId);
      case 'update':
        return generateUpdatePayload(mutationName, singularName, model.globalId, isSingleType);
      case 'delete':
        return generateDeletePayload(mutationName, singularName, model.globalId, isSingleType);
      default:
        return '';
    }
  },

  // Helper method for internal use
  generateInputField,
};