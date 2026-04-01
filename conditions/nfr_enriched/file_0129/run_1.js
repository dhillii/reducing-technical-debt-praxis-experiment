```javascript
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

// Determines if a relation type is single-valued
const isSingleValuedRelation = relationType => {
  return ['oneWay', 'oneToOne', 'manyToOne', 'oneToManyMorph', 'oneToOneMorph'].includes(
    relationType
  );
};

// Creates schema for repeatable component attributes
const createRepeatableComponentSchema = (attribute, componentFieldSchema, options) => {
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

// Creates schema for non-repeatable component attributes
const createNonRepeatableComponentSchema = (attribute, componentFieldSchema, options) => {
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
    return value !== null && value !== undefined;
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

// Applies required and min constraints to dynamic zone schema
const applyDynamicZoneRequiredConstraints = (schema, attribute, options) => {
  let updatedSchema = schema;

  updatedSchema = updatedSchema.test('required', errorsTrads.required, value =>
    validateDynamicZoneRequired(options, value)
  );

  if (attribute.min) {
    updatedSchema = updatedSchema
      .test('min', errorsTrads.min, value => validateDynamicZoneMin(options, value))
      .test('required', errorsTrads.required, value =>
        validateDynamicZoneRequired(options, value)
      );
  }

  return updatedSchema;
};

// Applies min constraint to dynamic zone schema when not required
const applyDynamicZoneMinConstraint = (schema, attribute) => {
  if (attribute.min) {
    return schema.notEmptyMin(attribute.min);
  }
  return schema;
};

// Creates schema for dynamic zone attributes
const createDynamicZoneSchema = (attribute, components, options) => {
  let dynamicZoneSchema = yup.array().of(
    yup.lazy(({ __component }) => {
      return createYupSchema(
        components[__component],
        { components },
        { ...options, isFromComponent: true }
      );
    })
  );

  if (attribute.required && !options.isDraft) {
    dynamicZoneSchema = applyDynamicZoneRequiredConstraints(dynamicZoneSchema, attribute, options);
  } else {
    dynamicZoneSchema = applyDynamicZoneMinConstraint(dynamicZoneSchema, attribute);
  }

  if (attribute.max) {
    dynamicZoneSchema = dynamicZoneSchema.max(attribute.max, errorsTrads.max);
  }

  return dynamicZoneSchema;
};

// Processes a single attribute and adds it to the schema accumulator
const processAttribute = (acc, current, attribute, components, options) => {
  if (
    attribute.type !== 'relation' &&
    attribute.type !== 'component' &&
    attribute.type !== 'dynamiczone'
  ) {
    const formatted = createYupSchemaAttribute(attribute.type, attribute, options);
    acc[current] = formatted;
  } else if (attribute.type === 'relation') {
    acc[current] = isSingleValuedRelation(attribute.relationType)
      ? yup.object().nullable()
      : yup.array().nullable();
  } else if (attribute.type === 'component') {
    const componentFieldSchema = createYupSchema(
      components[attribute.component],
      { components },
      { ...options, isFromComponent: true }
    );

    acc[current] = attribute.repeatable === true
      ? createRepeatableComponentSchema(attribute, componentFieldSchema, options)
      : createNonRepeatableComponentSchema(attribute, componentFieldSchema, options);
  } else if (attribute.type === 'dynamiczone') {
    acc[current] = createDynamicZoneSchema(attribute, components, options);
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

// Validates JSON type
const validateJSON = value => {
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
};

// Validates required constraint for different types
const validateRequired = (type, value, options) => {
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
        validateRequired(type, value, options)
      );
    }
  }

  return schema;
};

// Applies max validation based on type
const applyMaxValidation = (schema, type, validationValue) => {
  if (type === 'biginteger') {
    return schema.isInferior(errorsTrads.max, validationValue);
  }
  return schema.max(validationValue, errorsTrads.max);
};

// Applies min validation based on type
const applyMinValidation = (schema, type, validationValue, options) => {
  if (type === 'biginteger') {
    return schema.isSuperior(errorsTrads.min, validationValue);
  }
  if (!options.isDraft) {
    return schema.min(validationValue, errorsTrads.min);
  }
  return schema;
};

// Applies case transformation based on type
const applyCaseTransformation = (schema, type, transformation) => {
  if (['text', 'textarea', 'email', 'string'].includes(type)) {
    return transformation === 'lowercase'
      ? schema.strict().lowercase()
      : schema.strict().uppercase();
  }
  return schema;
};

// Applies numeric sign constraint based on type
const applyNumericSignConstraint = (schema, type, isPositive) => {
  if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
    return isPositive ? schema.positive() : schema.negative();
  }
  return schema;
};

// Processes a single validation rule
const processValidationRule = (schema, type, validation, validationValue, options) => {
  switch (validation) {
    case 'required':
      return applyRequiredValidation(schema, type, options);
    case 'max':
      return applyMaxValidation(schema, type, validationValue);
    case 'maxLength':
      return schema.max(validationValue, errorsTrads.maxLength);
    case 'min':
      return applyMinValidation(schema, type, validationValue, options);
    case 'minLength':
      return !options.isDraft ? schema.min(validationValue, errorsTrads.minLength) : schema;
    case 'regex':
      return schema.matches(new RegExp(validationValue), errorsTrads.regex);
    case 'lowercase':
    case 'uppercase':
      return applyCaseTransformation(schema, type, validation);
    case 'positive':
      return applyNumericSignConstraint(schema, type, true);
    case 'negative':
      return applyNumericSignConstraint(schema, type, false);
    default:
      return schema.nullable();
  }
};

// Determines if a validation value should be processed
const shouldProcessValidation = validationValue => {
  return (
    !!validationValue ||
    (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
    validationValue === 0
  );
};

const createYupSchemaAttribute = (type, validations, options) => {
  let schema = yup.mixed();

  if (['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type)) {
    schema = yup.string();
  }

  if (type === 'json') {
    schema = yup
      .mixed(errorsTrads.json)
      .test('isJSON', errorsTrads.json, validateJSON)
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
```