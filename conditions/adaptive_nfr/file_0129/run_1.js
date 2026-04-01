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

/** @returns {yup.Schema} Schema for component attributes */
const createComponentSchema = (attribute, components, options) => {
  const componentFieldSchema = createYupSchema(
    components[attribute.component],
    { components },
    { ...options, isFromComponent: true }
  );

  if (attribute.repeatable === true) {
    return createRepeatableComponentSchema(componentFieldSchema, attribute, options);
  }

  return createSingleComponentSchema(componentFieldSchema, attribute, options);
};

/** @returns {boolean} True if dynamic zone requires validation in non-draft mode */
const shouldValidateDynamicZone = (attribute, options) =>
  attribute.required && !options.isDraft;

/** @returns {boolean} True if value is valid for dynamic zone required test */
const isValidDynamicZoneRequired = (value, options) => {
  if (options.isCreatingEntry) {
    return value !== null || value !== undefined;
  }

  if (value === undefined) {
    return true;
  }

  return value !== null;
};

/** @returns {boolean} True if value is valid for dynamic zone min test */
const isValidDynamicZoneMin = (value, options) => {
  if (options.isCreatingEntry) {
    return value && value.length > 0;
  }

  if (value === undefined) {
    return true;
  }

  return value !== null && value.length > 0;
};

/** @returns {yup.Schema} Schema for dynamic zone attributes */
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

  const { max, min } = attribute;

  if (shouldValidateDynamicZone(attribute, options)) {
    dynamicZoneSchema = dynamicZoneSchema.test('required', errorsTrads.required, value =>
      isValidDynamicZoneRequired(value, options)
    );

    if (min) {
      dynamicZoneSchema = dynamicZoneSchema
        .test('min', errorsTrads.min, value => isValidDynamicZoneMin(value, options))
        .test('required', errorsTrads.required, value =>
          isValidDynamicZoneRequired(value, options)
        );
    }
  } else if (min) {
    dynamicZoneSchema = dynamicZoneSchema.notEmptyMin(min);
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

      if (isSimpleAttribute(attribute)) {
        const formatted = createYupSchemaAttribute(attribute.type, attribute, options);
        acc[current] = formatted;
      } else if (attribute.type === 'relation') {
        acc[current] = createRelationSchema(attribute.relationType);
      } else if (attribute.type === 'component') {
        acc[current] = createComponentSchema(attribute, components, options);
      } else if (attribute.type === 'dynamiczone') {
        acc[current] = createDynamicZoneSchema(attribute, components, options);
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

/** @returns {boolean} True if field is untouched in edit mode */
const isUntouchedEditField = (value, type, options) =>
  value === undefined && !options.isFromComponent;

/** @returns {boolean} True if numeric value is valid for required test */
const isValidNumericRequired = value => value === 0 || !!value;

/** @returns {boolean} True if date value is valid for required test */
const isValidDateRequired = value => moment(value)._isValid === true;

/** @returns {boolean} True if boolean value is valid for required test */
const isValidBooleanRequired = value => value !== null;

/** @returns {boolean} True if value passes required validation for given type */
const isValidRequired = (value, type) => {
  if (['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type)) {
    return isValidNumericRequired(value);
  }

  if (['date', 'datetime'].includes(type)) {
    return isValidDateRequired(value);
  }

  if (type === 'boolean') {
    return isValidBooleanRequired(value);
  }

  return !isEmpty(value);
};

/** @returns {yup.Schema} Schema with required validation applied */
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
    if (isUntouchedEditField(value, type, options)) {
      return true;
    }

    return isValidRequired(value, type);
  });
};

/** @returns {yup.Schema} Schema with max validation applied */
const applyMaxValidation = (schema, type, validationValue) => {
  if (type === 'biginteger') {
    return schema.isInferior(errorsTrads.max, validationValue);
  }

  return schema.max(validationValue, errorsTrads.max);
};

/** @returns {yup.Schema} Schema with min validation applied */
const applyMinValidation = (schema, type, validationValue) => {
  if (type === 'biginteger') {
    return schema.isSuperior(errorsTrads.min, validationValue);
  }

  return schema.min(validationValue, errorsTrads.min);
};

/** @returns {yup.Schema} Schema with minLength validation applied */
const applyMinLengthValidation = (schema, options, validationValue) => {
  if (!options.isDraft) {
    return schema.min(validationValue, errorsTrads.minLength);
  }

  return schema;
};

/** @returns {yup.Schema} Schema with case transformation applied */
const applyCaseTransformation = (schema, type, transformation) => {
  if (!['text', 'textarea', 'email', 'string'].includes(type)) {
    return schema;
  }

  return transformation === 'lowercase'
    ? schema.strict().lowercase()
    : schema.strict().uppercase();
};

/** @returns {yup.Schema} Schema with numeric sign validation applied */
const applySignValidation = (schema, type, isPositive) => {
  if (!['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
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
        schema = applyMinLengthValidation(schema, options, validationValue);
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
        schema = applySignValidation(schema, type, true);
        break;
      case 'negative':
        schema = applySignValidation(schema, type, false);
        break;
      default:
        schema = schema.nullable();
    }
  });

  return schema;
};

export default createYupSchema;
```