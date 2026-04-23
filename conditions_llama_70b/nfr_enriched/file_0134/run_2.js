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

const getScalarType = (attribute) => {
  // Determine the scalar type based on the attribute type
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

const getComponentType = (attribute, rootType, action) => {
  // Determine the component type based on the attribute and root type
  const globalId = strapi.components[attribute.component].globalId;
  const typeName = rootType === 'mutation'
    ? action === 'update'
      ? `edit${_.upperFirst(toSingular(globalId))}Input`
      : `${_.upperFirst(toSingular(globalId))}Input`
    : globalId;

  return attribute.repeatable ? `[${typeName}]` : typeName;
};

const getDynamicZoneType = (attribute, rootType) => {
  // Determine the dynamic zone type based on the attribute and root type
  const unionName = `${attribute.modelName}${_.upperFirst(_.camelCase(attribute.attributeName))}DynamicZone`;
  const typeName = rootType === 'mutation' ? `${unionName}Input!` : unionName;

  return `[${typeName}]${attribute.required ? '!' : ''}`;
};

const getAssociationType = (attribute, rootType) => {
  // Determine the association type based on the attribute and root type
  const globalId = strapi.db.getModel(attribute.model || attribute.collection, attribute.plugin).globalId;
  const plural = !_.isEmpty(attribute.collection);

  if (plural) {
    return rootType === 'mutation' ? '[ID]' : `[${globalId}]`;
  }

  return rootType === 'mutation' ? 'ID' : globalId;
};

const getRequiredType = (type, required) => {
  // Add the required modifier to the type if necessary
  return required && type !== 'ID' ? `${type}!` : type;
};

const convertType = ({
  attribute = {},
  modelName = '',
  attributeName = '',
  rootType = 'query',
  action = '',
}) => {
  // Convert the Strapi type to GraphQL type
  if (isScalarAttribute(attribute)) {
    const type = getScalarType(attribute);
    return getRequiredType(type, attribute.required);
  }

  if (attribute.type === 'component') {
    return getComponentType(attribute, rootType, action);
  }

  if (attribute.type === 'dynamiczone') {
    return getDynamicZoneType(attribute, rootType);
  }

  if (attribute.model || attribute.collection) {
    return getAssociationType(attribute, rootType);
  }

  return rootType === 'mutation' ? 'ID' : 'Morph';
};

const convertEnumType = (definition, model, field) => {
  // Convert the Strapi enumeration to GraphQL Enum
  return definition.enumName
    ? definition.enumName
    : `ENUM_${model.toUpperCase()}_${field.toUpperCase()}`;
};

const getScalars = () => {
  // Add custom scalar types
  return {
    JSON: GraphQLJSON,
    DateTime: GraphQLDateTime,
    Time,
    Date: GraphQLDate,
    Long: GraphQLLong,
    Upload: GraphQLUpload,
  };
};

const addPolymorphicUnionType = (definition) => {
  // Add the polymorphic union type
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
};

const addInput = () => {
  // Add the input type
  return `
    input InputID { id: ID!}
  `;
};

const generateInputModel = (model, name, { allowIds = false } = {}) => {
  // Generate the input model
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
          return `${attributeName}: ${convertType({
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
          return `${attributeName}: ${convertType({
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
};

const generateInputPayloadArguments = ({ model, name, mutationName, action }) => {
  // Generate the input payload arguments
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
};

module.exports = {
  convertType,
  convertEnumType,
  getScalars,
  addPolymorphicUnionType,
  addInput,
  generateInputModel,
  generateInputPayloadArguments,
};