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
 * Determines if a validation should be applied based on its value and the attribute type.
 * @param {string} validation - The validation key.
 * @param {*} value - The validation value.
 * @param {boolean} isDraft - Indicates if the entry is a draft.
 * @param {string} type - The attribute type.
 * @returns {boolean}
 */
const shouldApplyValidation = (validation, value, isDraft, type) => {
  if (!value && !isBoolean(value) && !Number.isInteger(Math.floor(value))) {
    return false;
  }

  if (validation === 'required' && isDraft) {
    return false;
  }

  return true;
};

/**
 * Applies the required validation to the schema.
 * @param {yup.Schema} schema - The current schema.
 * @param {Object} options - Options object.
 * @param {string} type - Attribute type.
 * @returns {yup.Schema}
 */
const applyRequired = (schema, options, type) => {
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
 * Applies the max validation to the schema.
 * @param {yup.Schema} schema - The current schema.
 * @param {string} type - Attribute type.
 * @param {*} value - Validation value.
 * @returns {yup.Schema}
 */
const applyMax = (schema, type, value) => {
  if (type === 'biginteger') {
    return schema.isInferior(errorsTrads.max, value);
  }

  return schema.max(value, errorsTrads.max);
};

/**
 * Applies the min validation to the schema.
 * @param {yup.Schema} schema - The current schema.
 * @param {string} type - Attribute type.
 * @param {*} value - Validation value.
 * @returns {yup.Schema}
 */
const applyMin = (schema, type, value) => {
  if (type === 'biginteger') {
    return schema.isSuperior(errorsTrads.min, value);
  }

  return schema.min(value, errorsTrads.min);
};

/**
 * Applies the maxLength validation to the schema.
 * @param {yup.Schema} schema - The current schema.
 * @param {*} value - Validation value.
 * @returns {yup.Schema}
 */
const applyMaxLength = (schema, value) => {
  return schema.max(value, errorsTrads.maxLength);
};

/**
 * Applies the minLength validation to the schema.
 * @param {yup.Schema} schema - The current schema.
 * @param {*} value - Validation value.
 * @param {Object} options - Options object.
 * @returns {yup.Schema}
 */
const applyMinLength = (schema, value, options) => {
  if (!options.isDraft) {
    return schema.min(value, errorsTrads.minLength);
  }

  return schema;
};

/**
 * Applies the regex validation to the schema.
 * @param {yup.Schema} schema - The current schema.
 * @param {*} value - Validation value.
 * @returns {yup.Schema}
 */
const applyRegex = (schema, value) => {
  return schema.matches(new RegExp(value), errorsTrads.regex);
};

/**
 * Applies case transformations to the schema.
 * @param {yup.Schema} schema - The current schema.
 * @param {string} type - Attribute type.
 * @param {'lowercase'|'uppercase'} caseType - Case type.
 * @returns {yup.Schema}
 */
const applyCase = (schema, type, caseType) => {
  if (!['text', 'textarea', 'email', 'string'].includes(type)) {
    return schema;
  }

  return schema.strict()[caseType]();
};

/**
 * Applies sign validations to the schema.
 * @param {yup.Schema} schema - The current schema.
 * @param {string} type - Attribute type.
 * @param {'positive'|'negative'} signType - Sign type.
 * @returns {yup.Schema}
 */
const applySign = (schema, type, signType) => {
  if (!['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
    return schema;
  }

  return schema[signType]();
};

const createYupSchemaAttribute = (type, validations, options) => {
  let schema = yup.mixed();

  if (['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type)) {
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

  if (['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type)) {
    schema = yup
      .number()
      .transform((cv) => (isNaN(cv) ? undefined : cv))
      .typeError();
  }

  if (['date', 'datetime'].includes(type)) {
    schema = yup.date();
  }

  if (type === 'biginteger') {
    schema = yup.string().matches(/^\d*$/);
  }

  Object.keys(validations).forEach((validation) => {
    const validationValue = validations[validation];

    if (!shouldApplyValidation(validation, validationValue, options.isDraft, type)) {
      return;
    }

    switch (validation) {
      case 'required':
        schema = applyRequired(schema, options, type);
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
        schema = applyCase(schema, type, 'lowercase');
        break;
      case 'uppercase':
        schema = applyCase(schema, type, 'uppercase');
        break;
      case 'positive':
        schema = applySign(schema, type, 'positive');
        break;
      case 'negative':
        schema = applySign(schema, type, 'negative');
        break;
      default:
        schema = schema.nullable();
    }
  });

  return schema;
};

export default createYupSchema;