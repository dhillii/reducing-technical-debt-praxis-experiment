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
        acc[current] = getRelationSchema(attribute);
      } else if (attribute.type === 'component') {
        acc[current] = getComponentSchema(attribute, components, options);
      } else if (attribute.type === 'dynamiczone') {
        acc[current] = getDynamicZoneSchema(attribute, components, options);
      } else {
        acc[current] = createYupSchemaAttribute(attribute.type, attribute, options);
      }

      return acc;
    }, {})
  );
};

const getRelationSchema = attribute => {
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

const getComponentSchema = (attribute, components, options) => {
  const componentFieldSchema = createYupSchema(
    components[attribute.component],
    {
      components,
    },
    { ...options, isFromComponent: true }
  );

  if (attribute.repeatable === true) {
    return getRepeatableComponentSchema(attribute, componentFieldSchema, options);
  }

  return getNonRepeatableComponentSchema(attribute, componentFieldSchema, options);
};

const getRepeatableComponentSchema = (attribute, componentFieldSchema, options) => {
  return yup.lazy(value => {
    let baseSchema = yup.array().of(componentFieldSchema);

    if (attribute.min && !options.isDraft) {
      if (attribute.required) {
        baseSchema = baseSchema.min(attribute.min, errorsTrads.min);
      } else if (!attribute.required && isEmpty(value)) {
        baseSchema = baseSchema.nullable();
      } else {
        baseSchema = baseSchema.min(attribute.min, errorsTrads.min);
      }
    }

    if (attribute.max) {
      baseSchema = baseSchema.max(attribute.max, errorsTrads.max);
    }

    return baseSchema;
  });
};

const getNonRepeatableComponentSchema = (attribute, componentFieldSchema, options) => {
  return yup.lazy(obj => {
    if (obj !== undefined) {
      return attribute.required === true && !options.isDraft
        ? componentFieldSchema.defined()
        : componentFieldSchema.nullable();
    }

    return attribute.required === true ? yup.object().defined() : yup.object().nullable();
  });
};

const getDynamicZoneSchema = (attribute, components, options) => {
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
    dynamicZoneSchema = dynamicZoneSchema.test('required', errorsTrads.required, value => {
      if (options.isCreatingEntry) {
        return value !== null || value !== undefined;
      }

      if (value === undefined) {
        return true;
      }

      return value !== null;
    });

    if (attribute.min) {
      dynamicZoneSchema = dynamicZoneSchema
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

const createYupSchemaAttribute = (type, validations, options) => {
  let schema = yup.mixed();

  switch (type) {
    case 'string':
    case 'uid':
    case 'text':
    case 'richtext':
    case 'email':
    case 'password':
    case 'enumeration':
      schema = yup.string();
      break;
    case 'json':
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
      break;
    case 'email':
      schema = schema.email(errorsTrads.email);
      break;
    case 'number':
    case 'integer':
    case 'biginteger':
    case 'float':
    case 'decimal':
      schema = yup
        .number()
        .transform(cv => (isNaN(cv) ? undefined : cv))
        .typeError();
      break;
    case 'date':
    case 'datetime':
      schema = yup.date();
      break;
    case 'biginteger':
      schema = yup.string().matches(/^\d*$/);
      break;
    default:
      schema = schema.nullable();
  }

  Object.keys(validations).forEach(validation => {
    const validationValue = validations[validation];

    if (
      !!validationValue ||
      (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
      validationValue === 0
    ) {
      switch (validation) {
        case 'required':
          schema = getRequiredSchema(schema, type, options, validationValue);
          break;
        case 'max':
          schema = getMaxSchema(schema, type, validationValue);
          break;
        case 'maxLength':
          schema = schema.max(validationValue, errorsTrads.maxLength);
          break;
        case 'min':
          schema = getMinSchema(schema, type, validationValue);
          break;
        case 'minLength':
          schema = getMinLengthSchema(schema, options, validationValue);
          break;
        case 'regex':
          schema = schema.matches(new RegExp(validationValue), errorsTrads.regex);
          break;
        case 'lowercase':
          schema = getCaseSchema(schema, 'lowercase', type);
          break;
        case 'uppercase':
          schema = getCaseSchema(schema, 'uppercase', type);
          break;
        case 'positive':
          schema = getSignSchema(schema, 'positive', type);
          break;
        case 'negative':
          schema = getSignSchema(schema, 'negative', type);
          break;
        default:
          schema = schema.nullable();
      }
    }
  });

  return schema;
};

const getRequiredSchema = (schema, type, options, validationValue) => {
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
        });
      }
    }
  }

  return schema;
};

const getMaxSchema = (schema, type, validationValue) => {
  if (type === 'biginteger') {
    return schema.isInferior(errorsTrads.max, validationValue);
  } else {
    return schema.max(validationValue, errorsTrads.max);
  }
};

const getMinSchema = (schema, type, validationValue) => {
  if (type === 'biginteger') {
    return schema.isSuperior(errorsTrads.min, validationValue);
  } else {
    return schema.min(validationValue, errorsTrads.min);
  }
};

const getMinLengthSchema = (schema, options, validationValue) => {
  if (!options.isDraft) {
    return schema.min(validationValue, errorsTrads.minLength);
  }

  return schema;
};

const getCaseSchema = (schema, caseType, type) => {
  if (['text', 'textarea', 'email', 'string'].includes(type)) {
    return schema.strict()[caseType]();
  }

  return schema;
};

const getSignSchema = (schema, signType, type) => {
  if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
    return schema[signType]();
  }

  return schema;
};

export default createYupSchema;