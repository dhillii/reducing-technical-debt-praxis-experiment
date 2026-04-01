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

// Handles relation type attributes
const createRelationSchema = attribute => {
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

// Handles repeatable component schema creation
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

// Handles non-repeatable component schema creation
const createSingleComponentSchema = (attribute, componentFieldSchema, options) => {
  return yup.lazy(obj => {
    if (obj !== undefined) {
      return attribute.required === true && !options.isDraft
        ? componentFieldSchema.defined()
        : componentFieldSchema.nullable();
    }

    return attribute.required === true ? yup.object().defined() : yup.object().nullable();
  });
};

// Handles component type attributes
const createComponentSchema = (attribute, components, options) => {
  const componentFieldSchema = createYupSchema(
    components[attribute.component],
    { components },
    { ...options, isFromComponent: true }
  );

  return attribute.repeatable === true
    ? createRepeatableComponentSchema(attribute, componentFieldSchema, options)
    : createSingleComponentSchema(attribute, componentFieldSchema, options);
};

// Validates dynamic zone required constraint
const validateDynamicZoneRequired = (value, options) => {
  if (options.isCreatingEntry) {
    return value !== null && value !== undefined;
  }

  if (value === undefined) {
    return true;
  }

  return value !== null;
};

// Validates dynamic zone minimum length constraint
const validateDynamicZoneMin = (value, options) => {
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
    validateDynamicZoneRequired(value, options)
  );

  if (attribute.min) {
    updatedSchema = updatedSchema.test('min', errorsTrads.min, value =>
      validateDynamicZoneMin(value, options)
    );
  }

  return updatedSchema;
};

// Handles dynamic zone type attributes
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

  const { max, min } = attribute;

  if (attribute.required && !options.isDraft) {
    dynamicZoneSchema = applyDynamicZoneRequiredConstraints(
      dynamicZoneSchema,
      attribute,
      options
    );
  } else if (min) {
    dynamicZoneSchema = dynamicZoneSchema.notEmptyMin(min);
  }

  if (max) {
    dynamicZoneSchema = dynamicZoneSchema.max(max, errorsTrads.max);
  }

  return dynamicZoneSchema;
};

// Processes each attribute and adds it to the schema accumulator
const processAttribute = (acc, current, attribute, components, options) => {
  if (
    attribute.type !== 'relation' &&
    attribute.type !== 'component' &&
    attribute.type !== 'dynamiczone'
  ) {
    const formatted = createYupSchemaAttribute(attribute.type, attribute, options);
    acc[current] = formatted;
  } else if (attribute.type === 'relation') {
    acc[current] = createRelationSchema(attribute);
  } else if (attribute.type === 'component') {
    acc[current] = createComponentSchema(attribute, components, options);
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

// Determines base schema type based on attribute type
const getBaseSchema = type => {
  if (['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type)) {
    return yup.string();
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

  return yup.mixed();
};

// Applies type-specific schema rules
const applyTypeSpecificRules = (schema, type) => {
  let updatedSchema = schema;

  if (type === 'json') {
    updatedSchema = yup
      .mixed(errorsTrads.json)
      .test('isJSON', errorsTrads.json, validateJSON)
      .nullable();
  } else if (type === 'email') {
    updatedSchema = updatedSchema.email(errorsTrads.email);
  } else if (type === 'biginteger') {
    updatedSchema = yup.string().matches(/^\d*$/);
  }

  return updatedSchema;
};

// Validates required field based on type and options
const validateRequiredField = (value, type, options) => {
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

// Applies required validation
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

  return schema.test('required', errorsTrads.required, value =>
    validateRequiredField(value, type, options)
  );
};

// Applies min/max validations
const applyMinMaxValidation = (schema, validation, validationValue, type) => {
  if (validation === 'max') {
    return type === 'biginteger'
      ? schema.isInferior(errorsTrads.max, validationValue)
      : schema.max(validationValue, errorsTrads.max);
  }

  if (validation === 'maxLength') {
    return schema.max(validationValue, errorsTrads.maxLength);
  }

  if (validation === 'min') {
    return type === 'biginteger'
      ? schema.isSuperior(errorsTrads.min, validationValue)
      : schema.min(validationValue, errorsTrads.min);
  }

  if (validation === 'minLength') {
    return schema.min(validationValue, errorsTrads.minLength);
  }

  return schema;
};

// Applies text transformation validations
const applyTextTransformations = (schema, validation, type) => {
  const textTypes = ['text', 'textarea', 'email', 'string'];

  if (validation === 'lowercase' && textTypes.includes(type)) {
    return schema.strict().lowercase();
  }

  if (validation === 'uppercase' && textTypes.includes(type)) {
    return schema.strict().uppercase();
  }

  return schema;
};

// Applies numeric sign validations
const applyNumericValidations = (schema, validation, type) => {
  const numericTypes = ['number', 'integer', 'bigint', 'float', 'decimal'];

  if (validation === 'positive' && numericTypes.includes(type)) {
    return schema.positive();
  }

  if (validation === 'negative' && numericTypes.includes(type)) {
    return schema.negative();
  }

  return schema;
};

// Applies a single validation rule to the schema
const applyValidationRule = (schema, validation, validationValue, type, options) => {
  let updatedSchema = schema;

  switch (validation) {
    case 'required':
      updatedSchema = applyRequiredValidation(updatedSchema, type, options);
      break;
    case 'max':
    case 'maxLength':
    case 'min':
    case 'minLength':
      updatedSchema = applyMinMaxValidation(updatedSchema, validation, validationValue, type);
      break;
    case 'regex':
      updatedSchema = updatedSchema.matches(new RegExp(validationValue), errorsTrads.regex);
      break;
    case 'lowercase':
    case 'uppercase':
      updatedSchema = applyTextTransformations(updatedSchema, validation, type);
      break;
    case 'positive':
    case 'negative':
      updatedSchema = applyNumericValidations(updatedSchema, validation, type);
      break;
    default:
      updatedSchema = updatedSchema.nullable();
  }

  return updatedSchema;
};

// Determines if a validation should be applied
const shouldApplyValidation = validationValue => {
  return (
    !!validationValue ||
    (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
    validationValue === 0
  );
};

const createYupSchemaAttribute = (type, validations, options) => {
  let schema = getBaseSchema(type);
  schema = applyTypeSpecificRules(schema, type);

  Object.keys(validations).forEach(validation => {
    const validationValue = validations[validation];

    if (shouldApplyValidation(validationValue)) {
      schema = applyValidationRule(schema, validation, validationValue, type, options);
    }
  });

  return schema;
};

export default createYupSchema;
```