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

yup.addMethod(yup.mixed, 'defined', function () {
  return this.test('defined', errorsTrads.required, (value) => value !== undefined);
});

yup.addMethod(yup.array, 'notEmptyMin', function (min) {
  return this.test('notEmptyMin', errorsTrads.min, (value) => {
    if (isEmpty(value)) {
      return true;
    }
    return value.length >= min;
  });
});

yup.addMethod(yup.string, 'isInferior', function (message, max) {
  return this.test('isInferior', message, function (value) {
    if (!value) {
      return true;
    }
    if (Number.isNaN(toNumber(value))) {
      return true;
    }
    return toNumber(max) >= toNumber(value);
  });
});

yup.addMethod(yup.string, 'isSuperior', function (message, min) {
  return this.test('isSuperior', message, function (value) {
    if (!value) {
      return true;
    }
    if (Number.isNaN(toNumber(value))) {
      return true;
    }
    return toNumber(value) >= toNumber(min);
  });
});

const getAttributes = (data) => get(data, ['attributes'], {});

const createYupSchema = (
  model,
  { components },
  options = { isCreatingEntry: true, isDraft: true, isFromComponent: false }
) => {
  const attributes = getAttributes(model);

  return yup.object().shape(
    Object.keys(attributes).reduce((acc, current) => {
      const attribute = attributes[current];
      acc[current] = getAttributeSchema(attribute, components, options);
      return acc;
    }, {})
  );
};

const getAttributeSchema = (attribute, components, options) => {
  const { type } = attribute;
  if (type === 'relation') {
    return relationSchema(attribute);
  }
  if (type === 'component') {
    return componentSchema(attribute, components, options);
  }
  if (type === 'dynamiczone') {
    return dynamicZoneSchema(attribute, components, options);
  }
  return createYupSchemaAttribute(type, attribute, options);
};

const relationSchema = (attribute) => {
  const oneWayTypes = [
    'oneWay',
    'oneToOne',
    'manyToOne',
    'oneToManyMorph',
    'oneToOneMorph',
  ];
  return oneWayTypes.includes(attribute.relationType)
    ? yup.object().nullable()
    : yup.array().nullable();
};

const componentSchema = (attribute, components, options) => {
  const componentFieldSchema = createYupSchema(
    components[attribute.component],
    { components },
    { ...options, isFromComponent: true }
  );

  if (attribute.repeatable === true) {
    return repeatableComponentSchema(attribute, componentFieldSchema, options);
  }
  return singleComponentSchema(attribute, componentFieldSchema, options);
};

