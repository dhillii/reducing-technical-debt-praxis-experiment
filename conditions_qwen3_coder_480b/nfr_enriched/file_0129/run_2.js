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

const createRelationSchema = (attribute) => {
  return [
    'oneWay',
    'oneToOne',
    'manyToOne',
    'oneToManyMorph',
    'oneToOneMorph',
  ].includes(attribute.relationType)
    ? yup.object().nullable()
    : yup.array().nullable();
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

const addStringValidations = (schema, type, validations, options) => {
  let updatedSchema = schema;

  if (type === 'email') {
    updatedSchema = updatedSchema.email(errorsTrads.email);
  }

  if (validations.lowercase && ['text', 'textarea', 'email', 'string'].includes(type)) {
    updatedSchema = updatedSchema.strict().lowercase();
  }

  if (validations.uppercase && ['text', 'textarea', 'email', 'string'].includes(type)) {
    updatedSchema = updatedSchema.strict().uppercase();
  }

  return updatedSchema;
};

const addNumberValidations = (schema, type, validations) => {
  let updatedSchema = schema;

  if (validations.positive && ['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
    updatedSchema = updatedSchema.positive();
  }

  if (validations.negative && ['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) {
    updatedSchema = updatedSchema.negative();
  }

  return updatedSchema;
};

const handleRequiredValidation = (schema, type, validations, options) => {
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

const handleMaxValidation = (schema, type, validationValue) => {
  if (type === 'biginteger') {
    return schema.isInferior(errorsTrads.max, validationValue);
  } else {
    return schema.max(validationValue, errorsTrads.max);
  }
};

const handleMinValidation = (schema, type, validationValue) => {
  if (type === 'biginteger') {
    return schema.isSuperior(errorsTrads.min, validationValue);
  } else {
    return schema.min(validationValue, errorsTrads.min);
  }
};

const applyAttributeValidations = (schema, type, validations, options) => {
  let updatedSchema = schema;

  Object.keys(validations).forEach(validation => {
    const validationValue = validations[validation];

    if (
      !!validationValue ||
      (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
      validationValue === 0
    ) {
      switch (validation) {
        case 'required': {
          updatedSchema = handleRequiredValidation(updatedSchema, type, validations, options);
          break;
        }

        case 'max': {
          updatedSchema = handleMaxValidation(updatedSchema, type, validationValue);
          break;
        }
        case 'maxLength':
          updatedSchema = updatedSchema.max(validationValue, errorsTrads.maxLength);
          break;
        case 'min': {
          updatedSchema = handleMinValidation(updatedSchema, type, validationValue);
          break;
        }
        case 'minLength': {
          if (!options.isDraft) {
            updatedSchema = updatedSchema.min(validationValue, errorsTrads.minLength);
          }
          break;
        }
        case 'regex':
          updatedSchema = updatedSchema.matches(new RegExp(validationValue), errorsTrads.regex);
          break;
        default:
          updatedSchema = updatedSchema.nullable();
      }
    }
  });

  return addStringValidations(addNumberValidations(updatedSchema, type, validations), type, validations, options);
};

const createBasicAttributeSchema = (type) => {
  if (['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type)) {
    return yup.string();
  }

  if (type === 'json') {
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
  }

  if (['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type)) {
    return yup
      .number()
      .transform(cv => (isNaN(cv) ? undefined : cv))
      .typeError();
  }

  if (['date', 'datetime'].includes(type)) {
    return yup.date();
  }

  if (type === 'biginteger') {
    return yup.string().matches(/^\d*$/);
  }

  if (type === 'boolean') {
    return yup.boolean();
  }

  return yup.mixed();
};

const createYupSchemaAttribute = (type, validations, options) => {
  const basicSchema = createBasicAttributeSchema(type);
  return applyAttributeValidations(basicSchema, type, validations, options);
};

const processModelAttribute = (acc, current, attribute, model, components, options) => {
  if (
    attribute.type !== 'relation' &&
    attribute.type !== 'component' &&
    attribute.type !== 'dynamiczone'
  ) {
    const formatted = createYupSchemaAttribute(attribute.type, attribute, options);
    acc[current] = formatted;
  }

  if (attribute.type === 'relation') {
    acc[current] = createRelationSchema(attribute);
  }

  if (attribute.type === 'component') {
    const componentFieldSchema = createYupSchema(
      components[attribute.component],
      {
        components,
      },
      { ...options, isFromComponent: true }
    );

    if (attribute.repeatable === true) {
      acc[current] = createRepeatableComponentSchema(attribute, componentFieldSchema, options);
    } else {
      acc[current] = createNonRepeatableComponentSchema(attribute, componentFieldSchema, options);
    }
  }

  if (attribute.type === 'dynamiczone') {
    acc[current] = createDynamicZoneSchema(attribute, components, options);
  }

  return acc;
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
      return processModelAttribute(acc, current, attribute, model, components, options);
    }, {})
  );
};

export default createYupSchema;