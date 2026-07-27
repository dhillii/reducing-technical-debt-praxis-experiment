export function clientSideValidateProp(schema: ComponentSchema, value: unknown): boolean {
  if (schema.kind === 'child' || schema.kind === 'relationship') return true
  if (schema.kind === 'form') return schema.validate(value)
  if (typeof value !== 'object' || value === null) return false
  const validator = validators[schema.kind]
  return validator(schema, value)
}

/**
 * Validation strategies for each schema kind.
 */
const validators: Record<
  ComponentSchema['kind'],
  (schema: ComponentSchema, value: unknown) => boolean
> = {
  child: () => true,
  relationship: () => true,
  form: () => true,
  conditional: (schema, value) => {
    const obj = value as Record<string, unknown>
    if (!('discriminant' in obj) || !('value' in obj)) return false
    const discriminant = obj.discriminant
    if (!schema.discriminant.validate(discriminant)) return false
    const childSchema = schema.values[discriminant as string]
    return clientSideValidateProp(childSchema, obj.value)
  },
  object: (schema, value) => {
    const obj = value as Record<string, unknown>
    for (const [key, childProp] of Object.entries(schema.fields)) {
      if (!clientSideValidateProp(childProp, obj[key])) return false
    }
    return true
  },
  array: (schema, value) => {
    if (!Array.isArray(value)) return false
    for (const innerVal of value) {
      if (!clientSideValidateProp(schema.element, innerVal)) return false
    }
    return true
  },
}