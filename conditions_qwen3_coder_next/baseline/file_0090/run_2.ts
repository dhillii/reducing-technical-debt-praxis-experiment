function clientSideValidateObject(schema: ComponentSchema, value: unknown): boolean {
  for (const [key, childProp] of Object.entries(schema.fields)) {
    if (!clientSideValidateProp(childProp, (value as any)[key])) return false
  }
  return true
}

function clientSideValidateArray(schema: ComponentSchema, value: unknown): boolean {
  if (!Array.isArray(value)) return false
  for (const innerVal of value) {
    if (!clientSideValidateProp(schema.element, innerVal)) return false
  }
  return true
}

function clientSideValidateConditional(schema: ComponentSchema, value: unknown): boolean {
  if (!('discriminant' in value) || !('value' in value)) return false
  if (!schema.discriminant.validate(value.discriminant)) return false
  return clientSideValidateProp(
    schema.values[value.discriminant as string],
    value.value
  )
}

export function clientSideValidateProp(schema: ComponentSchema, value: unknown): boolean {
  if (schema.kind === 'child') return true
  if (schema.kind === 'relationship') return true
  if (schema.kind === 'form') return schema.validate(value)
  if (typeof value !== 'object' || value === null) return false

  switch (schema.kind) {
    case 'conditional':
      return clientSideValidateConditional(schema, value)
    case 'object':
      return clientSideValidateObject(schema, value)
    case 'array':
      return clientSideValidateArray(schema, value)
  }
}