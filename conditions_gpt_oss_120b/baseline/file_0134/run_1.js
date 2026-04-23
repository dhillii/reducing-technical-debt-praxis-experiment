'use strict';

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
  convertType({ attribute = {}, modelName = '', attributeName = '', rootType = 'query', action = '' }) {
    if (isScalarAttribute(attribute)) {
      return this._convertScalar(attribute, rootType, action);
    }

    if (attribute.type === 'component') {
      return this._convertComponent(attribute, modelName, rootType, action);
    }

    if (attribute.type === 'dynamiczone') {
      return this._convertDynamicZone(attribute, modelName, attributeName, rootType);
    }

    const ref = attribute.model || attribute.collection;
    if (ref && ref !== '*') {
      return this._convertAssociation(attribute, ref, rootType);
    }

    if (rootType === 'mutation') {
      return attribute.model ? 'ID' : '[ID]';
    }

    return attribute.model ? 'Morph' : '[Morph]';
  },

  _convertScalar(attribute, rootType, action) {
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
        type = this.convertEnumType(attribute, attribute.modelName, attribute.attributeName);
        break;
    }

    if (attribute.required) {
      if (rootType !== 'mutation' || (action !== 'update' && attribute.default === undefined)) {
        type += '!';
      }
    }

    return type;
  },

  _convertComponent(attribute, modelName, rootType, action) {
    const { required, repeatable, component } = attribute;
    const globalId = strapi.components[component].globalId;

    let typeName = required ? `${globalId}` : globalId;

    if (rootType === 'mutation') {
      typeName =
        action === 'update'
          ? `edit${_.upperFirst(toSingular(globalId))}Input`
          : `${_.upperFirst(toSingular(globalId))}Input${required ? '!' : ''}`;
    }

    return repeatable ? `[${typeName}]` : `${typeName}`;
  },

  _convertDynamicZone(attribute, modelName, attributeName, rootType) {
    const { required } = attribute;
    const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;

    let typeName = unionName;
    if (rootType === 'mutation') {
      typeName = `${unionName}Input!`;
    }

    return `[${typeName}]${required ? '!' : ''}`;
  },

  _convertAssociation(attribute, ref, rootType) {
    const globalId = strapi.db.getModel(ref, attribute.plugin).globalId;
    const plural = !!attribute.collection && !_.isEmpty(attribute.collection);

    if (plural) {
      return rootType === 'mutation' ? '[ID]' : `[${globalId}]`;
    }

    return rootType === 'mutation' ? 'ID' : globalId;
  },

  convertEnumType(definition, model, field) {
    return definition.enumName
      ? definition.enumName
      : `ENUM_${model.toUpperCase()}_${field.toUpperCase()}`;
  },

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

    return { definition: '', resolvers: {} };
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

    const enabledAttrs = Object.keys(model.attributes).filter((attr) =>
      isTypeAttributeEnabled(model, attr)
    );

    const inputFields = enabledAttrs
      .map((attributeName) => {
        const typeStr = this.convertType({
          attribute: model.attributes[attributeName],
          modelName: globalId,
          attributeName,
          rootType: 'mutation',
        });
        return `${attributeName}: ${typeStr}`;
      })
      .join('\n');

    const editFields = enabledAttrs
      .map((attributeName) => {
        const typeStr = this.convertType({
          attribute: model.attributes[attributeName],
          modelName: globalId,
          attributeName,
          rootType: 'mutation',
          action: 'update',
        });
        return `${attributeName}: ${typeStr}`;
      })
      .join('\n');

    return `
      input ${inputName} {
        ${inputFields}
      }

      input edit${inputName} {
        ${allowIds ? 'id: ID' : ''}
        ${editFields}
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