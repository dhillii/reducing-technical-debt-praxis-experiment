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

yup.addMethod(yup.mixed, 'defined', function() {
  return this.test('defined', errorsTrads.required, value => value !== undefined);
});

yup.addMethod(yup.array, 'notEmptyMin', function(min) {
  return this.test('notEmptyMin', errorsTrads.min, value => {
    if (isEmpty(value)) {
      return true;
    }

    return value.length >= min;
  });
});

yup.addMethod(yup.string, 'isInferior', function(message, max) {
  return this.test('isInferior', message, function(value) {
    if (!value) {
      return true;
    }

    if (Number.isNaN(toNumber(value))) {
      return true;
    }

    return toNumber(max) >= toNumber(value);
  });
});

yup.addMethod(yup.string, 'isSuperior', function(message, min) {
  return this.test('isSuperior', message, function(value) {
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

// Handles relation type attributes
const buildRelationSchema = attribute => {
  const singleRelationTypes = [
    'oneWay',
    'oneToOne',
    'manyToOne',
    'oneToManyMorph',
    'oneToOneMorph',
  ];

  return singleRelationTypes.includes(attribute.relationType)
    ? yup.object().nullable()
    : yup.array().nullable();
};

// Handles repeatable component schema with min/max constraints
const buildRepeatableComponentSchema = (componentFieldSchema, attribute, options) => {
  const { min, max, required } = attribute;

  return yup.lazy(value => {
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
};

// Handles single component schema with required/draft constraints
const buildSingleComponentSchema = (componentFieldSchema, attribute, options) => {
  return yup.lazy(obj => {
    if (obj !== undefined) {
      return attribute.required === true && !options.isDraft
        ? componentFieldSchema.defined()
        : componentFieldSchema.nullable();
    }

    return attribute.required === true ? yup.object().defined() : yup.object().nullable();
  });
};

// Validates dynamic zone required constraint
const validateDynamicZoneRequired = (options, value) => {
  if (options.isCreatingEntry) {
    return value !== null || value !== undefined;
  }

  if (value === undefined) {
    return true;
  }

  return value !== null;
};

// Validates dynamic zone minimum length constraint
const validateDynamicZoneMin = (options, value) => {
  if (options.isCreatingEntry) {
    return value && value.length > 0;
  }

  if (value === undefined) {
    return true;
  }

  return value !== null && value.length > 0;
};

// Builds dynamic zone schema with required and min constraints
const buildDynamicZoneRequiredSchema = (dynamicZoneSchema, attribute, options) => {
  let schema = dynamicZoneSchema.test('required', errorsTrads.required, value =>
    validateDynamicZoneRequired(options, value)
  );

  if (attribute.min) {
    schema = schema
      .test('min', errorsTrads.min, value => validateDynamicZoneMin(options, value))
      .test('required', errorsTrads.required, value =>
        validateDynamicZoneRequired(options, value)
      );
  }

  return schema;
};

// Handles dynamic zone type attributes
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
    dynamicZoneSchema = buildDynamicZoneRequiredSchema(dynamicZoneSchema, attribute, options);
  } else if (min) {
    dynamicZoneSchema = dynamicZoneSchema.notEmptyMin(min);
  }

  if (max) {
    dynamicZoneSchema = dynamicZoneSchema.max(max, errorsTrads.max);
  }

  return dynamicZoneSchema;
};

// Processes each attribute and builds appropriate schema
const processAttribute = (acc, current, attribute, components, options) => {
  if (
    attribute.type !== 'relation' &&
    attribute.type !== 'component' &&
    attribute.type !== 'dynamiczone'
  ) {
    acc[current] = createYupSchemaAttribute(attribute.type, attribute, options);
    return acc;
  }

  if (attribute.type === 'relation') {
    acc[current] = buildRelationSchema(attribute);
    return acc;
  }

  if (attribute.type === 'component') {
    const componentFieldSchema = createYupSchema(
      components[attribute.component],
      { components },
      { ...options, isFromComponent: true }
    );

    acc[current] = attribute.repeatable === true
      ? buildRepeatableComponentSchema(componentFieldSchema, attribute, options)
      : buildSingleComponentSchema(componentFieldSchema, attribute, options);

    return acc;
  }

  if (attribute.type === 'dynamiczone') {
    acc[current] = buildDynamicZoneSchema(attribute, components, options);
  }

  return acc;
};

const createYupSchema = (
  model,
  { components },
  options = { isCreatingEntry: true, isDraft: true, isFromComponent: false }
) => {
  const attributes = getAttributes(model);

  return yup.object().shape(
    Object.keys(attributes).reduce((acc, current) => {
      return processAttribute(acc, current, attributes[current], components, options);
    }, {})
  );
};

// Validates required field based on type and context
const validateRequiredField = (type, value, options) => {
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
};

// Applies required validation based on type and options
const applyRequiredValidation = (schema, type, options) => {
  if (!options.isDraft) {
    if (type === 'password' && options.isCreatingEntry) {
      return schema.required(errorsTrads.required);
    }

    if (type !== 'password') {
      if (options.isCreatingEntry) {
        return schema.required(errorsTrads.required);
      }

      return schema.test('required', errorsTrads.required, value =>
        validateRequiredField(type, value, options)
      );
    }
  }

  return schema;
};

// Applies validation rules to schema based on validation key
const applyValidationRule = (schema, validation, validationValue, type) => {
  switch (validation) {
    case 'max': {
      return type === 'biginteger'
        ? schema.isInferior(errorsTrads.max, validationValue)
        : schema.max(validationValue, errorsTrads.max);
    }
    case 'maxLength':
      return schema.max(validationValue, errorsTrads.maxLength);
    case 'min': {
      return type === 'biginteger'
        ? schema.isSuperior(errorsTrads.min, validationValue)
        : schema.min(validationValue, errorsTrads.min);
    }
    case 'minLength':
      return schema.min(validationValue, errorsTrads.minLength);
    case 'regex':
      return schema.matches(new RegExp(validationValue), errorsTrads.regex);
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

const createYupSchemaAttribute = (type, validations, options) => {
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
      if (validation === 'required') {
        schema = applyRequiredValidation(schema, type, options);
      } else if (validation !== 'minLength' || !options.isDraft) {
        schema = applyValidationRule(schema, validation, validationValue, type);
      }
    }
  });

  return schema;
};

export default createYupSchema;