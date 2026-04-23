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

// Determines if a relation type is single-valued
const isSingleValuedRelation = relationType => {
  return ['oneWay', 'oneToOne', 'manyToOne', 'oneToManyMorph', 'oneToOneMorph'].includes(relationType);
};

// Creates schema for relation attributes
const createRelationSchema = attribute => {
  return isSingleValuedRelation(attribute.relationType)
    ? yup.object().nullable()
    : yup.array().nullable();
};

// Applies min constraint to repeatable component schema
const applyComponentMinConstraint = (baseSchema, min, required, isDraft, value) => {
  if (min && !isDraft) {
    if (required) {
      return baseSchema.min(min, errorsTrads.min);
    } else if (required !== true && isEmpty(value)) {
      return baseSchema.nullable();
    } else {
      return baseSchema.min(min, errorsTrads.min);
    }
  }
  return baseSchema;
};

// Creates schema for repeatable component attributes
const createRepeatableComponentSchema = (componentFieldSchema, attribute, options) => {
  const { min, max, required } = attribute;
  return yup.lazy(value => {
    let baseSchema = yup.array().of(componentFieldSchema);
    baseSchema = applyComponentMinConstraint(baseSchema, min, required, options.isDraft, value);
    
    if (max) {
      baseSchema = baseSchema.max(max, errorsTrads.max);
    }

    return baseSchema;
  });
};

// Creates schema for non-repeatable component attributes
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

// Validates dynamic zone required constraint
const validateDynamicZoneRequired = (value, options) => {
  if (options.isCreatingEntry) {
    return value !== null && value !== undefined;
  }

  if (value === undefined) {
    return true;
  }

  return value !== null;
};

// Validates dynamic zone min constraint
const validateDynamicZoneMin = (value, options) => {
  if (options.isCreatingEntry) {
    return value && value.length > 0;
  }

  if (value === undefined) {
    return true;
  }

  return value !== null && value.length > 0;
};

// Applies required and min constraints to dynamic zone schema
const applyDynamicZoneRequiredConstraints = (schema, attribute, options) => {
  let updatedSchema = schema;

  updatedSchema = updatedSchema.test('required', errorsTrads.required, value =>
    validateDynamicZoneRequired(value, options)
  );

  if (attribute.min) {
    updatedSchema = updatedSchema
      .test('min', errorsTrads.min, value => validateDynamicZoneMin(value, options))
      .test('required', errorsTrads.required, value => validateDynamicZoneRequired(value, options));
  }

  return updatedSchema;
};

// Creates schema for dynamic zone attributes
const createDynamicZoneSchema = (attribute, components, options) => {
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

  if (attribute.max) {
    schema = schema.max(attribute.max, errorsTrads.max);
  }

  return schema;
};

// Processes non-relation, non-component, non-dynamiczone attributes
const processSimpleAttribute = (acc, current, attribute, options) => {
  const formatted = createYupSchemaAttribute(attribute.type, attribute, options);
  acc[current] = formatted;
  return acc;
};

// Processes relation attributes
const processRelationAttribute = (acc, current, attribute) => {
  acc[current] = createRelationSchema(attribute);
  return acc;
};

