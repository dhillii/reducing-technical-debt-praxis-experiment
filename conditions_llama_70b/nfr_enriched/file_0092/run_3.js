import { g } from '@keystone-6/core'
import type { GArg, GInputType, GNonNull, InferValueFromArg } from '@keystone-6/core/graphql-ts'
import type {
  BaseItem,
  FieldData,
  GraphQLTypesForList,
  KeystoneContext,
} from '@keystone-6/core/types'
import type { GraphQLResolveInfo } from 'graphql'

import type { ComponentSchema } from './DocumentEditor/component-blocks/api'
import { getInitialPropsValue } from './DocumentEditor/component-blocks/initial-values'
import { type ReadonlyPropPath, assertNever } from './DocumentEditor/component-blocks/utils'

// Extracted function to handle form validation
function validateForm(schema: ComponentSchema, value: any, path: ReadonlyPropPath): void {
  if (!schema.validate(value)) {
    throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
  }
}

// Extracted function to handle null value checks
function checkNullValue(schema: ComponentSchema, value: any, path: ReadonlyPropPath): void {
  if (value === null) {
    throw new Error(
      `${schema.kind[0].toUpperCase() + schema.kind.slice(1)} fields cannot be set to null but the field at '${path.join('.')}' is null`
    )
  }
}

// Extracted function to handle object value updates
async function updateObjectValue(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(schema.fields).map(async ([key, val]) => {
        return [
          key,
          await getValueForUpdate(val, value[key], prevValue[key], context, path.concat(key)),
        ]
      })
    )
  )
}

// Extracted function to handle array value updates
async function updateArrayValue(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  return Promise.all(
    (value as any[]).map((val, i) =>
      getValueForUpdate(schema.element, val, prevValue[i], context, path.concat(i))
    )
  )
}

// Extracted function to handle relationship value updates
async function updateRelationshipValue(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  if (schema.many) {
    return resolveRelateToManyForUpdateInput(value, context, schema.listKey, prevValue)
  } else {
    return resolveRelateToOneForUpdateInput(value, context, schema.listKey)
  }
}

// Extracted function to handle conditional value updates
async function updateConditionalValue(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  const conditionalValueKeys = Object.keys(value)
  if (conditionalValueKeys.length !== 1) {
    throw new Error(
      `Conditional field inputs must set exactly one of the fields but the field at ${path.join(
        '.'
      )} has ${conditionalValueKeys.length} fields set`
    )
  }
  const key = conditionalValueKeys[0]
  let discriminant: string | boolean = key
  if ((key === 'true' || key === 'false') && !schema.discriminant.validate(key)) {
    discriminant = key === 'true'
  }
  return {
    discriminant,
    value: await getValueForUpdate(
      (schema.values as any)[key],
      value[key],
      prevValue.discriminant === discriminant ? prevValue.value : getInitialPropsValue(schema),
      context,
      path.concat('value')
    ),
  }
}

export async function getValueForUpdate(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  if (value === undefined) return prevValue
  if (prevValue === undefined) {
    prevValue = getInitialPropsValue(schema)
  }

  if (schema.kind === 'form') {
    validateForm(schema, value, path)
    return value
  }

  checkNullValue(schema, value, path)

  switch (schema.kind) {
    case 'object':
      return updateObjectValue(schema, value, prevValue, context, path)
    case 'array':
      return updateArrayValue(schema, value, prevValue, context, path)
    case 'relationship':
      return updateRelationshipValue(schema, value, prevValue, context, path)
    case 'conditional':
      return updateConditionalValue(schema, value, prevValue, context, path)
    default:
      assertNever(schema)
  }
}

// Extracted function to handle form validation for create
function validateFormForCreate(schema: ComponentSchema, value: any, path: ReadonlyPropPath): void {
  if (!schema.validate(value)) {
    throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
  }
}

// Extracted function to handle null value checks for create
function checkNullValueForCreate(schema: ComponentSchema, value: any, path: ReadonlyPropPath): void {
  if (value === null) {
    throw new Error(
      `${schema.kind[0].toUpperCase() + schema.kind.slice(1)} fields cannot be set to null but the field at '${path.join('.')}' is null`
    )
  }
}

// Extracted function to handle object value creation
async function createObjectValue(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(schema.fields).map(async ([key, val]) => {
        return [key, await getValueForCreate(val, value[key], context, path.concat(key))]
      })
    )
  )
}

// Extracted function to handle array value creation
async function createArrayValue(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  return Promise.all(
    (value as any[]).map((val, i) =>
      getValueForCreate(schema.element, val, context, path.concat(i))
    )
  )
}

// Extracted function to handle relationship value creation
async function createRelationshipValue(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  if (schema.many) {
    return resolveRelateToManyForCreateInput(value, context, schema.listKey)
  } else {
    return resolveRelateToOneForCreateInput(value, context, schema.listKey)
  }
}

// Extracted function to handle conditional value creation
async function createConditionalValue(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  if (value === null) throw new Error()
  const conditionalValueKeys = Object.keys(value)
  if (conditionalValueKeys.length !== 1) throw new Error()
  const key = conditionalValueKeys[0]
  let discriminant: string | boolean = key
  if ((key === 'true' || key === 'false') && !schema.discriminant.validate(key)) {
    discriminant = key === 'true'
  }

  return {
    discriminant,
    value: await getValueForCreate(
      (schema.values as any)[key],
      value[key],
      context,
      path.concat('value')
    ),
  }
}

export async function getValueForCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  // If value is undefined, get the specified defaultValue
  if (value === undefined) return getInitialPropsValue(schema)

  if (schema.kind === 'form') {
    validateFormForCreate(schema, value, path)
    return value
  }

  checkNullValueForCreate(schema, value, path)

  switch (schema.kind) {
    case 'object':
      return createObjectValue(schema, value, context, path)
    case 'array':
      return createArrayValue(schema, value, context, path)
    case 'relationship':
      return createRelationshipValue(schema, value, context, path)
    case 'conditional':
      return createConditionalValue(schema, value, context, path)
    default:
      assertNever(schema)
  }
}

// ... rest of the code remains the same ...