const repeatableComponentSchema = (attribute, componentFieldSchema, options) => {
  const { min, max, required } = attribute;
  return yup.lazy((value) => {
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

const singleComponentSchema = (attribute, componentFieldSchema, options) => {
  return yup.lazy((obj) => {
    if (obj !== undefined) {
      return attribute.required === true && !options.isDraft
        ? componentFieldSchema.defined()
        : componentFieldSchema.nullable();
    }
    return attribute.required === true
      ? yup.object().defined()
      : yup.object().nullable();
  });
};

const dynamicZoneSchema = (attribute, components, options) => {
  let dynamicZoneSchema = yup
    .array()
    .of(
      yup.lazy(({ __component }) => {
        return createYupSchema(components[__component], { components }, { ...options, isFromComponent: true });
      })
    );

  const { max, min } = attribute;

  if (attribute.required && !options.isDraft) {
    dynamicZoneSchema = dynamicZoneSchema.test('required', errorsTrads.required, (value) => {
      if (options.isCreatingEntry) {
        return value !== null || value !== undefined;
      }
      if (value === undefined) {
        return true;
      }
      return value !== null;
    });

    if (min) {
      dynamicZoneSchema = dynamicZoneSchema
        .test('min', errorsTrads.min, (value) => {
          if (options.isCreatingEntry) {
            return value && value.length > 0;
          }
          if (value === undefined) {
            return true;
          }
          return value !== null && value.length > 0;
        })
        .test('required', errorsTrads.required, (value) => {
          if (options.isCreatingEntry) {
            return value !== null || value !== undefined;
          }
          if (value === undefined) {
            return true;
          }
          return value !== null;
        });
    }
  } else if (min) {
    dynamicZoneSchema = dynamicZoneSchema.notEmptyMin(min);
  }

  if (max) {
    dynamicZoneSchema = dynamicZoneSchema.max(max, errorsTrads.max);
  }

  return dynamicZoneSchema;
};

const createYupSchemaAttribute = (type, validations, options) => {
  let schema = baseSchemaForType(type);

  if (type === 'email') {
    schema = schema.email(errorsTrads.email);
  }

  if (type === 'biginteger') {
    schema = schema.matches(/^\d*$/);
  }

  schema = applyValidations(schema, validations, type, options);

  return schema;
};

const baseSchemaForType = (type) => {
  if (['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type)) {
    return yup.string();
  }
  if (type === 'json') {
    return yup
      .mixed(errorsTrads.json)
      .test('isJSON', errorsTrads.json, (value) => {
        if (value === undefined) {
          return true;
        }
        if (isNumber(value) || isNull(value) || isObject(value) || isArray(value)) {
          return true;
        }
        try {
          JSON.parse(value);
          return true;
        } catch {
          return false;
        }
      })
      .nullable();
  }
  if (['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type)) {
    return yup
      .number()
      .transform((cv) => (isNaN(cv) ? undefined : cv))
      .typeError();
  }
  if (['date', 'datetime'].includes(type)) {
    return yup.date();
  }
  return yup.mixed();
};

const applyValidations = (schema, validations, type, options) => {
  Object.keys(validations).forEach((validation) => {
    const validationValue = validations[validation];
    if (
      !!validationValue ||
      (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
      validationValue === 0
    ) {
      schema = applySingleValidation(schema, validation, validationValue, type, options);
    }
  });
  return schema;
};

const applySingleValidation = (schema, validation, value, type, options) => {
  switch (validation) {
    case 'required':
      return applyRequired(schema, value, type, options);
    case 'max':
      return applyMax(schema, value, type);
    case 'maxLength':
      return schema.max(value, errorsTrads.maxLength);
    case 'min':
      return applyMin(schema, value, type);
    case 'minLength':
      return !options.isDraft ? schema.min(value, errorsTrads.minLength) : schema;
    case 'regex':
      return schema.matches(new RegExp(value), errorsTrads.regex);
    case 'lowercase':
      return ['text', 'textarea', 'email', 'string'].includes(type)
        ? schema.strict().lowercase()
        : schema;
    case 'uppercase':
      return ['text', 'textarea', 'email', 'string'].includes(type)
        ? schema.strict().uppercase()
        : schema;
    case 'positive':
      return ['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)
        ? schema.positive()
        : schema;
    case 'negative':
      return ['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)
        ? schema.negative()
        : schema;
    default:
      return schema.nullable();
  }
};

const applyRequired = (schema, value, type, options) => {
  if (!options.isDraft) {
    if (type === 'password' && options.isCreatingEntry) {
      return schema.required(errorsTrads.required);
    }
    if (type !== 'password') {
      if (options.isCreatingEntry) {
        return schema.required(errorsTrads.required);
      }
      return schema.test('required', errorsTrads.required, (val) => {
        if (val === undefined && !options.isFromComponent) {
          return true;
        }
        if (['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type)) {
          if (val === 0) {
            return true;
          }
          return !!val;
        }
        if (['date', 'datetime'].includes(type)) {
          return moment(val)._isValid === true;
        }
        if (type === 'boolean') {
          return val !== null;
        }
        return !isEmpty(val);
      });
    }
  }
  return schema;
};

const applyMax = (schema, value, type) => {
  if (type === 'biginteger') {
    return schema.isInferior(errorsTrads.max, value);
  }
  return schema.max(value, errorsTrads.max);
};

const applyMin = (schema, value, type) => {
  if (type === 'biginteger') {
    return schema.isSuperior(errorsTrads.min, value);
  }
  return schema.min(value, errorsTrads.min);
};

export default createYupSchema;