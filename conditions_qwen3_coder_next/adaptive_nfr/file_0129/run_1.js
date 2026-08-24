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
 * Determines if an attribute is a simple field (not relation/component/dynamiczone)
 * @param {Object} attribute - attribute object
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
 * @param {Object} attribute - attribute object
 * @returns {boolean}
 */
const isRelationAttribute = attribute => attribute.type === 'relation';

/**
 * Determines if an attribute is a component type
 * @param {Object} attribute - attribute object
 * @returns {boolean}
 */
const isComponentAttribute = attribute => attribute.type === 'component';

/**
 * Determines if an attribute is a dynamiczone type
 * @param {Object} attribute - attribute object
 * @returns {boolean}
 */
const isDynamicZoneAttribute = attribute => attribute.type === 'dynamiczone';

/**
 * Determines if a relation type should be an array schema
 * @param {string} relationType - relation type string
 * @returns {boolean}
 */
const isToManyRelation = relationType => {
  return relationType === 'manyToMany' || relationType === 'manyWay';
};

/**
 * Determines if a relation type should be an object schema
 * @param {string} relationType - relation type string
 * @returns {boolean}
 */
const isToOneRelation = relationType => {
  return ['oneWay', 'oneToOne', 'manyToOne', 'oneToManyMorph', 'oneToOneMorph'].includes(relationType);
};

/**
 * Determines if a component is repeatable
 * @param {Object} attribute - component attribute object
 * @returns {boolean}
 */
const isRepeatableComponent = attribute => attribute.repeatable === true;

/**
 * Determines if a field is required based on attribute and options
 * @param {Object} attribute - attribute object
 * @param {Object} options - schema options
 * @returns {boolean}
 */
const isFieldRequired = (attribute, options) => {
  return attribute.required === true && !options.isDraft;
};

/**
 * Determines if a field is optional but not draft
 * @param {Object} attribute - attribute object
 * @param {Object} options - schema options
 * @returns {boolean}
 */
const isOptionalButNotDraft = (attribute, options) => {
  return attribute.required !== true && !options.isDraft;
};

/**
 * Determines if a field is required and not draft
 * @param {Object} attribute - attribute object
 * @param {Object} options - schema options
 * @returns {boolean}
 */
const isRequiredAndNotDraft = (attribute, options) => {
  return attribute.required === true && !options.isDraft;
};

/**
 * Determines if a field is required and creating entry
 * @param {Object} attribute - attribute object
 * @param {Object} options - schema options
 * @returns {boolean}
 */
const isRequiredAndCreatingEntry = (attribute, options) => {
  return attribute.required === true && options.isCreatingEntry;
};

/**
 * Determines if a field is required and editing existing entry
 * @param {Object} attribute - attribute object
 * @param {Object} options - schema options
 * @returns {boolean}
 */
const isRequiredAndEditingEntry = (attribute, options) => {
  return attribute.required === true && !options.isCreatingEntry;
};

/**
 * Determines if a field is required and creating entry and password type
 * @param {Object} attribute - attribute object
 * @param {Object} options - schema options
 * @returns {boolean}
 */
const isRequiredPasswordCreatingEntry = (attribute, options) => {
  return attribute.type === 'password' && options.isCreatingEntry && attribute.required === true;
};

/**
 * Determines if a field is required and editing entry and not password type
 * @param {Object} attribute - attribute object
 * @param {Object} options - schema options
 * @returns {boolean}
 */
const isRequiredNonPasswordEditingEntry = (attribute, options) => {
  return attribute.type !== 'password' && attribute.required === true && !options.isCreatingEntry;
};

/**
 * Determines if a field is required and creating entry and not password type
 * @param {Object} attribute - attribute object
 * @param {Object} options - schema options
 * @returns {boolean}
 */
const isRequiredNonPasswordCreatingEntry = (attribute, options) => {
  return attribute.type !== 'password' && attribute.required === true && options.isCreatingEntry;
};

/**
 * Determines if a field is required and editing entry and not password type
 * @param {Object} attribute - attribute object
 * @param {Object} options - schema options
 * @returns {boolean}
 */
const isRequiredNonPasswordEditingEntryAndNotDraft = (attribute, options) => {
  return (
    attribute.type !== 'password' &&
    attribute.required === true &&
    !options.isCreatingEntry &&
    !options.isDraft
  );
};

/**
 * Determines if a field is required and editing entry and not password type and not from component
 * @param {Object} attribute - attribute object
 * @param {Object} options - schema options
 * @returns {boolean}
 */
const isRequiredNonPasswordEditingEntryAndNotDraftAndNotFromComponent = (attribute, options) => {
  return (
    attribute.type !== 'password' &&
    attribute.required === true &&
    !options.isCreatingEntry &&
    !options.isDraft &&
    !options.isFromComponent
  );
};

/**
 * Determines if a field is required and editing entry and not password type and not from component and undefined value
 * @param {Object} attribute - attribute object
 * @param {Object} options - schema options
 * @param {any} value - field value
 * @returns {boolean}
 */
