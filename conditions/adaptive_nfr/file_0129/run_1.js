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

/** @returns {boolean} True if relation type is singular */
const isSingularRelation = relationType =>
  ['oneWay', 'oneToOne', 'manyToOne', 'oneToManyMorph', 'oneToOneMorph'].includes(relationType);

/** @returns {yup.Schema} Schema for relation attributes */
const createRelationSchema = relationType =>
  isSingularRelation(relationType) ? yup.object().nullable() : yup.array().nullable();

/** @returns {yup.Schema} Schema for repeatable component */
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

/** @returns {yup.Schema} Apply min constraint based on required flag */
const applyMinConstraint = (schema, required, value) => {
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

/** @returns {yup.Schema} Apply required validation to dynamic zone */
const applyDynamicZoneRequired = (schema, options) => {
  return schema.test('required', errorsTrads.required, value => {
    if (options.isCreatingEntry) {
      return isDynamicZoneValidForCreation(value);
    }

    return isDynamicZoneValidForUpdate(value);
  });
};

/** @returns {yup.Schema} Apply min validation to dynamic zone */
const applyDynamicZoneMin = (schema, options) => {
  return schema.test('min', errorsTrads.min, value => {
    if (options.isCreatingEntry) {
      return hasDynamicZoneMinItemsForCreation(value);
    }

    return hasDynamicZoneMinItemsForUpdate(value);
  });
};

/** @returns {yup.Schema} Build dynamic zone schema with constraints */
const buildDynamicZoneSchema = (attribute, options, baseSchema) => {
  let schema = baseSchema;
  const { max, min } = attribute;

  if (attribute.required && !options.isDraft) {
    schema = applyDynamicZoneRequired(schema, options);

    if (min) {
      schema = applyDynamicZoneMin(schema, options);
      schema = applyDynamicZoneRequired(schema, options);
    }
  } else if (min) {
    schema = schema.notEmptyMin(min);
  }

  if (max) {
    schema = schema.max(max, errorsTrads.max);
  }

  return schema;
};

/** @returns {yup.Schema} Create schema for component attribute */
const createComponentAttributeSchema = (attribute, components, options, current, acc) => {
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
};

/** @returns {yup.Schema} Create schema for dynamic zone attribute */
const createDynamicZoneAttributeSchema = (attribute, components, options, current, acc) => {
  const baseSchema = yup.array().of(
    yup.lazy(({ __component }) => {
      return createYupSchema(
        components[__component],
        { components },
        { ...options, isFromComponent: true }
      );
    })
  );

  acc[current] = buildDynamicZoneSchema(attribute, options, baseSchema);
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
        return createComponentAttributeSchema(attribute, components, options, current, acc);
      }

      if (attribute.type === 'dynamiczone') {
        return createDynamicZoneAttributeSchema(attribute, components, options, current, acc);
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

/** @returns {boolean} True if required validation applies to password on creation */
const isPasswordRequiredOnCreation = (type, options) =>
  type === 'password' && options.isCreatingEntry;

/** @returns {boolean} True if required validation applies to non-password fields */
const isNonPasswordRequired = type => type !== 'password';

/** @returns {boolean} True if field is numeric type */
const isNumericType = type =>
  ['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type);

/** @returns {boolean} True if field is date type */
const isDateType = type => ['date', 'datetime'].includes(type);

/** @returns {boolean} Validate numeric field value */
const validateNumericValue = value => {
  if (value === 0) {
    return true;
  }

  return !!value;
};

/** @returns {boolean} Validate date field value */
const validateDateValue = value => moment(value)._isValid === true;

/** @returns {yup.Schema} Apply required validation for non-password fields on update */
const applyNonPasswordRequiredOnUpdate = (schema, type) => {
  return schema.test('required', errorsTrads.required, value => {
    if (value === undefined && !options.isFromComponent) {
      return true;
    }

    if (isNumericType(type)) {
      return validateNumericValue(value);
    }

    if (isDateType(type)) {
      return validateDateValue(value);
    }

    if (type === 'boolean') {
      return value !== null;
    }

    return !isEmpty(value);
  });
};

/** @returns {yup.Schema} Apply required validation logic */
const applyRequiredValidation = (schema, type, options) => {
  if (options.isDraft) {
    return schema;
  }

  if (isPasswordRequiredOnCreation(type, options)) {
    return schema.required(errorsTrads.required);
  }

  if (isNonPasswordRequired(type)) {
    if (options.isCreatingEntry) {
      return schema.required(errorsTrads.required);
    }

    return applyNonPasswordRequiredOnUpdate(schema, type);
  }

  return schema;
};

/** @returns {yup.Schema} Apply max validation */
const applyMaxValidation = (schema, type, validationValue) => {
  if (type === 'biginteger') {
    return schema.isInferior(errorsTrads.max, validationValue);
  }

  return schema.max(validationValue, errorsTrads.max);
};

/** @returns {yup.Schema} Apply min validation */
const applyMinValidation = (schema, type, validationValue) => {
  if (type === 'biginteger') {
    return schema.isSuperior(errorsTrads.min, validationValue);
  }

  return schema.min(validationValue, errorsTrads.min);
};

/** @returns {yup.Schema} Apply case transformation */
const applyCaseTransformation = (schema, type, validation) => {
  if (!['text', 'textarea', 'email', 'string'].includes(type)) {
    return schema;
  }

  if (validation === 'lowercase') {
    return schema.strict().lowercase();
  }

  if (validation === 'uppercase') {
    return schema.strict().uppercase();
  }

  return schema;
};

/** @returns {yup.Schema} Apply numeric sign constraint */
const applyNumericSign = (schema, type, validation) => {
  if (!['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
    return schema;
  }

  if (validation === 'positive') {
    return schema.positive();
  }

  if (validation === 'negative') {
    return schema.negative();
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
      case 'uppercase':
        schema = applyCaseTransformation(schema, type, validation);
        break;
      case 'positive':
      case 'negative':
        schema = applyNumericSign(schema, type, validation);
        break;
      default:
        schema = schema.nullable();
    }
  });

  return schema;
};

export default createYupSchema;
```