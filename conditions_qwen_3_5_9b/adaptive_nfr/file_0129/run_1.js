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

const isRelationType = (type) => ['relation', 'component', 'dynamiczone'].includes(type);

const isStringType = (type) =>
  ['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type);

const isNumberType = (type) =>
  ['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type);

const isDateType = (type) => ['date', 'datetime'].includes(type);

const isBigIntType = (type) => type === 'biginteger';

const isRepeatableComponent = (attribute) => attribute.repeatable === true;

const isRequiredValidation = (validationValue) =>
  !!validationValue ||
  (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) ||
  validationValue === 0;

const isCreatingEntry = (options) => options.isCreatingEntry;

const isDraftMode = (options) => options.isDraft;

const isFromComponent = (options) => options.isFromComponent;

const isPasswordType = (type) => type === 'password';

const isNumberField = (type) =>
  ['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type);

const isDateField = (type) => ['date', 'datetime'].includes(type);

const isBooleanField = (type) => type === 'boolean';

const isTextField = (type) =>
  ['text', 'textarea', 'email', 'string'].includes(type);

const isNumericField = (type) =>
  ['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type);

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

  if (isBigIntType(type)) {
    schema = yup.string().matches(/^\d*$/);
  }

  Object.keys(validations).forEach(validation => {
    const validationValue = validations[validation];

    if (isRequiredValidation(validationValue)) {
      switch (validation) {
        case 'required': {
          if (!isDraftMode(options)) {
            if (isPasswordType(type) && isCreatingEntry(options)) {
              schema = schema.required(errorsTrads.required);
            }

            if (!isPasswordType(type)) {
              if (isCreatingEntry(options)) {
                schema = schema.required(errorsTrads.required);
              } else {
                schema = schema.test('required', errorsTrads.required, value => {
                  if (value === undefined && !isFromComponent(options)) {
                    return true;
                  }

                  if (isNumberField(type)) {
                    if (value === 0) {
                      return true;
                    }

                    return !!value;
                  }

                  if (isDateField(type)) {
                    return moment(value)._isValid === true;
                  }

                  if (isBooleanField(type)) {
                    return value !== null;
                  }

                  return !isEmpty(value);
                });
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
          if (!isDraftMode(options)) {
            schema = schema.min(validationValue, errorsTrads.minLength);
          }

          break;
        }

        case 'regex':
          schema = schema.matches(new RegExp(validationValue), errorsTrads.regex);

          break;

        case 'lowercase':
          if (isTextField(type)) {
            schema = schema.strict().lowercase();
          }

          break;

        case 'uppercase':
          if (isTextField(type)) {
            schema = schema.strict().uppercase();
          }

          break;

        case 'positive':
          if (isNumericField(type)) {
            schema = schema.positive();
          }

          break;

        case 'negative':
          if (isNumericField(type)) {
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

      if (!isRelationType(attribute.type)) {
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
        const componentFieldSchema = createYupSchema(
          components[attribute.component],
          {
            components,
          },
          { ...options, isFromComponent: true }
        );

        if (isRepeatableComponent(attribute)) {
          const { min, max, required } = attribute;
          let componentSchema = yup.lazy(value => {
            let baseSchema = yup.array().of(componentFieldSchema);

            if (min && !isDraftMode(options)) {
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

          acc[current] = componentSchema;

          return acc;
        }

        const componentSchema = yup.lazy(obj => {
          if (obj !== undefined) {
            return attribute.required === true && !isDraftMode(options)
              ? componentFieldSchema.defined()
              : componentFieldSchema.nullable();
          }

          return attribute.required === true ? yup.object().defined() : yup.object().nullable();
        });

        acc[current] = componentSchema;

        return acc;
      }

      if (attribute.type === 'dynamiczone') {
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

        if (attribute.required && !isDraftMode(options)) {
          dynamicZoneSchema = dynamicZoneSchema.test('required', errorsTrads.required, value => {
            if (isCreatingEntry(options)) {
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
                if (isCreatingEntry(options)) {
                  return value && value.length > 0;
                }

                if (value === undefined) {
                  return true;
                }

                return value !== null && value.length > 0;
              })
              .test('required', errorsTrads.required, value => {
                if (isCreatingEntry(options)) {
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
      }

      return acc;
    }, {})
  );
};

export default createYupSchema;
```