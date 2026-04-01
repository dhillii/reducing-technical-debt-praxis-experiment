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
    return schema.min(required, errorsTrads.min);
  }

  if (required !== true && isEmpty(value)) {
    return schema.nullable();
  }

  return schema.min(required, errorsTrads.min);
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

/** @returns {boolean} True if value passes required validation for creating entry */
const isRequiredValueValidForCreation = value =>
  value !== null || value !== undefined;

/** @returns {boolean} True if value passes required validation for editing entry */
const isRequiredValueValidForEdit = value => {
  if (value === undefined) {
    return true;
  }

  return value !== null;
};

/** @returns {boolean} True if value passes min length validation for creating entry */
const isMinLengthValidForCreation = value =>
  value && value.length > 0;

/** @returns {boolean} True if value passes min length validation for editing entry */
const isMinLengthValidForEdit = value => {
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

  if (attribute.required && !options.isDraft) {
    dynamicZoneSchema = applyRequiredDynamicZoneValidation(dynamicZoneSchema, min, options);
  } else if (min) {
    dynamicZoneSchema = dynamicZoneSchema.notEmptyMin(min);
  }

  if (max) {
    dynamicZoneSchema = dynamicZoneSchema.max(max, errorsTrads.max);
  }

  return dynamicZoneSchema;
};

/** @returns {yup.Schema} Apply required validation to dynamic zone schema */
const applyRequiredDynamicZoneValidation = (schema, min, options) => {
  let result = schema.test('required', errorsTrads.required, value => {
    if (options.isCreatingEntry) {
      return isRequiredValueValidForCreation(value);
    }

    return isRequiredValueValidForEdit(value);
  });

  if (min) {
    result = result
      .test('min', errorsTrads.min, value => {
        if (options.isCreatingEntry) {
          return isMinLengthValidForCreation(value);
        }

        return isMinLengthValidForEdit(value);
      })
      .test('required', errorsTrads.required, value => {
        if (options.isCreatingEntry) {
          return isRequiredValueValidForCreation(value);
        }

        return isRequiredValueValidForEdit(value);
      });
  }

  return result;
};

/** @returns {boolean} True if validation value should be applied */
const shouldApplyValidation = validationValue =>
  !!validationValue ||
  (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
  validationValue === 0;

/** @returns {yup.Schema} Apply required validation to schema */
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

    return validateRequiredByType(value, type);
  });
};

/** @returns {boolean} True if value is valid for required constraint by type */
const validateRequiredByType = (value, type) => {
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

/** @returns {yup.Schema} Apply max validation to schema */
const applyMaxValidation = (schema, type, validationValue) => {
  if (type === 'biginteger') {
    return schema.isInferior(errorsTrads.max, validationValue);
  }

  return schema.max(validationValue, errorsTrads.max);
};

/** @returns {yup.Schema} Apply min validation to schema */
const applyMinValidation = (schema, type, validationValue) => {
  if (type === 'biginteger') {
    return schema.isSuperior(errorsTrads.min, validationValue);
  }

  return schema.min(validationValue, errorsTrads.min);
};

/** @returns {yup.Schema} Apply case transformation to schema */
const applyCaseTransformation = (schema, type, transformation) => {
  if (!['text', 'textarea', 'email', 'string'].includes(type)) {
    return schema;
  }

  return transformation === 'lowercase'
    ? schema.strict().lowercase()
    : schema.strict().uppercase();
};

/** @returns {yup.Schema} Apply sign constraint to schema */
const applySignConstraint = (schema, type, isPositive) => {
  if (!['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
    return schema;
  }

  return isPositive ? schema.positive() : schema.negative();
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

    schema = applyValidationRule(schema, validation, validationValue, type, options);
  });

  return schema;
};

/** @returns {yup.Schema} Schema for JSON type validation */
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

/** @returns {yup.Schema} Apply validation rule to schema */
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
      return options.isDraft ? schema : schema.min(validationValue, errorsTrads.minLength);
    case 'regex':
      return schema.matches(new RegExp(validationValue), errorsTrads.regex);
    case 'lowercase':
      return applyCaseTransformation(schema, type, 'lowercase');
    case 'uppercase':
      return applyCaseTransformation(schema, type, 'uppercase');
    case 'positive':
      return applySignConstraint(schema, type, true);
    case 'negative':
      return applySignConstraint(schema, type, false);
    default:
      return schema.nullable();
  }
};

export default createYupSchema;
```