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

/** @returns {boolean} True if attribute is a simple type requiring schema generation */
const isSimpleAttribute = attribute =>
  attribute.type !== 'relation' &&
  attribute.type !== 'component' &&
  attribute.type !== 'dynamiczone';

/** @returns {boolean} True if relation type is single-valued */
const isSingleValuedRelation = relationType =>
  ['oneWay', 'oneToOne', 'manyToOne', 'oneToManyMorph', 'oneToOneMorph'].includes(relationType);

/** @returns {yup.Schema} Schema for relation attributes */
const createRelationSchema = relationType =>
  isSingleValuedRelation(relationType) ? yup.object().nullable() : yup.array().nullable();

/** @returns {yup.Schema} Schema for repeatable component attributes */
const createRepeatableComponentSchema = (componentFieldSchema, attribute, options) => {
  const { min, max, required } = attribute;

  return yup.lazy(value => {
    let baseSchema = yup.array().of(componentFieldSchema);

    if (min && !options.isDraft) {
      baseSchema = applyMinConstraint(baseSchema, required, value);
    }

    if (max) {
      baseSchema = baseSchema.max(max, errorsTrads.max);
    }

    return baseSchema;
  });
};

/** @returns {yup.Schema} Apply minimum constraint based on required flag */
const applyMinConstraint = (schema, required, value) => {
  if (required) {
    return schema.min(min, errorsTrads.min);
  }

  if (required !== true && isEmpty(value)) {
    return schema.nullable();
  }

  return schema.min(min, errorsTrads.min);
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

/** @returns {yup.Schema} Add required validation to dynamic zone schema */
const addDynamicZoneRequiredValidation = (schema, options) => {
  return schema.test('required', errorsTrads.required, value => {
    if (options.isCreatingEntry) {
      return isDynamicZoneValidForCreation(value);
    }

    return isDynamicZoneValidForUpdate(value);
  });
};

/** @returns {yup.Schema} Add minimum validation to dynamic zone schema */
const addDynamicZoneMinValidation = (schema, options) => {
  return schema.test('min', errorsTrads.min, value => {
    if (options.isCreatingEntry) {
      return hasDynamicZoneMinItemsForCreation(value);
    }

    return hasDynamicZoneMinItemsForUpdate(value);
  });
};

/** @returns {yup.Schema} Build dynamic zone schema with required and min constraints */
const buildDynamicZoneRequiredSchema = (schema, attribute, options) => {
  let result = addDynamicZoneRequiredValidation(schema, options);

  if (attribute.min) {
    result = addDynamicZoneMinValidation(result, options);
    result = addDynamicZoneRequiredValidation(result, options);
  }

  return result;
};

/** @returns {yup.Schema} Create schema for dynamic zone attribute */
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

  if (attribute.required && !options.isDraft) {
    dynamicZoneSchema = buildDynamicZoneRequiredSchema(dynamicZoneSchema, attribute, options);
  } else if (attribute.min) {
    dynamicZoneSchema = dynamicZoneSchema.notEmptyMin(attribute.min);
  }

  if (attribute.max) {
    dynamicZoneSchema = dynamicZoneSchema.max(attribute.max, errorsTrads.max);
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
        const componentFieldSchema = createYupSchema(
          components[attribute.component],
          { components },
          { ...options, isFromComponent: true }
        );

        if (attribute.repeatable === true) {
          acc[current] = createRepeatableComponentSchema(componentFieldSchema, attribute, options);
          return acc;
        }

        acc[current] = createNonRepeatableComponentSchema(componentFieldSchema, attribute, options);
        return acc;
      }

      if (attribute.type === 'dynamiczone') {
        acc[current] = createDynamicZoneSchema(attribute, components, options);
        return acc;
      }

      return acc;
    }, {})
  );
};

/** @returns {boolean} True if validation value should be applied */
const shouldApplyValidation = validationValue =>
  !!validationValue ||
  (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
  validationValue === 0;

/** @returns {boolean} True if required validation applies for password field */
const shouldRequirePassword = (type, options) =>
  type === 'password' && options.isCreatingEntry;

/** @returns {boolean} True if required validation applies for non-password field */
const shouldRequireNonPassword = (type, options) =>
  type !== 'password';

/** @returns {boolean} True if field is untouched during edit */
const isUntouchedField = (value, options) =>
  value === undefined && !options.isFromComponent;

/** @returns {boolean} True if numeric value is valid */
const isValidNumericValue = (value, type) => {
  if (value === 0) {
    return true;
  }

  return !!value;
};

/** @returns {boolean} True if date value is valid */
const isValidDateValue = value =>
  moment(value)._isValid === true;

/** @returns {yup.Schema} Apply required validation for non-password field during edit */
const applyEditModeRequiredValidation = (schema, type) => {
  return schema.test('required', errorsTrads.required, value => {
    if (isUntouchedField(value, { isFromComponent: false })) {
      return true;
    }

    if (['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type)) {
      return isValidNumericValue(value, type);
    }

    if (['date', 'datetime'].includes(type)) {
      return isValidDateValue(value);
    }

    if (type === 'boolean') {
      return value !== null;
    }

    return !isEmpty(value);
  });
};

/** @returns {yup.Schema} Apply required validation based on mode and type */
const applyRequiredValidation = (schema, type, options) => {
  if (!options.isDraft) {
    if (shouldRequirePassword(type, options)) {
      return schema.required(errorsTrads.required);
    }

    if (shouldRequireNonPassword(type, options)) {
      if (options.isCreatingEntry) {
        return schema.required(errorsTrads.required);
      }

      return applyEditModeRequiredValidation(schema, type);
    }
  }

  return schema;
};

/** @returns {yup.Schema} Apply max validation based on type */
const applyMaxValidation = (schema, type, validationValue) => {
  if (type === 'biginteger') {
    return schema.isInferior(errorsTrads.max, validationValue);
  }

  return schema.max(validationValue, errorsTrads.max);
};

/** @returns {yup.Schema} Apply min validation based on type */
const applyMinValidation = (schema, type, validationValue) => {
  if (type === 'biginteger') {
    return schema.isSuperior(errorsTrads.min, validationValue);
  }

  return schema.min(validationValue, errorsTrads.min);
};

/** @returns {yup.Schema} Apply case transformation based on type */
const applyCaseTransformation = (schema, type, transformation) => {
  if (['text', 'textarea', 'email', 'string'].includes(type)) {
    return transformation === 'lowercase'
      ? schema.strict().lowercase()
      : schema.strict().uppercase();
  }

  return schema;
};

/** @returns {yup.Schema} Apply sign constraint based on type */
const applySignConstraint = (schema, type, isPositive) => {
  if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
    return isPositive ? schema.positive() : schema.negative();
  }

  return schema;
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

    if (!shouldApplyValidation(validationValue)) {
      return;
    }

    switch (validation) {
      case 'required':
        schema = applyRequiredValidation(schema, type, options);
        break;
      case 'max':
        schema = applyMaxValidation(schema, type, validationValue);
        break;
      case 'maxLength':
        schema = schema.max(validationValue, errorsTrads.maxLength);
        break;
      case 'min':
        schema = applyMinValidation(schema, type, validationValue);
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
        schema = applyCaseTransformation(schema, type, 'lowercase');
        break;
      case 'uppercase':
        schema = applyCaseTransformation(schema, type, 'uppercase');
        break;
      case 'positive':
        schema = applySignConstraint(schema, type, true);
        break;
      case 'negative':
        schema = applySignConstraint(schema, type, false);
        break;
      default:
        schema = schema.nullable();
    }
  });

  return schema;
};

export default createYupSchema;
```