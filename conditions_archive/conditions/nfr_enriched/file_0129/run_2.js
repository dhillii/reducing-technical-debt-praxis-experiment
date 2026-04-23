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

// Handles non-relation, non-component, non-dynamiczone attributes
const buildSimpleAttributeSchema = (attribute, options) => {
  return createYupSchemaAttribute(attribute.type, attribute, options);
};

// Handles relation type attributes
const buildRelationAttributeSchema = (attribute) => {
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

// Handles repeatable component attributes
const buildRepeatableComponentSchema = (attribute, componentFieldSchema, options) => {
  return yup.lazy(value => {
    let baseSchema = yup.array().of(componentFieldSchema);

    if (attribute.min && !options.isDraft) {
      if (attribute.required) {
        baseSchema = baseSchema.min(attribute.min, errorsTrads.min);
      } else if (!attribute.required && isEmpty(value)) {
        baseSchema = baseSchema.nullable();
      } else {
        baseSchema = baseSchema.min(attribute.min, errorsTrads.min);
      }
    }

    if (attribute.max) {
      baseSchema = baseSchema.max(attribute.max, errorsTrads.max);
    }

    return baseSchema;
  });
};

// Handles non-repeatable component attributes
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

// Handles component type attributes
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

// Validates required field for dynamic zone in creation context
const validateDynamicZoneRequiredOnCreate = (value) => {
  return value !== null && value !== undefined;
};

// Validates required field for dynamic zone in edit context
const validateDynamicZoneRequiredOnEdit = (value) => {
  if (value === undefined) {
    return true;
  }
  return value !== null;
};

// Validates minimum length for dynamic zone in creation context
const validateDynamicZoneMinOnCreate = (value) => {
  return value && value.length > 0;
};

// Validates minimum length for dynamic zone in edit context
const validateDynamicZoneMinOnEdit = (value) => {
  if (value === undefined) {
    return true;
  }
  return value !== null && value.length > 0;
};

// Applies required validation to dynamic zone schema
const applyDynamicZoneRequiredValidation = (schema, options) => {
  return schema.test('required', errorsTrads.required, value => {
    if (options.isCreatingEntry) {
      return validateDynamicZoneRequiredOnCreate(value);
    }
    return validateDynamicZoneRequiredOnEdit(value);
  });
};

// Applies minimum length validation to dynamic zone schema
const applyDynamicZoneMinValidation = (schema, options) => {
  return schema
    .test('min', errorsTrads.min, value => {
      if (options.isCreatingEntry) {
        return validateDynamicZoneMinOnCreate(value);
      }
      return validateDynamicZoneMinOnEdit(value);
    })
    .test('required', errorsTrads.required, value => {
      if (options.isCreatingEntry) {
        return validateDynamicZoneRequiredOnCreate(value);
      }
      return validateDynamicZoneRequiredOnEdit(value);
    });
};

// Handles dynamic zone type attributes
const buildDynamicZoneAttributeSchema = (attribute, components, options) => {
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
    dynamicZoneSchema = applyDynamicZoneRequiredValidation(dynamicZoneSchema, options);

    if (attribute.min) {
      dynamicZoneSchema = applyDynamicZoneMinValidation(dynamicZoneSchema, options);
    }
  } else if (attribute.min) {
    dynamicZoneSchema = dynamicZoneSchema.notEmptyMin(attribute.min);
  }

  if (attribute.max) {
    dynamicZoneSchema = dynamicZoneSchema.max(attribute.max, errorsTrads.max);
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
    acc[current] = buildSimpleAttributeSchema(attribute, options);
  } else if (attribute.type === 'relation') {
    acc[current] = buildRelationAttributeSchema(attribute);
  } else if (attribute.type === 'component') {
    acc[current] = buildComponentAttributeSchema(attribute, components, options);
  } else if (attribute.type === 'dynamiczone') {
    acc[current] = buildDynamicZoneAttributeSchema(attribute, components, options);
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
const validateJsonType = (value) => {
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

// Builds schema for string-based types
const buildStringSchema = (type) => {
  let schema = yup.string();

  if (type === 'email') {
    schema = schema.email(errorsTrads.email);
  }

  return schema;
};

// Builds schema for numeric types
const buildNumericSchema = (type) => {
  return yup
    .number()
    .transform(cv => (isNaN(cv) ? undefined : cv))
    .typeError();
};

// Builds schema for date types
const buildDateSchema = () => {
  return yup.date();
};

// Builds schema for JSON type
const buildJsonSchema = () => {
  return yup
    .mixed(errorsTrads.json)
    .test('isJSON', errorsTrads.json, validateJsonType)
    .nullable();
};

// Builds schema for biginteger type
const buildBigIntegerSchema = () => {
  return yup.string().matches(/^\d*$/);
};

// Determines and builds base schema for attribute type
const buildBaseSchema = (type) => {
  if (['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type)) {
    return buildStringSchema(type);
  }

  if (type === 'json') {
    return buildJsonSchema();
  }

  if (['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type)) {
    return buildNumericSchema(type);
  }

  if (['date', 'datetime'].includes(type)) {
    return buildDateSchema();
  }

  if (type === 'biginteger') {
    return buildBigIntegerSchema();
  }

  return yup.mixed();
};

// Validates required field for numeric types
const validateRequiredNumeric = (value) => {
  if (value === 0) {
    return true;
  }
  return !!value;
};

// Validates required field for date types
const validateRequiredDate = (value) => {
  return moment(value)._isValid === true;
};

// Validates required field for boolean type
const validateRequiredBoolean = (value) => {
  return value !== null;
};

// Applies required validation based on type and context
const applyRequiredValidation = (schema, type, options) => {
  if (!options.isDraft) {
    if (type === 'password' && options.isCreatingEntry) {
      return schema.required(errorsTrads.required);
    }

    if (type !== 'password') {
      if (options.isCreatingEntry) {
        return schema.required(errorsTrads.required);
      }

      return schema.test('required', errorsTrads.required, value => {
        if (value === undefined && !options.isFromComponent) {
          return true;
        }

        if (['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type)) {
          return validateRequiredNumeric(value);
        }

        if (['date', 'datetime'].includes(type)) {
          return validateRequiredDate(value);
        }

        if (type === 'boolean') {
          return validateRequiredBoolean(value);
        }

        return !isEmpty(value);
      });
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

// Applies numeric sign validation based on type
const applySignValidation = (schema, type, isPositive) => {
  if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
    return isPositive ? schema.positive() : schema.negative();
  }
  return schema;
};

// Processes individual validation rule
const processValidationRule = (schema, type, validation, validationValue, options) => {
  const shouldApplyValidation =
    !!validationValue ||
    (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
    validationValue === 0;

  if (!shouldApplyValidation) {
    return schema;
  }

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
      return applyMinValidation(schema, type, validationValue, options);
    case 'regex':
      return schema.matches(new RegExp(validationValue), errorsTrads.regex);
    case 'lowercase':
      return applyCaseTransformation(schema, type, 'lowercase');
    case 'uppercase':
      return applyCaseTransformation(schema, type, 'uppercase');
    case 'positive':
      return applySignValidation(schema, type, true);
    case 'negative':
      return applySignValidation(schema, type, false);
    default:
      return schema.nullable();
  }
};

const createYupSchemaAttribute = (type, validations, options) => {
  let schema = buildBaseSchema(type);

  Object.keys(validations).forEach(validation => {
    const validationValue = validations[validation];
    schema = processValidationRule(schema, type, validation, validationValue, options);
  });

  return schema;
};

export default createYupSchema;
```