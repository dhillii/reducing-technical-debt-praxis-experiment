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

const isNumericType = (type) => ['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type);

const isDateType = (type) => ['date', 'datetime'].includes(type);

const isStringType = (type) => ['string', 'uid', 'text', 'richtext', 'email', 'password', 'enumeration'].includes(type);

const isBigIntType = (type) => type === 'biginteger';

const isEmailType = (type) => type === 'email';

const isBooleanType = (type) => type === 'boolean';

const isComponentType = (type) => type === 'component';

const isDynamicZoneType = (type) => type === 'dynamiczone';

const isPasswordType = (type) => type === 'password';

const isRepeatableComponent = (attribute) => attribute.repeatable === true;

const isRequiredValidation = (validationValue) => {
  return !!validationValue || (!isBoolean(validationValue) && Number.isInteger(Math.floor(validationValue))) || validationValue === 0;
};

const isNumericValidation = (type) => isNumericType(type);

const isDateValidation = (type) => isDateType(type);

const isBooleanValidation = (type) => isBooleanType(type);

const isStringValidation = (type) => isStringType(type);

const isNumericValidationType = (type) => isNumericType(type);

const isDateValidationType = (type) => isDateType(type);

const isBooleanValidationType = (type) => isBooleanType(type);

const isStringValidationType = (type) => isStringType(type);

const isBigIntValidationType = (type) => isBigIntType(type);

const isEmailValidationType = (type) => isEmailType(type);

const isPasswordValidationType = (type) => isPasswordType(type);

const isComponentValidationType = (type) => isComponentType(type);

const isDynamicZoneValidationType = (type) => isDynamicZoneType(type);

const isRequiredValidationType = (type) => isPasswordType(type) || !isPasswordType(type);

const isRequiredValidationType = (type) => isPasswordType(type) || !isPasswordType(type);

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

  if (isEmailType(type)) {
    schema = schema.email(errorsTrads.email);
  }

  if (isNumericType(type)) {
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
          if (!options.isDraft) {
            if (isPasswordType(type) && options.isCreatingEntry) {
              schema = schema.required(errorsTrads.required);
            }

            if (type !== 'password') {
              if (options.isCreatingEntry) {
                schema = schema.required(errorsTrads.required);
              } else {
                schema = schema.test('required', errorsTrads.required, value => {
                  if (value === undefined && !options.isFromComponent) {
                    return true;
                  }

                  if (isNumericType(type)) {
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
          if (isNumericType(type)) {
            schema = schema.positive();
          }
          break;
        case 'negative':
          if (isNumericType(type)) {
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

          acc[current] = componentSchema;

          return acc;
        }
        const componentSchema = yup.lazy(obj => {
          if (obj !== undefined) {
            return attribute.required === true && !options.isDraft
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
      }

      return acc;
    }, {})
  );
};

export default createYupSchema;
```