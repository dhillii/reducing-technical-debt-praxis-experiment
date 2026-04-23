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
 * Guard to check if attribute is a relation.
 * @param {object} attr
 * @returns {boolean}
 */
const isRelation = (attr) => attr.type === 'relation';

/**
 * Guard to check if attribute is a component.
 * @param {object} attr
 * @returns {boolean}
 */
const isComponent = (attr) => attr.type === 'component';

/**
 * Guard to check if attribute is a dynamic zone.
 * @param {object} attr
 * @returns {boolean}
 */
const isDynamicZone = (attr) => attr.type === 'dynamiczone';

/**
 * Build Yup schema for a given model.
 * @param {object} model
 * @param {{components: object}} param1
 * @param {object} options
 * @returns {object}
 */
const createYupSchema = (
  model,
  { components },
  options = { isCreatingEntry: true, isDraft: true, isFromComponent: false }
) => {
  const attributes = getAttributes(model);
  const shape = Object.keys(attributes).reduce((acc, key) => {
    const attribute = attributes[key];
    const schema = buildAttributeSchema(attribute, components, options);
    if (schema !== undefined) {
      acc[key] = schema;
    }
    return acc;
  }, {});
  return yup.object().shape(shape);
};

/**
 * Dispatch attribute schema creation based on attribute type.
 * @param {object} attribute
 * @param {object} components
 * @param {object} options
 * @returns {object}
 */
const buildAttributeSchema = (attribute, components, options) => {
  if (isRelation(attribute)) {
    return buildRelationSchema(attribute);
  }
  if (isComponent(attribute)) {
    return buildComponentSchema(attribute, components, options);
  }
  if (isDynamicZone(attribute)) {
    return buildDynamicZoneSchema(attribute, components, options);
  }
  return buildSimpleAttributeSchema(attribute, options);
};

/**
 * Build schema for relation attributes.
 * @param {object} attribute
 * @returns {object}
 */
const buildRelationSchema = (attribute) => {
  const relationTypes = [
    'oneWay',
    'oneToOne',
    'manyToOne',
    'oneToManyMorph',
    'oneToOneMorph',
  ];
  return relationTypes.includes(attribute.relationType)
    ? yup.object().nullable()
    : yup.array().nullable();
};

/**
 * Build schema for component attributes.
 * @param {object} attribute
 * @param {object} components
 * @param {object} options
 * @returns {object}
 */
const buildComponentSchema = (attribute, components, options) => {
  const componentFieldSchema = createYupSchema(components[attribute.component], {
    components,
  }, { ...options, isFromComponent: true });

  if (attribute.repeatable) {
    return buildRepeatableComponentSchema(attribute, componentFieldSchema, options);
  }
  return buildSingleComponentSchema(attribute, componentFieldSchema, options);
};

/**
 * Build schema for repeatable component fields.
 * @param {object} attribute
 * @param {object} componentFieldSchema
 * @param {object} options
 * @returns {object}
 */
const buildRepeatableComponentSchema = (attribute, componentFieldSchema, options) => {
  const { min, max, required } = attribute;
  return yup.lazy((value) => {
    let base = yup.array().of(componentFieldSchema);
    if (min && !options.isDraft) {
      if (required) {
        base = base.min(min, errorsTrads.min);
      } else if (!required && isEmpty(value)) {
        base = base.nullable();
      } else {
        base = base.min(min, errorsTrads.min);
      }
    }
    if (max) {
      base = base.max(max, errorsTrads.max);
    }
    return base;
  });
};

/**
 * Build schema for a single (non‑repeatable) component field.
 * @param {object} attribute
 * @param {object} componentFieldSchema
 * @param {object} options
 * @returns {object}
 */
const buildSingleComponentSchema = (attribute, componentFieldSchema, options) => {
  return yup.lazy((obj) => {
    if (obj !== undefined) {
      return attribute.required && !options.isDraft
        ? componentFieldSchema.defined()
        : componentFieldSchema.nullable();
    }
    return attribute.required
      ? yup.object().defined()
      : yup.object().nullable();
  });
};

/**
 * Build schema for dynamic zone attributes.
 * @param {object} attribute
 * @param {object} components
 * @param {object} options
 * @returns {object}
 */
const buildDynamicZoneSchema = (attribute, components, options) => {
  let schema = yup.array().of(
    yup.lazy(({ __component }) =>
      createYupSchema(components[__component], { components }, { ...options, isFromComponent: true })
    )
  );

  const { max, min, required } = attribute;

  if (required && !options.isDraft) {
    schema = applyDynamicZoneRequiredTests(schema, options);
    if (min) {
      schema = applyDynamicZoneMinTests(schema, options);
    }
  } else if (min) {
    schema = schema.notEmptyMin(min);
  }

  if (max) {
    schema = schema.max(max, errorsTrads.max);
  }

  return schema;
};

/**
 * Apply required tests for dynamic zone schema.
 * @param {object} schema
 * @param {object} options
 * @returns {object}
 */
const applyDynamicZoneRequiredTests = (schema, options) => {
  return schema.test('required', errorsTrads.required, (value) => {
    if (options.isCreatingEntry) {
      return value !== null && value !== undefined;
    }
    if (value === undefined) {
      return true;
    }
    return value !== null;
  });
};

/**
 * Apply min‑length tests for dynamic zone schema.
 * @param {object} schema
 * @param {object} options
 * @returns {object}
 */
const applyDynamicZoneMinTests = (schema, options) => {
  return schema
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
};

/**
 * Build schema for simple (non‑relation/component/dynamiczone) attributes.
 * @param {object} attribute
 * @param {object} options
 * @returns {object}
 */
const buildSimpleAttributeSchema = (attribute, options) => {
  const base = getBaseSchema(attribute.type);
  return applyValidations(base, attribute.type, attribute, options);
};

/**
 * Determine the base Yup schema for a given attribute type.
 * @param {string} type
 * @returns {object}
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
 * Apply all validation rules to a base schema.
 * @param {object} schema
 * @param {string} type
 * @param {object} validations
 * @param {object} options
 * @returns {object}
 */
const applyValidations = (schema, type, validations, options) => {
  Object.keys(validations).forEach((validation) => {
    const value = validations[validation];
    if (!shouldApplyValidation(validation, value)) {
      return;
    }
    switch (validation) {
      case 'required':
        schema = applyRequired(schema, type, options);
        break;
      case 'max':
        schema = type === 'biginteger'
          ? schema.isInferior(errorsTrads.max, value)
          : schema.max(value, errorsTrads.max);
        break;
      case 'maxLength':
        schema = schema.max(value, errorsTrads.maxLength);
        break;
      case 'min':
        schema = type === 'biginteger'
          ? schema.isSuperior(errorsTrads.min, value)
          : schema.min(value, errorsTrads.min);
        break;
      case 'minLength':
        if (!options.isDraft) {
          schema = schema.min(value, errorsTrads.minLength);
        }
        break;
      case 'regex':
        schema = schema.matches(new RegExp(value), errorsTrads.regex);
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

/**
 * Determine if a validation rule should be applied.
 * @param {string} validation
 * @param {*} value
 * @returns {boolean}
 */
const shouldApplyValidation = (validation, value) => {
  if (value) {
    return true;
  }
  if (isBoolean(value)) {
    return true;
  }
  if (Number.isInteger(Math.floor(value))) {
    return true;
  }
  return value === 0;
};

/**
 * Apply required validation based on context.
 * @param {object} schema
 * @param {string} type
 * @param {object} options
 * @returns {object}
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
  return schema;
};

export default createYupSchema;