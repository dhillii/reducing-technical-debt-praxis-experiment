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

// Type mapping for scalar attributes
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

class TypeConverter {
  /**
   * Convert scalar attribute type to GraphQL type
   */
  convertScalarType(attribute) {
    let type = SCALAR_TYPE_MAP[attribute.type] || 'String';

    if (attribute.type === 'enumeration') {
      type = this.convertEnumType(attribute, attribute.modelName, attribute.attributeName);
    }

    return type;
  }

  /**
   * Apply required modifier to type
   */
  applyRequiredModifier(type, attribute, rootType, action) {
    if (!attribute.required) return type;

    const isUpdateMutation = rootType === 'mutation' && action === 'update';
    const hasDefault = attribute.default !== undefined;

    if (isUpdateMutation && hasDefault) return type;
    if (rootType === 'mutation' && action === 'update') return type;

    return `${type}!`;
  }

  /**
   * Convert component attribute to GraphQL type
   */
  convertComponentType(attribute, rootType, action) {
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
  }

  /**
   * Convert dynamic zone attribute to GraphQL type
   */
  convertDynamicZoneType(attribute, modelName, attributeName, rootType) {
    const { required } = attribute;
    const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
    const typeName = rootType === 'mutation' ? `${unionName}Input!` : unionName;

    return `[${typeName}]${required ? '!' : ''}`;
  }

  /**
   * Convert association/relation attribute to GraphQL type
   */
  convertAssociationType(attribute, rootType) {
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
  }

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
      let type = this.convertScalarType(attribute);
      return this.applyRequiredModifier(type, attribute, rootType, action);
    }

    if (attribute.type === 'component') {
      return this.convertComponentType(attribute, rootType, action);
    }

    if (attribute.type === 'dynamiczone') {
      return this.convertDynamicZoneType(attribute, modelName, attributeName, rootType);
    }

    return this.convertAssociationType(attribute, rootType);
  }

  /**
   * Convert Strapi enumeration to GraphQL Enum.
   * @param {Object} definition Definition of the attribute.
   * @param {String} model Name of the model which owns the attribute.
   * @param {String} field Name of the attribute.
   * @return String
   */
  convertEnumType(definition, model, field) {
    return definition.enumName || `ENUM_${model.toUpperCase()}_${field.toUpperCase()}`;
  }

  /**
   * Add custom scalar type such as JSON.
   * @return Object
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
  }

  /**
   * Add Union Type that contains the types defined by the user.
   * @return Object
   */
  addPolymorphicUnionType(definition) {
    const types = graphql
      .parse(definition)
      .definitions
      .filter(def => def.kind === 'ObjectTypeDefinition' && def.name.value !== 'Query')
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
  }

  /**
   * Add input type for ID
   * @return String
   */
  addInput() {
    return 'input InputID { id: ID!}';
  }

  /**
   * Generate input field for attribute
   */
  generateInputField(attributeName, attribute, globalId, action) {
    const type = this.convertType({
      attribute,
      modelName: globalId,
      attributeName,
      rootType: 'mutation',
      action,
    });

    return `${attributeName}: ${type}`;
  }

  /**
   * Generate input model types
   */
  generateInputModel(model, name, { allowIds = false } = {}) {
    const globalId = model.globalId;
    const inputName = `${_.upperFirst(toSingular(name))}Input`;
    const enabledAttributes = Object.keys(model.attributes)
      .filter(attr => isTypeAttributeEnabled(model, attr));

    if (_.isEmpty(model.attributes) || enabledAttributes.length === 0) {
      return `
      input ${inputName} {
        _: String
      }

      input edit${inputName} {
        ${allowIds ? 'id: ID' : '_: String'}
      }
     `;
    }

    const createFields = enabledAttributes
      .map(attr => this.generateInputField(attr, model.attributes[attr], globalId, 'create'))
      .join('\n');

    const updateFields = enabledAttributes
      .map(attr => this.generateInputField(attr, model.attributes[attr], globalId, 'update'))
      .join('\n');

    return `
      input ${inputName} {
        ${createFields}
      }

      input edit${inputName} {
        ${allowIds ? 'id: ID' : ''}
        ${updateFields}
      }
    `;
  }

  /**
   * Generate mutation input and payload types
   */
  generateInputPayloadArguments({ model, name, mutationName, action }) {
    const singularName = toSingular(name);
    const inputName = toInputName(name);
    const { kind } = model;

    const payloadType = `type ${mutationName}Payload { ${singularName}: ${model.globalId} }`;

    switch (action) {
      case 'create':
        return `input ${mutationName}Input { data: ${inputName} }\n${payloadType}`;

      case 'update':
        const updateInput = kind === 'singleType'
          ? `input ${mutationName}Input { data: edit${inputName} }`
          : `input ${mutationName}Input { where: InputID, data: edit${inputName} }`;
        return `${updateInput}\n${payloadType}`;

      case 'delete':
        const deleteInput = kind === 'singleType'
          ? ''
          : `input ${mutationName}Input { where: InputID }`;
        return deleteInput ? `${deleteInput}\n${payloadType}` : payloadType;

      default:
        return '';
    }
  }
}

module.exports = new TypeConverter();
```