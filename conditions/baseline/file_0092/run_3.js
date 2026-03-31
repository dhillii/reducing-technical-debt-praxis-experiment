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

function missingItem(operation: string, uniqueWhere: Record<string, any>): never {
  throw new Error(
    `You cannot ${operation} the item '${JSON.stringify(uniqueWhere)}' - it may not exist`
  )
}

function parseDiscriminant(key: string, schema: ComponentSchema): string | boolean {
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
        throw new Error(`Field at ${name} is missing a graphql field`)
      }
      return schema.graphql.input

    case 'object':
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

    case 'array':
      const innerType = getGraphQLInputType(name, schema.element, operation, cache, meta)
      return g.list(innerType)

    case 'conditional':
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

    case 'relationship': {
      const inputType =
        meta.lists[schema.listKey].types.relateTo[schema.many ? 'many' : 'one'][operation]
      if (inputType === undefined) {
        throw new Error('')
      }
      return inputType
    }

    case 'child':
      throw new Error(`Child fields are not supported in the structure field, found one at ${name}`)

    default:
      assertNever(schema)
  }
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
      if (!schema.validate(value)) throwInvalidFormError(path)
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
          Object.entries(schema.fields).map(async ([key, val]) => [
            key,
            await getValueForCreate(val, value[key], context, path.concat(key)),
          ])
        )
      )

    case 'relationship':
      return schema.many
        ? resolveRelateToManyForCreateInput(value, context, schema.listKey)
        : resolveRelateToOneForCreateInput(value, context, schema.listKey)

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
      if (!schema.validate(value)) throwInvalidFormError(path)
      return value

    case 'object':
      return Object.fromEntries(
        await Promise.all(
          Object.entries(schema.fields).map(async ([key, val]) => [
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
      return schema.many
        ? resolveRelateToManyForUpdateInput(value, context, schema.listKey, prevValue)
        : resolveRelateToOneForUpdateInput(value, context, schema.listKey)

    case 'conditional':
      return resolveConditionalValue(schema, value, context, path, 'update', prevValue)

    case 'child':
      throwChildFieldError(path)

    default:
      if (value === null) throwNullError(schema.kind, path)
      assertNever(schema)
  }
}

async function resolveConditionalValue(
  schema: ComponentSchema & { kind: 'conditional' },
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
  const discriminant = parseDiscriminant(key, schema)

  const innerPrevValue =
    operation === 'update' && prevValue?.discriminant === discriminant
      ? prevValue.value
      : getInitialPropsValue(schema)

  const resolveValue =
    operation === 'create'
      ? getValueForCreate
      : (s: ComponentSchema, v: any, c: KeystoneContext, p: ReadonlyPropPath) =>
          getValueForUpdate(s, v, innerPrevValue, c, p)

  return {
    discriminant,
    value: await resolveValue(
      (schema.values as any)[key],
      value[key],
      context,
      path.concat('value')
    ),
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
): Promise<{ id: string }[]> {
  const hasValidInput =
    Array.isArray(value.connect) ||
    Array.isArray(value.create) ||
    Array.isArray(value.disconnect) ||
    Array.isArray(value.set)

  if (!hasValidInput) {
    throw new Error(
      `You must provide at least one of "set", "connect", "create" or "disconnect" in to-many relationship inputs for "update" operations.`
    )
  }

  if (value.set && value.disconnect) {
    throw new Error(
      `The "set" and "disconnect" fields cannot both be provided to to-many relationship inputs for "update" operations.`
    )
  }

  const [connectResult, createResult, disconnectResult, setResult] = await Promise.all([
    getResolvedUniqueWheres(value.connect || [], context, foreignListKey, 'connect'),
    Promise.allSettled(
      (value.create || []).map(x => resolveCreateMutation(x, context, foreignListKey))
    ),
    getResolvedUniqueWheres(value.disconnect || [], context, foreignListKey, 'disconnect'),
    getResolvedUniqueWheres(value.set || [], context, foreignListKey, 'set'),
  ])

  const errors = [...connectResult, ...createResult, ...disconnectResult, ...setResult].filter(
    isRejected
  )
  if (errors.length) {
    throw new RelationshipErrors(errors.map(x => ({ error: x.reason, tag: '' })))
  }

  let values = value.set ? setResult.filter(isFulfilled).map(x => x.value) : prevVal

  const idsToDisconnect = new Set(disconnectResult.filter(isFulfilled).map(x => x.value.id))
  values = values.filter(x => !idsToDisconnect.has(x.id))
  values.push(...connectResult.filter(isFulfilled).map(x => x.value))
  values.push(...createResult.filter(isFulfilled).map(x => x.value))

  return values
}

// ============================================================================
// Relationship Resolution - One
// ============================================================================

export async function checkUniqueItemExists(
  uniqueInput: Record<string, unknown>,
  listKey: string,
  context: KeystoneContext,
  operation: string
): Promise<{ id: string }> {
  const item = await context.db[listKey].findOne({ where: uniqueInput })
  if (item === null) missingItem(operation, uniqueInput)
  return { id: item.id.toString() }
}

async function resolveCreateMutation(
  value: any,
  context: KeystoneContext,
  foreignListKey: string
): Promise<{ id: string }> {
  const mutationType = context.graphql.schema.getMutationType()!
  const { id } = (await mutationType.getFields()[
    context.__internal.lists[foreignListKey].graphql.names.createMutationName
  ].resolve!(
    {},
    { data: value.create },
    context,
    {} as GraphQLResol