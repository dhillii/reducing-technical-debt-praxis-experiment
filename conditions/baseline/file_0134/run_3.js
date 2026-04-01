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

const shouldAddRequiredFlag = (attribute, rootType, action) => {
  if (!attribute.required) return false;
  if (rootType !== 'mutation') return true;
  return action !== 'update' && attribute.default === undefined;
};

const convertScalarType = function(attribute, rootType, action) {
  let type = attribute.type === 'enumeration'
    ? this.convertEnumType(attribute, attribute.modelName, attribute.attributeName)
    : getScalarType(attribute.type);

  if (shouldAddRequiredFlag(attribute, rootType, action)) {
    type += '!';
  }

  return type;
};

const convertComponentType = function(attribute, rootType, action) {
  const { required, repeatable, component } = attribute;
  const globalId = strapi.components[component].globalId;
  
  let typeName = globalId;

  if (rootType === 'mutation') {
    const singularName = _.upperFirst(toSingular(globalId));
    typeName = action === 'update'
      ? `edit${singularName}Input`
      : `${singularName}Input${required ? '!' : ''}`;
  }

  return repeatable ? `[${typeName}]` : typeName;
};

const convertDynamicZoneType = function(attribute, modelName, attributeName, rootType) {
  const { required } = attribute;
  const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
  const typeName = rootType === 'mutation' ? `${unionName}Input!` : unionName;

  return `[${typeName}]${required ? '!' : ''}`;
};

const convertAssociationType = function(attribute, rootType) {
  const ref = attribute.model || attribute.collection;

  if (!ref || ref === '*') {
    return rootType === 'mutation'
      ? (attribute.model ? 'ID' : '[ID]')
      : (attribute.model ? 'Morph' : '[Morph]');
  }

  const globalId = strapi.db.getModel(ref, attribute.plugin).globalId;
  const isPlural = !_.isEmpty(attribute.collection);

  if (isPlural) {
    return rootType === 'mutation' ? '[ID]' : `[${globalId}]`;
  }

  return rootType === 'mutation' ? 'ID' : globalId;
};

module.exports = {
  convertType({
    attribute = {},
    modelName = '',
    attributeName = '',
    rootType = 'query',
    action = '',
  }) {
    if (isScalarAttribute(attribute)) {
      return convertScalarType.call(
        { convertEnumType: this.convertEnumType, ...attribute, modelName, attributeName },
        attribute,
        rootType,
        action
      );
    }

    if (attribute.type === 'component') {
      return convertComponentType.call(this, attribute, rootType, action);
    }

    if (attribute.type === 'dynamiczone') {
      return convertDynamicZoneType.call(this, attribute, modelName, attributeName, rootType);
    }

    return convertAssociationType.call(this, attribute, rootType);
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

    const buildAttributeFields = (action) => {
      return Object.keys(model.attributes)
        .filter(attributeName => isTypeAttributeEnabled(model, attributeName))
        .map(attributeName => {
          const type = this.convertType({
            attribute: model.attributes[attributeName],
            modelName: globalId,
            attributeName,
            rootType: 'mutation',
            action,
          });
          return `${attributeName}: ${type}`;
        })
        .join('\n');
    };

    const inputs = `
      input ${inputName} {
        ${buildAttributeFields('')}
      }

      input edit${inputName} {
        ${allowIds ? 'id: ID' : ''}
        ${buildAttributeFields('update')}
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
          input ${mutationName}Input { ${whereClause}data: edit${inputName} }
          ${payloadType}
        `;
      case 'delete':
        const deleteInput = kind === 'singleType'
          ? ''
          : `input ${mutationName}Input { where: InputID }`;
        return `
          ${deleteInput}
          ${payloadType}
        `;
      default:
        return '';
    }
  },
};
```