// Processes component attributes
const processComponentAttribute = (acc, current, attribute, components, options) => {
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

// Processes dynamic zone attributes
const processDynamicZoneAttribute = (acc, current, attribute, components, options) => {
  acc[current] = createDynamicZoneSchema(attribute, components, options);
  return acc;
};

// Processes a single attribute and adds it to the accumulator
const processAttribute = (acc, current, attribute, components, options) => {
  if (attribute.type === 'relation') {
    return processRelationAttribute(acc, current, attribute);
  }

  if (attribute.type === 'component') {
    return processComponentAttribute(acc, current, attribute, components, options);
  }

  if (attribute.type === 'dynamiczone') {
    return processDynamicZoneAttribute(acc, current, attribute, components, options);
  }

  return processSimpleAttribute(acc, current, attribute, options);
};

const createYupSchema = (
  model,
  { components },
  options = { isCreatingEntry: true, isDraft: true, isFromComponent: false }
) => {
  const attributes = getAttributes(model);

  return yup.object().shape(
    Object.keys(attributes).reduce((acc, current) => {
      return processAttribute(acc, current, attributes[current], components, options);
    }, {})
  );
};

// Validates required field based on type and context
const validateRequiredField = (value, type, options) => {
  if (value === undefined && !options.isFromComponent) {
    return true;
  }

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

// Applies required validation based on type and options
const applyRequiredValidation = (schema, type, options) => {
  if (!options.isDraft) {
    if (type === 'password' && options.isCreatingEntry) {
      return schema.required(errorsTrads.required);
    }

    if (type !== 'password') {
      if (options.isCreatingEntry) {
        return schema.required(errorsTrads.required);
      } else {
        return schema.test('required', errorsTrads.required, value =>
          validateRequiredField(value, type, options)
        );
      }
    }
  }

  return schema;
};

// Applies max validation based on type
const applyMaxValidation = (schema, type, validationValue) => {
  if (type === 'biginteger') {
    return schema.isInferior(errorsTrads.max, validationValue);
  }
  return schema.max(validationValue, errorsTrads.max);
};

// Applies min validation based on type
const applyMinValidation = (schema, type, validationValue, isDraft) => {
  if (type === 'biginteger') {
    return schema.isSuperior(errorsTrads.min, validationValue);
  }
  
  if (isDraft) {
    return schema;
  }
  
  return schema.min(validationValue, errorsTrads.min);
};

// Applies case transformation based on type
const applyCaseTransformation = (schema, type, transformation) => {
  if (['text', 'textarea', 'email', 'string'].includes(type)) {
    return schema.strict()[transformation]();
  }
  return schema;
};

// Applies numeric sign validation based on type
const applySignValidation = (schema, type, sign) => {
  if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
    return schema[sign]();
  }
  return schema;
};

// Processes a single validation rule
const processValidationRule = (schema, validation, validationValue, type, options) => {
  switch (validation) {
    case 'required':
      return applyRequiredValidation(schema, type, options);
    case 'max':
      return applyMaxValidation(schema, type, validationValue);
    case 'maxLength':
      return schema.max(validationValue, errorsTrads.maxLength);
    case 'min':
      return applyMinValidation(schema, type, validationValue, options.isDraft);
    case 'minLength':
      return applyMinValidation(schema, type, validationValue, options.isDraft);
    case 'regex':
      return schema.matches(new RegExp(validationValue), errorsTrads.regex);
    case 'lowercase':
      return applyCaseTransformation(schema, type, 'lowercase');
    case 'uppercase':
      return applyCaseTransformation(schema, type, 'uppercase');
    case 'positive':
      return applySignValidation(schema, type, 'positive');
    case 'negative':
      return applySignValidation(schema, type, 'negative');
    default:
      return schema.nullable();
  }
};

// Determines if a validation value should be processed
const shouldProcessValidation = validationValue => {
  return (
    !!validationValue ||
    (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
    validationValue === 0
  );
};

// Determines the base schema type
const getBaseSchemaType = type => {
  if (['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type)) {
    return yup.string();
  }

  if (['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type)) {
    return yup
      .number()
      .transform(cv => (isNaN(cv) ? undefined : cv))
      .typeError();
  }

  if (['date', 'datetime'].includes(type)) {
    return yup.date();
  }

  return yup.mixed();
};

// Creates JSON validation schema
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

const createYupSchemaAttribute = (type, validations, options) => {
  let schema = getBaseSchemaType(type);

  if (type === 'json') {
    schema = createJsonSchema();
  }

  if (type === 'email') {
    schema = schema.email(errorsTrads.email);
  }

  if (type === 'biginteger') {
    schema = yup.string().matches(/^\d*$/);
  }

  Object.keys(validations).forEach(validation => {
    const validationValue = validations[validation];

    if (shouldProcessValidation(validationValue)) {
      schema = processValidationRule(schema, validation, validationValue, type, options);
    }
  });

  return schema;
};

export default createYupSchema;