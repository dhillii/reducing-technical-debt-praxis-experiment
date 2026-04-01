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

export function getGraphQLInputType(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
) {
  if (!cache.has(schema)) {
    const res = getGraphQLInputTypeInner(name, schema, operation, cache, meta)
    cache.set(schema, res)
  }
  return cache.get(schema)!
}

// Handles form schema input type
function handleFormSchema(schema: ComponentSchema): GInputType {
  if (!schema.graphql) {
    throw new Error(`Field is missing a graphql field`)
  }
  return schema.graphql.input
}

// Generates input object name with operation suffix
function generateInputObjectName(name: string, operation: 'create' | 'update'): string {
  return `${name}${operation[0].toUpperCase()}${operation.slice(1)}Input`
}

// Handles object schema input type
function handleObjectSchema(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  const input = g.inputObject({
    name: generateInputObjectName(name, operation),
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

// Handles array schema input type
function handleArraySchema(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  const innerType = getGraphQLInputType(name, schema.element, operation, cache, meta)
  return g.list(innerType)
}

// Handles conditional schema input type
function handleConditionalSchema(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  const input = g.inputObject({
    name: generateInputObjectName(name, operation),
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

// Handles relationship schema input type
function handleRelationshipSchema(
  schema: ComponentSchema,
  meta: FieldData,
  name: string
): GInputType {
  const inputType =
    meta.lists[schema.listKey].types.relateTo[schema.many ? 'many' : 'one']['create']
  if (inputType === undefined) {
    throw new Error(`Relationship input type not found for ${name}`)
  }
  return inputType
}

function getGraphQLInputTypeInner(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  if (schema.kind === 'form') {
    return handleFormSchema(schema)
  }
  if (schema.kind === 'object') {
    return handleObjectSchema(name, schema, operation, cache, meta)
  }
  if (schema.kind === 'array') {
    return handleArraySchema(name, schema, operation, cache, meta)
  }
  if (schema.kind === 'conditional') {
    return handleConditionalSchema(name, schema, operation, cache, meta)
  }
  if (schema.kind === 'relationship') {
    return handleRelationshipSchema(schema, meta, name)
  }
  if (schema.kind === 'child') {
    throw new Error(`Child fields are not supported in the structure field, found one at ${name}`)
  }

  assertNever(schema)
}

// Validates form field value
function validateFormValue(schema: ComponentSchema, value: any, path: ReadonlyPropPath): any {
  if (schema.validate(value)) return value
  throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
}

// Capitalizes first letter of string
function capitalizeFirst(str: string): string {
  return str[0].toUpperCase() + str.slice(1)
}

// Throws error for null value in non-nullable field
function throwNullError(schema: ComponentSchema, path: ReadonlyPropPath): never {
  throw new Error(
    `${capitalizeFirst(schema.kind)} fields cannot be set to null but the field at '${path.join('.')}' is null`
  )
}

// Processes object schema for update/create
async function processObjectSchema(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath,
  isUpdate: boolean
): Promise<any> {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(schema.fields).map(async ([key, val]) => {
        const newValue = isUpdate
          ? await getValueForUpdate(val, value[key], prevValue[key], context, path.concat(key))
          : await getValueForCreate(val, value[key], context, path.concat(key))
        return [key, newValue]
      })
    )
  )
}

// Processes array schema for update/create
async function processArraySchema(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath,
  isUpdate: boolean
): Promise<any> {
  return Promise.all(
    (value as any[]).map((val, i) =>
      isUpdate
        ? getValueForUpdate(schema.element, val, prevValue[i], context, path.concat(i))
        : getValueForCreate(schema.element, val, context, path.concat(i))
    )
  )
}

// Processes relationship schema for update/create
async function processRelationshipSchema(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  prevValue: any,
  isUpdate: boolean
): Promise<any> {
  if (schema.many) {
    return isUpdate
      ? resolveRelateToManyForUpdateInput(value, context, schema.listKey, prevValue)
      : resolveRelateToManyForCreateInput(value, context, schema.listKey)
  } else {
    return isUpdate
      ? resolveRelateToOneForUpdateInput(value, context, schema.listKey)
      : resolveRelateToOneForCreateInput(value, context, schema.listKey)
  }
}

// Parses conditional discriminant value
function parseConditionalDiscriminant(key: string, schema: ComponentSchema): string | boolean {
  if ((key === 'true' || key === 'false') && !schema.discriminant.validate(key)) {
    return key === 'true'
  }
  return key
}

// Processes conditional schema for update/create
async function processConditionalSchema(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath,
  isUpdate: boolean
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
  const discriminant = parseConditionalDiscriminant(key, schema)

  const prevValueForKey =
    prevValue.discriminant === discriminant ? prevValue.value : getInitialPropsValue(schema)

  const newValue = isUpdate
    ? await getValueForUpdate(
        (schema.values as any)[key],
        value[key],
        prevValueForKey,
        context,
        path.concat('value')
      )
    : await getValueForCreate(
        (schema.values as any)[key],
        value[key],
        context,
        path.concat('value')
      )

  return {
    discriminant,
    value: newValue,
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
    return validateFormValue(schema, value, path)
  }
  if (value === null) {
    throwNullError(schema, path)
  }
  if (schema.kind === 'object') {
    return processObjectSchema(schema, value, prevValue, context, path, true)
  }
  if (schema.kind === 'array') {
    return processArraySchema(schema, value, prevValue, context, path, true)
  }
  if (schema.kind === 'relationship') {
    return processRelationshipSchema(schema, value, context, prevValue, true)
  }
  if (schema.kind === 'conditional') {
    return processConditionalSchema(schema, value, prevValue, context, path, true)
  }
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
  if (schema.kind === 'form') {
    return validateFormValue(schema, value, path)
  }
  if (value === null) {
    throwNullError(schema, path)
  }
  if (schema.kind === 'array') {
    return processArraySchema(schema, value, undefined, context, path, false)
  }
  if (schema.kind === 'object') {
    return processObjectSchema(schema, value, undefined, context, path, false)
  }
  if (schema.kind === 'relationship') {
    return processRelationshipSchema(schema, value, context, undefined, false)
  }
  if (schema.kind === 'conditional') {
    return processConditionalSchema(schema, value, undefined, context, path, false)
  }
  if (schema.kind === 'child') {
    throw new Error(
      `Child fields are not supported in the structure field, found one at ${path.join('.')}`
    )
  }

  assertNever(schema)
}

/** MANY */

type _CreateValueManyType = Exclude<
  InferValueFromArg<GArg<Exclude<GraphQLTypesForList['relateTo']['many']['create'], undefined>>>,
  null | undefined
>

type _UpdateValueManyType = Exclude<
  InferValueFromArg<GArg<Exclude<GraphQLTypesForList['relateTo']['many']['update'], undefined>>>,
  null | undefined
>

export class RelationshipErrors extends Error {
  errors: { error: Error; tag: string }[]
  constructor(errors: { error: Error; tag: string }[]) {
    super('Multiple relationship errors')
    this.errors = errors
  }
}

function getResolvedUniqueWheres(
  uniqueInputs: Record<string, any>[],
  context: KeystoneContext,
  foreignListKey: string,
  operation: string
) {
  return uniqueInputs.map(uniqueInput =>
    checkUniqueItemExists(uniqueInput, foreignListKey, context, operation)
  )
}

export const isFulfilled = <T>(arg: PromiseSettledResult<T>): arg is PromiseFulfilledResult<T> =>
  arg.status === 'fulfilled'
export const isRejected = (arg: PromiseSettledResult<any>): arg is PromiseRejectedResult =>
  arg.status === 'rejected'

// Collects errors from settled promises
function collectErrors(
  results: PromiseSettledResult<any>[],
  tag?: string
): { error: Error; tag: string }[] {
  return results.filter(isRejected).map(x => ({ error: x.reason, tag: tag || '' }))
}

// Extracts fulfilled values from settled promises
function extractFulfilledValues(results: PromiseSettledResult<any>[]): any[] {
  return results.filter(isFulfilled).map(x => x.value)
}

export async function resolveRelateToManyForCreateInput(
  value: _CreateValueManyType,
  context: KeystoneContext,
  foreignListKey: string,
  tag?: string
) {
  if (!Array.isArray(value.connect) && !Array.isArray(value.create)) {
    throw new Error(
      `You must provide "connect" or "create" in to-many relationship inputs for "create" operations.`
    )
  }

  const connects = Promise.allSettled(
    getResolvedUniqueWheres(value.connect || [], context, foreignListKey, 'connect')
  )

  const creates = Promise.allSettled(
    (value.create || []).map(x => resolveCreateMutation(x, context, foreignListKey))
  )

  const [connectResult, createResult] = await Promise.all([connects, creates])

  const errors = collectErrors([...connectResult, ...createResult], tag)
  if (errors.length) {
    throw new RelationshipErrors(errors)
  }

  return extractFulfilledValues([...connectResult, ...createResult])
}

export async function resolveRelateToManyForUpdateInput(
  value: _UpdateValueManyType,
  context: KeystoneContext,
  foreignListKey: string,
  prevVal: { id: string }[]
) {
  if (
    !Array.isArray(value.connect) &&
    !Array.isArray(value.create) &&
    !Array.isArray(value.disconnect) &&
    !Array.isArray(value.set)
  ) {
    throw new Error(
      `You must provide at least one of "set", "connect", "create" or "disconnect" in to-many relationship inputs for "update" operations.`
    )
  }
  if (value.set && value.disconnect) {
    throw new Error(
      `The "set" and "disconnect" fields cannot