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
  isNaN,
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

/**
 * Creates a yup validation schema for a compound field (relation, component, or dynamiczone)
 * @param {Object} attribute - The attribute descriptor from the model
 * @param {Object} components - Available component definitions
 * @param {Object} options - Schema creation options
 * @param {string} attributeName - The field name
 * @param {Object} acc - Accumulator object for schema shape
 * @returns {Object} - Updated accumulator with new field schema
 */
const processCompoundField = (attribute, components, options, attributeName, acc) => {
  if (attribute.type === 'relation') {
    acc[attributeName] = [
      'oneWay',
      'oneToOne',
      'manyToOne',
      'oneToManyMorph',
      'oneToOneMorph',
    ].includes(attribute.relationType)
      ? yup.object().nullable()
      : yup.array().nullable();

    return acc;
  }

  if (attribute.type === 'component') {
    return processComponentField(attribute, components, options, attributeName, acc);
  }

  if (attribute.type === 'dynamiczone') {
    acc[attributeName] = processDynamicZoneField(attribute, components, options);

    return acc;
  }

  return acc;
};

/**
 * Creates a yup validation schema for a component field
 * @param {Object} attribute - The component attribute descriptor
 * @param {Object} components - Available component definitions
 * @param {Object} options - Schema creation options
 * @param {string} attributeName - The field name
 * @param {Object} acc - Accumulator object for schema shape
 * @returns {Object} - Updated accumulator with component field schema
 */
const processComponentField = (attribute, components, options, attributeName, acc) => {
  const componentFieldSchema = createYupSchema(
    components[attribute.component],
    { components },
    { ...options, isFromComponent: true }
  );

  if (attribute.repeatable === true) {
    acc[attributeName] = createRepeatableComponentSchema(
      attribute,
      componentFieldSchema,
      options
    );

    return acc;
  }

  acc[attributeName] = yuplazyComponentSchema(attribute, componentFieldSchema, options);

  return acc;
};

/**
 * Creates a yup validation schema for a repeatable component field
 * @param {Object} attribute - The component attribute descriptor
 * @param {Object} componentFieldSchema - Base schema for the component
 * @param {Object} options - Schema creation options
 * @returns {Object} - yup array schema for repeatable component
 */
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

/**
 * Creates a lazy schema for non-repeatable components
 * @param {Object} attribute - The component attribute descriptor
 * @param {Object} componentFieldSchema - Base schema for the component
 * @param {Object} options - Schema creation options
 * @returns {Object} - yup lazy schema for component
 */
const yuplazyComponentSchema = (attribute, componentFieldSchema, options) => {
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
 * Creates a yup validation schema for a dynamiczone field
 * @param {Object} attribute - The dynamiczone attribute descriptor
 * @param {Object} components - Available component definitions
 * @param {Object} options - Schema creation options
 * @returns {Object} - yup array schema for dynamiczone
 */
const processDynamicZoneField = (attribute, components, options) => {
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
    dynamicZoneSchema = addRequiredDynamicZoneConstraints(
      dynamicZoneSchema,
      attribute,
      options
    );
  } else {
    dynamicZoneSchema = applyDynamicZoneMin(dynamicZoneSchema, attribute);
  }

  if (attribute.max) {
    dynamicZoneSchema = dynamicZoneSchema.max(attribute.max, errorsTrads.max);
  }

  return dynamicZoneSchema;
};

/**
 * Adds required constraints to dynamiczone schema
 * @param {Object} schema - Base dynamiczone schema
 * @param {Object} attribute - The dynamiczone attribute descriptor
 * @param {Object} options - Schema creation options
 * @returns {Object} - Dynamiczone schema with required constraints
 */
const addRequiredDynamicZoneConstraints = (schema, attribute, options) => {
  const requiredSchema = schema.test('required', errorsTrads.required, value => {
    if (options.isCreatingEntry) {
      return value !== null && value !== undefined;
    }

    if (value === undefined) {
      return true;
    }

    return value !== null;
  });

  if (!attribute.min) {
    return requiredSchema;
  }

  return requiredSchema
    .test('min', errorsTrads.min, value => {
      if (options.isCreatingEntry) {
        return value && value.length > 0;
      }

      if (value === undefined) {
        return true;
      }

      return value !== null && value.length > 0;
    })
    .test('required', errorsTrads.required, value => {
      if (options.isCreatingEntry) {
        return value !== null && value !== undefined;
      }

      if (value === undefined) {
        return true;
      }

      return value !== null;
    });
};

