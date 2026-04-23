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

function createInputObjectFields(
  name: string,
  fields: Record<string, ComponentSchema>,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
) {
  return () =>
    Object.fromEntries(
      Object.entries(fields).map(([key, val]): [string, GArg<GInputType>] => {
        const type = getGraphQLInputType(
          `${name}${key[0].toUpperCase()}${key.slice(1)}`,
          val,
          operation,
          cache,
          meta
        )
        return [key, g.arg({ type })]
      })
    )
}

function getInputObjectName(name: string, operation: 'create' | 'update'): string {
  return `${name}${operation[0].toUpperCase()}${operation.slice(1)}Input`
}

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
    return g.inputObject({
      name: getInputObjectName(name, operation),
      fields: createInputObjectFields(name, schema.fields, operation, cache, meta),
    })
  }
  if (schema.kind === 'array') {
    const innerType = getGraphQLInputType(name, schema.element, operation, cache, meta)
    return g.list(innerType)
  }
  if (schema.kind === 'conditional') {
    return g.inputObject({
      name: getInputObjectName(name, operation),
      fields: createInputObjectFields(name, schema.values, operation, cache, meta),
    })
  }

  if (schema.kind === 'relationship') {
    const inputType =
      meta.lists[schema.listKey].types.relateTo[schema.many ? 'many' : 'one'][operation]
    if (inputType === undefined) {
      throw new Error('')
    }
    return inputType
  }
  if (schema.kind === 'child') {
    throw new Error(`Child fields are not supported in the structure field, found one at ${name}`)
  }

  assertNever(schema)
}

function validateFormValue(schema: ComponentSchema, value: any, path: ReadonlyPropPath): void {
  if (schema.kind === 'form' && !schema.validate(value)) {
    throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
  }
}

function validateNullValue(schema: ComponentSchema, value: any, path: ReadonlyPropPath): void {
  if (value === null) {
    throw new Error(
      `${schema.kind[0].toUpperCase() + schema.kind.slice(1)} fields cannot be set to null but the field at '${path.join('.')}' is null`
    )
  }
}

async function handleObjectValue(
  schema: ComponentSchema & { kind: 'object' },
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath,
  isCreate: boolean
): Promise<any> {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(schema.fields).map(async ([key, val]) => {
        const nextPrevValue = isCreate ? undefined : prevValue[key]
        return [
          key,
          await (isCreate ? getValueForCreate : getValueForUpdate)(
            val,
            value[key],
            isCreate ? context : { ...context, prevValue: nextPrevValue },
            path.concat(key)
          ),
        ]
      })
    )
  )
}

async function handleArrayValue(
  schema: ComponentSchema & { kind: 'array' },
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath,
  isCreate: boolean
): Promise<any> {
  return Promise.all(
    (value as any[]).map((val, i) =>
      isCreate
        ? getValueForCreate(schema.element, val, context, path.concat(i))
        : getValueForUpdate(schema.element, val, prevValue[i], context, path.concat(i))
    )
  )
}

async function handleRelationshipValue(
  schema: ComponentSchema & { kind: 'relationship' },
  value: any,
  prevValue: any,
  context: KeystoneContext,
  isCreate: boolean
): Promise<any> {
  if (schema.many) {
    return isCreate
      ? resolveRelateToManyForCreateInput(value, context, schema.listKey)
      : resolveRelateToManyForUpdateInput(value, context, schema.listKey, prevValue)
  } else {
    return isCreate
      ? resolveRelateToOneForCreateInput(value, context, schema.listKey)
      : resolveRelateToOneForUpdateInput(value, context, schema.listKey)
  }
}

