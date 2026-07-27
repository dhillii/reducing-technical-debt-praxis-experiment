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

/** @param {Object} attribute - The attribute to check */
const isSimpleAttribute = attribute =>
  attribute.type !== 'relation' &&
  attribute.type !== 'component' &&
  attribute.type !== 'dynamiczone';

/** @param {Object} attribute - The attribute to check */
const isRelationAttribute = attribute => attribute.type === 'relation';

/** @param {Object} attribute - The attribute to check */
const isComponentAttribute = attribute => attribute.type === 'component';

/** @param {Object} attribute - The attribute to check */
const isDynamicZoneAttribute = attribute => attribute.type === 'dynamiczone';

/** @param {string} relationType - The relation type to check */
const isSingleRelation = relationType =>
  ['oneWay', 'oneToOne', 'manyToOne', 'oneToManyMorph', 'oneToOneMorph'].includes(relationType);

/** @param {Object} attribute - The component attribute */
const isRepeatableComponent = attribute => attribute.repeatable === true;

/** @param {number} min - Minimum value */
const hasMinConstraint = min => min && min > 0;

/** @param {number} max - Maximum value */
const hasMaxConstraint = max => max && max > 0;

/**
 * Build schema for simple attributes
 * @param {Object} attribute - The attribute definition
 * @param {Object} options - Schema options
 * @returns {Object} Yup schema
 */
const buildSimpleAttributeSchema = (attribute, options) => {
  return createYupSchemaAttribute(attribute.type, attribute, options);
};

/**
 * Build schema for relation attributes
 * @param {Object} attribute - The attribute definition
 * @returns {Object} Yup schema
 */
const buildRelationAttributeSchema = attribute => {
  return isSingleRelation(attribute.relationType)
    ? yup.object().nullable()
    : yup.array().nullable();
};

/**
 * Build lazy schema for repeatable components
 * @param {Object} componentFieldSchema - The component field schema
 * @param {Object} attribute - The attribute definition
 * @param {Object} options - Schema options
 * @returns {Object} Yup lazy schema
 */
const buildRepeatableComponentSchema = (componentFieldSchema, attribute, options) => {
  const { min, max, required } = attribute;

  return yup.lazy(value => {
    let baseSchema = yup.array().of(componentFieldSchema);

    if (hasMinConstraint(min) && !options.isDraft) {
      if (required) {
        baseSchema = baseSchema.min(min, errorsTrads.min);
      } else if (required !== true && isEmpty(value)) {
        baseSchema = baseSchema.nullable();
      } else {
        baseSchema = baseSchema.min(min, errorsTrads.min);
      }
    }

    if (hasMaxConstraint(max)) {
      baseSchema = baseSchema.max(max, errorsTrads.max);
    }

    return baseSchema;
  });
};

/**
 * Build lazy schema for non-repeatable components
 * @param {Object} componentFieldSchema - The component field schema
 * @param {Object} attribute - The attribute definition
 * @param {Object} options - Schema options
 * @returns {Object} Yup lazy schema
 */
const buildNonRepeatableComponentSchema = (componentFieldSchema, attribute, options) => {
  return yup.lazy(obj => {
    if (obj !== undefined) {
      return attribute.required === true && !options.isDraft
        ? componentFieldSchema.defined()
        : componentFieldSchema.nullable();
    }

    return attribute.required === true ? yup.object().defined() : yup.object().nullable();
  });
};

/**
 * Build schema for component attributes
 * @param {Object} attribute - The attribute definition
 * @param {Object} components - Available components
 * @param {Object} options - Schema options
 * @returns {Object} Yup schema
 */
const buildComponentAttributeSchema = (attribute, components, options) => {
  const componentFieldSchema = createYupSchema(
    components[attribute.component],
    { components },
    { ...options, isFromComponent: true }
  );

  if (isRepeatableComponent(attribute)) {
    return buildRepeatableComponentSchema(componentFieldSchema, attribute, options);
  }

  return buildNonRepeatableComponentSchema(componentFieldSchema, attribute, options);
};

/**
 * Build required test for dynamic zone
 * @param {Object} options - Schema options
 * @returns {Function} Test function
 */
const buildDynamicZoneRequiredTest = options => {
  return (value) => {
    if (options.isCreatingEntry) {
      return value !== null || value !== undefined;
    }

    if (value === undefined) {
      return true;
    }

    return value !== null;
  };
};

/**
 * Build min test for dynamic zone
 * @param {Object} options - Schema options
 * @returns {Function} Test function
 */
const buildDynamicZoneMinTest = options => {
  return (value) => {
    if (options.isCreatingEntry) {
      return value && value.length > 0;
    }

    if (value === undefined) {
      return true;
    }

    return value !== null && value.length > 0;
  };
};

/**
 * Apply required constraints to dynamic zone schema
 * @param {Object} schema - The schema to modify
 * @param {Object} attribute - The attribute definition
 * @param {Object} options - Schema options
 * @returns {Object} Modified schema
 */
const applyDynamicZoneRequiredConstraints = (schema, attribute, options) => {
  let result = schema;

  result = result.test('required', errorsTrads.required, buildDynamicZoneRequiredTest(options));

  if (hasMinConstraint(attribute.min)) {
    result = result
      .test('min', errorsTrads.min, buildDynamicZoneMinTest(options))
      .test('required', errorsTrads.required, buildDynamicZoneRequiredTest(options));
  }

  return result;
};

