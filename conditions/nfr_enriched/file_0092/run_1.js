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

// ============================================================================
// Type Definitions
// ============================================================================

type _CreateValueManyType = Exclude<
  InferValueFromArg<GArg<Exclude<GraphQLTypesForList['relateTo']['many']['create'], undefined>>>,
  null | undefined
>

type _UpdateValueManyType = Exclude<
  InferValueFromArg<GArg<Exclude<GraphQLTypesForList['relateTo']['many']['update'], undefined>>>,
  null | undefined
>

type _CreateValueType = Exclude<
  InferValueFromArg<GArg<Exclude<GraphQLTypesForList['relateTo']['one']['create'], undefined>>>,
  null | undefined
>

type _UpdateValueType = Exclude<
  InferValueFromArg<
    GArg<GNonNull<Exclude<GraphQLTypesForList['relateTo']['one']['update'], undefined>>>
  >,
  null | undefined
>

// ============================================================================
// Error Classes
// ============================================================================

export class RelationshipErrors extends Error {
  constructor(public errors: { error: Error; tag: string }[]) {
    super('Multiple relationship errors')
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

export const isFulfilled = <T>(arg: PromiseSettledResult<T>): arg is PromiseFulfilledResult<T> =>
  arg.status === 'fulfilled'

export const isRejected = (arg: PromiseSettledResult<any>): arg is PromiseRejectedResult =>
  arg.status === 'rejected'

function capitalizeFirstLetter(str: string): string {
  return str[0].toUpperCase() + str.slice(1)
}

function formatPath(path: ReadonlyPropPath): string {
  return path.join('.')
}

function throwNullError(kind: string, path: ReadonlyPropPath): never {
  throw new Error(
    `${capitalizeFirstLetter(kind)} fields cannot be set to null but the field at '${formatPath(path)}' is null`
  )
}

function throwInvalidFormError(path: ReadonlyPropPath): never {
  throw new Error(`The value of the form field at '${formatPath(path)}' is invalid`)
}

function throwChildFieldError(path: ReadonlyPropPath): never {
  throw new Error(
    `Child fields are not supported in the structure field, found one at ${formatPath(path)}`
  )
}

function throwMissingGraphQLError(name: string): never {
  throw new Error(`Field at ${name} is missing a graphql field`)
}

function throwMissingItem(operation: string, uniqueWhere: Record<string, any>): never {
  throw new Error(
    `You cannot ${operation} the item '${JSON.stringify(uniqueWhere)}' - it may not exist`
  )
}

function parseBooleanDiscriminant(key: string, schema: any): string | boolean {
  if ((key === 'true' || key === 'false') && !schema.discriminant.validate(key)) {
    return key === 'true'
  }
  return key
}

// ============================================================================
// GraphQL Input Type Generation
// ============================================================================

export function getGraphQLInputType(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  if (!cache.has(schema)) {
    const res = getGraphQLInputTypeInner(name, schema, operation, cache, meta)
    cache.set(schema, res)
  }
  return cache.get(schema)!
}

function getGraphQLInputTypeInner(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  switch (schema.kind) {
    case 'form':
      if (!schema.graphql) {
        throwMissingGraphQLError(name)
      }
      return schema.graphql.input

    case 'object':
      return createObjectInputType(name, schema, operation, cache, meta)

    case 'array':
      const innerType = getGraphQLInputType(name, schema.element, operation, cache, meta)
      return g.list(innerType)

    case 'conditional':
      return createConditionalInputType(name, schema, operation, cache, meta)

    case 'relationship':
      return getRelationshipInputType(schema, meta, operation)

    case 'child':
      throwChildFieldError([name])

    default:
      assertNever(schema)
  }
}

function createObjectInputType(
  name: string,
  schema: any,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  return g.inputObject({
    name: `${name}${capitalizeFirstLetter(operation)}Input`,
    fields: () =>
      Object.fromEntries(
        Object.entries(schema.fields).map(([key, val]: [string, any]): [string, GArg<GInputType>] => {
          const type = getGraphQLInputType(
            `${name}${capitalizeFirstLetter(key)}`,
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

function createConditionalInputType(
  name: string,
  schema: any,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  return g.inputObject({
    name: `${name}${capitalizeFirstLetter(operation)}Input`,
    fields: () =>
      Object.fromEntries(
        Object.entries(schema.values).map(([key, val]: [string, any]): [string, GArg<GInputType>] => {
          const type = getGraphQLInputType(
            `${name}${capitalizeFirstLetter(key)}`,
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

function getRelationshipInputType(
  schema: any,
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

// ============================================================================
// Value Resolution for Create Operations
// ============================================================================

export async function getValueForCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  if (value === undefined) {
    return getInitialPropsValue(schema)
  }

  switch (schema.kind) {
    case 'form':
      if (!schema.validate(value)) {
        throwInvalidFormError(path)
      }
      return value

    case 'array':
      return Promise.all(
        (value as any[]).map((val, i) =>
          getValueForCreate(schema.element, val, context, path.concat(i))
        )
      )

    case 'object':
      return Object.fromEntries(
        await Promise.all(
          Object.entries(schema.fields).map(async ([key, val]: [string, any]) => [
            key,
            await getValueForCreate(val, value[key], context, path.concat(key)),
          ])
        )
      )

    case 'relationship':
      return resolveRelationshipForCreate(schema, value, context, path)

    case 'conditional':
      return resolveConditionalForCreate(schema, value, context, path)

    case 'child':
      throwChildFieldError(path)

    default:
      if (value === null) {
        throwNullError(schema.kind, path)
      }
      assertNever(schema)
  }
}

function resolveRelationshipForCreate(
  schema: any,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  if (schema.many) {
    return resolveRelateToManyForCreateInput(value, context, schema.listKey)
  }
  return resolveRelateToOneForCreateInput(value, context, schema.listKey)
}

function resolveConditionalForCreate(
  schema: any,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  const conditionalValueKeys = Object.keys(value)
  if (conditionalValueKeys.length !== 1) {
    throw new Error()
  }

  const key = conditionalValueKeys[0]
  const discriminant = parseBooleanDiscriminant(key, schema)

  return getValueForCreate(
    (schema.values as any)[key],
    value[key],
    context,
    path.concat('value')
  ).then(resolvedValue => ({
    discriminant,
    value: resolvedValue,
  }))
}

// ============================================================================
// Value Resolution for Update Operations
// ============================================================================

export async function getValueForUpdate(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  if (value === undefined) {
    return prevValue
  }

  if (prevValue === undefined) {
    prevValue = getInitialPropsValue(schema)
  }

  switch (schema.kind) {
    case 'form':
      if (!schema.validate(value)) {
        throwInvalidFormError(path)
      }
      return value

    case 'object':
      return Object.fromEntries(
        await Promise.all(
          Object.entries(schema.fields).map(async ([key, val]: [string, any]) => [
            key,
            await getValueForUpdate(val, value[key], prevValue[key], context, path.concat(key)),
          ])
        )
      )

    case 'array':
      return Promise.all(
        (value as any[]).map((val, i) =>
          getValueForUpdate(schema.element, val, prevValue[i], context, path.concat(i))
        )
      )

    case 'relationship':
      return resolveRelationshipForUpdate(schema, value, context, prevValue)

    case 'conditional':
      return resolveConditionalForUpdate(schema, value, prevValue, context, path)

    case 'child':
      throwChildFieldError(path)

    default:
      if (value === null) {
        throwNullError(schema.kind, path)
      }
      assertNever(schema)
  }
}

function resolveRelationshipForUpdate(
  schema: any,
  value: any,
  context: KeystoneContext,
  prevValue: any
): Promise<any> {
  if (schema.many) {
    return resolveRelateToManyForUpdateInput(value, context, schema.listKey, prevValue)
  }
  return resolveRelateToOneForUpdateInput(value, context, schema.listKey)
}

async function resolveConditionalForUpdate(
  schema: any,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  const conditionalValueKeys = Object.keys(value)
  if (conditionalValueKeys.length !== 1) {
    throw new Error(
      `Conditional field inputs must set exactly one of the fields but the field at ${formatPath(
        path
      )} has ${conditionalValueKeys.length} fields set`
    )
  }

  const key = conditionalValueKeys[0]
  const discriminant = parseBooleanDiscriminant(key, schema)
  const prevValueForKey =
    prevValue.discriminant === discriminant ? prevValue.value : getInitialPropsValue(schema)

  const resolvedValue = await getValueForUpdate(
    (schema.values as any)[key],
    value[key],
    prevValueForKey,
    context,
    path.concat('value')
  )

  return {
    discriminant,
    value: resolvedValue,
  }
}

// ============================================================================
// Relationship Resolution - Many
// ============================================================================

function getResolvedUniqueWheres(
  uniqueInputs: Record<string, any>[],
  context: KeystoneContext,
  foreignListKey: string,
  operation: string
): Promise<PromiseSettledResult<{ id: string }>[]> {
  return Promise.allSettled(
    uniqueInputs.map(uniqueInput =>
      checkUniqueItemExists(uniqueInput, foreignListKey, context, operation)
    )
  )
}

export async function resolveRelateToManyForCreateInput(
  value: _CreateValueManyType,
  context: KeystoneContext,
  foreignListKey: string,
  tag?: string
): Promise<{ id: string }[]> {
  if (!Array.isArray(value.connect) && !Array.isArray(value.create)) {
    throw new Error(
      `You must provide "connect" or "create" in to-many relationship inputs for "create" operations.`
    )
  }

  const [connectResult, createResult] = await Promise.all([
    getResolvedUniqueWheres(value.connect || [], context, foreignListKey, 'connect'),
    Promise.allSettled(
      (value.create || []).map(x => resolveCreateMutation(x, context, foreignListKey))
    ),
  ])

  const allResults = [...connectResult, ...createResult]
  const errors = allResults.filter(isRejected)

  if (errors.length) {
    throw new RelationshipErrors(errors.map(x => ({ error: x.reason, tag: tag || '' })))
  }

  return allResults.filter(isFulfilled).map(x => x.value)
}

export async function resolveRelateToManyForUpdateInput(
  value: _UpdateValueManyType,
  context: KeystoneContext,
  foreignListKey: string,
  prevVal: { id: string }[]
): Promise<{ id: string }[]> {
  validateManyUpdateInput(value)

  const [connectResult, createResult, disconnectResult, setResult] = await Promise.all([
    getResolvedUniqueWheres(value.connect || [], context, foreignListKey, 'connect'),
    Promise.allSettled(
      (value.create || []).map(x => resolveCreateMutation(x, context, foreignListKey))
    ),
    getResolvedUniqueWheres(value.disconnect || [], context, foreignListKey, 'disconnect'),
    getResolvedUniqueWheres(value.set || [], context, foreignListKey, 'set'),
  ])

  const allResults = [...connectResult, ...createResult, ...disconnectResult, ...setResult]
  const errors = allResults.filter(isRejected)

  if (errors.length) {
    throw new RelationshipErrors(errors.map(x => ({ error: x.reason, tag: '' })))
  }

  return buildManyUpdateResult(