async function handleConditionalValue(
  schema: ComponentSchema & { kind: 'conditional' },
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath,
  isCreate: boolean
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

  const nextPrevValue = isCreate
    ? getInitialPropsValue(schema)
    : prevValue.discriminant === discriminant
      ? prevValue.value
      : getInitialPropsValue(schema)

  return {
    discriminant,
    value: await (isCreate ? getValueForCreate : getValueForUpdate)(
      (schema.values as any)[key],
      value[key],
      isCreate ? context : nextPrevValue,
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
    validateFormValue(schema, value, path)
    return value
  }
  validateNullValue(schema, value, path)

  if (schema.kind === 'object') {
    return handleObjectValue(schema, value, prevValue, context, path, false)
  }
  if (schema.kind === 'array') {
    return handleArrayValue(schema, value, prevValue, context, path, false)
  }
  if (schema.kind === 'relationship') {
    return handleRelationshipValue(schema, value, prevValue, context, false)
  }
  if (schema.kind === 'conditional') {
    return handleConditionalValue(schema, value, prevValue, context, path, false)
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
    validateFormValue(schema, value, path)
    return value
  }
  validateNullValue(schema, value, path)

  if (schema.kind === 'array') {
    return handleArrayValue(schema, value, undefined, context, path, true)
  }
  if (schema.kind === 'object') {
    return handleObjectValue(schema, value, undefined, context, path, true)
  }
  if (schema.kind === 'relationship') {
    return handleRelationshipValue(schema, value, undefined, context, true)
  }
  if (schema.kind === 'conditional') {
    return handleConditionalValue(schema, value, undefined, context, path, true)
  }

  if (schema.kind === 'child') {
    throw new Error(
      `Child fields are not supported in the structure field, found one at ${path.join('.')}`
    )
  }

  assertNever(schema)
}

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
  }

  const connects = Promise.allSettled(
    getResolvedUniqueWheres(value.connect || [], context, foreignListKey, 'connect')
  )

  const creates = Promise.allSettled(
    (value.create || []).map(x => resolveCreateMutation(x, context, foreignListKey))
  )

  const [connectResult, createResult] = await Promise.all([connects, creates])

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
      `The "set" and "disconnect" fields cannot both be provided to to-many relationship inputs for "update" operations.`
    )
  }

  const connects = Promise.allSettled(
    getResolvedUniqueWheres(value.connect || [], context, foreignListKey, 'connect')
  )

  const disconnects = Promise.allSettled(
    getResolvedUniqueWheres(value.disconnect || [], context, foreignListKey, 'disconnect')
  )

  const sets = Promise.allSettled(
    getResolvedUniqueWheres(value.set || [], context, foreignListKey, 'set')
  )

  const creates = Promise.allSettled(
    (value.create || []).map(x => resolveCreateMutation(x, context, foreignListKey))
  )

  const [connectResult, createResult, disconnectResult, setResult] = await Promise.all([
    connects,
    creates,
    disconnects,
    sets,
  ])

  const errors = [...connectResult, ...createResult, ...disconnectResult, ...setResult].filter(
    isRejected
  )
  if (errors.length) throw new RelationshipErrors(errors.map(x => ({ error: x.reason, tag: '' })))

  let values = prevVal
  if (value.set) {
    values = setResult.filter(isFulfilled).map(x => x.value)
  }

  const idsToDisconnect = new Set(disconnectResult.filter(isFulfilled).map(x => x.value.id))
  values = values.filter(x => !idsToDisconnect.has(x.id))
  values.push(...connectResult.filter(isFulfilled).map(x => x.value))
  values.push(...createResult.filter(isFulfilled).map(x => x.value))

  return values
}

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

function missingItem(operation: string, uniqueWhere: Record<string, any>) {
  throw new Error(
    `You cannot ${operation} the item '${JSON.stringify(uniqueWhere)}' - it may not exist`
  )
}

export async function checkUniqueItemExists(
  uniqueInput: Record<string, unknown>,
  listKey: string,
  context: KeystoneContext,
  operation: string
) {
  const item = await context.db[listKey].findOne({ where: uniqueInput })
  if (item === null) throw missingItem(operation, uniqueInput)

  return { id: item.id.toString() }
}

async function handleCreateAndUpdate(
  value: _CreateValueType,
  context: KeystoneContext,
  foreignListKey: string
) {
  if (value.connect) return checkUniqueItemExists(value.connect, foreignListKey, context, 'connect')
  return resolveCreateMutation(value, context, foreignListKey)
}

async function resolveCreateMutation(value: any, context: KeystoneContext, foreignListKey: string) {
  const mutationType = context.graphql.schema.getMutationType()!
  const { id } = (await mutationType.getFields()[
    context.__internal.lists[foreignListKey].graphql.names.createMutationName
  ].resolve!(
    {},
    { data: value.create },
    context,
    {} as GraphQLResolveInfo
  )) as BaseItem
  return { id: id.toString() }
}

export function resolveRelateToOneForCreateInput(
  value: _CreateValueType,
  context: KeystoneContext,
  foreignListKey: string
) {
  const numOfKeys = Object.keys(value).length
  if (numOfKeys !== 1)
    throw new Error(
      `You must provide "connect" or "create" in to-one relationship inputs for "create" operations.`
    )
  return handleCreateAndUpdate(value, context, foreignListKey)
}

export function resolveRelateToOneForUpdateInput(
  value: _UpdateValueType,
  context: KeystoneContext,
  foreignListKey: string
) {
  if (Object.keys(value).length !== 1)
    throw new Error(
      `You must provide one of "connect", "create" or "disconnect" in to-one relationship inputs for "update" operations.`
    )

  if (value.connect || value.create) return handleCreateAndUpdate(value, context, foreignListKey)
  if (value.disconnect) return null
}