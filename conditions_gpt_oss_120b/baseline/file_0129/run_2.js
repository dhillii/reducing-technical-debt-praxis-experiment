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

yup.addMethod(yup.mixed, 'defined', function () {
  return this.test('defined', errorsTrads.required, (value) => value !== undefined);
});

yup.addMethod(yup.array, 'notEmptyMin', function (min) {
  return this.test('notEmptyMin', errorsTrads.min, (value) => (isEmpty(value) ? true : value.length >= min));
});

yup.addMethod(yup.string, 'isInferior', function (message, max) {
  return this.test('isInferior', message, (value) => {
    if (!value || Number.isNaN(toNumber(value))) return true;
    return toNumber(max) >= toNumber(value);
  });
});

yup.addMethod(yup.string, 'isSuperior', function (message, min) {
  return this.test('isSuperior', message, (value) => {
    if (!value || Number.isNaN(toNumber(value))) return true;
    return toNumber(value) >= toNumber(min);
  });
});

const getAttributes = (data) => get(data, ['attributes'], {});

const createRelationSchema = (relation) => {
  const oneWayTypes = ['oneWay', 'oneToOne', 'manyToOne', 'oneToManyMorph', 'oneToOneMorph'];
  return oneWayTypes.includes(relation.relationType) ? yup.object().nullable() : yup.array().nullable();
};

const createComponentSchema = (attribute, componentDef, components, options) => {
  const componentFieldSchema = createYupSchema(componentDef, { components }, { ...options, isFromComponent: true });

  if (attribute.repeatable) {
    const { min, max, required } = attribute;
    return yup.lazy((value) => {
      let schema = yup.array().of(componentFieldSchema);
      if (min && !options.isDraft) {
        schema = required ? schema.min(min, errorsTrads.min) : schema.min(min, errorsTrads.min);
        if (!required && isEmpty(value)) schema = schema.nullable();
      }
      if (max) schema = schema.max(max, errorsTrads.max);
      return schema;
    });
  }

  return yup.lazy((obj) => {
    if (obj !== undefined) {
      return attribute.required && !options.isDraft ? componentFieldSchema.defined() : componentFieldSchema.nullable();
    }
    return attribute.required ? yup.object().defined() : yup.object().nullable();
  });
};

const createDynamicZoneSchema = (attribute, components, options) => {
  let schema = yup.array().of(
    yup.lazy(({ __component }) =>
      createYupSchema(components[__component], { components }, { ...options, isFromComponent: true })
    )
  );

  const { min, max, required } = attribute;

  if (required && !options.isDraft) {
    schema = schema.test('required', errorsTrads.required, (value) => {
      if (options.isCreatingEntry) return value !== null && value !== undefined;
      if (value === undefined) return true;
      return value !== null;
    });

    if (min) {
      schema = schema
        .test('min', errorsTrads.min, (value) => {
          if (options.isCreatingEntry) return value && value.length > 0;
          if (value === undefined) return true;
          return value !== null && value.length > 0;
        })
        .test('required', errorsTrads.required, (value) => {
          if (options.isCreatingEntry) return value !== null && value !== undefined;
          if (value === undefined) return true;
          return value !== null;
        });
    }
  } else if (min) {
    schema = schema.notEmptyMin(min);
  }

  if (max) schema = schema.max(max, errorsTrads.max);
  return schema;
};

const processAttribute = (key, attribute, components, options) => {
  if (['relation', 'component', 'dynamiczone'].includes(attribute.type)) {
    if (attribute.type === 'relation') return { [key]: createRelationSchema(attribute) };
    if (attribute.type === 'component')
      return { [key]: createComponentSchema(attribute, components[attribute.component], components, options) };
    if (attribute.type === 'dynamiczone')
      return { [key]: createDynamicZoneSchema(attribute, components, options) };
  }

  const schema = createYupSchemaAttribute(attribute.type, attribute, options);
  return { [key]: schema };
};

export const createYupSchema = (
  model,
  { components },
  options = { isCreatingEntry: true, isDraft: true, isFromComponent: false }
) => {
  const attributes = getAttributes(model);
  const shape = Object.entries(attributes).reduce((acc, [key, attribute]) => {
    return { ...acc, ...processAttribute(key, attribute, components, options) };
  }, {});
  return yup.object().shape(shape);
};

const createYupSchemaAttribute = (type, validations, options) => {
  let schema = yup.mixed();

  if (['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type)) {
    schema = yup.string();
  }

  if (type === 'json') {
    schema = yup
      .mixed(errorsTrads.json)
      .test('isJSON', errorsTrads.json, (value) => {
        if (value === undefined) return true;
        if (isNumber(value) || isNull(value) || isObject(value) || isArray(value)) return true;
        try {
          JSON.parse(value);
          return true;
        } catch {
          return false;
        }
      })
      .nullable();
  }

  if (type === 'email') schema = schema.email(errorsTrads.email);
  if (['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type))
    schema = yup.number().transform((cv) => (isNaN(cv) ? undefined : cv)).typeError();
  if (['date', 'datetime'].includes(type)) schema = yup.date();
  if (type === 'biginteger') schema = yup.string().matches(/^\d*$/);

  Object.entries(validations).forEach(([validation, value]) => {
    const shouldApply =
      !!value ||
      (!isBoolean(value) && Number.isInteger(Math.floor(value))) ||
      value === 0;

    if (!shouldApply) return;

    switch (validation) {
      case 'required':
        if (!options.isDraft) {
          if (type === 'password' && options.isCreatingEntry) {
            schema = schema.required(errorsTrads.required);
          } else if (type !== 'password') {
            if (options.isCreatingEntry) {
              schema = schema.required(errorsTrads.required);
            } else {
              schema = schema.test('required', errorsTrads.required, (val) => {
                if (val === undefined && !options.isFromComponent) return true;
                if (['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type))
                  return val === 0 || !!val;
                if (['date', 'datetime'].includes(type)) return moment(val)._isValid === true;
                if (type === 'boolean') return val !== null;
                return !isEmpty(val);
              });
            }
          }
        }
        break;

      case 'max':
        schema = type === 'biginteger' ? schema.isInferior(errorsTrads.max, value) : schema.max(value, errorsTrads.max);
        break;

      case 'maxLength':
        schema = schema.max(value, errorsTrads.maxLength);
        break;

      case 'min':
        schema = type === 'biginteger' ? schema.isSuperior(errorsTrads.min, value) : schema.min(value, errorsTrads.min);
        break;

      case 'minLength':
        if (!options.isDraft) schema = schema.min(value, errorsTrads.minLength);
        break;

      case 'regex':
        schema = schema.matches(new RegExp(value), errorsTrads.regex);
        break;

      case 'lowercase':
        if (['text', 'textarea', 'email', 'string'].includes(type)) schema = schema.strict().lowercase();
        break;

      case 'uppercase':
        if (['text', 'textarea', 'email', 'string'].includes(type)) schema = schema.strict().uppercase();
        break;

      case 'positive':
        if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) schema = schema.positive();
        break;

      case 'negative':
        if (['number', 'integer', 'bigint', 'float', 'decimal'].includes(type)) schema = schema.negative();
        break;

      default:
        schema = schema.nullable();
    }
  });

  return schema;
};

export default createYupSchema;