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
 * Determines if an attribute is a simple field (non-relation, non-component, non-dynamiczone)
 * @param {Object} attribute - The attribute object
 * @returns {boolean}
 */
const isSimpleAttribute = attribute => {
  return (
    attribute.type !== 'relation' &&
    attribute.type !== 'component' &&
    attribute.type !== 'dynamiczone'
  );
};

/**
 * Determines if an attribute is a relation type
 * @param {Object} attribute - The attribute object
 * @returns {boolean}
 */
const isRelationAttribute = attribute => attribute.type === 'relation';

/**
 * Determines if an attribute is a component type
 * @param {Object} attribute - The attribute object
 * @returns {boolean}
 */
const isComponentAttribute = attribute => attribute.type === 'component';

/**
 * Determines if an attribute is a dynamiczone type
 * @param {Object} attribute - The attribute object
 * @returns {boolean}
 */
const isDynamicZoneAttribute = attribute => attribute.type === 'dynamiczone';

/**
 * Determines if a relation type should be an array schema
 * @param {string} relationType - The relation type string
 * @returns {boolean}
 */
const isToManyRelation = relationType => {
  return relationType === 'manyToMany' || relationType === 'manyWayMorph';
};

/**
 * Determines if a field is required and not a draft
 * @param {Object} options - Validation options
 * @param {string} type - Field type
 * @returns {boolean}
 */
const isRequiredAndNotDraft = (options, type) => {
  return !options.isDraft && (type !== 'password' || options.isCreatingEntry);
};

/**
 * Determines if a field is required for creation
 * @param {Object} options - Validation options
 * @returns {boolean}
 */
const isRequiredForCreation = options => {
  return options.isCreatingEntry;
};

/**
 * Determines if a field is undefined and not from component
 * @param {Object} options - Validation options
 * @param {*} value - Field value
 * @returns {boolean}
 */
const isUndefinedAndNotFromComponent = (options, value) => {
  return value === undefined && !options.isFromComponent;
};

/**
 * Determines if a field is a number type
 * @param {string} type - Field type
 * @returns {boolean}
 */
const isNumberType = type => {
  return ['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type);
};

/**
 * Determines if a field is a date type
 * @param {string} type - Field type
 * @returns {boolean}
 */
const isDateType = type => {
  return ['date', 'datetime'].includes(type);
};

/**
 * Determines if a field is a boolean type
 * @param {string} type - Field type
 * @returns {boolean}
 */
const isBooleanType = type => {
  return type === 'boolean';
};

/**
 * Determines if a field is a text-like type
 * @param {string} type - Field type
 * @returns {boolean}
 */
const isTextType = type => {
  return ['text', 'textarea', 'email', 'string'].includes(type);
};

/**
 * Determines if a field is a numeric type for sign validation
 * @param {string} type - Field type
 * @returns {boolean}
 */
const isNumericTypeForSign = type => {
  return ['number', 'integer', 'bigint', 'float', 'decimal'].includes(type);
};

/**
 * Determines if a field value is valid for required validation
 * @param {string} type - Field type
 * @param {*} value - Field value
 * @returns {boolean}
 */
const isValidForRequiredValidation = (type, value) => {
  if (isUndefinedAndNotFromComponent({ isFromComponent: false }, value)) {
    return true;
  }

  if (isNumberType(type)) {
    return value !== 0 ? !!value : true;
  }

  if (isDateType(type)) {
    return moment(value)._isValid === true;
  }

  if (isBooleanType(type)) {
    return value !== null;
  }

  return !isEmpty(value);
};

/**
 * Determines if a field is a biginteger type
 * @param {string} type - Field type
 * @returns {boolean}
 */
const isBigintegerType = type => type === 'biginteger';

/**
 * Determines if a validation value is truthy or zero
 * @param {*} validationValue - Validation value
 * @returns {boolean}
 */
const isValidValidationValue = validationValue => {
  return (
    !!validationValue ||
    (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
    validationValue === 0
  );
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

      if (isSimpleAttribute(attribute)) {
        acc[current] = createYupSchemaAttribute(attribute.type, attribute, options);
        return acc;
      }

      if (isRelationAttribute(attribute)) {
        acc[current] = isToManyRelation(attribute.relationType)
          ? yup.array().nullable()
          : yup.object().nullable();
        return acc;
      }

      if (isComponentAttribute(attribute)) {
        const componentFieldSchema = createYupSchema(
          components[attribute.component],
          {
            components,
          },
          { ...options, isFromComponent: true }
        );

        if (attribute.repeatable === true) {
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
        }

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
      }

      if (isDynamicZoneAttribute(attribute)) {
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
              return value !== null && value !== undefined;
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
                  return value !== null && value !== undefined;
                }

                if (value === undefined) {
                  return true;
                }

                return value !== null;
              });
          }
        } else if (min) {
          dynamicZoneSchema = dynamicZoneSchema.notEmptyMin(min);
        }

        if (max) {
          dynamicZoneSchema = dynamicZoneSchema.max(max, errorsTrads.max);
        }

        acc[current] = dynamicZoneSchema;
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

    if (!isValidValidationValue(validationValue)) {
      return;
    }

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
                return isValidForRequiredValidation(type, value);
              });
            }
          }
        }

        break;
      }

      case 'max': {
        if (isBigintegerType(type)) {
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
        if (isBigintegerType(type)) {
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
        if (isTextType(type)) {
          schema = schema.strict().lowercase();
        }
        break;

      case 'uppercase':
        if (isTextType(type)) {
          schema = schema.strict().uppercase();
        }
        break;

      case 'positive':
        if (isNumericTypeForSign(type)) {
          schema = schema.positive();
        }
        break;

      case 'negative':
        if (isNumericTypeForSign(type)) {
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