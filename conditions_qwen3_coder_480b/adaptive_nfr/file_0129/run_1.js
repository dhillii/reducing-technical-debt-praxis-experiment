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

const isRegularAttribute = attribute => 
  attribute.type !== 'relation' &&
  attribute.type !== 'component' &&
  attribute.type !== 'dynamiczone';

const isRelationAttribute = attribute => attribute.type === 'relation';

const isComponentAttribute = attribute => attribute.type === 'component';

const isDynamicZoneAttribute = attribute => attribute.type === 'dynamiczone';

const isRepeatableComponent = attribute => attribute.repeatable === true;

const isRequiredComponent = attribute => attribute.required === true;

const shouldValidateMin = (min, isDraft) => min && !isDraft;

const shouldValidateMax = max => max;

const shouldApplyRequiredValidation = (required, isDraft) => required && !isDraft;

const isCreatingEntryAndHasMin = (isCreatingEntry, min) => isCreatingEntry && min;

const isNotUndefinedAndNotFromComponent = (value, isFromComponent) => 
  value === undefined && !isFromComponent;

const isValidDateType = (type, value) => 
  ['date', 'datetime'].includes(type) && moment(value)._isValid === true;

const isValidNumericType = (type, value) => 
  ['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type) && 
  (value === 0 || !!value);

const isValidBooleanType = (type, value) => type === 'boolean' && value !== null;

const createRelationSchema = attribute => {
  const isOneWayRelation = [
    'oneWay',
    'oneToOne',
    'manyToOne',
    'oneToManyMorph',
    'oneToOneMorph',
  ].includes(attribute.relationType);

  return isOneWayRelation ? yup.object().nullable() : yup.array().nullable();
};

const createRepeatableComponentSchema = (attribute, componentFieldSchema, options) => {
  const { min, max, required } = attribute;
  
  let componentSchema = yup.lazy(value => {
    let baseSchema = yup.array().of(componentFieldSchema);

    if (shouldValidateMin(min, options.isDraft)) {
      if (required) {
        baseSchema = baseSchema.min(min, errorsTrads.min);
      } else if (required !== true && isEmpty(value)) {
        baseSchema = baseSchema.nullable();
      } else {
        baseSchema = baseSchema.min(min, errorsTrads.min);
      }
    }

    if (shouldValidateMax(max)) {
      baseSchema = baseSchema.max(max, errorsTrads.max);
    }

    return baseSchema;
  });

  return componentSchema;
};

const createNonRepeatableComponentSchema = (attribute, componentFieldSchema, options) => {
  return yup.lazy(obj => {
    if (obj !== undefined) {
      return isRequiredComponent(attribute) && !options.isDraft
        ? componentFieldSchema.defined()
        : componentFieldSchema.nullable();
    }

    return isRequiredComponent(attribute) 
      ? yup.object().defined() 
      : yup.object().nullable();
  });
};

const createComponentSchema = (attribute, components, options) => {
  const componentFieldSchema = createYupSchema(
    components[attribute.component],
    { components },
    { ...options, isFromComponent: true }
  );

  if (isRepeatableComponent(attribute)) {
    return createRepeatableComponentSchema(attribute, componentFieldSchema, options);
  }

  return createNonRepeatableComponentSchema(attribute, componentFieldSchema, options);
};

const createDynamicZoneSchema = (attribute, components, options) => {
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

  if (shouldApplyRequiredValidation(attribute.required, options.isDraft)) {
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
  } else if (min) {
    dynamicZoneSchema = dynamicZoneSchema.notEmptyMin(min);
  }

  if (shouldValidateMax(max)) {
    dynamicZoneSchema = dynamicZoneSchema.max(max, errorsTrads.max);
  }

  return dynamicZoneSchema;
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

      if (isRegularAttribute(attribute)) {
        const formatted = createYupSchemaAttribute(attribute.type, attribute, options);
        acc[current] = formatted;
        return acc;
      }

      if (isRelationAttribute(attribute)) {
        acc[current] = createRelationSchema(attribute);
        return acc;
      }

      if (isComponentAttribute(attribute)) {
        acc[current] = createComponentSchema(attribute, components, options);
        return acc;
      }

      if (isDynamicZoneAttribute(attribute)) {
        acc[current] = createDynamicZoneSchema(attribute, components, options);
        return acc;
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
          if (options.isDraft) {
            break;
          }

          if (type === 'password' && options.isCreatingEntry) {
            schema = schema.required(errorsTrads.required);
            break;
          }

          if (type === 'password') {
            schema = schema.test('required', errorsTrads.required, value => {
              if (isNotUndefinedAndNotFromComponent(value, options.isFromComponent)) {
                return true;
              }

              if (isValidNumericType(type, value)) {
                return true;
              }

              if (isValidDateType(type, value)) {
                return true;
              }

              if (isValidBooleanType(type, value)) {
                return true;
              }

              return !isEmpty(value);
            });
            break;
          }

          if (options.isCreatingEntry) {
            schema = schema.required(errorsTrads.required);
          } else {
            schema = schema.test('required', errorsTrads.required, value => {
              if (isNotUndefinedAndNotFromComponent(value, options.isFromComponent)) {
                return true;
              }

              if (isValidNumericType(type, value)) {
                return true;
              }

              if (isValidDateType(type, value)) {
                return true;
              }

              if (isValidBooleanType(type, value)) {
                return true;
              }

              return !isEmpty(value);
            });
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