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
// Constants & Helpers
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

const isScalarAttribute = ({ type }) => type && !SCALAR_TYPES.has(type);

const isTypeAttributeEnabled = (model, attr) =>
  _.get(strapi.plugins.graphql, `config._schema.graphql.type.${model.globalId}.${attr}`) !== false;

// ============================================================================
// Type Conversion
// ============================================================================

const getScalarType = (attributeType) => SCALAR_TYPE_MAP[attributeType] || 'String';

const applyRequiredModifier = (type, attribute, rootType, action) => {
  if (!attribute.required) return type;
  if (rootType === 'mutation' && action === 'update' && attribute.default === undefined) return type;
  if (rootType === 'mutation' && action !== 'update') return type;
  return `${type}!`;
};

const convertScalarType = (attribute, modelName, attributeName, rootType, action) => {
  let type = getScalarType(attribute.type);

  if (attribute.type === 'enumeration') {
    type = convertEnumType(attribute, modelName, attributeName);
  }

  return applyRequiredModifier(type, attribute, rootType, action);
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

const convertEnumType = (definition, model, field) => {
  return definition.enumName || `ENUM_${model.toUpperCase()}_${field.toUpperCase()}`;
};

// ============================================================================
// Input Generation
// ============================================================================

const buildAttributeField = (attributeName, attribute, globalId, rootType, action = '') => {
  const type = convertType({
    attribute,
    modelName: globalId,
    attributeName,
    rootType,
    action,
  });
  return `${attributeName}: ${type}`;
};

const getEnabledAttributes = (model) =>
  Object.keys(model.attributes).filter(attr => isTypeAttributeEnabled(model, attr));

const buildInputFields = (model, globalId, allowIds = false, isEdit = false) => {
  const attributes = getEnabledAttributes(model);

  if (attributes.length === 0) {
    return allowIds && isEdit ? 'id: ID' : '_: String';
  }

  const fields = attributes
    .map(attributeName =>
      buildAttributeField(
        attributeName,
        model.attributes[attributeName],
        globalId,
        'mutation',
        isEdit ? 'update' : ''
      )
    )
    .join('\n');

  return isEdit && allowIds ? `id: ID\n${fields}` : fields;
};

// ============================================================================
// Mutation Payload Generation
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

const generateMutationPayload = (action, kind, mutationName, inputName, singularName, globalId) => {
  if (action === 'create') {
    return MUTATION_TEMPLATES.create(mutationName, inputName, singularName, globalId);
  }

  if (action === 'update') {
    const template = kind === 'singleType'
      ? MUTATION_TEMPLATES.updateSingleType
      : MUTATION_TEMPLATES.updateCollectionType;
    return template(mutationName, inputName, singularName, globalId);
  }

  if (action === 'delete') {
    const template = kind === 'singleType'
      ? MUTATION_TEMPLATES.deleteSingleType
      : MUTATION_TEMPLATES.deleteCollectionType;
    return template(mutationName, singularName, globalId);
  }

  return '';
};

// ============================================================================
// Public API
// ============================================================================

const convertType = ({
  attribute = {},
  modelName = '',
  attributeName = '',
  rootType = 'query',
  action = '',
}) => {
  if (isScalarAttribute(attribute)) {
    return convertScalarType(attribute, modelName, attributeName, rootType, action);
  }

  if (attribute.type === 'component') {
    return convertComponentType(attribute, rootType, action);
  }

  if (attribute.type === 'dynamiczone') {
    return convertDynamicZoneType(attribute, modelName, attributeName, rootType);
  }

  return convertAssociationType(attribute, rootType);
};

module.exports = {
  convertType,

  convertEnumType,

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
    const hasAllAttributesDisabled = getEnabledAttributes(model).length === 0;

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

    const createFields = buildInputFields(model, globalId, false, false);
    const editFields = buildInputFields(model, globalId, allowIds, true);

    return `
      input ${inputName} {
        ${createFields}
      }

      input edit${inputName} {
        ${editFields}
      }
    `;
  },

  generateInputPayloadArguments({ model, name, mutationName, action }) {
    const singularName = toSingular(name);
    const inputName = toInputName(name);

    return generateMutationPayload(action, model.kind, mutationName, inputName, singularName, model.globalId);
  },
};
```