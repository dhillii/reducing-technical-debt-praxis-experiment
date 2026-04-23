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

const relationSchema = (attribute) => {
  const oneWayTypes = [
    'oneWay',
    'oneToOne',
    'manyToOne',
    'oneToManyMorph',
    'oneToOneMorph',
  ];
  return oneWayTypes.includes(attribute.relationType)
    ? yup.object().nullable()
    : yup.array().nullable();
};

const componentSchema = (attribute, options, components) => {
  const componentFieldSchema = createYupSchema(
    components[attribute.component],
    { components },
    { ...options, isFromComponent: true }
  );

  if (attribute.repeatable === true) {
    const { min, max, required } = attribute;
    const schema = yup.lazy((value) => {
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

    return schema;
  }

  const schema = yup.lazy((obj) => {
    if (obj !== undefined) {
      return attribute.required === true && !options.isDraft
        ? componentFieldSchema.defined()
        : componentFieldSchema.nullable();
    }

    return attribute.required === true
      ? yup.object().defined()
      : yup.object().nullable();
  });

  return schema;
};

const dynamicZoneSchema = (attribute, options, components) => {
  let schema = yup
    .array()
    .of(
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
    schema = schema.test('required', errorsTrads.required, (value) => {
      if (options.isCreatingEntry) {
        return value !== null || value !== undefined;
      }
      if (value === undefined) {
        return true;
      }
      return value !== null;
    });

    if (min) {
      schema = schema
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
  } else if (min) {
    schema = schema.notEmptyMin(min);
  }

  if (max) {
    schema = schema.max(max, errorsTrads.max);
  }

  return schema;
};

const getAttributeSchema = (attribute, options, components) => {
  if (attribute.type === 'relation') {
    return relationSchema(attribute);
  }
  if (attribute.type === 'component') {
    return componentSchema(attribute, options, components);
  }
  if (attribute.type === 'dynamiczone') {
    return dynamicZoneSchema(attribute, options, components);
  }
  return createYupSchemaAttribute(attribute.type, attribute, options);
};

const createYupSchema = (
  model,
  { components },
  options = { isCreatingEntry: true, isDraft: true, isFromComponent: false }
) => {
  const attributes = getAttributes(model);

  const shape = Object.keys(attributes).reduce((acc, key) => {
    const attribute = attributes[key];
    acc[key] = getAttributeSchema(attribute, options, components);
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

  const applyValidation = (validation, value) => {
    switch (validation) {
      case 'required': {
        if (!options.isDraft) {
          if (type === 'password' && options.isCreatingEntry) {
            schema = schema.required(errorsTrads.required);
          } else if (type !== 'password') {
            if (options.isCreatingEntry) {
              schema = schema.required(errorsTrads.required);
            } else {
              schema = schema.test('required', errorsTrads.required, (val) => {
                if (val === undefined && !options.isFromComponent) {
                  return true;
                }
                if (['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type)) {
                  if (val === 0) {
                    return true;
                  }
                  return !!val;
                }
                if (['date', 'datetime'].includes(type)) {
                  return moment(val)._isValid === true;
                }
                if (type === 'boolean') {
                  return val !== null;
                }
                return !isEmpty(val);
              });
            }
          }
        }
        break;
      }
      case 'max': {
        if (type === 'biginteger') {
          schema = schema.isInferior(errorsTrads.max, value);
        } else {
          schema = schema.max(value, errorsTrads.max);
        }
        break;
      }
      case 'maxLength':
        schema = schema.max(value, errorsTrads.maxLength);
        break;
      case 'min': {
        if (type === 'biginteger') {
          schema = schema.isSuperior(errorsTrads.min, value);
        } else {
          schema = schema.min(value, errorsTrads.min);
        }
        break;
      }
      case 'minLength': {
        if (!options.isDraft) {
          schema = schema.min(value, errorsTrads.minLength);
        }
        break;
      }
      case 'regex':
        schema = schema.matches(new RegExp(value), errorsTrads.regex);
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
  };

  Object.keys(validations).forEach((validation) => {
    const value = validations[validation];
    if (
      !!value ||
      (!isBoolean(value) && Number.isInteger(Math.floor(value))) ||
      value === 0
    ) {
      applyValidation(validation, value);
    }
  });

  return schema;
};

export default createYupSchema;