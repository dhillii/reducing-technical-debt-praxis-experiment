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

const getScalarType = (attributeType) => SCALAR_TYPE_MAP[attributeType] || 'String';

const shouldAddRequiredModifier = (attribute, rootType, action) => {
  if (!attribute.required) return false;
  if (rootType !== 'mutation') return true;
  return action !== 'update' && attribute.default === undefined;
};

const convertScalarType = function(attribute, modelName, attributeName) {
  let type = getScalarType(attribute.type);

  if (attribute.type === 'enumeration') {
    type = this.convertEnumType(attribute, modelName, attributeName);
  }

  if (shouldAddRequiredModifier(attribute, 'query', '')) {
    type += '!';
  }

  return type;
};

const convertComponentType = function(attribute, rootType, action) {
  const { required, repeatable, component } = attribute;
  const globalId = strapi.components[component].globalId;

  if (rootType === 'mutation') {
    const singularGlobalId = _.upperFirst(toSingular(globalId));
    const typeName = action === 'update'
      ? `edit${singularGlobalId}Input`
      : `${singularGlobalId}Input${required ? '!' : ''}`;
    return repeatable ? `[${typeName}]` : typeName;
  }

  const typeName = required ? globalId : globalId;
  return repeatable ? `[${typeName}]` : typeName;
};

const convertDynamicZoneType = function(attribute, modelName, attributeName, rootType) {
  const { required } = attribute;
  const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;

  if (rootType === 'mutation') {
    return `[${unionName}Input!]${required ? '!' : ''}`;
  }

  return `[${unionName}]${required ? '!' : ''}`;
};

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
      return convertScalarType.call(this, attribute, modelName, attributeName);
    }

    if (attribute.type === 'component') {
      return convertComponentType.call(this, attribute, rootType, action);
    }

    if (attribute.type === 'dynamiczone') {
      return convertDynamicZoneType.call(this, attribute, modelName, attributeName, rootType);
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

    const editInputFields = enabledAttributes
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
        ${editInputFields}
      }
    `;

    return inputs;
  },

  generateInputPayloadArguments({ model, name, mutationName, action }) {
    const singularName = toSingular(name);
    const inputName = toInputName(name);
    const { kind } = model;

    const payloadType = `type ${mutationName}Payload { ${singularName}: ${model.globalId} }`;

    switch (action) {
      case 'create':
        return `
          input ${mutationName}Input { data: ${inputName} }
          ${payloadType}
        `;
      case 'update':
        const whereClause = kind === 'singleType' ? '' : 'where: InputID, ';
        return `
          input ${mutationName}Input  { ${whereClause}data: edit${inputName} }
          ${payloadType}
        `;
      case 'delete':
        if (kind === 'singleType') {
          return `
          ${payloadType}
        `;
        }
        return `
          input ${mutationName}Input  { where: InputID }
          ${payloadType}
        `;
      default:
        return '';
    }
  },
};