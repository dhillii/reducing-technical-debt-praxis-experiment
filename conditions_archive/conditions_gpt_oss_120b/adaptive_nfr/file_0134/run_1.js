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
 * Map scalar Strapi types to GraphQL types.
 * @type {Object<string,string>}
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
 * Resolve required flag for scalar types.
 * @param {string} gqlType
 * @param {Object} attribute
 * @param {string} rootType
 * @param {string} action
 * @returns {string}
 */
function applyRequired(gqlType, attribute, rootType, action) {
  if (!attribute.required) return gqlType;
  if (rootType !== 'mutation' || (action !== 'update' && attribute.default === undefined)) {
    return `${gqlType}!`;
  }
  return gqlType;
}

/**
 * Resolve scalar attribute GraphQL type.
 * @param {Object} opts
 * @returns {string}
 */
function resolveScalar({ attribute, rootType, action }) {
  const baseType = SCALAR_TYPE_MAP[attribute.type] || 'String';
  if (attribute.type === 'enumeration') {
    return this.convertEnumType(attribute, opts.modelName, opts.attributeName);
  }
  return applyRequired(baseType, attribute, rootType, action);
}

/**
 * Resolve component attribute GraphQL type.
 * @param {Object} opts
 * @returns {string}
 */
function resolveComponent({ attribute, modelName, rootType, action }) {
  const { required, repeatable, component } = attribute;
  const globalId = strapi.components[component].globalId;
  let typeName = required === true ? `${globalId}` : globalId;

  if (rootType === 'mutation') {
    typeName =
      action === 'update'
        ? `edit${_.upperFirst(toSingular(globalId))}Input`
        : `${_.upperFirst(toSingular(globalId))}Input${required ? '!' : ''}`;
  }

  if (repeatable) {
    return `[${typeName}]`;
  }
  return `${typeName}`;
}

/**
 * Resolve dynamic zone attribute GraphQL type.
 * @param {Object} opts
 * @returns {string}
 */
function resolveDynamicZone({ attribute, modelName, attributeName, rootType }) {
  const { required } = attribute;
  const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
  let typeName = unionName;

  if (rootType === 'mutation') {
    typeName = `${unionName}Input!`;
  }

  return `[${typeName}]${required ? '!' : ''}`;
}

/**
 * Resolve association attribute GraphQL type.
 * @param {Object} opts
 * @returns {string}
 */
function resolveAssociation({ attribute, rootType }) {
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
 * Resolve fallback type for non‑association attributes.
 * @param {Object} attribute
 * @param {string} rootType
 * @returns {string}
 */
function resolveFallback(attribute, rootType) {
  if (rootType === 'mutation') {
    return attribute.model ? 'ID' : '[ID]';
  }
  return attribute.model ? 'Morph' : '[Morph]';
}

module.exports = {
  /**
   * Convert Strapi type to GraphQL type.
   * @param {Object} params
   * @param {Object} params.attribute
   * @param {string} params.modelName
   * @param {string} params.attributeName
   * @param {string} [params.rootType='query']
   * @param {string} [params.action='']
   * @returns {string}
   */
  convertType({
    attribute = {},
    modelName = '',
    attributeName = '',
    rootType = 'query',
    action = '',
  }) {
    if (isScalarAttribute(attribute)) {
      return resolveScalar.call(this, {
        attribute,
        modelName,
        attributeName,
        rootType,
        action,
      });
    }

    if (attribute.type === 'component') {
      return resolveComponent({
        attribute,
        modelName,
        rootType,
        action,
      });
    }

    if (attribute.type === 'dynamiczone') {
      return resolveDynamicZone({
        attribute,
        modelName,
        attributeName,
        rootType,
      });
    }

    const associationType = resolveAssociation({ attribute, rootType });
    if (associationType) {
      return associationType;
    }

    return resolveFallback(attribute, rootType);
  },

  /**
   * Convert Strapi enumeration to GraphQL Enum.
   * @param {Object} definition Definition of the attribute.
   * @param {string} model Name of the model which owns the attribute.
   * @param {string} field Name of the attribute.
   * @returns {string}
   */
  convertEnumType(definition, model, field) {
    return definition.enumName
      ? definition.enumName
      : `ENUM_${model.toUpperCase()}_${field.toUpperCase()}`;
  },

  /**
   * Add custom scalar type such as JSON.
   *
   * @returns {Object}
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
   * @param {string} definition GraphQL schema definition.
   * @returns {{definition:string,resolvers:Object}}
   */
  addPolymorphicUnionType(definition) {
    const types = graphql
      .parse(definition)
      .definitions.filter(
        (def) => def.kind === 'ObjectTypeDefinition' && def.name.value !== 'Query'
      )
      .map((def) => def.name.value);

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

    const inputs = `
      input ${inputName} {

        ${Object.keys(model.attributes)
          .filter((attributeName) => isTypeAttributeEnabled(model, attributeName))
          .map((attributeName) => {
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
          .filter((attributeName) => isTypeAttributeEnabled(model, attributeName))
          .map((attributeName) => {
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
  },
};
```