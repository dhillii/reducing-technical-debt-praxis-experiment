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
  return this.test('notEmptyMin', errorsTrads.min, (value) => (isEmpty(value) ? true : value.length >= min));
});

yup.addMethod(yup.string, 'isInferior', function (message, max) {
  return this.test('isInferior', message, (value) => {
    if (!value) return true;
    if (Number.isNaN(toNumber(value))) return true;
    return toNumber(max) >= toNumber(value);
  });
});

yup.addMethod(yup.string, 'isSuperior', function (message, min) {
  return this.test('isSuperior', message, (value) => {
    if (!value) return true;
    if (Number.isNaN(toNumber(value))) return true;
    return toNumber(value) >= toNumber(min);
  });
});

const getAttributes = (data) => get(data, ['attributes'], {});

/**
 * Build Yup schema for a simple (non-relation/component/dynamiczone) attribute.
 */
const buildSimpleAttributeSchema = (attribute, options) => {
  return createYupSchemaAttribute(attribute.type, attribute, options);
};

/**
 * Build Yup schema for a relation attribute.
 */
const buildRelationSchema = (attribute) => {
  const oneWayTypes = ['oneWay', 'oneToOne', 'manyToOne', 'oneToManyMorph', 'oneToOneMorph'];
  return oneWayTypes.includes(attribute.relationType) ? yup.object().nullable() : yup.array().nullable();
};

/**
 * Build Yup schema for a repeatable component attribute.
 */
const buildRepeatableComponentSchema = (attribute, componentFieldSchema, options) => {
  const { min, max, required } = attribute;
  return yup.lazy((value) => {
    let base = yup.array().of(componentFieldSchema);

    if (min && !options.isDraft) {
      if (required) {
        base = base.min(min, errorsTrads.min);
      } else if (!isEmpty(value)) {
        base = base.min(min, errorsTrads.min);
      } else {
        base = base.nullable();
      }
    }

    if (max) {
      base = base.max(max, errorsTrads.max);
    }

    return base;
  });
};

/**
 * Build Yup schema for a single (non‑repeatable) component attribute.
 */
const buildSingleComponentSchema = (attribute, componentFieldSchema, options) => {
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

/**
 * Build Yup schema for a component attribute (repeatable or not).
 */
const buildComponentSchema = (attribute, components, options) => {
  const componentFieldSchema = createYupSchema(
    components[attribute.component],
    { components },
    { ...options, isFromComponent: true }
  );

  if (attribute.repeatable) {
    return buildRepeatableComponentSchema(attribute, componentFieldSchema, options);
  }

  return buildSingleComponentSchema(attribute, componentFieldSchema, options);
};

/**
 * Build Yup schema for a dynamic zone attribute.
 */
const buildDynamicZoneSchema = (attribute, components, options) => {
  let schema = yup.array().of(
    yup.lazy(({ __component }) =>
      createYupSchema(components[__component], { components }, { ...options, isFromComponent: true })
    )
  );

  const { min, max, required } = attribute;

  if (required && !options.isDraft) {
    schema = schema.test('required', errorsTrads.required, (value) => {
      if (options.isCreatingEntry) return value !== null && value !== undefined;
      if (value === undefined) return true;
      return value !== null;
    });

    if (min) {
      schema = schema
        .test('min', errorsTrads.min, (value) => {
          if (options.isCreatingEntry) return value && value.length > 0;
          if (value === undefined) return true;
          return value !== null && value.length > 0;
        })
        .test('required', errorsTrads.required, (value) => {
          if (options.isCreatingEntry) return value !== null && value !== undefined;
          if (value === undefined) return true;
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

/**
 * Main schema builder – iterates over model attributes and delegates to specialised helpers.
 */
const createYupSchema = (
  model,
  { components },
  options = { isCreatingEntry: true, isDraft: true, isFromComponent: false }
) => {
  const attributes = getAttributes(model);

  const shape = Object.keys(attributes).reduce((acc, key) => {
    const attribute = attributes[key];

    if (attribute.type === 'relation') {
      acc[key] = buildRelationSchema(attribute);
    } else if (attribute.type === 'component') {
      acc[key] = buildComponentSchema(attribute, components, options);
    } else if (attribute.type === 'dynamiczone') {
      acc[key] = buildDynamicZoneSchema(attribute, components, options);
    } else {
      acc[key] = buildSimpleAttributeSchema(attribute, options);
    }

    return acc;
  }, {});

  return yup.object().shape(shape);
};

/**
 * Generates Yup schema for a primitive attribute based on its type and validation rules.
 */
const createYupSchemaAttribute = (type, validations, options) => {
  let schema = yup.mixed();

  if (['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type)) {
    schema = yup.string();
  }

  if (type === 'json') {
    schema = yup
      .mixed(errorsTrads.json)
      .test('isJSON', errorsTrads.json, (value) => {
        if (value === undefined) return true;
        if (isNumber(value) || isNull(value) || isObject(value) || isArray(value)) return true;
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

    if (!shouldApply) return;

    switch (validation) {
      case 'required':
        if (!options.isDraft) {
          if (type === 'password' && options.isCreatingEntry) {
            schema = schema.required(errorsTrads.required);
          } else if (type !== 'password') {
            if (options.isCreatingEntry) {
              schema = schema.required(errorsTrads.required);
            } else {
              schema = schema.test('required', errorsTrads.required, (value) => {
                if (value === undefined && !options.isFromComponent) return true;
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

      case 'max':
        schema = type === 'biginteger' ? schema.isInferior(errorsTrads.max, validationValue) : schema.max(validationValue, errorsTrads.max);
        break;

      case 'maxLength':
        schema = schema.max(validationValue, errorsTrads.maxLength);
        break;

      case 'min':
        schema = type === 'biginteger' ? schema.isSuperior(errorsTrads.min, validationValue) : schema.min(validationValue, errorsTrads.min);
        break;

      case 'minLength':
        if (!options.isDraft) schema = schema.min(validationValue, errorsTrads.minLength);
        break;

      case 'regex':
        schema = schema.matches(new RegExp(validationValue), errorsTrads.regex);
        break;

      case 'lowercase':
        if (['text', 'textarea', 'email', 'string'].includes(type)) schema = schema.strict().lowercase();
        break;

      case 'uppercase':
        if (['text', 'textarea', 'email', 'string'].includes(type)) schema = schema.strict().uppercase();
        break;

      case 'positive':
        if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) schema = schema.positive();
        break;

      case 'negative':
        if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) schema = schema.negative();
        break;

      default:
        schema = schema.nullable();
    }
  });

  return schema;
};

export default createYupSchema;