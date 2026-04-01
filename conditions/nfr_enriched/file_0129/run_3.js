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

// Applies required validation test for dynamic zones
const applyDynamicZoneRequiredTest = (schema, options) => {
  return schema.test('required', errorsTrads.required, value => {
    if (options.isCreatingEntry) {
      return value !== null && value !== undefined;
    }

    if (value === undefined) {
      return true;
    }

    return value !== null;
  });
};

// Applies minimum length test for dynamic zones
const applyDynamicZoneMinTest = (schema, options) => {
  return schema.test('min', errorsTrads.min, value => {
    if (options.isCreatingEntry) {
      return value && value.length > 0;
    }

    if (value === undefined) {
      return true;
    }

    return value !== null && value.length > 0;
  });
};

// Builds dynamic zone schema with required and min constraints
const buildDynamicZoneRequiredSchema = (schema, attribute, options) => {
  let result = applyDynamicZoneRequiredTest(schema, options);

  if (attribute.min) {
    result = applyDynamicZoneMinTest(result, options);
    result = applyDynamicZoneRequiredTest(result, options);
  }

  return result;
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

// Processes component type attributes
const processComponentAttribute = (attribute, components, options, acc, current) => {
  const componentFieldSchema = createYupSchema(
    components[attribute.component],
    { components },
    { ...options, isFromComponent: true }
  );

  if (attribute.repeatable === true) {
    acc[current] = createRepeatableComponentSchema(attribute, componentFieldSchema, options);
  } else {
    acc[current] = createSingleComponentSchema(attribute, componentFieldSchema, options);
  }

  return acc;
};

// Processes relation type attributes
const processRelationAttribute = (attribute, acc, current) => {
  acc[current] = isSingleValuedRelation(attribute.relationType)
    ? yup.object().nullable()
    : yup.array().nullable();

  return acc;
};

// Processes standard attribute types
const processStandardAttribute = (attribute, options, acc, current) => {
  const formatted = createYupSchemaAttribute(attribute.type, attribute, options);
  acc[current] = formatted;

  return acc;
};

// Processes a single attribute and adds it to the schema accumulator
const processAttribute = (attribute, current, components, options, acc) => {
  if (
    attribute.type !== 'relation' &&
    attribute.type !== 'component' &&
    attribute.type !== 'dynamiczone'
  ) {
    return processStandardAttribute(attribute, options, acc, current);
  }

  if (attribute.type === 'relation') {
    return processRelationAttribute(attribute, acc, current);
  }

  if (attribute.type === 'component') {
    return processComponentAttribute(attribute, components, options, acc, current);
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
      return processAttribute(attribute, current, components, options, acc);
    }, {})
  );
};

// Validates JSON type values
const validateJsonValue = value => {
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

// Applies required validation for non-password fields during editing
const applyEditingRequiredValidation = (schema, type) => {
  return schema.test('required', errorsTrads.required, value => {
    if (value === undefined) {
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
};

// Applies required validation based on context
const applyRequiredValidation = (schema, type, validationValue, options) => {
  if (!options.isDraft) {
    if (type === 'password' && options.isCreatingEntry) {
      return schema.required(errorsTrads.required);
    }

    if (type !== 'password') {
      if (options.isCreatingEntry) {
        return schema.required(errorsTrads.required);
      } else {
        return applyEditingRequiredValidation(schema, type);
      }
    }
  }

  return schema;
};

// Applies min/max validations
const applyMinMaxValidation = (schema, type, validation, validationValue) => {
  if (validation === 'max') {
    return type === 'biginteger'
      ? schema.isInferior(errorsTrads.max, validationValue)
      : schema.max(validationValue, errorsTrads.max);
  }

  if (validation === 'min') {
    return type === 'biginteger'
      ? schema.isSuperior(errorsTrads.min, validationValue)
      : schema.min(validationValue, errorsTrads.min);
  }

  return schema;
};

// Applies case transformation validations
const applyCaseValidation = (schema, type, validation) => {
  if (['text', 'textarea', 'email', 'string'].includes(type)) {
    if (validation === 'lowercase') {
      return schema.strict().lowercase();
    }

    if (validation === 'uppercase') {
      return schema.strict().uppercase();
    }
  }

  return schema;
};

// Applies numeric sign validations
const applySignValidation = (schema, type, validation) => {
  if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
    if (validation === 'positive') {
      return schema.positive();
    }

    if (validation === 'negative') {
      return schema.negative();
    }
  }

  return schema;
};

// Applies a single validation rule to the schema
const applyValidationRule = (schema, type, validation, validationValue, options) => {
  switch (validation) {
    case 'required':
      return applyRequiredValidation(schema, type, validationValue, options);

    case 'max':
    case 'min':
      return applyMinMaxValidation(schema, type, validation, validationValue);

    case 'maxLength':
      return schema.max(validationValue, errorsTrads.maxLength);

    case 'minLength':
      return !options.isDraft ? schema.min(validationValue, errorsTrads.minLength) : schema;

    case 'regex':
      return schema.matches(new RegExp(validationValue), errorsTrads.regex);

    case 'lowercase':
    case 'uppercase':
      return applyCaseValidation(schema, type, validation);

    case 'positive':
    case 'negative':
      return applySignValidation(schema, type, validation);

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
      .test('isJSON', errorsTrads.json, validateJsonValue)
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
      schema = applyValidationRule(schema, type, validation, validationValue, options);
    }
  });

  return schema;
};

export default createYupSchema;
```