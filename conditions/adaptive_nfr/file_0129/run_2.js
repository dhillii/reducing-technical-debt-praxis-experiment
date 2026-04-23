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

/** Check if attribute is a simple type (not relation, component, or dynamiczone) */
const isSimpleType = attribute => 
  attribute.type !== 'relation' &&
  attribute.type !== 'component' &&
  attribute.type !== 'dynamiczone';

/** Check if relation type is single-valued */
const isSingleValuedRelation = relationType =>
  ['oneWay', 'oneToOne', 'manyToOne', 'oneToManyMorph', 'oneToOneMorph'].includes(relationType);

/** Build schema for simple type attributes */
const buildSimpleTypeSchema = (attribute, options) => {
  return createYupSchemaAttribute(attribute.type, attribute, options);
};

/** Build schema for relation attributes */
const buildRelationSchema = attribute => {
  return isSingleValuedRelation(attribute.relationType)
    ? yup.object().nullable()
    : yup.array().nullable();
};

/** Build schema for repeatable component */
const buildRepeatableComponentSchema = (attribute, componentFieldSchema, options) => {
  return yup.lazy(value => {
    let baseSchema = yup.array().of(componentFieldSchema);

    if (!attribute.min || options.isDraft) {
      return applyMaxConstraint(baseSchema, attribute.max);
    }

    baseSchema = applyMinConstraintForRepeatable(baseSchema, attribute, value, options);
    return applyMaxConstraint(baseSchema, attribute.max);
  });
};

/** Apply min constraint for repeatable component */
const applyMinConstraintForRepeatable = (baseSchema, attribute, value, options) => {
  if (!attribute.required) {
    if (isEmpty(value)) {
      return baseSchema.nullable();
    }
  }
  return baseSchema.min(attribute.min, errorsTrads.min);
};

/** Apply max constraint to schema */
const applyMaxConstraint = (schema, max) => {
  if (!max) {
    return schema;
  }
  return schema.max(max, errorsTrads.max);
};

/** Build schema for non-repeatable component */
const buildNonRepeatableComponentSchema = (attribute, componentFieldSchema, options) => {
  return yup.lazy(obj => {
    if (obj !== undefined) {
      return attribute.required === true && !options.isDraft
        ? componentFieldSchema.defined()
        : componentFieldSchema.nullable();
    }

    return attribute.required === true ? yup.object().defined() : yup.object().nullable();
  });
};

/** Build schema for dynamiczone */
const buildDynamicZoneSchema = (attribute, components, options) => {
  let schema = yup.array().of(
    yup.lazy(({ __component }) => {
      return createYupSchema(
        components[__component],
        { components },
        { ...options, isFromComponent: true }
      );
    })
  );

  if (attribute.required && !options.isDraft) {
    schema = applyDynamicZoneRequiredConstraints(schema, attribute, options);
  } else if (attribute.min) {
    schema = schema.notEmptyMin(attribute.min);
  }

  return applyMaxConstraint(schema, attribute.max);
};

/** Apply required constraints for dynamiczone */
const applyDynamicZoneRequiredConstraints = (schema, attribute, options) => {
  schema = schema.test('required', errorsTrads.required, value => {
    return validateDynamicZoneRequired(value, options);
  });

  if (!attribute.min) {
    return schema;
  }

  return schema
    .test('min', errorsTrads.min, value => {
      return validateDynamicZoneMin(value, options);
    })
    .test('required', errorsTrads.required, value => {
      return validateDynamicZoneRequired(value, options);
    });
};

/** Validate dynamiczone required constraint */
const validateDynamicZoneRequired = (value, options) => {
  if (options.isCreatingEntry) {
    return value !== null && value !== undefined;
  }

  if (value === undefined) {
    return true;
  }

  return value !== null;
};

