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

// ============================================================================
// Constants
// ============================================================================

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

const SCALAR_TYPES = new Set(['component', 'dynamiczone']);

const SCALARS = {
  JSON: GraphQLJSON,
  DateTime: GraphQLDateTime,
  Time,
  Date: GraphQLDate,
  Long: GraphQLLong,
  Upload: GraphQLUpload,
};

// ============================================================================
// Utility Functions
// ============================================================================

const isScalarAttribute = ({ type }) => type && !SCALAR_TYPES.has(type);

const isTypeAttributeEnabled = (model, attr) =>
  _.get(strapi.plugins.graphql, `config._schema.graphql.type.${model.globalId}.${attr}`) !== false;

const shouldAddRequiredModifier = (attribute, rootType, action) =>
  attribute.required && (rootType !== 'mutation' || (action !== 'update' && attribute.default === undefined));

const getScalarType = (type) => SCALAR_TYPE_MAP[type] || 'String';

// ============================================================================
// Type Conversion Functions
// ============================================================================

const convertScalarType = (attribute, modelName, attributeName) => {
  let type = getScalarType(attribute.type);

  if (attribute.type === 'enumeration') {
    type = convertEnumType(attribute, modelName, attributeName);
  }

  if (shouldAddRequiredModifier(attribute, 'query', '')) {
    type += '!';
  }

  return type;
};

const convertComponentType = (attribute, rootType, action) => {
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

const convertDynamicZoneType = (attribute, modelName, attributeName, rootType) => {
  const { required } = attribute;
  const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
  const typeName = rootType === 'mutation' ? `${unionName}Input!` : unionName;

  return `[${typeName}]${required ? '!' : ''}`;
};

const convertAssociationType = (attribute, rootType) => {
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

const convertEnumType = (definition, model, field) =>
  definition.enumName || `ENUM_${model.toUpperCase()}_${field.toUpperCase()}`;

// ============================================================================
// Input Generation Functions
// ============================================================================

const getEnabledAttributes = (model) =>
  Object.keys(model.attributes).filter(attr => isTypeAttributeEnabled(model, attr));

const generateAttributeField = (attributeName, attribute, globalId, rootType, action = '') =>
  `${attributeName}: ${convertType({
    attribute,
    modelName: globalId,
    attributeName,
    rootType,
    action,
  })}`;

const generateInputFields = (model, rootType, action = '') => {
  const enabledAttributes = getEnabledAttributes(model);

  return enabledAttributes
    .map(attributeName =>
      generateAttributeField(
        attributeName,
        model.attributes[attributeName],
        model.globalId,
        rootType,
        action
      )
    )
    .join('\n');
};

const generateEmptyInput = (inputName, allowIds = false) => `
  input ${inputName} {
    _: String
  }

  input edit${inputName} {
    ${allowIds ? 'id: ID' : '_: String'}
  }
`;

const generateFullInput = (inputName, model, allowIds = false) => `
  input ${inputName} {
    ${generateInputFields(model, 'mutation')}
  }

  input edit${inputName} {
    ${allowIds ? 'id: ID' : ''}
    ${generateInputFields(model, 'mutation', 'update')}
  }
`;

// ============================================================================
// Mutation Payload Functions
// ============================================================================

const MUTATION_TEMPLATES = {
  create: (mutationName, inputName, singularName, globalId) => `
    input ${mutationName}Input { data: ${inputName} }
    type ${mutationName}Payload { ${singularName}: ${globalId} }
  `,
  updateSingleType: (mutationName, inputName, singularName, globalId) => `
    input ${mutationName}Input { data: edit${inputName} }
    type ${mutationName}Payload { ${singularName}: ${globalId} }
  `,
  updateCollectionType: (mutationName, inputName, singularName, globalId) => `
    input ${mutationName}Input { where: InputID, data: edit${inputName} }
    type ${mutationName}Payload { ${singularName}: ${globalId} }
  `,
  deleteSingleType: (mutationName, singularName, globalId) => `
    type ${mutationName}Payload { ${singularName}: ${globalId} }
  `,
  deleteCollectionType: (mutationName, singularName, globalId) => `
    input ${mutationName}Input { where: InputID }
    type ${mutationName}Payload { ${singularName}: ${globalId} }
  `,
};

const generateMutationPayload = (action, mutationName, inputName, singularName, globalId, kind) => {
  if (action === 'create') {
    return MUTATION_TEMPLATES.create(mutationName, inputName, singularName, globalId);
  }

  if (action === 'update') {
    return kind === 'singleType'
      ? MUTATION_TEMPLATES.updateSingleType(mutationName, inputName, singularName, globalId)
      : MUTATION_TEMPLATES.updateCollectionType(mutationName, inputName, singularName, globalId);
  }

  if (action === 'delete') {
    return kind === 'singleType'
      ? MUTATION_TEMPLATES.deleteSingleType(mutationName, singularName, globalId)
      : MUTATION_TEMPLATES.deleteCollectionType(mutationName, singularName, globalId);
  }

  return '';
};

// ============================================================================
// Main Conversion Function
// ============================================================================

const convertType = ({
  attribute = {},
  modelName = '',
  attributeName = '',
  rootType = 'query',
  action = '',
}) => {
  if (isScalarAttribute(attribute)) {
    return convertScalarType(attribute, modelName, attributeName);
  }

  if (attribute.type === 'component') {
    return convertComponentType(attribute, rootType, action);
  }

  if (attribute.type === 'dynamiczone') {
    return convertDynamicZoneType(attribute, modelName, attributeName, rootType);
  }

  return convertAssociationType(attribute, rootType);
};

// ============================================================================
// Module Exports
// ============================================================================

module.exports = {
  convertType,

  convertEnumType,

  getScalars() {
    return SCALARS;
  },

  addPolymorphicUnionType(definition) {
    const types = graphql
      .parse(definition)
      .definitions.filter(
        def => def.kind === 'ObjectTypeDefinition' && def.name.value !== 'Query'
      )
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
    const inputName = `${_.upperFirst(toSingular(name))}Input`;
    const enabledAttributes = getEnabledAttributes(model);

    if (_.isEmpty(model.attributes) || enabledAttributes.length === 0) {
      return generateEmptyInput(inputName, allowIds);
    }

    return generateFullInput(inputName, model, allowIds);
  },

  generateInputPayloadArguments({ model, name, mutationName, action }) {
    const singularName = toSingular(name);
    const inputName = toInputName(name);

    return generateMutationPayload(action, mutationName, inputName, singularName, model.globalId, model.kind);
  },
};
```