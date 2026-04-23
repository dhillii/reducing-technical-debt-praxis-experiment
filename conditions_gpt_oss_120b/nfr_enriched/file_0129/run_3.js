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
  const shape = Object.keys(attributes).reduce((acc, key) => {
    acc[key] = buildAttributeSchema(attributes[key], components, options);
    return acc;
  }, {});
  return yup.object().shape(shape);
};

/* Build schema for a single attribute based on its type */
const buildAttributeSchema = (attribute, components, options) => {
  if (attribute.type === 'relation') {
    return buildRelationSchema(attribute);
  }
  if (attribute.type === 'component') {
    return buildComponentSchema(attribute, components, options);
  }
  if (attribute.type === 'dynamiczone') {
    return buildDynamicZoneSchema(attribute, components, options);
  }
  return createYupSchemaAttribute(attribute.type, attribute, options);
};

/* Relation attribute schema */
const buildRelationSchema = (attribute) => {
  const singleRelations = [
    'oneWay',
    'oneToOne',
    'manyToOne',
    'oneToManyMorph',
    'oneToOneMorph',
  ];
  return singleRelations.includes(attribute.relationType)
    ? yup.object().nullable()
    : yup.array().nullable();
};

/* Component attribute schema (repeatable or single) */
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

/* Repeatable component schema handling min/max and required */
const buildRepeatableComponentSchema = (attribute, componentFieldSchema, options) => {
  const { min, max, required } = attribute;
  return yup.lazy((value) => {
    let base = yup.array().of(componentFieldSchema);
    if (min && !options.isDraft) {
      if (required) {
        base = base.min(min, errorsTrads.min);
      } else if (!required && isEmpty(value)) {
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

/* Single component schema handling required flag */
const buildSingleComponentSchema = (attribute, componentFieldSchema, options) => {
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
};

/* Dynamic zone schema handling required, min, max */
const buildDynamicZoneSchema = (attribute, components, options) => {
  let schema = yup.array().of(
    yup.lazy(({ __component }) =>
      createYupSchema(
        components[__component],
        { components },
        { ...options, isFromComponent: true }
      )
    )
  );

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
};

/* Helper to add required test for dynamic zones */
const addRequiredTest = (schema, options) => {
  return schema.test('required', errorsTrads.required, (value) => {
    if (options.isCreatingEntry) {
      return value !== null && value !== undefined;
    }
    if (value === undefined) {
      return true;
    }
    return value !== null;
  });
};

/* Helper to add min and required tests for dynamic zones */
const addMinTests = (schema, options) => {
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
};

/* Build schema for primitive attributes with validations */
const createYupSchemaAttribute = (type, validations, options) => {
  let schema = initializeBaseSchema(type);
  schema = applyValidations(schema, type, validations, options);
  return schema;
};

/* Initialize base Yup schema based on attribute type */
const initializeBaseSchema = (type) => {
  if (['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type)) {
    return yup.string();
  }
  if (type === 'json') {
    return yup
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
    return yup.string().email(errorsTrads.email);
  }
  if (['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type)) {
    return yup
      .number()
      .transform((cv) => (isNaN(cv) ? undefined : cv))
      .typeError();
  }
  if (['date', 'datetime'].includes(type)) {
    return yup.date();
  }
  if (type === 'biginteger') {
    return yup.string().matches(/^\d*$/);
  }
  return yup.mixed();
};

/* Apply all validation rules to a schema */
const applyValidations = (schema, type, validations, options) => {
  Object.entries(validations).forEach(([validation, value]) => {
    if (shouldApplyValidation(value)) {
      schema = applySingleValidation(schema, type, validation, value, options);
    }
  });
  return schema;
};

/* Determine if a validation rule should be applied */
const shouldApplyValidation = (value) => {
  return (
    !!value ||
    (!isBoolean(value) && Number.isInteger(Math.floor(value))) ||
    value === 0
  );
};

/* Apply a single validation rule */
const applySingleValidation = (schema, type, validation, value, options) => {
  switch (validation) {
    case 'required':
      return applyRequired(schema, type, options);
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

/* Apply required validation respecting options */
const applyRequired = (schema, type, options) => {
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

export default createYupSchema;