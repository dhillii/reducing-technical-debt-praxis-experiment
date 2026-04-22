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
 * Guard: attribute is a simple field (not relation/component/dynamiczone)
 */
const isSimpleAttribute = (attr) =>
  attr.type !== 'relation' && attr.type !== 'component' && attr.type !== 'dynamiczone';

/**
 * Guard: attribute is a relation field
 */
const isRelationAttribute = (attr) => attr.type === 'relation';

/**
 * Guard: attribute is a component field
 */
const isComponentAttribute = (attr) => attr.type === 'component';

/**
 * Guard: attribute is a dynamic zone field
 */
const isDynamicZoneAttribute = (attr) => attr.type === 'dynamiczone';

/**
 * Build schema for simple attributes
 */
const buildSimpleAttributeSchema = (type, attr, options) =>
  createYupSchemaAttribute(type, attr, options);

/**
 * Build schema for relation attributes
 */
const buildRelationAttributeSchema = (attr) => {
  const relationTypes = [
    'oneWay',
    'oneToOne',
    'manyToOne',
    'oneToManyMorph',
    'oneToOneMorph',
  ];
  return relationTypes.includes(attr.relationType) ? yup.object().nullable() : yup.array().nullable();
};

/**
 * Build schema for repeatable component attributes
 */
const buildRepeatableComponentSchema = (attribute, componentFieldSchema, options) => {
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
};

/**
 * Build schema for single component attributes
 */
const buildSingleComponentSchema = (attribute, componentFieldSchema, options) =>
  yup.lazy((obj) => {
    if (obj !== undefined) {
      return attribute.required === true && !options.isDraft
        ? componentFieldSchema.defined()
        : componentFieldSchema.nullable();
    }
    return attribute.required === true ? yup.object().defined() : yup.object().nullable();
  });

/**
 * Build schema for component attributes (repeatable or not)
 */
const buildComponentAttributeSchema = (attribute, components, options) => {
  const componentFieldSchema = createYupSchema(
    components[attribute.component],
    { components },
    { ...options, isFromComponent: true }
  );

  if (attribute.repeatable === true) {
    return buildRepeatableComponentSchema(attribute, componentFieldSchema, options);
  }
  return buildSingleComponentSchema(attribute, componentFieldSchema, options);
};

/**
 * Guard: dynamic zone has a min constraint
 */
const hasMin = (attr) => !!attr.min;

/**
 * Guard: dynamic zone has a max constraint
 */
const hasMax = (attr) => !!attr.max;

/**
 * Build required test for dynamic zone
 */
const dynamicZoneRequiredTest = (schema, options) =>
  schema.test('required', errorsTrads.required, (value) => {
    if (options.isCreatingEntry) {
      return value !== null && value !== undefined;
    }
    if (value === undefined) {
      return true;
    }
    return value !== null;
  });

/**
 * Build min test for dynamic zone
 */
const dynamicZoneMinTest = (schema, options) =>
  schema.test('min', errorsTrads.min, (value) => {
    if (options.isCreatingEntry) {
      return value && value.length > 0;
    }
    if (value === undefined) {
      return true;
    }
    return value !== null && value.length > 0;
  });

/**
 * Build schema for dynamic zone attributes
 */
const buildDynamicZoneAttributeSchema = (attribute, components, options) => {
  let dzSchema = yup.array().of(
    yup.lazy(({ __component }) =>
      createYupSchema(components[__component], { components }, { ...options, isFromComponent: true })
    )
  );

  if (attribute.required && !options.isDraft) {
    dzSchema = dynamicZoneRequiredTest(dzSchema, options);
    if (hasMin(attribute)) {
      dzSchema = dynamicZoneMinTest(dzSchema, options);
      dzSchema = dynamicZoneRequiredTest(dzSchema, options);
    }
  } else if (hasMin(attribute)) {
    dzSchema = dzSchema.notEmptyMin(attribute.min);
  }

  if (hasMax(attribute)) {
    dzSchema = dzSchema.max(attribute.max, errorsTrads.max);
  }

  return dzSchema;
};

/**
 * Main schema creator
 */
const createYupSchema = (
  model,
  { components },
  options = { isCreatingEntry: true, isDraft: true, isFromComponent: false }
) => {
  const attributes = getAttributes(model);

  const shape = Object.keys(attributes).reduce((acc, key) => {
    const attribute = attributes[key];

    if (isSimpleAttribute(attribute)) {
      acc[key] = buildSimpleAttributeSchema(attribute.type, attribute, options);
      return acc;
    }

    if (isRelationAttribute(attribute)) {
      acc[key] = buildRelationAttributeSchema(attribute);
      return acc;
    }

    if (isComponentAttribute(attribute)) {
      acc[key] = buildComponentAttributeSchema(attribute, components, options);
      return acc;
    }

    if (isDynamicZoneAttribute(attribute)) {
      acc[key] = buildDynamicZoneAttributeSchema(attribute, components, options);
      return acc;
    }

    return acc;
  }, {});

  return yup.object().shape(shape);
};

/**
 * Guard: validation value is meaningful
 */
const hasValidationValue = (val) =>
  !!val || (!isBoolean(val) && Number.isInteger(Math.floor(val))) || val === 0;

/**
 * Guard: validation is required
 */
const isRequiredValidation = (type, options) => (type !== 'password' || options.isCreatingEntry);

/**
 * Guard: value is a number type
 */
const isNumberType = (type) =>
  ['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type);

/**
 * Guard: value is a date type
 */
const isDateType = (type) => ['date', 'datetime'].includes(type);

/**
 * Guard: value is a boolean type
 */
const isBooleanType = (type) => type === 'boolean';

/**
 * Guard: value is a string-like type
 */
const isStringLikeType = (type) => ['text', 'textarea', 'email', 'string'].includes(type);

/**
 * Build schema for attribute validations
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
    if (!hasValidationValue(validationValue)) {
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
                if (isNumberType(type)) {
                  return value === 0 || !!value;
                }
                if (isDateType(type)) {
                  return moment(value)._isValid === true;
                }
                if (isBooleanType(type)) {
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
        if (type === 'biginteger') {
          schema = schema.isInferior(errorsTrads.max, validationValue);
        } else {
          schema = schema.max(validationValue, errorsTrads.max);
        }
        break;
      }
      case 'maxLength':
        schema = schema.max(validationValue, errorsTrads.maxLength);
        break;
      case 'min': {
        if (type === 'biginteger') {
          schema = schema.isSuperior(errorsTrads.min, validationValue);
        } else {
          schema = schema.min(validationValue, errorsTrads.min);
        }
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
        if (isStringLikeType(type)) {
          schema = schema.strict().lowercase();
        }
        break;
      case 'uppercase':
        if (isStringLikeType(type)) {
          schema = schema.strict().uppercase();
        }
        break;
      case 'positive':
        if (isNumberType(type)) {
          schema = schema.positive();
        }
        break;
      case 'negative':
        if (isNumberType(type)) {
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