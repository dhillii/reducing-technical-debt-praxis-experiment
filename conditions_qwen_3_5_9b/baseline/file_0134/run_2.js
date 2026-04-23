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
    const { type, required, default: defaultValue } = attribute;

    if (isScalarAttribute(attribute)) {
      let graphqlType = this.getScalarType(type);

      if (required) {
        const isMutation = rootType === 'mutation';
        const isUpdateAction = action === 'update';
        const hasDefault = defaultValue !== undefined;

        if (!isMutation || !isUpdateAction || !hasDefault) {
          graphqlType += '!';
        }
      }

      return graphqlType;
    }

    if (type === 'component') {
      const { required: isRequired, repeatable } = attribute;
      const globalId = strapi.components[attribute.component].globalId;
      const singularName = toSingular(globalId);
      const upperFirstSingular = _.upperFirst(singularName);

      let typeName = isRequired ? globalId : globalId;

      if (rootType === 'mutation') {
        const isUpdate = action === 'update';
        const inputName = isUpdate ? `edit${upperFirstSingular}` : upperFirstSingular;
        typeName = `${inputName}Input${isRequired ? '!' : ''}`;
      }

      return repeatable ? `[${typeName}]` : typeName;
    }

    if (type === 'dynamiczone') {
      const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
      const isMutation = rootType === 'mutation';
      const typeName = isMutation ? `${unionName}Input!` : unionName;

      return `[${typeName}]${attribute.required ? '!' : ''}`;
    }

    const ref = attribute.model || attribute.collection;

    if (ref && ref !== '*') {
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
    }

    if (rootType === 'mutation') {
      return attribute.model ? 'ID' : '[ID]';
    }

    return attribute.model ? 'Morph' : '[Morph]';
  },

  getScalarType(type) {
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
    };

    return typeMap[type] || 'String';
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
    const editInputName = `edit${inputName}`;
    const hasAllAttributesDisabled = Object.keys(model.attributes).every(attr => !isTypeAttributeEnabled(model, attr));

    if (_.isEmpty(model.attributes) || hasAllAttributesDisabled) {
      return `
      input ${inputName} {
        _: String
      }

      input ${editInputName} {
        ${allowIds ? 'id: ID' : '_: String'}
      }
     `;
    }

    const enabledAttributes = Object.keys(model.attributes).filter(attributeName => isTypeAttributeEnabled(model, attributeName));

    const createInputFields = enabledAttributes.map(attributeName => {
      return `${attributeName}: ${this.convertType({
        attribute: model.attributes[attributeName],
        modelName: globalId,
        attributeName,
        rootType: 'mutation',
      })}`;
    }).join('\n');

    const updateInputFields = enabledAttributes.map(attributeName => {
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
        ${createInputFields}
      }

      input ${editInputName} {
        ${allowIds ? 'id: ID' : ''}
        ${updateInputFields}
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