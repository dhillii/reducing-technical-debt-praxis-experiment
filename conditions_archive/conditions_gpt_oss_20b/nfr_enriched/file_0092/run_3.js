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

function getGraphQLInputTypeInner(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  switch (schema.kind) {
    case 'form':
      return getFormInputType(name, schema)
    case 'object':
      return buildObjectInput(name, schema, operation, cache, meta)
    case 'array':
      return g.list(getGraphQLInputType(name, schema.element, operation, cache, meta))
    case 'conditional':
      return buildConditionalInput(name, schema, operation, cache, meta)
    case 'relationship':
      return getRelationshipInput(schema, meta, operation)
    case 'child':
      throw new Error(`Child fields are not supported in the structure field, found one at ${name}`)
    default:
      assertNever(schema)
  }
}

function getFormInputType(name: string, schema: ComponentSchema): GInputType {
  if (!schema.graphql) {
    throw new Error(`Field at ${name} is missing a graphql field`)
  }
  return schema.graphql.input
}

function buildObjectInput(
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

function buildConditionalInput(
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

function getRelationshipInput(
  schema: ComponentSchema,
  meta: FieldData,
  operation: 'create' | 'update'
): GInputType {
  const inputType =
    meta.lists[schema.listKey].types.relateTo[schema.many ? 'many' : 'one'][operation]
  if (inputType === undefined) {
    throw new Error(`Missing relationship input type for ${schema.listKey}`)
  }
  return inputType
}

/* -------------------------------------------------------------------------- */
/* Value resolution helpers                                                    */
/* -------------------------------------------------------------------------- */

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
      return handleFormUpdate(schema, value, path)
    case 'object':
      return handleObjectUpdate(schema, value, prevValue, context, path)
    case 'array':
      return handleArrayUpdate(schema, value, prevValue, context, path)
    case 'relationship':
      return handleRelationshipUpdate(schema, value, context, prevValue)
    case 'conditional':
      return handleConditionalUpdate(schema, value, prevValue, context, path)
    case 'child':
      throw new Error(
        `Child fields are not supported in the structure field, found one at ${path.join('.')}`
      )
    default:
      assertNever(schema)
  }
}

function handleFormUpdate(schema: ComponentSchema, value: any, path: ReadonlyPropPath): any {
  if (schema.validate(value)) return value
  throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
}

async function handleObjectUpdate(
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

async function handleArrayUpdate(
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

async function handleRelationshipUpdate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  prevValue: any
): Promise<any> {
  if (schema.many) {
    const val = (value as InferValueFromArg<
      GArg<NonNullable<GraphQLTypesForList['relateTo']['many']['update']>>
    >)!
    return resolveRelateToManyForUpdateInput(val, context, schema.listKey, prevValue)
  }
  const val = (value as InferValueFromArg<
    GArg<NonNullable<GraphQLTypesForList['relateTo']['one']['update']>>
  >)!
  return resolveRelateToOneForUpdateInput(val, context, schema.listKey)
}

async function handleConditionalUpdate(
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

export async function getValueForCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  if (value === undefined) return getInitialPropsValue(schema)

  switch (schema.kind) {
    case 'form':
      return handleFormCreate(schema, value, path)
    case 'array':
      return handleArrayCreate(schema, value, context, path)
    case 'object':
      return handleObjectCreate(schema, value, context, path)
    case 'relationship':
      return handleRelationshipCreate(schema, value, context)
    case 'conditional':
      return handleConditionalCreate(schema, value, context, path)
    case 'child':
      throw new Error(
        `Child fields are not supported in the structure field, found one at ${path.join('.')}`
      )
    default:
      assertNever(schema)
  }
}

function handleFormCreate(schema: ComponentSchema, value: any, path: ReadonlyPropPath): any {
  if (schema.validate(value)) return value
  throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
}

async function handleArrayCreate(
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

async function handleObjectCreate(
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

async function handleRelationshipCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext
): Promise<any> {
  if (schema.many) {
    const val = (value as InferValueFromArg<
      GArg<NonNullable<GraphQLTypesForList['relateTo']['many']['create']>>
    >)!
    return resolveRelateToManyForCreateInput(val, context, schema.listKey)
  }
  const val = (value as InferValueFromArg<
    GArg<NonNullable<GraphQLTypesForList['relateTo']['one']['create']>>
  >)!
  return resolveRelateToOneForCreateInput(val, context, schema.listKey)
}

async function handleConditionalCreate(
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

/* -------------------------------------------------------------------------- */
/* Relationship helpers                                                       */
/* -------------------------------------------------------------------------- */

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
  validateCreateManyInput(value)

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
  validateUpdateManyInput(value)

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

/* -------------------------------------------------------------------------- */
/* ONE relationship helpers                                                  */
/* -------------------------------------------------------------------------- */

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
  if (item === null) missingItem(operation, uniqueInput)

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

/* -------------------------------------------------------------------------- */
/* Validation helpers for relationship inputs                               */
/* -------------------------------------------------------------------------- */

function validateCreateManyInput(value: _CreateValueManyType) {
  if (!Array.isArray(value.connect) && !Array.isArray(value.create)) {
    throw new Error(
      `You must provide "connect" or "create" in to-many relationship inputs for "create" operations.`
    )
  }
}

function validateUpdateManyInput(value: _UpdateValueManyType) {
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
}