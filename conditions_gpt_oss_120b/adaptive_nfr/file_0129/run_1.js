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
 * Returns Yup schema for a given attribute based on its type.
 */
function getSchemaForAttribute(attribute, components, options) {
  if (isSimpleAttribute(attribute)) {
    return createYupSchemaAttribute(attribute.type, attribute, options);
  }

  if (attribute.type === 'relation') {
    return getRelationSchema(attribute);
  }

  if (attribute.type === 'component') {
    return getComponentSchema(attribute, components, options);
  }

  if (attribute.type === 'dynamiczone') {
    return getDynamicZoneSchema(attribute, components, options);
  }

  return undefined;
}

/** Guard predicate for simple (non‑relation/component/dz) attributes */
function isSimpleAttribute(attribute) {
  return (
    attribute.type !== 'relation' &&
    attribute.type !== 'component' &&
    attribute.type !== 'dynamiczone'
  );
}

/** Relation schema based on relation type */
function getRelationSchema(attribute) {
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
}

/** Component schema handling repeatable and single components */
function getComponentSchema(attribute, components, options) {
  const componentFieldSchema = createYupSchema(
    components[attribute.component],
    { components },
    { ...options, isFromComponent: true }
  );

  if (attribute.repeatable === true) {
    return getRepeatableComponentSchema(attribute, componentFieldSchema, options);
  }

  return getSingleComponentSchema(attribute, componentFieldSchema, options);
}

/** Schema for repeatable component fields */
function getRepeatableComponentSchema(attribute, componentFieldSchema, options) {
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
}

/** Schema for a single (non‑repeatable) component field */
function getSingleComponentSchema(attribute, componentFieldSchema, options) {
  return yup.lazy((obj) => {
    if (obj !== undefined) {
      if (attribute.required === true && !options.isDraft) {
        return componentFieldSchema.defined();
      }
      return componentFieldSchema.nullable();
    }

    if (attribute.required === true) {
      return yup.object().defined();
    }
    return yup.object().nullable();
  });
}

/** Dynamic zone schema handling required/min/max */
function getDynamicZoneSchema(attribute, components, options) {
  let schema = yup.array().of(
    yup.lazy(({ __component }) =>
      createYupSchema(
        components[__component],
        { components },
        { ...options, isFromComponent: true }
      )
    )
  );

  const { max, min, required } = attribute;

  if (required && !options.isDraft) {
    schema = addRequiredTest(schema, options);
    if (min) {
      schema = addMinTest(schema, options);
    }
  } else if (min) {
    schema = schema.notEmptyMin(min);
  }

  if (max) {
    schema = schema.max(max, errorsTrads.max);
  }

  return schema;
}

/** Adds required test for dynamic zone */
function addRequiredTest(schema, options) {
  return schema.test('required', errorsTrads.required, (value) => {
    if (options.isCreatingEntry) {
      return value !== null && value !== undefined;
    }
    if (value === undefined) {
      return true;
    }
    return value !== null;
  });
}

/** Adds min length test for dynamic zone */
function addMinTest(schema, options) {
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
}

/**
 * Main schema creator for a model.
 */
const createYupSchema = (
  model,
  { components },
  options = { isCreatingEntry: true, isDraft: true, isFromComponent: false }
) => {
  const attributes = getAttributes(model);
  const shape = Object.keys(attributes).reduce((acc, key) => {
    const schema = getSchemaForAttribute(attributes[key], components, options);
    if (schema !== undefined) {
      acc[key] = schema;
    }
    return acc;
  }, {});
  return yup.object().shape(shape);
};

/**
 * Creates Yup schema for a primitive attribute based on its type and validations.
 */
function createYupSchemaAttribute(type, validations, options) {
  let schema = getBaseSchema(type);

  Object.entries(validations).forEach(([validation, value]) => {
    if (!shouldApplyValidation(value)) {
      return;
    }
    schema = applyValidation(schema, type, validation, value, options);
  });

  return schema;
}

/** Returns base Yup schema for a given attribute type */
function getBaseSchema(type) {
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
}

/** Determines whether a validation should be applied */
function shouldApplyValidation(val) {
  return (
    !!val ||
    (!isBoolean(val) && Number.isInteger(Math.floor(val))) ||
    val === 0
  );
}

/** Applies a single validation to the schema */
function applyValidation(schema, type, validation, val, options) {
  switch (validation) {
    case 'required':
      return applyRequired(schema, type, options);
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
}

/** Handles the required validation with context‑aware logic */
function applyRequired(schema, type, options) {
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
}

export default createYupSchema;