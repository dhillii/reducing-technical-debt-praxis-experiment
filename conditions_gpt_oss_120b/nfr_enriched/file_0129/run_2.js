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
 * Build Yup schema for a given model.
 */
const createYupSchema = (
  model,
  { components },
  options = { isCreatingEntry: true, isDraft: true, isFromComponent: false }
) => {
  const attributes = getAttributes(model);
  const shape = Object.keys(attributes).reduce((acc, key) => {
    const attribute = attributes[key];

    if (isSimpleAttribute(attribute)) {
      addSimpleAttribute(acc, key, attribute, options);
    } else if (attribute.type === 'relation') {
      addRelationAttribute(acc, key, attribute);
    } else if (attribute.type === 'component') {
      addComponentAttribute(acc, key, attribute, components, options);
    } else if (attribute.type === 'dynamiczone') {
      addDynamicZoneAttribute(acc, key, attribute, components, options);
    }

    return acc;
  }, {});

  return yup.object().shape(shape);
};

/* ---------- Helper predicates ---------- */
const isSimpleAttribute = (attr) =>
  attr.type !== 'relation' && attr.type !== 'component' && attr.type !== 'dynamiczone';

/* ---------- Simple attribute handling ---------- */
const addSimpleAttribute = (acc, key, attribute, options) => {
  const formatted = createYupSchemaAttribute(attribute.type, attribute, options);
  acc[key] = formatted;
};

/* ---------- Relation attribute handling ---------- */
const addRelationAttribute = (acc, key, attribute) => {
  const oneWayTypes = [
    'oneWay',
    'oneToOne',
    'manyToOne',
    'oneToManyMorph',
    'oneToOneMorph',
  ];
  acc[key] = oneWayTypes.includes(attribute.relationType)
    ? yup.object().nullable()
    : yup.array().nullable();
};

/* ---------- Component attribute handling ---------- */
const addComponentAttribute = (acc, key, attribute, components, options) => {
  const componentFieldSchema = createYupSchema(
    components[attribute.component],
    { components },
    { ...options, isFromComponent: true }
  );

  if (attribute.repeatable === true) {
    acc[key] = yup.lazy((value) => {
      let base = yup.array().of(componentFieldSchema);
      const { min, max, required } = attribute;

      if (min && !options.isDraft) {
        if (required) {
          base = base.min(min, errorsTrads.min);
        } else if (required !== true && isEmpty(value)) {
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
    return;
  }

  acc[key] = yup.lazy((obj) => {
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

/* ---------- Dynamic zone attribute handling ---------- */
const addDynamicZoneAttribute = (acc, key, attribute, components, options) => {
  let schema = yup.array().of(
    yup.lazy(({ __component }) =>
      createYupSchema(
        components[__component],
        { components },
        { ...options, isFromComponent: true }
      )
    )
  );

  const { min, max, required } = attribute;

  if (required && !options.isDraft) {
    schema = schema.test('required', errorsTrads.required, (value) => {
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
  } else if (min) {
    schema = schema.notEmptyMin(min);
  }

  if (max) {
    schema = schema.max(max, errorsTrads.max);
  }

  acc[key] = schema;
};

/**
 * Build Yup schema for a single attribute based on its type and validations.
 */
const createYupSchemaAttribute = (type, validations, options) => {
  let schema = initializeBaseSchema(type);

  Object.keys(validations).forEach((validation) => {
    const value = validations[validation];
    if (shouldApplyValidation(value)) {
      schema = applyValidation(schema, type, validation, value, options);
    }
  });

  return schema;
};

/* ---------- Base schema initialization ---------- */
const initializeBaseSchema = (type) => {
  if (['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type)) {
    return yup.string();
  }
  if (type === 'json') {
    return yup
      .mixed(errorsTrads.json)
      .test('isJSON', errorsTrads.json, (val) => {
        if (val === undefined) {
          return true;
        }
        if (isNumber(val) || isNull(val) || isObject(val) || isArray(val)) {
          return true;
        }
        try {
          JSON.parse(val);
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

/* ---------- Validation helpers ---------- */
const shouldApplyValidation = (val) =>
  !!val ||
  (!isBoolean(val) && Number.isInteger(Math.floor(val))) ||
  val === 0;

const applyValidation = (schema, type, validation, val, options) => {
  switch (validation) {
    case 'required':
      return handleRequired(schema, type, options);
    case 'max':
      return type === 'biginteger'
        ? schema.isInferior(errorsTrads.max, val)
        : schema.max(val, errorsTrads.max);
    case 'maxLength':
      return schema.max(val, errorsTrads.maxLength);
    case 'min':
      return type === 'biginteger'
        ? schema.isSuperior(errorsTrads.min, val)
        : schema.min(val, errorsTrads.min);
    case 'minLength':
      return !options.isDraft ? schema.min(val, errorsTrads.minLength) : schema;
    case 'regex':
      return schema.matches(new RegExp(val), errorsTrads.regex);
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

/* ---------- Required handling ---------- */
const handleRequired = (schema, type, options) => {
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