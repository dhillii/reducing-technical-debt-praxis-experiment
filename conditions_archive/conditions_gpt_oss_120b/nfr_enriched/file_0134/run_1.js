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
 * Resolve scalar GraphQL type based on Strapi attribute definition.
 */
function resolveScalarType(attribute, rootType, action) {
  const map = {
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
    return null; // handled separately
  }

  let gqlType = map[attribute.type] || 'String';

  if (attribute.required) {
    const isMutationCreate = rootType === 'mutation' && action !== 'update' && attribute.default === undefined;
    if (rootType !== 'mutation' || isMutationCreate) {
      gqlType += '!';
    }
  }

  return gqlType;
}

/**
 * Build GraphQL type for component attributes.
 */
function resolveComponentType(attribute, modelName, rootType, action) {
  const { required, repeatable, component } = attribute;
  const globalId = strapi.components[component].globalId;
  let typeName = required ? `${globalId}` : globalId;

  if (rootType === 'mutation') {
    const base = _.upperFirst(toSingular(globalId));
    typeName = action === 'update' ? `edit${base}Input` : `${base}Input${required ? '!' : ''}`;
  }

  return repeatable ? `[${typeName}]` : `${typeName}`;
}

/**
 * Build GraphQL type for dynamic zone attributes.
 */
function resolveDynamicZoneType(attribute, modelName, attributeName, rootType) {
  const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
  const typeName = rootType === 'mutation' ? `${unionName}Input!` : unionName;
  return `[${typeName}]${attribute.required ? '!' : ''}`;
}

/**
 * Build GraphQL type for relational attributes.
 */
function resolveRelationType(attribute, rootType) {
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
 * Resolve fallback type for non‑scalar, non‑relation attributes.
 */
function resolveFallbackType(attribute, rootType) {
  if (rootType === 'mutation') {
    return attribute.model ? 'ID' : '[ID]';
  }
  return attribute.model ? 'Morph' : '[Morph]';
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
  // scalar handling
  if (isScalarAttribute(attribute)) {
    if (attribute.type === 'enumeration') {
      return this.convertEnumType(attribute, modelName, attributeName);
    }
    return resolveScalarType(attribute, rootType, action);
  }

  // component handling
  if (attribute.type === 'component') {
    return resolveComponentType(attribute, modelName, rootType, action);
  }

  // dynamic zone handling
  if (attribute.type === 'dynamiczone') {
    return resolveDynamicZoneType(attribute, modelName, attributeName, rootType);
  }

  // relation handling
  const relation = resolveRelationType(attribute, rootType);
  if (relation) {
    return relation;
  }

  // fallback
  return resolveFallbackType(attribute, rootType);
}

/**
 * Convert Strapi enumeration to GraphQL Enum.
 */
function convertEnumType(definition, model, field) {
  return definition.enumName
    ? definition.enumName
    : `ENUM_${model.toUpperCase()}_${field.toUpperCase()}`;
}

/**
 * Return custom scalar mappings.
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
 * Build a polymorphic union type from a schema definition.
 */
function addPolymorphicUnionType(definition) {
  const types = graphql
    .parse(definition)
    .definitions.filter(
      (def) => def.kind === 'ObjectTypeDefinition' && def.name.value !== 'Query'
    )
    .map((def) => def.name.value);

  if (types.length === 0) {
    return { definition: '', resolvers: {} };
  }

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

/**
 * Simple InputID definition.
 */
function addInput() {
  return `
    input InputID { id: ID!}
  `;
}

/**
 * Generate GraphQL input types for a model.
 */
function generateInputModel(model, name, { allowIds = false } = {}) {
  const globalId = model.globalId;
  const inputName = `${_.upperFirst(toSingular(name))}Input`;
  const hasAllAttributesDisabled = Object.keys(model.attributes).every(
    (attr) => !isTypeAttributeEnabled(model, attr)
  );

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

  const buildFields = (action) =>
    Object.keys(model.attributes)
      .filter((attributeName) => isTypeAttributeEnabled(model, attributeName))
      .map((attributeName) => {
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
 * Generate input and payload definitions for mutations.
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
      return '';
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
```