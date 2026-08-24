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

/**
 * Creates yup schema validation for a single attribute based on its type and validations.
 * Extracted to reduce cognitive complexity of main schema builder.
 */
const createYupSchemaAttribute = (type, validations, options) => {
  let schema = yup.mixed();

  if (['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type)) {
    schema = yup.string();
  }

  if (type === 'json') {
    schema = setupJsonSchema();
  }

  if (type === 'email') {
    schema = schema.email(errorsTrads.email);
  }

  if (['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type)) {
    schema = setupNumberSchema();
  }

  if (['date', 'datetime'].includes(type)) {
    schema = yup.date();
  }

  if (type === 'biginteger') {
    schema = yup.string().matches(/^\d*$/);
  }

  return applyValidationsToSchema(schema, type, validations, options);
};

/**
 * Configures JSON schema with custom parsing validation.
 */
const setupJsonSchema = () => {
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
 * Configures yup number schema with appropriate transformation.
 */
const setupNumberSchema = () => {
  return yup
    .number()
    .transform(cv => (isNaN(cv) ? undefined : cv))
    .typeError();
};

/**
 * Applies validation rules to an initialized schema based on the attribute type and options.
 */
const applyValidationsToSchema = (schema, type, validations, options) => {
  Object.keys(validations).forEach(validation => {
    const validationValue = validations[validation];

    if (
      !!validationValue ||
      (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
      validationValue === 0
    ) {
      applySingleValidation(schema, type, validation, validationValue, options);
    }
  });

  return schema;
};

/**
 * Applies a single validation rule to the schema based on its name.
 */
const applySingleValidation = (schema, type, validation, value, options) => {
  switch (validation) {
    case 'required':
      applyRequiredValidation(schema, type, value, options);
      break;
    case 'max':
      applyMaxValidation(schema, type, value);
      break;
    case 'maxLength':
      schema = schema.max(value, errorsTrads.maxLength);
      break;
    case 'min':
      applyMinValidation(schema, type, value);
      break;
    case 'minLength':
      if (!options.isDraft) {
        schema = schema.min(value, errorsTrads.minLength);
      }
      break;
    case 'regex':
      schema = schema.matches(new RegExp(value), errorsTrads.regex);
      break;
    case 'lowercase':
      if (['text', 'textarea', 'email', 'string'].includes(type)) {
        schema = schema.strict().lowercase();
      }
      break;
    case 'uppercase':
      if (['text', 'textarea', 'email', 'string'].includes(type)) {
        schema = schema.strict().uppercase();
      }
      break;
    case 'positive':
      if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
        schema = schema.positive();
      }
      break;
    case 'negative':
      if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
        schema = schema.negative();
      }
      break;
    default:
      schema = schema.nullable();
  }

  return schema;
};

/**
 * Applies 'required' validation with special handling for passwords and component contexts.
 */
const applyRequiredValidation = (schema, type, value, options) => {
  if (!options.isDraft) {
    if (type === 'password' && options.isCreatingEntry) {
      schema = schema.required(errorsTrads.required);
    }

    if (type !== 'password') {
      if (options.isCreatingEntry) {
        schema = schema.required(errorsTrads.required);
      } else {
        schema = schema.test('required', errorsTrads.required, requiredFieldValidator(options, type));
      }
    }
  }

  return schema;
};

/**
 * Returns a function to validate required fields with type/option-aware logic.
 */
const requiredFieldValidator = (options, type) => (value) => {
  if (value === undefined && !options.isFromComponent) {
    return true;
  }

  if (['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type)) {
    if (value === 0) return true;
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

/**
 * Applies 'max' validation for biginteger或其他类型.
 */
const applyMaxValidation = (schema, type, value) => {
  if (type === 'biginteger') {
    schema = schema.isInferior(errorsTrads.max, value);
  } else {
    schema = schema.max(value, errorsTrads.max);
  }
};

/**
 * Applies 'min' validation for biginteger或其他类型.
 */
const applyMinValidation = (schema, type, value) => {
  if (type === 'biginteger') {
    schema = schema.isSuperior(errorsTrads.min, value);
  } else {
    schema = schema.min(value, errorsTrads.min);
  }
};

const createYupSchema = (
  model,
  { components },
  options = { isCreatingEntry: true, isDraft: true, isFromComponent: false }
) => {
  const attributes = getAttributes(model);
  const schemaKeys = Object.keys(attributes);
  const shape = {};

  for (const current of schemaKeys) {
    const attribute = attributes[current];

    if (attribute.type !== 'relation' &&
        attribute.type !== 'component' &&
        attribute.type !== 'dynamiczone') {
      shape[current] = createYupSchemaAttribute(attribute.type, attribute, options);
    } else if (attribute.type === 'relation') {
      shape[current] = setupRelationSchema(attribute);
    } else if (attribute.type === 'component') {
      shape[current] = setupComponentSchema(current, attribute, components, options);
    } else if (attribute.type === 'dynamiczone') {
      shape[current] = setupDynamicZoneSchema(attribute, components, options);
    }
  }

  return yup.object().shape(shape);
};

/**
 * Configures schema for relation-type attributes.
 */
const setupRelationSchema = (attribute) => {
  const oneToOneTypes = ['oneWay', 'oneToOne', 'manyToOne', 'oneToManyMorph', 'oneToOneMorph'];
  return oneToOneTypes.includes(attribute.relationType)
    ? yup.object().nullable()
    : yup.array().nullable();
};

/**
 * Configures schema for component-type attributes.
 */
const setupComponentSchema = (name, attribute, components, options) => {
  const componentFieldSchema = createYupSchema(
    components[attribute.component],
    { components },
    { ...options, isFromComponent: true }
  );

  if (attribute.repeatable === true) {
    return setupRepeatableComponentSchema(name, attribute, componentFieldSchema, options);
  }

  return setupSingleComponentSchema(attribute, componentFieldSchema);
};

/**
 * Sets up schema for repeatable component field (array).
 */
const setupRepeatableComponentSchema = (name, attribute, componentFieldSchema, options) => {
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
 * Sets up schema for non-repeatable (single) component field.
 */
const setupSingleComponentSchema = (attribute, componentFieldSchema) => {
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
 * Sets up schema for dynamic zone fields.
 */
const setupDynamicZoneSchema = (attribute, components, options) => {
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
    dynamicZoneSchema = setupRequiredDynamicZoneSchema(attribute, options, dynamicZoneSchema, min);
  } else {
    if (min) {
      dynamicZoneSchema = dynamicZoneSchema.notEmptyMin(min);
    }
  }

  if (max) {
    dynamicZoneSchema = dynamicZoneSchema.max(max, errorsTrads.max);
  }

  return dynamicZoneSchema;
};

/**
 * Configures dynamic zone schema when required validation applies.
 */
const setupRequiredDynamicZoneSchema = (attribute, options, dynamicZoneSchema, min) => {
  dynamicZoneSchema = dynamicZoneSchema.test('required', errorsTrads.required, value => {
    if (options.isCreatingEntry) {
      return value !== null || value !== undefined;
    }

    if (value === undefined) return true;
    return value !== null;
  });

  if (min) {
    dynamicZoneSchema = dynamicZoneSchema
      .test('min', errorsTrads.min, value => {
        if (options.isCreatingEntry) {
          return value && value.length > 0;
        }

        if (value === undefined) return true;
        return value !== null && value.length > 0;
      })
      .test('required', errorsTrads.required, value => {
        if (options.isCreatingEntry) {
          return value !== null || value !== undefined;
        }

        if (value === undefined) return true;
        return value !== null;
      });
  }

  return dynamicZoneSchema;
};

export default createYupSchema;