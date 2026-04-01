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

/** @returns {yup.Schema} Schema with min constraint applied based on required flag */
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
const isRequiredValueValidForCreation = value => value !== null || value !== undefined;

/** @returns {boolean} True if value passes required validation for editing entry */
const isRequiredValueValidForEdit = value => {
  if (value === undefined) {
    return true;
  }

  return value !== null;
};

/** @returns {boolean} True if value passes required validation based on context */
const passesRequiredValidation = (value, isCreatingEntry) =>
  isCreatingEntry ? isRequiredValueValidForCreation(value) : isRequiredValueValidForEdit(value);

/** @returns {boolean} True if value has minimum length for dynamic zone */
const hasMinimumLength = (value, isCreatingEntry) => {
  if (isCreatingEntry) {
    return value && value.length > 0;
  }

  if (value === undefined) {
    return true;
  }

  return value !== null && value.length > 0;
};

/** @returns {yup.Schema} Schema with required test applied */
const applyRequiredTest = schema =>
  schema.test('required', errorsTrads.required, value =>
    passesRequiredValidation(value, true)
  );

/** @returns {yup.Schema} Schema with min test applied */
const applyMinTest = schema =>
  schema.test('min', errorsTrads.min, value => hasMinimumLength(value, true));

/** @returns {yup.Schema} Dynamic zone schema with required and min constraints */
const createRequiredDynamicZoneSchema = (schema, min) => {
  let result = applyRequiredTest(schema);

  if (min) {
    result = applyMinTest(result).test('required', errorsTrads.required, value =>
      passesRequiredValidation(value, true)
    );
  }

  return result;
};

/** @returns {yup.Schema} Dynamic zone schema with optional min constraint */
const createOptionalDynamicZoneSchema = (schema, min) => {
  if (min) {
    return schema.notEmptyMin(min);
  }

  return schema;
};

/** @returns {yup.Schema} Complete dynamic zone schema */
const createDynamicZoneSchema = (schema, attribute, options) => {
  let result = schema;
  const { max, min } = attribute;

  if (attribute.required && !options.isDraft) {
    result = createRequiredDynamicZoneSchema(result, min);
  } else {
    result = createOptionalDynamicZoneSchema(result, min);
  }

  if (max) {
    result = result.max(max, errorsTrads.max);
  }

  return result;
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

  return createNonRepeatableComponentSchema(componentFieldSchema, attribute, options);
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
        acc[current] = createComponentSchema(attribute, components, options);
        return acc;
      }

      if (attribute.type === 'dynamiczone') {
        const dynamicZoneSchema = yup.array().of(
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
const shouldApplyValidation = validationValue =>
  !!validationValue ||
  (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
  validationValue === 0;

/** @returns {boolean} True if field is numeric type */
const isNumericType = type =>
  ['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type);

/** @returns {boolean} True if field is date type */
const isDateType = type => ['date', 'datetime'].includes(type);

/** @returns {boolean} True if field is text-like type */
const isTextType = type => ['text', 'textarea', 'email', 'string'].includes(type);

/** @returns {boolean} True if value is valid for numeric required field */
const isValidNumericValue = value => {
  if (value === 0) {
    return true;
  }

  return !!value;
};

/** @returns {boolean} True if value is valid for date required field */
const isValidDateValue = value => moment(value)._isValid === true;

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
    if (value === undefined && !options.isFromComponent) {
      return true;
    }

    if (isNumericType(type)) {
      return isValidNumericValue(value);
    }

    if (isDateType(type)) {
      return isValidDateValue(value);
    }

    if (type === 'boolean') {
      return value !== null;
    }

    return !isEmpty(value);
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
  if (!isTextType(type)) {
    return schema;
  }

  return transformation === 'lowercase'
    ? schema.strict().lowercase()
    : schema.strict().uppercase();
};

/** @returns {yup.Schema} Schema with sign constraint applied */
const applySignConstraint = (schema, type, isPositive) => {
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