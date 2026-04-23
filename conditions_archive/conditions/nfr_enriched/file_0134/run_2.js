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

// Helper: Convert scalar attribute type to GraphQL type string
const convertScalarType = (attributeType) => {
  const scalarTypeMap = {
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
  return scalarTypeMap[attributeType] || 'String';
};

// Helper: Determine if type should be required based on context
const shouldMakeRequired = (attribute, rootType, action) => {
  if (!attribute.required) {
    return false;
  }
  if (rootType !== 'mutation') {
    return true;
  }
  return action !== 'update' && attribute.default === undefined;
};

// Helper: Convert scalar attribute with required modifier
const convertScalarAttribute = (attribute, modelName, attributeName, rootType, action) => {
  let type = convertScalarType(attribute.type);

  if (attribute.type === 'enumeration') {
    type = module.exports.convertEnumType(attribute, modelName, attributeName);
  }

  if (shouldMakeRequired(attribute, rootType, action)) {
    type += '!';
  }

  return type;
};

// Helper: Convert component attribute type
const convertComponentAttribute = (attribute, rootType, action) => {
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

// Helper: Convert dynamic zone attribute type
const convertDynamicZoneAttribute = (attribute, modelName, attributeName, rootType) => {
  const { required } = attribute;
  const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;

  let typeName = unionName;

  if (rootType === 'mutation') {
    typeName = `${unionName}Input!`;
  }

  return `[${typeName}]${required ? '!' : ''}`;
};

// Helper: Convert association/relation attribute type
const convertAssociationAttribute = (attribute, rootType) => {
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

// Helper: Filter enabled attributes from model
const getEnabledAttributes = (model) => {
  return Object.keys(model.attributes).filter(attr => isTypeAttributeEnabled(model, attr));
};

// Helper: Check if all attributes are disabled
const hasAllAttributesDisabled = (model) => {
  return Object.keys(model.attributes).every(attr => !isTypeAttributeEnabled(model, attr));
};

// Helper: Generate input field for attribute
const generateInputField = (attributeName, attribute, globalId, rootType, action = '') => {
  const type = module.exports.convertType({
    attribute,
    modelName: globalId,
    attributeName,
    rootType,
    action,
  });
  return `${attributeName}: ${type}`;
};

// Helper: Generate create mutation input/payload
const generateCreateMutationPayload = (mutationName, inputName, singularName, globalId) => {
  return `
    input ${mutationName}Input { data: ${inputName} }
    type ${mutationName}Payload { ${singularName}: ${globalId} }
  `;
};

// Helper: Generate update mutation input/payload
const generateUpdateMutationPayload = (mutationName, inputName, singularName, globalId, kind) => {
  const whereClause = kind === 'singleType' ? '' : 'where: InputID, ';
  return `
    input ${mutationName}Input  { ${whereClause}data: edit${inputName} }
    type ${mutationName}Payload { ${singularName}: ${globalId} }
  `;
};

// Helper: Generate delete mutation input/payload
const generateDeleteMutationPayload = (mutationName, singularName, globalId, kind) => {
  if (kind === 'singleType') {
    return `
      type ${mutationName}Payload { ${singularName}: ${globalId} }
    `;
  }
  return `
    input ${mutationName}Input  { where: InputID }
    type ${mutationName}Payload { ${singularName}: ${globalId} }
  `;
};

// Helper: Generate empty input model
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

// Helper: Generate full input model with attributes
const generateFullInputModel = (inputName, model, globalId, allowIds) => {
  const enabledAttributes = getEnabledAttributes(model);
  const createFields = enabledAttributes
    .map(attr => generateInputField(attr, model.attributes[attr], globalId, 'mutation'))
    .join('\n');
  const updateFields = enabledAttributes
    .map(attr => generateInputField(attr, model.attributes[attr], globalId, 'mutation', 'update'))
    .join('\n');

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
      return convertScalarAttribute(attribute, modelName, attributeName, rootType, action);
    }

    if (attribute.type === 'component') {
      return convertComponentAttribute(attribute, rootType, action);
    }

    if (attribute.type === 'dynamiczone') {
      return convertDynamicZoneAttribute(attribute, modelName, attributeName, rootType);
    }

    return convertAssociationAttribute(attribute, rootType);
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

    if (_.isEmpty(model.attributes) || hasAllAttributesDisabled(model)) {
      return generateEmptyInputModel(inputName, allowIds);
    }

    return generateFullInputModel(inputName, model, globalId, allowIds);
  },

  generateInputPayloadArguments({ model, name, mutationName, action }) {
    const singularName = toSingular(name);
    const inputName = toInputName(name);
    const { kind, globalId } = model;

    switch (action) {
      case 'create':
        return generateCreateMutationPayload(mutationName, inputName, singularName, globalId);
      case 'update':
        return generateUpdateMutationPayload(mutationName, inputName, singularName, globalId, kind);
      case 'delete':
        return generateDeleteMutationPayload(mutationName, singularName, globalId, kind);
      default:
        return '';
    }
  },
};
```