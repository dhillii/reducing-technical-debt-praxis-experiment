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

const isNonRelationalFieldType = type =>
  type !== 'relation' && type !== 'component' && type !== 'dynamiczone';

const isSingleRelationType = relationType =>
  ['oneWay', 'oneToOne', 'manyToOne', 'oneToManyMorph', 'oneToOneMorph'].includes(relationType);

const isRelationFieldType = type => type === 'relation';

const isComponentFieldType = type => type === 'component';

const isDynamicZoneFieldType = type => type === 'dynamiczone';

/**
 * Creates yup schema for component field
 * @param {Object} component - component definition
 * @param {Object} components - available components
 * @param {Object} options - schema creation options
 * @returns {Object} - component schema
 */
const createComponentSchema = (component, components, options) => {
  const componentFieldSchema = createYupSchema(component, { components }, { ...options, isFromComponent: true });

  if (component.repeatable === true) {
    const { min, max, required } = component;
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
  }

  return yup.lazy(obj => {
    if (obj !== undefined) {
      return component.required === true && !options.isDraft
        ? componentFieldSchema.defined()
        : componentFieldSchema.nullable();
    }

    return component.required === true ? yup.object().defined() : yup.object().nullable();
  });
};

/**
 * Creates yup schema for dynamic zone field
 * @param {Object} attribute - dynamic zone attribute definition
 * @param {Object} components - available components
 * @param {Object} options - schema creation options
 * @returns {Object} - dynamic zone schema
 */
const createDynamicZoneSchema = (attribute, components, options) => {
  let dynamicZoneSchema = yup.array().of(
    yup.lazy(({ __component }) => {
      return createYupSchema(components[__component], { components }, { ...options, isFromComponent: true });
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

      if (isNonRelationalFieldType(attribute.type)) {
        const formatted = createYupSchemaAttribute(attribute.type, attribute, options);
        acc[current] = formatted;
        return acc;
      }

      if (isRelationFieldType(attribute.type)) {
        acc[current] = isSingleRelationType(attribute.relationType)
          ? yup.object().nullable()
          : yup.array().nullable();
        return acc;
      }

      if (isComponentFieldType(attribute.type)) {
        acc[current] = createComponentSchema(components[attribute.component], components, options);
        return acc;
      }

      if (isDynamicZoneFieldType(attribute.type)) {
        acc[current] = createDynamicZoneSchema(attribute, components, options);
      }

      return acc;
    }, {})
  );
};

const createYupSchemaAttribute = (type, validations, options) => {
  let schema = yup.mixed();

  const isStringType = type => ['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type);
  const isNumericType = type => ['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type);
  const isDateType = type => ['date', 'datetime'].includes(type);

  if (isStringType(type)) {
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

  if (isNumericType(type)) {
    schema = yup
      .number()
      .transform(cv => (isNaN(cv) ? undefined : cv))
      .typeError();
  }

  if (isDateType(type)) {
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
      switch (validation) {
        case 'required': {
          if (!options.isDraft) {
            handleRequiredValidation(schema, type, options);
          }
          break;
        }

        case 'max': {
          schema = type === 'biginteger'
            ? schema.isInferior(errorsTrads.max, validationValue)
            : schema.max(validationValue, errorsTrads.max);
          break;
        }

        case 'maxLength':
          schema = schema.max(validationValue, errorsTrads.maxLength);
          break;

        case 'min': {
          schema = type === 'biginteger'
            ? schema.isSuperior(errorsTrads.min, validationValue)
            : schema.min(validationValue, errorsTrads.min);
          break;
        }

        case 'minLength': {
          if (!options.isDraft) {
            schema = schema.min(validationValue, errorsTrads.minLength);
          }
          break;
        }

        case 'regex':
          schema = schema.matches(new RegExp(validationValue), errorsTrads.regex);
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
    }
  });

  return schema;
};

/**
 * Handles required validation for fields
 * @param {Object} schema - current yup schema
 * @param {string} type - field type
 * @param {Object} options - schema creation options
 * @returns {Object} - updated schema with required validation applied
 */
const handleRequiredValidation = (schema, type, options) => {
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
        return value === 0 || !!value;
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

  return schema;
};

export default createYupSchema;