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
  convertType({
    attribute = {},
    modelName = '',
    attributeName = '',
    rootType = 'query',
    action = '',
  }) {
    if (!attribute) return '';

    if (isScalarAttribute(attribute)) {
      return this._convertScalar(attribute, rootType, action);
    }

    if (attribute.type === 'component') {
      return this._convertComponent(attribute, rootType, action);
    }

    if (attribute.type === 'dynamiczone') {
      return this._convertDynamicZone(attribute, modelName, rootType);
    }

    return this._convertAssociation(attribute, rootType, action);
  },

  _convertScalar(attribute, rootType, action) {
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

    let type = typeMap[attribute.type] || 'String';

    if (attribute.type === 'enumeration') {
      type = this.convertEnumType(attribute, attribute.modelName, attribute.attributeName);
    }

    if (attribute.required) {
      if (rootType !== 'mutation' || (action !== 'update' && attribute.default === undefined)) {
        type += '!';
      }
    }

    return type;
  },

  _convertComponent(attribute, rootType, action) {
    const { required, repeatable, component } = attribute;
    const globalId = strapi.components[component].globalId;
    let typeName = required ? `${globalId}` : globalId;

    if (rootType === 'mutation') {
      const base = _.upperFirst(toSingular(globalId));
      typeName = action === 'update'
        ? `edit${base}Input`
        : `${base}Input${required ? '!' : ''}`;
    }

    return repeatable ? `[${typeName}]` : typeName;
  },

  _convertDynamicZone(attribute, modelName, rootType) {
    const { required } = attribute;
    const unionName = `${modelName}${_.upperFirst(_.camelCase(attribute.attributeName))}DynamicZone`;
    const typeName = rootType === 'mutation' ? `${unionName}Input!` : unionName;
    return `[${typeName}]${required ? '!' : ''}`;
  },

  _convertAssociation(attribute, rootType, action) {
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
        return '';
    }
  },
};