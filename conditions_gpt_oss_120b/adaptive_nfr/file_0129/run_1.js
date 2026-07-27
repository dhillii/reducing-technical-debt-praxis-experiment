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
 * Guard: attribute is a simple (non-relation/component/dynamiczone) field.
 */
const isSimpleAttribute = (attr) =>
  attr.type !== 'relation' && attr.type !== 'component' && attr.type !== 'dynamiczone';

/**
 * Guard: attribute is a relation field.
 */
const isRelationAttribute = (attr) => attr.type === 'relation';

/**
 * Guard: attribute is a component field.
 */
const isComponentAttribute = (attr) => attr.type === 'component';

/**
 * Guard: attribute is a dynamic zone field.
 */
const isDynamicZoneAttribute = (attr) => attr.type === 'dynamiczone';

/**
 * Build schema for simple attributes.
 */
const buildSimpleAttributeSchema = (attribute, options) => {
  const formatted = createYupSchemaAttribute(attribute.type, attribute, options);
  return formatted;
};

/**
 * Build schema for relation attributes.
 */
const buildRelationAttributeSchema = (attribute) => {
  const relationTypes = [
    'oneWay',
    'oneToOne',
    'manyToOne',
    'oneToManyMorph',
    'oneToOneMorph',
  ];
  if (relationTypes.includes(attribute.relationType)) {
    return yup.object().nullable();
  }
  return yup.array().nullable();
};

/**
 * Build schema for component attributes.
 */
const buildComponentAttributeSchema = (attribute, components, options) => {
  const componentFieldSchema = createYupSchema(
    components[attribute.component],
    { components },
    { ...options, isFromComponent: true }
  );

  if (attribute.repeatable === true) {
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

  return yup.lazy((obj) => {
    if (obj !== undefined) {
      if (attribute.required === true && !options.isDraft) {
        return componentFieldSchema.defined();
      }
      return componentFieldSchema.nullable();
    }
    if (attribute.required === true) {
      return yup.object().defined();
    }
    return yup.object().nullable();
  });
};

/**
 * Build schema for dynamic zone attributes.
 */
const buildDynamicZoneAttributeSchema = (attribute, components, options) => {
  let dynamicZoneSchema = yup.array().of(
    yup.lazy(({ __component }) =>
      createYupSchema(
        components[__component],
        { components },
        { ...options, isFromComponent: true }
      )
    )
  );

  const { max, min, required } = attribute;

  if (required && !options.isDraft) {
    dynamicZoneSchema = dynamicZoneSchema.test('required', errorsTrads.required, (value) => {
      if (options.isCreatingEntry) {
        return value !== null && value !== undefined;
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
            return value !== null && value !== undefined;
          }
          if (value === undefined) {
            return true;
          }
          return value !== null;
        });
    }
  } else if (min) {
    dynamicZoneSchema = dynamicZoneSchema.notEmptyMin(min);
  }

  if (max) {
    dynamicZoneSchema = dynamicZoneSchema.max(max, errorsTrads.max);
  }

  return dynamicZoneSchema;
};

/**
 * Main schema creator.
 */
const createYupSchema = (
  model,
  { components },
  options = { isCreatingEntry: true, isDraft: true, isFromComponent: false }
) => {
  const attributes = getAttributes(model);

  const shape = Object.keys(attributes).reduce((acc, key) => {
    const attribute = attributes[key];
    let schema;

    if (isSimpleAttribute(attribute)) {
      schema = buildSimpleAttributeSchema(attribute, options);
    } else if (isRelationAttribute(attribute)) {
      schema = buildRelationAttributeSchema(attribute);
    } else if (isComponentAttribute(attribute)) {
      schema = buildComponentAttributeSchema(attribute, components, options);
    } else if (isDynamicZoneAttribute(attribute)) {
      schema = buildDynamicZoneAttributeSchema(attribute, components, options);
    }

    if (schema) {
      acc[key] = schema;
    }
    return acc;
  }, {});

  return yup.object().shape(shape);
};

/**
 * Handles individual validation rules for attribute schemas.
 */
const applyValidation = (schema, validation, value, type, options) => {
  switch (validation) {
    case 'required': {
      if (!options.isDraft) {
        if (type === 'password' && options.isCreatingEntry) {
          return schema.required(errorsTrads.required);
        }
        if (type !== 'password') {
          if (options.isCreatingEntry) {
            return schema.required(errorsTrads.required);
          }
          return schema.test('required', errorsTrads.required, (val) => {
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
    }
    case 'max':
      return type === 'biginteger'
        ? schema.isInferior(errorsTrads.max, value)
        : schema.max(value, errorsTrads.max);
    case 'maxLength':
      return schema.max(value, errorsTrads.maxLength);
    case 'min':
      return type === 'biginteger'
        ? schema.isSuperior(errorsTrads.min, value)
        : schema.min(value, errorsTrads.min);
    case 'minLength':
      return !options.isDraft ? schema.min(value, errorsTrads.minLength) : schema;
    case 'regex':
      return schema.matches(new RegExp(value), errorsTrads.regex);
    case 'lowercase':
      return ['text', 'textarea', 'email', 'string'].includes(type)
        ? schema.strict().lowercase()
        : schema;
    case 'uppercase':
      return ['text', 'textarea', 'email', 'string'].includes(type)
        ? schema.strict().uppercase()
        : schema;
    case 'positive':
      return ['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)
        ? schema.positive()
        : schema;
    case 'negative':
      return ['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)
        ? schema.negative()
        : schema;
    default:
      return schema.nullable();
  }
};

/**
 * Creates Yup schema for a specific attribute type with its validations.
 */
const createYupSchemaAttribute = (type, validations, options) => {
  let schema = yup.mixed();

  if (['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type)) {
    schema = yup.string();
  }

  if (type === 'json') {
    schema = yup
      .mixed(errorsTrads.json)
      .test('isJSON', errorsTrads.json, (val) => {
        if (val === undefined) {
          return true;
        }
        if (isNumber(val) || isNull(val) || isObject(val) || isArray(val)) {
          return true;
        }
        try {
          JSON.parse(val);
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
    const shouldApply =
      !!validationValue ||
      (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
      validationValue === 0;

    if (shouldApply) {
      schema = applyValidation(schema, validation, validationValue, type, options);
    }
  });

  return schema;
};

export default createYupSchema;