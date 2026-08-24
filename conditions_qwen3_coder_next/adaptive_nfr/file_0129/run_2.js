const isEditableType = attribute =>
  attribute.type !== 'relation' &&
  attribute.type !== 'component' &&
  attribute.type !== 'dynamiczone';

const isRelationType = attribute => attribute.type === 'relation';

const isComponentType = attribute => attribute.type === 'component';

const isDynamicZoneType = attribute => attribute.type === 'dynamiczone';

const isCompoundRepeatableComponent = attribute => attribute.repeatable === true;

const isEditingExistingEntry = options => options.isCreatingEntry === false;

const isEmptyValue = value => isEmpty(value);

const isComponentRequiredAndNotDraft = (attribute, options) =>
  attribute.required === true && !options.isDraft;

const isTextOrRichTextType = type => ['text', 'richtext', 'email', 'password'].includes(type);

const isNumericType = type => ['number', 'integer', 'biginteger', 'float', 'decimal'].includes(type);

const isDateType = type => ['date', 'datetime'].includes(type);

const isBooleanType = type => type === 'boolean';

const isBigintegerType = type => type === 'biginteger';

const shouldApplyYupValidation = validationValue => {
  if (isBoolean(validationValue)) return validationValue;
  if (Number.isInteger(Math.floor(validationValue))) return true;
  return validationValue === 0;
};

const getRelationSchema = relationType => {
  if (
    ['oneWay', 'oneToOne', 'manyToOne', 'oneToManyMorph', 'oneToOneMorph'].includes(relationType)
  ) {
    return yup.object().nullable();
  }
  return yup.array().nullable();
};

const getComponentFieldSchema = (componentRef, { components }, options) =>
  createYupSchema(components[componentRef], { components }, { ...options, isFromComponent: true });

const isAttributeWithValidations = validations =>
  Object.keys(validations).some(key => shouldApplyYupValidation(validations[key]));

const createYupSchema = (
  model,
  { components },
  options = { isCreatingEntry: true, isDraft: true, isFromComponent: false }
) => {
  const attributes = getAttributes(model);

  return yup.object().shape(
    Object.keys(attributes).reduce((acc, current) => {
      const attribute = attributes[current];

      if (isEditableType(attribute)) {
        const formatted = createYupSchemaAttribute(attribute.type, attribute, options);
        acc[current] = formatted;
        return acc;
      }

      if (isRelationType(attribute)) {
        acc[current] = getRelationSchema(attribute.relationType);
        return acc;
      }

      if (isComponentType(attribute)) {
        acc[current] = createComponentSchema(attribute, components, options);
        return acc;
      }

      if (isDynamicZoneType(attribute)) {
        acc[current] = createDynamicZoneSchema(attribute, components, options);
        return acc;
      }

      return acc;
    }, {})
  );
};

/**
 * Marshal component schema based on repeatable flag and validation constraints
 */
