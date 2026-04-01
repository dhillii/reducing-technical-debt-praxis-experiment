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

const SINGLE_RELATION_TYPES = ['oneWay', 'oneToOne', 'manyToOne', 'oneToManyMorph', 'oneToOneMorph'];
const STRING_TYPES = ['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'];
const NUMBER_TYPES = ['number', 'integer', 'biginteger', 'float', 'decimal'];
const DATE_TYPES = ['date', 'datetime'];
const TEXT_TRANSFORM_TYPES = ['text', 'textarea', 'email', 'string'];

const isValidationActive = (validationValue) => {
  return !!validationValue ||
    (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
    validationValue === 0;
};

const createRelationSchema = (attribute) => {
  return SINGLE_RELATION_TYPES.includes(attribute.relationType)
    ? yup.object().nullable()
    : yup.array().nullable();
};

const createRepeatableComponentSchema = (componentFieldSchema, attribute, options) => {
  return yup.lazy(value => {
    let baseSchema = yup.array().of(componentFieldSchema);
    const { min, max, required } = attribute;

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

const applyRequiredDynamicZoneValidation = (schema, min, options) => {
  schema = schema.test('required', errorsTrads.required, value => {
    if (options.isCreatingEntry) {
      return value !== null || value !== undefined;
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
          return value !== null || value !== undefined;
        }

        if (value === undefined) {
          return true;
        }

        return value !== null;
      });
  }

  return schema;
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

      if (attribute.type === 'relation') {
        acc[current] = createRelationSchema(attribute);
      } else if (attribute.type === 'component') {
        const componentFieldSchema = createYupSchema(
          components[attribute.component],
          { components },
          { ...options, isFromComponent: true }
        );

        acc[current] = attribute.repeatable === true
          ? createRepeatableComponentSchema(componentFieldSchema, attribute, options)
          : createNonRepeatableComponentSchema(componentFieldSchema, attribute, options);
      } else if (attribute.type === 'dynamiczone') {
        acc[current] = createDynamicZoneSchema(attribute, components, options);
      } else {
        const formatted = createYupSchemaAttribute(attribute.type, attribute, options);
        acc[current] = formatted;
      }

      return acc;
    }, {})
  );
};

const applyRequiredValidation = (schema, type, options) => {
  if (!options.isDraft) {
    if (type === 'password' && options.isCreatingEntry) {
      return schema.required(errorsTrads.required);
    }

    if (type !== 'password') {
      if (options.isCreatingEntry) {
        return schema.required(errorsTrads.required);
      } else {
        return schema.test('required', errorsTrads.required, value => {
          if (value === undefined && !options.isFromComponent) {
            return true;
          }

          if (NUMBER_TYPES.includes(type)) {
            return value === 0 ? true : !!value;
          }

          if (DATE_TYPES.includes(type)) {
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

  return schema;
};

const createYupSchemaAttribute = (type, validations, options) => {
  let schema = yup.mixed();

  if (STRING_TYPES.includes(type)) {
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

  if (NUMBER_TYPES.includes(type)) {
    schema = yup
      .number()
      .transform(cv => (isNaN(cv) ? undefined : cv))
      .typeError();
  }

  if (DATE_TYPES.includes(type)) {
    schema = yup.date();
  }

  if (type === 'biginteger') {
    schema = yup.string().matches(/^\d*$/);
  }

  Object.keys(validations).forEach(validation => {
    const validationValue = validations[validation];

    if (!isValidationActive(validationValue)) {
      return;
    }

    switch (validation) {
      case 'required':
        schema = applyRequiredValidation(schema, type, options);
        break;
      case 'max':
        schema = type === 'biginteger'
          ? schema.isInferior(errorsTrads.max, validationValue)
          : schema.max(validationValue, errorsTrads.max);
        break;
      case 'maxLength':
        schema = schema.max(validationValue, errorsTrads.maxLength);
        break;
      case 'min':
        schema = type === 'biginteger'
          ? schema.isSuperior(errorsTrads.min, validationValue)
          : schema.min(validationValue, errorsTrads.min);
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
        if (TEXT_TRANSFORM_TYPES.includes(type)) {
          schema = schema.strict().lowercase();
        }
        break;
      case 'uppercase':
        if (TEXT_TRANSFORM_TYPES.includes(type)) {
          schema = schema.strict().uppercase();
        }
        break;
      case 'positive':
        if (NUMBER_TYPES.includes(type)) {
          schema = schema.positive();
        }
        break;
      case 'negative':
        if (NUMBER_TYPES.includes(type)) {
          schema = schema.negative();
        }
        break;
      default:
        schema = schema.nullable();
    }
  });

  return schema;
};

export default createYupSchema;
```