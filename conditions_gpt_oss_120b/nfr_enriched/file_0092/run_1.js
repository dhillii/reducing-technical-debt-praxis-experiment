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

/**
 * Public entry point – caches generated GraphQL input types.
 */
export function getGraphQLInputType(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
) {
  if (!cache.has(schema)) {
    const res = buildGraphQLInputType(name, schema, operation, cache, meta)
    cache.set(schema, res)
  }
  return cache.get(schema)!
}

/**
 * Builds a GraphQL input type for a component schema.
 * Delegates to specialised builders per schema kind.
 */
function buildGraphQLInputType(
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
      return buildObjectInput(name, schema, operation, cache, meta)
    case 'array':
      return g.list(buildGraphQLInputType(name, schema.element, operation, cache, meta))
    case 'conditional':
      return buildConditionalInput(name, schema, operation, cache, meta)
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

/**
 * Returns the GraphQL input type for a form field.
 */
function getFormInputType(schema: ComponentSchema, name: string): GInputType {
  if (!schema.graphql) {
    throw new Error(`Field at ${name} is missing a graphql field`)
  }
  return schema.graphql.input
}

/**
 * Builds an input object for an object schema.
 */
function buildObjectInput(
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

/**
 * Builds an input object for a conditional schema.
 */
function buildConditionalInput(
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

/**
 * Maps a record of child schemas to GraphQL arguments.
 */
function mapSchemaFieldsToArgs(
  parentName: string,
  fields: Record<string, ComponentSchema>,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, childSchema]) => {
      const argName = `${parentName}${capitalize(key)}`
      const type = buildGraphQLInputType(argName, childSchema, operation, cache, meta)
      return [key, g.arg({ type })]
    })
  )
}

/**
 * Retrieves the appropriate relationship input type for the operation.
 */
function getRelationshipInputType(
  schema: ComponentSchema,
  meta: FieldData,
  operation: 'create' | 'update'
) {
  const inputType = meta.lists[schema.listKey].types.relateTo[
    schema.many ? 'many' : 'one'
  ][operation]
  if (inputType === undefined) {
    throw new Error('')
  }
  return inputType
}

/**
 * Capitalises the first character of a string.
 */
function capitalize(str: string) {
  return str[0].toUpperCase() + str.slice(1)
}

/**
 * Retrieves a value for an update operation, delegating per schema kind.
 */
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

/**
 * Validates and returns a form field value for update.
 */
function handleFormUpdate(schema: ComponentSchema, value: any, path: ReadonlyPropPath) {
  if (schema.validate(value)) return value
  throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
}

/**
 * Recursively updates an object field.
 */
async function handleObjectUpdate(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
) {
  const entries = await Promise.all(
    Object.entries(schema.fields).map(async ([key, childSchema]) => [
      key,
      await getValueForUpdate(
        childSchema,
        value[key],
        prevValue[key],
        context,
        path.concat(key)
      ),
    ])
  )
  return Object.fromEntries(entries)
}

/**
 * Recursively updates an array field.
 */
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

/**
 * Handles relationship updates (to-one or to-many).
 */
function handleRelationshipUpdate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  prevValue: any
) {
  if (schema.many) {
    const val = value as InferValueFromArg<
      GArg<NonNullable<GraphQLTypesForList['relateTo']['many']['update']>>
    >
    return resolveRelateToManyForUpdateInput(val, context, schema.listKey, prevValue)
  }
  const val = value as InferValueFromArg<
    GArg<NonNullable<GraphQLTypesForList['relateTo']['one']['update']>>
  >
  return resolveRelateToOneForUpdateInput(val, context, schema.listKey)
}

/**
 * Handles conditional field updates.
 */
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
  const prev = prevValue.discriminant === discriminant ? prevValue.value : getInitialPropsValue(schema)
  return {
    discriminant,
    value: await getValueForUpdate(
      (schema.values as any)[key],
      value[key],
      prev,
      context,
      path.concat('value')
    ),
  }
}

/**
 * Retrieves a value for a create operation, delegating per schema kind.
 */
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
    case 'object':
      return handleObjectCreate(schema, value, context, path)
    case 'array':
      return handleArrayCreate(schema, value, context, path)
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

