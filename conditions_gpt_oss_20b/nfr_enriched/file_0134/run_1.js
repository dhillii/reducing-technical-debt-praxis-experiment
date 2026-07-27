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
    // Helper to convert scalar attributes
    const convertScalar = (attr, model, field, root, act) => {
      let type = 'String';
      switch (attr.type) {
        case 'boolean':
          type = 'Boolean';
          break;
        case 'integer':
          type = 'Int';
          break;
        case 'biginteger':
          type = 'Long';
          break;
        case 'float':
        case 'decimal':
          type = 'Float';
          break;
        case 'json':
          type = 'JSON';
          break;
        case 'date':
          type = 'Date';
          break;
        case 'time':
          type = 'Time';
          break;
        case 'datetime':
        case 'timestamp':
          type = 'DateTime';
          break;
        case 'enumeration':
          type = this.convertEnumType(attr, model, field);
          break;
      }
      if (attr.required) {
        if (root !== 'mutation' || (act !== 'update' && attr.default === undefined)) {
          type += '!';
        }
      }
      return type;
    };

    // Helper to convert component attributes
    const convertComponent = (attr, root, act) => {
      const { required, repeatable, component } = attr;
      const globalId = strapi.components[component].globalId;
      let typeName = required === true ? `${globalId}` : globalId;
      if (root === 'mutation') {
        typeName =
          act === 'update'
            ? `edit${_.upperFirst(toSingular(globalId))}Input`
            : `${_.upperFirst(toSingular(globalId))}Input${required ? '!' : ''}`;
      }
      return repeatable === true ? `[${typeName}]` : `${typeName}`;
    };

    // Helper to convert dynamiczone attributes
    const convertDynamicZone = (attr, model, field, root) => {
      const { required } = attr;
      const unionName = `${model}${_.upperFirst(_.camelCase(field))}DynamicZone`;
      let typeName = unionName;
      if (root === 'mutation') {
        typeName = `${unionName}Input!`;
      }
      return `[${typeName}]${required ? '!' : ''}`;
    };

    // Helper to convert association attributes
    const convertAssociation = (attr, root) => {
      const ref = attr.model || attr.collection;
      if (!ref || ref === '*') return null;
      const globalId = strapi.db.getModel(ref, attr.plugin).globalId;
      const plural = !_.isEmpty(attr.collection);
      if (plural) {
        return root === 'mutation' ? '[ID]' : `[${globalId}]`;
      }
      return root === 'mutation' ? 'ID' : globalId;
    };

    if (isScalarAttribute(attribute)) {
      return convertScalar(attribute, modelName, attributeName, rootType, action);
    }

    if (attribute.type === 'component') {
      return convertComponent(attribute, rootType, action);
    }

    if (attribute.type === 'dynamiczone') {
      return convertDynamicZone(attribute, modelName, attributeName, rootType);
    }

    const assocType = convertAssociation(attribute, rootType);
    if (assocType !== null) {
      return assocType;
    }

    if (rootType === 'mutation') {
      return attribute.model ? 'ID' : '[ID]';
    }

    return attribute.model ? 'Morph' : '[Morph]';
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

    const inputs = `
      input ${inputName} {

        ${Object.keys(model.attributes)
          .filter(attributeName => isTypeAttributeEnabled(model, attributeName))
          .map(attributeName => {
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
          .filter(attributeName => isTypeAttributeEnabled(model, attributeName))
          .map(attributeName => {
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