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

const isStringType = type =>
  ['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type);

const isNumberType = type =>
  ['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type);

const isDateType = type => ['date', 'datetime'].includes(type);

const isBigIntType = type => type === 'biginteger';

const isBooleanType = type => type === 'boolean';

const createBaseSchema = (type, validations, options) => {
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

  if (isBigIntType(type)) {
    schema = yup.string().matches(/^\d*$/);
  }

  return applyValidations(schema, validations, options);
};

const applyValidations = (schema, validations, options) => {
  Object.keys(validations).forEach(validation => {
    const validationValue = validations[validation];

    if (
      !!validationValue ||
      (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
      validationValue === 0
    ) {
      applyValidation(schema, validation, validationValue, options);
    }
  });

  return schema;
};

const applyValidation = (schema, validation, validationValue, options) => {
  switch (validation) {
    case 'required': {
      applyRequiredValidation(schema, validationValue, options);
      break;
    }

    case 'max': {
      if (isBigIntType(validationValue)) {
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
      if (isBigIntType(validationValue)) {
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
      if (isStringType(validationValue)) {
        schema = schema.strict().lowercase();
      }
      break;

    case 'uppercase':
      if (isStringType(validationValue)) {
        schema = schema.strict().uppercase();
      }
      break;

    case 'positive':
      if (isNumberType(validationValue)) {
        schema = schema.positive();
      }
      break;

    case 'negative':
      if (isNumberType(validationValue)) {
        schema = schema.negative();
      }
      break;

    default:
      schema = schema.nullable();
  }
};

const applyRequiredValidation = (schema, validationValue, options) => {
  if (!options.isDraft) {
    if (validationValue === 'password' && options.isCreatingEntry) {
      schema = schema.required(errorsTrads.required);
    }

    if (validationValue !== 'password') {
      if (options.isCreatingEntry) {
        schema = schema.required(errorsTrads.required);
      } else {
        schema = schema.test('required', errorsTrads.required, value => {
          if (value === undefined && !options.isFromComponent) {
            return true;
          }

          if (isNumberType(validationValue)) {
            if (value === 0) {
              return true;
            }

            return !!value;
          }

          if (isDateType(validationValue)) {
            return moment(value)._isValid === true;
          }

          if (isBooleanType(validationValue)) {
            return value !== null;
          }

          return !isEmpty(value);
        });
      }
    }
  }
};

const createComponentSchema = (component, components, options) => {
  const componentSchema = createYupSchema(
    components[component],
    { components },
    { ...options, isFromComponent: true }
  );

  if (options.repeatable === true) {
    const { min, max, required } = options;
    let componentSchema = yup.lazy(value => {
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

      return baseSchema;
    });

    return componentSchema;
  }

  return yup.lazy(obj => {
    if (obj !== undefined) {
      return options.required === true && !options.isDraft
        ? componentSchema.defined()
        : componentSchema.nullable();
    }

    return options.required === true ? yup.object().defined() : yup.object().nullable();
  });
};

const createDynamicZoneSchema = (component, components, options) => {
  let dynamicZoneSchema = yup.array().of(
    yup.lazy(({ __component }) => {
      return createYupSchema(
        components[__component],
        { components },
        { ...options, isFromComponent: true }
      );
    })
  );

  const { max, min } = component;

  if (component.required && !options.isDraft) {
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

  return dynamicZoneSchema;
};

const createYupSchemaAttribute = (type, validations, options) => {
  if (type === 'relation') {
    return createRelationSchema(validations, options);
  }

  if (type === 'component') {
    return createComponentSchema(type, validations, options);
  }

  if (type === 'dynamiczone') {
    return createDynamicZoneSchema(type, validations, options);
  }

  return createBaseSchema(type, validations, options);
};

const createRelationSchema = (validations, options) => {
  const relationType = validations.relationType;

  if (
    ['oneWay', 'oneToOne', 'manyToOne', 'oneToManyMorph', 'oneToOneMorph'].includes(relationType)
  ) {
    return yup.object().nullable();
  }

  return yup.array().nullable();
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

      if (
        attribute.type !== 'relation' &&
        attribute.type !== 'component' &&
        attribute.type !== 'dynamiczone'
      ) {
        const formatted = createYupSchemaAttribute(attribute.type, attribute, options);
        acc[current] = formatted;
      }

      if (attribute.type === 'relation') {
        acc[current] = createRelationSchema(attribute, options);
      }

      if (attribute.type === 'component') {
        acc[current] = createComponentSchema(attribute.component, components, {
          ...options,
          isFromComponent: true,
          repeatable: attribute.repeatable,
          required: attribute.required,
          min: attribute.min,
          max: attribute.max,
        });
      }

      if (attribute.type === 'dynamiczone') {
        acc[current] = createDynamicZoneSchema(attribute, components, options);
      }

      return acc;
    }, {})
  );
};

export default createYupSchema;
```