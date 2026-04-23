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

/** @returns {boolean} True if attribute is a simple field type */
const isSimpleFieldType = (type) => {
  return type !== 'relation' && type !== 'component' && type !== 'dynamiczone';
};

/** @returns {boolean} True if relation type is single-valued */
const isSingleValuedRelation = (relationType) => {
  return ['oneWay', 'oneToOne', 'manyToOne', 'oneToManyMorph', 'oneToOneMorph'].includes(relationType);
};

/** @returns {yup.Schema} Schema for relation attributes */
const createRelationSchema = (relationType) => {
  return isSingleValuedRelation(relationType) ? yup.object().nullable() : yup.array().nullable();
};

/** @returns {yup.Schema} Schema for repeatable component */
const createRepeatableComponentSchema = (componentFieldSchema, attribute, options) => {
  const { min, max, required } = attribute;
  
  return yup.lazy(value => {
    let baseSchema = yup.array().of(componentFieldSchema);

    if (min && !options.isDraft) {
      if (required) {
        baseSchema = baseSchema.min(min, errorsTrads.min);
      } else if (!required && isEmpty(value)) {
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

/** @returns {yup.Schema} Schema for single component */
const createSingleComponentSchema = (componentFieldSchema, attribute, options) => {
  return yup.lazy(obj => {
    if (obj !== undefined) {
      return attribute.required === true && !options.isDraft
        ? componentFieldSchema.defined()
        : componentFieldSchema.nullable();
    }

    return attribute.required === true ? yup.object().defined() : yup.object().nullable();
  });
};

/** @returns {yup.Schema} Schema for dynamic zone with required validation */
const applyDynamicZoneRequiredValidation = (schema, options) => {
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

/** @returns {yup.Schema} Schema for dynamic zone with min validation */
const applyDynamicZoneMinValidation = (schema, options) => {
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

/** @returns {yup.Schema} Schema for dynamic zone with all constraints */
const createDynamicZoneSchema = (componentSchema, attribute, options) => {
  let schema = yup.array().of(componentSchema);
  const { max, min, required } = attribute;

  if (required && !options.isDraft) {
    schema = applyDynamicZoneRequiredValidation(schema, options);

    if (min) {
      schema = applyDynamicZoneMinValidation(schema, options);
      schema = applyDynamicZoneRequiredValidation(schema, options);
    }
  } else if (min) {
    schema = schema.notEmptyMin(min);
  }

  if (max) {
    schema = schema.max(max, errorsTrads.max);
  }

  return schema;
};

/** @returns {boolean} True if validation value should be applied */
const shouldApplyValidation = (validationValue) => {
  if (!!validationValue) {
    return true;
  }
  if (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) {
    return true;
  }
  return validationValue === 0;
};

/** @returns {boolean} True if field is numeric type */
const isNumericType = (type) => {
  return ['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type);
};

/** @returns {boolean} True if field is date type */
const isDateType = (type) => {
  return ['date', 'datetime'].includes(type);
};

/** @returns {boolean} True if field is text-like type */
const isTextLikeType = (type) => {
  return ['text', 'textarea', 'email', 'string'].includes(type);
};

/** @returns {yup.Schema} Schema for required validation */
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

  return schema.test('required', errorsTrads.required, value => {
    if (value === undefined && !options.isFromComponent) {
      return true;
    }

    if (isNumericType(type)) {
      return value === 0 ? true : !!value;
    }

    if (isDateType(type)) {
      return moment(value)._isValid === true;
    }

    if (type === 'boolean') {
      return value !== null;
    }

    return !isEmpty(value);
  });
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

      if (isSimpleFieldType(attribute.type)) {
        const formatted = createYupSchemaAttribute(attribute.type, attribute, options);
        acc[current] = formatted;
        return acc;
      }

      if (attribute.type === 'relation') {
        acc[current] = createRelationSchema(attribute.relationType);
        return acc;
      }

      if (attribute.type === 'component') {
        const componentFieldSchema = createYupSchema(
          components[attribute.component],
          { components },
          { ...options, isFromComponent: true }
        );

        if (attribute.repeatable === true) {
          acc[current] = createRepeatableComponentSchema(componentFieldSchema, attribute, options);
          return acc;
        }

        acc[current] = createSingleComponentSchema(componentFieldSchema, attribute, options);
        return acc;
      }

      if (attribute.type === 'dynamiczone') {
        const componentSchema = yup.lazy(({ __component }) => {
          return createYupSchema(
            components[__component],
            { components },
            { ...options, isFromComponent: true }
          );
        });

        acc[current] = createDynamicZoneSchema(componentSchema, attribute, options);
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

    if (!shouldApplyValidation(validationValue)) {
      return;
    }

    switch (validation) {
      case 'required':
        schema = applyRequiredValidation(schema, type, options);
        break;

      case 'max':
        schema = type === 'biginteger'
          ? schema.isInferior(errorsTrads.max, validationValue)
          : schema.max(validationValue, errorsTrads.max);
        break;

      case 'maxLength':
        schema = schema.max(validationValue, errorsTrads.maxLength);
        break;

      case 'min':
        schema = type === 'biginteger'
          ? schema.isSuperior(errorsTrads.min, validationValue)
          : schema.min(validationValue, errorsTrads.min);
        break;

      case 'minLength':
        if (!options.isDraft) {
          schema = schema.min(validationValue, errorsTrads.minLength);
        }
        break;

      case 'regex':
        schema = schema.matches(new RegExp(validationValue), errorsTrads.regex);
        break;

      case 'lowercase':
        if (isTextLikeType(type)) {
          schema = schema.strict().lowercase();
        }
        break;

      case 'uppercase':
        if (isTextLikeType(type)) {
          schema = schema.strict().uppercase();
        }
        break;

      case 'positive':
        if (isNumericType(type)) {
          schema = schema.positive();
        }
        break;

      case 'negative':
        if (isNumericType(type)) {
          schema = schema.negative();
        }
        break;

      default:
        schema = schema.nullable();
    }
  });

  return schema;
};

export default createYupSchema;