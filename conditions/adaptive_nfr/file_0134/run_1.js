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

/**
 * Maps Strapi scalar types to GraphQL type names.
 * @type {Object<string, string>}
 */
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
 * Determines if a type should be marked as required in GraphQL.
 * @param {Object} attribute - The attribute definition.
 * @param {string} rootType - The root type (query or mutation).
 * @param {string} action - The mutation action (create, update, delete).
 * @returns {boolean}
 */
const shouldMarkRequired = (attribute, rootType, action) => {
  if (!attribute.required) {
    return false;
  }
  if (rootType !== 'mutation') {
    return true;
  }
  return action !== 'update' || attribute.default !== undefined;
};

/**
 * Converts a scalar attribute to its GraphQL type representation.
 * @param {Object} attribute - The attribute definition.
 * @param {string} modelName - The model name.
 * @param {string} attributeName - The attribute name.
 * @param {string} rootType - The root type (query or mutation).
 * @returns {string}
 */
const convertScalarType = function(attribute, modelName, attributeName, rootType) {
  let type = SCALAR_TYPE_MAP[attribute.type] || 'String';

  if (attribute.type === 'enumeration') {
    type = this.convertEnumType(attribute, modelName, attributeName);
  }

  if (shouldMarkRequired(attribute, rootType, '')) {
    type += '!';
  }

  return type;
};

/**
 * Converts a component attribute to its GraphQL type representation.
 * @param {Object} attribute - The attribute definition.
 * @param {string} rootType - The root type (query or mutation).
 * @param {string} action - The mutation action.
 * @returns {string}
 */
const convertComponentType = (attribute, rootType, action) => {
  const { required, repeatable, component } = attribute;
  const globalId = strapi.components[component].globalId;

  let typeName = globalId;

  if (rootType === 'mutation') {
    const singular = _.upperFirst(toSingular(globalId));
    typeName = action === 'update'
      ? `edit${singular}Input`
      : `${singular}Input${required ? '!' : ''}`;
  }

  if (repeatable === true) {
    return `[${typeName}]`;
  }

  return typeName;
};

/**
 * Converts a dynamic zone attribute to its GraphQL type representation.
 * @param {Object} attribute - The attribute definition.
 * @param {string} modelName - The model name.
 * @param {string} attributeName - The attribute name.
 * @param {string} rootType - The root type (query or mutation).
 * @returns {string}
 */
const convertDynamicZoneType = (attribute, modelName, attributeName, rootType) => {
  const { required } = attribute;
  const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
  const typeName = rootType === 'mutation' ? `${unionName}Input!` : unionName;

  return `[${typeName}]${required ? '!' : ''}`;
};

/**
 * Converts an association attribute to its GraphQL type representation.
 * @param {Object} attribute - The attribute definition.
 * @param {string} rootType - The root type (query or mutation).
 * @returns {string}
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
 * Generates mutation input and payload definitions for create action.
 * @param {string} mutationName - The mutation name.
 * @param {string} singularName - The singular model name.
 * @param {string} inputName - The input type name.
 * @param {string} globalId - The model global ID.
 * @returns {string}
 */
const generateCreatePayload = (mutationName, singularName, inputName, globalId) => `
  input ${mutationName}Input { data: ${inputName} }
  type ${mutationName}Payload { ${singularName}: ${globalId} }
`;

/**
 * Generates mutation input and payload definitions for update action.
 * @param {string} mutationName - The mutation name.
 * @param {string} singularName - The singular model name.
 * @param {string} inputName - The input type name.
 * @param {string} globalId - The model global ID.
 * @param {string} kind - The model kind (singleType or collectionType).
 * @returns {string}
 */
const generateUpdatePayload = (mutationName, singularName, inputName, globalId, kind) => {
  const whereClause = kind === 'singleType' ? '' : 'where: InputID, ';
  return `
  input ${mutationName}Input  { ${whereClause}data: edit${inputName} }
  type ${mutationName}Payload { ${singularName}: ${globalId} }
`;
};

/**
 * Generates mutation input and payload definitions for delete action.
 * @param {string} mutationName - The mutation name.
 * @param {string} singularName - The singular model name.
 * @param {string} globalId - The model global ID.
 * @param {string} kind - The model kind (singleType or collectionType).
 * @returns {string}
 */
const generateDeletePayload = (mutationName, singularName, globalId, kind) => {
  const inputDef = kind === 'singleType' ? '' : `input ${mutationName}Input  { where: InputID }\n  `;
  return `
  ${inputDef}type ${mutationName}Payload { ${singularName}: ${globalId} }
`;
};

/**
 * Strategy map for generating mutation payloads by action type.
 * @type {Object<string, Function>}
 */
const PAYLOAD_GENERATORS = {
  create: generateCreatePayload,
  update: generateUpdatePayload,
  delete: generateDeletePayload,
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
      return convertScalarType.call(this, attribute, modelName, attributeName, rootType);
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
    const { kind, globalId } = model;

    const generator = PAYLOAD_GENERATORS[action];

    if (!generator) {
      return '';
    }

    if (action === 'delete') {
      return generator(mutationName, singularName, globalId, kind);
    }

    return generator(mutationName, singularName, inputName, globalId, kind);
  },
};
```