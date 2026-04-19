```javascript
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

// Scalar type mapping lookup table
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
 * Convert scalar attribute type to GraphQL type.
 * @param {Object} attribute - Information about the attribute.
 * @return {String} GraphQL type name.
 */
const convertScalarType = (attribute) => {
  const type = attribute.type;
  if (!SCALAR_TYPE_MAP[type]) {
    return 'String';
  }
  return SCALAR_TYPE_MAP[type];
};

/**
 * Determine if a type should have required suffix.
 * @param {String} rootType - GraphQL root type.
 * @param {String} action - Mutation action.
 * @param {Object} attribute - Attribute information.
 * @return {Boolean} Whether to add required suffix.
 */
const shouldAddRequiredSuffix = (rootType, action, attribute) => {
  if (!attribute.required) {
    return false;
  }
  if (rootType !== 'mutation') {
    return true;
  }
  if (action === 'update' && attribute.default !== undefined) {
    return false;
  }
  return true;
};

/**
 * Convert component attribute to GraphQL type.
 * @param {Object} attribute - Component attribute information.
 * @param {String} rootType - GraphQL root type.
 * @param {String} action - Mutation action.
 * @return {String} GraphQL type name.
 */
const convertComponentType = (attribute, rootType, action) => {
  const { required, repeatable, component } = attribute;
  const globalId = strapi.components[component].globalId;
  const singular = toSingular(globalId);
  const baseName = _.upperFirst(singular);
  
  let typeName;
  
  if (rootType === 'mutation') {
    if (action === 'update') {
      typeName = `edit${baseName}Input`;
    } else {
      typeName = `${baseName}Input`;
    }
  } else {
    typeName = required === true ? globalId : globalId;
  }
  
  if (repeatable === true) {
    return `[${typeName}]`;
  }
  
  return typeName;
};

/**
 * Convert dynamiczone attribute to GraphQL type.
 * @param {Object} attribute - Dynamiczone attribute information.
 * @param {String} modelName - Model name.
 * @param {String} attributeName - Attribute name.
 * @param {String} rootType - GraphQL root type.
 * @return {String} GraphQL type name.
 */
const convertDynamicZoneType = (attribute, modelName, attributeName, rootType) => {
  const { required } = attribute;
  const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
  
  if (rootType === 'mutation') {
    return `[${unionName}Input!]${required ? '!' : ''}`;
  }
  
  return `[${unionName}]${required ? '!' : ''}`;
};

/**
 * Convert association attribute to GraphQL type.
 * @param {Object} attribute - Association attribute information.
 * @param {String} rootType - GraphQL root type.
 * @param {String} action - Mutation action.
 * @return {String} GraphQL type name.
 */
const convertAssociationType = (attribute, rootType, action) => {
  const ref = attribute.model || attribute.collection;
  
  if (!ref || ref === '*') {
    return attribute.model ? 'Morph' : '[Morph]';
  }
  
  const globalId = strapi.db.getModel(ref, attribute.plugin).globalId;
  const plural = !_.isEmpty(attribute.collection);
  
  if (rootType === 'mutation') {
    if (action === 'update') {
      return 'ID';
    }
    if (plural) {
      return '[ID]';
    }
    return 'ID';
  }
  
  if (plural) {
    return `[${globalId}]`;
  }
  
  return globalId;
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
    // Scalar types
    if (isScalarAttribute(attribute)) {
      let type = convertScalarType(attribute);
      if (shouldAddRequiredSuffix(rootType, action, attribute)) {
        type += '!';
      }
      return type;
    }

    // Component types
    if (attribute.type === 'component') {
      return convertComponentType(attribute, rootType, action);
    }

    // Dynamiczone types
    if (attribute.type === 'dynamiczone') {
      return convertDynamicZoneType(attribute, modelName, attributeName, rootType);
    }

    // Association types
    return convertAssociationType(attribute, rootType, action);
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
```