/**
 * Build schema for dynamic zone attributes
 * @param {Object} attribute - The attribute definition
 * @param {Object} components - Available components
 * @param {Object} options - Schema options
 * @returns {Object} Yup schema
 */
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
    dynamicZoneSchema = applyDynamicZoneRequiredConstraints(dynamicZoneSchema, attribute, options);
  } else if (hasMinConstraint(attribute.min)) {
    dynamicZoneSchema = dynamicZoneSchema.notEmptyMin(attribute.min);
  }

  if (hasMaxConstraint(attribute.max)) {
    dynamicZoneSchema = dynamicZoneSchema.max(attribute.max, errorsTrads.max);
  }

  return dynamicZoneSchema;
};

/**
 * Process a single attribute and add it to the accumulator
 * @param {Object} acc - Accumulator object
 * @param {string} current - Current attribute key
 * @param {Object} attribute - The attribute definition
 * @param {Object} components - Available components
 * @param {Object} options - Schema options
 * @returns {Object} Updated accumulator
 */
const processAttribute = (acc, current, attribute, components, options) => {
  if (isSimpleAttribute(attribute)) {
    acc[current] = buildSimpleAttributeSchema(attribute, options);
    return acc;
  }

  if (isRelationAttribute(attribute)) {
    acc[current] = buildRelationAttributeSchema(attribute);
    return acc;
  }

  if (isComponentAttribute(attribute)) {
    acc[current] = buildComponentAttributeSchema(attribute, components, options);
    return acc;
  }

  if (isDynamicZoneAttribute(attribute)) {
    acc[current] = buildDynamicZoneAttributeSchema(attribute, components, options);
    return acc;
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

/**
 * Check if validation value should be applied
 * @param {*} validationValue - The validation value
 * @returns {boolean} Whether to apply validation
 */
const shouldApplyValidation = validationValue =>
  !!validationValue ||
  (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
  validationValue === 0;

/**
 * Build required validation test
 * @param {string} type - The attribute type
 * @param {Object} options - Schema options
 * @returns {Function} Test function
 */
const buildRequiredTest = (type, options) => {
  return (value) => {
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
};

/**
 * Apply required validation to schema
 * @param {Object} schema - The schema to modify
 * @param {string} type - The attribute type
 * @param {Object} options - Schema options
 * @returns {Object} Modified schema
 */
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

  return schema.test('required', errorsTrads.required, buildRequiredTest(type, options));
};

/**
 * Apply max validation to schema
 * @param {Object} schema - The schema to modify
 * @param {string} type - The attribute type
 * @param {*} validationValue - The max value
 * @returns {Object} Modified schema
 */
const applyMaxValidation = (schema, type, validationValue) => {
  if (type === 'biginteger') {
    return schema.isInferior(errorsTrads.max, validationValue);
  }
  return schema.max(validationValue, errorsTrads.max);
};

/**
 * Apply min validation to schema
 * @param {Object} schema - The schema to modify
 * @param {string} type - The attribute type
 * @param {*} validationValue - The min value
 * @returns {Object} Modified schema
 */
const applyMinValidation = (schema, type, validationValue) => {
  if (type === 'biginteger') {
    return schema.isSuperior(errorsTrads.min, validationValue);
  }
  return schema.min(validationValue, errorsTrads.min);
};

/**
 * Apply minLength validation to schema
 * @param {Object} schema - The schema to modify
 * @param {*} validationValue - The min length value
 * @param {Object} options - Schema options
 * @returns {Object} Modified schema
 */
const applyMinLengthValidation = (schema, validationValue, options) => {
  if (options.isDraft) {
    return schema;
  }
  return schema.min(validationValue, errorsTrads.minLength);
};

/**
 * Apply case transformation to schema
 * @param {Object} schema - The schema to modify
 * @param {string} type - The attribute type
 * @param {string} caseType - 'lowercase' or 'uppercase'
 * @returns {Object} Modified schema
 */
const applyCaseTransformation = (schema, type, caseType) => {
  if (!['text', 'textarea', 'email', 'string'].includes(type)) {
    return schema;
  }

  if (caseType === 'lowercase') {
    return schema.strict().lowercase();
  }

  if (caseType === 'uppercase') {
    return schema.strict().uppercase();
  }

  return schema;
};

/**
 * Apply numeric constraint to schema
 * @param {Object} schema - The schema to modify
 * @param {string} type - The attribute type
 * @param {string} constraint - 'positive' or 'negative'
 * @returns {Object} Modified schema
 */
const applyNumericConstraint = (schema, type, constraint) => {
  if (!['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
    return schema;
  }

  if (constraint === 'positive') {
    return schema.positive();
  }

  if (constraint === 'negative') {
    return schema.negative();
  }

  return schema;
};

/**
 * Apply a single validation rule to schema
 * @param {Object} schema - The schema to modify
 * @param {string} validation - The validation rule name
 * @param {*} validationValue - The validation value
 * @param {string} type - The attribute type
 * @param {Object} options - Schema options
 * @returns {Object} Modified schema
 */
const applyValidationRule = (schema, validation, validationValue, type, options) => {
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
      return applyMinLengthValidation(schema, validationValue, options);
    case 'regex':
      return schema.matches(new RegExp(validationValue), errorsTrads.regex);
    case 'lowercase':
      return applyCaseTransformation(schema, type, 'lowercase');
    case 'uppercase':
      return applyCaseTransformation(schema, type, 'uppercase');
    case 'positive':
      return applyNumericConstraint(schema, type, 'positive');
    case 'negative':
      return applyNumericConstraint(schema, type, 'negative');
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

    if (shouldApplyValidation(validationValue)) {
      schema = applyValidationRule(schema, validation, validationValue, type, options);
    }
  });

  return schema;
};

export default createYupSchema;