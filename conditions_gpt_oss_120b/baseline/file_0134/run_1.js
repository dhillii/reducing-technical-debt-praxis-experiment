```javascript
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

const getScalarGraphQLType = (attribute, modelName, attributeName, rootType, action) => {
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
  };

  let type = map[attribute.type] || 'String';
  if (attribute.type === 'enumeration') {
    type = module.exports.convertEnumType(attribute, modelName, attributeName);
  }

  if (attribute.required) {
    const isMutation = rootType === 'mutation';
    const isUpdate = action === 'update';
    const hasDefault = attribute.default !== undefined;
    if (!isMutation || (!isUpdate && !hasDefault)) {
      type += '!';
    }
  }

  return type;
};

const getComponentGraphQLType = (attribute, modelName, attributeName, rootType, action) => {
  const { required, repeatable, component } = attribute;
  const globalId = strapi.components[component].globalId;
  const baseName = required ? `${globalId}` : globalId;

  if (rootType === 'mutation') {
    const singular = _.upperFirst(toSingular(globalId));
    const inputName = action === 'update' ? `edit${singular}Input` : `${singular}Input${required ? '!' : ''}`;
    return repeatable ? `[${inputName}]` : inputName;
  }

  return repeatable ? `[${baseName}]` : baseName;
};

const getDynamicZoneGraphQLType = (attribute, modelName, attributeName, rootType) => {
  const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
  const base = rootType === 'mutation' ? `${unionName}Input!` : unionName;
  return `[${base}]${attribute.required ? '!' : ''}`;
};

const getAssociationGraphQLType = (attribute, rootType) => {
  const ref = attribute.model || attribute.collection;
  if (!ref || ref === '*') return null;

  const globalId = strapi.db.getModel(ref, attribute.plugin).globalId;
  const isCollection = !!attribute.collection;

  if (isCollection) {
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
      return getScalarGraphQLType(attribute, modelName, attributeName, rootType, action);
    }

    if (attribute.type === 'component') {
      return getComponentGraphQLType(attribute, modelName, attributeName, rootType, action);
    }

    if (attribute.type === 'dynamiczone') {
      return getDynamicZoneGraphQLType(attribute, modelName, attributeName, rootType);
    }

    const assocType = getAssociationGraphQLType(attribute, rootType);
    if (assocType) return assocType;

    // Fallback for polymorphic relations
    if (rootType === 'mutation') {
      return attribute.model ? 'ID' : '[ID]';
    }
    return attribute.model ? 'Morph' : '[Morph]';
  },

  convertEnumType(definition, model, field) {
    return definition.enumName || `ENUM_${model.toUpperCase()}_${field.toUpperCase()}`;
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
      .definitions.filter(
        d => d.kind === 'ObjectTypeDefinition' && d.name.value !== 'Query'
      )
      .map(d => d.name.value);

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

    const buildFields = (action = '') =>
      Object.keys(model.attributes)
        .filter(attr => isTypeAttributeEnabled(model, attr))
        .map(attr =>
          `${attr}: ${this.convertType({
            attribute: model.attributes[attr],
            modelName: globalId,
            attributeName: attr,
            rootType: 'mutation',
            action,
          })}`
        )
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