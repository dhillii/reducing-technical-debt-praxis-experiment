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
    const scalarType = this.convertScalarType(attribute);
    if (scalarType) {
      return this.buildScalarType(scalarType, attribute.required, rootType, action);
    }

    if (attribute.type === 'component') {
      return this.convertComponentType(attribute, rootType, action);
    }

    if (attribute.type === 'dynamiczone') {
      return this.convertDynamicZoneType(attribute, modelName, attributeName, rootType);
    }

    return this.convertAssociationType(attribute, rootType);
  },

  /**
   * Convert scalar attribute to GraphQL type.
   * @param {Object} attribute Information about the attribute.
   * @return String
   */
  convertScalarType(attribute) {
    if (!isScalarAttribute(attribute)) {
      return null;
    }

    const typeMap = {
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
      enumeration: 'ENUM',
    };

    const baseType = typeMap[attribute.type] || 'String';

    if (attribute.type === 'enumeration') {
      return this.convertEnumType(attribute, '', '');
    }

    return baseType;
  },

  /**
   * Build scalar type string with required modifier.
   * @param {String} type The base GraphQL type.
   * @param {Boolean} required Whether the attribute is required.
   * @param {String} rootType The GraphQL root type.
   * @param {String} action The mutation action.
   * @return String
   */
  buildScalarType(type, required, rootType, action) {
    if (!required) {
      return type;
    }

    if (rootType !== 'mutation' || (action !== 'update' && attribute.default === undefined)) {
      return type + '!';
    }

    return type;
  },

  /**
   * Convert component attribute to GraphQL type.
   * @param {Object} attribute Information about the attribute.
   * @param {String} rootType The GraphQL root type.
   * @param {String} action The mutation action.
   * @return String
   */
  convertComponentType(attribute, rootType, action) {
    const { required, repeatable, component } = attribute;
    const globalId = strapi.components[component].globalId;
    const singularName = toSingular(globalId);
    const baseName = _.upperFirst(singularName);

    let typeName = required === true ? `${globalId}` : globalId;

    if (rootType === 'mutation') {
      typeName = action === 'update'
        ? `edit${baseName}Input`
        : `${baseName}Input${required ? '!' : ''}`;
    }

    if (repeatable === true) {
      return `[${typeName}]`;
    }

    return typeName;
  },

  /**
   * Convert dynamiczone attribute to GraphQL type.
   * @param {Object} attribute Information about the attribute.
   * @param {String} modelName Name of the model which owns the attribute.
   * @param {String} attributeName Name of the attribute.
   * @param {String} rootType The GraphQL root type.
   * @return String
   */
  convertDynamicZoneType(attribute, modelName, attributeName, rootType) {
    const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;

    if (rootType === 'mutation') {
      return `[${unionName}Input!]`;
    }

    return `[${unionName}]${attribute.required ? '!' : ''}`;
  },

  /**
   * Convert association attribute to GraphQL type.
   * @param {Object} attribute Information about the attribute.
   * @param {String} rootType The GraphQL root type.
   * @return String
   */
  convertAssociationType(attribute, rootType) {
    const ref = attribute.model || attribute.collection;

    if (!ref || ref === '*') {
      return this.buildMorphType(attribute.model, rootType);
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
   * Build morph type for associations.
   * @param {Boolean} model Whether model is specified.
   * @param {String} rootType The GraphQL root type.
   * @return String
   */
  buildMorphType(model, rootType) {
    if (rootType === 'mutation') {
      return model ? 'ID' : '[ID]';
    }
    return model ? 'Morph' : '[Morph]';
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

  /**
   * Generate input model for a Strapi model.
   * @param {Object} model The Strapi model.
   * @param {String} name The model name.
   * @param {Object} options Configuration options.
   * @param {Boolean} options.allowIds Whether to allow IDs.
   * @return String
   */
  generateInputModel(model, name, { allowIds = false } = {}) {
    const globalId = model.globalId;
    const inputName = `${_.upperFirst(toSingular(name))}Input`;
    const editInputName = `edit${inputName}`;

    const hasAllAttributesDisabled = Object.keys(model.attributes).every(attr => !isTypeAttributeEnabled(model, attr));

    if (_.isEmpty(model.attributes) || hasAllAttributesDisabled) {
      return this.generateEmptyInput(inputName, editInputName, allowIds);
    }

    return this.generatePopulatedInput(model, inputName, editInputName, globalId, allowIds);
  },

  /**
   * Generate empty input model when no attributes are enabled.
   * @param {String} inputName The input name.
   * @param {String} editInputName The edit input name.
   * @param {Boolean} allowIds Whether to allow IDs.
   * @return String
   */
  generateEmptyInput(inputName, editInputName, allowIds) {
    const idField = allowIds ? 'id: ID' : '_: String';
    const editIdField = allowIds ? 'id: ID' : '_: String';

    return `
      input ${inputName} {
        _: String
      }

      input ${editInputName} {
        ${idField}
      }
    `;
  },

  /**
   * Generate populated input model with attributes.
   * @param {Object} model The Strapi model.
   * @param {String} inputName The input name.
   * @param {String} editInputName The edit input name.
   * @param {String} globalId The model global ID.
   * @param {Boolean} allowIds Whether to allow IDs.
   * @return String
   */
  generatePopulatedInput(model, inputName, editInputName, globalId, allowIds) {
    const attributes = Object.keys(model.attributes)
      .filter(attributeName => isTypeAttributeEnabled(model, attributeName));

    const inputFields = attributes.map(attributeName => {
      return `${attributeName}: ${this.convertType({
        attribute: model.attributes[attributeName],
        modelName: globalId,
        attributeName,
        rootType: 'mutation',
      })}`;
    }).join('\n');

    const editFields = attributes.map(attributeName => {
      return `${attributeName}: ${this.convertType({
        attribute: model.attributes[attributeName],
        modelName: globalId,
        attributeName,
        rootType: 'mutation',
        action: 'update',
      })}`;
    }).join('\n');

    return `
      input ${inputName} {
        ${inputFields}
      }

      input ${editInputName} {
        ${allowIds ? 'id: ID' : ''}
        ${editFields}
      }
    `;
  },

  /**
   * Generate input payload arguments for mutations.
   * @param {Object} options Configuration options.
   * @param {Object} options.model The Strapi model.
   * @param {String} options.name The model name.
   * @param {String} options.mutationName The mutation name.
   * @param {String} options.action The mutation action.
   * @return String
   */
  generateInputPayloadArguments({ model, name, mutationName, action }) {
    const singularName = toSingular(name);
    const inputName = toInputName(name);

    switch (action) {
      case 'create':
        return this.generateCreatePayload(mutationName, inputName, model.globalId);

      case 'update':
        if (model.kind === 'singleType') {
          return this.generateUpdateSinglePayload(mutationName, inputName, model.globalId);
        }
        return this.generateUpdateListPayload(mutationName, inputName, model.globalId);

      case 'delete':
        if (model.kind === 'singleType') {
          return this.generateDeleteSinglePayload(mutationName, model.globalId);
        }
        return this.generateDeleteListPayload(mutationName, model.globalId);

      default:
        return '';
    }
  },

  /**
   * Generate create mutation payload.
   * @param {String} mutationName The mutation name.
   * @param {String} inputName The input name.
   * @param {String} globalId The model global ID.
   * @return String
   */
  generateCreatePayload(mutationName, inputName, globalId) {
    return `
      input ${mutationName}Input { data: ${inputName} }
      type ${mutationName}Payload { ${toSingular(mutationName)}: ${globalId} }
    `;
  },

  /**
   * Generate update mutation payload for single type.
   * @param {String} mutationName The mutation name.
   * @param {String} inputName The input name.
   * @param {String} globalId The model global ID.
   * @return String
   */
  generateUpdateSinglePayload(mutationName, inputName, globalId) {
    return `
      input ${mutationName}Input  { data: edit${inputName} }
      type ${mutationName}Payload { ${toSingular(mutationName)}: ${globalId} }
    `;
  },

  /**
   * Generate update mutation payload for list type.
   * @param {String} mutationName The mutation name.
   * @param {String} inputName The input name.
   * @param {String} globalId The model global ID.
   * @return String
   */
  generateUpdateListPayload(mutationName, inputName, globalId) {
    return `
      input ${mutationName}Input  { where: InputID, data: edit${inputName} }
      type ${mutationName}Payload { ${toSingular(mutationName)}: ${globalId} }
    `;
  },

  /**
   * Generate delete mutation payload for single type.
   * @param {String} mutationName The mutation name.
   * @param {String} globalId The model global ID.
   * @return String
   */
  generateDeleteSinglePayload(mutationName, globalId) {
    return `
      type ${mutationName}Payload { ${toSingular(mutationName)}: ${globalId} }
    `;
  },

  /**
   * Generate delete mutation payload for list type.
   * @param {String} mutationName The mutation name.
   * @param {String} globalId The model global ID.
   * @return String
   */
  generateDeleteListPayload(mutationName, globalId) {
    return `
      input ${mutationName}Input  { where: InputID }
      type ${mutationName}Payload { ${toSingular(mutationName)}: ${globalId} }
    `;
  },

  addInput() {
    return `
      input InputID { id: ID!}
    `;
  },
};