const isRequiredNonPasswordEditingEntryAndNotDraftAndNotFromComponentAndUndefined = (
  attribute,
  options,
  value
) => {
  return (
    attribute.type !== 'password' &&
    attribute.required === true &&
    !options.isCreatingEntry &&
    !options.isDraft &&
    !options.isFromComponent &&
    value === undefined
  );
};

/**
 * Determines if a field is required and editing entry and not password type and not from component and not undefined value
 * @param {Object} attribute - attribute object
 * @param {Object} options - schema options
 * @param {any} value - field value
 * @returns {boolean}
 */
const isRequiredNonPasswordEditingEntryAndNotDraftAndNotFromComponentAndNotUndefined = (
  attribute,
  options,
  value
) => {
  return (
    attribute.type !== 'password' &&
    attribute.required === true &&
    !options.isCreatingEntry &&
    !options.isDraft &&
    !options.isFromComponent &&
    value !== undefined
  );
};

/**
 * Determines if a field is required and editing entry and not password type and not from component and not undefined value and is number type
 * @param {Object} attribute - attribute object
 * @param {Object} options - schema options
 * @param {any} value - field value
 * @returns {boolean}
 */
const isRequiredNonPasswordEditingEntryAndNotDraftAndNotFromComponentAndNotUndefinedAndNumberType = (
  attribute,
  options,
  value
) => {
  return (
    attribute.type !== 'password' &&
    attribute.required === true &&
    !options.isCreatingEntry &&
    !options.isDraft &&
    !options.isFromComponent &&
    value !== undefined &&
    ['number', 'integer', 'biginteger', 'float', 'decimal'].includes(attribute.type)
  );
};

/**
 * Determines if a field is required and editing entry and not password type and not from component and not undefined value and is date type
 * @param {Object} attribute - attribute object
 * @param {Object} options - schema options
 * @param {any} value - field value
 * @returns {boolean}
 */
const isRequiredNonPasswordEditingEntryAndNotDraftAndNotFromComponentAndNotUndefinedAndDateType = (
  attribute,
  options,
  value
) => {
  return (
    attribute.type !== 'password' &&
    attribute.required === true &&
    !options.isCreatingEntry &&
    !options.isDraft &&
    !options.isFromComponent &&
    value !== undefined &&
    ['date', 'datetime'].includes(attribute.type)
  );
};

/**
 * Determines if a field is required and editing entry and not password type and not from component and not undefined value and is boolean type
 * @param {Object} attribute - attribute object
 * @param {Object} options - schema options
 * @param {any} value - field value
 * @returns {boolean}
 */
const isRequiredNonPasswordEditingEntryAndNotDraftAndNotFromComponentAndNotUndefinedAndBooleanType = (
  attribute,
  options,
  value
) => {
  return (
    attribute.type !== 'password' &&
    attribute.required === true &&
    !options.isCreatingEntry &&
    !options.isDraft &&
    !options.isFromComponent &&
    value !== undefined &&
    attribute.type === 'boolean'
  );
};

/**
 * Determines if a field is required and editing entry and not password type and not from component and not undefined value and is not number/date/boolean type
 * @param {Object} attribute - attribute object
 * @param {Object} options - schema options
 * @param {any} value - field value
 * @returns {boolean}
 */
const isRequiredNonPasswordEditingEntryAndNotDraftAndNotFromComponentAndNotUndefinedAndOtherType = (
  attribute,
  options,
  value
) => {
  return (
    attribute.type !== 'password' &&
    attribute.required === true &&
    !options.isCreatingEntry &&
    !options.isDraft &&
    !options.isFromComponent &&
    value !== undefined &&
    !['number', 'integer', 'biginteger', 'float', 'decimal', 'date', 'datetime', 'boolean'].includes(
      attribute.type
    )
  );
};

/**
 * Determines if a field is required and editing entry and not password type and not from component and not undefined value and is number type and value is zero
 * @param {Object} attribute - attribute object
 * @param {Object} options - schema options
 * @param {any} value - field value
 * @returns {boolean}
 */
const isRequiredNonPasswordEditingEntryAndNotDraftAndNotFromComponentAndNotUndefinedAndNumberTypeAndZero = (
  attribute,
  options,
  value
) => {
  return (
    attribute.type !== 'password' &&
    attribute.required === true &&
    !options.isCreatingEntry &&
    !options.isDraft &&
    !options.isFromComponent &&
    value !== undefined &&
    ['number', 'integer', 'biginteger', 'float', 'decimal'].includes(attribute.type) &&
    value === 0
  );
};

/**
 * Determines if a field is required and editing entry and not password type and not from component and not undefined value and is number type and value is not zero
 * @param {Object} attribute - attribute object
 * @param {Object} options - schema options
 * @param {any} value - field value
 * @returns {boolean}
 */
