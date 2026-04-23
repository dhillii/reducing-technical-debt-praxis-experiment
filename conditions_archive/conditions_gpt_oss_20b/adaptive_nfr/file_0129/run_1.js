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
 * Determines if the type is a string-like type.
 * @param {string} type
 * @returns {boolean}
 */
const isStringType = (type) => {
  return ['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type);
};

/**
 * Determines if the type is a number-like type.
 * @param {string} type
 * @returns {boolean}
 */
const isNumberType = (type) => {
  return ['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type);
};

/**
 * Determines if the type is a date-like type.
 * @param {string} type
 * @returns {boolean}
 */
const isDateType = (type) => {
  return ['date', 'datetime'].includes(type);
};

/**
 * Determines if the type is a big integer type.
 * @param {string} type
 * @returns {boolean}
 */
const isBigIntegerType = (type) => {
  return type === 'biginteger';
};

/**
 * Applies the required validation to the schema.
 * @param {yup.Schema} schema
 * @param {string} type
 * @param {boolean} isDraft
 * @param {boolean} isCreatingEntry
 * @param {boolean} isFromComponent
 * @returns {yup.Schema}
 */
const applyRequired = (schema, type, isDraft, isCreatingEntry, isFromComponent) => {
  if (isDraft) {
    return schema;
  }

  if (type === 'password' && isCreatingEntry) {
    return schema.required(errorsTrads.required);
  }

  if (type !== 'password') {
    if (isCreatingEntry) {
      return schema.required(errorsTrads.required);
    }

    return schema.test('required', errorsTrads.required, (value) => {
      if (value === undefined && !isFromComponent) {
        return true;
      }

      if (isNumberType(type)) {
        if (value === 0) {
          return true;
        }
        return !!value;
      }

      if (isDateType(type)) {
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
 * Applies the max validation to the schema.
 * @param {yup.Schema} schema
 * @param {string} type
 * @param {any} value
 * @returns {yup.Schema}
 */
const applyMax = (schema, type, value) => {
  if (isBigIntegerType(type)) {
    return schema.isInferior(errorsTrads.max, value);
  }
  return schema.max(value, errorsTrads.max);
};

/**
 * Applies the min validation to the schema.
 * @param {yup.Schema} schema
 * @param {string} type
 * @param {any} value
 * @returns {yup.Schema}
 */
const applyMin = (schema, type, value) => {
  if (isBigIntegerType(type)) {
    return schema.isSuperior(errorsTrads.min, value);
  }
  return schema.min(value, errorsTrads.min);
};

/**
 * Applies the minLength validation to the schema.
 * @param {yup.Schema} schema
 * @param {boolean} isDraft
 * @param {any} value
 * @returns {yup.Schema}
 */
const applyMinLength = (schema, isDraft, value) => {
  if (!isDraft) {
    return schema.min(value, errorsTrads.minLength);
  }
  return schema;
};

/**
 * Applies the maxLength validation to the schema.
 * @param {yup.Schema} schema
 * @param {any} value
 * @returns {yup.Schema}
 */
const applyMaxLength = (schema, value) => {
  return schema.max(value, errorsTrads.maxLength);
};

/**
 * Applies the regex validation to the schema.
 * @param {yup.Schema} schema
 * @param {string} value
 * @returns {yup.Schema}
 */
const applyRegex = (schema, value) => {
  return schema.matches(new RegExp(value), errorsTrads.regex);
};

/**
 * Applies the lowercase validation to the schema.
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
 * Applies the uppercase validation to the schema.
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
 * Applies the positive validation to the schema.
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
 * Applies the negative validation to the schema.
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
 * Applies the default nullable fallback to the schema.
 * @param {yup.Schema} schema
 * @returns {yup.Schema}
 */
const applyNullable = (schema) => {
  return schema.nullable();
};

const createYupSchemaAttribute = (type, validations, options) => {
  let schema = yup.mixed();

  if (isStringType(type)) {
    schema = yup.string();
  }

  if (type === 'json') {
    schema = yup
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
        } catch (err) {
          return false;
        }
      })
      .nullable();
  }

  if (type === 'email') {
    schema = schema.email(errorsTrads.email);
  }

  if (isNumberType(type)) {
    schema = yup
      .number()
      .transform((cv) => (isNaN(cv) ? undefined : cv))
      .typeError();
  }

  if (isDateType(type)) {
    schema = yup.date();
  }

  if (isBigIntegerType(type)) {
    schema = yup.string().matches(/^\d*$/);
  }

  Object.keys(validations).forEach((validation) => {
    const validationValue = validations[validation];

    if (
      !!validationValue ||
      (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
      validationValue === 0
    ) {
      switch (validation) {
        case 'required':
          schema = applyRequired(
            schema,
            type,
            options.isDraft,
            options.isCreatingEntry,
            options.isFromComponent
          );
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
          schema = applyMinLength(schema, options.isDraft, validationValue);
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
    }
  });

  return schema;
};

export default createYupSchema;