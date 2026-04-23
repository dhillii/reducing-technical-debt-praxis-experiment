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

const isStringLike = type =>
  ['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type);

const isNumberLike = type =>
  ['number', 'integer', 'float', 'decimal'].includes(type);

const isDateLike = type => ['date', 'datetime'].includes(type);

const isBigInteger = type => type === 'biginteger';

const isJsonType = type => type === 'json';

const isEmailType = type => type === 'email';

const isPasswordType = type => type === 'password';

const isBooleanType = type => type === 'boolean';

const shouldApplyValidation = (validation, value) =>
  !!value ||
  (!isBoolean(value) && Number.isInteger(Math.floor(value))) ||
  value === 0;

const isJSONValid = value => {
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
};

const applyRequired = (schema, type, options) => {
  if (options.isDraft) {
    return schema;
  }
  if (isPasswordType(type) && options.isCreatingEntry) {
    return schema.required(errorsTrads.required);
  }
  if (!isPasswordType(type)) {
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
      if (isDateLike(type)) {
        return moment(value)._isValid === true;
      }
      if (isBooleanType(type)) {
        return value !== null;
      }
      return !isEmpty(value);
    });
  }
  return schema;
};

const applyMax = (schema, type, value) => {
  if (isBigInteger(type)) {
    return schema.isInferior(errorsTrads.max, value);
  }
  return schema.max(value, errorsTrads.max);
};

const applyMin = (schema, type, value) => {
  if (isBigInteger(type)) {
    return schema.isSuperior(errorsTrads.min, value);
  }
  return schema.min(value, errorsTrads.min);
};

const applyValidation = (schema, type, validation, value, options) => {
  switch (validation) {
    case 'required':
      return applyRequired(schema, type, options);
    case 'max':
      return applyMax(schema, type, value);
    case 'maxLength':
      return schema.max(value, errorsTrads.maxLength);
    case 'min':
      return applyMin(schema, type, value);
    case 'minLength':
      return !options.isDraft ? schema.min(value, errorsTrads.minLength) : schema;
    case 'regex':
      return schema.matches(new RegExp(value), errorsTrads.regex);
    case 'lowercase':
      return isStringLike(type) ? schema.strict().lowercase() : schema;
    case 'uppercase':
      return isStringLike(type) ? schema.strict().uppercase() : schema;
    case 'positive':
      return isNumberLike(type) ? schema.positive() : schema;
    case 'negative':
      return isNumberLike(type) ? schema.negative() : schema;
    default:
      return schema.nullable();
  }
};

const getBaseSchema = type => {
  if (isStringLike(type)) {
    return yup.string();
  }
  if (isNumberLike(type)) {
    return yup
      .number()
      .transform(cv => (isNaN(cv) ? undefined : cv))
      .typeError();
  }
  if (isDateLike(type)) {
    return yup.date();
  }
  if (isBigInteger(type)) {
    return yup.string().matches(/^\d*$/);
  }
  if (isJsonType(type)) {
    return yup.mixed(errorsTrads.json);
  }
  return yup.mixed();
};

const createYupSchemaAttribute = (type, validations, options) => {
  let schema = getBaseSchema(type);

  if (isEmailType(type)) {
    schema = schema.email(errorsTrads.email);
  }

  if (isJsonType(type)) {
    schema = schema
      .test('isJSON', errorsTrads.json, isJSONValid)
      .nullable();
  }

  Object.entries(validations).forEach(([validation, value]) => {
    if (shouldApplyValidation(validation, value)) {
      schema = applyValidation(schema, type, validation, value, options);
    }
  });

  return schema;
};

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

export default createYupSchema;