// Define a base class for schema validation
abstract class SchemaValidator {
  abstract validate(value: unknown): boolean;
}

// Define concrete schema validators
class ChildSchemaValidator extends SchemaValidator {
  validate(value: unknown): boolean {
    return true;
  }
}

class RelationshipSchemaValidator extends SchemaValidator {
  validate(value: unknown): boolean {
    return true;
  }
}

class FormSchemaValidator extends SchemaValidator {
  private schema: ComponentSchema;

  constructor(schema: ComponentSchema) {
    super();
    this.schema = schema;
  }

  validate(value: unknown): boolean {
    return this.schema.validate(value);
  }
}

class ConditionalSchemaValidator extends SchemaValidator {
  private schema: ComponentSchema;

  constructor(schema: ComponentSchema) {
    super();
    this.schema = schema;
  }

  validate(value: unknown): boolean {
    if (!('discriminant' in value) || !('value' in value)) return false;
    if (!this.schema.discriminant.validate(value.discriminant)) return false;
    return new ObjectSchemaValidator(this.schema.values[value.discriminant as string]).validate(value.value);
  }
}

class ObjectSchemaValidator extends SchemaValidator {
  private schema: ComponentSchema;

  constructor(schema: ComponentSchema) {
    super();
    this.schema = schema;
  }

  validate(value: unknown): boolean {
    for (const [key, childProp] of Object.entries(this.schema.fields)) {
      if (!new SchemaValidatorFactory().create(childProp).validate((value as any)[key])) return false;
    }
    return true;
  }
}

class ArraySchemaValidator extends SchemaValidator {
  private schema: ComponentSchema;

  constructor(schema: ComponentSchema) {
    super();
    this.schema = schema;
  }

  validate(value: unknown): boolean {
    if (!Array.isArray(value)) return false;
    for (const innerVal of value) {
      if (!new SchemaValidatorFactory().create(this.schema.element).validate(innerVal)) return false;
    }
    return true;
  }
}

// Define a factory for creating schema validators
class SchemaValidatorFactory {
  create(schema: ComponentSchema): SchemaValidator {
    switch (schema.kind) {
      case 'child':
        return new ChildSchemaValidator();
      case 'relationship':
        return new RelationshipSchemaValidator();
      case 'form':
        return new FormSchemaValidator(schema);
      case 'conditional':
        return new ConditionalSchemaValidator(schema);
      case 'object':
        return new ObjectSchemaValidator(schema);
      case 'array':
        return new ArraySchemaValidator(schema);
      default:
        throw new Error('Unsupported schema kind');
    }
  }
}

// Refactored clientSideValidateProp function
export function clientSideValidateProp(schema: ComponentSchema, value: unknown): boolean {
  if (typeof value !== 'object') return false;
  if (value === null) return false;
  return new SchemaValidatorFactory().create(schema).validate(value);
}