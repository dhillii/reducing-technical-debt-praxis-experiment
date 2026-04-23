```javascript
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

const isRelationType = (attribute) =>
  attribute.type === 'relation';

const isComponentType = (attribute) =>
  attribute.type === 'component';

const isDynamicZoneType = (attribute) =>
  attribute.type === 'dynamiczone';

const isPrimitiveType = (attribute) =>
  attribute.type !== 'relation' &&
  attribute.type !== 'component' &&
  attribute.type !== 'dynamiczone';

const isBigIntegerType = (type) =>
  type === 'biginteger';

const isNumberType = (type) =>
  ['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type);

const isDateType = (type) =>
  ['date', 'datetime'].includes(type);

const isStringType = (type) =>
  ['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type);

const isBooleanType = (type) =>
  type === 'boolean';

const isRequiredValidation = (validationValue) =>
  !!validationValue ||
  (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
  validationValue === 0;

const shouldApplyRequiredValidation = (options, type) =>
  !options.isDraft &&
  (type === 'password' && options.isCreatingEntry ||
   type !== 'password' && options.isCreatingEntry);

const createRequiredValidator = (type, options) => (value) => {
  if (value === undefined && !options.isFromComponent) {
    return true;
  }

  if (isNumberType(type)) {
    if (value === 0) {
      return true;
    }

    return !!value;
  }

  if (isDateType(type)) {
    return moment(value)._isValid === true;
  }

  if (isBooleanType(type)) {
    return value !== null;
  }

  return !isEmpty(value);
};

const createDynamicZoneRequiredValidator = (options) => (value) => {
  if (options.isCreatingEntry) {
    return value !== null || value !== undefined;
  }

  if (value === undefined) {
    return true;
  }

  return value !== null;
};

const createDynamicZoneMinValidator = (options) => (value) => {
  if (options.isCreatingEntry) {
    return value && value.length > 0;
  }

  if (value === undefined) {
    return true;
  }

  return value !== null && value.length > 0;
};

const createComponentSchema = (attribute, componentSchema, options) => {
  if (attribute.repeatable === true) {
    const { min, max, required } = attribute;
    let baseSchema = yup.array().of(componentSchema);

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

    return yup.lazy(value => baseSchema);
  }

  return yup.lazy(obj => {
    if (obj !== undefined) {
      return attribute.required === true && !options.isDraft
        ? componentSchema.defined()
        : componentSchema.nullable();
    }

    return attribute.required === true
      ? yup.object().defined()
      : yup.object().nullable();
  });
};

const createDynamicZoneSchema = (components, attribute, options) => {
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
    dynamicZoneSchema = dynamicZoneSchema.test('required', errorsTrads.required, value =>
      createDynamicZoneRequiredValidator(options)(value)
    );

    if (min) {
      dynamicZoneSchema = dynamicZoneSchema
        .test('min', errorsTrads.min, value =>
          createDynamicZoneMinValidator(options)(value)
        )
        .test('required', errorsTrads.required, value =>
          createDynamicZoneRequiredValidator(options)(value)
        );
    }
  } else if (min) {
    dynamicZoneSchema = dynamicZoneSchema.notEmptyMin(min);
  }

  if (max) {
    dynamicZoneSchema = dynamicZoneSchema.max(max, errorsTrads.max);
  }

  return dynamicZoneSchema;
};

const createYupSchemaAttribute = (type, validations, options) => {
  let schema = yup.mixed();

  if (isStringType(type)) {
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

  if (isNumberType(type)) {
    schema = yup
      .number()
      .transform(cv => (isNaN(cv) ? undefined : cv))
      .typeError();
  }

  if (isDateType(type)) {
    schema = yup.date();
  }

  if (isBigIntegerType(type)) {
    schema = yup.string().matches(/^\d*$/);
  }

  Object.keys(validations).forEach(validation => {
    const validationValue = validations[validation];

    if (isRequiredValidation(validationValue)) {
      switch (validation) {
        case 'required': {
          if (shouldApplyRequiredValidation(options, type)) {
            if (type === 'password' && options.isCreatingEntry) {
              schema = schema.required(errorsTrads.required);
            }

            if (type !== 'password') {
              if (options.isCreatingEntry) {
                schema = schema.required(errorsTrads.required);
              } else {
                schema = schema.test('required', errorsTrads.required, value =>
                  createRequiredValidator(type, options)(value)
                );
              }
            }
          }

          break;
        }

        case 'max': {
          if (isBigIntegerType(type)) {
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
          if (isBigIntegerType(type)) {
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
          if (isStringType(type)) {
            schema = schema.strict().lowercase();
          }
          break;
        case 'uppercase':
          if (isStringType(type)) {
            schema = schema.strict().uppercase();
          }
          break;
        case 'positive':
          if (isNumberType(type)) {
            schema = schema.positive();
          }
          break;
        case 'negative':
          if (isNumberType(type)) {
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

const createYupSchema = (
  model,
  { components },
  options = { isCreatingEntry: true, isDraft: true, isFromComponent: false }
) => {
  const attributes = getAttributes(model);

  return yup.object().shape(
    Object.keys(attributes).reduce((acc, current) => {
      const attribute = attributes[current];

      if (isPrimitiveType(attribute)) {
        const formatted = createYupSchemaAttribute(attribute.type, attribute, options);
        acc[current] = formatted;
      }

      if (isRelationType(attribute)) {
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

      if (isComponentType(attribute)) {
        const componentFieldSchema = createYupSchema(
          components[attribute.component],
          {
            components,
          },
          { ...options, isFromComponent: true }
        );

        acc[current] = createComponentSchema(attribute, componentFieldSchema, options);
      }

      if (isDynamicZoneType(attribute)) {
        acc[current] = createDynamicZoneSchema(components, attribute, options);
      }

      return acc;
    }, {})
  );
};

export default createYupSchema;
```