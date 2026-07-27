export function clientSideValidateProp(schema: ComponentSchema, value: unknown): boolean {
  if (schema.kind === 'child' || schema.kind === 'relationship') return true
  if (schema.kind === 'form') return schema.validate(value)
  if (typeof value !== 'object' || value === null) return false

  switch (schema.kind) {
    case 'conditional':
      return validateConditional(schema, value)
    case 'object':
      return validateObject(schema, value)
    case 'array':
      return validateArray(schema, value)
    default:
      return false
  }
}

function validateConditional(schema: ComponentSchema, value: unknown): boolean {
  const val = value as any
  if (!('discriminant' in val) || !('value' in val)) return false
  const disc = val.discriminant
  if (!schema.discriminant.validate(disc)) return false
  const childSchema = schema.values[disc as string]
  return clientSideValidateProp(childSchema, val.value)
}

function validateObject(schema: ComponentSchema, value: unknown): boolean {
  const val = value as any
  for (const [key, childProp] of Object.entries(schema.fields)) {
    if (!clientSideValidateProp(childProp, val[key])) return false
  }
  return true
}

function validateArray(schema: ComponentSchema, value: unknown): boolean {
  if (!Array.isArray(value)) return false
  for (const innerVal of value as any[]) {
    if (!clientSideValidateProp(schema.element, innerVal)) return false
  }
  return true
}