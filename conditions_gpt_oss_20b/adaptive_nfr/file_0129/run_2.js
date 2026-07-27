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
 * Determines if an attribute is a simple type (not relation, component, or dynamiczone).
 * @param {Object} attribute
 * @returns {boolean}
 */
const isSimpleAttribute = attribute =>
  attribute.type !== 'relation' &&
  attribute.type !== 'component' &&
  attribute.type !== 'dynamiczone';

/**
 * Returns the Yup schema for a relation attribute.
 * @param {Object} attribute
 * @returns {yup.Schema}
 */
const getRelationSchema = attribute => {
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
};

/**
 * Builds the Yup schema for a repeatable component attribute.
 * @param {*} value
 * @param {yup.Schema} componentFieldSchema
 * @param {number} min
 * @param {number} max
 * @param {boolean} required
 * @param {Object} options
 * @returns {yup.Schema}
 */
const buildRepeatableComponentSchema = (
  value,
  componentFieldSchema,
  min,
  max,
  required,
  options
) => {
  let baseSchema = yup.array().of(componentFieldSchema);
  if (min && !options.isDraft) {
    if (required) {
      baseSchema = baseSchema.min(min, errorsTrads.min);
    } else if (required !== true && isEmpty(value)) {
      baseSchema = baseSchema.nullable();
    } else {
      baseSchema = baseSchema.min(min, errorsTrads.min);
    }
  }
  if (max) {
    baseSchema = baseSchema.max(max, errorsTrads.max);
  }
  return baseSchema;
};

/**
 * Builds the Yup schema for a non-repeatable component attribute.
 * @param {*} obj
 * @param {yup.Schema} componentFieldSchema
 * @param {Object} attribute
 * @param {Object} options
 * @returns {yup.Schema}
 */
const buildNonRepeatableComponentSchema = (obj, componentFieldSchema, attribute, options) => {
  if (obj !== undefined) {
    return attribute.required === true && !options.isDraft
      ? componentFieldSchema.defined()
      : componentFieldSchema.nullable();
  }
  return attribute.required === true ? yup.object().defined() : yup.object().nullable();
};

/**
 * Returns the Yup schema for a component attribute.
 * @param {Object} attribute
 * @param {Object} components
 * @param {Object} options
 * @returns {yup.Schema}
 */
const getComponentSchema = (attribute, components, options) => {
  const componentFieldSchema = createYupSchema(
    components[attribute.component],
    { components },
    { ...options, isFromComponent: true }
  );

  if (attribute.repeatable === true) {
    const { min, max, required } = attribute;
    return yup.lazy(value =>
      buildRepeatableComponentSchema(value, componentFieldSchema, min, max, required, options)
    );
  }

  return yup.lazy(obj =>
    buildNonRepeatableComponentSchema(obj, componentFieldSchema, attribute, options)
  );
};

/**
 * Test function for required validation in dynamic zones.
 * @param {*} value
 * @param {Object} options
 * @returns {boolean}
 */
const requiredTest = (value, options) => {
  if (options.isCreatingEntry) {
    return value !== null || value !== undefined;
  }
  if (value === undefined) {
    return true;
  }
  return value !== null;
};

/**
 * Test function for min validation in dynamic zones.
 * @param {*} value
 * @param {Object} options
 * @returns {boolean}
 */
const minTest = (value, options) => {
  if (options.isCreatingEntry) {
    return value && value.length > 0;
  }
  if (value === undefined) {
    return true;
  }
  return value !== null && value.length > 0;
};

/**
 * Builds the Yup schema for a dynamiczone attribute.
 * @param {Object} attribute
 * @param {Object} components
 * @param {Object} options
 * @returns {yup.Schema}
 */
const getDynamicZoneSchema = (attribute, components, options) => {
  let schema = yup.array().of(
    yup.lazy(({ __component }) => {
      return createYupSchema(
        components[__component],
        { components },
        { ...options, isFromComponent: true }
      );
    })
  );

  const { max, min } = attribute;

  if (attribute.required && !options.isDraft) {
    schema = schema.test('required', errorsTrads.required, value => requiredTest(value, options));

    if (min) {
      schema = schema
        .test('min', errorsTrads.min, value => minTest(value, options))
        .test('required', errorsTrads.required, value => requiredTest(value, options));
    }
  } else if (min) {
    schema = schema.notEmptyMin(min);
  }

  if (max) {
    schema = schema.max(max, errorsTrads.max);
  }

  return schema;
};

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

    if (attribute.type === 'relation') {
      acc[key] = getRelationSchema(attribute);
      return acc;
    }

    if (attribute.type === 'component') {
      acc[key] = getComponentSchema(attribute, components, options);
      return acc;
    }

    if (attribute.type === 'dynamiczone') {
      acc[key] = getDynamicZoneSchema(attribute, components, options);
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
                  // Field is not touched and the user is editing the entry
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