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
  let schema = createBaseSchema(type);

  if (type === 'email') {
    schema = schema.email(errorsTrads.email);
  }

  if (type === 'biginteger') {
    schema = schema.matches(/^\d*$/);
  }

  Object.keys(validations).forEach(validation => {
    const validationValue = validations[validation];

    if (shouldApplyValidation(validationValue)) {
      applyValidation(schema, type, validation, validationValue, options);
    }
  });

  return schema;
};

const createBaseSchema = (type) => {
  let schema = yup.mixed();

  if (['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type)) {
    schema = yup.string();
  }

  if (type === 'json') {
    schema = createJsonSchema();
  }

  if (['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type)) {
    schema = createNumberSchema();
  }

  if (['date', 'datetime'].includes(type)) {
    schema = yup.date();
  }

  return schema;
};

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

const createNumberSchema = () => {
  return yup
    .number()
    .transform(cv => (isNaN(cv) ? undefined : cv))
    .typeError();
};

const shouldApplyValidation = (value) => {
  return !!value ||
    (!isBoolean(value) && Number.isInteger(Math.floor(value))) ||
    value === 0;
};

const applyValidation = (schema, type, validation, value, options) => {
  switch (validation) {
    case 'required': {
      if (!options.isDraft) {
        applyRequiredValidation(schema, type, options);
      }

      break;
    }

    case 'max': {
      applyMaxValidation(schema, type, value);
      break;
    }

    case 'maxLength':
      schema.max(value, errorsTrads.maxLength);
      break;

    case 'min': {
      applyMinValidation(schema, type, value);
      break;
    }

    case 'minLength': {
      if (!options.isDraft) {
        schema.min(value, errorsTrads.minLength);
      }
      break;
    }

    case 'regex':
      schema.matches(new RegExp(value), errorsTrads.regex);
      break;

    case 'lowercase':
      if (['text', 'textarea', 'email', 'string'].includes(type)) {
        schema = schema.strict().lowercase();
      }
      break;

    case 'uppercase':
      if (['text', 'textarea', 'email', 'string'].includes(type)) {
        schema = schema.strict().uppercase();
      }
      break;

    case 'positive':
      if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
        schema.positive();
      }
      break;

    case 'negative':
      if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
        schema.negative();
      }
      break;

    default:
      schema.nullable();
  }
};

const applyRequiredValidation = (schema, type, options) => {
  if (type === 'password' && options.isCreatingEntry) {
    schema.required(errorsTrads.required);
    return;
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
          return value === 0 || !!value;
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
};

const applyMaxValidation = (schema, type, value) => {
  if (type === 'biginteger') {
    schema.isInferior(errorsTrads.max, value);
  } else {
    schema.max(value, errorsTrads.max);
  }
};

const applyMinValidation = (schema, type, value) => {
  if (type === 'biginteger') {
    schema.isSuperior(errorsTrads.min, value);
  } else {
    schema.min(value, errorsTrads.min);
  }
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

      if (
        attribute.type !== 'relation' &&
        attribute.type !== 'component' &&
        attribute.type !== 'dynamiczone'
      ) {
        const formatted = createYupSchemaAttribute(attribute.type, attribute, options);
        acc[current] = formatted;
      }

      if (attribute.type === 'relation') {
        acc[current] = getRelationSchema(attribute.relationType);
      }

      if (attribute.type === 'component') {
        acc[current] = createComponentSchema(
          attribute,
          components,
          options,
          components[attribute.component]
        );
      }

      if (attribute.type === 'dynamiczone') {
        acc[current] = createDynamicZoneSchema(attribute, components, options);
      }

      return acc;
    }, {})
  );
};

const getRelationSchema = (relationType) => {
  return [
    'oneWay',
    'oneToOne',
    'manyToOne',
    'oneToManyMorph',
    'oneToOneMorph',
  ].includes(relationType)
    ? yup.object().nullable()
    : yup.array().nullable();
};

const createComponentSchema = (attribute, components, options, componentModel) => {
  const componentFieldSchema = createYupSchema(
    components[attribute.component],
    { components },
    { ...options, isFromComponent: true }
  );

  if (attribute.repeatable === true) {
    return createRepeatableComponentSchema(attribute, componentFieldSchema, options);
  }

  return createSingleComponentSchema(attribute, componentFieldSchema, options);
};

const createRepeatableComponentSchema = (attribute, componentFieldSchema, options) => {
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

const createSingleComponentSchema = (attribute, componentFieldSchema, options) => {
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
      return createYupSchema(
        components[__component],
        { components },
        { ...options, isFromComponent: true }
      );
    })
  );

  if (attribute.required && !options.isDraft) {
    dynamicZoneSchema = applyDynamicZoneRequiredValidation(dynamicZoneSchema, attribute, options);
  } else {
    if (attribute.min) {
      dynamicZoneSchema = dynamicZoneSchema.notEmptyMin(attribute.min);
    }
  }

  if (attribute.max) {
    dynamicZoneSchema = dynamicZoneSchema.max(attribute.max, errorsTrads.max);
  }

  return dynamicZoneSchema;
};

const applyDynamicZoneRequiredValidation = (schema, attribute, options) => {
  const { required, min } = attribute;

  schema = schema.test('required', errorsTrads.required, value => {
    if (options.isCreatingEntry) {
      return value !== null && value !== undefined;
    }

    if (value === undefined) {
      return true;
    }

    return value !== null;
  });

  if (min) {
    schema = schema
      .test('min', errorsTrads.min, value => {
        if (options.isCreatingEntry) {
          return value && value.length > 0;
        }

        if (value === undefined) {
          return true;
        }

        return value !== null && value.length > 0;
      })
      .test('required', errorsTrads.required, value => {
        if (options.isCreatingEntry) {
          return value !== null && value !== undefined;
        }

        if (value === undefined) {
          return true;
        }

        return value !== null;
      });
  }

  return schema;
};

export default createYupSchema;