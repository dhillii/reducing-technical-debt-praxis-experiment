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

const buildRelationSchema = attribute => {
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

const buildComponentSchema = (attribute, components, options) => {
  const componentFieldSchema = createYupSchema(
    components[attribute.component],
    { components },
    { ...options, isFromComponent: true }
  );

  if (attribute.repeatable === true) {
    const { min, max, required } = attribute;
    const componentSchema = yup.lazy(value => {
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

    return componentSchema;
  }

  const componentSchema = yup.lazy(obj => {
    if (obj !== undefined) {
      return attribute.required === true && !options.isDraft
        ? componentFieldSchema.defined()
        : componentFieldSchema.nullable();
    }
    return attribute.required === true ? yup.object().defined() : yup.object().nullable();
  });

  return componentSchema;
};

const buildDynamicZoneSchema = (attribute, components, options) => {
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

  return dynamicZoneSchema;
};

const applyValidation = (schema, validation, value, type, options) => {
  switch (validation) {
    case 'required':
      if (!options.isDraft) {
        if (type === 'password' && options.isCreatingEntry) {
          return schema.required(errorsTrads.required);
        }
        if (type !== 'password') {
          if (options.isCreatingEntry) {
            return schema.required(errorsTrads.required);
          }
          return schema.test('required', errorsTrads.required, val => {
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
      return schema;
    case 'max':
      if (type === 'biginteger') {
        return schema.isInferior(errorsTrads.max, value);
      }
      return schema.max(value, errorsTrads.max);
    case 'maxLength':
      return schema.max(value, errorsTrads.maxLength);
    case 'min':
      if (type === 'biginteger') {
        return schema.isSuperior(errorsTrads.min, value);
      }
      return schema.min(value, errorsTrads.min);
    case 'minLength':
      if (!options.isDraft) {
        return schema.min(value, errorsTrads.minLength);
      }
      return schema;
    case 'regex':
      return schema.matches(new RegExp(value), errorsTrads.regex);
    case 'lowercase':
      if (['text', 'textarea', 'email', 'string'].includes(type)) {
        return schema.strict().lowercase();
      }
      return schema;
    case 'uppercase':
      if (['text', 'textarea', 'email', 'string'].includes(type)) {
        return schema.strict().uppercase();
      }
      return schema;
    case 'positive':
      if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
        return schema.positive();
      }
      return schema;
    case 'negative':
      if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
        return schema.negative();
      }
      return schema;
    default:
      return schema.nullable();
  }
};

const buildAttributeSchema = (type, validations, options) => {
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
      schema = applyValidation(schema, validation, validationValue, type, options);
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

  const shape = Object.keys(attributes).reduce((acc, key) => {
    const attribute = attributes[key];
    let schema;
    switch (attribute.type) {
      case 'relation':
        schema = buildRelationSchema(attribute);
        break;
      case 'component':
        schema = buildComponentSchema(attribute, components, options);
        break;
      case 'dynamiczone':
        schema = buildDynamicZoneSchema(attribute, components, options);
        break;
      default:
        schema = buildAttributeSchema(attribute.type, attribute, options);
    }
    acc[key] = schema;
    return acc;
  }, {});

  return yup.object().shape(shape);
};

export default createYupSchema;