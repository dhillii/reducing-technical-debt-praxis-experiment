import {
  get,
  isBoolean,
  isNumber,
  isNull,
  isObject,
  isArray,
  isEmpty,
  isNaN,
  toNumber,
} from 'lodash';
import moment from 'moment';
import * as yup from 'yup';
import { translatedErrors as errorsTrads } from 'strapi-helper-plugin';

yup.addMethod(yup.mixed, 'defined', function() {
  return this.test('defined', errorsTrads.required, value => value !== undefined);
});

yup.addMethod(yup.array, 'notEmptyMin', function(min) {
  return this.test('notEmptyMin', errorsTrads.min, value => {
    if (isEmpty(value)) {
      return true;
    }
    return value.length >= min;
  });
});

yup.addMethod(yup.string, 'isInferior', function(message, max) {
  return this.test('isInferior', message, function(value) {
    if (!value) {
      return true;
    }
    if (Number.isNaN(toNumber(value))) {
      return true;
    }
    return toNumber(max) >= toNumber(value);
  });
});

yup.addMethod(yup.string, 'isSuperior', function(message, min) {
  return this.test('isSuperior', message, function(value) {
    if (!value) {
      return true;
    }
    if (Number.isNaN(toNumber(value))) {
      return true;
    }
    return toNumber(value) >= toNumber(min);
  });
});

const getAttributes = data => get(data, ['attributes'], {});

/**
 * Determines if the attribute is a simple field (not relation, component, or dynamiczone).
 * @param {object} attr
 * @returns {boolean}
 */
function isSimpleAttribute(attr) {
  return attr.type !== 'relation' && attr.type !== 'component' && attr.type !== 'dynamiczone';
}

/**
 * Determines if the attribute is a relation.
 * @param {object} attr
 * @returns {boolean}
 */
function isRelationAttribute(attr) {
  return attr.type === 'relation';
}

/**
 * Determines if the attribute is a component.
 * @param {object} attr
 * @returns {boolean}
 */
function isComponentAttribute(attr) {
  return attr.type === 'component';
}

/**
 * Determines if the attribute is a dynamic zone.
 * @param {object} attr
 * @returns {boolean}
 */
function isDynamicZoneAttribute(attr) {
  return attr.type === 'dynamiczone';
}

/**
 * Creates a Yup schema for relation attributes.
 * @param {object} attribute
 * @returns {yup.Schema}
 */
function createRelationSchema(attribute) {
  const relationTypes = [
    'oneWay',
    'oneToOne',
    'manyToOne',
    'oneToManyMorph',
    'oneToOneMorph',
  ];
  return relationTypes.includes(attribute.relationType)
    ? yup.object().nullable()
    : yup.array().nullable();
}

/**
 * Builds a Yup schema for repeatable component attributes.
 * @param {object} attribute
 * @param {yup.Schema} componentFieldSchema
 * @param {object} options
 * @returns {yup.Schema}
 */
function buildRepeatableComponentSchema(attribute, componentFieldSchema, options) {
  const { min, max, required } = attribute;
  return yup.lazy(value => {
    let schema = yup.array().of(componentFieldSchema);
    if (min && !options.isDraft) {
      if (required) {
        schema = schema.min(min, errorsTrads.min);
      } else if (required !== true && isEmpty(value)) {
        schema = schema.nullable();
      } else {
        schema = schema.min(min, errorsTrads.min);
      }
    }
    if (max) {
      schema = schema.max(max, errorsTrads.max);
    }
    return schema;
  });
}

/**
 * Builds a Yup schema for a single (non‑repeatable) component attribute.
 * @param {object} attribute
 * @param {yup.Schema} componentFieldSchema
 * @param {object} options
 * @returns {yup.Schema}
 */
function buildSingleComponentSchema(attribute, componentFieldSchema, options) {
  return yup.lazy(obj => {
    if (obj !== undefined) {
      if (attribute.required === true && !options.isDraft) {
        return componentFieldSchema.defined();
      }
      return componentFieldSchema.nullable();
    }
    if (attribute.required === true) {
      return yup.object().defined();
    }
    return yup.object().nullable();
  });
}

/**
 * Creates a Yup schema for component attributes.
 * @param {object} attribute
 * @param {object} components
 * @param {object} options
 * @returns {yup.Schema}
 */
function createComponentSchema(attribute, components, options) {
  const componentFieldSchema = createYupSchema(
    components[attribute.component],
    { components },
    { ...options, isFromComponent: true }
  );

  if (attribute.repeatable === true) {
    return buildRepeatableComponentSchema(attribute, componentFieldSchema, options);
  }

  return buildSingleComponentSchema(attribute, componentFieldSchema, options);
}

/**
 * Creates a Yup schema for dynamic zone attributes.
 * @param {object} attribute
 * @param {object} components
 * @param {object} options
 * @returns {yup.Schema}
 */
