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
 * Creates a yup schema for a single attribute based on its type and validations.
 * @param {string} type - The attribute type (e.g., 'string', 'number', 'email')
 * @param {Object} validations - Validation rules for the attribute
 * @param {Object} options - Schema generation options
 * @returns {Object} - A yup schema for the attribute
 */
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
    schema = yup.string().matches(/^\d*$/);
  }

  Object.keys(validations).forEach(validation => {
    const validationValue = validations[validation];

    if (
      !!validationValue ||
      (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
      validationValue === 0
    ) {
      applyValidation(schema, type, validation, validationValue, options);
    }
  });

  return schema;
};

/**
 * Creates a JSON schema with proper validation.
 * @returns {Object} - A yup schema for JSON type
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
 * Creates a number schema with proper transformation.
 * @returns {Object} - A yup schema for number types
 */
const createNumberSchema = () => {
  return yup
    .number()
    .transform(cv => (isNaN(cv) ? undefined : cv))
    .typeError();
};

/**
 * Applies a validation rule to the schema based on validation type.
 * @param {Object} schema - The current yup schema
 * @param {string} type - The attribute type
 * @param {string} validation - The validation rule name
 * @param {*} validationValue - The validation value
 * @param {Object} options - Schema generation options
 * @returns {void}
 */
const applyValidation = (schema, type, validation, validationValue, options) => {
  switch (validation) {
    case 'required': {
      applyRequiredValidation(schema, type, validationValue, options);
      break;
    }

    case 'max': {
      if (type === 'biginteger') {
        schema = schema.isInferior(errorsTrads.max, validationValue);
      } else {
        schema = schema.max(validationValue, errorsTrads.max);
      }
      break;
    }

    case 'maxLength': {
      schema = schema.max(validationValue, errorsTrads.maxLength);
      break;
    }

    case 'min': {
      if (type === 'biginteger') {
        schema = schema.isSuperior(errorsTrads.min, validationValue);
      } else {
        schema = schema.min(validationValue, errorsTrads.min);
      }
      break;
    }

    case 'minLength': {
      if (!options.isDraft) {
        schema = schema.min(validationValue, errorsTrads.minLength);
      }
      break;
    }

    case 'regex': {
      schema = schema.matches(new RegExp(validationValue), errorsTrads.regex);
      break;
    }

    case 'lowercase': {
      if (['text', 'textarea', 'email', 'string'].includes(type)) {
        schema = schema.strict().lowercase();
      }
      break;
    }

    case 'uppercase': {
      if (['text', 'textarea', 'email', 'string'].includes(type)) {
        schema = schema.strict().uppercase();
      }
      break;
    }

    case 'positive': {
      if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
        schema = schema.positive();
      }
      break;
    }

    case 'negative': {
      if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
        schema = schema.negative();
      }
      break;
    }

    default: {
      schema = schema.nullable();
    }
  }
};

/**
 * Applies required validation to the schema.
 * @param {Object} schema - The current yup schema
 * @param {string} type - The attribute type
 * @param {*} validationValue - The validation value (unused but kept for signature consistency)
 * @param {Object} options - Schema generation options
 * @returns {void}
 */
const applyRequiredValidation = (schema, type, validationValue, options) => {
  if (!options.isDraft) {
    if (type === 'password' && options.isCreatingEntry) {
      schema = schema.required(errorsTrads.required);
    }

    if (type !== 'password') {
      if (options.isCreatingEntry) {
        schema = schema.required(errorsTrads.required);
      } else {
        schema = schema.test('required', errorsTrads.required, value => {
          // Field is not touched and the user is editing the entry
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
        });
      }
    }
  }
};

/**
 * Creates a yup schema for a component field.
 * @param {Object} component - The component definition
 * @param {Object} context - The context object containing components
 * @param {Object} options - Schema generation options
 * @returns {Object} - A yup schema for the component
 */
const createComponentFieldSchema = (component, context, options) => {
  return createYupSchema(
    component,
    context,
    { ...options, isFromComponent: true }
  );
};

/**
 * Creates a yup schema for a repeatable component.
 * @param {Object} component - The component definition
 * @param {Object} context - The context object containing components
 * @param {Object} options - Schema generation options
 * @param {Object} attribute - The component attribute definition
 * @returns {Object} - A lazy yup schema for the repeatable component
 */
const createRepeatableComponentSchema = (component, context, options, attribute) => {
  const componentFieldSchema = createComponentFieldSchema(component, context, options);

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
 * Creates a yup schema for a non-repeatable component.
 * @param {Object} component - The component definition
 * @param {Object} context - The context object containing components
 * @param {Object} options - Schema generation options
 * @param {Object} attribute - The component attribute definition
 * @returns {Object} - A lazy yup schema for the non-repeatable component
 */
const createNonRepeatableComponentSchema = (component, context, options, attribute) => {
  const componentFieldSchema = createComponentFieldSchema(component, context, options);

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
 * Creates a yup schema for a dynamic zone.
 * @param {Object} attribute - The dynamic zone attribute definition
 * @param {Object} context - The context object containing components
 * @param {Object} options - Schema generation options
 * @returns {Object} - A yup schema for the dynamic zone
 */
const createDynamicZoneSchema = (attribute, context, options) => {
  let dynamicZoneSchema = yup.array().of(
    yup.lazy(({ __component }) => {
      return createYupSchema(
        context.components[__component],
        context,
        { ...options, isFromComponent: true }
      );
    })
  );

  const { max, min } = attribute;

  if (attribute.required && !options.isDraft) {
    dynamicZoneSchema = dynamicZoneSchema.test('required', errorsTrads.required, value => {
      if (options.isCreatingEntry) {
        return value !== null || value !== undefined;
      }

      if (value === undefined) {
        return true;
      }

      return value !== null;
    });

    if (min) {
      dynamicZoneSchema = dynamicZoneSchema
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
            return value !== null || value !== undefined;
          }

          if (value === undefined) {
            return true;
          }

          return value !== null;
        });
    }
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

const createYupSchema = (
  model,
  { components },
  options = { isCreatingEntry: true, isDraft: true, isFromComponent: false }
) => {
  const attributes = getAttributes(model);

  return yup.object().shape(
    Object.keys(attributes).reduce((acc, current) => {
      const attribute = attributes[current];

      if (
        attribute.type !== 'relation' &&
        attribute.type !== 'component' &&
        attribute.type !== 'dynamiczone'
      ) {
        const formatted = createYupSchemaAttribute(attribute.type, attribute, options);
        acc[current] = formatted;
      }

      if (attribute.type === 'relation') {
        acc[current] = [
          'oneWay',
          'oneToOne',
          'manyToOne',
          'oneToManyMorph',
          'oneToOneMorph',
        ].includes(attribute.relationType)
          ? yup.object().nullable()
          : yup.array().nullable();
      }

      if (attribute.type === 'component') {
        const component = components[attribute.component];

        if (attribute.repeatable === true) {
          acc[current] = createRepeatableComponentSchema(component, { components }, options, attribute);
        } else {
          acc[current] = createNonRepeatableComponentSchema(component, { components }, options, attribute);
        }

        return acc;
      }

      if (attribute.type === 'dynamiczone') {
        acc[current] = createDynamicZoneSchema(attribute, { components }, options);
      }

      return acc;
    }, {})
  );
};

export default createYupSchema;