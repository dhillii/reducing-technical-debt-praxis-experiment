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

const createYupSchemaAttribute = (type, validations, options) => {
  let schema = yup.mixed();

  const isStringType = ['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type);
  if (isStringType) {
    schema = yup.string();
  }

  const isNumberType = ['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type);
  if (isNumberType) {
    schema = yup
      .number()
      .transform(cv => (isNaN(cv) ? undefined : cv))
      .typeError();
  }

  const isDateType = ['date', 'datetime'].includes(type);
  if (isDateType) {
    schema = yup.date();
  }

  if (type === 'biginteger') {
    schema = yup.string().matches(/^\d*$/);
  }

  if (type === 'json') {
    schema = schema
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

  const applyValidation = (validation, value) => {
    if (!value) {
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
                if (value === undefined && !options.isFromComponent) {
                  return true;
                }

                if (isNumberType) {
                  if (value === 0) {
                    return true;
                  }

                  return !!value;
                }

                if (isDateType) {
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
          schema = schema.isInferior(errorsTrads.max, value);
        } else {
          schema = schema.max(value, errorsTrads.max);
        }
        break;
      }
      case 'maxLength':
        schema = schema.max(value, errorsTrads.maxLength);
        break;
      case 'min': {
        if (type === 'biginteger') {
          schema = schema.isSuperior(errorsTrads.min, value);
        } else {
          schema = schema.min(value, errorsTrads.min);
        }
        break;
      }
      case 'minLength': {
        if (!options.isDraft) {
          schema = schema.min(value, errorsTrads.minLength);
        }
        break;
      }
      case 'regex':
        schema = schema.matches(new RegExp(value), errorsTrads.regex);
        break;
      case 'lowercase':
        if (isStringType) {
          schema = schema.strict().lowercase();
        }
        break;
      case 'uppercase':
        if (isStringType) {
          schema = schema.strict().uppercase();
        }
        break;
      case 'positive':
        if (isNumberType) {
          schema = schema.positive();
        }
        break;
      case 'negative':
        if (isNumberType) {
          schema = schema.negative();
        }
        break;
      default:
        schema = schema.nullable();
    }
  };

  Object.keys(validations).forEach(validation => {
    const validationValue = validations[validation];

    if (
      !!validationValue ||
      (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
      validationValue === 0
    ) {
      applyValidation(validation, validationValue);
    }
  });

  return schema;
};

const createComponentSchema = (component, options) => {
  const { component: componentSchema, components } = component;
  const { isCreatingEntry, isDraft, isFromComponent } = options;

  const componentFieldSchema = createYupSchema(
    componentSchema,
    { components },
    { ...options, isFromComponent: true }
  );

  const isRepeatable = component.repeatable === true;
  const { min, max, required } = component;

  if (isRepeatable) {
    let baseSchema = yup.array().of(componentFieldSchema);

    if (min && !isDraft) {
      if (required) {
        baseSchema = baseSchema.min(min, errorsTrads.min);
      } else if (required !== true && isEmpty(component)) {
        baseSchema = baseSchema.nullable();
      } else {
        baseSchema = baseSchema.min(min, errorsTrads.min);
      }
    }

    if (max) {
      baseSchema = baseSchema.max(max, errorsTrads.max);
    }

    return yup.lazy(value => baseSchema);
  }

  return yup.lazy(obj => {
    if (obj !== undefined) {
      return component.required === true && !isDraft
        ? componentFieldSchema.defined()
        : componentFieldSchema.nullable();
    }

    return component.required === true ? yup.object().defined() : yup.object().nullable();
  });
};

const createDynamicZoneSchema = (attribute, options) => {
  const { components } = options;
  const { max, min, required } = attribute;

  const dynamicZoneSchema = yup.array().of(
    yup.lazy(({ __component }) => {
      return createYupSchema(
        components[__component],
        { components },
        { ...options, isFromComponent: true }
      );
    })
  );

  if (required && !options.isDraft) {
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

  if (max) {
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

  const schemaShape = Object.keys(attributes).reduce((acc, current) => {
    const attribute = attributes[current];

    if (
      attribute.type !== 'relation' &&
      attribute.type !== 'component' &&
      attribute.type !== 'dynamiczone'
    ) {
      acc[current] = createYupSchemaAttribute(attribute.type, attribute, options);
    }

    if (attribute.type === 'relation') {
      acc[current] = [
        'oneWay',
        'oneToOne',
        'manyToOne',
        'oneToManyMorph',
        'oneToOneMorph',
      ].includes(attribute.relationType)
        ? yup.object().nullable()
        : yup.array().nullable();
    }

    if (attribute.type === 'component') {
      acc[current] = createComponentSchema(attribute, { components, ...options });
    }

    if (attribute.type === 'dynamiczone') {
      acc[current] = createDynamicZoneSchema(attribute, { components, ...options });
    }

    return acc;
  }, {});

  return yup.object().shape(schemaShape);
};

export default createYupSchema;