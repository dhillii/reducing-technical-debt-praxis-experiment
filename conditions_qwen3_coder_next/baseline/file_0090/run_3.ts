export function clientSideValidateProp(schema: ComponentSchema, value: unknown): boolean {
  if (schema.kind === 'child' || schema.kind === 'relationship') return true
  if (schema.kind === 'form') return schema.validate(value)

  if (typeof value !== 'object' || value === null) return false

  switch (schema.kind) {
    case 'conditional': {
      if (!isConditionalValue(value)) return false
      if (!schema.discriminant.validate(value.discriminant)) return false
      const childSchema = schema.values[value.discriminant as string]
      return clientSideValidateProp(childSchema, value.value)
    }
    case 'object': {
      return Object.entries(schema.fields).every(([key, childProp]) =>
        clientSideValidateProp(childProp, (value as any)[key])
      )
    }
    case 'array': {
      if (!Array.isArray(value)) return false
      return value.every(item => clientSideValidateProp(schema.element, item))
    }
  }
}

function isConditionalValue(value: unknown): value is { discriminant: unknown; value: unknown } {
  return (
    value !== null &&
    typeof value === 'object' &&
    'discriminant' in value &&
    'value' in value
  )
}