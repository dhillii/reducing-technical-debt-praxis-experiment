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

const singleRelationTypes = ['oneWay', 'oneToOne', 'manyToOne', 'oneToManyMorph', 'oneToOneMorph'];

// Determines if a relation type is single-valued
const isSingleRelation = relationType => singleRelationTypes.includes(relationType);

// Creates schema for non-complex attribute types
const createSimpleAttributeSchema = (type, attribute, options) => {
  return createYupSchemaAttribute(type, attribute, options);
};

// Creates schema for relation attributes
const createRelationSchema = relationType => {
  return isSingleRelation(relationType) ? yup.object().nullable() : yup.array().nullable();
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

// Applies required validation based on field type and context
const applyRequiredValidation = (schema, type, options) => {
  if (options.isDraft) {
    return schema;
  }

  if (type === 'password' && options.isCreatingEntry) {
    return schema.required(errorsTrads.required);
  }

  if (type === 'password') {
    return schema;
  }

  if (options.isCreatingEntry) {
    return schema.required(errorsTrads.required);
  }

  return schema.test('required', errorsTrads.required, value => {
    return validateRequiredField(type, value, options);
  });
};

// Builds repeatable component schema with min/max constraints
const buildRepeatableComponentSchema = (attribute, componentFieldSchema, options) => {
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

// Builds single component schema with required constraint
const buildSingleComponentSchema = (attribute, componentFieldSchema, options) => {
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
const validateDynamicZoneRequired = (value, options) => {
  if (options.isCreatingEntry) {
    return value !== null || value !== undefined;
  }

  if (value === undefined) {
    return true;
  }

  return value !== null;
};

// Validates dynamic zone minimum length
const validateDynamicZoneMin = (value, options) => {
  if (options.isCreatingEntry) {
    return value && value.length > 0;
  }

  if (value === undefined) {
    return true;
  }

  return value !== null && value.length > 0;
};

// Builds dynamic zone schema with constraints
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
      return validateDynamicZoneRequired(value, options);
    });

    if (min) {
      dynamicZoneSchema = dynamicZoneSchema
        .test('min', errorsTrads.min, value => {
          return validateDynamicZoneMin(value, options);
        })
        .test('required', errorsTrads.required, value => {
          return validateDynamicZoneRequired(value, options);
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

// Processes each attribute and builds appropriate schema
const processAttribute = (acc, current, attribute, components, options) => {
  if (
    attribute.type !== 'relation' &&
    attribute.type !== 'component' &&
    attribute.type !== 'dynamiczone'
  ) {
    acc[current] = createSimpleAttributeSchema(attribute.type, attribute, options);
    return acc;
  }

  if (attribute.type === 'relation') {
    acc[current] = createRelationSchema(attribute.relationType);
    return acc;
  }

  if (attribute.type === 'component') {
    const componentFieldSchema = createYupSchema(
      components[attribute.component],
      { components },
      { ...options, isFromComponent: true }
    );

    if (attribute.repeatable === true) {
      acc[current] = buildRepeatableComponentSchema(attribute, componentFieldSchema, options);
    } else {
      acc[current] = buildSingleComponentSchema(attribute, componentFieldSchema, options);
    }

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

// Determines if a validation value should be processed
const shouldProcessValidation = validationValue => {
  return (
    !!validationValue ||
    (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
    validationValue === 0
  );
};

// Applies max validation based on type
const applyMaxValidation = (schema, type, validationValue) => {
  if (type === 'biginteger') {
    return schema.isInferior(errorsTrads.max, validationValue);
  }
  return schema.max(validationValue, errorsTrads.max);
};

// Applies min validation based on type
const applyMinValidation = (schema, type, validationValue) => {
  if (type === 'biginteger') {
    return schema.isSuperior(errorsTrads.min, validationValue);
  }
  return schema.min(validationValue, errorsTrads.min);
};

// Applies case transformation based on type
const applyCaseTransformation = (schema, type, transformation) => {
  if (['text', 'textarea', 'email', 'string'].includes(type)) {
    return schema.strict()[transformation]();
  }
  return schema;
};

// Applies numeric sign validation based on type
const applySignValidation = (schema, type, sign) => {
  if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
    return schema[sign]();
  }
  return schema;
};

// Processes individual validation rule
const processValidationRule = (schema, type, validation, validationValue, options) => {
  switch (validation) {
    case 'required':
      return applyRequiredValidation(schema, type, options);
    case 'max':
      return applyMaxValidation(schema, type, validationValue);
    case 'maxLength':
      return schema.max(validationValue, errorsTrads.maxLength);
    case 'min':
      return applyMinValidation(schema, type, validationValue);
    case 'minLength':
      return !options.isDraft ? schema.min(validationValue, errorsTrads.minLength) : schema;
    case 'regex':
      return schema.matches(new RegExp(validationValue), errorsTrads.regex);
    case 'lowercase':
      return applyCaseTransformation(schema, type, 'lowercase');
    case 'uppercase':
      return applyCaseTransformation(schema, type, 'uppercase');
    case 'positive':
      return applySignValidation(schema, type, 'positive');
    case 'negative':
      return applySignValidation(schema, type, 'negative');
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

    if (shouldProcessValidation(validationValue)) {
      schema = processValidationRule(schema, type, validation, validationValue, options);
    }
  });

  return schema;
};

export default createYupSchema;