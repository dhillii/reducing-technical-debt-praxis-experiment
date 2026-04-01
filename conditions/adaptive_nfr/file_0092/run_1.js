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

/** @internal Handles form schema input type resolution */
function handleFormInputType(schema: ComponentSchema): GInputType {
  if (!schema.graphql) {
    throw new Error(`Field is missing a graphql field`)
  }
  return schema.graphql.input
}

/** @internal Handles object schema input type resolution */
function handleObjectInputType(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  return g.inputObject({
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
}

/** @internal Handles array schema input type resolution */
function handleArrayInputType(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  const innerType = getGraphQLInputType(name, schema.element, operation, cache, meta)
  return g.list(innerType)
}

/** @internal Handles conditional schema input type resolution */
function handleConditionalInputType(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  return g.inputObject({
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
}

/** @internal Handles relationship schema input type resolution */
function handleRelationshipInputType(
  schema: ComponentSchema,
  meta: FieldData,
  operation: 'create' | 'update'
): GInputType {
  const inputType =
    meta.lists[schema.listKey].types.relateTo[schema.many ? 'many' : 'one'][operation]
  if (inputType === undefined) {
    throw new Error('')
  }
  return inputType
}

/** @internal Input type handler strategy map */
const inputTypeHandlers: Record<string, (name: string, schema: ComponentSchema, operation: 'create' | 'update', cache: Map<ComponentSchema, GInputType>, meta: FieldData) => GInputType> = {
  form: (name, schema, operation, cache, meta) => handleFormInputType(schema),
  object: handleObjectInputType,
  array: handleArrayInputType,
  conditional: handleConditionalInputType,
  relationship: (name, schema, operation, cache, meta) => handleRelationshipInputType(schema, meta, operation),
}

function getGraphQLInputTypeInner(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  if (schema.kind === 'child') {
    throw new Error(`Child fields are not supported in the structure field, found one at ${name}`)
  }

  const handler = inputTypeHandlers[schema.kind]
  if (handler) {
    return handler(name, schema, operation, cache, meta)
  }

  assertNever(schema)
}

/** @internal Validates form value */
function validateFormValue(schema: ComponentSchema, value: any, path: ReadonlyPropPath): void {
  if (!schema.validate(value)) {
    throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
  }
}

/** @internal Checks if value is null and throws appropriate error */
function checkNullValue(schema: ComponentSchema, value: any, path: ReadonlyPropPath): void {
  if (value === null) {
    throw new Error(
      `${schema.kind[0].toUpperCase() + schema.kind.slice(1)} fields cannot be set to null but the field at '${path.join('.')}' is null`
    )
  }
}

/** @internal Handles object value update */
async function handleObjectValueUpdate(
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

/** @internal Handles array value update */
async function handleArrayValueUpdate(
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

/** @internal Handles relationship value update */
async function handleRelationshipValueUpdate(
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

/** @internal Parses conditional discriminant value */
function parseConditionalDiscriminant(key: string, schema: ComponentSchema): string | boolean {
  if ((key === 'true' || key === 'false') && !schema.discriminant.validate(key)) {
    return key === 'true'
  }
  return key
}

/** @internal Handles conditional value update */
async function handleConditionalValueUpdate(
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
  const discriminant = parseConditionalDiscriminant(key, schema)

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

/** @internal Value update handler strategy map */
const updateHandlers: Record<string, (schema: ComponentSchema, value: any, prevValue: any, context: KeystoneContext, path: ReadonlyPropPath) => Promise<any>> = {
  object: handleObjectValueUpdate,
  array: handleArrayValueUpdate,
  relationship: handleRelationshipValueUpdate,
  conditional: handleConditionalValueUpdate,
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
    validateFormValue(schema, value, path)
    return value
  }

  checkNullValue(schema, value, path)

  if (schema.kind === 'child') {
    throw new Error(
      `Child fields are not supported in the structure field, found one at ${path.join('.')}`
    )
  }

  const handler = updateHandlers[schema.kind]
  if (handler) {
    return handler(schema, value, prevValue, context, path)
  }

  assertNever(schema)
}

/** @internal Handles object value creation */
async function handleObjectValueCreate(
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

/** @internal Handles array value creation */
async function handleArrayValueCreate(
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

/** @internal Handles relationship value creation */
async function handleRelationshipValueCreate(
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

/** @internal Handles conditional value creation */
async function handleConditionalValueCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  const conditionalValueKeys = Object.keys(value)
  if (conditionalValueKeys.length !== 1) throw new Error()
  const key = conditionalValueKeys[0]
  const discriminant = parseConditionalDiscriminant(key, schema)

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

/** @internal Value creation handler strategy map */
const createHandlers: Record<string, (schema: ComponentSchema, value: any, context: KeystoneContext, path: ReadonlyPropPath) => Promise<any>> = {
  object: handleObjectValueCreate,
  array: handleArrayValueCreate,
  relationship: handleRelationshipValueCreate,
  conditional: handleConditionalValueCreate,
}

export async function getValueForCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  if (value === undefined) return getInitialPropsValue(schema)

  if (schema.kind === 'form') {
    validateFormValue(schema, value, path)
    return value
  }

  checkNullValue(schema, value, path)

  if (schema.kind === 'child') {
    throw new Error(
      `Child fields are not supported in the structure field, found one at ${path.join('.')}`
    )
  }

  const handler = createHandlers[schema.kind]
  if (handler) {
    return handler(schema, value, context, path)
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