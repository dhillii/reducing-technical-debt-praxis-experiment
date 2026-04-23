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

// Extracted function to handle caching
function getCachedInputType(
  cache: Map<ComponentSchema, GInputType>,
  schema: ComponentSchema,
  name: string,
  operation: 'create' | 'update',
  meta: FieldData
): GInputType {
  if (!cache.has(schema)) {
    const res = getGraphQLInputTypeInner(name, schema, operation, cache, meta)
    cache.set(schema, res)
  }
  return cache.get(schema)!
}

// Extracted function to handle input type creation
function getGraphQLInputTypeInner(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  if (schema.kind === 'form') {
    if (!schema.graphql) {
      throw new Error(`Field at ${name} is missing a graphql field`)
    }
    return schema.graphql.input
  }
  if (schema.kind === 'object') {
    return createObjectInputType(name, schema, operation, cache, meta)
  }
  if (schema.kind === 'array') {
    return createArrayInputType(name, schema, operation, cache, meta)
  }
  if (schema.kind === 'conditional') {
    return createConditionalInputType(name, schema, operation, cache, meta)
  }
  if (schema.kind === 'relationship') {
    return createRelationshipInputType(name, schema, operation, meta)
  }
  assertNever(schema)
}

// Extracted function to handle object input type creation
function createObjectInputType(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  const input = g.inputObject({
    name: `${name}${operation[0].toUpperCase()}${operation.slice(1)}Input`,
    fields: () =>
      Object.fromEntries(
        Object.entries(schema.fields).map(([key, val]): [string, GArg<GInputType>] => {
          const type = getCachedInputType(cache, val, `${name}${key[0].toUpperCase()}${key.slice(1)}`, operation, meta)
          return [key, g.arg({ type })]
        })
      ),
  })
  return input
}

// Extracted function to handle array input type creation
function createArrayInputType(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  const innerType = getCachedInputType(cache, schema.element, name, operation, meta)
  return g.list(innerType)
}

// Extracted function to handle conditional input type creation
function createConditionalInputType(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  const input = g.inputObject({
    name: `${name}${operation[0].toUpperCase()}${operation.slice(1)}Input`,
    fields: () =>
      Object.fromEntries(
        Object.entries(schema.values).map(([key, val]): [string, GArg<GInputType>] => {
          const type = getCachedInputType(cache, val, `${name}${key[0].toUpperCase()}${key.slice(1)}`, operation, meta)
          return [key, g.arg({ type })]
        })
      ),
  })
  return input
}

// Extracted function to handle relationship input type creation
function createRelationshipInputType(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  meta: FieldData
): GInputType {
  const inputType =
    meta.lists[schema.listKey].types.relateTo[schema.many ? 'many' : 'one'][operation]
  if (inputType === undefined) {
    throw new Error('')
  }
  return inputType
}

// Public API function
export function getGraphQLInputType(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  return getCachedInputType(cache, schema, name, operation, meta)
}

// Extracted function to handle value creation for update
async function createValueForUpdate(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  if (schema.kind === 'form') {
    return validateFormValue(schema, value, path)
  }
  if (schema.kind === 'object') {
    return createObjectValueForUpdate(schema, value, prevValue, context, path)
  }
  if (schema.kind === 'array') {
    return createArrayValueForUpdate(schema, value, prevValue, context, path)
  }
  if (schema.kind === 'relationship') {
    return createRelationshipValueForUpdate(schema, value, prevValue, context, path)
  }
  if (schema.kind === 'conditional') {
    return createConditionalValueForUpdate(schema, value, prevValue, context, path)
  }
  assertNever(schema)
}

// Extracted function to handle form value validation
function validateFormValue(
  schema: ComponentSchema,
  value: any,
  path: ReadonlyPropPath
): any {
  if (schema.validate(value)) return value
  throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
}

// Extracted function to handle object value creation for update
async function createObjectValueForUpdate(
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
          await createValueForUpdate(val, value[key], prevValue[key], context, path.concat(key)),
        ]
      })
    )
  )
}

// Extracted function to handle array value creation for update
async function createArrayValueForUpdate(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  return Promise.all(
    (value as any[]).map((val, i) =>
      createValueForUpdate(schema.element, val, prevValue[i], context, path.concat(i))
    )
  )
}

// Extracted function to handle relationship value creation for update
async function createRelationshipValueForUpdate(
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

// Extracted function to handle conditional value creation for update
async function createConditionalValueForUpdate(
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
    value: await createValueForUpdate(
      (schema.values as any)[key],
      value[key],
      prevValue.discriminant === discriminant ? prevValue.value : getInitialPropsValue(schema),
      context,
      path.concat('value')
    ),
  }
}

// Public API function
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
  if (value === null) {
    throw new Error(
      `${schema.kind[0].toUpperCase() + schema.kind.slice(1)} fields cannot be set to null but the field at '${path.join('.')}' is null`
    )
  }
  return createValueForUpdate(schema, value, prevValue, context, path)
}

// Extracted function to handle value creation for create
async function createValueForCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  if (schema.kind === 'form') {
    return validateFormValue(schema, value, path)
  }
  if (schema.kind === 'object') {
    return createObjectValueForCreate(schema, value, context, path)
  }
  if (schema.kind === 'array') {
    return createArrayValueForCreate(schema, value, context, path)
  }
  if (schema.kind === 'relationship') {
    return createRelationshipValueForCreate(schema, value, context, path)
  }
  if (schema.kind === 'conditional') {
    return createConditionalValueForCreate(schema, value, context, path)
  }
  assertNever(schema)
}

// Extracted function to handle object value creation for create
async function createObjectValueForCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(schema.fields).map(async ([key, val]) => {
        return [key, await createValueForCreate(val, value[key], context, path.concat(key))]
      })
    )
  )
}

// Extracted function to handle array value creation for create
async function createArrayValueForCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  return Promise.all(
    (value as any[]).map((val, i) =>
      createValueForCreate(schema.element, val, context, path.concat(i))
    )
  )
}

// Extracted function to handle relationship value creation for create
async function createRelationshipValueForCreate(
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

// Extracted function to handle conditional value creation for create
async function createConditionalValueForCreate(
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
    value: await createValueForCreate(
      (schema.values as any)[key],
      value[key],
      context,
      path.concat('value')
    ),
  }
}

// Public API function
export async function getValueForCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  if (value === undefined) return getInitialPropsValue(schema)
  if (value === null) {
    throw new Error(
      `${schema.kind[0].toUpperCase() + schema.kind.slice(1)} fields cannot be set to null but the field at '${path.join('.')}' is null`
    )
  }
  return createValueForCreate(schema, value, context, path)
}

// Rest of the code remains the same