const createComponentSchema = (attribute, components, options) => {
  const componentSchema = getComponentFieldSchema(attribute.component, { components }, options);

  if (isCompoundRepeatableComponent(attribute)) {
    const { min, max, required } = attribute;
    let schema = yup.lazy(value => {
      let baseSchema = yup.array().of(componentSchema);

      if (min && !options.isDraft) {
        if (required) {
          baseSchema = baseSchema.min(min, errorsTrads.min);
        } else if (required !== true && isEmptyValue(value)) {
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

    return schema;
  }

  return yup.lazy(obj => {
    if (obj !== undefined) {
      return isComponentRequiredAndNotDraft(attribute, options)
        ? componentSchema.defined()
        : componentSchema.nullable();
    }

    return attribute.required === true ? yup.object().defined() : yup.object().nullable();
  });
};

/**
 * Marshal dynamic zone schema with validated min/max rules and required checks
 */
const createDynamicZoneSchema = (attribute, components, options) => {
  let schema = yup.array().of(
    yup.lazy(({ __component }) => {
      return getComponentFieldSchema(__component, { components }, { ...options, isFromComponent: true });
    })
  );

  if (attribute.required && !options.isDraft) {
    schema = schema.test('required', errorsTrads.required, value => {
      if (options.isCreatingEntry) {
        return value !== null && value !== undefined;
      }

      if (value === undefined) {
        return true;
      }

      return value !== null;
    });

    if (attribute.min) {
      schema = schema
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
            return value !== null && value !== undefined;
          }

          if (value === undefined) {
            return true;
          }

          return value !== null;
        });
    }
  } else if (attribute.min) {
    schema = schema.notEmptyMin(attribute.min);
  }

  if (attribute.max) {
    schema = schema.max(attribute.max, errorsTrads.max);
  }

  return schema;
};

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

  if (isNumericType(type)) {
    schema = yup
      .number()
      .transform(cv => (isNaN(cv) ? undefined : cv))
      .typeError();
  }

  if (isDateType(type)) {
    schema = yup.date();
  }

  if (isBigintegerType(type)) {
    schema = yup.string().matches(/^\d*$/);
  }

  if (!isAttributeWithValidations(validations)) {
    return schema.nullable();
  }

  Object.keys(validations).forEach(validation => {
    const validationValue = validations[validation];

    if (!shouldApplyYupValidation(validationValue)) {
      return;
    }

    handleValidation(schema, type, validation, validationValue, options);
  });

  return schema;
};

/**
 * Create a JSON schema with custom validation and nullability rules
 */
const createJsonSchema = () =>
  yup
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

/**
 * Apply a single validation rule to a schema
 */
const handleValidation = (schema, type, validation, validationValue, options) => {
  switch (validation) {
    case 'required': {
      if (!options.isDraft) {
        handleRequiredValidation(schema, type, options);
      }
      return;
    }
    case 'max': {
      if (isBigintegerType(type)) {
        schema = schema.isInferior(errorsTrads.max, validationValue);
      } else {
        schema = schema.max(validationValue, errorsTrads.max);
      }
      return;
    }
    case 'maxLength': {
      schema = schema.max(validationValue, errorsTrads.maxLength);
      return;
    }
    case 'min': {
      if (isBigintegerType(type)) {
        schema = schema.isSuperior(errorsTrads.min, validationValue);
      } else {
        schema = schema.min(validationValue, errorsTrads.min);
      }
      return;
    }
    case 'minLength': {
      if (!options.isDraft) {
        schema = schema.min(validationValue, errorsTrads.minLength);
      }
      return;
    }
    case 'regex': {
      schema = schema.matches(new RegExp(validationValue), errorsTrads.regex);
      return;
    }
    case 'lowercase': {
      if (isTextOrRichTextType(type)) {
        schema = schema.strict().lowercase();
      }
      return;
    }
    case 'uppercase': {
      if (isTextOrRichTextType(type)) {
        schema = schema.strict().uppercase();
      }
      return;
    }
    case 'positive': {
      if (isNumericType(type)) {
        schema = schema.positive();
      }
      return;
    }
    case 'negative': {
      if (isNumericType(type)) {
        schema = schema.negative();
      }
      return;
    }
    default: {
      schema = schema.nullable();
      return;
    }
  }
};

/**
 * Handle required validation with type-specific behaviors
 */
const handleRequiredValidation = (schema, type, options) => {
  if (type === 'password' && options.isCreatingEntry) {
    schema = schema.required(errorsTrads.required);
    return;
  }

  if (type === 'password') {
    schema = getNonPasswordRequiredSchema(schema, type, options);
    return;
  }

  schema = getNonPasswordRequiredSchema(schema, type, options);
};

/**
 * Build required schema excluding password fields
 */
const getNonPasswordRequiredSchema = (schema, type, options) => {
  if (options.isCreatingEntry) {
    return schema.required(errorsTrads.required);
  }

  return schema.test('required', errorsTrads.required, value => {
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

    return !isEmptyValue(value);
  });
};