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

// Applies constraints to dynamic zone schema based on attribute configuration
const applyDynamicZoneConstraints = (schema, attribute, options) => {
  let updatedSchema = schema;

  if (attribute.required && !options.isDraft) {
    updatedSchema = applyDynamicZoneRequiredConstraints(updatedSchema, attribute, options);
  } else if (attribute.min) {
    updatedSchema = updatedSchema.notEmptyMin(attribute.min);
  }

  if (attribute.max) {
    updatedSchema = updatedSchema.max(attribute.max, errorsTrads.max);
  }

  return updatedSchema;
};

// Creates schema for dynamic zone attributes
const createDynamicZoneSchema = (attribute, components, options) => {
  let schema = yup.array().of(
    yup.lazy(({ __component }) => {
      return createYupSchema(
        components[__component],
        { components },
        { ...options, isFromComponent: true }
      );
    })
  );

  return applyDynamicZoneConstraints(schema, attribute, options);
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
    return acc;
  }

  if (attribute.type === 'relation') {
    acc[current] = isSingleValuedRelation(attribute.relationType)
      ? yup.object().nullable()
      : yup.array().nullable();
    return acc;
  }

  if (attribute.type === 'component') {
    const componentFieldSchema = createYupSchema(
      components[attribute.component],
      { components },
      { ...options, isFromComponent: true }
    );

    if (attribute.repeatable === true) {
      acc[current] = createRepeatableComponentSchema(attribute, componentFieldSchema, options);
    } else {
      acc[current] = createNonRepeatableComponentSchema(attribute, componentFieldSchema, options);
    }
    return acc;
  }

  if (attribute.type === 'dynamiczone') {
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
      const attribute = attributes[current];
      return processAttribute(acc, current, attribute, components, options);
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

// Determines the base schema type for an attribute
const getBaseSchemaType = type => {
  if (['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type)) {
    return yup.string();
  }

  if (type === 'json') {
    return yup
      .mixed(errorsTrads.json)
      .test('isJSON', errorsTrads.json, validateJSON)
      .nullable();
  }

  if (['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type)) {
    return yup
      .number()
      .transform(cv => (isNaN(cv) ? undefined : cv))
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

// Applies email validation if applicable
const applyEmailValidation = (schema, type) => {
  if (type === 'email') {
    return schema.email(errorsTrads.email);
  }
  return schema;
};

// Validates required constraint for different types
const validateRequiredConstraint = (type, value, options) => {
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
      } else {
        return schema.test('required', errorsTrads.required, value =>
          validateRequiredConstraint(type, value, options)
        );
      }
    }
  }

  return schema;
};

// Applies min/max constraints based on type
const applyMinMaxConstraints = (schema, type, validation, validationValue) => {
  if (validation === 'max') {
    if (type === 'biginteger') {
      return schema.isInferior(errorsTrads.max, validationValue);
    } else {
      return schema.max(validationValue, errorsTrads.max);
    }
  }

  if (validation === 'maxLength') {
    return schema.max(validationValue, errorsTrads.maxLength);
  }

  if (validation === 'min') {
    if (type === 'biginteger') {
      return schema.isSuperior(errorsTrads.min, validationValue);
    } else {
      return schema.min(validationValue, errorsTrads.min);
    }
  }

  if (validation === 'minLength') {
    return schema.min(validationValue, errorsTrads.minLength);
  }

  return schema;
};

// Applies case transformation validations
const applyCaseTransformations = (schema, type, validation) => {
  if (validation === 'lowercase' && ['text', 'textarea', 'email', 'string'].includes(type)) {
    return schema.strict().lowercase();
  }

  if (validation === 'uppercase' && ['text', 'textarea', 'email', 'string'].includes(type)) {
    return schema.strict().uppercase();
  }

  return schema;
};

// Applies numeric sign validations
const applyNumericSignValidations = (schema, type, validation) => {
  if (validation === 'positive' && ['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
    return schema.positive();
  }

  if (validation === 'negative' && ['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
    return schema.negative();
  }

  return schema;
};

// Applies a single validation rule to the schema
const applyValidationRule = (schema, type, validation, validationValue, options) => {
  switch (validation) {
    case 'required':
      return applyRequiredValidation(schema, type, options);
    case 'max':
    case 'maxLength':
    case 'min':
    case 'minLength':
      return applyMinMaxConstraints(schema, type, validation, validationValue);
    case 'regex':
      return schema.matches(new RegExp(validationValue), errorsTrads.regex);
    case 'lowercase':
    case 'uppercase':
      return applyCaseTransformations(schema, type, validation);
    case 'positive':
    case 'negative':
      return applyNumericSignValidations(schema, type, validation);
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
  let schema = getBaseSchemaType(type);
  schema = applyEmailValidation(schema, type);

  Object.keys(validations).forEach(validation => {
    const validationValue = validations[validation];

    if (shouldProcessValidation(validationValue)) {
      schema = applyValidationRule(schema, type, validation, validationValue, options);
    }
  });

  return schema;
};

export default createYupSchema;
```