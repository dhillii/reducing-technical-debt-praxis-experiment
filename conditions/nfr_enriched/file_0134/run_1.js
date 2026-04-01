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
 * Map Strapi scalar types to GraphQL type names.
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
 * Converts a scalar attribute type to its GraphQL representation.
 * @param {Object} attribute - The attribute definition.
 * @param {String} modelName - Name of the model owning the attribute.
 * @param {String} attributeName - Name of the attribute.
 * @return {String} GraphQL type string.
 */
const convertScalarType = function(attribute, modelName, attributeName) {
  let type = SCALAR_TYPE_MAP[attribute.type] || 'String';

  if (attribute.type === 'enumeration') {
    type = this.convertEnumType(attribute, modelName, attributeName);
  }

  return type;
};

/**
 * Applies required modifier to a GraphQL type if needed.
 * @param {String} type - The base GraphQL type.
 * @param {Object} attribute - The attribute definition.
 * @param {String} rootType - The root type context (query/mutation).
 * @param {String} action - The mutation action (create/update/delete).
 * @return {String} Modified GraphQL type with required modifier if applicable.
 */
const applyRequiredModifier = (type, attribute, rootType, action) => {
  if (!attribute.required) {
    return type;
  }

  if (rootType !== 'mutation' || (action !== 'update' && attribute.default === undefined)) {
    return `${type}!`;
  }

  return type;
};

/**
 * Converts a component attribute to its GraphQL type representation.
 * @param {Object} attribute - The attribute definition.
 * @param {String} rootType - The root type context (query/mutation).
 * @param {String} action - The mutation action.
 * @return {String} GraphQL type string.
 */
const convertComponentType = function(attribute, rootType, action) {
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
 * Converts a dynamic zone attribute to its GraphQL type representation.
 * @param {Object} attribute - The attribute definition.
 * @param {String} modelName - Name of the model owning the attribute.
 * @param {String} attributeName - Name of the attribute.
 * @param {String} rootType - The root type context (query/mutation).
 * @return {String} GraphQL type string.
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
 * Converts an association attribute to its GraphQL type representation.
 * @param {Object} attribute - The attribute definition.
 * @param {String} rootType - The root type context (query/mutation).
 * @return {String} GraphQL type string.
 */
const convertAssociationType = function(attribute, rootType) {
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
 * Filters enabled attributes from a model.
 * @param {Object} model - The model definition.
 * @return {Array} Array of enabled attribute names.
 */
const getEnabledAttributes = (model) => {
  return Object.keys(model.attributes).filter(attributeName =>
    isTypeAttributeEnabled(model, attributeName)
  );
};

/**
 * Generates input field definitions for a model.
 * @param {Object} model - The model definition.
 * @param {String} globalId - The global ID of the model.
 * @param {String} action - The mutation action (create/update).
 * @return {String} GraphQL input field definitions.
 */
const generateInputFields = function(model, globalId, action) {
  const enabledAttributes = getEnabledAttributes(model);

  return enabledAttributes
    .map(attributeName => {
      const type = this.convertType({
        attribute: model.attributes[attributeName],
        modelName: globalId,
        attributeName,
        rootType: 'mutation',
        action,
      });
      return `${attributeName}: ${type}`;
    })
    .join('\n');
};

/**
 * Generates input type definitions for a model.
 * @param {Object} model - The model definition.
 * @param {String} inputName - The input type name.
 * @param {Boolean} allowIds - Whether to allow ID fields.
 * @return {String} GraphQL input type definitions.
 */
const generateInputTypes = function(model, inputName, allowIds) {
  const globalId = model.globalId;
  const inputFields = generateInputFields.call(this, model, globalId, 'create');
  const editInputFields = generateInputFields.call(this, model, globalId, 'update');

  return `
    input ${inputName} {
      ${inputFields}
    }

    input edit${inputName} {
      ${allowIds ? 'id: ID' : ''}
      ${editInputFields}
    }
  `;
};

/**
 * Generates empty input type definitions for models with no attributes.
 * @param {String} inputName - The input type name.
 * @param {Boolean} allowIds - Whether to allow ID fields.
 * @return {String} GraphQL input type definitions.
 */
const generateEmptyInputTypes = (inputName, allowIds) => {
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
 * Generates mutation input and payload for create action.
 * @param {String} mutationName - The mutation name.
 * @param {String} inputName - The input type name.
 * @param {String} singularName - The singular model name.
 * @param {String} globalId - The global ID of the model.
 * @return {String} GraphQL mutation definitions.
 */
const generateCreateMutation = (mutationName, inputName, singularName, globalId) => {
  return `
    input ${mutationName}Input { data: ${inputName} }
    type ${mutationName}Payload { ${singularName}: ${globalId} }
  `;
};

/**
 * Generates mutation input and payload for update action.
 * @param {String} mutationName - The mutation name.
 * @param {String} inputName - The input type name.
 * @param {String} singularName - The singular model name.
 * @param {String} globalId - The global ID of the model.
 * @param {String} kind - The model kind (singleType/collectionType).
 * @return {String} GraphQL mutation definitions.
 */
const generateUpdateMutation = (mutationName, inputName, singularName, globalId, kind) => {
  const whereClause = kind === 'singleType' ? '' : 'where: InputID, ';

  return `
    input ${mutationName}Input { ${whereClause}data: edit${inputName} }
    type ${mutationName}Payload { ${singularName}: ${globalId} }
  `;
};

/**
 * Generates mutation input and payload for delete action.
 * @param {String} mutationName - The mutation name.
 * @param {String} singularName - The singular model name.
 * @param {String} globalId - The global ID of the model.
 * @param {String} kind - The model kind (singleType/collectionType).
 * @return {String} GraphQL mutation definitions.
 */
const generateDeleteMutation = (mutationName, singularName, globalId, kind) => {
  const inputDef = kind === 'singleType'
    ? ''
    : `input ${mutationName}Input { where: InputID }\n`;

  return `
    ${inputDef}type ${mutationName}Payload { ${singularName}: ${globalId} }
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
      const type = convertScalarType.call(this, attribute, modelName, attributeName);
      return applyRequiredModifier(type, attribute, rootType, action);
    }

    if (attribute.type === 'component') {
      return convertComponentType.call(this, attribute, rootType, action);
    }

    if (attribute.type === 'dynamiczone') {
      return convertDynamicZoneType(attribute, modelName, attributeName, rootType);
    }

    return convertAssociationType.call(this, attribute, rootType);
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
    const enabledAttributes = getEnabledAttributes(model);
    const hasAllAttributesDisabled = enabledAttributes.length === 0;

    if (_.isEmpty(model.attributes) || hasAllAttributesDisabled) {
      return generateEmptyInputTypes(inputName, allowIds);
    }

    return generateInputTypes.call(this, model, inputName, allowIds);
  },

  generateInputPayloadArguments({ model, name, mutationName, action }) {
    const singularName = toSingular(name);
    const inputName = toInputName(name);
    const { kind, globalId } = model;

    switch (action) {
      case 'create':
        return generateCreateMutation(mutationName, inputName, singularName, globalId);
      case 'update':
        return generateUpdateMutation(mutationName, inputName, singularName, globalId, kind);
      case 'delete':
        return generateDeleteMutation(mutationName, singularName, globalId, kind);
      default:
        return '';
    }
  },
};
```