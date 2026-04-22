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

/* -------------------------------------------------------------------------- */
/* Helper functions                                                          */
/* -------------------------------------------------------------------------- */

function getScalarGraphQLType(attribute) {
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
  return map[attribute.type] || 'String';
}

function applyRequiredFlag(type, attribute, rootType, action) {
  if (!attribute.required) return type;
  if (rootType !== 'mutation' || (action !== 'update' && attribute.default === undefined)) {
    return `${type}!`;
  }
  return type;
}

function handleScalar(attribute, modelName, attributeName, rootType, action) {
  if (attribute.type === 'enumeration') {
    const type = convertEnumType(attribute, modelName, attributeName);
    return applyRequiredFlag(type, attribute, rootType, action);
  }
  const base = getScalarGraphQLType(attribute);
  return applyRequiredFlag(base, attribute, rootType, action);
}

function handleComponent(attribute, rootType, action) {
  const { required, repeatable, component } = attribute;
  const globalId = strapi.components[component].globalId;
  let typeName = required ? `${globalId}` : globalId;

  if (rootType === 'mutation') {
    const singular = _.upperFirst(toSingular(globalId));
    typeName = action === 'update' ? `edit${singular}Input` : `${singular}Input${required ? '!' : ''}`;
  }

  return repeatable ? `[${typeName}]` : typeName;
}

function handleDynamicZone(attribute, modelName, attributeName, rootType) {
  const { required } = attribute;
  const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
  const typeName = rootType === 'mutation' ? `${unionName}Input!` : unionName;
  return `[${typeName}]${required ? '!' : ''}`;
}

function handleAssociation(attribute, rootType) {
  const ref = attribute.model || attribute.collection;
  if (!ref || ref === '*') return null;

  const globalId = strapi.db.getModel(ref, attribute.plugin).globalId;
  const isCollection = !!attribute.collection;

  if (isCollection) {
    return rootType === 'mutation' ? '[ID]' : `[${globalId}]`;
  }

  return rootType === 'mutation' ? 'ID' : globalId;
}

/* -------------------------------------------------------------------------- */
/* Exported API                                                               */
/* -------------------------------------------------------------------------- */

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
      return handleScalar(attribute, modelName, attributeName, rootType, action);
    }

    if (attribute.type === 'component') {
      return handleComponent(attribute, rootType, action);
    }

    if (attribute.type === 'dynamiczone') {
      return handleDynamicZone(attribute, modelName, attributeName, rootType);
    }

    const assoc = handleAssociation(attribute, rootType);
    if (assoc) return assoc;

    // Fallback for polymorphic relations
    if (rootType === 'mutation') {
      return attribute.model ? 'ID' : '[ID]';
    }
    return attribute.model ? 'Morph' : '[Morph]';
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
   * Add custom scalar type such as JSON.
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
   */
  addPolymorphicUnionType(definition) {
    const types = graphql
      .parse(definition)
      .definitions.filter(
        (def) => def.kind === 'ObjectTypeDefinition' && def.name.value !== 'Query'
      )
      .map((def) => def.name.value);

    if (!types.length) {
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

    const buildFields = (action) =>
      Object.keys(model.attributes)
        .filter((attr) => isTypeAttributeEnabled(model, attr))
        .map((attr) => {
          const type = this.convertType({
            attribute: model.attributes[attr],
            modelName: globalId,
            attributeName: attr,
            rootType: 'mutation',
            action,
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
```