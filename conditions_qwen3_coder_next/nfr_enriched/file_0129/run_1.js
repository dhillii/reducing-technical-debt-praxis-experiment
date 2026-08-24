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

const createYupSchemaAttribute = (type, validations, options) => {
  let schema = yup.mixed();

  schema = getBaseSchemaByType(schema, type);

  if (type === 'email') {
    schema = schema.email(errorsTrads.email);
  }

  if (type === 'biginteger') {
    schema = schema.matches(/^\d*$/);
  }

  return applyValidationsToSchema(schema, type, validations, options);
};

const getBaseSchemaByType = (baseSchema, type) => {
  if (['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type)) {
    return yup.string();
  }

  if (type === 'json') {
    return baseSchema
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

  if (['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type)) {
    return yup
      .number()
      .transform(cv => (isNaN(cv) ? undefined : cv))
      .typeError();
  }

  if (['date', 'datetime'].includes(type)) {
    return yup.date();
  }

  return baseSchema;
};

const applyValidationsToSchema = (schema, type, validations, options) => {
  Object.keys(validations).forEach(validation => {
    const validationValue = validations[validation];

    if (
      !!validationValue ||
      (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
      validationValue === 0
    ) {
      applySingleValidation(schema, type, validation, validationValue, options);
    }
  });

  return schema;
};

const applySingleValidation = (schema, type, validation, validationValue, options) => {
  switch (validation) {
    case 'required': {
      applyRequiredValidation(schema, type, options);
      break;
    }

    case 'max': {
      applyMaxValidation(schema, type, validationValue);
      break;
    }

    case 'maxLength': {
      schema.max(validationValue, errorsTrads.maxLength);
      break;
    }

    case 'min': {
      applyMinValidation(schema, type, validationValue);
      break;
    }

    case 'minLength': {
      if (!options.isDraft) {
        schema.min(validationValue, errorsTrads.minLength);
      }
      break;
    }

    case 'regex': {
      schema.matches(new RegExp(validationValue), errorsTrads.regex);
      break;
    }

    case 'lowercase': {
      if (['text', 'textarea', 'email', 'string'].includes(type)) {
        schema.strict().lowercase();
      }
      break;
    }

    case 'uppercase': {
      if (['text', 'textarea', 'email', 'string'].includes(type)) {
        schema.strict().uppercase();
      }
      break;
    }

    case 'positive': {
      if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
        schema.positive();
      }
      break;
    }

    case 'negative': {
      if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
        schema.negative();
      }
      break;
    }

    default: {
      schema.nullable();
    }
  }
};

const applyRequiredValidation = (schema, type, options) => {
  if (!options.isDraft) {
    if (type === 'password' && options.isCreatingEntry) {
      schema.required(errorsTrads.required);
    }

    if (type !== 'password') {
      if (options.isCreatingEntry) {
        schema.required(errorsTrads.required);
      } else {
        schema.test('required', errorsTrads.required, value => {
          if (value === undefined && !options.isFromComponent) {
            return true;
          }

          if (['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type)) {
            return value !== 0 ? !!value : true;
          }

          if (['date', 'datetime'].includes(type)) {
            return moment(value)._isValid === true;
          }

          if (type === 'boolean') {
            return value !== null;
          }

          return !isEmpty(value);
        });
      }
    }
  }
};

const applyMaxValidation = (schema, type, validationValue) => {
  if (type === 'biginteger') {
    schema.isInferior(errorsTrads.max, validationValue);
  } else {
    schema.max(validationValue, errorsTrads.max);
  }
};

const applyMinValidation = (schema, type, validationValue) => {
  if (type === 'biginteger') {
    schema.isSuperior(errorsTrads.min, validationValue);
  } else {
    schema.min(validationValue, errorsTrads.min);
  }
};

const createYupSchema = (
  model,
  { components },
  options = { isCreatingEntry: true, isDraft: true, isFromComponent: false }
) => {
  const attributes = getAttributes(model);

  return Object.keys(attributes).reduce((acc, current) => {
    const attribute = attributes[current];

    if (attribute.type !== 'relation' && attribute.type !== 'component' && attribute.type !== 'dynamiczone') {
      acc[current] = createYupSchemaAttribute(attribute.type, attribute, options);
    } else if (attribute.type === 'relation') {
      acc[current] = createRelationSchema(attribute);
    } else if (attribute.type === 'component') {
      acc[current] = createComponentFieldSchema(
        attribute,
        createYupSchema(components[attribute.component], { components }, { ...options, isFromComponent: true }),
        options
      );
    } else if (attribute.type === 'dynamiczone') {
      acc[current] = createDynamicZoneSchema(attribute, components, options);
    }

    return acc;
  }, {});
};

const createRelationSchema = attribute => {
  return [
    'oneWay',
    'oneToOne',
    'manyToOne',
    'oneToManyMorph',
    'oneToOneMorph',
  ].includes(attribute.relationType)
    ? yup.object().nullable()
    : yup.array().nullable();
};

const createComponentFieldSchema = (attribute, componentFieldSchema, options) => {
  if (attribute.repeatable) {
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
  }

  return yup.lazy(obj => {
    if (obj !== undefined) {
      return attribute.required === true && !options.isDraft
        ? componentFieldSchema.defined()
        : componentFieldSchema.nullable();
    }

    return attribute.required === true ? yup.object().defined() : yup.object().nullable();
  });
};

const createDynamicZoneSchema = (attribute, components, options) => {
  let dynamicZoneSchema = yup.array().of(
    yup.lazy(({ __component }) => {
      return createYupSchema(components[__component], { components }, { ...options, isFromComponent: true });
    })
  );

  const { max, min } = attribute;

  if (attribute.required && !options.isDraft) {
    dynamicZoneSchema = applyRequiredDynamicZoneValidation(dynamicZoneSchema, options);
    if (min) {
      dynamicZoneSchema = applyMinDynamicZoneValidation(dynamicZoneSchema, min);
    }
  } else if (min) {
    dynamicZoneSchema = dynamicZoneSchema.notEmptyMin(min);
  }

  if (max) {
    dynamicZoneSchema = dynamicZoneSchema.max(max, errorsTrads.max);
  }

  return dynamicZoneSchema;
};

const applyRequiredDynamicZoneValidation = (schema, options) => {
  return schema.test('required', errorsTrads.required, value => {
    if (options.isCreatingEntry) {
      return value !== null && value !== undefined;
    }

    if (value === undefined) {
      return true;
    }

    return value !== null;
  });
};

const applyMinDynamicZoneValidation = (schema, min) => {
  return schema.test('min', errorsTrads.min, value => {
    if (options => options.isCreatingEntry) {
      return value && value.length > 0;
    }

    if (value === undefined) {
      return true;
    }

    return value !== null && value.length > 0;
  });
};

export default createYupSchema;