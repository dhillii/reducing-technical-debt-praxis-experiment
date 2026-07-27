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

// Helper: Convert scalar attribute types to GraphQL types
const getScalarGraphQLType = (attributeType) => {
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

// Helper: Determine if type should be required
const shouldMakeTypeRequired = (attribute, rootType, action) => {
  if (!attribute.required) {
    return false;
  }
  if (rootType !== 'mutation') {
    return true;
  }
  return action !== 'update' && attribute.default === undefined;
};

// Helper: Convert scalar attribute with required modifier
const convertScalarType = (attribute, rootType, action) => {
  let type = getScalarGraphQLType(attribute.type);
  
  if (shouldMakeTypeRequired(attribute, rootType, action)) {
    type += '!';
  }
  
  return type;
};

// Helper: Convert enumeration type
const convertEnumerationType = (attribute, modelName, attributeName) => {
  return attribute.enumName
    ? attribute.enumName
    : `ENUM_${modelName.toUpperCase()}_${attributeName.toUpperCase()}`;
};

// Helper: Convert component attribute type
const convertComponentType = (attribute, rootType, action) => {
  const { required, repeatable, component } = attribute;
  const globalId = strapi.components[component].globalId;
  
  let typeName = globalId;
  
  if (rootType === 'mutation') {
    typeName = action === 'update'
      ? `edit${_.upperFirst(toSingular(globalId))}Input`
      : `${_.upperFirst(toSingular(globalId))}Input${required ? '!' : ''}`;
  }
  
  if (repeatable === true) {
    return `[${typeName}]`;
  }
  
  return typeName;
};

// Helper: Convert dynamic zone attribute type
const convertDynamicZoneType = (attribute, modelName, attributeName, rootType) => {
  const { required } = attribute;
  const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
  
  let typeName = unionName;
  
  if (rootType === 'mutation') {
    typeName = `${unionName}Input!`;
  }
  
  return `[${typeName}]${required ? '!' : ''}`;
};

// Helper: Convert association/relation attribute type
const convertAssociationType = (attribute, rootType) => {
  const ref = attribute.model || attribute.collection;
  
  if (!ref || ref === '*') {
    return null;
  }
  
  const globalId = strapi.db.getModel(ref, attribute.plugin).globalId;
  const isPlural = !_.isEmpty(attribute.collection);
  
  if (isPlural) {
    return rootType === 'mutation' ? '[ID]' : `[${globalId}]`;
  }
  
  return rootType === 'mutation' ? 'ID' : globalId;
};

// Helper: Convert polymorphic association type
const convertPolymorphicType = (attribute, rootType) => {
  return attribute.model
    ? (rootType === 'mutation' ? 'ID' : 'Morph')
    : (rootType === 'mutation' ? '[ID]' : '[Morph]');
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
    // Handle scalar attributes
    if (isScalarAttribute(attribute)) {
      if (attribute.type === 'enumeration') {
        let type = convertEnumerationType(attribute, modelName, attributeName);
        if (shouldMakeTypeRequired(attribute, rootType, action)) {
          type += '!';
        }
        return type;
      }
      return convertScalarType(attribute, rootType, action);
    }

    // Handle component attributes
    if (attribute.type === 'component') {
      return convertComponentType(attribute, rootType, action);
    }

    // Handle dynamic zone attributes
    if (attribute.type === 'dynamiczone') {
      return convertDynamicZoneType(attribute, modelName, attributeName, rootType);
    }

    // Handle association/relation attributes
    const associationType = convertAssociationType(attribute, rootType);
    if (associationType !== null) {
      return associationType;
    }

    // Handle polymorphic associations
    return convertPolymorphicType(attribute, rootType);
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

    const enabledAttributes = Object.keys(model.attributes).filter(attributeName =>
      isTypeAttributeEnabled(model, attributeName)
    );

    const createInputFields = enabledAttributes
      .map(attributeName => {
        return `${attributeName}: ${this.convertType({
          attribute: model.attributes[attributeName],
          modelName: globalId,
          attributeName,
          rootType: 'mutation',
        })}`;
      })
      .join('\n');

    const updateInputFields = enabledAttributes
      .map(attributeName => {
        return `${attributeName}: ${this.convertType({
          attribute: model.attributes[attributeName],
          modelName: globalId,
          attributeName,
          rootType: 'mutation',
          action: 'update',
        })}`;
      })
      .join('\n');

    const inputs = `
      input ${inputName} {
        ${createInputFields}
      }

      input edit${inputName} {
        ${allowIds ? 'id: ID' : ''}
        ${updateInputFields}
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
        return '';
    }
  },
};