/** Validate dynamiczone min constraint */
const validateDynamicZoneMin = (value, options) => {
  if (options.isCreatingEntry) {
    return value && value.length > 0;
  }

  if (value === undefined) {
    return true;
  }

  return value !== null && value.length > 0;
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

      if (isSimpleType(attribute)) {
        acc[current] = buildSimpleTypeSchema(attribute, options);
        return acc;
      }

      if (attribute.type === 'relation') {
        acc[current] = buildRelationSchema(attribute);
        return acc;
      }

      if (attribute.type === 'component') {
        const componentFieldSchema = createYupSchema(
          components[attribute.component],
          { components },
          { ...options, isFromComponent: true }
        );

        if (attribute.repeatable === true) {
          acc[current] = buildRepeatableComponentSchema(attribute, componentFieldSchema, options);
          return acc;
        }

        acc[current] = buildNonRepeatableComponentSchema(attribute, componentFieldSchema, options);
        return acc;
      }

      if (attribute.type === 'dynamiczone') {
        acc[current] = buildDynamicZoneSchema(attribute, components, options);
        return acc;
      }

      return acc;
    }, {})
  );
};

/** Check if validation should be applied */
const shouldApplyValidation = validationValue => {
  if (!!validationValue) {
    return true;
  }
  if (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) {
    return true;
  }
  return validationValue === 0;
};

/** Check if type is numeric */
const isNumericType = type =>
  ['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type);

/** Check if type is date-like */
const isDateType = type =>
  ['date', 'datetime'].includes(type);

/** Check if type is string-like */
const isStringType = type =>
  ['text', 'textarea', 'email', 'string'].includes(type);

/** Validate required field */
const validateRequiredField = (value, type, options) => {
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
};

/** Apply required validation */
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
    return validateRequiredField(value, type, options);
  });
};

/** Check if type is JSON */
const isJsonType = type => type === 'json';

/** Validate JSON value */
const validateJsonValue = value => {
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
};

/** Build JSON schema */
const buildJsonSchema = () => {
  return yup
    .mixed(errorsTrads.json)
    .test('isJSON', errorsTrads.json, validateJsonValue)
    .nullable();
};

/** Check if type is string-based */
const isStringBasedType = type =>
  ['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type);

/** Check if type is number-based */
const isNumberBasedType = type =>
  ['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type);

/** Initialize schema based on type */
const initializeSchema = type => {
  if (isStringBasedType(type)) {
    return yup.string();
  }

  if (isJsonType(type)) {
    return buildJsonSchema();
  }

  if (isNumberBasedType(type)) {
    return yup
      .number()
      .transform(cv => (isNaN(cv) ? undefined : cv))
      .typeError();
  }

  if (isDateType(type)) {
    return yup.date();
  }

  if (type === 'biginteger') {
    return yup.string().matches(/^\d*$/);
  }

  return yup.mixed();
};

/** Apply max validation */
const applyMaxValidation = (schema, type, validationValue) => {
  if (type === 'biginteger') {
    return schema.isInferior(errorsTrads.max, validationValue);
  }
  return schema.max(validationValue, errorsTrads.max);
};

/** Apply min validation */
const applyMinValidation = (schema, type, validationValue) => {
  if (type === 'biginteger') {
    return schema.isSuperior(errorsTrads.min, validationValue);
  }
  return schema.min(validationValue, errorsTrads.min);
};

/** Apply minLength validation */
const applyMinLengthValidation = (schema, validationValue, options) => {
  if (options.isDraft) {
    return schema;
  }
  return schema.min(validationValue, errorsTrads.minLength);
};

/** Apply case transformation */
const applyCaseTransformation = (schema, type, transformation) => {
  if (!isStringType(type)) {
    return schema;
  }
  return transformation === 'lowercase'
    ? schema.strict().lowercase()
    : schema.strict().uppercase();
};

/** Apply sign constraint */
const applySignConstraint = (schema, type, isPositive) => {
  if (!isNumericType(type)) {
    return schema;
  }
  return isPositive ? schema.positive() : schema.negative();
};

const createYupSchemaAttribute = (type, validations, options) => {
  let schema = initializeSchema(type);

  if (type === 'email') {
    schema = schema.email(errorsTrads.email);
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
        schema = applyMinLengthValidation(schema, validationValue, options);
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