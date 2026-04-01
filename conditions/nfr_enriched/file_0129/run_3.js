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

// Validates if a value is a numeric type
const isNumericType = type => ['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type);

// Validates if a value is a date type
const isDateType = type => ['date', 'datetime'].includes(type);

// Validates if a value is a text-like type
const isTextType = type => ['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type);

// Validates if a value is a case-transformable type
const isCaseTransformableType = type => ['text', 'textarea', 'email', 'string'].includes(type);

// Validates if a relation type is singular
const isSingularRelationType = relationType => [
  'oneWay',
  'oneToOne',
  'manyToOne',
  'oneToManyMorph',
  'oneToOneMorph',
].includes(relationType);

// Validates required field based on type and context
const validateRequired = (value, type, options) => {
  if (value === undefined && !options.isFromComponent) {
    return true;
  }

  if (isNumericType(type)) {
    if (value === 0) {
      return true;
    }
    return !!value;
  }

  if (isDateType(type)) {
    return moment(value)._isValid === true;
  }

  if (type === 'boolean') {
    return value !== null;
  }

  return !isEmpty(value);
};

// Applies required validation to schema
const applyRequiredValidation = (schema, type, options) => {
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

    return schema.test('required', errorsTrads.required, value => validateRequired(value, type, options));
  }

  return schema;
};

// Applies min/max validation to schema
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

// Applies case transformation validation to schema
const applyCaseTransformation = (schema, validation, type) => {
  if (!isCaseTransformableType(type)) {
    return schema;
  }

  if (validation === 'lowercase') {
    return schema.strict().lowercase();
  }

  if (validation === 'uppercase') {
    return schema.strict().uppercase();
  }

  return schema;
};

// Applies numeric sign validation to schema
const applySignValidation = (schema, validation, type) => {
  if (!isNumericType(type)) {
    return schema;
  }

  if (validation === 'positive') {
    return schema.positive();
  }

  if (validation === 'negative') {
    return schema.negative();
  }

  return schema;
};

// Applies a single validation rule to schema
const applyValidationRule = (schema, validation, validationValue, type, options) => {
  if (validation === 'required') {
    return applyRequiredValidation(schema, type, options);
  }

  if (['max', 'maxLength', 'min', 'minLength'].includes(validation)) {
    return applyMinMaxValidation(schema, validation, validationValue, type);
  }

  if (validation === 'regex') {
    return schema.matches(new RegExp(validationValue), errorsTrads.regex);
  }

  if (['lowercase', 'uppercase'].includes(validation)) {
    return applyCaseTransformation(schema, validation, type);
  }

  if (['positive', 'negative'].includes(validation)) {
    return applySignValidation(schema, validation, type);
  }

  return schema.nullable();
};

// Determines if a validation should be applied
const shouldApplyValidation = validationValue => {
  return (
    !!validationValue ||
    (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
    validationValue === 0
  );
};

// Creates base schema for JSON type
const createJsonSchema = () => {
  return yup
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
};

// Creates base schema for numeric types
const createNumericSchema = () => {
  return yup
    .number()
    .transform(cv => (isNaN(cv) ? undefined : cv))
    .typeError();
};

// Creates base schema for the given type
const createBaseSchema = type => {
  if (isTextType(type)) {
    return yup.string();
  }

  if (type === 'json') {
    return createJsonSchema();
  }

  if (isNumericType(type)) {
    return createNumericSchema();
  }

  if (isDateType(type)) {
    return yup.date();
  }

  if (type === 'biginteger') {
    return yup.string().matches(/^\d*$/);
  }

  return yup.mixed();
};

// Applies email validation if type is email
const applyEmailValidation = (schema, type) => {
  if (type === 'email') {
    return schema.email(errorsTrads.email);
  }

  return schema;
};

// Builds schema for repeatable component
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

// Builds schema for non-repeatable component
const buildNonRepeatableComponentSchema = (attribute, componentFieldSchema, options) => {
  return yup.lazy(obj => {
    if (obj !== undefined) {
      return attribute.required === true && !options.isDraft
        ? componentFieldSchema.defined()
        : componentFieldSchema.nullable();
    }

    return attribute.required === true ? yup.object().defined() : yup.object().nullable();
  });
};

// Validates dynamic zone required condition
const validateDynamicZoneRequired = (value, options) => {
  if (options.isCreatingEntry) {
    return value !== null || value !== undefined;
  }

  if (value === undefined) {
    return true;
  }

  return value !== null;
};

// Validates dynamic zone min condition
const validateDynamicZoneMin = (value, options) => {
  if (options.isCreatingEntry) {
    return value && value.length > 0;
  }

  if (value === undefined) {
    return true;
  }

  return value !== null && value.length > 0;
};

// Applies required and min validations to dynamic zone
const applyDynamicZoneRequiredValidation = (schema, attribute, options) => {
  let updatedSchema = schema.test('required', errorsTrads.required, value =>
    validateDynamicZoneRequired(value, options)
  );

  if (attribute.min) {
    updatedSchema = updatedSchema
      .test('min', errorsTrads.min, value => validateDynamicZoneMin(value, options))
      .test('required', errorsTrads.required, value => validateDynamicZoneRequired(value, options));
  }

  return updatedSchema;
};

// Builds schema for dynamic zone
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
    dynamicZoneSchema = applyDynamicZoneRequiredValidation(dynamicZoneSchema, attribute, options);
  } else if (min) {
    dynamicZoneSchema = dynamicZoneSchema.notEmptyMin(min);
  }

  if (max) {
    dynamicZoneSchema = dynamicZoneSchema.max(max, errorsTrads.max);
  }

  return dynamicZoneSchema;
};

// Processes a single attribute and adds it to the schema accumulator
const processAttribute = (acc, current, attribute, components, options) => {
  if (attribute.type === 'relation') {
    acc[current] = isSingularRelationType(attribute.relationType)
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
      acc[current] = buildRepeatableComponentSchema(attribute, componentFieldSchema, options);
    } else {
      acc[current] = buildNonRepeatableComponentSchema(attribute, componentFieldSchema, options);
    }

    return acc;
  }

  if (attribute.type === 'dynamiczone') {
    acc[current] = buildDynamicZoneSchema(attribute, components, options);
    return acc;
  }

  const formatted = createYupSchemaAttribute(attribute.type, attribute, options);
  acc[current] = formatted;

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

const createYupSchemaAttribute = (type, validations, options) => {
  let schema = createBaseSchema(type);
  schema = applyEmailValidation(schema, type);

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