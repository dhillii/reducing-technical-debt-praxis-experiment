import type { ComponentSchema } from './api-shared'

/**
 * Checks whether a value is a non‑null object.
 * @param value - The value to check.
 * @returns `true` if the value is an object and not `null`, otherwise `false`.
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Validates a conditional schema.
 * @param schema - The conditional schema.
 * @param value - The value to validate.
 * @returns `true` if the value satisfies the conditional schema, otherwise `false`.
 */
function validateConditional(schema: ComponentSchema, value: unknown): boolean {
  if (!('discriminant' in value as any) || !('value' in value as any)) return false
  const val = value as any
  if (!schema.discriminant.validate(val.discriminant)) return false
  const childSchema = schema.values[val.discriminant as string]
  return clientSideValidateProp(childSchema, val.value)
}

/**
 * Validates an object schema.
 * @param schema - The object schema.
 * @param value - The value to validate.
 * @returns `true` if all child properties satisfy their schemas, otherwise `false`.
 */
function validateObject(schema: ComponentSchema, value: unknown): boolean {
  const obj = value as Record<string, unknown>
  for (const [key, childProp] of Object.entries(schema.fields)) {
    if (!clientSideValidateProp(childProp, obj[key])) return false
  }
  return true
}

/**
 * Validates an array schema.
 * @param schema - The array schema.
 * @param value - The value to validate.
 * @returns `true` if the value is an array and all elements satisfy the element schema, otherwise `false`.
 */
function validateArray(schema: ComponentSchema, value: unknown): boolean {
  if (!Array.isArray(value)) return false
  for (const innerVal of value as unknown[]) {
    if (!clientSideValidateProp(schema.element, innerVal)) return false
  }
  return true
}

const validators: Record<string, (schema: ComponentSchema, value: unknown) => boolean> = {
  conditional: validateConditional,
  object: validateObject,
  array: validateArray,
}

export function clientSideValidateProp(schema: ComponentSchema, value: unknown): boolean {
  if (schema.kind === 'child' || schema.kind === 'relationship') return true
  if (schema.kind === 'form') return schema.validate(value)
  if (!isObject(value)) return false
  const validator = validators[schema.kind]
  if (!validator) return false
  return validator(schema, value)
}