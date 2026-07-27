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

/** @returns {boolean} True if attribute is a simple type (not relation, component, or dynamiczone) */
const isSimpleAttribute = attribute => 
  attribute.type !== 'relation' &&
  attribute.type !== 'component' &&
  attribute.type !== 'dynamiczone';

/** @returns {boolean} True if relation type is single-valued */
const isSingleValuedRelation = relationType =>
  ['oneWay', 'oneToOne', 'manyToOne', 'oneToManyMorph', 'oneToOneMorph'].includes(relationType);

/** @returns {yup.Schema} Schema for relation attributes */
const createRelationSchema = relationType =>
  isSingleValuedRelation(relationType)
    ? yup.object().nullable()
    : yup.array().nullable();

/** @returns {yup.Schema} Schema for repeatable component attributes */
const createRepeatableComponentSchema = (componentFieldSchema, attribute, options) => {
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

/** @returns {yup.Schema} Schema for non-repeatable component attributes */
const createNonRepeatableComponentSchema = (componentFieldSchema, attribute, options) => {
  return yup.lazy(obj => {
    if (obj !== undefined) {
      return attribute.required === true && !options.isDraft
        ? componentFieldSchema.defined()
        : componentFieldSchema.nullable();
    }

    return attribute.required === true ? yup.object().defined() : yup.object().nullable();
  });
};

/** @returns {boolean} True if dynamic zone value is valid for creation */
const isDynamicZoneValidForCreation = value =>
  value !== null || value !== undefined;

/** @returns {boolean} True if dynamic zone value is valid for update */
const isDynamicZoneValidForUpdate = value => {
  if (value === undefined) {
    return true;
  }
  return value !== null;
};

/** @returns {boolean} True if dynamic zone has minimum items for creation */
const hasDynamicZoneMinItemsForCreation = value =>
  value && value.length > 0;

/** @returns {boolean} True if dynamic zone has minimum items for update */
const hasDynamicZoneMinItemsForUpdate = value => {
  if (value === undefined) {
    return true;
  }
  return value !== null && value.length > 0;
};

/** @returns {yup.Schema} Schema for required dynamic zone with min constraint */
const createRequiredDynamicZoneWithMin = (schema, options) => {
  return schema
    .test('required', errorsTrads.required, value => {
      if (options.isCreatingEntry) {
        return isDynamicZoneValidForCreation(value);
      }
      return isDynamicZoneValidForUpdate(value);
    })
    .test('min', errorsTrads.min, value => {
      if (options.isCreatingEntry) {
        return hasDynamicZoneMinItemsForCreation(value);
      }
      return hasDynamicZoneMinItemsForUpdate(value);
    })
    .test('required', errorsTrads.required, value => {
      if (options.isCreatingEntry) {
        return isDynamicZoneValidForCreation(value);
      }
      return isDynamicZoneValidForUpdate(value);
    });
};

/** @returns {yup.Schema} Schema for required dynamic zone without min constraint */
const createRequiredDynamicZone = (schema, options) => {
  return schema.test('required', errorsTrads.required, value => {
    if (options.isCreatingEntry) {
      return isDynamicZoneValidForCreation(value);
    }
    return isDynamicZoneValidForUpdate(value);
  });
};

/** Processes dynamic zone attribute and returns configured schema */
const processDynamicZoneAttribute = (attribute, components, options) => {
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
    dynamicZoneSchema = min
      ? createRequiredDynamicZoneWithMin(dynamicZoneSchema, options)
      : createRequiredDynamicZone(dynamicZoneSchema, options);
  } else if (min) {
    dynamicZoneSchema = dynamicZoneSchema.notEmptyMin(min);
  }

  if (max) {
    dynamicZoneSchema = dynamicZoneSchema.max(max, errorsTrads.max);
  }

  return dynamicZoneSchema;
};

/** Processes component attribute and returns configured schema */
const processComponentAttribute = (attribute, components, options, acc, current) => {
  const componentFieldSchema = createYupSchema(
    components[attribute.component],
    { components },
    { ...options, isFromComponent: true }
  );

  if (attribute.repeatable === true) {
    acc[current] = createRepeatableComponentSchema(componentFieldSchema, attribute, options);
  } else {
    acc[current] = createNonRepeatableComponentSchema(componentFieldSchema, attribute, options);
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

      if (isSimpleAttribute(attribute)) {
        const formatted = createYupSchemaAttribute(attribute.type, attribute, options);
        acc[current] = formatted;
        return acc;
      }

      if (attribute.type === 'relation') {
        acc[current] = createRelationSchema(attribute.relationType);
        return acc;
      }

      if (attribute.type === 'component') {
        return processComponentAttribute(attribute, components, options, acc, current);
      }

      if (attribute.type === 'dynamiczone') {
        acc[current] = processDynamicZoneAttribute(attribute, components, options);
        return acc;
      }

      return acc;
    }, {})
  );
};

/** @returns {boolean} True if validation should be applied */
const shouldApplyValidation = validationValue =>
  !!validationValue ||
  (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
  validationValue === 0;

/** @returns {boolean} True if field is numeric type */
const isNumericType = type =>
  ['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type);

/** @returns {boolean} True if field is date type */
const isDateType = type =>
  ['date', 'datetime'].includes(type);

/** @returns {boolean} True if field is text-like type */
const isTextLikeType = type =>
  ['text', 'textarea', 'email', 'string'].includes(type);

/** @returns {boolean} True if field is numeric-like type for positive/negative */
const isNumericLikeType = type =>
  ['number', 'integer', 'bigint', 'float', 'decimal'].includes(type);

/** Applies required validation to schema */
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
  });
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
        if (type === 'biginteger') {
          schema = schema.isInferior(errorsTrads.max, validationValue);
        } else {
          schema = schema.max(validationValue, errorsTrads.max);
        }
        break;

      case 'maxLength':
        schema = schema.max(validationValue, errorsTrads.maxLength);
        break;

      case 'min':
        if (type === 'biginteger') {
          schema = schema.isSuperior(errorsTrads.min, validationValue);
        } else {
          schema = schema.min(validationValue, errorsTrads.min);
        }
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
        if (isNumericLikeType(type)) {
          schema = schema.positive();
        }
        break;

      case 'negative':
        if (isNumericLikeType(type)) {
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