const isRequiredNonPasswordEditingEntryAndNotDraftAndNotFromComponentAndNotUndefinedAndNumberTypeAndNotZero = (
  attribute,
  options,
  value
) => {
  return (
    attribute.type !== 'password' &&
    attribute.required === true &&
    !options.isCreatingEntry &&
    !options.isDraft &&
    !options.isFromComponent &&
    value !== undefined &&
    ['number', 'integer', 'biginteger', 'float', 'decimal'].includes(attribute.type) &&
    value !== 0
  );
};

/**
 * Determines if a field is required and editing entry and not password type and not from component and not undefined value and is date type and valid
 * @param {Object} attribute - attribute object
 * @param {Object} options - schema options
 * @param {any} value - field value
 * @returns {boolean}
 */
const isRequiredNonPasswordEditingEntryAndNotDraftAndNotFromComponentAndNotUndefinedAndDateTypeAndValid = (
  attribute,
  options,
  value
) => {
  return (
    attribute.type !== 'password' &&
    attribute.required === true &&
    !options.isCreatingEntry &&
    !options.isDraft &&
    !options.isFromComponent &&
    value !== undefined &&
    ['date', 'datetime'].includes(attribute.type) &&
    moment(value)._isValid === true
  );
};

/**
 * Determines if a field is required and editing entry and not password type and not from component and not undefined value and is boolean type and not null
 * @param {Object} attribute - attribute object
 * @param {Object} options - schema options
 * @param {any} value - field value
 * @returns {boolean}
 */
const isRequiredNonPasswordEditingEntryAndNotDraftAndNotFromComponentAndNotUndefinedAndBooleanTypeAndNotNull = (
  attribute,
  options,
  value
) => {
  return (
    attribute.type !== 'password' &&
    attribute.required === true &&
    !options.isCreatingEntry &&
    !options.isDraft &&
    !options.isFromComponent &&
    value !== undefined &&
    attribute.type === 'boolean' &&
    value !== null
  );
};

/**
 * Determines if a field is required and editing entry and not password type and not from component and not undefined value and is other type and not empty
 * @param {Object} attribute - attribute object
 * @param {Object} options - schema options
 * @param {any} value - field value
 * @returns {boolean}
 */
const isRequiredNonPasswordEditingEntryAndNotDraftAndNotFromComponentAndNotUndefinedAndOtherTypeAndNotEmpty = (
  attribute,
  options,
  value
) => {
  return (
    attribute.type !== 'password' &&
    attribute.required === true &&
    !options.isCreatingEntry &&
    !options.isDraft &&
    !options.isFromComponent &&
    value !== undefined &&
    !['number', 'integer', 'biginteger', 'float', 'decimal', 'date', 'datetime', 'boolean'].includes(
      attribute.type
    ) &&
    !isEmpty(value)
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
        const formatted = createYupSchemaAttribute(attribute.type, attribute, options);
        acc[current] = formatted;
        return acc;
      }

      if (isRelationAttribute(attribute)) {
        acc[current] = isToOneRelation(attribute.relationType)
          ? yup.object().nullable()
          : yup.array().nullable();
        return acc;
      }

      if (isComponentAttribute(attribute)) {
        const componentFieldSchema = createYupSchema(
          components[attribute.component],
          { components },
          { ...options, isFromComponent: true }
        );

        if (isRepeatableComponent(attribute)) {
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
            return isFieldRequired(attribute, options)
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

    if (
      !!validationValue ||
      (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
      validationValue === 0
    ) {
      switch (validation) {
        case 'required': {
          if (!options.isDraft) {
            if (isRequiredPasswordCreatingEntry(validations, options)) {
              schema = schema.required(errorsTrads.required);
            }

            if (isRequiredNonPasswordEditingEntryAndNotDraftAndNotFromComponentAndNotUndefinedAndNumberTypeAndZero(validations, options, undefined)) {
              schema = schema.test('required', errorsTrads.required, value => {
                if (value === 0) {
                  return true;
                }

                return !!value;
              });
            }

            if (isRequiredNonPasswordEditingEntryAndNotDraftAndNotFromComponentAndNotUndefinedAndDateTypeAndValid(validations, options, undefined)) {
              schema = schema.test('required', errorsTrads.required, value => {
                return moment(value)._isValid === true;
              });
            }

            if (isRequiredNonPasswordEditingEntryAndNotDraftAndNotFromComponentAndNotUndefinedAndBooleanTypeAndNotNull(validations, options, undefined)) {
              schema = schema.test('required', errorsTrads.required, value => {
                return value !== null;
              });
            }

            if (isRequiredNonPasswordEditingEntryAndNotDraftAndNotFromComponentAndNotUndefinedAndOtherTypeAndNotEmpty(validations, options, undefined)) {
              schema = schema.test('required', errorsTrads.required, value => {
                return !isEmpty(value);
              });
            }

            if (isRequiredNonPasswordCreatingEntry(validations, options)) {
              schema = schema.required(errorsTrads.required);
            }

            if (isRequiredNonPasswordEditingEntryAndNotDraftAndNotFromComponentAndNotUndefinedAndNumberTypeAndNotZero(validations, options, undefined)) {
              schema = schema.test('required', errorsTrads.required, value => {
                return !!value;
              });
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