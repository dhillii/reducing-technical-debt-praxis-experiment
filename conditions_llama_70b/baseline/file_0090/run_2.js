export function clientSideValidateProp(schema: ComponentSchema, value: unknown): boolean {
  if (isSimpleSchema(schema)) return true;
  if (typeof value !== 'object' || value === null) return false;

  switch (schema.kind) {
    case 'conditional':
      return validateConditional(schema, value);
    case 'object':
      return validateObject(schema, value);
    case 'array':
      return validateArray(schema, value);
    default:
      assertNever(schema);
  }
}

function isSimpleSchema(schema: ComponentSchema): boolean {
  return schema.kind === 'child' || schema.kind === 'relationship' || (schema.kind === 'form' && schema.validate(value));
}

function validateConditional(schema: ComponentSchema, value: unknown): boolean {
  if (!('discriminant' in value) || !('value' in value)) return false;
  if (!schema.discriminant.validate(value.discriminant)) return false;
  return clientSideValidateProp(
    schema.values[value.discriminant as string],
    value.value
  );
}

function validateObject(schema: ComponentSchema, value: unknown): boolean {
  for (const [key, childProp] of Object.entries(schema.fields)) {
    if (!clientSideValidateProp(childProp, (value as any)[key])) return false;
  }
  return true;
}

function validateArray(schema: ComponentSchema, value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  for (const innerVal of value) {
    if (!clientSideValidateProp(schema.element, innerVal)) return false;
  }
  return true;
}