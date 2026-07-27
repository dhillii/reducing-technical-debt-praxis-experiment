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

// Extracted function to handle GraphQL input type for 'form' schema
function getFormGraphQLInputType(name: string, schema: ComponentSchema): GInputType {
  if (!schema.graphql) {
    throw new Error(`Field at ${name} is missing a graphql field`)
  }
  return schema.graphql.input
}

// Extracted function to handle GraphQL input type for 'object' schema
function getObjectGraphQLInputType(
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
          const type = getGraphQLInputType(
            `${name}${key[0].toUpperCase()}${key.slice(1)}`,
            val,
            operation,
            cache,
            meta
          )
          return [key, g.arg({ type })]
        })
      ),
  })
  return input
}

// Extracted function to handle GraphQL input type for 'array' schema
function getArrayGraphQLInputType(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  const innerType = getGraphQLInputType(name, schema.element, operation, cache, meta)
  return g.list(innerType)
}

// Extracted function to handle GraphQL input type for 'conditional' schema
function getConditionalGraphQLInputType(
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
          const type = getGraphQLInputType(
            `${name}${key[0].toUpperCase()}${key.slice(1)}`,
            val,
            operation,
            cache,
            meta
          )
          return [key, g.arg({ type })]
        })
      ),
  })
  return input
}

// Extracted function to handle GraphQL input type for 'relationship' schema
function getRelationshipGraphQLInputType(
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

// Extracted function to handle GraphQL input type for other schema types
function getOtherGraphQLInputType(schema: ComponentSchema): never {
  if (schema.kind === 'child') {
    throw new Error(`Child fields are not supported in the structure field, found one at`)
  }
  assertNever(schema)
}

export function getGraphQLInputType(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  if (!cache.has(schema)) {
    let res: GInputType
    switch (schema.kind) {
      case 'form':
        res = getFormGraphQLInputType(name, schema)
        break
      case 'object':
        res = getObjectGraphQLInputType(name, schema, operation, cache, meta)
        break
      case 'array':
        res = getArrayGraphQLInputType(name, schema, operation, cache, meta)
        break
      case 'conditional':
        res = getConditionalGraphQLInputType(name, schema, operation, cache, meta)
        break
      case 'relationship':
        res = getRelationshipGraphQLInputType(name, schema, operation, meta)
        break
      default:
        res = getOtherGraphQLInputType(schema)
    }
    cache.set(schema, res)
  }
  return cache.get(schema)!
}

// Extracted function to handle value for update for 'form' schema
async function getFormValueForUpdate(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  if (schema.validate(value)) return value
  throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
}

// Extracted function to handle value for update for 'object' schema
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
          await getValueForUpdate(val, value[key], prevValue[key], context, path.concat(key)),
        ]
      })
    )
  )
}

// Extracted function to handle value for update for 'array' schema
async function getArrayValueForUpdate(
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

// Extracted function to handle value for update for 'relationship' schema
async function getRelationshipValueForUpdate(
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

// Extracted function to handle value for update for 'conditional' schema
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
    value: await getValueForUpdate(
      (schema.values as any)[key],
      value[key],
      prevValue.discriminant === discriminant ? prevValue.value : getInitialPropsValue(schema),
      context,
      path.concat('value')
    ),
  }
}

// Extracted function to handle value for update for other schema types
async function getOtherValueForUpdate(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<never> {
  if (schema.kind === 'child') {
    throw new Error(
      `Child fields are not supported in the structure field, found one at ${path.join('.')}`
    )
  }
  assertNever(schema)
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
  if (value === null) {
    throw new Error(
      `${schema.kind[0].toUpperCase() + schema.kind.slice(1)} fields cannot be set to null but the field at '${path.join('.')}' is null`
    )
  }
  switch (schema.kind) {
    case 'form':
      return getFormValueForUpdate(schema, value, prevValue, context, path)
    case 'object':
      return getObjectValueForUpdate(schema, value, prevValue, context, path)
    case 'array':
      return getArrayValueForUpdate(schema, value, prevValue, context, path)
    case 'relationship':
      return getRelationshipValueForUpdate(schema, value, prevValue, context, path)
    case 'conditional':
      return getConditionalValueForUpdate(schema, value, prevValue, context, path)
    default:
      return getOtherValueForUpdate(schema, value, prevValue, context, path)
  }
}

// Extracted function to handle value for create for 'form' schema
async function getFormValueForCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  if (schema.validate(value)) return value
  throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
}

// Extracted function to handle value for create for 'object' schema
async function getObjectValueForCreate(
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

// Extracted function to handle value for create for 'array' schema
async function getArrayValueForCreate(
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

// Extracted function to handle value for create for 'relationship' schema
async function getRelationshipValueForCreate(
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

// Extracted function to handle value for create for 'conditional' schema
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
    value: await getValueForCreate(
      (schema.values as any)[key],
      value[key],
      context,
      path.concat('value')
    ),
  }
}

// Extracted function to handle value for create for other schema types
async function getOtherValueForCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<never> {
  if (schema.kind === 'child') {
    throw new Error(
      `Child fields are not supported in the structure field, found one at ${path.join('.')}`
    )
  }
  assertNever(schema)
}

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
  switch (schema.kind) {
    case 'form':
      return getFormValueForCreate(schema, value, context, path)
    case 'object':
      return getObjectValueForCreate(schema, value, context, path)
    case 'array':
      return getArrayValueForCreate(schema, value, context, path)
    case 'relationship':
      return getRelationshipValueForCreate(schema, value, context, path)
    case 'conditional':
      return getConditionalValueForCreate(schema, value, context, path)
    default:
      return getOtherValueForCreate(schema, value, context, path)
  }
}

// Rest of the code remains the same