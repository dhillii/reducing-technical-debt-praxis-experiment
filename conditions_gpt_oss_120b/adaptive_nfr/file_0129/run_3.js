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
 * Determines if the attribute is a relation type that should be represented as an object.
 * @param {string} relationType
 * @returns {boolean}
 */
function isObjectRelation(relationType) {
  return ['oneWay', 'oneToOne', 'manyToOne', 'oneToManyMorph', 'oneToOneMorph'].includes(
    relationType
  );
}

/**
 * Returns the Yup schema for a relation attribute.
 * @param {object} attribute
 * @returns {yup.Schema}
 */
function getRelationSchema(attribute) {
  return isObjectRelation(attribute.relationType) ? yup.object().nullable() : yup.array().nullable();
}

/**
 * Returns the Yup schema for a component attribute.
 * @param {object} attribute
 * @param {object} components
 * @param {object} options
 * @returns {yup.Schema}
 */
function getComponentSchema(attribute, components, options) {
  const componentFieldSchema = createYupSchema(
    components[attribute.component],
    { components },
    { ...options, isFromComponent: true }
  );

  if (attribute.repeatable) {
    return getRepeatableComponentSchema(attribute, componentFieldSchema, options);
  }

  return getSingleComponentSchema(attribute, componentFieldSchema, options);
}

/**
 * Returns the Yup schema for a repeatable component.
 * @param {object} attribute
 * @param {yup.Schema} componentFieldSchema
 * @param {object} options
 * @returns {yup.Schema}
 */
function getRepeatableComponentSchema(attribute, componentFieldSchema, options) {
  const { min, max, required } = attribute;

  return yup.lazy((value) => {
    let baseSchema = yup.array().of(componentFieldSchema);

    if (min && !options.isDraft) {
      baseSchema = adjustSchemaForMin(baseSchema, required, value, min);
    }

    if (max) {
      baseSchema = baseSchema.max(max, errorsTrads.max);
    }

    return baseSchema;
  });
}

/**
 * Adjusts the base schema according to the `min` validation for repeatable components.
 * @param {yup.Schema} schema
 * @param {boolean} required
 * @param {any} value
 * @param {number} min
 * @returns {yup.Schema}
 */
function adjustSchemaForMin(schema, required, value, min) {
  if (required) {
    return schema.min(min, errorsTrads.min);
  }

  if (required !== true && isEmpty(value)) {
    return schema.nullable();
  }

  return schema.min(min, errorsTrads.min);
}

/**
 * Returns the Yup schema for a non‑repeatable component.
 * @param {object} attribute
 * @param {yup.Schema} componentFieldSchema
 * @param {object} options
 * @returns {yup.Schema}
 */
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

/**
 * Returns the Yup schema for a dynamic zone attribute.
 * @param {object} attribute
 * @param {object} components
 * @param {object} options
 * @returns {yup.Schema}
 */
function getDynamicZoneSchema(attribute, components, options) {
  let schema = yup.array().of(
    yup.lazy(({ __component }) =>
      createYupSchema(components[__component], { components }, { ...options, isFromComponent: true })
    )
  );

  const { max, min, required } = attribute;

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

  return schema;
}

/**
 * Returns the Yup schema for a primitive attribute (non‑relation/component/dynamiczone).
 * @param {string} type
 * @param {object} attribute
 * @param {object} options
 * @returns {yup.Schema}
 */
function getPrimitiveSchema(type, attribute, options) {
  let schema = createBaseSchema(type);
  schema = applyValidations(schema, type, attribute, options);
  return schema;
}

/**
 * Creates the base Yup schema based on the attribute type.
 * @param {string} type
 * @returns {yup.Schema}
 */
function createBaseSchema(type) {
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

/**
 * Applies validation rules to a schema.
 * @param {yup.Schema} schema
 * @param {string} type
 * @param {object} validations
 * @param {object} options
 * @returns {yup.Schema}
 */
function applyValidations(schema, type, validations, options) {
  Object.keys(validations).forEach((validation) => {
    const value = validations[validation];

    if (!shouldApplyValidation(value)) {
      return;
    }

    switch (validation) {
      case 'required':
        schema = handleRequired(schema, type, options);
        break;
      case 'max':
        schema = type === 'biginteger' ? schema.isInferior(errorsTrads.max, value) : schema.max(value, errorsTrads.max);
        break;
      case 'maxLength':
        schema = schema.max(value, errorsTrads.maxLength);
        break;
      case 'min':
        schema = type === 'biginteger' ? schema.isSuperior(errorsTrads.min, value) : schema.min(value, errorsTrads.min);
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
}

/**
 * Determines whether a validation rule should be applied.
 * @param {*} value
 * @returns {boolean}
 */
function shouldApplyValidation(value) {
  return (
    !!value ||
    (!isBoolean(value) && Number.isInteger(Math.floor(value))) ||
    value === 0
  );
}

/**
 * Handles the `required` validation based on context.
 * @param {yup.Schema} schema
 * @param {string} type
 * @param {object} options
 * @returns {yup.Schema}
 */
function handleRequired(schema, type, options) {
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
}

/**
 * Generates a Yup schema for a given model.
 * @param {object} model
 * @param {object} deps
 * @param {object} [options={ isCreatingEntry: true, isDraft: true, isFromComponent: false }]
 * @returns {yup.Schema}
 */
function createYupSchema(
  model,
  { components },
  options = { isCreatingEntry: true, isDraft: true, isFromComponent: false }
) {
  const attributes = getAttributes(model);

  const shape = Object.keys(attributes).reduce((acc, key) => {
    const attribute = attributes[key];
    const schema = getSchemaForAttribute(attribute, components, options);
    if (schema !== undefined) {
      acc[key] = schema;
    }
    return acc;
  }, {});

  return yup.object().shape(shape);
}

/**
 * Determines the appropriate Yup schema for an attribute.
 * @param {object} attribute
 * @param {object} components
 * @param {object} options
 * @returns {yup.Schema|undefined}
 */
function getSchemaForAttribute(attribute, components, options) {
  if (attribute.type === 'relation') {
    return getRelationSchema(attribute);
  }

  if (attribute.type === 'component') {
    return getComponentSchema(attribute, components, options);
  }

  if (attribute.type === 'dynamiczone') {
    return getDynamicZoneSchema(attribute, components, options);
  }

  // Primitive attribute
  return getPrimitiveSchema(attribute.type, attribute, options);
}

export default createYupSchema;