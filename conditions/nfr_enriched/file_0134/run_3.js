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
      return this._convertScalarType(attribute, rootType, action);
    }

    if (attribute.type === 'component') {
      return this._convertComponentType(attribute, rootType, action);
    }

    if (attribute.type === 'dynamiczone') {
      return this._convertDynamicZoneType(attribute, modelName, attributeName, rootType);
    }

    return this._convertAssociationType(attribute, rootType);
  },

  /**
   * Convert scalar attribute to GraphQL type.
   * @private
   */
  _convertScalarType(attribute, rootType, action) {
    let type = this._mapScalarType(attribute.type);

    if (attribute.required) {
      if (rootType !== 'mutation' || (action !== 'update' && attribute.default === undefined)) {
        type += '!';
      }
    }

    return type;
  },

  /**
   * Map Strapi scalar type to GraphQL scalar type name.
   * @private
   */
  _mapScalarType(scalarType) {
    const scalarTypeMap = {
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

    return scalarTypeMap[scalarType] || 'String';
  },

  /**
   * Convert component attribute to GraphQL type.
   * @private
   */
  _convertComponentType(attribute, rootType, action) {
    const { required, repeatable, component } = attribute;
    const globalId = strapi.components[component].globalId;

    let typeName = this._buildComponentTypeName(globalId, required, rootType, action);

    if (repeatable === true) {
      return `[${typeName}]`;
    }

    return typeName;
  },

  /**
   * Build component type name based on context.
   * @private
   */
  _buildComponentTypeName(globalId, required, rootType, action) {
    if (rootType === 'mutation') {
      const singularName = _.upperFirst(toSingular(globalId));
      return action === 'update'
        ? `edit${singularName}Input`
        : `${singularName}Input${required ? '!' : ''}`;
    }

    return required === true ? globalId : globalId;
  },

  /**
   * Convert dynamic zone attribute to GraphQL type.
   * @private
   */
  _convertDynamicZoneType(attribute, modelName, attributeName, rootType) {
    const { required } = attribute;
    const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;

    let typeName = unionName;

    if (rootType === 'mutation') {
      typeName = `${unionName}Input!`;
    }

    return `[${typeName}]${required ? '!' : ''}`;
  },

  /**
   * Convert association attribute to GraphQL type.
   * @private
   */
  _convertAssociationType(attribute, rootType) {
    const ref = attribute.model || attribute.collection;

    if (ref && ref !== '*') {
      return this._convertRelationshipType(attribute, ref, rootType);
    }

    return this._convertPolymorphicType(attribute, rootType);
  },

  /**
   * Convert relationship type to GraphQL type.
   * @private
   */
  _convertRelationshipType(attribute, ref, rootType) {
    const globalId = strapi.db.getModel(ref, attribute.plugin).globalId;
    const isPlural = !_.isEmpty(attribute.collection);

    if (isPlural) {
      return rootType === 'mutation' ? '[ID]' : `[${globalId}]`;
    }

    return rootType === 'mutation' ? 'ID' : globalId;
  },

  /**
   * Convert polymorphic type to GraphQL type.
   * @private
   */
  _convertPolymorphicType(attribute, rootType) {
    if (rootType === 'mutation') {
      return attribute.model ? 'ID' : '[ID]';
    }

    return attribute.model ? 'Morph' : '[Morph]';
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
    const types = this._extractObjectTypeNames(definition);

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

  /**
   * Extract object type names from GraphQL definition.
   * @private
   */
  _extractObjectTypeNames(definition) {
    return graphql
      .parse(definition)
      .definitions.filter(def => def.kind === 'ObjectTypeDefinition' && def.name.value !== 'Query')
      .map(def => def.name.value);
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
      return this._generateEmptyInputModel(inputName, allowIds);
    }

    return this._generatePopulatedInputModel(model, inputName, globalId, allowIds);
  },

  /**
   * Generate input model for empty or fully disabled attributes.
   * @private
   */
  _generateEmptyInputModel(inputName, allowIds) {
    return `
      input ${inputName} {
        _: String
      }

      input edit${inputName} {
        ${allowIds ? 'id: ID' : '_: String'}
      }
     `;
  },

  /**
   * Generate input model with enabled attributes.
   * @private
   */
  _generatePopulatedInputModel(model, inputName, globalId, allowIds) {
    const enabledAttributes = Object.keys(model.attributes).filter(attr =>
      isTypeAttributeEnabled(model, attr)
    );

    const createInputFields = this._buildInputFields(
      model,
      globalId,
      enabledAttributes,
      'mutation'
    );

    const updateInputFields = this._buildInputFields(
      model,
      globalId,
      enabledAttributes,
      'mutation',
      'update'
    );

    return `
      input ${inputName} {
        ${createInputFields}
      }

      input edit${inputName} {
        ${allowIds ? 'id: ID' : ''}
        ${updateInputFields}
      }
    `;
  },

  /**
   * Build input field definitions for a model.
   * @private
   */
  _buildInputFields(model, globalId, attributeNames, rootType, action = '') {
    return attributeNames
      .map(attributeName => {
        const fieldType = this.convertType({
          attribute: model.attributes[attributeName],
          modelName: globalId,
          attributeName,
          rootType,
          action,
        });

        return `${attributeName}: ${fieldType}`;
      })
      .join('\n');
  },

  generateInputPayloadArguments({ model, name, mutationName, action }) {
    const singularName = toSingular(name);
    const inputName = toInputName(name);
    const { kind } = model;

    switch (action) {
      case 'create':
        return this._generateCreatePayload(mutationName, inputName, singularName, model.globalId);
      case 'update':
        return this._generateUpdatePayload(mutationName, inputName, singularName, model.globalId, kind);
      case 'delete':
        return this._generateDeletePayload(mutationName, singularName, model.globalId, kind);
      default:
        return '';
    }
  },

  /**
   * Generate create mutation payload.
   * @private
   */
  _generateCreatePayload(mutationName, inputName, singularName, globalId) {
    return `
      input ${mutationName}Input { data: ${inputName} }
      type ${mutationName}Payload { ${singularName}: ${globalId} }
    `;
  },

  /**
   * Generate update mutation payload.
   * @private
   */
  _generateUpdatePayload(mutationName, inputName, singularName, globalId, kind) {
    const whereClause = kind === 'singleType' ? '' : 'where: InputID, ';

    return `
      input ${mutationName}Input  { ${whereClause}data: edit${inputName} }
      type ${mutationName}Payload { ${singularName}: ${globalId} }
    `;
  },

  /**
   * Generate delete mutation payload.
   * @private
   */
  _generateDeletePayload(mutationName, singularName, globalId, kind) {
    if (kind === 'singleType') {
      return `
        type ${mutationName}Payload { ${singularName}: ${globalId} }
      `;
    }

    return `
      input ${mutationName}Input  { where: InputID }
      type ${mutationName}Payload { ${singularName}: ${globalId} }
    `;
  },
};
```