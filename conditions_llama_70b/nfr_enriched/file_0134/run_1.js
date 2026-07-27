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
  const { required, repeatable, component } = attribute;
  const globalId = strapi.components[component].globalId;

  let typeName = required === true ? `${globalId}` : globalId;

  if (rootType === 'mutation') {
    typeName =
      action === 'update'
        ? `edit${_.upperFirst(toSingular(globalId))}Input`
        : `${_.upperFirst(toSingular(globalId))}Input${required ? '!' : ''}`;
  }

  return repeatable === true ? `[${typeName}]` : `${typeName}`;
};

const getDynamicZoneType = (attribute, rootType) => {
  // Determine the dynamic zone type based on the attribute and root type
  const { required } = attribute;
  const unionName = `${attribute.modelName}${_.upperFirst(_.camelCase(attribute.attributeName))}DynamicZone`;

  let typeName = unionName;

  if (rootType === 'mutation') {
    typeName = `${unionName}Input!`;
  }

  return `[${typeName}]${required ? '!' : ''}`;
};

const getAssociationType = (attribute, rootType) => {
  // Determine the association type based on the attribute and root type
  const ref = attribute.model || attribute.collection;
  const globalId = strapi.db.getModel(ref, attribute.plugin).globalId;
  const plural = !_.isEmpty(attribute.collection);

  if (plural) {
    if (rootType === 'mutation') {
      return '[ID]';
    }

    return `[${globalId}]`;
  }

  if (rootType === 'mutation') {
    return 'ID';
  }

  return globalId;
};

const getMorphType = (attribute, rootType) => {
  // Determine the morph type based on the attribute and root type
  if (rootType === 'mutation') {
    return attribute.model ? 'ID' : '[ID]';
  }

  return attribute.model ? 'Morph' : '[Morph]';
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
    let type = getScalarType(attribute);

    if (attribute.type === 'enumeration') {
      type = convertEnumType(attribute, modelName, attributeName);
    }

    if (attribute.required) {
      if (rootType !== 'mutation' || (action !== 'update' && attribute.default === undefined)) {
        type += '!';
      }
    }

    return type;
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

  return getMorphType(attribute, rootType);
};

const convertEnumType = (definition, model, field) => {
  // Convert the Strapi enumeration to GraphQL Enum
  return definition.enumName
    ? definition.enumName
    : `ENUM_${model.toUpperCase()}_${field.toUpperCase()}`;
};

const getScalars = () => {
  // Add custom scalar type such as JSON
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
  // Add Union Type that contains the types defined by the user
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
  // Add input type
  return `
    input InputID { id: ID!}
  `;
};

const generateInputModel = (model, name, { allowIds = false } = {}) => {
  // Generate input model
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
  // Generate input payload arguments
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