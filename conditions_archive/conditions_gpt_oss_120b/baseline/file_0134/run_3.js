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

/* -------------------------------------------------------------------------- */
/* Helper functions                                                          */
/* -------------------------------------------------------------------------- */

function getScalarGraphQLType({ attribute, modelName, attributeName, rootType, action, convertEnum }) {
  const map = {
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
    enumeration: convertEnum(attribute, modelName, attributeName),
  };

  let type = map[attribute.type] || 'String';

  if (attribute.required) {
    const isMutation = rootType === 'mutation';
    const isUpdate = action === 'update';
    const hasDefault = attribute.default !== undefined;

    if (!isMutation || (!isUpdate && !hasDefault)) {
      type += '!';
    }
  }

  return type;
}

function getComponentGraphQLType({ attribute, modelName, attributeName, rootType, action }) {
  const { required, repeatable, component } = attribute;
  const globalId = strapi.components[component].globalId;
  const baseName = _.upperFirst(toSingular(globalId));

  if (rootType !== 'mutation') {
    const typeName = required ? `${globalId}` : globalId;
    return repeatable ? `[${typeName}]` : typeName;
  }

  const inputSuffix = action === 'update' ? `edit${baseName}Input` : `${baseName}Input${required ? '!' : ''}`;
  const typeName = inputSuffix;

  return repeatable ? `[${typeName}]` : typeName;
}

function getDynamicZoneGraphQLType({ attribute, modelName, attributeName, rootType }) {
  const { required } = attribute;
  const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
  const typeName = rootType === 'mutation' ? `${unionName}Input!` : unionName;
  return `[${typeName}]${required ? '!' : ''}`;
}

function getAssociationGraphQLType({ attribute, rootType }) {
  const ref = attribute.model || attribute.collection;
  if (!ref || ref === '*') return null;

  const globalId = strapi.db.getModel(ref, attribute.plugin).globalId;
  const isCollection = !!attribute.collection;

  if (rootType === 'mutation') {
    return isCollection ? '[ID]' : 'ID';
  }

  return isCollection ? `[${globalId}]` : globalId;
}

/* -------------------------------------------------------------------------- */
/* Exported API                                                              */
/* -------------------------------------------------------------------------- */

module.exports = {
  /**
   * Convert Strapi type to GraphQL type.
   */
  convertType({ attribute = {}, modelName = '', attributeName = '', rootType = 'query', action = '' }) {
    if (isScalarAttribute(attribute)) {
      return getScalarGraphQLType({
        attribute,
        modelName,
        attributeName,
        rootType,
        action,
        convertEnum: this.convertEnumType.bind(this),
      });
    }

    if (attribute.type === 'component') {
      return getComponentGraphQLType({ attribute, modelName, attributeName, rootType, action });
    }

    if (attribute.type === 'dynamiczone') {
      return getDynamicZoneGraphQLType({ attribute, modelName, attributeName, rootType });
    }

    const assocType = getAssociationGraphQLType({ attribute, rootType });
    if (assocType) return assocType;

    // Fallback for polymorphic relations
    if (rootType === 'mutation') {
      return attribute.model ? 'ID' : '[ID]';
    }

    return attribute.model ? 'Morph' : '[Morph]';
  },

  /**
   * Convert Strapi enumeration to GraphQL Enum.
   */
  convertEnumType(definition, model, field) {
    return definition.enumName
      ? definition.enumName
      : `ENUM_${model.toUpperCase()}_${field.toUpperCase()}`;
  },

  /**
   * Add custom scalar type such as JSON.
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
   */
  addPolymorphicUnionType(definition) {
    const types = graphql
      .parse(definition)
      .definitions.filter(
        (def) => def.kind === 'ObjectTypeDefinition' && def.name.value !== 'Query'
      )
      .map((def) => def.name.value);

    if (!types.length) {
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

    const buildFields = (action) =>
      Object.keys(model.attributes)
        .filter((attributeName) => isTypeAttributeEnabled(model, attributeName))
        .map((attributeName) => {
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

    return `
      input ${inputName} {
        ${buildFields()}
      }

      input edit${inputName} {
        ${allowIds ? 'id: ID' : ''}
        ${buildFields('update')}
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
```