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

const createYupSchema = (model, { components }, options = { isCreatingEntry: true, isDraft: true, isFromComponent: false }) => {
  const attributes = getAttributes(model);
  const shape = Object.keys(attributes).reduce((acc, key) => {
    acc[key] = buildAttributeSchema(key, attributes[key], components, options);
    return acc;
  }, {});
  return yup.object().shape(shape);
};

const buildAttributeSchema = (key, attribute, components, options) => {
  const { type } = attribute;

  if (type === 'relation') return buildRelationSchema(attribute);
  if (type === 'component') return buildComponentSchema(attribute, components, options);
  if (type === 'dynamiczone') return buildDynamicZoneSchema(attribute, components, options);

  // Simple scalar attribute
  return createYupSchemaAttribute(type, attribute, options);
};

const buildRelationSchema = (attribute) => {
  const oneWayTypes = ['oneWay', 'oneToOne', 'manyToOne', 'oneToManyMorph', 'oneToOneMorph'];
  return oneWayTypes.includes(attribute.relationType) ? yup.object().nullable() : yup.array().nullable();
};

const buildComponentSchema = (attribute, components, options) => {
  const componentFieldSchema = createYupSchema(components[attribute.component], { components }, { ...options, isFromComponent: true });

  if (attribute.repeatable) {
    return yup.lazy((value) => {
      let schema = yup.array().of(componentFieldSchema);
      if (attribute.min && !options.isDraft) {
        schema = attribute.required ? schema.min(attribute.min, errorsTrads.min) : schema.min(attribute.min, errorsTrads.min);
        if (!attribute.required && isEmpty(value)) schema = schema.nullable();
      }
      if (attribute.max) schema = schema.max(attribute.max, errorsTrads.max);
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

const buildDynamicZoneSchema = (attribute, components, options) => {
  let schema = yup.array().of(
    yup.lazy(({ __component }) =>
      createYupSchema(components[__component], { components }, { ...options, isFromComponent: true })
    )
  );

  if (attribute.max) schema = schema.max(attribute.max, errorsTrads.max);
  if (attribute.min) schema = attribute.required ? schema.notEmptyMin(attribute.min) : schema.notEmptyMin(attribute.min);

  if (attribute.required && !options.isDraft) {
    schema = schema.test('required', errorsTrads.required, (value) => {
      if (options.isCreatingEntry) return value !== null && value !== undefined;
      if (value === undefined) return true;
      return value !== null;
    });
  }

  return schema;
};

const createYupSchemaAttribute = (type, validations, options) => {
  let schema = getBaseSchema(type);

  Object.entries(validations).forEach(([validation, validationValue]) => {
    if (!shouldApplyValidation(validationValue)) return;

    switch (validation) {
      case 'required':
        schema = applyRequired(schema, type, options);
        break;
      case 'max':
        schema = type === 'biginteger' ? schema.isInferior(errorsTrads.max, validationValue) : schema.max(validationValue, errorsTrads.max);
        break;
      case 'maxLength':
        schema = schema.max(validationValue, errorsTrads.maxLength);
        break;
      case 'min':
        schema = type === 'biginteger' ? schema.isSuperior(errorsTrads.min, validationValue) : schema.min(validationValue, errorsTrads.min);
        break;
      case 'minLength':
        if (!options.isDraft) schema = schema.min(validationValue, errorsTrads.minLength);
        break;
      case 'regex':
        schema = schema.matches(new RegExp(validationValue), errorsTrads.regex);
        break;
      case 'lowercase':
        if (['text', 'textarea', 'email', 'string'].includes(type)) schema = schema.strict().lowercase();
        break;
      case 'uppercase':
        if (['text', 'textarea', 'email', 'string'].includes(type)) schema = schema.strict().uppercase();
        break;
      case 'positive':
        if (['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type)) schema = schema.positive();
        break;
      case 'negative':
        if (['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type)) schema = schema.negative();
        break;
      default:
        schema = schema.nullable();
    }
  });

  return schema;
};

const getBaseSchema = (type) => {
  if (['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type)) return yup.string();
  if (type === 'json')
    return yup
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
  if (type === 'email') return yup.string().email(errorsTrads.email);
  if (['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type))
    return yup
      .number()
      .transform((cv) => (isNaN(cv) ? undefined : cv))
      .typeError();
  if (['date', 'datetime'].includes(type)) return yup.date();
  if (type === 'biginteger') return yup.string().matches(/^\d*$/);
  return yup.mixed();
};

const shouldApplyValidation = (value) => {
  return !!value || (!isBoolean(value) && Number.isInteger(Math.floor(value))) || value === 0;
};

const applyRequired = (schema, type, options) => {
  if (options.isDraft) return schema;
  if (type === 'password' && options.isCreatingEntry) return schema.required(errorsTrads.required);
  if (type !== 'password') {
    if (options.isCreatingEntry) return schema.required(errorsTrads.required);
    return schema.test('required', errorsTrads.required, (value) => {
      if (value === undefined && !options.isFromComponent) return true;
      if (['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type)) return value === 0 || !!value;
      if (['date', 'datetime'].includes(type)) return moment(value)._isValid === true;
      if (type === 'boolean') return value !== null;
      return !isEmpty(value);
    });
  }
  return schema;
};

export default createYupSchema;