function createDynamicZoneSchema(attribute, components, options) {
  let schema = yup.array().of(
    yup.lazy(({ __component }) =>
      createYupSchema(
        components[__component],
        { components },
        { ...options, isFromComponent: true }
      )
    )
  );

  const { max, min, required } = attribute;

  if (required && !options.isDraft) {
    schema = schema.test('required', errorsTrads.required, value => {
      if (options.isCreatingEntry) {
        return value !== null && value !== undefined;
      }
      if (value === undefined) {
        return true;
      }
      return value !== null;
    });

    if (min) {
      schema = schema
        .test('min', errorsTrads.min, value => {
          if (options.isCreatingEntry) {
            return value && value.length > 0;
          }
          if (value === undefined) {
            return true;
          }
          return value !== null && value.length > 0;
        })
        .test('required', errorsTrads.required, value => {
          if (options.isCreatingEntry) {
            return value !== null && value !== undefined;
          }
          if (value === undefined) {
            return true;
          }
          return value !== null;
        });
    }
  } else if (min) {
    schema = schema.notEmptyMin(min);
  }

  if (max) {
    schema = schema.max(max, errorsTrads.max);
  }

  return schema;
}

/**
 * Generates a Yup validation schema for a given model.
 * @param {object} model
 * @param {{ components: object }} param1
 * @param {object} [options={ isCreatingEntry: true, isDraft: true, isFromComponent: false }]
 * @returns {yup.ObjectSchema}
 */
const createYupSchema = (
  model,
  { components },
  options = { isCreatingEntry: true, isDraft: true, isFromComponent: false }
) => {
  const attributes = getAttributes(model);

  const shape = Object.keys(attributes).reduce((acc, key) => {
    const attribute = attributes[key];

    if (isSimpleAttribute(attribute)) {
      acc[key] = createYupSchemaAttribute(attribute.type, attribute, options);
      return acc;
    }

    if (isRelationAttribute(attribute)) {
      acc[key] = createRelationSchema(attribute);
      return acc;
    }

    if (isComponentAttribute(attribute)) {
      acc[key] = createComponentSchema(attribute, components, options);
      return acc;
    }

    if (isDynamicZoneAttribute(attribute)) {
      acc[key] = createDynamicZoneSchema(attribute, components, options);
      return acc;
    }

    return acc;
  }, {});

  return yup.object().shape(shape);
};

const createYupSchemaAttribute = (type, validations, options) => {
  let schema = yup.mixed();

  if (['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type)) {
    schema = yup.string();
  }

  if (type === 'json') {
    schema = yup
      .mixed(errorsTrads.json)
      .test('isJSON', errorsTrads.json, value => {
        if (value === undefined) {
          return true;
        }

        if (isNumber(value) || isNull(value) || isObject(value) || isArray(value)) {
          return true;
        }

        try {
          JSON.parse(value);
          return true;
        } catch (err) {
          return false;
        }
      })
      .nullable();
  }

  if (type === 'email') {
    schema = schema.email(errorsTrads.email);
  }

  if (['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type)) {
    schema = yup
      .number()
      .transform(cv => (isNaN(cv) ? undefined : cv))
      .typeError();
  }

  if (['date', 'datetime'].includes(type)) {
    schema = yup.date();
  }

  if (type === 'biginteger') {
    schema = yup.string().matches(/^\d*$/);
  }

  Object.keys(validations).forEach(validation => {
    const validationValue = validations[validation];

    if (
      !!validationValue ||
      (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
      validationValue === 0
    ) {
      switch (validation) {
        case 'required': {
          if (!options.isDraft) {
            if (type === 'password' && options.isCreatingEntry) {
              schema = schema.required(errorsTrads.required);
            }

            if (type !== 'password') {
              if (options.isCreatingEntry) {
                schema = schema.required(errorsTrads.required);
              } else {
                schema = schema.test('required', errorsTrads.required, value => {
                  if (value === undefined && !options.isFromComponent) {
                    return true;
                  }

                  if (['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type)) {
                    if (value === 0) {
                      return true;
                    }
                    return !!value;
                  }

                  if (['date', 'datetime'].includes(type)) {
                    return moment(value)._isValid === true;
                  }

                  if (type === 'boolean') {
                    return value !== null;
                  }

                  return !isEmpty(value);
                });
              }
            }
          }
          break;
        }

        case 'max': {
          if (type === 'biginteger') {
            schema = schema.isInferior(errorsTrads.max, validationValue);
          } else {
            schema = schema.max(validationValue, errorsTrads.max);
          }
          break;
        }
        case 'maxLength':
          schema = schema.max(validationValue, errorsTrads.maxLength);
          break;
        case 'min': {
          if (type === 'biginteger') {
            schema = schema.isSuperior(errorsTrads.min, validationValue);
          } else {
            schema = schema.min(validationValue, errorsTrads.min);
          }
          break;
        }
        case 'minLength': {
          if (!options.isDraft) {
            schema = schema.min(validationValue, errorsTrads.minLength);
          }
          break;
        }
        case 'regex':
          schema = schema.matches(new RegExp(validationValue), errorsTrads.regex);
          break;
        case 'lowercase':
          if (['text', 'textarea', 'email', 'string'].includes(type)) {
            schema = schema.strict().lowercase();
          }
          break;
        case 'uppercase':
          if (['text', 'textarea', 'email', 'string'].includes(type)) {
            schema = schema.strict().uppercase();
          }
          break;
        case 'positive':
          if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
            schema = schema.positive();
          }
          break;
        case 'negative':
          if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
            schema = schema.negative();
          }
          break;
        default:
          schema = schema.nullable();
      }
    }
  });

  return schema;
};

export default createYupSchema;