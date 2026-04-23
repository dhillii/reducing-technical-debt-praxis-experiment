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

/* ---------- Predicate helpers ---------- */

/**
 * Checks if attribute is a scalar (non‑component, non‑dynamiczone).
 * @param {Object} attribute
 * @returns {boolean}
 */
const isScalarAttribute = ({ type }) => type && !['component', 'dynamiczone'].includes(type);

/**
 * Checks if attribute is a component.
 * @param {Object} attribute
 * @returns {boolean}
 */
const isComponentAttribute = ({ type }) => type === 'component';

/**
 * Checks if attribute is a dynamic zone.
 * @param {Object} attribute
 * @returns {boolean}
 */
const isDynamicZoneAttribute = ({ type }) => type === 'dynamiczone';

/**
 * Checks if attribute is an association (model/collection reference).
 * @param {Object} attribute
 * @returns {boolean}
 */
const isAssociationAttribute = (attribute) => {
  const ref = attribute.model || attribute.collection;
  return !!ref && ref !== '*';
};

/**
 * Determines if a scalar attribute is required for the given context.
 * @param {Object} attribute
 * @param {string} rootType
 * @param {string} action
 * @returns {boolean}
 */
const isRequiredScalar = (attribute, rootType, action) =>
  attribute.required &&
  (rootType !== 'mutation' || (action !== 'update' && attribute.default === undefined));

/* ---------- Scalar type mapping ---------- */

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

/* ---------- Handler implementations ---------- */

/**
 * Handles scalar attribute conversion.
 * @param {Object} ctx
 * @returns {string}
 */
function handleScalar({ attribute, modelName, attributeName, rootType, action }) {
  let gqlType = scalarTypeMap[attribute.type] || 'String';

  if (attribute.type === 'enumeration') {
    gqlType = this.convertEnumType(attribute, modelName, attributeName);
  }

  if (isRequiredScalar(attribute, rootType, action)) {
    gqlType += '!';
  }

  return gqlType;
}

/**
 * Handles component attribute conversion.
 * @param {Object} ctx
 * @returns {string}
 */
function handleComponent({ attribute, modelName, attributeName, rootType, action }) {
  const { required, repeatable, component } = attribute;
  const globalId = strapi.components[component].globalId;

  let typeName = required ? `${globalId}` : globalId;

  if (rootType === 'mutation') {
    typeName =
      action === 'update'
        ? `edit${_.upperFirst(toSingular(globalId))}Input`
        : `${_.upperFirst(toSingular(globalId))}Input${required ? '!' : ''}`;
  }

  return repeatable ? `[${typeName}]` : `${typeName}`;
}

/**
 * Handles dynamic zone attribute conversion.
 * @param {Object} ctx
 * @returns {string}
 */
function handleDynamicZone({ attribute, modelName, attributeName, rootType }) {
  const { required } = attribute;
  const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
  const typeName = rootType === 'mutation' ? `${unionName}Input!` : unionName;
  return `[${typeName}]${required ? '!' : ''}`;
}

/**
 * Handles association attribute conversion.
 * @param {Object} ctx
 * @returns {string}
 */
function handleAssociation({ attribute, rootType }) {
  const ref = attribute.model || attribute.collection;
  const globalId = strapi.db.getModel(ref, attribute.plugin).globalId;
  const isCollection = !!attribute.collection;

  if (isCollection) {
    return rootType === 'mutation' ? '[ID]' : `[${globalId}]`;
  }

  return rootType === 'mutation' ? 'ID' : globalId;
}

/**
 * Handles fallback conversion for non‑scalar, non‑association attributes.
 * @param {Object} ctx
 * @returns {string}
 */
function handleFallback({ attribute, rootType }) {
  if (rootType === 'mutation') {
    return attribute.model ? 'ID' : '[ID]';
  }
  return attribute.model ? 'Morph' : '[Morph]';
}

/* ---------- Dispatch table ---------- */

const typeHandlers = [
  { predicate: isScalarAttribute, handler: handleScalar },
  { predicate: isComponentAttribute, handler: handleComponent },
  { predicate: isDynamicZoneAttribute, handler: handleDynamicZone },
  { predicate: isAssociationAttribute, handler: handleAssociation },
];

/* ---------- Exported service ---------- */

module.exports = {
  /**
   * Convert Strapi type to GraphQL type.
   * @param {Object} opts
   * @param {Object} opts.attribute
   * @param {string} opts.modelName
   * @param {string} opts.attributeName
   * @param {string} [opts.rootType='query']
   * @param {string} [opts.action='']
   * @returns {string}
   */
  convertType({
    attribute = {},
    modelName = '',
    attributeName = '',
    rootType = 'query',
    action = '',
  }) {
    for (const { predicate, handler } of typeHandlers) {
      if (predicate(attribute)) {
        return handler.call(this, {
          attribute,
          modelName,
          attributeName,
          rootType,
          action,
        });
      }
    }
    return handleFallback.call(this, { attribute, rootType });
  },

  /**
   * Convert Strapi enumeration to GraphQL Enum.
   * @param {Object} definition Definition of the attribute.
   * @param {string} model Name of the model which owns the attribute.
   * @param {string} field Name of the attribute.
   * @returns {string}
   */
  convertEnumType(definition, model, field) {
    return definition.enumName
      ? definition.enumName
      : `ENUM_${model.toUpperCase()}_${field.toUpperCase()}`;
  },

  /**
   * Add custom scalar type such as JSON.
   *
   * @returns {Object}
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
   * @param {string} definition GraphQL schema definition.
   * @returns {{definition:string,resolvers:Object}}
   */
  addPolymorphicUnionType(definition) {
    const types = graphql
      .parse(definition)
      .definitions.filter(
        (def) => def.kind === 'ObjectTypeDefinition' && def.name.value !== 'Query'
      )
      .map((def) => def.name.value);

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

    return { definition: '', resolvers: {} };
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

    const buildFields = (actionFlag) =>
      Object.keys(model.attributes)
        .filter((attributeName) => isTypeAttributeEnabled(model, attributeName))
        .map((attributeName) => {
          const attr = model.attributes[attributeName];
          return `${attributeName}: ${this.convertType({
            attribute: attr,
            modelName: globalId,
            attributeName,
            rootType: 'mutation',
            action: actionFlag,
          })}`;
        })
        .join('\n');

    const inputs = `
      input ${inputName} {

        ${buildFields('')}
      }

      input edit${inputName} {
        ${allowIds ? 'id: ID' : ''}
        ${buildFields('update')}
      }
    `;

    return inputs;
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
        // No payload for unknown actions
        return '';
    }
  },
};
```