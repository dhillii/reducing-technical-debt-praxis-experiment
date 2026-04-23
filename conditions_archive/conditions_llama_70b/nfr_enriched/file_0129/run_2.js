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

      acc[current] = createYupSchemaAttribute(attribute.type, attribute, options);

      if (attribute.type === 'relation') {
        acc[current] = createRelationSchema(attribute.relationType);
      }

      if (attribute.type === 'component') {
        acc[current] = createComponentSchema(attribute, components, options);
      }

      if (attribute.type === 'dynamiczone') {
        acc[current] = createDynamicZoneSchema(attribute, components, options);
      }

      return acc;
    }, {})
  );
};

const createYupSchemaAttribute = (type, validations, options) => {
  let schema = yup.mixed();

  schema = createTypeSchema(type, schema);

  schema = createValidationSchema(type, validations, options, schema);

  return schema;
};

const createTypeSchema = (type, schema) => {
  switch (type) {
    case 'string':
    case 'uid':
    case 'text':
    case 'richtext':
    case 'email':
    case 'password':
    case 'enumeration':
      return yup.string();
    case 'json':
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
    case 'email':
      return schema.email(errorsTrads.email);
    case 'number':
    case 'integer':
    case 'biginteger':
    case 'float':
    case 'decimal':
      return yup
        .number()
        .transform(cv => (isNaN(cv) ? undefined : cv))
        .typeError();
    case 'date':
    case 'datetime':
      return yup.date();
    case 'biginteger':
      return yup.string().matches(/^\d*$/);
    default:
      return schema;
  }
};

const createValidationSchema = (type, validations, options, schema) => {
  Object.keys(validations).forEach(validation => {
    const validationValue = validations[validation];

    if (
      !!validationValue ||
      (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
      validationValue === 0
    ) {
      schema = createValidationRule(type, validation, validationValue, options, schema);
    }
  });

  return schema;
};

const createValidationRule = (type, validation, validationValue, options, schema) => {
  switch (validation) {
    case 'required':
      return createRequiredRule(type, options, schema);
    case 'max':
      return createMaxRule(type, validationValue, schema);
    case 'maxLength':
      return schema.max(validationValue, errorsTrads.maxLength);
    case 'min':
      return createMinRule(type, validationValue, schema);
    case 'minLength':
      return createMinLengthRule(type, validationValue, options, schema);
    case 'regex':
      return schema.matches(new RegExp(validationValue), errorsTrads.regex);
    case 'lowercase':
      return createCaseRule(type, 'lowercase', schema);
    case 'uppercase':
      return createCaseRule(type, 'uppercase', schema);
    case 'positive':
      return createSignRule(type, 'positive', schema);
    case 'negative':
      return createSignRule(type, 'negative', schema);
    default:
      return schema.nullable();
  }
};

const createRequiredRule = (type, options, schema) => {
  if (!options.isDraft) {
    if (type === 'password' && options.isCreatingEntry) {
      return schema.required(errorsTrads.required);
    }

    if (type !== 'password') {
      if (options.isCreatingEntry) {
        return schema.required(errorsTrads.required);
      } else {
        return schema.test('required', errorsTrads.required, value => {
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

  return schema;
};

const createMaxRule = (type, max, schema) => {
  if (type === 'biginteger') {
    return schema.isInferior(errorsTrads.max, max);
  } else {
    return schema.max(max, errorsTrads.max);
  }
};

const createMinRule = (type, min, schema) => {
  if (type === 'biginteger') {
    return schema.isSuperior(errorsTrads.min, min);
  } else {
    return schema.min(min, errorsTrads.min);
  }
};

const createMinLengthRule = (type, min, options, schema) => {
  if (!options.isDraft) {
    return schema.min(min, errorsTrads.minLength);
  }

  return schema;
};

const createCaseRule = (type, caseType, schema) => {
  if (['text', 'textarea', 'email', 'string'].includes(type)) {
    return schema.strict()[caseType]();
  }

  return schema;
};

const createSignRule = (type, sign, schema) => {
  if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
    return schema[sign]();
  }

  return schema;
};

const createRelationSchema = relationType => {
  return [
    'oneWay',
    'oneToOne',
    'manyToOne',
    'oneToManyMorph',
    'oneToOneMorph',
  ].includes(relationType)
    ? yup.object().nullable()
    : yup.array().nullable();
};

const createComponentSchema = (attribute, components, options) => {
  const componentFieldSchema = createYupSchema(
    components[attribute.component],
    {
      components,
    },
    { ...options, isFromComponent: true }
  );

  if (attribute.repeatable === true) {
    return createRepeatableComponentSchema(attribute, componentFieldSchema, options);
  }

  return createNonRepeatableComponentSchema(attribute, componentFieldSchema, options);
};

const createRepeatableComponentSchema = (attribute, componentFieldSchema, options) => {
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
};

const createNonRepeatableComponentSchema = (attribute, componentFieldSchema, options) => {
  const componentSchema = yup.lazy(obj => {
    if (obj !== undefined) {
      return attribute.required === true && !options.isDraft
        ? componentFieldSchema.defined()
        : componentFieldSchema.nullable();
    }

    return attribute.required === true ? yup.object().defined() : yup.object().nullable();
  });

  return componentSchema;
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
    dynamicZoneSchema = createRequiredDynamicZoneSchema(dynamicZoneSchema, options, min);
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

const createRequiredDynamicZoneSchema = (dynamicZoneSchema, options, min) => {
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

  return dynamicZoneSchema;
};

export default createYupSchema;
```