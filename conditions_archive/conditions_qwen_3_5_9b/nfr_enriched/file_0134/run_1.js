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
   * @param {String} rootType GraphQL root type (query, mutation).
   * @param {String} action Mutation action (create, update, delete).
   * @return String
   */

  convertType({
    attribute = {},
    modelName = '',
    attributeName = '',
    rootType = 'query',
    action = '',
  }) {
    const scalarType = this._convertScalarType(attribute);
    if (scalarType) {
      return this._applyScalarModifiers(scalarType, attribute, rootType);
    }

    if (attribute.type === 'component') {
      return this._convertComponentType(attribute, rootType);
    }

    if (attribute.type === 'dynamiczone') {
      return this._convertDynamicZoneType(attribute, rootType);
    }

    return this._convertAssociationType(attribute, rootType);
  },

  /**
   * Convert scalar attribute to GraphQL type.
   * @param {Object} attribute Information about the attribute.
   * @return String
   */
  _convertScalarType(attribute) {
    if (!isScalarAttribute(attribute)) {
      return null;
    }

    let type = 'String';

    switch (attribute.type) {
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
        type = this.convertEnumType(attribute, '', '');
        break;
      default:
        break;
    }

    return type;
  },

  /**
   * Apply required modifiers to scalar type.
   * @param {String} type GraphQL type name.
   * @param {Object} attribute Attribute information.
   * @param {String} rootType GraphQL root type.
   * @return String
   */
  _applyScalarModifiers(type, attribute, rootType) {
    if (!attribute.required) {
      return type;
    }

    if (rootType !== 'mutation' || (attribute.default !== undefined)) {
      return type + '!';
    }

    return type;
  },

  /**
   * Convert component attribute to GraphQL type.
   * @param {Object} attribute Component attribute information.
   * @param {String} rootType GraphQL root type.
   * @return String
   */
  _convertComponentType(attribute, rootType) {
    const { required, repeatable, component } = attribute;
    const globalId = strapi.components[component].globalId;
    const singularName = toSingular(globalId);
    const upperFirstSingular = _.upperFirst(singularName);

    let typeName = required === true ? `${globalId}` : globalId;

    if (rootType === 'mutation') {
      typeName = action === 'update'
        ? `edit${upperFirstSingular}Input`
        : `${upperFirstSingular}Input${required ? '!' : ''}`;
    }

    if (repeatable === true) {
      return `[${typeName}]`;
    }

    return typeName;
  },

  /**
   * Convert dynamiczone attribute to GraphQL type.
   * @param {Object} attribute Dynamiczone attribute information.
   * @param {String} rootType GraphQL root type.
   * @return String
   */
  _convertDynamicZoneType(attribute, rootType) {
    const { required } = attribute;
    const modelName = attribute.modelName || '';
    const unionName = `${modelName}${_.upperFirst(_.camelCase(attribute.attributeName))}DynamicZone`;

    let typeName = unionName;

    if (rootType === 'mutation') {
      typeName = `${unionName}Input!`;
    }

    return `[${typeName}]${required ? '!' : ''}`;
  },

  /**
   * Convert association attribute to GraphQL type.
   * @param {Object} attribute Association attribute information.
   * @param {String} rootType GraphQL root type.
   * @return String
   */
  _convertAssociationType(attribute, rootType) {
    const ref = attribute.model || attribute.collection;

    if (!ref || ref === '*') {
      return this._getMorphType(attribute, rootType);
    }

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
  },

  /**
   * Get morph type for unassociated attributes.
   * @param {Object} attribute Attribute information.
   * @param {String} rootType GraphQL root type.
   * @return String
   */
  _getMorphType(attribute, rootType) {
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

  /**
   * Generate input model for a Strapi model.
   * @param {Object} model Strapi model object.
   * @param {String} name Model name.
   * @param {Object} options Generation options.
   * @param {Boolean} options.allowIds Allow ID field in input.
   * @return String
   */
  generateInputModel(model, name, { allowIds = false } = {}) {
    const globalId = model.globalId;
    const inputName = `${_.upperFirst(toSingular(name))}Input`;
    const hasAllAttributesDisabled = Object.keys(model.attributes).every(attr => !isTypeAttributeEnabled(model, attr));

    if (_.isEmpty(model.attributes) || hasAllAttributesDisabled) {
      return this._generateEmptyInput(inputName, allowIds);
    }

    return this._generateFullInput(model, globalId, inputName, allowIds);
  },

  /**
   * Generate empty input model when no attributes are enabled.
   * @param {String} inputName Input model name.
   * @param {Boolean} allowIds Allow ID field in input.
   * @return String
   */
  _generateEmptyInput(inputName, allowIds) {
    const idField = allowIds ? 'id: ID' : '_: String';
    return `
      input ${inputName} {
        _: String
      }

      input edit${inputName} {
        ${idField}
      }
    `;
  },

  /**
   * Generate full input model with all enabled attributes.
   * @param {Object} model Strapi model object.
   * @param {String} globalId Model global ID.
   * @param {String} inputName Input model name.
   * @param {Boolean} allowIds Allow ID field in input.
   * @return String
   */
  _generateFullInput(model, globalId, inputName, allowIds) {
    const createAttributes = this._getEnabledAttributes(model);
    const updateAttributes = this._getEnabledAttributes(model);

    const createFields = createAttributes.map(attrName => {
      return `${attrName}: ${this.convertType({
        attribute: model.attributes[attrName],
        modelName: globalId,
        attributeName: attrName,
        rootType: 'mutation',
      })}`;
    }).join('\n');

    const updateFields = updateAttributes.map(attrName => {
      return `${attrName}: ${this.convertType({
        attribute: model.attributes[attrName],
        modelName: globalId,
        attributeName: attrName,
        rootType: 'mutation',
        action: 'update',
      })}`;
    }).join('\n');

    return `
      input ${inputName} {
        ${createFields}
      }

      input edit${inputName} {
        ${allowIds ? 'id: ID' : ''}
        ${updateFields}
      }
    `;
  },

  /**
   * Get list of enabled attribute names for a model.
   * @param {Object} model Strapi model object.
   * @return Array
   */
  _getEnabledAttributes(model) {
    return Object.keys(model.attributes)
      .filter(attributeName => isTypeAttributeEnabled(model, attributeName));
  },

  /**
   * Generate input payload arguments for mutations.
   * @param {Object} options Mutation options.
   * @param {Object} options.model Strapi model object.
   * @param {String} options.name Model name.
   * @param {String} options.mutationName Mutation name.
   * @param {String} options.action Mutation action.
   * @return String
   */
  generateInputPayloadArguments({ model, name, mutationName, action }) {
    const singularName = toSingular(name);
    const inputName = toInputName(name);

    const { kind } = model;

    switch (action) {
      case 'create':
        return this._generateCreatePayload(mutationName, inputName, singularName, model.globalId);
      case 'update':
        return this._generateUpdatePayload(mutationName, inputName, singularName, model.globalId, kind);
      case 'delete':
        return this._generateDeletePayload(mutationName, inputName, singularName, model.globalId, kind);
      default:
        return '';
    }
  },

  /**
   * Generate create mutation payload.
   * @param {String} mutationName Mutation name.
   * @param {String} inputName Input model name.
   * @param {String} singularName Singular model name.
   * @param {String} globalId Model global ID.
   * @return String
   */
  _generateCreatePayload(mutationName, inputName, singularName, globalId) {
    return `
      input ${mutationName}Input { data: ${inputName} }
      type ${mutationName}Payload { ${singularName}: ${globalId} }
    `;
  },

  /**
   * Generate update mutation payload.
   * @param {String} mutationName Mutation name.
   * @param {String} inputName Input model name.
   * @param {String} singularName Singular model name.
   * @param {String} globalId Model global ID.
   * @param {String} kind Model kind.
   * @return String
   */
  _generateUpdatePayload(mutationName, inputName, singularName, globalId, kind) {
    if (kind === 'singleType') {
      return `
        input ${mutationName}Input  { data: edit${inputName} }
        type ${mutationName}Payload { ${singularName}: ${globalId} }
      `;
    }

    return `
      input ${mutationName}Input  { where: InputID, data: edit${inputName} }
      type ${mutationName}Payload { ${singularName}: ${globalId} }
    `;
  },

  /**
   * Generate delete mutation payload.
   * @param {String} mutationName Mutation name.
   * @param {String} inputName Input model name.
   * @param {String} singularName Singular model name.
   * @param {String} globalId Model global ID.
   * @param {String} kind Model kind.
   * @return String
   */
  _generateDeletePayload(mutationName, inputName, singularName, globalId, kind) {
    if (kind === 'singleType') {
      return `
        type ${mutationName}Payload { ${singularName}: ${globalId} }
      `;
    }

    return `
      input ${mutationName}Input  { where: InputID }
      type ${mutationName}Payload { ${singularName}: ${globalId} }
    `;
  },
};