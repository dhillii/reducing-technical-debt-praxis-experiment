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
  if (rootType !== 'mutation') {
    return true;
  }
  return action !== 'update' && attribute.default === undefined;
};

/**
 * Convert scalar attribute to GraphQL type
 */
const convertScalarType = function(attribute) {
  let type = SCALAR_TYPE_MAP[attribute.type] || 'String';

  if (attribute.type === 'enumeration') {
    type = this.convertEnumType(attribute, '', '');
  }

  return type;
};

/**
 * Convert component attribute to GraphQL type
 */
const convertComponentType = (attribute, rootType, action) => {
  const { required, repeatable, component } = attribute;
  const globalId = strapi.components[component].globalId;

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
 * Convert association/relation attribute to GraphQL type
 */
const convertAssociationType = (attribute, rootType) => {
  const ref = attribute.model || attribute.collection;

  if (!ref || ref === '*') {
    if (rootType === 'mutation') {
      return attribute.model ? 'ID' : '[ID]';
    }
    return attribute.model ? 'Morph' : '[Morph]';
  }

  const globalId = strapi.db.getModel(ref, attribute.plugin).globalId;
  const isPlural = !_.isEmpty(attribute.collection);

  if (isPlural) {
    return rootType === 'mutation' ? '[ID]' : `[${globalId}]`;
  }

  return rootType === 'mutation' ? 'ID' : globalId;
};

/**
 * Build input field definition for a single attribute
 */
const buildInputField = function(attributeName, attribute, globalId, action) {
  const type = this.convertType({
    attribute,
    modelName: globalId,
    attributeName,
    rootType: 'mutation',
    action,
  });
  return `${attributeName}: ${type}`;
};

/**
 * Generate input fields for model attributes
 */
const generateInputFields = function(model, action) {
  return Object.keys(model.attributes)
    .filter(attributeName => isTypeAttributeEnabled(model, attributeName))
    .map(attributeName => buildInputField.call(this, attributeName, model.attributes[attributeName], model.globalId, action))
    .join('\n');
};

/**
 * Generate empty input model with placeholder
 */
const generateEmptyInputModel = (inputName, allowIds) => {
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
 * Generate full input model with attributes
 */
const generateFullInputModel = function(model, inputName, allowIds) {
  const createFields = generateInputFields.call(this, model);
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
const generateCreatePayload = (mutationName, singularName, globalId, inputName) => {
  return `
    input ${mutationName}Input { data: ${inputName} }
    type ${mutationName}Payload { ${singularName}: ${globalId} }
  `;
};

/**
 * Generate payload for update mutation
 */
const generateUpdatePayload = (mutationName, singularName, globalId, inputName, kind) => {
  const whereClause = kind === 'singleType' ? '' : 'where: InputID, ';
  return `
    input ${mutationName}Input { ${whereClause}data: edit${inputName} }
    type ${mutationName}Payload { ${singularName}: ${globalId} }
  `;
};

/**
 * Generate payload for delete mutation
 */
const generateDeletePayload = (mutationName, singularName, globalId, kind) => {
  const inputDef = kind === 'singleType'
    ? ''
    : `input ${mutationName}Input { where: InputID }`;
  return `
    ${inputDef}
    type ${mutationName}Payload { ${singularName}: ${globalId} }
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
    if (isScalarAttribute(attribute)) {
      let type = convertScalarType.call(this, attribute);

      if (shouldAddNonNullModifier(attribute, rootType, action)) {
        type += '!';
      }

      return type;
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
    const inputName = `${_.upperFirst(toSingular(name))}Input`;
    const hasAllAttributesDisabled = Object.keys(model.attributes).every(attr => !isTypeAttributeEnabled(model, attr));

    if (_.isEmpty(model.attributes) || hasAllAttributesDisabled) {
      return generateEmptyInputModel(inputName, allowIds);
    }

    return generateFullInputModel.call(this, model, inputName, allowIds);
  },

  generateInputPayloadArguments({ model, name, mutationName, action }) {
    const singularName = toSingular(name);
    const inputName = toInputName(name);
    const { kind, globalId } = model;

    switch (action) {
      case 'create':
        return generateCreatePayload(mutationName, singularName, globalId, inputName);
      case 'update':
        return generateUpdatePayload(mutationName, singularName, globalId, inputName, kind);
      case 'delete':
        return generateDeletePayload(mutationName, singularName, globalId, kind);
      default:
        return '';
    }
  },
};