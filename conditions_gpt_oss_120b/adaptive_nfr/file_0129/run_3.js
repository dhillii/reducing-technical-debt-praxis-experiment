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
 * Build Yup schema for a Strapi model.
 */
export const createYupSchema = (
  model,
  { components },
  options = { isCreatingEntry: true, isDraft: true, isFromComponent: false }
) => {
  const attributes = getAttributes(model);

  const shape = Object.keys(attributes).reduce((acc, key) => {
    const attribute = attributes[key];

    if (isRelationAttribute(attribute)) {
      acc[key] = getRelationSchema(attribute);
      return acc;
    }

    if (isComponentAttribute(attribute)) {
      acc[key] = getComponentFieldSchema(attribute, components, options);
      return acc;
    }

    if (isDynamicZoneAttribute(attribute)) {
      acc[key] = getDynamicZoneSchema(attribute, components, options);
      return acc;
    }

    // default (primitive) attribute handling
    acc[key] = createYupSchemaAttribute(attribute.type, attribute, options);
    return acc;
  }, {});

  return yup.object().shape(shape);
};

/* ---------- Helper predicates ---------- */

/** @returns {boolean} */
const isRelationAttribute = (attr) => attr.type === 'relation';
/** @returns {boolean} */
const isComponentAttribute = (attr) => attr.type === 'component';
/** @returns {boolean} */
const isDynamicZoneAttribute = (attr) => attr.type === 'dynamiczone';
/** @returns {boolean} */
const isRepeatableComponent = (attr) => attr.repeatable === true;
/** @returns {boolean} */
const hasMin = (attr) => !!attr.min;
/** @returns {boolean} */
const hasMax = (attr) => !!attr.max;
/** @returns {boolean} */
const isRequired = (attr) => attr.required === true;

/* ---------- Relation handling ---------- */

/**
 * Returns Yup schema for a relation attribute.
 */
const getRelationSchema = (attribute) => {
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

/* ---------- Component handling ---------- */

/**
 * Returns Yup schema for a component attribute (repeatable or not).
 */
const getComponentFieldSchema = (attribute, components, options) => {
  const componentSchema = createYupSchema(
    components[attribute.component],
    { components },
    { ...options, isFromComponent: true }
  );

  if (isRepeatableComponent(attribute)) {
    return getRepeatableComponentSchema(attribute, componentSchema, options);
  }

  return getSingleComponentSchema(attribute, componentSchema, options);
};

/**
 * Schema for repeatable component fields.
 */
const getRepeatableComponentSchema = (attribute, componentSchema, options) => {
  const { min, max, required } = attribute;

  return yup.lazy((value) => {
    let base = yup.array().of(componentSchema);

    if (hasMin(attribute) && !options.isDraft) {
      base = buildMinSchemaForRepeatable(base, min, required, value);
    }

    if (hasMax(attribute)) {
      base = base.max(max, errorsTrads.max);
    }

    return base;
  });
};

/**
 * Handles min logic for repeatable components.
 */
const buildMinSchemaForRepeatable = (schema, min, required, value) => {
  if (required) {
    return schema.min(min, errorsTrads.min);
  }
  if (!required && isEmpty(value)) {
    return schema.nullable();
  }
  return schema.min(min, errorsTrads.min);
};

/**
 * Schema for a single (non‑repeatable) component field.
 */
const getSingleComponentSchema = (attribute, componentSchema, options) => {
  return yup.lazy((obj) => {
    if (obj !== undefined) {
      return isRequired(attribute) && !options.isDraft
        ? componentSchema.defined()
        : componentSchema.nullable();
    }

    return isRequired(attribute)
      ? yup.object().defined()
      : yup.object().nullable();
  });
};

/* ---------- Dynamic zone handling ---------- */

/**
 * Returns Yup schema for a dynamic zone attribute.
 */
const getDynamicZoneSchema = (attribute, components, options) => {
  let schema = yup.array().of(
    yup.lazy(({ __component }) =>
      createYupSchema(
        components[__component],
        { components },
        { ...options, isFromComponent: true }
      )
    )
  );

  if (attribute.required && !options.isDraft) {
    schema = applyRequiredTests(schema, options);
    if (hasMin(attribute)) {
      schema = applyMinTests(schema, options);
    }
  } else if (hasMin(attribute)) {
    schema = schema.notEmptyMin(attribute.min);
  }

  if (hasMax(attribute)) {
    schema = schema.max(attribute.max, errorsTrads.max);
  }

  return schema;
};

/**
 * Adds required validation to a dynamic zone schema.
 */
const applyRequiredTests = (schema, options) => {
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
 * Adds min validation (including required) to a dynamic zone schema.
 */
const applyMinTests = (schema, options) => {
  const minTest = (value) => {
    if (options.isCreatingEntry) {
      return value && value.length > 0;
    }
    if (value === undefined) {
      return true;
    }
    return value !== null && value.length > 0;
  };

  return schema
    .test('min', errorsTrads.min, minTest)
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

/* ---------- Primitive attribute handling ---------- */

/**
 * Build Yup schema for primitive attribute based on its type and validations.
 */
const createYupSchemaAttribute = (type, validations, options) => {
  let schema = getBaseSchema(type);

  Object.keys(validations).forEach((validation) => {
    const value = validations[validation];
    if (!shouldApplyValidation(value)) {
      return;
    }

    schema = applyValidation(schema, type, validation, value, options);
  });

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
 * Determines whether a validation rule should be applied.
 */
const shouldApplyValidation = (val) => {
  return (
    !!val ||
    (!isBoolean(val) && Number.isInteger(Math.floor(val))) ||
    val === 0
  );
};

/**
 * Applies a single validation rule to the schema.
 */
const applyValidation = (schema, type, validation, value, options) => {
  switch (validation) {
    case 'required':
      return applyRequiredValidation(schema, type, options);
    case 'max':
      return type === 'biginteger'
        ? schema.isInferior(errorsTrads.max, value)
        : schema.max(value, errorsTrads.max);
    case 'maxLength':
      return schema.max(value, errorsTrads.maxLength);
    case 'min':
      return type === 'biginteger'
        ? schema.isSuperior(errorsTrads.min, value)
        : schema.min(value, errorsTrads.min);
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

/**
 * Applies the required validation respecting draft/creation options.
 */
const applyRequiredValidation = (schema, type, options) => {
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