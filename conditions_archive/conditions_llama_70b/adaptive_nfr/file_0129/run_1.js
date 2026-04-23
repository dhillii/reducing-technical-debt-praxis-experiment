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

const createYupSchema = (
  model,
  { components },
  options = { isCreatingEntry: true, isDraft: true, isFromComponent: false }
) => {
  const attributes = getAttributes(model);

  return yup.object().shape(
    Object.keys(attributes).reduce((acc, current) => {
      const attribute = attributes[current];

      if (isRelationAttribute(attribute)) {
        acc[current] = createRelationSchema(attribute);
      } else if (isComponentAttribute(attribute)) {
        acc[current] = createComponentSchema(attribute, components, options);
      } else if (isDynamicZoneAttribute(attribute)) {
        acc[current] = createDynamicZoneSchema(attribute, components, options);
      } else {
        acc[current] = createYupSchemaAttribute(attribute.type, attribute, options);
      }

      return acc;
    }, {})
  );
};

const isRelationAttribute = attribute => attribute.type === 'relation';
const isComponentAttribute = attribute => attribute.type === 'component';
const isDynamicZoneAttribute = attribute => attribute.type === 'dynamiczone';

const createRelationSchema = attribute => {
  if (['oneWay', 'oneToOne', 'manyToOne', 'oneToManyMorph', 'oneToOneMorph'].includes(attribute.relationType)) {
    return yup.object().nullable();
  }

  return yup.array().nullable();
};

const createComponentSchema = (attribute, components, options) => {
  const componentFieldSchema = createYupSchema(
    components[attribute.component],
    {
      components,
    },
    { ...options, isFromComponent: true }
  );

  if (attribute.repeatable) {
    return createRepeatableComponentSchema(attribute, componentFieldSchema, options);
  }

  return createNonRepeatableComponentSchema(attribute, componentFieldSchema, options);
};

const createRepeatableComponentSchema = (attribute, componentFieldSchema, options) => {
  let componentSchema = yup.lazy(value => {
    let baseSchema = yup.array().of(componentFieldSchema);

    if (attribute.min && !options.isDraft) {
      baseSchema = addMinValidation(baseSchema, attribute.min, attribute.required, options, value);
    }

    if (attribute.max) {
      baseSchema = baseSchema.max(attribute.max, errorsTrads.max);
    }

    return baseSchema;
  });

  return componentSchema;
};

const createNonRepeatableComponentSchema = (attribute, componentFieldSchema, options) => {
  const componentSchema = yup.lazy(obj => {
    if (obj !== undefined) {
      return attribute.required && !options.isDraft
        ? componentFieldSchema.defined()
        : componentFieldSchema.nullable();
    }

    return attribute.required ? yup.object().defined() : yup.object().nullable();
  });

  return componentSchema;
};

const addMinValidation = (baseSchema, min, required, options, value) => {
  if (required) {
    return baseSchema.min(min, errorsTrads.min);
  } else if (required !== true && isEmpty(value)) {
    return baseSchema.nullable();
  } else {
    return baseSchema.min(min, errorsTrads.min);
  }
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

  if (attribute.required && !options.isDraft) {
    dynamicZoneSchema = addRequiredValidation(dynamicZoneSchema, attribute, options);
  } else {
    dynamicZoneSchema = addMinValidationForNonRequired(dynamicZoneSchema, attribute);
  }

  if (attribute.max) {
    dynamicZoneSchema = dynamicZoneSchema.max(attribute.max, errorsTrads.max);
  }

  return dynamicZoneSchema;
};

const addRequiredValidation = (dynamicZoneSchema, attribute, options) => {
  dynamicZoneSchema = dynamicZoneSchema.test('required', errorsTrads.required, value => {
    if (options.isCreatingEntry) {
      return value !== null || value !== undefined;
    }

    if (value === undefined) {
      return true;
    }

    return value !== null;
  });

  if (attribute.min) {
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

  return dynamicZoneSchema;
};

const addMinValidationForNonRequired = (dynamicZoneSchema, attribute) => {
  if (attribute.min) {
    dynamicZoneSchema = dynamicZoneSchema.notEmptyMin(attribute.min);
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

  if (type === 'biginteger') {
    schema = yup.string().matches(/^\d*$/);
  }

  Object.keys(validations).forEach(validation => {
    const validationValue = validations[validation];

    if (isValidValidation(validationValue)) {
      schema = addValidation(schema, type, validation, validationValue, options);
    }
  });

  return schema;
};

const isStringType = type =>
  ['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type);

const isNumberType = type =>
  ['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type);

const isDateType = type => ['date', 'datetime'].includes(type);

const isValidValidation = validationValue =>
  !!validationValue ||
  (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
  validationValue === 0;

const addValidation = (schema, type, validation, validationValue, options) => {
  switch (validation) {
    case 'required':
      return addRequiredValidationToSchema(schema, type, options);
    case 'max':
      return addMaxValidationToSchema(schema, type, validationValue);
    case 'maxLength':
      return schema.max(validationValue, errorsTrads.maxLength);
    case 'min':
      return addMinValidationToSchema(schema, type, validationValue);
    case 'minLength':
      return addMinLengthValidationToSchema(schema, type, validationValue, options);
    case 'regex':
      return schema.matches(new RegExp(validationValue), errorsTrads.regex);
    case 'lowercase':
      return addCaseValidationToSchema(schema, type, 'lowercase');
    case 'uppercase':
      return addCaseValidationToSchema(schema, type, 'uppercase');
    case 'positive':
      return addSignValidationToSchema(schema, type, 'positive');
    case 'negative':
      return addSignValidationToSchema(schema, type, 'negative');
    default:
      return schema.nullable();
  }
};

const addRequiredValidationToSchema = (schema, type, options) => {
  if (!options.isDraft) {
    if (type === 'password' && options.isCreatingEntry) {
      return schema.required(errorsTrads.required);
    }

    if (type !== 'password') {
      if (options.isCreatingEntry) {
        return schema.required(errorsTrads.required);
      } else {
        return schema.test('required', errorsTrads.required, value => {
          if (value === undefined && !options.isFromComponent) {
            return true;
          }

          if (isNumberType(type)) {
            return value === 0 || !!value;
          }

          if (isDateType(type)) {
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

  return schema;
};

const addMaxValidationToSchema = (schema, type, validationValue) => {
  if (type === 'biginteger') {
    return schema.isInferior(errorsTrads.max, validationValue);
  } else {
    return schema.max(validationValue, errorsTrads.max);
  }
};

const addMinValidationToSchema = (schema, type, validationValue) => {
  if (type === 'biginteger') {
    return schema.isSuperior(errorsTrads.min, validationValue);
  } else {
    return schema.min(validationValue, errorsTrads.min);
  }
};

const addMinLengthValidationToSchema = (schema, type, validationValue, options) => {
  if (!options.isDraft) {
    return schema.min(validationValue, errorsTrads.minLength);
  }

  return schema;
};

const addCaseValidationToSchema = (schema, type, caseType) => {
  if (['text', 'textarea', 'email', 'string'].includes(type)) {
    return schema.strict()[caseType]();
  }

  return schema;
};

const addSignValidationToSchema = (schema, type, sign) => {
  if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
    return schema[sign]();
  }

  return schema;
};

export default createYupSchema;
```