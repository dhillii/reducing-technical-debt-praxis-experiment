import { g } from '@keystone-6/core'
import type {
  GArg,
  GInputType,
  GNonNull,
  InferValueFromArg,
} from '@keystone-6/core/graphql-ts'
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
    const res = computeGraphQLInputType(name, schema, operation, cache, meta)
    cache.set(schema, res)
  }
  return cache.get(schema)!
}

/** Compute GraphQL input type for a schema node */
function computeGraphQLInputType(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  switch (schema.kind) {
    case 'form':
      return getFormInputType(schema, name)
    case 'object':
      return buildObjectInputType(name, schema, operation, cache, meta)
    case 'array':
      return g.list(getGraphQLInputType(name, schema.element, operation, cache, meta))
    case 'conditional':
      return buildConditionalInputType(name, schema, operation, cache, meta)
    case 'relationship':
      return getRelationshipInputType(schema, meta, operation)
    case 'child':
      throw new Error(
        `Child fields are not supported in the structure field, found one at ${name}`
      )
    default:
      assertNever(schema)
  }
}

/** Return input type for a form field */
function getFormInputType(schema: ComponentSchema, name: string): GInputType {
  if (!schema.graphql) {
    throw new Error(`Field at ${name} is missing a graphql field`)
  }
  return schema.graphql.input
}

/** Build input object for an object schema */
function buildObjectInputType(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
) {
  return g.inputObject({
    name: `${name}${capitalize(operation)}Input`,
    fields: () => mapSchemaFieldsToArgs(name, schema.fields, operation, cache, meta),
  })
}

/** Build input object for a conditional schema */
function buildConditionalInputType(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
) {
  return g.inputObject({
    name: `${name}${capitalize(operation)}Input`,
    fields: () => mapSchemaFieldsToArgs(name, schema.values, operation, cache, meta),
  })
}

/** Map schema fields to GraphQL arguments */
function mapSchemaFieldsToArgs(
  parentName: string,
  fields: Record<string, ComponentSchema>,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, val]) => {
      const type = getGraphQLInputType(
        `${parentName}${capitalize(key)}`,
        val,
        operation,
        cache,
        meta
      )
      return [key, g.arg({ type })]
    })
  )
}

/** Capitalize first character */
function capitalize(str: string) {
  return str[0].toUpperCase() + str.slice(1)
}

/** Retrieve relationship input type */
function getRelationshipInputType(
  schema: ComponentSchema,
  meta: FieldData,
  operation: 'create' | 'update'
) {
  const inputType =
    meta.lists[schema.listKey].types.relateTo[schema.many ? 'many' : 'one'][operation]
  if (inputType === undefined) {
    throw new Error('')
  }
  return inputType
}

/** Update value handling */
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
      return handleRelationshipUpdate(schema, value, prevValue, context)
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

/** Form field validation for update */
function handleFormUpdate(schema: ComponentSchema, value: any, path: ReadonlyPropPath) {
  if (schema.validate(value)) return value
  throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
}

/** Object field recursive update */
async function handleObjectUpdate(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
) {
  const entries = await Promise.all(
    Object.entries(schema.fields).map(async ([key, child]) => [
      key,
      await getValueForUpdate(
        child,
        value[key],
        prevValue[key],
        context,
        path.concat(key)
      ),
    ])
  )
  return Object.fromEntries(entries)
}

/** Array field recursive update */
function handleArrayUpdate(
  schema: ComponentSchema,
  value: any[],
  prevValue: any[],
  context: KeystoneContext,
  path: ReadonlyPropPath
) {
  return Promise.all(
    value.map((val, i) =>
      getValueForUpdate(schema.element, val, prevValue[i], context, path.concat(i))
    )
  )
}

/** Relationship field update */
function handleRelationshipUpdate(
  schema: ComponentSchema,
  value: any,
  _prevValue: any,
  context: KeystoneContext
) {
  if (schema.many) {
    const val = value as InferValueFromArg<
      GArg<NonNullable<GraphQLTypesForList['relateTo']['many']['update']>>
    >
    return resolveRelateToManyForUpdateInput(val, context, schema.listKey, _prevValue)
  }
  const val = value as InferValueFromArg<
    GArg<NonNullable<GraphQLTypesForList['relateTo']['one']['update']>>
  >
  return resolveRelateToOneForUpdateInput(val, context, schema.listKey)
}

/** Conditional field update */
async function handleConditionalUpdate(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
) {
  const keys = Object.keys(value)
  if (keys.length !== 1) {
    throw new Error(
      `Conditional field inputs must set exactly one of the fields but the field at ${path.join(
        '.'
      )} has ${keys.length} fields set`
    )
  }
  const key = keys[0]
  let discriminant: string | boolean = key
  if ((key === 'true' || key === 'false') && !schema.discriminant.validate(key)) {
    discriminant = key === 'true'
  }
  return {
    discriminant,
    value: await getValueForUpdate(
      (schema.values as any)[key],
      value[key],
      prevValue.discriminant === discriminant
        ? prevValue.value
        : getInitialPropsValue(schema),
      context,
      path.concat('value')
    ),
  }
}

/** Create value handling */
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

/** Form field validation for create */
function handleFormCreate(schema: ComponentSchema, value: any, path: ReadonlyPropPath) {
  if (schema.validate(value)) return value
  throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
}

/** Array field recursive create */
function handleArrayCreate(
  schema: ComponentSchema,
  value: any[],
  context: KeystoneContext,
  path: ReadonlyPropPath
) {
  return Promise.all(
    value.map((val, i) => getValueForCreate(schema.element, val, context, path.concat(i)))
  )
}

