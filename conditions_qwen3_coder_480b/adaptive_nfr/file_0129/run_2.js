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
 * Checks if the attribute type is a basic field (not relation, component, or dynamiczone)
 */
const isBasicFieldType = (type) => {
  return type !== 'relation' && type !== 'component' && type !== 'dynamiczone';
};

/**
 * Checks if the relation type is singular (one-way or one-to-one relationship)
 */
const isSingularRelation = (relationType) => {
  return [
    'oneWay',
    'oneToOne',
    'manyToOne',
    'oneToManyMorph',
    'oneToOneMorph',
  ].includes(relationType);
};

/**
 * Creates schema for basic field types
 */
const handleBasicField = (acc, current, attribute, options) => {
  const formatted = createYupSchemaAttribute(attribute.type, attribute, options);
  acc[current] = formatted;
  return acc;
};

/**
 * Creates schema for relation fields
 */
const handleRelationField = (acc, current, attribute) => {
  acc[current] = isSingularRelation(attribute.relationType)
    ? yup.object().nullable()
    : yup.array().nullable();
  return acc;
};

/**
 * Handles repeatable component schema creation
 */
const handleRepeatableComponent = (acc, current, attribute, components, options) => {
  const componentFieldSchema = createYupSchema(
    components[attribute.component],
    { components },
    { ...options, isFromComponent: true }
  );

  const { min, max, required } = attribute;
  let componentSchema = yup.lazy(value => {
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

  acc[current] = componentSchema;
  return acc;
};

/**
 * Handles non-repeatable component schema creation
 */
const handleNonRepeatableComponent = (acc, current, attribute, components, options) => {
  const componentFieldSchema = createYupSchema(
    components[attribute.component],
    { components },
    { ...options, isFromComponent: true }
  );

  const componentSchema = yup.lazy(obj => {
    if (obj !== undefined) {
      return attribute.required === true && !options.isDraft
        ? componentFieldSchema.defined()
        : componentFieldSchema.nullable();
    }

    return attribute.required === true ? yup.object().defined() : yup.object().nullable();
  });

  acc[current] = componentSchema;
  return acc;
};

/**
 * Creates schema for component fields
 */
const handleComponentField = (acc, current, attribute, components, options) => {
  if (attribute.repeatable === true) {
    return handleRepeatableComponent(acc, current, attribute, components, options);
  }
  
  return handleNonRepeatableComponent(acc, current, attribute, components, options);
};

/**
 * Handles required dynamic zone validation for creating entries
 */
const handleDynamicZoneRequiredCreating = (dynamicZoneSchema) => {
  return dynamicZoneSchema.test('required', errorsTrads.required, value => {
    return value !== null || value !== undefined;
  });
};

/**
 * Handles required dynamic zone validation for editing entries
 */
const handleDynamicZoneRequiredEditing = (dynamicZoneSchema) => {
  return dynamicZoneSchema.test('required', errorsTrads.required, value => {
    if (value === undefined) {
      return true;
    }
    return value !== null;
  });
};

/**
 * Handles minimum length validation for dynamic zones when creating entries
 */
const handleDynamicZoneMinCreating = (dynamicZoneSchema) => {
  return dynamicZoneSchema.test('min', errorsTrads.min, value => {
    return value && value.length > 0;
  });
};

/**
 * Handles minimum length validation for dynamic zones when editing entries
 */
const handleDynamicZoneMinEditing = (dynamicZoneSchema) => {
  return dynamicZoneSchema.test('min', errorsTrads.min, value => {
    if (value === undefined) {
      return true;
    }
    return value !== null && value.length > 0;
  });
};

/**
 * Handles required validation for dynamic zones with minimum length
 */
const handleDynamicZoneMinRequired = (dynamicZoneSchema, options) => {
  let schema = dynamicZoneSchema
    .test('min', errorsTrads.min, value => {
      if (options.isCreatingEntry) {
        return value && value.length > 0;
      }

      if (value === undefined) {
        return true;
      }

      return value !== null && value.length > 0;
    });
    
  if (options.isCreatingEntry) {
    schema = handleDynamicZoneRequiredCreating(schema);
  } else {
    schema = handleDynamicZoneRequiredEditing(schema);
  }
  
  return schema;
};

/**
 * Creates schema for dynamic zone fields
 */
const handleDynamicZoneField = (acc, current, attribute, components, options) => {
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
    if (options.isCreatingEntry) {
      dynamicZoneSchema = handleDynamicZoneRequiredCreating(dynamicZoneSchema);
    } else {
      dynamicZoneSchema = handleDynamicZoneRequiredEditing(dynamicZoneSchema);
    }

    if (min) {
      dynamicZoneSchema = handleDynamicZoneMinRequired(dynamicZoneSchema, options);
    }
  } else if (min) {
    dynamicZoneSchema = dynamicZoneSchema.notEmptyMin(min);
  }

  if (max) {
    dynamicZoneSchema = dynamicZoneSchema.max(max, errorsTrads.max);
  }

  acc[current] = dynamicZoneSchema;
  return acc;
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

      if (isBasicFieldType(attribute.type)) {
        return handleBasicField(acc, current, attribute, options);
      }

      if (attribute.type === 'relation') {
        return handleRelationField(acc, current, attribute);
      }

      if (attribute.type === 'component') {
        return handleComponentField(acc, current, attribute, components, options);
      }

      if (attribute.type === 'dynamiczone') {
        return handleDynamicZoneField(acc, current, attribute, components, options);
      }

      return acc;
    }, {})
  );
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
                  // Field is not touched and the user is editing the entry
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