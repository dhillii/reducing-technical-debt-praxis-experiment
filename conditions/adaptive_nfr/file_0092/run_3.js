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
  errors: { error: Error; tag: string }[]
  constructor(errors: { error: Error; tag: string }[]) {
    super('Multiple relationship errors')
    this.errors = errors
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

function throwMissingItem(operation: string, uniqueWhere: Record<string, any>): never {
  throw new Error(
    `You cannot ${operation} the item '${JSON.stringify(uniqueWhere)}' - it may not exist`
  )
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
        throw new Error(`Field at ${name} is missing a graphql field`)
      }
      return schema.graphql.input

    case 'object':
      return createObjectInputType(name, schema, operation, cache, meta)

    case 'array':
      return createArrayInputType(name, schema, operation, cache, meta)

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
  schema: Extract<ComponentSchema, { kind: 'object' }>,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  return g.inputObject({
    name: `${name}${capitalizeFirstLetter(operation)}Input`,
    fields: () =>
      Object.fromEntries(
        Object.entries(schema.fields).map(([key, val]): [string, GArg<GInputType>] => {
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

function createArrayInputType(
  name: string,
  schema: Extract<ComponentSchema, { kind: 'array' }>,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  const innerType = getGraphQLInputType(name, schema.element, operation, cache, meta)
  return g.list(innerType)
}

function createConditionalInputType(
  name: string,
  schema: Extract<ComponentSchema, { kind: 'conditional' }>,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  return g.inputObject({
    name: `${name}${capitalizeFirstLetter(operation)}Input`,
    fields: () =>
      Object.fromEntries(
        Object.entries(schema.values).map(([key, val]): [string, GArg<GInputType>] => {
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
  schema: Extract<ComponentSchema, { kind: 'relationship' }>,
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
  if (value === undefined) return getInitialPropsValue(schema)

  switch (schema.kind) {
    case 'form':
      if (schema.validate(value)) return value
      throwInvalidFormError(path)

    case 'object':
      return resolveObjectValue(schema, value, context, path, 'create')

    case 'array':
      return resolveArrayValue(schema, value, context, path, 'create')

    case 'relationship':
      return resolveRelationshipForCreate(schema, value, context)

    case 'conditional':
      return resolveConditionalValue(schema, value, context, path, 'create')

    case 'child':
      throwChildFieldError(path)

    default:
      if (value === null) throwNullError(schema.kind, path)
      assertNever(schema)
  }
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
  if (value === undefined) return prevValue
  if (prevValue === undefined) {
    prevValue = getInitialPropsValue(schema)
  }

  switch (schema.kind) {
    case 'form':
      if (schema.validate(value)) return value
      throwInvalidFormError(path)

    case 'object':
      return resolveObjectValue(schema, value, context, path, 'update', prevValue)

    case 'array':
      return resolveArrayValue(schema, value, context, path, 'update', prevValue)

    case 'relationship':
      return resolveRelationshipForUpdate(schema, value, context, prevValue)

    case 'conditional':
      return resolveConditionalValue(schema, value, context, path, 'update', prevValue)

    case 'child':
      throwChildFieldError(path)

    default:
      if (value === null) throwNullError(schema.kind, path)
      assertNever(schema)
  }
}

async function resolveObjectValue(
  schema: Extract<ComponentSchema, { kind: 'object' }>,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath,
  operation: 'create' | 'update',
  prevValue?: any
): Promise<any> {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(schema.fields).map(async ([key, val]) => {
        const resolver = operation === 'create' ? getValueForCreate : getValueForUpdate
        const args =
          operation === 'create'
            ? [val, value[key], context, path.concat(key)]
            : [val, value[key], prevValue?.[key], context, path.concat(key)]
        return [key, await resolver(...(args as any))]
      })
    )
  )
}

async function resolveArrayValue(
  schema: Extract<ComponentSchema, { kind: 'array' }>,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath,
  operation: 'create' | 'update',
  prevValue?: any
): Promise<any> {
  const resolver = operation === 'create' ? getValueForCreate : getValueForUpdate
  return Promise.all(
    (value as any[]).map((val, i) => {
      const args =
        operation === 'create'
          ? [schema.element, val, context, path.concat(i)]
          : [schema.element, val, prevValue?.[i], context, path.concat(i)]
      return resolver(...(args as any))
    })
  )
}

function resolveRelationshipForCreate(
  schema: Extract<ComponentSchema, { kind: 'relationship' }>,
  value: any,
  context: KeystoneContext
): Promise<any> {
  if (schema.many) {
    return resolveRelateToManyForCreateInput(value, context, schema.listKey)
  } else {
    return resolveRelateToOneForCreateInput(value, context, schema.listKey)
  }
}

function resolveRelationshipForUpdate(
  schema: Extract<ComponentSchema, { kind: 'relationship' }>,
  value: any,
  context: KeystoneContext,
  prevValue: any
): Promise<any> {
  if (schema.many) {
    return resolveRelateToManyForUpdateInput(value, context, schema.listKey, prevValue)
  } else {
    return resolveRelateToOneForUpdateInput(value, context, schema.listKey)
  }
}

async function resolveConditionalValue(
  schema: Extract<ComponentSchema, { kind: 'conditional' }>,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath,
  operation: 'create' | 'update',
  prevValue?: any
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
  const discriminant = parseDiscriminant(key, schema.discriminant)

  const resolver = operation === 'create' ? getValueForCreate : getValueForUpdate
  const prevValueForKey =
    prevValue?.discriminant === discriminant ? prevValue.value : getInitialPropsValue(schema)

  const args =
    operation === 'create'
      ? [(schema.values as any)[key], value[key], context, path.concat('value')]
      : [(schema.values as any)[key], value[key], prevValueForKey, context, path.concat('value')]

  return {
    discriminant,
    value: await resolver(...(args as any)),
  }
}

function parseDiscriminant(key: string, discriminantSchema: any): string | boolean {
  if ((key === 'true' || key === 'false') && !discriminantSchema.validate(key)) {
    return key === 'true'
  }
  return key
}

// ============================================================================
// Relationship Resolution - Many
// ============================================================================

function getResolvedUniqueWheres(
  uniqueInputs: Record<string, any>[],
  context: KeystoneContext,
  foreignListKey: string,
  operation: string
): Promise<{ id: string }>[] {
  return uniqueInputs.map(uniqueInput =>
    checkUniqueItemExists(uniqueInput, foreignListKey, context, operation)
  )
}

export async function resolveRelateToManyForCreateInput(
  value: _CreateValueManyType,
  context: KeystoneContext,
  foreignListKey: string,
  tag?: string
): Promise<any> {
  if (!Array.isArray(value.connect) && !Array.isArray(value.create)) {
    throw new Error(
      `You must provide "connect" or "create" in to-many relationship inputs for "create" operations.`
    )
  }

  const [connectResult, createResult] = await Promise.all([
    Promise.allSettled(
      getResolvedUniqueWheres(value.connect || [], context, foreignListKey, 'connect')
    ),
    Promise.allSettled(
      (value.create || []).map(x => resolveCreateMutation(x, context, foreignListKey))
    ),
  ])

  const errors = [...connectResult, ...createResult].filter(isRejected)
  if (errors.length) {
    throw new RelationshipErrors(errors.map(x => ({ error: x.reason, tag: tag || '' })))
  }

  return [...connectResult, ...createResult].filter(isFulfilled).map(x => x.value)
}

export async function resolveRelateToManyForUpdateInput(
  value: _UpdateValueManyType,
  context: KeystoneContext,
  foreignListKey: string,
  prevVal: { id: string }[]
): Promise<any> {
  validateManyUpdateInput(value)

  const [connectResult, createResult, disconnectResult, setResult] = await Promise.all([
    Promise.allSettled(
      getResolvedUnique