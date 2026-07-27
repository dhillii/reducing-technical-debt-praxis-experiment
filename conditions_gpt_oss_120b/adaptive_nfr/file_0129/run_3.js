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

/**
 * Determines if the attribute is a simple (non-relation/component/dynamiczone) field.
 * @param {Object} attr
 * @returns {boolean}
 */
function isSimpleAttribute(attr) {
  return (
    attr.type !== 'relation' &&
    attr.type !== 'component' &&
    attr.type !== 'dynamiczone'
  );
}

/**
 * Determines if the attribute is a relation field.
 * @param {Object} attr
 * @returns {boolean}
 */
function isRelationAttribute(attr) {
  return attr.type === 'relation';
}

/**
 * Determines if the attribute is a component field.
 * @param {Object} attr
 * @returns {boolean}
 */
function isComponentAttribute(attr) {
  return attr.type === 'component';
}

/**
 * Determines if the attribute is a dynamic zone field.
 * @param {Object} attr
 * @returns {boolean}
 */
function isDynamicZoneAttribute(attr) {
  return attr.type === 'dynamiczone';
}

/**
 * Creates Yup schema for simple attributes.
 * @param {Object} attribute
 * @param {Object} options
 * @returns {yup.Schema}
 */
function createSimpleAttributeSchema(attribute, options) {
  return createYupSchemaAttribute(attribute.type, attribute, options);
}

/**
 * Creates Yup schema for relation attributes.
 * @param {Object} attribute
 * @returns {yup.Schema}
 */
function createRelationSchema(attribute) {
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
}

/**
 * Creates Yup schema for component attributes.
 * @param {Object} attribute
 * @param {Object} components
 * @param {Object} options
 * @returns {yup.Schema}
 */
function createComponentSchema(attribute, components, options) {
  const componentFieldSchema = createYupSchema(
    components[attribute.component],
    { components },
    { ...options, isFromComponent: true }
  );

  if (attribute.repeatable) {
    return createRepeatableComponentSchema(attribute, componentFieldSchema, options);
  }

  return createSingleComponentSchema(attribute, componentFieldSchema, options);
}

/**
 * Creates Yup schema for repeatable component fields.
 * @param {Object} attribute
 * @param {yup.Schema} componentFieldSchema
 * @param {Object} options
 * @returns {yup.Schema}
 */
function createRepeatableComponentSchema(attribute, componentFieldSchema, options) {
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
}

/**
 * Creates Yup schema for a single (non‑repeatable) component field.
 * @param {Object} attribute
 * @param {yup.Schema} componentFieldSchema
 * @param {Object} options
 * @returns {yup.Schema}
 */
function createSingleComponentSchema(attribute, componentFieldSchema, options) {
  return yup.lazy(obj => {
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
 * Adds required test for dynamic zone schema.
 * @param {yup.Schema} schema
 * @param {Object} options
 * @returns {yup.Schema}
 */
function addDynamicZoneRequiredTests(schema, options) {
  return schema.test('required', errorsTrads.required, value => {
    if (options.isCreatingEntry) {
      return value !== null || value !== undefined;
    }
    if (value === undefined) {
      return true;
    }
    return value !== null;
  });
}

/**
 * Adds min and required tests for dynamic zone schema when a minimum is defined.
 * @param {yup.Schema} schema
 * @param {Object} options
 * @returns {yup.Schema}
 */
function addDynamicZoneMinTests(schema, options) {
  return schema
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

/**
 * Creates Yup schema for dynamic zone attributes.
 * @param {Object} attribute
 * @param {Object} components
 * @param {Object} options
 * @returns {yup.Schema}
 */
function createDynamicZoneSchema(attribute, components, options) {
  let schema = yup.array().of(
    yup.lazy(({ __component }) =>
      createYupSchema(
        components[__component],
        { components },
        { ...options, isFromComponent: true }
      )
    )
  );

  const { max, min } = attribute;

  if (attribute.required && !options.isDraft) {
    schema = addDynamicZoneRequiredTests(schema, options);
    if (min) {
      schema = addDynamicZoneMinTests(schema, options);
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
 * Generates a Yup validation schema for a given model.
 * @param {Object} model
 * @param {Object} param1
 * @param {Object} options
 * @returns {yup.ObjectSchema}
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
      acc[key] = createSimpleAttributeSchema(attribute, options);
      return acc;
    }

    if (isRelationAttribute(attribute)) {
      acc[key] = createRelationSchema(attribute);
      return acc;
    }

    if (isComponentAttribute(attribute)) {
      acc[key] = createComponentSchema(attribute, components, options);
      return acc;
    }

    if (isDynamicZoneAttribute(attribute)) {
      acc[key] = createDynamicZoneSchema(attribute, components, options);
      return acc;
    }

    return acc;
  }, {});

  return yup.object().shape(shape);
};

const createYupSchemaAttribute = (type, validations, options) => {
  let schema = yup.mixed();

  if (['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type)) {
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

  if (['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type)) {
    schema = yup
      .number()
      .transform(cv => (isNaN(cv) ? undefined : cv))
      .typeError();
  }

  if (['date', 'datetime'].includes(type)) {
    schema = yup.date();
  }

  if (type === 'biginteger') {
    schema = yup.string().matches(/^\d*$/);
  }

  Object.keys(validations).forEach(validation => {
    const validationValue = validations[validation];

    if (
      !!validationValue ||
      (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
      validationValue === 0
    ) {
      switch (validation) {
        case 'required': {
          if (!options.isDraft) {
            if (type === 'password' && options.isCreatingEntry) {
              schema = schema.required(errorsTrads.required);
            }

            if (type !== 'password') {
              if (options.isCreatingEntry) {
                schema = schema.required(errorsTrads.required);
              } else {
                schema = schema.test('required', errorsTrads.required, value => {
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
          break;
        }

        case 'max': {
          if (type === 'biginteger') {
            schema = schema.isInferior(errorsTrads.max, validationValue);
          } else {
            schema = schema.max(validationValue, errorsTrads.max);
          }
          break;
        }

        case 'maxLength':
          schema = schema.max(validationValue, errorsTrads.maxLength);
          break;

        case 'min': {
          if (type === 'biginteger') {
            schema = schema.isSuperior(errorsTrads.min, validationValue);
          } else {
            schema = schema.min(validationValue, errorsTrads.min);
          }
          break;
        }

        case 'minLength': {
          if (!options.isDraft) {
            schema = schema.min(validationValue, errorsTrads.minLength);
          }
          break;
        }

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
    }
  });

  return schema;
};

export default createYupSchema;