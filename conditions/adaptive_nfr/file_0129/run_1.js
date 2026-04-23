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
const isSimpleAttribute = attribute => {
  return attribute.type !== 'relation' &&
    attribute.type !== 'component' &&
    attribute.type !== 'dynamiczone';
};

/** @returns {boolean} True if relation type is singular */
const isSingularRelation = relationType => {
  return [
    'oneWay',
    'oneToOne',
    'manyToOne',
    'oneToManyMorph',
    'oneToOneMorph',
  ].includes(relationType);
};

/** @returns {yup.Schema} Relation schema based on type */
const createRelationSchema = relationType => {
  return isSingularRelation(relationType)
    ? yup.object().nullable()
    : yup.array().nullable();
};

/** @returns {yup.Schema} Schema for repeatable component */
const createRepeatableComponentSchema = (componentFieldSchema, attribute, options) => {
  return yup.lazy(value => {
    let baseSchema = yup.array().of(componentFieldSchema);
    baseSchema = applyComponentMinConstraint(baseSchema, attribute, value, options);
    baseSchema = applyComponentMaxConstraint(baseSchema, attribute);
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

/** @returns {yup.Schema} Applies min constraint to component schema */
const applyComponentMinConstraint = (baseSchema, attribute, value, options) => {
  if (!attribute.min || options.isDraft) {
    return baseSchema;
  }

  if (attribute.required) {
    return baseSchema.min(attribute.min, errorsTrads.min);
  }

  if (attribute.required !== true && isEmpty(value)) {
    return baseSchema.nullable();
  }

  return baseSchema.min(attribute.min, errorsTrads.min);
};

/** @returns {yup.Schema} Applies max constraint to component schema */
const applyComponentMaxConstraint = (baseSchema, attribute) => {
  if (!attribute.max) {
    return baseSchema;
  }

  return baseSchema.max(attribute.max, errorsTrads.max);
};

/** @returns {yup.Schema} Schema for dynamic zone */
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

  dynamicZoneSchema = applyDynamicZoneRequiredConstraint(dynamicZoneSchema, attribute, options);
  dynamicZoneSchema = applyDynamicZoneMaxConstraint(dynamicZoneSchema, attribute);

  return dynamicZoneSchema;
};

/** @returns {yup.Schema} Applies required and min constraints to dynamic zone */
const applyDynamicZoneRequiredConstraint = (schema, attribute, options) => {
  if (!attribute.required || options.isDraft) {
    return applyDynamicZoneMinConstraint(schema, attribute, options);
  }

  let updatedSchema = schema.test('required', errorsTrads.required, value => {
    return validateDynamicZoneRequired(value, options);
  });

  if (attribute.min) {
    updatedSchema = updatedSchema
      .test('min', errorsTrads.min, value => {
        return validateDynamicZoneMin(value, options);
      })
      .test('required', errorsTrads.required, value => {
        return validateDynamicZoneRequired(value, options);
      });
  }

  return updatedSchema;
};

/** @returns {yup.Schema} Applies min constraint to dynamic zone when not required */
const applyDynamicZoneMinConstraint = (schema, attribute, options) => {
  if (!attribute.min) {
    return schema;
  }

  return schema.notEmptyMin(attribute.min);
};

/** @returns {yup.Schema} Applies max constraint to dynamic zone */
const applyDynamicZoneMaxConstraint = (schema, attribute) => {
  if (!attribute.max) {
    return schema;
  }

  return schema.max(attribute.max, errorsTrads.max);
};

/** @returns {boolean} Validates dynamic zone required constraint */
const validateDynamicZoneRequired = (value, options) => {
  if (options.isCreatingEntry) {
    return value !== null || value !== undefined;
  }

  if (value === undefined) {
    return true;
  }

  return value !== null;
};

/** @returns {boolean} Validates dynamic zone min constraint */
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

        acc[current] = createSingleComponentSchema(componentFieldSchema, attribute, options);
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
const shouldApplyValidation = validationValue => {
  if (!!validationValue) {
    return true;
  }

  if (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) {
    return true;
  }

  return validationValue === 0;
};

/** @returns {yup.Schema} Applies required validation based on type and options */
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

/** @returns {boolean} Validates required field based on type */
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

/** @returns {boolean} True if type is numeric */
const isNumericType = type => {
  return ['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type);
};

/** @returns {boolean} True if type is date-based */
const isDateType = type => {
  return ['date', 'datetime'].includes(type);
};

/** @returns {boolean} True if type is string-based */
const isStringType = type => {
  return ['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type);
};

/** @returns {boolean} True if type is case-transformable */
const isCaseTransformableType = type => {
  return ['text', 'textarea', 'email', 'string'].includes(type);
};

/** @returns {yup.Schema} Creates base schema for type */
const createBaseSchema = type => {
  if (isStringType(type)) {
    return yup.string();
  }

  if (type === 'json') {
    return createJsonSchema();
  }

  if (isNumericType(type)) {
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

/** @returns {yup.Schema} Creates JSON validation schema */
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

/** @returns {yup.Schema} Applies email validation */
const applyEmailValidation = (schema, type) => {
  if (type === 'email') {
    return schema.email(errorsTrads.email);
  }

  return schema;
};

/** @returns {yup.Schema} Applies max validation */
const applyMaxValidation = (schema, type, validationValue) => {
  if (type === 'biginteger') {
    return schema.isInferior(errorsTrads.max, validationValue);
  }

  return schema.max(validationValue, errorsTrads.max);
};

/** @returns {yup.Schema} Applies min validation */
const applyMinValidation = (schema, type, validationValue) => {
  if (type === 'biginteger') {
    return schema.isSuperior(errorsTrads.min, validationValue);
  }

  return schema.min(validationValue, errorsTrads.min);
};

/** @returns {yup.Schema} Applies minLength validation */
const applyMinLengthValidation = (schema, options, validationValue) => {
  if (!options.isDraft) {
    return schema.min(validationValue, errorsTrads.minLength);
  }

  return schema;
};

/** @returns {yup.Schema} Applies case transformation */
const applyCaseTransformation = (schema, type, transformation) => {
  if (!isCaseTransformableType(type)) {
    return schema;
  }

  if (transformation === 'lowercase') {
    return schema.strict().lowercase();
  }

  if (transformation === 'uppercase') {
    return schema.strict().uppercase();
  }

  return schema;
};

/** @returns {yup.Schema} Applies sign validation */
const applySignValidation = (schema, type, sign) => {
  if (!isNumericType(type)) {
    return schema;
  }

  if (sign === 'positive') {
    return schema.positive();
  }

  if (sign === 'negative') {
    return schema.negative();
  }

  return schema;
};

const createYupSchemaAttribute = (type, validations, options) => {
  let schema = createBaseSchema(type);
  schema = applyEmailValidation(schema, type);

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
        schema = applySignValidation(schema, type, 'positive');
        break;
      case 'negative':
        schema = applySignValidation(schema, type, 'negative');
        break;
      default:
        schema = schema.nullable();
    }
  });

  return schema;
};

export default createYupSchema;