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

const createYupSchemaAttribute = (type, validations, options) => {
  let schema = yup.mixed();

  if (['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type)) {
    schema = yup.string();
  }

  if (type === 'json') {
    schema = createJsonSchema();
  }

  if (type === 'email') {
    schema = schema.email(errorsTrads.email);
  }

  if (['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type)) {
    schema = createNumberSchema();
  }

  if (['date', 'datetime'].includes(type)) {
    schema = yup.date();
  }

  if (type === 'biginteger') {
    schema = yup.string().matches(/^\d*$/);
  }

  applyValidations(schema, validations, type, options);

  return schema;
};

const createJsonSchema = () => {
  return yup
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
};

const createNumberSchema = () => {
  return yup
    .number()
    .transform(cv => (isNaN(cv) ? undefined : cv))
    .typeError();
};

const applyValidations = (schema, validations, type, options) => {
  Object.keys(validations).forEach(validation => {
    const validationValue = validations[validation];

    if (
      !!validationValue ||
      (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
      validationValue === 0
    ) {
      applyValidation(schema, validation, validationValue, type, options);
    }
  });
};

const applyValidation = (schema, validation, validationValue, type, options) => {
  switch (validation) {
    case 'required': {
      applyRequiredValidation(schema, type, options);
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
};

const applyRequiredValidation = (schema, type, options) => {
  if (!options.isDraft) {
    if (type === 'password' && options.isCreatingEntry) {
      schema = schema.required(errorsTrads.required);
    }

    if (type !== 'password') {
      if (options.isCreatingEntry) {
        schema = schema.required(errorsTrads.required);
      } else {
        schema = createRequiredTest(schema, type, options);
      }
    }
  }
};

const createRequiredTest = (schema, type, options) => {
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
};

const handleRelationAttribute = (attribute) => {
  const isMorphRelation = [
    'oneToOneMorph',
    'oneToManyMorph',
  ].includes(attribute.relationType);

  const isOneWayRelation = [
    'oneWay',
    'oneToOne',
    'manyToOne',
    'oneToManyMorph',
    'oneToOneMorph',
  ].includes(attribute.relationType);

  if (isMorphRelation) {
    return yup.object().nullable();
  }

  return yup.array().nullable();
};

const handleComponentAttribute = (attribute, components, options) => {
  const componentSchema = createYupSchema(
    components[attribute.component],
    { components },
    { ...options, isFromComponent: true }
  );

  if (attribute.repeatable === true) {
    return createRepeatableComponentSchema(componentSchema, attribute, options);
  }

  return createSingleComponentSchema(componentSchema, attribute, options);
};

const createRepeatableComponentSchema = (componentSchema, attribute, options) => {
  const { min, max, required } = attribute;

  let baseSchema = yup.array().of(componentSchema);

  if (min && !options.isDraft) {
    if (required) {
      baseSchema = baseSchema.min(min, errorsTrads.min);
    } else if (required !== true && isEmpty(componentSchema)) {
      baseSchema = baseSchema.nullable();
    } else {
      baseSchema = baseSchema.min(min, errorsTrads.min);
    }
  }

  if (max) {
    baseSchema = baseSchema.max(max, errorsTrads.max);
  }

  return yup.lazy(value => baseSchema);
};

const createSingleComponentSchema = (componentSchema, attribute, options) => {
  return yup.lazy(obj => {
    if (obj !== undefined) {
      return attribute.required === true && !options.isDraft
        ? componentSchema.defined()
        : componentSchema.nullable();
    }

    return attribute.required === true ? yup.object().defined() : yup.object().nullable();
  });
};

const handleDynamicZoneAttribute = (attribute, components, options) => {
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
    dynamicZoneSchema = createRequiredDynamicZoneValidation(dynamicZoneSchema, options);

    if (min) {
      dynamicZoneSchema = createMinDynamicZoneValidation(dynamicZoneSchema, min, options);
    }
  } else if (min) {
    dynamicZoneSchema = dynamicZoneSchema.notEmptyMin(min);
  }

  if (max) {
    dynamicZoneSchema = dynamicZoneSchema.max(max, errorsTrads.max);
  }

  return dynamicZoneSchema;
};

const createRequiredDynamicZoneValidation = (dynamicZoneSchema, options) => {
  return dynamicZoneSchema.test('required', errorsTrads.required, value => {
    if (options.isCreatingEntry) {
      return value !== null || value !== undefined;
    }

    if (value === undefined) {
      return true;
    }

    return value !== null;
  });
};

const createMinDynamicZoneValidation = (dynamicZoneSchema, min, options) => {
  return dynamicZoneSchema
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

      if (attribute.type === 'relation') {
        acc[current] = handleRelationAttribute(attribute);
      } else if (attribute.type === 'component') {
        acc[current] = handleComponentAttribute(attribute, components, options);
      } else if (attribute.type === 'dynamiczone') {
        acc[current] = handleDynamicZoneAttribute(attribute, components, options);
      } else {
        const formatted = createYupSchemaAttribute(attribute.type, attribute, options);
        acc[current] = formatted;
      }

      return acc;
    }, {})
  );
};

export default createYupSchema;
```