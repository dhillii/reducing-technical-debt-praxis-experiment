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
    const mapScalar = (attr, mName, aName, rType, act) => {
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
      let type = typeMap[attr.type] || 'String';
      if (attr.type === 'enumeration') {
        type = this.convertEnumType(attr, mName, aName);
      }
      if (
        attr.required &&
        (rType !== 'mutation' || (act !== 'update' && attr.default === undefined))
      ) {
        type += '!';
      }
      return type;
    };

    const handleComponent = (attr, rType, act) => {
      const { required, repeatable, component } = attr;
      const globalId = strapi.components[component].globalId;
      let typeName = required ? globalId : globalId;
      if (rType === 'mutation') {
        const base = _.upperFirst(toSingular(globalId));
        typeName =
          act === 'update'
            ? `edit${base}Input`
            : `${base}Input${required ? '!' : ''}`;
      }
      return repeatable ? `[${typeName}]` : typeName;
    };

    const handleDynamicZone = (attr, mName, aName, rType) => {
      const { required } = attr;
      const unionName = `${mName}${_.upperFirst(_.camelCase(aName))}DynamicZone`;
      let typeName = unionName;
      if (rType === 'mutation') {
        typeName = `${unionName}Input!`;
      }
      return `[${typeName}]${required ? '!' : ''}`;
    };

    const handleAssociation = (attr, rType) => {
      const ref = attr.model || attr.collection;
      const globalId = strapi.db.getModel(ref, attr.plugin).globalId;
      const plural = !_.isEmpty(attr.collection);
      if (plural) {
        return rType === 'mutation' ? '[ID]' : `[${globalId}]`;
      }
      return rType === 'mutation' ? 'ID' : globalId;
    };

    const fallback = (attr, rType) => {
      if (rType === 'mutation') {
        return attr.model ? 'ID' : '[ID]';
      }
      return attr.model ? 'Morph' : '[Morph]';
    };

    if (isScalarAttribute(attribute)) {
      return mapScalar(attribute, modelName, attributeName, rootType, action);
    }

    if (attribute.type === 'component') {
      return handleComponent(attribute, rootType, action);
    }

    if (attribute.type === 'dynamiczone') {
      return handleDynamicZone(attribute, modelName, attributeName, rootType);
    }

    const ref = attribute.model || attribute.collection;
    if (ref && ref !== '*') {
      return handleAssociation(attribute, rootType);
    }

    return fallback(attribute, rootType);
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