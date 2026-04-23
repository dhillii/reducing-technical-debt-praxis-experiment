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

/**
 * Determines if the attribute is a simple (non‑relation/component/dynamiczone) field.
 */
const isSimpleAttribute = (attr) =>
  attr.type !== 'relation' && attr.type !== 'component' && attr.type !== 'dynamiczone';

/**
 * Determines if the attribute is a relation field.
 */
const isRelationAttribute = (attr) => attr.type === 'relation';

/**
 * Determines if the attribute is a component field.
 */
const isComponentAttribute = (attr) => attr.type === 'component';

/**
 * Determines if the attribute is a dynamic zone field.
 */
const isDynamicZoneAttribute = (attr) => attr.type === 'dynamiczone';

/**
 * Returns the Yup schema for a relation attribute.
 */
const getRelationSchema = (attr) => {
  const relationTypes = [
    'oneWay',
    'oneToOne',
    'manyToOne',
    'oneToManyMorph',
    'oneToOneMorph',
  ];
  return relationTypes.includes(attr.relationType) ? yup.object().nullable() : yup.array().nullable();
};

/**
 * Returns the Yup schema for a component attribute.
 */
const getComponentSchema = (attr, components, options) => {
  const componentFieldSchema = createYupSchema(components[attr.component], { components }, {
    ...options,
    isFromComponent: true,
  });

  if (attr.repeatable) {
    return yup.lazy((value) => {
      let base = yup.array().of(componentFieldSchema);

      if (attr.min && !options.isDraft) {
        if (attr.required) {
          base = base.min(attr.min, errorsTrads.min);
        } else if (!attr.required && isEmpty(value)) {
          base = base.nullable();
        } else {
          base = base.min(attr.min, errorsTrads.min);
        }
      }

      if (attr.max) {
        base = base.max(attr.max, errorsTrads.max);
      }

      return base;
    });
  }

  return yup.lazy((obj) => {
    if (obj !== undefined) {
      if (attr.required && !options.isDraft) {
        return componentFieldSchema.defined();
      }
      return componentFieldSchema.nullable();
    }

    if (attr.required) {
      return yup.object().defined();
    }
    return yup.object().nullable();
  });
};

/**
 * Returns the Yup schema for a dynamic zone attribute.
 */
const getDynamicZoneSchema = (attr, components, options) => {
  let schema = yup.array().of(
    yup.lazy(({ __component }) =>
      createYupSchema(components[__component], { components }, { ...options, isFromComponent: true })
    )
  );

  if (attr.required && !options.isDraft) {
    schema = schema.test('required', errorsTrads.required, (value) => {
      if (options.isCreatingEntry) {
        return value !== null && value !== undefined;
      }
      if (value === undefined) {
        return true;
      }
      return value !== null;
    });

    if (attr.min) {
      schema = schema
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
            return value !== null && value !== undefined;
          }
          if (value === undefined) {
            return true;
          }
          return value !== null;
        });
    }
  } else if (attr.min) {
    schema = schema.notEmptyMin(attr.min);
  }

  if (attr.max) {
    schema = schema.max(attr.max, errorsTrads.max);
  }

  return schema;
};

/**
 * Creates a Yup validation schema for a Strapi model.
 */
export const createYupSchema = (
  model,
  { components },
  options = { isCreatingEntry: true, isDraft: true, isFromComponent: false }
) => {
  const attributes = getAttributes(model);

  const shape = Object.keys(attributes).reduce((acc, key) => {
    const attr = attributes[key];

    if (isSimpleAttribute(attr)) {
      acc[key] = createYupSchemaAttribute(attr.type, attr, options);
      return acc;
    }

    if (isRelationAttribute(attr)) {
      acc[key] = getRelationSchema(attr);
      return acc;
    }

    if (isComponentAttribute(attr)) {
      acc[key] = getComponentSchema(attr, components, options);
      return acc;
    }

    if (isDynamicZoneAttribute(attr)) {
      acc[key] = getDynamicZoneSchema(attr, components, options);
      return acc;
    }

    return acc;
  }, {});

  return yup.object().shape(shape);
};

/**
 * Determines whether a validation rule should be applied.
 */
const shouldApplyValidation = (validation, value, type, options) => {
  if (value) {
    return true;
  }
  if (!isBoolean(value) && Number.isInteger(Math.floor(value))) {
    return true;
  }
  return value === 0;
};

/**
 * Applies the required validation based on context.
 */
const applyRequired = (schema, type, options) => {
  if (options.isDraft) {
    return schema;
  }

  if (type === 'password' && options.isCreatingEntry) {
    return schema.required(errorsTrads.required);
  }

  if (type !== 'password') {
    if (options.isCreatingEntry) {
      return schema.required(errorsTrads.required);
    }

    return schema.test('required', errorsTrads.required, (value) => {
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

  return schema;
};

/**
 * Returns the base Yup schema for a given attribute type.
 */
const getBaseSchema = (type) => {
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

  if (type === 'email') {
    return yup.string().email(errorsTrads.email);
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

  if (type === 'biginteger') {
    return yup.string().matches(/^\d*$/);
  }

  return yup.mixed();
};

/**
 * Creates a Yup schema for a single attribute based on its type and validations.
 */
export const createYupSchemaAttribute = (type, validations, options) => {
  let schema = getBaseSchema(type);

  Object.keys(validations).forEach((validation) => {
    const validationValue = validations[validation];

    if (!shouldApplyValidation(validation, validationValue, type, options)) {
      return;
    }

    switch (validation) {
      case 'required':
        schema = applyRequired(schema, type, options);
        break;

      case 'max':
        if (type === 'biginteger') {
          schema = schema.isInferior(errorsTrads.max, validationValue);
        } else {
          schema = schema.max(validationValue, errorsTrads.max);
        }
        break;

      case 'maxLength':
        schema = schema.max(validationValue, errorsTrads.maxLength);
        break;

      case 'min':
        if (type === 'biginteger') {
          schema = schema.isSuperior(errorsTrads.min, validationValue);
        } else {
          schema = schema.min(validationValue, errorsTrads.min);
        }
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
          schema = schema.positive();
        }
        break;

      case 'negative':
        if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
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