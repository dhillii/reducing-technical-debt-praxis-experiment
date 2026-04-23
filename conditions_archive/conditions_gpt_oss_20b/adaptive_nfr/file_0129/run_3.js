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
  return this.test('defined', errorsTrads.required, (value) => value !== undefined);
});

yup.addMethod(yup.array, 'notEmptyMin', function (min) {
  return this.test('notEmptyMin', errorsTrads.min, (value) => {
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

const getAttributes = (data) => get(data, ['attributes'], {});

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
          let componentSchema = yup.lazy((value) => {
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
        const componentSchema = yup.lazy((obj) => {
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
          dynamicZoneSchema = dynamicZoneSchema.test('required', errorsTrads.required, (value) => {
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
              .test('min', errorsTrads.min, (value) => {
                if (options.isCreatingEntry) {
                  return value && value.length > 0;
                }

                if (value === undefined) {
                  return true;
                }

                return value !== null && value.length > 0;
              })
              .test('required', errorsTrads.required, (value) => {
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
 * Determines if a value is considered truthy for validation purposes.
 * @param {*} value - The value to evaluate.
 * @returns {boolean}
 */
const isValidationApplicable = (value) =>
  !!value ||
  (!isBoolean(value) && Number.isInteger(Math.floor(value))) ||
  value === 0;

/**
 * Returns the base Yup schema for a given attribute type.
 * @param {string} type - The attribute type.
 * @returns {yup.Schema}
 */
const getBaseSchema = (type) => {
  if (['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type)) {
    return yup.string();
  }

  if (type === 'json') {
    return yup
      .mixed(errorsTrads.json)
      .test('isJSON', errorsTrads.json, (value) => {
        if (value === undefined) {
          return true;
        }

        if (isNumber(value) || isNull(value) || isObject(value) || isArray(value)) {
          return true;
        }

        try {
          JSON.parse(value);
          return true;
        } catch {
          return false;
        }
      })
      .nullable();
  }

  if (['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type)) {
    return yup
      .number()
      .transform((cv) => (isNaN(cv) ? undefined : cv))
      .typeError();
  }

  if (['date', 'datetime'].includes(type)) {
    return yup.date();
  }

  if (type === 'biginteger') {
    return yup.string().matches(/^\d*$/);
  }

  return yup.mixed();
};

/**
 * Applies the 'required' validation to the schema.
 * @param {yup.Schema} schema
 * @param {string} type
 * @param {object} options
 * @returns {yup.Schema}
 */
const applyRequired = (schema, type, options) => {
  if (options.isDraft) {
    return schema;
  }

  if (type === 'password' && options.isCreatingEntry) {
    return schema.required(errorsTrads.required);
  }

  if (type !== 'password') {
    if (options.isCreatingEntry) {
      return schema.required(errorsTrads.required);
    }

    return schema.test('required', errorsTrads.required, (value) => {
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

  return schema;
};

/**
 * Applies the 'max' validation to the schema.
 * @param {yup.Schema} schema
 * @param {string} type
 * @param {*} value
 * @returns {yup.Schema}
 */
const applyMax = (schema, type, value) => {
  if (type === 'biginteger') {
    return schema.isInferior(errorsTrads.max, value);
  }

  return schema.max(value, errorsTrads.max);
};

/**
 * Applies the 'min' validation to the schema.
 * @param {yup.Schema} schema
 * @param {string} type
 * @param {*} value
 * @returns {yup.Schema}
 */
const applyMin = (schema, type, value) => {
  if (type === 'biginteger') {
    return schema.isSuperior(errorsTrads.min, value);
  }

  return schema.min(value, errorsTrads.min);
};

/**
 * Applies the 'minLength' validation to the schema.
 * @param {yup.Schema} schema
 * @param {*} value
 * @param {object} options
 * @returns {yup.Schema}
 */
const applyMinLength = (schema, value, options) => {
  if (options.isDraft) {
    return schema;
  }

  return schema.min(value, errorsTrads.minLength);
};

/**
 * Applies the 'maxLength' validation to the schema.
 * @param {yup.Schema} schema
 * @param {*} value
 * @returns {yup.Schema}
 */
const applyMaxLength = (schema, value) => schema.max(value, errorsTrads.maxLength);

/**
 * Applies the 'regex' validation to the schema.
 * @param {yup.Schema} schema
 * @param {*} value
 * @returns {yup.Schema}
 */
const applyRegex = (schema, value) => schema.matches(new RegExp(value), errorsTrads.regex);

/**
 * Applies the 'lowercase' validation to the schema.
 * @param {yup.Schema} schema
 * @param {string} type
 * @returns {yup.Schema}
 */
const applyLowercase = (schema, type) => {
  if (['text', 'textarea', 'email', 'string'].includes(type)) {
    return schema.strict().lowercase();
  }

  return schema;
};

/**
 * Applies the 'uppercase' validation to the schema.
 * @param {yup.Schema} schema
 * @param {string} type
 * @returns {yup.Schema}
 */
const applyUppercase = (schema, type) => {
  if (['text', 'textarea', 'email', 'string'].includes(type)) {
    return schema.strict().uppercase();
  }

  return schema;
};

/**
 * Applies the 'positive' validation to the schema.
 * @param {yup.Schema} schema
 * @param {string} type
 * @returns {yup.Schema}
 */
const applyPositive = (schema, type) => {
  if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
    return schema.positive();
  }

  return schema;
};

/**
 * Applies the 'negative' validation to the schema.
 * @param {yup.Schema} schema
 * @param {string} type
 * @returns {yup.Schema}
 */
const applyNegative = (schema, type) => {
  if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
    return schema.negative();
  }

  return schema;
};

/**
 * Applies the 'nullable' fallback for unsupported validations.
 * @param {yup.Schema} schema
 * @returns {yup.Schema}
 */
const applyNullable = (schema) => schema.nullable();

/**
 * Creates a Yup schema for a single attribute.
 * @param {string} type - The attribute type.
 * @param {object} validations - Validation rules for the attribute.
 * @param {object} options - Additional options.
 * @returns {yup.Schema}
 */
const createYupSchemaAttribute = (type, validations, options) => {
  let schema = getBaseSchema(type);

  if (type === 'email') {
    schema = schema.email(errorsTrads.email);
  }

  Object.keys(validations).forEach((validation) => {
    const validationValue = validations[validation];

    if (!isValidationApplicable(validationValue)) {
      return;
    }

    switch (validation) {
      case 'required':
        schema = applyRequired(schema, type, options);
        break;
      case 'max':
        schema = applyMax(schema, type, validationValue);
        break;
      case 'maxLength':
        schema = applyMaxLength(schema, validationValue);
        break;
      case 'min':
        schema = applyMin(schema, type, validationValue);
        break;
      case 'minLength':
        schema = applyMinLength(schema, validationValue, options);
        break;
      case 'regex':
        schema = applyRegex(schema, validationValue);
        break;
      case 'lowercase':
        schema = applyLowercase(schema, type);
        break;
      case 'uppercase':
        schema = applyUppercase(schema, type);
        break;
      case 'positive':
        schema = applyPositive(schema, type);
        break;
      case 'negative':
        schema = applyNegative(schema, type);
        break;
      default:
        schema = applyNullable(schema);
    }
  });

  return schema;
};

export default createYupSchema;