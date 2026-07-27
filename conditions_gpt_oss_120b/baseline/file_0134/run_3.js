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
 * Resolve scalar GraphQL type.
 */
function resolveScalar(attribute, rootType, action) {
  const scalarMap = {
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

  if (attribute.type === 'enumeration') {
    return this.convertEnumType(attribute, attribute.modelName, attribute.attributeName);
  }

  const baseType = scalarMap[attribute.type] || 'String';
  const isRequired = attribute.required && (rootType !== 'mutation' || (action !== 'update' && attribute.default === undefined));

  return isRequired ? `${baseType}!` : baseType;
}

/**
 * Resolve component GraphQL type.
 */
function resolveComponent(attribute, modelName, attributeName, rootType, action) {
  const { required, repeatable, component } = attribute;
  const globalId = strapi.components[component].globalId;
  let typeName = required ? `${globalId}` : globalId;

  if (rootType === 'mutation') {
    const singular = _.upperFirst(toSingular(globalId));
    typeName = action === 'update' ? `edit${singular}Input` : `${singular}Input${required ? '!' : ''}`;
  }

  return repeatable ? `[${typeName}]` : typeName;
}

/**
 * Resolve dynamic zone GraphQL type.
 */
function resolveDynamicZone(attribute, modelName, attributeName, rootType) {
  const { required } = attribute;
  const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
  const typeName = rootType === 'mutation' ? `${unionName}Input!` : unionName;
  return `[${typeName}]${required ? '!' : ''}`;
}

/**
 * Resolve association GraphQL type.
 */
function resolveAssociation(attribute, rootType) {
  const ref = attribute.model || attribute.collection;
  if (!ref || ref === '*') {
    return null;
  }

  const globalId = strapi.db.getModel(ref, attribute.plugin).globalId;
  const isCollection = !!attribute.collection;

  if (isCollection) {
    return rootType === 'mutation' ? '[ID]' : `[${globalId}]`;
  }

  return rootType === 'mutation' ? 'ID' : globalId;
}

/**
 * Convert Strapi type to GraphQL type.
 */
function convertType({
  attribute = {},
  modelName = '',
  attributeName = '',
  rootType = 'query',
  action = '',
}) {
  // Scalar
  if (isScalarAttribute(attribute)) {
    // Attach modelName/attributeName for enum handling
    attribute.modelName = modelName;
    attribute.attributeName = attributeName;
    return resolveScalar.call(this, attribute, rootType, action);
  }

  // Component
  if (attribute.type === 'component') {
    return resolveComponent(attribute, modelName, attributeName, rootType, action);
  }

  // Dynamic zone
  if (attribute.type === 'dynamiczone') {
    return resolveDynamicZone(attribute, modelName, attributeName, rootType);
  }

  // Association
  const assocType = resolveAssociation(attribute, rootType);
  if (assocType) {
    return assocType;
  }

  // Fallback for polymorphic relations
  if (rootType === 'mutation') {
    return attribute.model ? 'ID' : '[ID]';
  }

  return attribute.model ? 'Morph' : '[Morph]';
}

/**
 * Convert Strapi enumeration to GraphQL Enum.
 */
function convertEnumType(definition, model, field) {
  return definition.enumName ? definition.enumName : `ENUM_${model.toUpperCase()}_${field.toUpperCase()}`;
}

/**
 * Add custom scalar type such as JSON.
 */
function getScalars() {
  return {
    JSON: GraphQLJSON,
    DateTime: GraphQLDateTime,
    Time,
    Date: GraphQLDate,
    Long: GraphQLLong,
    Upload: GraphQLUpload,
  };
}

/**
 * Add Union Type that contains the types defined by the user.
 */
function addPolymorphicUnionType(definition) {
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

  return { definition: '', resolvers: {} };
}

/**
 * Add generic InputID type.
 */
function addInput() {
  return `
    input InputID { id: ID!}
  `;
}

/**
 * Generate input model definitions.
 */
function generateInputModel(model, name, { allowIds = false } = {}) {
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

  const buildFields = (actionFlag) =>
    Object.keys(model.attributes)
      .filter(attributeName => isTypeAttributeEnabled(model, attributeName))
      .map(attributeName => {
        const fieldType = this.convertType({
          attribute: model.attributes[attributeName],
          modelName: globalId,
          attributeName,
          rootType: 'mutation',
          action: actionFlag,
        });
        return `${attributeName}: ${fieldType}`;
      })
      .join('\n');

  return `
    input ${inputName} {
      ${buildFields()}
    }

    input edit${inputName} {
      ${allowIds ? 'id: ID' : ''}
      ${buildFields('update')}
    }
  `;
}

/**
 * Generate input payload arguments for mutations.
 */
function generateInputPayloadArguments({ model, name, mutationName, action }) {
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
}

module.exports = {
  convertType,
  convertEnumType,
  getScalars,
  addPolymorphicUnionType,
  addInput,
  generateInputModel,
  generateInputPayloadArguments,
};