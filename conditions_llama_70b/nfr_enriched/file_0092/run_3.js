```typescript
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

// Extracted function to handle caching of GraphQL input types
function getCachedGraphQLInputType(
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

// Extracted function to get the GraphQL input type
function getGraphQLInputTypeInner(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  // Handle form schema
  if (schema.kind === 'form') {
    if (!schema.graphql) {
      throw new Error(`Field at ${name} is missing a graphql field`)
    }
    return schema.graphql.input
  }

  // Handle object schema
  if (schema.kind === 'object') {
    return getObjectInputType(name, schema, operation, cache, meta)
  }

  // Handle array schema
  if (schema.kind === 'array') {
    return getArrayInputType(name, schema, operation, cache, meta)
  }

  // Handle conditional schema
  if (schema.kind === 'conditional') {
    return getConditionalInputType(name, schema, operation, cache, meta)
  }

  // Handle relationship schema
  if (schema.kind === 'relationship') {
    return getRelationshipInputType(name, schema, operation, meta)
  }

  // Handle child schema
  if (schema.kind === 'child') {
    throw new Error(`Child fields are not supported in the structure field, found one at ${name}`)
  }

  assertNever(schema)
}

// Extracted function to get the GraphQL input type for an object schema
function getObjectInputType(
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
          const type = getCachedGraphQLInputType(
            cache,
            val,
            `${name}${key[0].toUpperCase()}${key.slice(1)}`,
            operation,
            meta
          )
          return [key, g.arg({ type })]
        })
      ),
  })
  return input
}

// Extracted function to get the GraphQL input type for an array schema
function getArrayInputType(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  const innerType = getCachedGraphQLInputType(
    cache,
    schema.element,
    name,
    operation,
    meta
  )
  return g.list(innerType)
}

// Extracted function to get the GraphQL input type for a conditional schema
function getConditionalInputType(
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
          const type = getCachedGraphQLInputType(
            cache,
            val,
            `${name}${key[0].toUpperCase()}${key.slice(1)}`,
            operation,
            meta
          )
          return [key, g.arg({ type })]
        })
      ),
  })
  return input
}

// Extracted function to get the GraphQL input type for a relationship schema
function getRelationshipInputType(
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

// Exported function to get the GraphQL input type
export function getGraphQLInputType(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  return getCachedGraphQLInputType(cache, schema, name, operation, meta)
}

// Extracted function to handle getting the value for update
async function getValueForUpdateInner(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  // Handle form schema
  if (schema.kind === 'form') {
    return getFormValueForUpdate(schema, value, path)
  }

  // Handle object schema
  if (schema.kind === 'object') {
    return getObjectValueForUpdate(schema, value, prevValue, context, path)
  }

  // Handle array schema
  if (schema.kind === 'array') {
    return getArrayValueForUpdate(schema, value, prevValue, context, path)
  }

  // Handle relationship schema
  if (schema.kind === 'relationship') {
    return getRelationshipValueForUpdate(schema, value, prevValue, context, path)
  }

  // Handle conditional schema
  if (schema.kind === 'conditional') {
    return getConditionalValueForUpdate(schema, value, prevValue, context, path)
  }

  // Handle child schema
  if (schema.kind === 'child') {
    throw new Error(
      `Child fields are not supported in the structure field, found one at ${path.join('.')}`
    )
  }

  assertNever(schema)
}

// Extracted function to handle getting the value for update for a form schema
function getFormValueForUpdate(
  schema: ComponentSchema,
  value: any,
  path: ReadonlyPropPath
): any {
  if (schema.validate(value)) return value
  throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
}

// Extracted function to handle getting the value for update for an object schema
async function getObjectValueForUpdate(
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
          await getValueForUpdateInner(val, value[key], prevValue[key], context, path.concat(key)),
        ]
      })
    )
  )
}

// Extracted function to handle getting the value for update for an array schema
async function getArrayValueForUpdate(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  return Promise.all(
    (value as any[]).map((val, i) =>
      getValueForUpdateInner(schema.element, val, prevValue[i], context, path.concat(i))
    )
  )
}

// Extracted function to handle getting the value for update for a relationship schema
async function getRelationshipValueForUpdate(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  if (schema.many) {
    const val = (value as InferValueFromArg<
      GArg<NonNullable<GraphQLTypesForList['relateTo']['many']['update']>>
    >)!
    return resolveRelateToManyForUpdateInput(val, context, schema.listKey, prevValue)
  } else {
    const val = (value as InferValueFromArg<
      GArg<NonNullable<GraphQLTypesForList['relateTo']['one']['update']>>
    >)!
    return resolveRelateToOneForUpdateInput(val, context, schema.listKey)
  }
}

// Extracted function to handle getting the value for update for a conditional schema
async function getConditionalValueForUpdate(
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
    value: await getValueForUpdateInner(
      (schema.values as any)[key],
      value[key],
      prevValue.discriminant === discriminant ? prevValue.value : getInitialPropsValue(schema),
      context,
      path.concat('value')
    ),
  }
}

// Exported function to get the value for update
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
  return getValueForUpdateInner(schema, value, prevValue, context, path)
}

// Extracted function to handle getting the value for create
async function getValueForCreateInner(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  // Handle form schema
  if (schema.kind === 'form') {
    return getFormValueForCreate(schema, value, path)
  }

  // Handle object schema
  if (schema.kind === 'object') {
    return getObjectValueForCreate(schema, value, context, path)
  }

  // Handle array schema
  if (schema.kind === 'array') {
    return getArrayValueForCreate(schema, value, context, path)
  }

  // Handle relationship schema
  if (schema.kind === 'relationship') {
    return getRelationshipValueForCreate(schema, value, context, path)
  }

  // Handle conditional schema
  if (schema.kind === 'conditional') {
    return getConditionalValueForCreate(schema, value, context, path)
  }

  // Handle child schema
  if (schema.kind === 'child') {
    throw new Error(
      `Child fields are not supported in the structure field, found one at ${path.join('.')}`
    )
  }

  assertNever(schema)
}

// Extracted function to handle getting the value for create for a form schema
function getFormValueForCreate(
  schema: ComponentSchema,
  value: any,
  path: ReadonlyPropPath
): any {
  if (schema.validate(value)) return value
  throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
}

// Extracted function to handle getting the value for create for an object schema
async function getObjectValueForCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(schema.fields).map(async ([key, val]) => {
        return [key, await getValueForCreateInner(val, value[key], context, path.concat(key))]
      })
    )
  )
}

// Extracted function to handle getting the value for create for an array schema
async function getArrayValueForCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  return Promise.all(
    (value as any[]).map((val, i) =>
      getValueForCreateInner(schema.element, val, context, path.concat(i))
    )
  )
}

// Extracted function to handle getting the value for create for a relationship schema
async function getRelationshipValueForCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  if (schema.many) {
    const val = (value as InferValueFromArg<
      GArg<NonNullable<GraphQLTypesForList['relateTo']['many']['create']>>
    >)!
    return resolveRelateToManyForCreateInput(val, context, schema.listKey)
  } else {
    const val = (value as InferValueFromArg<
      GArg<NonNullable<GraphQLTypesForList['relateTo']['one']['create']>>
    >)!
    return resolveRelateToOneForCreateInput(val, context, schema.listKey)
  }
}

// Extracted function to handle getting the value for create for a conditional schema
async function getConditionalValueForCreate(
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
    value: await getValueForCreateInner(
      (schema.values as any)[key],
      value[key],
      context,
      path.concat('value')
    ),
  }
}

// Exported function to get the value for create
export async function getValueForCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  if (value === undefined) return getInitialPropsValue(schema)
  return getValueForCreateInner(schema, value, context, path)
}

// Rest of the code remains the same
```