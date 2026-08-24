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

const createYupSchema = (
  model,
  { components },
  options = { isCreatingEntry: true, isDraft: true, isFromComponent: false }
) => {
  const attributes = getAttributes(model);

  return yup.object().shape(
    Object.keys(attributes).reduce((acc, current) => {
      const attribute = attributes[current];

      if (
        attribute.type !== 'relation' &&
        attribute.type !== 'component' &&
        attribute.type !== 'dynamiczone'
      ) {
        const formatted = createYupSchemaAttribute(attribute.type, attribute, options);
        acc[current] = formatted;
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
        acc[current] = createComponentSchema(
          attribute,
          components[attribute.component],
          components,
          options
        );
      }

      if (attribute.type === 'dynamiczone') {
        acc[current] = createDynamicZoneSchema(attribute, components, options);
      }

      return acc;
    }, {})
  );
};

const createComponentSchema = (attribute, componentModel, components, options) => {
  const componentFieldSchema = createYupSchema(
    componentModel,
    { components },
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

    return componentSchema;
  }

  return yup.lazy(obj => {
    if (obj !== undefined) {
      return attribute.required === true && !options.isDraft
        ? componentFieldSchema.defined()
        : componentFieldSchema.nullable();
    }

    return attribute.required === true ? yup.object().defined() : yup.object().nullable();
  });
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
  } else {
    if (min) {
      dynamicZoneSchema = dynamicZoneSchema.notEmptyMin(min);
    }
  }

  if (max) {
    dynamicZoneSchema = dynamicZoneSchema.max(max, errorsTrads.max);
  }

  return dynamicZoneSchema;
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
      handleValidation(schema, type, validation, validationValue, options);
    }
  });

  return schema;
};

const handleValidation = (schema, type, validation, validationValue, options) => {
  switch (validation) {
    case 'required': {
      if (!options.isDraft) {
        if (type === 'password' && options.isCreatingEntry) {
          return schema.required(errorsTrads.required);
        }

        if (type !== 'password') {
          if (options.isCreatingEntry) {
            return schema.required(errorsTrads.required);
          }

          return schema.test('required', errorsTrads.required, value => {
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

      return schema;
    }

    case 'max': {
      if (type === 'biginteger') {
        return schema.isInferior(errorsTrads.max, validationValue);
      }

      return schema.max(validationValue, errorsTrads.max);
    }

    case 'maxLength':
      return schema.max(validationValue, errorsTrads.maxLength);

    case 'min': {
      if (type === 'biginteger') {
        return schema.isSuperior(errorsTrads.min, validationValue);
      }

      return schema.min(validationValue, errorsTrads.min);
    }

    case 'minLength': {
      if (!options.isDraft) {
        return schema.min(validationValue, errorsTrads.minLength);
      }

      return schema;
    }

    case 'regex':
      return schema.matches(new RegExp(validationValue), errorsTrads.regex);

    case 'lowercase':
      if (['text', 'textarea', 'email', 'string'].includes(type)) {
        return schema.strict().lowercase();
      }

      return schema;

    case 'uppercase':
      if (['text', 'textarea', 'email', 'string'].includes(type)) {
        return schema.strict().uppercase();
      }

      return schema;

    case 'positive':
      if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
        return schema.positive();
      }

      return schema;

    case 'negative':
      if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
        return schema.negative();
      }

      return schema;

    default:
      return schema.nullable();
  }
};

export default createYupSchema;