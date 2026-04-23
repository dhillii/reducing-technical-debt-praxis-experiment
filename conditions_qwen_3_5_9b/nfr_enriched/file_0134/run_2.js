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
    const scalarType = this.getScalarType(attribute);
    if (scalarType) {
      return this.buildScalarType(scalarType, attribute.required, rootType, action);
    }

    if (attribute.type === 'component') {
      return this.buildComponentType(attribute, rootType, action);
    }

    if (attribute.type === 'dynamiczone') {
      return this.buildDynamicZoneType(attribute, modelName, attributeName, rootType);
    }

    return this.buildAssociationType(attribute, rootType);
  },

  getScalarType(attribute) {
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

    const baseType = typeMap[attribute.type];
    if (!baseType) {
      return 'String';
    }

    if (attribute.type === 'enumeration') {
      return this.convertEnumType(attribute, attribute.modelName, attribute.attributeName);
    }

    return baseType;
  },

  buildScalarType(type, required, rootType, action) {
    let finalType = type;

    if (required) {
      if (rootType !== 'mutation' || (action !== 'update' && attribute.default === undefined)) {
        finalType += '!';
      }
    }

    return finalType;
  },

  buildComponentType(attribute, rootType, action) {
    const { required, repeatable, component } = attribute;
    const globalId = strapi.components[component].globalId;
    let typeName = required === true ? `${globalId}` : globalId;

    if (rootType === 'mutation') {
      typeName =
        action === 'update'
          ? `edit${_.upperFirst(toSingular(globalId))}Input`
          : `${_.upperFirst(toSingular(globalId))}Input${required ? '!' : ''}`;
    }

    if (repeatable === true) {
      return `[${typeName}]`;
    }
    return `${typeName}`;
  },

  buildDynamicZoneType(attribute, modelName, attributeName, rootType) {
    const { required } = attribute;
    const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
    let typeName = unionName;

    if (rootType === 'mutation') {
      typeName = `${unionName}Input!`;
    }

    return `[${typeName}]${required ? '!' : ''}`;
  },

  buildAssociationType(attribute, rootType) {
    const ref = attribute.model || attribute.collection;

    if (!ref || ref === '*') {
      if (rootType === 'mutation') {
        return attribute.model ? 'ID' : '[ID]';
      }
      return attribute.model ? 'Morph' : '[Morph]';
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
      return this.generateEmptyInput(inputName, allowIds);
    }

    return this.generatePopulatedInput(model, inputName, globalId, allowIds);
  },

  generateEmptyInput(inputName, allowIds) {
    return `
      input ${inputName} {
        _: String
      }

      input edit${inputName} {
        ${allowIds ? 'id: ID' : '_: String'}
      }
     `;
  },

  generatePopulatedInput(model, inputName, globalId, allowIds) {
    const attributes = Object.keys(model.attributes)
      .filter(attributeName => isTypeAttributeEnabled(model, attributeName));

    const createFields = attributes.map(attributeName => {
      return `${attributeName}: ${this.convertType({
        attribute: model.attributes[attributeName],
        modelName: globalId,
        attributeName,
        rootType: 'mutation',
      })}`;
    });

    const updateFields = attributes.map(attributeName => {
      return `${attributeName}: ${this.convertType({
        attribute: model.attributes[attributeName],
        modelName: globalId,
        attributeName,
        rootType: 'mutation',
        action: 'update',
      })}`;
    });

    return `
      input ${inputName} {
        ${createFields.join('\n')}
      }

      input edit${inputName} {
        ${allowIds ? 'id: ID' : ''}
        ${updateFields.join('\n')}
      }
    `;
  },

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