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

yup.addMethod(yup.mixed, 'defined', function () {
  return this.test('defined', errorsTrads.required, value => value !== undefined);
});

yup.addMethod(yup.array, 'notEmptyMin', function (min) {
  return this.test('notEmptyMin', errorsTrads.min, value => {
    if (isEmpty(value)) {
      return true;
    }

    return value.length >= min;
  });
});

yup.addMethod(yup.string, 'isInferior', function (message, max) {
  return this.test('isInferior', message, function (value) {
    if (!value) {
      return true;
    }

    if (Number.isNaN(toNumber(value))) {
      return true;
    }

    return toNumber(max) >= toNumber(value);
  });
});

yup.addMethod(yup.string, 'isSuperior', function (message, min) {
  return this.test('isSuperior', message, function (value) {
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

const createYupSchema = (
  model,
  { components },
  options = { isCreatingEntry: true, isDraft: true, isFromComponent: false }
) => {
  const attributes = getAttributes(model);

  return yup.object().shape(
    Object.keys(attributes).reduce((acc, current) => {
      const attribute = attributes[current];

      if (
        attribute.type !== 'relation' &&
        attribute.type !== 'component' &&
        attribute.type !== 'dynamiczone'
      ) {
        const formatted = createYupSchemaAttribute(attribute.type, attribute, options);
        acc[current] = formatted;
      }

      if (attribute.type === 'relation') {
        acc[current] = [
          'oneWay',
          'oneToOne',
          'manyToOne',
          'oneToManyMorph',
          'oneToOneMorph',
        ].includes(attribute.relationType)
          ? yup.object().nullable()
          : yup.array().nullable();
      }

      if (attribute.type === 'component') {
        const componentFieldSchema = createYupSchema(
          components[attribute.component],
          {
            components,
          },
          { ...options, isFromComponent: true }
        );

        if (attribute.repeatable === true) {
          const { min, max, required } = attribute;
          let componentSchema = yup.lazy(value => {
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
          });

          acc[current] = componentSchema;

          return acc;
        }
        const componentSchema = yup.lazy(obj => {
          if (obj !== undefined) {
            return attribute.required === true && !options.isDraft
              ? componentFieldSchema.defined()
              : componentFieldSchema.nullable();
          }

          return attribute.required === true ? yup.object().defined() : yup.object().nullable();
        });

        acc[current] = componentSchema;

        return acc;
      }

      if (attribute.type === 'dynamiczone') {
        let dynamicZoneSchema = yup.array().of(
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
          dynamicZoneSchema = dynamicZoneSchema.test('required', errorsTrads.required, value => {
            if (options.isCreatingEntry) {
              return value !== null || value !== undefined;
            }

            if (value === undefined) {
              return true;
            }

            return value !== null;
          });

          if (min) {
            dynamicZoneSchema = dynamicZoneSchema
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
                  return value !== null || value !== undefined;
                }

                if (value === undefined) {
                  return true;
                }

                return value !== null;
              });
          }
        } else {
          // eslint-disable-next-line no-lonely-if
          if (min) {
            dynamicZoneSchema = dynamicZoneSchema.notEmptyMin(min);
          }
        }

        if (max) {
          dynamicZoneSchema = dynamicZoneSchema.max(max, errorsTrads.max);
        }

        acc[current] = dynamicZoneSchema;
      }

      return acc;
    }, {})
  );
};

/**
 * Determines if a validation value should be considered truthy for processing.
 * @param {*} value - The validation value.
 * @returns {boolean} True if the value should be processed.
 */
const isTruthyValidationValue = value =>
  !!value || (!isBoolean(value) && Number.isInteger(Math.floor(value))) || value === 0;

/**
 * Handles the 'required' validation for a schema.
 * @param {yup.Schema} schema - The current schema.
 * @param {string} type - The attribute type.
 * @param {Object} options - Schema options.
 * @returns {yup.Schema} Updated schema.
 */
const handleRequired = (schema, type, options) => {
  if (!options.isDraft) {
    if (type === 'password' && options.isCreatingEntry) {
      return schema.required(errorsTrads.required);
    }

    if (type !== 'password') {
      if (options.isCreatingEntry) {
        return schema.required(errorsTrads.required);
      }

      return schema.test('required', errorsTrads.required, value => {
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

  return schema;
};

/**
 * Handles the 'max' validation for a schema.
 * @param {yup.Schema} schema - The current schema.
 * @param {string} type - The attribute type.
 * @param {*} value - The max value.
 * @returns {yup.Schema} Updated schema.
 */
const handleMax = (schema, type, value) => {
  if (type === 'biginteger') {
    return schema.isInferior(errorsTrads.max, value);
  }

  return schema.max(value, errorsTrads.max);
};

/**
 * Handles the 'min' validation for a schema.
 * @param {yup.Schema} schema - The current schema.
 * @param {string} type - The attribute type.
 * @param {*} value - The min value.
 * @returns {yup.Schema} Updated schema.
 */
const handleMin = (schema, type, value) => {
  if (type === 'biginteger') {
    return schema.isSuperior(errorsTrads.min, value);
  }

  return schema.min(value, errorsTrads.min);
};

/**
 * Handles the 'maxLength' validation for a schema.
 * @param {yup.Schema} schema - The current schema.
 * @param {*} value - The maxLength value.
 * @returns {yup.Schema} Updated schema.
 */
const handleMaxLength = (schema, value) => schema.max(value, errorsTrads.maxLength);

/**
 * Handles the 'minLength' validation for a schema.
 * @param {yup.Schema} schema - The current schema.
 * @param {*} value - The minLength value.
 * @param {Object} options - Schema options.
 * @returns {yup.Schema} Updated schema.
 */
const handleMinLength = (schema, value, options) => {
  if (!options.isDraft) {
    return schema.min(value, errorsTrads.minLength);
  }

  return schema;
};

/**
 * Handles the 'regex' validation for a schema.
 * @param {yup.Schema} schema - The current schema.
 * @param {*} value - The regex pattern.
 * @returns {yup.Schema} Updated schema.
 */
const handleRegex = (schema, value) => schema.matches(new RegExp(value), errorsTrads.regex);

/**
 * Handles case conversion validations for a schema.
 * @param {yup.Schema} schema - The current schema.
 * @param {string} type - The attribute type.
 * @param {string} validation - 'lowercase' or 'uppercase'.
 * @returns {yup.Schema} Updated schema.
 */
const handleCaseConversion = (schema, type, validation) => {
  if (['text', 'textarea', 'email', 'string'].includes(type)) {
    return schema.strict()[validation]();
  }

  return schema;
};

/**
 * Handles sign validations for a schema.
 * @param {yup.Schema} schema - The current schema.
 * @param {string} type - The attribute type.
 * @param {string} validation - 'positive' or 'negative'.
 * @returns {yup.Schema} Updated schema.
 */
const handleSign = (schema, type, validation) => {
  if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
    return schema[validation]();
  }

  return schema;
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

    if (!isTruthyValidationValue(validationValue)) {
      return;
    }

    switch (validation) {
      case 'required':
        schema = handleRequired(schema, type, options);
        break;
      case 'max':
        schema = handleMax(schema, type, validationValue);
        break;
      case 'maxLength':
        schema = handleMaxLength(schema, validationValue);
        break;
      case 'min':
        schema = handleMin(schema, type, validationValue);
        break;
      case 'minLength':
        schema = handleMinLength(schema, validationValue, options);
        break;
      case 'regex':
        schema = handleRegex(schema, validationValue);
        break;
      case 'lowercase':
      case 'uppercase':
        schema = handleCaseConversion(schema, type, validation);
        break;
      case 'positive':
      case 'negative':
        schema = handleSign(schema, type, validation);
        break;
      default:
        schema = schema.nullable();
    }
  });

  return schema;
};

export default createYupSchema;