/**
 * Validates and returns a form field value for create.
 */
function handleFormCreate(schema: ComponentSchema, value: any, path: ReadonlyPropPath) {
  if (schema.validate(value)) return value
  throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
}

/**
 * Recursively creates an object field.
 */
async function handleObjectCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
) {
  const entries = await Promise.all(
    Object.entries(schema.fields).map(async ([key, childSchema]) => [
      key,
      await getValueForCreate(childSchema, value[key], context, path.concat(key)),
    ])
  )
  return Object.fromEntries(entries)
}

/**
 * Recursively creates an array field.
 */
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

/**
 * Handles relationship creation (to-one or to-many).
 */
function handleRelationshipCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext
) {
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

/**
 * Handles conditional field creation.
 */
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

/**
 * Resolves a to-many relationship for a create operation.
 */
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

/**
 * Resolves a to-many relationship for an update operation.
 */
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

  const connectPromises = getResolvedUniqueWheres(value.connect || [], context, foreignListKey, 'connect')
  const disconnectPromises = getResolvedUniqueWheres(value.disconnect || [], context, foreignListKey, 'disconnect')
  const setPromises = getResolvedUniqueWheres(value.set || [], context, foreignListKey, 'set')
  const createPromises = (value.create || []).map(x => resolveCreateMutation(x, context, foreignListKey))

  const [connectResults, createResults, disconnectResults, setResults] = await Promise.all([
    Promise.allSettled(connectPromises),
    Promise.allSettled(createPromises),
    Promise.allSettled(disconnectPromises),
    Promise.allSettled(setPromises),
  ])

  const errors = [...connectResults, ...createResults, ...disconnectResults, ...setResults].filter(isRejected)
  if (errors.length) {
    throw new RelationshipErrors(errors.map(x => ({ error: x.reason, tag: '' })))
  }

  let values = prevVal
  if (value.set) {
    values = setResults.filter(isFulfilled).map(x => x.value)
  }

  const idsToDisconnect = new Set(disconnectResults.filter(isFulfilled).map(x => x.value.id))
  values = values.filter(x => !idsToDisconnect.has(x.id))
  values.push(...connectResults.filter(isFulfilled).map(x => x.value))
  values.push(...createResults.filter(isFulfilled).map(x => x.value))

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

/**
 * Checks that a unique item exists for a relationship operation.
 */
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

/**
 * Handles both connect and create for to-one relationships.
 */
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

/**
 * Executes a nested create mutation for a related item.
 */
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

/**
 * Resolves a to-one relationship for a create operation.
 */
export function resolveRelateToOneForCreateInput(
  value: _CreateValueType,
  context: KeystoneContext,
  foreignListKey: string
) {
  if (Object.keys(value).length !== 1) {
    throw new Error(
      `You must provide "connect" or "create" in to-one relationship inputs for "create" operations.`
    )
  }
  return handleCreateAndUpdate(value, context, foreignListKey)
}

/**
 * Resolves a to-one relationship for an update operation.
 */
export function resolveRelateToOneForUpdateInput(
  value: _UpdateValueType,
  context: KeystoneContext,
  foreignListKey: string
) {
  if (Object.keys(value).length !== 1) {
    throw new Error(
      `You must provide one of "connect", "create" or "disconnect" in to-one relationship inputs for "update" operations.`
    )
  }
  if (value.connect || value.create) {
    return handleCreateAndUpdate(value as any, context, foreignListKey)
  }
  if (value.disconnect) {
    return null
  }
}

/**
 * Helper to determine if a settled promise is fulfilled.
 */
export const isFulfilled = <T>(arg: PromiseSettledResult<T>): arg is PromiseFulfilledResult<T> =>
  arg.status === 'fulfilled'

/**
 * Helper to determine if a settled promise is rejected.
 */
export const isRejected = (arg: PromiseSettledResult<any>): arg is PromiseRejectedResult =>
  arg.status === 'rejected'

/**
 * Resolves an array of unique where inputs to their corresponding IDs.
 */
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