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
   * Convert Strapi scalar type to GraphQL scalar type.
   * @param {Object} attribute Information about the attribute.
   * @param {String} modelName Name of the model which owns the attribute.
   * @param {String} attributeName Name of the attribute.
   * @param {String} rootType Root type context (query or mutation).
   * @param {String} action Mutation action type.
   * @return String
   */
  convertScalarType(attribute, modelName, attributeName, rootType, action) {
    let type = this.mapAttributeTypeToGraphQL(attribute.type);

    if (attribute.required) {
      if (rootType !== 'mutation' || (action !== 'update' && attribute.default === undefined)) {
        type += '!';
      }
    }

    return type;
  },

  /**
   * Map Strapi attribute type to GraphQL type name.
   * @param {String} attributeType The Strapi attribute type.
   * @return String
   */
  mapAttributeTypeToGraphQL(attributeType) {
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

    return typeMap[attributeType] || 'String';
  },

  /**
   * Convert component attribute to GraphQL type.
   * @param {Object} attribute Component attribute definition.
   * @param {String} rootType Root type context.
   * @param {String} action Mutation action type.
   * @return String
   */
  convertComponentType(attribute, rootType, action) {
    const { required, repeatable, component } = attribute;
    const globalId = strapi.components[component].globalId;

    let typeName = globalId;

    if (rootType === 'mutation') {
      typeName = this.buildComponentInputTypeName(globalId, action, required);
    }

    if (repeatable === true) {
      return `[${typeName}]`;
    }

    return typeName;
  },

  /**
   * Build component input type name for mutations.
   * @param {String} globalId Component global ID.
   * @param {String} action Mutation action type.
   * @param {Boolean} required Whether component is required.
   * @return String
   */
  buildComponentInputTypeName(globalId, action, required) {
    const singularName = _.upperFirst(toSingular(globalId));

    if (action === 'update') {
      return `edit${singularName}Input`;
    }

    return `${singularName}Input${required ? '!' : ''}`;
  },

  /**
   * Convert dynamic zone attribute to GraphQL type.
   * @param {Object} attribute Dynamic zone attribute definition.
   * @param {String} modelName Name of the model which owns the attribute.
   * @param {String} attributeName Name of the attribute.
   * @param {String} rootType Root type context.
   * @return String
   */
  convertDynamicZoneType(attribute, modelName, attributeName, rootType) {
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
   * @param {Object} attribute Association attribute definition.
   * @param {String} rootType Root type context.
   * @return String
   */
  convertAssociationType(attribute, rootType) {
    const ref = attribute.model || attribute.collection;

    if (!ref || ref === '*') {
      return this.getPolymorphicType(attribute, rootType);
    }

    const globalId = strapi.db.getModel(ref, attribute.plugin).globalId;
    const isPlural = !_.isEmpty(attribute.collection);

    return this.buildAssociationTypeName(globalId, isPlural, rootType);
  },

  /**
   * Build association type name based on plurality and context.
   * @param {String} globalId Model global ID.
   * @param {Boolean} isPlural Whether association is plural.
   * @param {String} rootType Root type context.
   * @return String
   */
  buildAssociationTypeName(globalId, isPlural, rootType) {
    if (isPlural) {
      return rootType === 'mutation' ? '[ID]' : `[${globalId}]`;
    }

    return rootType === 'mutation' ? 'ID' : globalId;
  },

  /**
   * Get polymorphic type for associations without specific reference.
   * @param {Object} attribute Association attribute definition.
   * @param {String} rootType Root type context.
   * @return String
   */
  getPolymorphicType(attribute, rootType) {
    const isSingleModel = !!attribute.model;

    if (rootType === 'mutation') {
      return isSingleModel ? 'ID' : '[ID]';
    }

    return isSingleModel ? 'Morph' : '[Morph]';
  },

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
      return this.convertScalarType(attribute, modelName, attributeName, rootType, action);
    }

    if (attribute.type === 'component') {
      return this.convertComponentType(attribute, rootType, action);
    }

    if (attribute.type === 'dynamiczone') {
      return this.convertDynamicZoneType(attribute, modelName, attributeName, rootType);
    }

    return this.convertAssociationType(attribute, rootType);
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

  /**
   * Check if all attributes are disabled for type generation.
   * @param {Object} model The model definition.
   * @return Boolean
   */
  hasAllAttributesDisabled(model) {
    return Object.keys(model.attributes).every(attr => !isTypeAttributeEnabled(model, attr));
  },

  /**
   * Generate empty input type definition.
   * @param {String} inputName The input type name.
   * @param {Boolean} allowIds Whether to allow ID field.
   * @return String
   */
  generateEmptyInputType(inputName, allowIds) {
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
   * Generate input fields for create/update mutations.
   * @param {Object} model The model definition.
   * @param {String} globalId The model global ID.
   * @param {String} action The mutation action (create or update).
   * @return String
   */
  generateInputFields(model, globalId, action) {
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
  },

  /**
   * Generate input model types for mutations.
   * @param {Object} model The model definition.
   * @param {String} name The model name.
   * @param {Object} options Configuration options.
   * @return String
   */
  generateInputModel(model, name, { allowIds = false } = {}) {
    const globalId = model.globalId;
    const inputName = `${_.upperFirst(toSingular(name))}Input`;

    if (_.isEmpty(model.attributes) || this.hasAllAttributesDisabled(model)) {
      return this.generateEmptyInputType(inputName, allowIds);
    }

    const createFields = this.generateInputFields(model, globalId, 'create');
    const updateFields = this.generateInputFields(model, globalId, 'update');

    return `
      input ${inputName} {
        ${createFields}
      }

      input edit${inputName} {
        ${allowIds ? 'id: ID' : ''}
        ${updateFields}
      }
    `;
  },

  /**
   * Generate input and payload types for create mutation.
   * @param {String} mutationName The mutation name.
   * @param {String} inputName The input type name.
   * @param {String} singularName The singular model name.
   * @param {String} globalId The model global ID.
   * @return String
   */
  generateCreateMutationPayload(mutationName, inputName, singularName, globalId) {
    return `
      input ${mutationName}Input { data: ${inputName} }
      type ${mutationName}Payload { ${singularName}: ${globalId} }
    `;
  },

  /**
   * Generate input and payload types for update mutation.
   * @param {String} mutationName The mutation name.
   * @param {String} inputName The input type name.
   * @param {String} singularName The singular model name.
   * @param {String} globalId The model global ID.
   * @param {String} kind The model kind (singleType or collectionType).
   * @return String
   */
  generateUpdateMutationPayload(mutationName, inputName, singularName, globalId, kind) {
    const whereClause = kind === 'singleType' ? '' : 'where: InputID, ';

    return `
      input ${mutationName}Input  { ${whereClause}data: edit${inputName} }
      type ${mutationName}Payload { ${singularName}: ${globalId} }
    `;
  },

  /**
   * Generate input and payload types for delete mutation.
   * @param {String} mutationName The mutation name.
   * @param {String} singularName The singular model name.
   * @param {String} globalId The model global ID.
   * @param {String} kind The model kind (singleType or collectionType).
   * @return String
   */
  generateDeleteMutationPayload(mutationName, singularName, globalId, kind) {
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

  /**
   * Generate input and payload argument types for mutations.
   * @param {Object} params Configuration parameters.
   * @param {Object} params.model The model definition.
   * @param {String} params.name The model name.
   * @param {String} params.mutationName The mutation name.
   * @param {String} params.action The mutation action.
   * @return String
   */
  generateInputPayloadArguments({ model, name, mutationName, action }) {
    const singularName = toSingular(name);
    const inputName = toInputName(name);
    const { kind, globalId } = model;

    switch (action) {
      case 'create':
        return this.generateCreateMutationPayload(mutationName, inputName, singularName, globalId);
      case 'update':
        return this.generateUpdateMutationPayload(mutationName, inputName, singularName, globalId, kind);
      case 'delete':
        return this.generateDeleteMutationPayload(mutationName, singularName, globalId, kind);
      default:
        return '';
    }
  },
};
```