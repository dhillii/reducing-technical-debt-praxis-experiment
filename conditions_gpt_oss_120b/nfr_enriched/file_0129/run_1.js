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

/**
 * Build Yup schema for a Strapi model.
 */
const createYupSchema = (
  model,
  { components },
  options = { isCreatingEntry: true, isDraft: true, isFromComponent: false }
) => {
  const attributes = getAttributes(model);
  const shape = Object.keys(attributes).reduce((acc, key) => {
    const attribute = attributes[key];
    acc[key] = buildAttributeSchema(attribute, components, options);
    return acc;
  }, {});
  return yup.object().shape(shape);
};

/**
 * Dispatch attribute handling based on its type.
 */
function buildAttributeSchema(attribute, components, options) {
  const { type } = attribute;
  if (type === 'relation') {
    return getRelationSchema(attribute);
  }
  if (type === 'component') {
    return getComponentSchema(attribute, components, options);
  }
  if (type === 'dynamiczone') {
    return getDynamicZoneSchema(attribute, components, options);
  }
  return createYupSchemaAttribute(type, attribute, options);
}

/**
 * Relation attributes are either an object or an array.
 */
function getRelationSchema(attribute) {
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
}

/**
 * Component attributes may be repeatable or single.
 */
function getComponentSchema(attribute, components, options) {
  const componentFieldSchema = createYupSchema(
    components[attribute.component],
    { components },
    { ...options, isFromComponent: true }
  );

  if (attribute.repeatable) {
    return getRepeatableComponentSchema(attribute, componentFieldSchema, options);
  }
  return getSingleComponentSchema(attribute, componentFieldSchema, options);
}

/**
 * Schema for repeatable component fields.
 */
function getRepeatableComponentSchema(attribute, componentFieldSchema, options) {
  const { min, max, required } = attribute;
  return yup.lazy((value) => {
    let base = yup.array().of(componentFieldSchema);
    if (min && !options.isDraft) {
      if (required) {
        base = base.min(min, errorsTrads.min);
      } else if (required !== true && isEmpty(value)) {
        base = base.nullable();
      } else {
        base = base.min(min, errorsTrads.min);
      }
    }
    if (max) {
      base = base.max(max, errorsTrads.max);
    }
    return base;
  });
}

/**
 * Schema for a single component field.
 */
function getSingleComponentSchema(attribute, componentFieldSchema, options) {
  return yup.lazy((obj) => {
    if (obj !== undefined) {
      return attribute.required === true && !options.isDraft
        ? componentFieldSchema.defined()
        : componentFieldSchema.nullable();
    }
    return attribute.required === true
      ? yup.object().defined()
      : yup.object().nullable();
  });
}

/**
 * Dynamic zone attributes are arrays of component schemas.
 */
function getDynamicZoneSchema(attribute, components, options) {
  const base = yup.array().of(
    yup.lazy(({ __component }) =>
      createYupSchema(
        components[__component],
        { components },
        { ...options, isFromComponent: true }
      )
    )
  );

  let schema = base;
  const { min, max, required } = attribute;

  if (required && !options.isDraft) {
    schema = addRequiredTest(schema, options);
    if (min) {
      schema = addMinTests(schema, options);
    }
  } else if (min) {
    schema = schema.notEmptyMin(min);
  }

  if (max) {
    schema = schema.max(max, errorsTrads.max);
  }

  return schema;
}

/**
 * Adds a generic required test for dynamic zones.
 */
function addRequiredTest(schema, options) {
  return schema.test('required', errorsTrads.required, (value) => {
    if (options.isCreatingEntry) {
      return value !== null && value !== undefined;
    }
    if (value === undefined) {
      return true;
    }
    return value !== null;
  });
}

/**
 * Adds min‑length and required tests for dynamic zones.
 */
function addMinTests(schema, options) {
  return schema
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

/**
 * Build Yup schema for a primitive attribute based on its type and validations.
 */
function createYupSchemaAttribute(type, validations, options) {
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

  Object.keys(validations).forEach((validation) => {
    const validationValue = validations[validation];
    if (
      !!validationValue ||
      (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
      validationValue === 0
    ) {
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
        case 'max':
          schema =
            type === 'biginteger'
              ? schema.isInferior(errorsTrads.max, validationValue)
              : schema.max(validationValue, errorsTrads.max);
          break;
        case 'maxLength':
          schema = schema.max(validationValue, errorsTrads.maxLength);
          break;
        case 'min':
          schema =
            type === 'biginteger'
              ? schema.isSuperior(errorsTrads.min, validationValue)
              : schema.min(validationValue, errorsTrads.min);
          break;
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
    }
  });

  return schema;
}

export default createYupSchema;