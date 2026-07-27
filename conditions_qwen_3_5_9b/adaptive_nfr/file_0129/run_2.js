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

const isRelationType = type =>
  type === 'relation' || type === 'component' || type === 'dynamiczone';

const isScalarType = type =>
  type === 'string' ||
  type === 'uid' ||
  type === 'text' ||
  type === 'richtext' ||
  type === 'email' ||
  type === 'password' ||
  type === 'enumeration';

const isNumericType = type =>
  type === 'number' ||
  type === 'integer' ||
  type === 'biginteger' ||
  type === 'float' ||
  type === 'decimal';

const isDateType = type => type === 'date' || type === 'datetime';

const isBigIntType = type => type === 'biginteger';

const isTextType = type =>
  type === 'text' || type === 'textarea' || type === 'email' || type === 'string';

const isNumericValidationType = type =>
  type === 'number' ||
  type === 'integer' ||
  type === 'biginteger' ||
  type === 'float' ||
  type === 'decimal';

const isBooleanValidationType = type => type === 'boolean';

const shouldRequireField = (type, options) => {
  if (!options.isDraft) {
    if (type === 'password' && options.isCreatingEntry) {
      return true;
    }

    if (type !== 'password') {
      if (options.isCreatingEntry) {
        return true;
      }

      return false;
    }
  }

  return false;
};

const shouldValidateRequired = (type, options) => {
  if (!options.isDraft) {
    if (type === 'password' && options.isCreatingEntry) {
      return true;
    }

    if (type !== 'password') {
      if (options.isCreatingEntry) {
        return true;
      }

      return false;
    }
  }

  return false;
};

const validateRequiredField = (type, value, options) => {
  if (value === undefined && !options.isFromComponent) {
    return true;
  }

  if (isNumericValidationType(type)) {
    if (value === 0) {
      return true;
    }

    return !!value;
  }

  if (isDateType(type)) {
    return moment(value)._isValid === true;
  }

  if (isBooleanValidationType(type)) {
    return value !== null;
  }

  return !isEmpty(value);
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

      if (isRelationType(attribute.type)) {
        return handleRelationOrComponentOrDynamicZone(acc, current, attribute, components, options);
      }

      const formatted = createYupSchemaAttribute(attribute.type, attribute, options);
      acc[current] = formatted;

      return acc;
    }, {})
  );
};

const handleRelationOrComponentOrDynamicZone = (acc, current, attribute, components, options) => {
  if (attribute.type === 'relation') {
    const isMorphRelation =
      attribute.relationType === 'oneToManyMorph' || attribute.relationType === 'oneToOneMorph';

    acc[current] = isMorphRelation
      ? yup.array().nullable()
      : attribute.relationType === 'oneToOne'
      ? yup.object().nullable()
      : yup.array().nullable();

    return acc;
  }

  if (attribute.type === 'component') {
    const componentSchema = createYupSchema(
      components[attribute.component],
      {
        components,
      },
      { ...options, isFromComponent: true }
    );

    if (attribute.repeatable === true) {
      return handleRepeatableComponent(acc, current, attribute, componentSchema, options);
    }

    return handleNonRepeatableComponent(acc, current, attribute, componentSchema, options);
  }

  if (attribute.type === 'dynamiczone') {
    return handleDynamicZone(acc, current, attribute, components, options);
  }

  return acc;
};

const handleRepeatableComponent = (acc, current, attribute, componentSchema, options) => {
  const { min, max, required } = attribute;
  let baseSchema = yup.array().of(componentSchema);

  if (min && !options.isDraft) {
    if (required) {
      baseSchema = baseSchema.min(min, errorsTrads.min);
    } else if (required !== true && isEmpty(undefined)) {
      baseSchema = baseSchema.nullable();
    } else {
      baseSchema = baseSchema.min(min, errorsTrads.min);
    }
  }

  if (max) {
    baseSchema = baseSchema.max(max, errorsTrads.max);
  }

  acc[current] = yup.lazy(value => baseSchema);

  return acc;
};

const handleNonRepeatableComponent = (acc, current, attribute, componentSchema, options) => {
  const componentSchemaLazy = yup.lazy(obj => {
    if (obj !== undefined) {
      return attribute.required === true && !options.isDraft
        ? componentSchema.defined()
        : componentSchema.nullable();
    }

    return attribute.required === true ? yup.object().defined() : yup.object().nullable();
  });

  acc[current] = componentSchemaLazy;

  return acc;
};

const handleDynamicZone = (acc, current, attribute, components, options) => {
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

  return acc;
};

const createYupSchemaAttribute = (type, validations, options) => {
  let schema = yup.mixed();

  if (isScalarType(type)) {
    schema = yup.string();
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

  if (isNumericType(type)) {
    schema = schema
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

  Object.keys(validations).forEach(validation => {
    const validationValue = validations[validation];

    if (
      !!validationValue ||
      (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
      validationValue === 0
    ) {
      switch (validation) {
        case 'required': {
          if (shouldRequireField(type, options)) {
            if (type === 'password' && options.isCreatingEntry) {
              schema = schema.required(errorsTrads.required);
            }

            if (type !== 'password') {
              if (options.isCreatingEntry) {
                schema = schema.required(errorsTrads.required);
              } else {
                schema = schema.test('required', errorsTrads.required, value => validateRequiredField(type, value, options));
              }
            }
          }

          break;
        }

        case 'max': {
          if (isBigIntType(type)) {
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
          if (isBigIntType(type)) {
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
          if (isTextType(type)) {
            schema = schema.strict().lowercase();
          }
          break;
        case 'uppercase':
          if (isTextType(type)) {
            schema = schema.strict().uppercase();
          }
          break;
        case 'positive':
          if (isNumericValidationType(type)) {
            schema = schema.positive();
          }
          break;
        case 'negative':
          if (isNumericValidationType(type)) {
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