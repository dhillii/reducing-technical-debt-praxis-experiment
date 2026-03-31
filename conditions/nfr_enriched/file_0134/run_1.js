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
const SCALAR_TYPE_MAPPING = {
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

const SCALAR_TYPES = {
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

const getScalarType = (attributeType) => SCALAR_TYPE_MAPPING[attributeType] || 'String';

const shouldAddRequiredModifier = (attribute, rootType, action) =>
  attribute.required && (rootType !== 'mutation' || (action !== 'update' && attribute.default === undefined));

const getComponentTypeName = (globalId, required, rootType, action) => {
  if (rootType === 'mutation') {
    return action === 'update'
      ? `edit${_.upperFirst(toSingular(globalId))}Input`
      : `${_.upperFirst(toSingular(globalId))}Input${required ? '!' : ''}`;
  }
  return globalId;
};

const getDynamicZoneTypeName = (modelName, attributeName, rootType) => {
  const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
  return rootType === 'mutation' ? `${unionName}Input!` : unionName;
};

const getAssociationType = (attribute, ref, rootType) => {
  if (ref === '*') return null;

  const globalId = strapi.db.getModel(ref, attribute.plugin).globalId;
  const isPlural = !_.isEmpty(attribute.collection);

  if (isPlural) {
    return rootType === 'mutation' ? '[ID]' : `[${globalId}]`;
  }

  return rootType === 'mutation' ? 'ID' : globalId;
};

const getMorphType = (attribute, rootType) => {
  return attribute.model ? (rootType === 'mutation' ? 'ID' : 'Morph') : (rootType === 'mutation' ? '[ID]' : '[Morph]');
};

// Type conversion handlers
const typeConverters = {
  scalar: (attribute, rootType, action) => {
    let type = getScalarType(attribute.type);

    if (attribute.type === 'enumeration') {
      type = module.exports.convertEnumType(attribute, '', '');
    }

    if (shouldAddRequiredModifier(attribute, rootType, action)) {
      type += '!';
    }

    return type;
  },

  component: (attribute, rootType) => {
    const { required, repeatable, component } = attribute;
    const globalId = strapi.components[component].globalId;
    const typeName = getComponentTypeName(globalId, required, rootType, '');

    return repeatable ? `[${typeName}]` : typeName;
  },

  dynamiczone: (attribute, modelName, attributeName, rootType) => {
    const { required } = attribute;
    const typeName = getDynamicZoneTypeName(modelName, attributeName, rootType);
    return `[${typeName}]${required ? '!' : ''}`;
  },

  association: (attribute, rootType) => {
    const ref = attribute.model || attribute.collection;
    const associationType = getAssociationType(attribute, ref, rootType);
    return associationType || getMorphType(attribute, rootType);
  },
};

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
    if (isScalarAttribute(attribute)) {
      return typeConverters.scalar(attribute, rootType, action);
    }

    if (attribute.type === 'component') {
      return typeConverters.component(attribute, rootType);
    }

    if (attribute.type === 'dynamiczone') {
      return typeConverters.dynamiczone(attribute, modelName, attributeName, rootType);
    }

    return typeConverters.association(attribute, rootType);
  },

  /**
   * Convert Strapi enumeration to GraphQL Enum.
   * @param {Object} definition Definition of the attribute.
   * @param {String} model Name of the model which owns the attribute.
   * @param {String} field Name of the attribute.
   * @return String
   */
  convertEnumType(definition, model, field) {
    return definition.enumName || `ENUM_${model.toUpperCase()}_${field.toUpperCase()}`;
  },

  /**
   * Add custom scalar type such as JSON.
   * @return Object
   */
  getScalars() {
    return SCALAR_TYPES;
  },

  /**
   * Add Union Type that contains the types defined by the user.
   * @return Object
   */
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
    return 'input InputID { id: ID!}';
  },

  /**
   * Generate input model for mutations.
   * @param {Object} model The model definition.
   * @param {String} name The model name.
   * @param {Object} options Configuration options.
   * @return String
   */
  generateInputModel(model, name, { allowIds = false } = {}) {
    const globalId = model.globalId;
    const inputName = `${_.upperFirst(toSingular(name))}Input`;
    const hasAllAttributesDisabled = Object.keys(model.attributes).every(
      attr => !isTypeAttributeEnabled(model, attr)
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

    const enabledAttributes = Object.keys(model.attributes).filter(
      attributeName => isTypeAttributeEnabled(model, attributeName)
    );

    const generateInputFields = (action = '') => {
      return enabledAttributes
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

    return `
      input ${inputName} {
        ${generateInputFields()}
      }

      input edit${inputName} {
        ${allowIds ? 'id: ID' : ''}
        ${generateInputFields('update')}
      }
    `;
  },

  /**
   * Generate input payload arguments for mutations.
   * @param {Object} params Configuration parameters.
   * @return String
   */
  generateInputPayloadArguments({ model, name, mutationName, action }) {
    const singularName = toSingular(name);
    const inputName = toInputName(name);
    const { kind } = model;

    const payloadType = `type ${mutationName}Payload { ${singularName}: ${model.globalId} }`;

    const mutationPayloads = {
      create: `input ${mutationName}Input { data: ${inputName} }`,
      update: kind === 'singleType'
        ? `input ${mutationName}Input { data: edit${inputName} }`
        : `input ${mutationName}Input { where: InputID, data: edit${inputName} }`,
      delete: kind === 'singleType'
        ? ''
        : `input ${mutationName}Input { where: InputID }`,
    };

    const inputDef = mutationPayloads[action];
    return inputDef ? `${inputDef}\n${payloadType}` : payloadType;
  },
};
```