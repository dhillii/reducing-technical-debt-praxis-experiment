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
const isSimpleAttribute = (type) => {
  return type !== 'relation' && type !== 'component' && type !== 'dynamiczone';
};

/** @returns {boolean} True if relation type is single-valued */
const isSingleValuedRelation = (relationType) => {
  return ['oneWay', 'oneToOne', 'manyToOne', 'oneToOneMorph', 'oneToOneMorph'].includes(relationType);
};

/** @returns {yup.Schema} Schema for single-valued or array relations */
const createRelationSchema = (relationType) => {
  return isSingleValuedRelation(relationType)
    ? yup.object().nullable()
    : yup.array().nullable();
};

/** @returns {yup.Schema} Schema for repeatable component */
const createRepeatableComponentSchema = (componentFieldSchema, attribute, options) => {
  const { min, max, required } = attribute;
  
  return yup.lazy(value => {
    let baseSchema = yup.array().of(componentFieldSchema);

    if (min && !options.isDraft) {
      baseSchema = applyMinConstraint(baseSchema, required, value, min);
    }

    if (max) {
      baseSchema = baseSchema.max(max, errorsTrads.max);
    }

    return baseSchema;
  });
};

/** @returns {yup.Schema} Schema with min constraint applied based on required flag */
const applyMinConstraint = (schema, required, value, min) => {
  if (required) {
    return schema.min(min, errorsTrads.min);
  }
  
  if (required !== true && isEmpty(value)) {
    return schema.nullable();
  }
  
  return schema.min(min, errorsTrads.min);
};

/** @returns {yup.Schema} Schema for non-repeatable component */
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

/** @returns {boolean} True if dynamic zone value is valid for creation */
const isDynamicZoneValidForCreation = (value) => {
  return value !== null && value !== undefined;
};

/** @returns {boolean} True if dynamic zone value is valid for update */
const isDynamicZoneValidForUpdate = (value) => {
  if (value === undefined) {
    return true;
  }
  return value !== null;
};

/** @returns {boolean} True if dynamic zone has minimum length */
const hasDynamicZoneMinLength = (value, isCreatingEntry) => {
  if (isCreatingEntry) {
    return value && value.length > 0;
  }
  
  if (value === undefined) {
    return true;
  }
  
  return value !== null && value.length > 0;
};

/** @returns {yup.Schema} Schema with required test for dynamic zone */
const addDynamicZoneRequiredTest = (schema, options) => {
  return schema.test('required', errorsTrads.required, value => {
    return options.isCreatingEntry
      ? isDynamicZoneValidForCreation(value)
      : isDynamicZoneValidForUpdate(value);
  });
};

/** @returns {yup.Schema} Schema with min test for dynamic zone */
const addDynamicZoneMinTest = (schema, options) => {
  return schema.test('min', errorsTrads.min, value => {
    return hasDynamicZoneMinLength(value, options.isCreatingEntry);
  });
};

/** @returns {yup.Schema} Dynamic zone schema with required and min constraints */
const createConstrainedDynamicZoneSchema = (dynamicZoneSchema, attribute, options) => {
  let schema = addDynamicZoneRequiredTest(dynamicZoneSchema, options);
  
  if (attribute.min) {
    schema = addDynamicZoneMinTest(schema, options);
    schema = addDynamicZoneRequiredTest(schema, options);
  }
  
  return schema;
};

/** @returns {yup.Schema} Dynamic zone schema with optional min constraint */
const createOptionalDynamicZoneSchema = (dynamicZoneSchema, attribute) => {
  if (attribute.min) {
    return dynamicZoneSchema.notEmptyMin(attribute.min);
  }
  return dynamicZoneSchema;
};

/** @returns {yup.Schema} Complete dynamic zone schema */
const createDynamicZoneSchema = (dynamicZoneSchema, attribute, options) => {
  let schema = dynamicZoneSchema;
  
  if (attribute.required && !options.isDraft) {
    schema = createConstrainedDynamicZoneSchema(schema, attribute, options);
  } else {
    schema = createOptionalDynamicZoneSchema(schema, attribute);
  }
  
  if (attribute.max) {
    schema = schema.max(attribute.max, errorsTrads.max);
  }
  
  return schema;
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

      if (isSimpleAttribute(attribute.type)) {
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
        let dynamicZoneSchema = yup.array().of(
          yup.lazy(({ __component }) => {
            return createYupSchema(
              components[__component],
              { components },
              { ...options, isFromComponent: true }
            );
          })
        );

        acc[current] = createDynamicZoneSchema(dynamicZoneSchema, attribute, options);
      }

      return acc;
    }, {})
  );
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
const isTextType = (type) => {
  return ['text', 'textarea', 'email', 'string'].includes(type);
};

/** @returns {boolean} True if required validation should apply */
const shouldApplyRequired = (type, options) => {
  if (options.isDraft) {
    return false;
  }
  
  if (type === 'password' && !options.isCreatingEntry) {
    return false;
  }
  
  return true;
};

/** @returns {yup.Schema} Schema with required validation for non-password fields */
const applyNonPasswordRequired = (schema, type, options) => {
  if (options.isCreatingEntry) {
    return schema.required(errorsTrads.required);
  }
  
  return schema.test('required', errorsTrads.required, value => {
    return validateRequiredField(value, type, options);
  });
};

/** @returns {boolean} True if required field value is valid */
const validateRequiredField = (value, type, options) => {
  if (value === undefined && !options.isFromComponent) {
    return true;
  }

  if (isNumericType(type)) {
    return value === 0 || !!value;
  }

  if (isDateType(type)) {
    return moment(value)._isValid === true;
  }

  if (type === 'boolean') {
    return value !== null;
  }

  return !isEmpty(value);
};

/** @returns {yup.Schema} Schema with required validation applied */
const applyRequiredValidation = (schema, type, options) => {
  if (!shouldApplyRequired(type, options)) {
    return schema;
  }

  if (type === 'password' && options.isCreatingEntry) {
    return schema.required(errorsTrads.required);
  }

  if (type !== 'password') {
    return applyNonPasswordRequired(schema, type, options);
  }

  return schema;
};

/** @returns {yup.Schema} Schema with case transformation applied */
const applyCaseTransformation = (schema, type, transformation) => {
  if (!isTextType(type)) {
    return schema;
  }
  
  return transformation === 'lowercase'
    ? schema.strict().lowercase()
    : schema.strict().uppercase();
};

/** @returns {yup.Schema} Schema with numeric sign constraint applied */
const applyNumericSign = (schema, type, isPositive) => {
  if (!isNumericType(type)) {
    return schema;
  }
  
  return isPositive ? schema.positive() : schema.negative();
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
        schema = applyCaseTransformation(schema, type, 'lowercase');
        break;

      case 'uppercase':
        schema = applyCaseTransformation(schema, type, 'uppercase');
        break;

      case 'positive':
        schema = applyNumericSign(schema, type, true);
        break;

      case 'negative':
        schema = applyNumericSign(schema, type, false);
        break;

      default:
        schema = schema.nullable();
    }
  });

  return schema;
};

export default createYupSchema;
```