/** Object field recursive create */
async function handleObjectCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
) {
  const entries = await Promise.all(
    Object.entries(schema.fields).map(async ([key, child]) => [
      key,
      await getValueForCreate(child, value[key], context, path.concat(key)),
    ])
  )
  return Object.fromEntries(entries)
}

/** Relationship field create */
function handleRelationshipCreate(schema: ComponentSchema, value: any, context: KeystoneContext) {
  if (schema.many) {
    const val = value as InferValueFromArg<
      GArg<NonNullable<GraphQLTypesForList['relateTo']['many']['create']>>
    >
    return resolveRelateToManyForCreateInput(val, context, schema.listKey)
  }
  const val = value as InferValueFromArg<
    GArg<NonNullable<GraphQLTypesForList['relateTo']['one']['create']>>
  >
  return resolveRelateToOneForCreateInput(val, context, schema.listKey)
}

/** Conditional field create */
async function handleConditionalCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
) {
  if (value === null) throw new Error()
  const keys = Object.keys(value)
  if (keys.length !== 1) throw new Error()
  const key = keys[0]
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

/** Resolve many-to-many create input */
export async function resolveRelateToManyForCreateInput(
  value: _CreateValueManyType,
  context: KeystoneContext,
  foreignListKey: string,
  tag?: string
) {
  validateCreateManyInput(value)

  const connectPromises = getResolvedUniqueWheres(value.connect || [], context, foreignListKey, 'connect')
  const createPromises = (value.create || []).map(x => resolveCreateMutation(x, context, foreignListKey))

  const [connectResults, createResults] = await Promise.all([
    Promise.allSettled(connectPromises),
    Promise.allSettled(createPromises),
  ])

  const errors = [...connectResults, ...createResults].filter(isRejected)
  if (errors.length) {
    throw new RelationshipErrors(errors.map(x => ({ error: x.reason, tag: tag || '' })))
  }

  return [...connectResults, ...createResults]
    .filter(isFulfilled)
    .map(x => x.value)
}

/** Resolve many-to-many update input */
export async function resolveRelateToManyForUpdateInput(
  value: _UpdateValueManyType,
  context: KeystoneContext,
  foreignListKey: string,
  prevVal: { id: string }[]
) {
  validateUpdateManyInput(value)

  const connectPromises = getResolvedUniqueWheres(value.connect || [], context, foreignListKey, 'connect')
  const disconnectPromises = getResolvedUniqueWheres(value.disconnect || [], context, foreignListKey, 'disconnect')
  const setPromises = getResolvedUniqueWheres(value.set || [], context, foreignListKey, 'set')
  const createPromises = (value.create || []).map(x => resolveCreateMutation(x, context, foreignListKey))

  const [connectRes, createRes, disconnectRes, setRes] = await Promise.all([
    Promise.allSettled(connectPromises),
    Promise.allSettled(createPromises),
    Promise.allSettled(disconnectPromises),
    Promise.allSettled(setPromises),
  ])

  const errors = [...connectRes, ...createRes, ...disconnectRes, ...setRes].filter(isRejected)
  if (errors.length) throw new RelationshipErrors(errors.map(x => ({ error: x.reason, tag: '' })))

  let values = prevVal
  if (value.set) {
    values = setRes.filter(isFulfilled).map(x => x.value)
  }

  const idsToDisconnect = new Set(disconnectRes.filter(isFulfilled).map(x => x.value.id))
  values = values.filter(x => !idsToDisconnect.has(x.id))
  values.push(...connectRes.filter(isFulfilled).map(x => x.value))
  values.push(...createRes.filter(isFulfilled).map(x => x.value))

  return values
}

/** ONE */

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

/** Resolve to-one create input */
export function resolveRelateToOneForCreateInput(
  value: _CreateValueType,
  context: KeystoneContext,
  foreignListKey: string
) {
  ensureSingleKey(value, 'create')
  return handleCreateAndUpdate(value, context, foreignListKey)
}

/** Resolve to-one update input */
export function resolveRelateToOneForUpdateInput(
  value: _UpdateValueType,
  context: KeystoneContext,
  foreignListKey: string
) {
  ensureSingleKey(value, 'update')
  if (value.connect || value.create) return handleCreateAndUpdate(value, context, foreignListKey)
  return null // disconnect case
}

/** Helper: ensure exactly one key is present */
function ensureSingleKey(obj: Record<string, any>, operation: string) {
  if (Object.keys(obj).length !== 1) {
    throw new Error(
      `You must provide "${
        obj.connect ? 'connect' : obj.create ? 'create' : 'disconnect'
      }" in to-${operation === 'create' ? 'one' : 'one'} relationship inputs for "${operation}" operations.`
    )
  }
}

/** Helper: handle create or connect for to-one relationships */
async function handleCreateAndUpdate(
  value: _CreateValueType,
  context: KeystoneContext,
  foreignListKey: string
) {
  if (value.connect) {
    return checkUniqueItemExists(value.connect, foreignListKey, context, 'connect')
  }
  return resolveCreateMutation(value, context, foreignListKey)
}

/** Resolve a nested create mutation */
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

/** Validate many-to-many create input */
function validateCreateManyInput(value: _CreateValueManyType) {
  if (!Array.isArray(value.connect) && !Array.isArray(value.create)) {
    throw new Error(
      `You must provide "connect" or "create" in to-many relationship inputs for "create" operations.`
    )
  }
}

/** Validate many-to-many update input */
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

/** Resolve unique wheres */
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

/** Type guards for PromiseSettledResult */
export const isFulfilled = <T>(arg: PromiseSettledResult<T>): arg is PromiseFulfilledResult<T> =>
  arg.status === 'fulfilled'
export const isRejected = (arg: PromiseSettledResult<any>): arg is PromiseRejectedResult =>
  arg.status === 'rejected'