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

const handleSimpleAttribute = (key, attribute, options, acc) => {
  if (
    attribute.type !== 'relation' &&
    attribute.type !== 'component' &&
    attribute.type !== 'dynamiczone'
  ) {
    acc[key] = createYupSchemaAttribute(attribute.type, attribute, options);
  }
};

const handleRelation = (key, attribute, acc) => {
  if (attribute.type === 'relation') {
    const isSingle =
      ['oneWay', 'oneToOne', 'manyToOne', 'oneToManyMorph', 'oneToOneMorph'].includes(
        attribute.relationType
      );
    acc[key] = isSingle ? yup.object().nullable() : yup.array().nullable();
  }
};

const buildComponentSchema = (attribute, components, options) => {
  const componentFieldSchema = createYupSchema(components[attribute.component], {
    components,
  }, { ...options, isFromComponent: true });

  if (attribute.repeatable) {
    return yup.lazy((value) => {
      let schema = yup.array().of(componentFieldSchema);
      const { min, max, required } = attribute;

      if (min && !options.isDraft) {
        if (required) {
          schema = schema.min(min, errorsTrads.min);
        } else if (!required && isEmpty(value)) {
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

  return yup.lazy((obj) => {
    if (obj !== undefined) {
      return attribute.required && !options.isDraft
        ? componentFieldSchema.defined()
        : componentFieldSchema.nullable();
    }
    return attribute.required
      ? yup.object().defined()
      : yup.object().nullable();
  });
};

const handleComponent = (key, attribute, components, options, acc) => {
  if (attribute.type === 'component') {
    acc[key] = buildComponentSchema(attribute, components, options);
  }
};

const handleDynamicZone = (key, attribute, components, options, acc) => {
  if (attribute.type !== 'dynamiczone') {
    return;
  }

  let schema = yup.array().of(
    yup.lazy(({ __component }) =>
      createYupSchema(components[__component], { components }, { ...options, isFromComponent: true })
    )
  );

  const { min, max, required } = attribute;

  if (required && !options.isDraft) {
    schema = schema.test('required', errorsTrads.required, (value) => {
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

  acc[key] = schema;
};

export const createYupSchema = (
  model,
  { components },
  options = { isCreatingEntry: true, isDraft: true, isFromComponent: false }
) => {
  const attributes = getAttributes(model);
  const shape = {};

  Object.entries(attributes).forEach(([key, attribute]) => {
    handleSimpleAttribute(key, attribute, options, shape);
    handleRelation(key, attribute, shape);
    handleComponent(key, attribute, components, options, shape);
    handleDynamicZone(key, attribute, components, options, shape);
  });

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

  Object.entries(validations).forEach(([validation, validationValue]) => {
    const shouldApply =
      !!validationValue ||
      (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
      validationValue === 0;

    if (!shouldApply) {
      return;
    }

    switch (validation) {
      case 'required': {
        if (!options.isDraft) {
          if (type === 'password' && options.isCreatingEntry) {
            schema = schema.required(errorsTrads.required);
          } else if (type !== 'password') {
            if (options.isCreatingEntry) {
              schema = schema.required(errorsTrads.required);
            } else {
              schema = schema.test('required', errorsTrads.required, (value) => {
                if (value === undefined && !options.isFromComponent) {
                  return true;
                }
                if (['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type)) {
                  return value === 0 || !!value;
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
        schema =
          type === 'biginteger'
            ? schema.isInferior(errorsTrads.max, validationValue)
            : schema.max(validationValue, errorsTrads.max);
        break;
      }
      case 'maxLength':
        schema = schema.max(validationValue, errorsTrads.maxLength);
        break;
      case 'min': {
        schema =
          type === 'biginteger'
            ? schema.isSuperior(errorsTrads.min, validationValue)
            : schema.min(validationValue, errorsTrads.min);
        break;
      }
      case 'minLength':
        if (!options.isDraft) {
          schema = schema.min(validationValue, errorsTrads.minLength);
        }
        break;
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
  });

  return schema;
};

export default createYupSchema;