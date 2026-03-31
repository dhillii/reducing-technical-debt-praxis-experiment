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

// Constants
const SCALAR_TYPES = {
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

const SCALAR_DEFINITIONS = {
  JSON: GraphQLJSON,
  DateTime: GraphQLDateTime,
  Time,
  Date: GraphQLDate,
  Long: GraphQLLong,
  Upload: GraphQLUpload,
};

const NON_SCALAR_TYPES = ['component', 'dynamiczone'];

// Utility functions
const isScalarAttribute = ({ type }) => type && !NON_SCALAR_TYPES.includes(type);

const isTypeAttributeEnabled = (model, attr) =>
  _.get(strapi.plugins.graphql, `config._schema.graphql.type.${model.globalId}.${attr}`) !== false;

const shouldAddRequiredModifier = (attribute, rootType, action) =>
  attribute.required && (rootType !== 'mutation' || (action !== 'update' && attribute.default === undefined));

const getScalarType = (attribute) => SCALAR_TYPES[attribute.type] || 'String';

const getComponentTypeName = (globalId, required, rootType, action) => {
  if (rootType === 'mutation') {
    return action === 'update'
      ? `edit${_.upperFirst(toSingular(globalId))}Input`
      : `${_.upperFirst(toSingular(globalId))}Input${required ? '!' : ''}`;
  }
  return globalId;
};

const formatTypeWithRequired = (type, required) => (required ? `${type}!` : type);

const formatTypeWithBrackets = (type, repeatable) => (repeatable ? `[${type}]` : type);

const getAssociationTypeName = (ref, attribute, rootType) => {
  const globalId = strapi.db.getModel(ref, attribute.plugin).globalId;
  const isPlural = !_.isEmpty(attribute.collection);

  if (rootType === 'mutation') {
    return isPlural ? '[ID]' : 'ID';
  }

  return isPlural ? `[${globalId}]` : globalId;
};

const getMorphTypeName = (attribute, rootType) => {
  if (rootType === 'mutation') {
    return attribute.model ? 'ID' : '[ID]';
  }
  return attribute.model ? 'Morph' : '[Morph]';
};

const filterEnabledAttributes = (model) =>
  Object.keys(model.attributes).filter(attr => isTypeAttributeEnabled(model, attr));

const buildAttributeField = (attributeName, attribute, globalId, rootType, action = '') =>
  `${attributeName}: ${module.exports.convertType({
    attribute,
    modelName: globalId,
    attributeName,
    rootType,
    action,
  })}`;

const hasAllAttributesDisabled = (model) =>
  Object.keys(model.attributes).every(attr => !isTypeAttributeEnabled(model, attr));

const buildInputFields = (model, globalId, rootType, action = '') => {
  const enabledAttributes = filterEnabledAttributes(model);
  return enabledAttributes
    .map(attr => buildAttributeField(attr, model.attributes[attr], globalId, rootType, action))
    .join('\n');
};

const buildEmptyInput = (inputName, allowIds) => `
  input ${inputName} {
    _: String
  }

  input edit${inputName} {
    ${allowIds ? 'id: ID' : '_: String'}
  }
`;

const buildFullInput = (inputName, model, globalId, allowIds) => `
  input ${inputName} {
    ${buildInputFields(model, globalId, 'mutation')}
  }

  input edit${inputName} {
    ${allowIds ? 'id: ID' : ''}
    ${buildInputFields(model, globalId, 'mutation', 'update')}
  }
`;

const getMutationPayloadForCreate = (mutationName, singularName, globalId) => `
  input ${mutationName}Input { data: ${toInputName(singularName)} }
  type ${mutationName}Payload { ${singularName}: ${globalId} }
`;

const getMutationPayloadForUpdate = (mutationName, singularName, globalId, kind) => {
  const inputName = toInputName(singularName);
  const whereClause = kind === 'singleType' ? '' : 'where: InputID, ';
  return `
    input ${mutationName}Input { ${whereClause}data: edit${inputName} }
    type ${mutationName}Payload { ${singularName}: ${globalId} }
  `;
};

const getMutationPayloadForDelete = (mutationName, singularName, globalId, kind) => {
  const inputClause = kind === 'singleType' ? '' : `input ${mutationName}Input { where: InputID }`;
  return `
    ${inputClause}
    type ${mutationName}Payload { ${singularName}: ${globalId} }
  `;
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
      let type = attribute.type === 'enumeration'
        ? this.convertEnumType(attribute, modelName, attributeName)
        : getScalarType(attribute);

      if (shouldAddRequiredModifier(attribute, rootType, action)) {
        type += '!';
      }

      return type;
    }

    if (attribute.type === 'component') {
      const { required, repeatable, component } = attribute;
      const globalId = strapi.components[component].globalId;
      const typeName = getComponentTypeName(globalId, required, rootType, action);
      return formatTypeWithBrackets(typeName, repeatable);
    }

    if (attribute.type === 'dynamiczone') {
      const { required } = attribute;
      const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
      const typeName = rootType === 'mutation' ? `${unionName}Input!` : unionName;
      return formatTypeWithRequired(`[${typeName}]`, required);
    }

    const ref = attribute.model || attribute.collection;

    if (ref && ref !== '*') {
      return getAssociationTypeName(ref, attribute, rootType);
    }

    return getMorphTypeName(attribute, rootType);
  },

  convertEnumType(definition, model, field) {
    return definition.enumName || `ENUM_${model.toUpperCase()}_${field.toUpperCase()}`;
  },

  getScalars() {
    return SCALAR_DEFINITIONS;
  },

  addPolymorphicUnionType(definition) {
    const types = graphql
      .parse(definition)
      .definitions.filter(def => def.kind === 'ObjectTypeDefinition' && def.name.value !== 'Query')
      .map(def => def.name.value);

    if (types.length === 0) {
      return { definition: '', resolvers: {} };
    }

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
  },

  addInput() {
    return 'input InputID { id: ID! }';
  },

  generateInputModel(model, name, { allowIds = false } = {}) {
    const globalId = model.globalId;
    const inputName = `${_.upperFirst(toSingular(name))}Input`;

    if (_.isEmpty(model.attributes) || hasAllAttributesDisabled(model)) {
      return buildEmptyInput(inputName, allowIds);
    }

    return buildFullInput(inputName, model, globalId, allowIds);
  },

  generateInputPayloadArguments({ model, name, mutationName, action }) {
    const singularName = toSingular(name);
    const { kind } = model;

    switch (action) {
      case 'create':
        return getMutationPayloadForCreate(mutationName, singularName, model.globalId);
      case 'update':
        return getMutationPayloadForUpdate(mutationName, singularName, model.globalId, kind);
      case 'delete':
        return getMutationPayloadForDelete(mutationName, singularName, model.globalId, kind);
      default:
        return '';
    }
  },
};
```