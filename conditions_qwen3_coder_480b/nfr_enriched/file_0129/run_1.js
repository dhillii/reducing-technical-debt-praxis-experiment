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

const createRelationSchema = (attribute) => {
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

const createNonRepeatableComponentSchema = (attribute, componentFieldSchema, options) => {
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
    dynamicZoneSchema = dynamicZoneSchema.test('required', errorsTrads.required, value => {
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
    if (min) {
      dynamicZoneSchema = dynamicZoneSchema.notEmptyMin(min);
    }
  }

  if (max) {
    dynamicZoneSchema = dynamicZoneSchema.max(max, errorsTrads.max);
  }

  return dynamicZoneSchema;
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
        acc[current] = createRelationSchema(attribute);
      }

      if (attribute.type === 'component') {
        const componentFieldSchema = createYupSchema(
          components[attribute.component],
          {
            components,
          },
          { ...options, isFromComponent: true }
        );

        if (attribute.repeatable === true) {
          acc[current] = createRepeatableComponentSchema(attribute, componentFieldSchema, options);
        } else {
          acc[current] = createNonRepeatableComponentSchema(attribute, componentFieldSchema, options);
        }

        return acc;
      }

      if (attribute.type === 'dynamiczone') {
        acc[current] = createDynamicZoneSchema(attribute, components, options);
      }

      return acc;
    }, {})
  );
};

const addStringValidations = (schema, type) => {
  let resultSchema = schema;
  
  if (['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type)) {
    resultSchema = yup.string();
  }
  
  if (type === 'email') {
    resultSchema = resultSchema.email(errorsTrads.email);
  }
  
  return resultSchema;
};

const addJsonValidation = () => {
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

const addNumberValidations = (type) => {
  if (['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type)) {
    return yup
      .number()
      .transform(cv => (isNaN(cv) ? undefined : cv))
      .typeError();
  }
  return yup.mixed();
};

const addDateValidations = (schema, type) => {
  if (['date', 'datetime'].includes(type)) {
    return yup.date();
  }
  return schema;
};

const addBigIntegerValidations = (schema, type) => {
  if (type === 'biginteger') {
    return yup.string().matches(/^\d*$/);
  }
  return schema;
};

const shouldApplyValidation = (validationValue) => {
  return (
    !!validationValue ||
    (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
    validationValue === 0
  );
};

const applyRequiredValidation = (schema, type, options, validations) => {
  if (options.isDraft) {
    return schema;
  }

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

  return schema;
};

const applyMaxValidation = (schema, type, validationValue) => {
  if (type === 'biginteger') {
    return schema.isInferior(errorsTrads.max, validationValue);
  } else {
    return schema.max(validationValue, errorsTrads.max);
  }
};

const applyMinValidation = (schema, type, validationValue) => {
  if (type === 'biginteger') {
    return schema.isSuperior(errorsTrads.min, validationValue);
  } else {
    return schema.min(validationValue, errorsTrads.min);
  }
};

const applyMinLengthValidation = (schema, validationValue, options) => {
  if (!options.isDraft) {
    return schema.min(validationValue, errorsTrads.minLength);
  }
  return schema;
};

const applyRegexValidation = (schema, validationValue) => {
  return schema.matches(new RegExp(validationValue), errorsTrads.regex);
};

const applyLowercaseValidation = (schema, type) => {
  if (['text', 'textarea', 'email', 'string'].includes(type)) {
    return schema.strict().lowercase();
  }
  return schema;
};

const applyUppercaseValidation = (schema, type) => {
  if (['text', 'textarea', 'email', 'string'].includes(type)) {
    return schema.strict().uppercase();
  }
  return schema;
};

const applyPositiveValidation = (schema, type) => {
  if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
    return schema.positive();
  }
  return schema;
};

const applyNegativeValidation = (schema, type) => {
  if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
    return schema.negative();
  }
  return schema;
};

const applyValidation = (schema, validation, validationValue, type, options) => {
  switch (validation) {
    case 'required':
      return applyRequiredValidation(schema, type, options, {});
    case 'max':
      return applyMaxValidation(schema, type, validationValue);
    case 'maxLength':
      return schema.max(validationValue, errorsTrads.maxLength);
    case 'min':
      return applyMinValidation(schema, type, validationValue);
    case 'minLength':
      return applyMinLengthValidation(schema, validationValue, options);
    case 'regex':
      return applyRegexValidation(schema, validationValue);
    case 'lowercase':
      return applyLowercaseValidation(schema, type);
    case 'uppercase':
      return applyUppercaseValidation(schema, type);
    case 'positive':
      return applyPositiveValidation(schema, type);
    case 'negative':
      return applyNegativeValidation(schema, type);
    default:
      return schema.nullable();
  }
};

const createYupSchemaAttribute = (type, validations, options) => {
  let schema = addStringValidations(yup.mixed(), type);

  if (type === 'json') {
    schema = addJsonValidation();
  }

  schema = addNumberValidations(type);
  schema = addDateValidations(schema, type);
  schema = addBigIntegerValidations(schema, type);

  Object.keys(validations).forEach(validation => {
    const validationValue = validations[validation];

    if (shouldApplyValidation(validationValue)) {
      schema = applyValidation(schema, validation, validationValue, type, options);
    }
  });

  return schema;
};

export default createYupSchema;