/**
 * Applies minimum length constraint to dynamiczone schema when not required
 * @param {Object} schema - Base dynamiczone schema
 * @param {Object} attribute - The dynamiczone attribute descriptor
 * @returns {Object} - Dynamiczone schema with min constraint applied
 */
const applyDynamicZoneMin = (schema, attribute) => {
  return attribute.min ? schema.notEmptyMin(attribute.min) : schema;
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

      // Process basic attributes
      if (
        attribute.type !== 'relation' &&
        attribute.type !== 'component' &&
        attribute.type !== 'dynamiczone'
      ) {
        acc[current] = createYupSchemaAttribute(attribute.type, attribute, options);
      } else {
        processCompoundField(attribute, components, options, current, acc);
      }

      return acc;
    }, {})
  );
};

const createYupSchemaAttribute = (type, validations, options) => {
  let schema = yup.mixed();

  if (['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type)) {
    schema = yup.string();
  }

  if (type === 'json') {
    schema = createJsonSchema();
  }

  if (type === 'email') {
    schema = schema.email(errorsTrads.email);
  }

  if (['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type)) {
    schema = createNumberSchema();
  }

  if (['date', 'datetime'].includes(type)) {
    schema = yup.date();
  }

  if (type === 'biginteger') {
    schema = schema.matches(/^\d*$/);
  }

  return applyValidationRules(schema, type, validations, options);
};

/**
 * Creates schema for JSON type fields
 * @returns {Object} - yup schema with JSON validation
 */
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

/**
 * Creates schema for number-type fields
 * @returns {Object} - yup number schema with transformation
 */
const createNumberSchema = () => {
  return yup
    .number()
    .transform(cv => (isNaN(cv) ? undefined : cv))
    .typeError();
};

/**
 * Applies validation rules to a base schema based on attribute validations
 * @param {Object} schema - Base schema to extend
 * @param {string} type - Field type
 * @param {Object} validations - Validation configuration
 * @param {Object} options - Schema creation options
 * @returns {Object} - Extended schema with validation rules
 */
const applyValidationRules = (schema, type, validations, options) => {
  Object.keys(validations).forEach(validation => {
    const validationValue = validations[validation];

    if (
      !!validationValue ||
      (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
      validationValue === 0
    ) {
      schema = applySingleValidationRule(schema, type, validation, validationValue, options);
    }
  });

  return schema;
};

/**
 * Applies a single validation rule to a schema
 * @param {Object} schema - Base schema
 * @param {string} type - Field type
 * @param {string} validation - Validation rule name
 * @param {*} validationValue - Value for the validation
 * @param {Object} options - Schema creation options
 * @returns {Object} - Schema with the validation rule applied
 */
const applySingleValidationRule = (schema, type, validation, validationValue, options) => {
  switch (validation) {
    case 'required':
      return applyRequiredValidation(schema, type, validationValue, options);

    case 'max':
      return type === 'biginteger' 
        ? schema.isInferior(errorsTrads.max, validationValue) 
        : schema.max(validationValue, errorsTrads.max);

    case 'maxLength':
      return schema.max(validationValue, errorsTrads.maxLength);

    case 'min':
      return type === 'biginteger'
        ? schema.isSuperior(errorsTrads.min, validationValue)
        : schema.min(validationValue, errorsTrads.min);

    case 'minLength':
      return !options.isDraft ? schema.min(validationValue, errorsTrads.minLength) : schema;

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

/**
 * Applies required validation rule with appropriate logic for field type
 * @param {Object} schema - Base schema
 * @param {string} type - Field type
 * @param {*} validationValue - Validation value (not used here)
 * @param {Object} options - Schema creation options
 * @returns {Object} - Schema with required validation applied
 */
const applyRequiredValidation = (schema, type, validationValue, options) => {
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

        return validateFieldPresence(type, value);
      });
    }
  }

  return schema;
};

/**
 * Validates field presence based on type
 * @param {string} type - Field type
 * @param {*} value - Field value
 * @returns {boolean} - Whether the value is considered present
 */
const validateFieldPresence = (type, value) => {
  if (['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type)) {
    return value !== 0 || value === 0;
  }

  if (['date', 'datetime'].includes(type)) {
    return moment(value)._isValid === true;
  }

  if (type === 'boolean') {
    return value !== null;
  }

  return !isEmpty(value);
};

export default createYupSchema;