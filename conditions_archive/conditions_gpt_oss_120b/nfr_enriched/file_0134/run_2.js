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

/* ---------- Helper Functions ---------- */

/**
 * Resolve GraphQL scalar type from Strapi attribute.
 */
function resolveScalarType(attribute, modelName, attributeName, rootType, action) {
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
    return module.exports.convertEnumType(attribute, modelName, attributeName);
  }

  let gqlType = scalarMap[attribute.type] || 'String';

  if (attribute.required) {
    const isMutationCreate = rootType === 'mutation' && action !== 'update' && attribute.default === undefined;
    if (rootType !== 'mutation' || isMutationCreate) {
      gqlType += '!';
    }
  }

  return gqlType;
}

/**
 * Resolve component type for queries and mutations.
 */
function resolveComponentType(attribute, modelName, rootType, action) {
  const { required, repeatable, component } = attribute;
  const globalId = strapi.components[component].globalId;
  const baseName = required ? `${globalId}` : globalId;

  if (rootType === 'mutation') {
    const singular = _.upperFirst(toSingular(globalId));
    const inputName = action === 'update' ? `edit${singular}Input` : `${singular}Input${required ? '!' : ''}`;
    return repeatable ? `[${inputName}]` : inputName;
  }

  return repeatable ? `[${baseName}]` : baseName;
}

/**
 * Resolve dynamic zone type.
 */
function resolveDynamicZoneType(attribute, modelName, attributeName, rootType) {
  const { required } = attribute;
  const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
  const typeName = rootType === 'mutation' ? `${unionName}Input!` : unionName;
  return `[${typeName}]${required ? '!' : ''}`;
}

/**
 * Resolve association (relation) type.
 */
function resolveAssociationType(attribute, rootType) {
  const ref = attribute.model || attribute.collection;
  if (!ref || ref === '*') return null;

  const globalId = strapi.db.getModel(ref, attribute.plugin).globalId;
  const isCollection = !!attribute.collection;

  if (isCollection) {
    return rootType === 'mutation' ? '[ID]' : `[${globalId}]`;
  }

  return rootType === 'mutation' ? 'ID' : globalId;
}

/**
 * Resolve fallback mutation type when no other rule matches.
 */
function resolveMutationFallback(attribute) {
  return attribute.model ? 'ID' : '[ID]';
}

/**
 * Resolve fallback query type when no other rule matches.
 */
function resolveQueryFallback(attribute) {
  return attribute.model ? 'Morph' : '[Morph]';
}

/* ---------- Exported Service ---------- */

module.exports = {
  /**
   * Convert Strapi type to GraphQL type.
   */
  convertType({
    attribute = {},
    modelName = '',
    attributeName = '',
    rootType = 'query',
    action = '',
  }) {
    if (isScalarAttribute(attribute)) {
      return resolveScalarType(attribute, modelName, attributeName, rootType, action);
    }

    if (attribute.type === 'component') {
      return resolveComponentType(attribute, modelName, rootType, action);
    }

    if (attribute.type === 'dynamiczone') {
      return resolveDynamicZoneType(attribute, modelName, attributeName, rootType);
    }

    const association = resolveAssociationType(attribute, rootType);
    if (association) {
      return association;
    }

    if (rootType === 'mutation') {
      return resolveMutationFallback(attribute);
    }

    return resolveQueryFallback(attribute);
  },

  /**
   * Convert Strapi enumeration to GraphQL Enum.
   */
  convertEnumType(definition, model, field) {
    return definition.enumName
      ? definition.enumName
      : `ENUM_${model.toUpperCase()}_${field.toUpperCase()}`;
  },

  /**
   * Return custom scalar types.
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
   * Build a polymorphic union type from a schema definition.
   */
  addPolymorphicUnionType(definition) {
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
  },

  addInput() {
    return `
      input InputID { id: ID!}
    `;
  },

  /**
   * Generate GraphQL input types for a model.
   */
  generateInputModel(model, name, { allowIds = false } = {}) {
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

    const buildFields = (actionFlag) =>
      Object.keys(model.attributes)
        .filter((attr) => isTypeAttributeEnabled(model, attr))
        .map((attr) => {
          const type = this.convertType({
            attribute: model.attributes[attr],
            modelName: globalId,
            attributeName: attr,
            rootType: 'mutation',
            action: actionFlag,
          });
          return `${attr}: ${type}`;
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
  },

  /**
   * Generate input and payload definitions for mutations.
   */
  generateInputPayloadArguments({ model, name, mutationName, action }) {
    const singularName = toSingular(name);
    const inputName = toInputName(name);
    const { kind } = model;

    if (action === 'create') {
      return `
        input ${mutationName}Input { data: ${inputName} }
        type ${mutationName}Payload { ${singularName}: ${model.globalId} }
      `;
    }

    if (action === 'update') {
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
    }

    if (action === 'delete') {
      if (kind === 'singleType') {
        return `
          type ${mutationName}Payload { ${singularName}: ${model.globalId} }
        `;
      }
      return `
        input ${mutationName}Input  { where: InputID }
        type ${mutationName}Payload { ${singularName}: ${model.globalId} }
      `;
    }

    return '';
  },
};
```