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

// Helper: Extracts GraphQL input object type for given schema kind
function createObjectLikeInput(
  name: string,
  operation: 'create' | 'update',
  fields: Record<string, any>
) {
  const inputName = `${name}${operation[0].toUpperCase()}${operation.slice(1)}Input`
  const fieldEntries = Object.entries(fields).map(([key, val]): [string, GArg<GInputType>] => {
    const type = getGraphQLInputType(`${name}${key[0].toUpperCase()}${key.slice(1)}`, val, operation, cache, meta)
    return [key, g.arg({ type })]
  })
  return g.inputObject({ name: inputName, fields: () => Object.fromEntries(fieldEntries) })
}

// Helper: Validates and extracts form field value
function getFormValue(schema: ComponentSchema, value: any, path: string): any {
  if (!schema.validate(value)) {
    throw new Error(`The value of the form field at '${path}' is invalid`)
  }
  return value
}

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
    case 'form': {
      if (!schema.graphql) {
        throw new Error(`Field at ${name} is missing a graphql field`)
      }
      return schema.graphql.input
    }

    case 'object':
      return createObjectLikeInput(name, operation, schema.fields)

    case 'array':
      return g.list(getGraphQLInputType(name, schema.element, operation, cache, meta))

    case 'conditional': {
      return createObjectLikeInput(name, operation, schema.values)
    }

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

  const pathStr = path.join('.')

  if (schema.kind === 'form') {
    return getFormValue(schema, value, pathStr)
  }

  if (value === null) {
    throw new Error(
      `${schema.kind[0].toUpperCase() + schema.kind.slice(1)} fields cannot be set to null but the field at '${pathStr}' is null`
    )
  }

  switch (schema.kind) {
    case 'object': {
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

    case 'array': {
      return Promise.all(
        (value as any[]).map((val, i) =>
          getValueForUpdate(schema.element, val, prevValue[i], context, path.concat(i))
        )
      )
    }

    case 'relationship': {
      return schema.many
        ? resolveRelateToManyForUpdateInput(
            value as InferValueFromArg<
              GArg<NonNullable<GraphQLTypesForList['relateTo']['many']['update']>>
            >,
            context,
            schema.listKey,
            prevValue
          )
        : resolveRelateToOneForUpdateInput(
            value as InferValueFromArg<
              GArg<NonNullable<GraphQLTypesForList['relateTo']['one']['update']>>
            >,
            context,
            schema.listKey
          )
    }

    case 'conditional': {
      const conditionalValueKeys = Object.keys(value)
      if (conditionalValueKeys.length !== 1) {
        throw new Error(
          `Conditional field inputs must set exactly one of the fields but the field at ${pathStr} has ${conditionalValueKeys.length} fields set`
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

    case 'child':
      throw new Error(`Child fields are not supported in the structure field, found one at ${pathStr}`)

    default:
      assertNever(schema)
  }
}

export async function getValueForCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  // If value is undefined, get the specified defaultValue
  if (value === undefined) return getInitialPropsValue(schema)

  const pathStr = path.join('.')

  if (schema.kind === 'form') {
    return getFormValue(schema, value, pathStr)
  }

  if (value === null) {
    throw new Error(
      `${
        schema.kind[0].toUpperCase() + schema.kind.slice(1)
      } fields cannot be set to null but the field at '${pathStr}' is null`
    )
  }

  switch (schema.kind) {
    case 'array': {
      return Promise.all(
        (value as any[]).map((val, i) =>
          getValueForCreate(schema.element, val, context, path.concat(i))
        )
      )
    }

    case 'object': {
      return Object.fromEntries(
        await Promise.all(
          Object.entries(schema.fields).map(async ([key, val]) => {
            return [key, await getValueForCreate(val, value[key], context, path.concat(key))]
          })
        )
      )
    }

    case 'relationship': {
      return schema.many
        ? resolveRelateToManyForCreateInput(
            value as InferValueFromArg<
              GArg<NonNullable<GraphQLTypesForList['relateTo']['many']['create']>>
            >,
            context,
            schema.listKey
          )
        : resolveRelateToOneForCreateInput(
            value as InferValueFromArg<
              GArg<NonNullable<GraphQLTypesForList['relateTo']['one']['create']>>
            >,
            context,
            schema.listKey
          )
    }

    case 'conditional': {
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

    case 'child':
      throw new Error(`Child fields are not supported in the structure field, found one at ${pathStr}`)

    default:
      assertNever(schema)
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

  const connects = Promise.allSettled(getResolvedUniqueWheres(value.connect || [], context, foreignListKey, 'connect'))
  const creates = Promise.allSettled((value.create || []).map(x => resolveCreateMutation(x, context, foreignListKey)))

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
  const hasSet = !!value.set
  const hasDisconnect = !!value.disconnect
  const hasConnect = !!value.connect?.length
  const hasCreate = !!value.create?.length

  if (!hasSet && !hasConnect && !hasCreate && !hasDisconnect) {
    throw new Error(
      `You must provide at least one of "set", "connect", "create" or "disconnect" in to-many relationship inputs for "update" operations.`
    )
  }

  if (hasSet && hasDisconnect) {
    throw new Error(
      `The "set" and "disconnect" fields cannot both be provided to to-many relationship inputs for "update" operations.`
    )
  }

  const connects = Promise.allSettled(getResolvedUniqueWheres(value.connect || [], context, foreignListKey, 'connect'))
  const disconnects = Promise.allSettled(getResolvedUniqueWheres(value.disconnect || [], context, foreignListKey, 'disconnect'))
  const sets = Promise.allSettled(getResolvedUniqueWheres(value.set || [], context, foreignListKey, 'set'))
  const creates = Promise.allSettled((value.create || []).map(x => resolveCreateMutation(x, context, foreignListKey)))

  const [connectResult, createResult, disconnectResult, setResult] = await Promise.all([
    connects,
    creates,
    disconnects,
    sets
  ])

  const allResults = [...connectResult, ...createResult, ...disconnectResult, ...setResult]
  const errors = allResults.filter(isRejected)
  if (errors.length) {
    throw new RelationshipErrors(errors.map(x => ({ error: x.reason, tag: '' })))
  }

  let values = prevVal

  if (hasSet) {
    values = setResult.filter(isFulfilled).map(x => x.value)
  }

  const idsToDisconnect = new Set(disconnectResult.filter(isFulfilled).map(x => x.value.id))
  values = values.filter(x => !idsToDisconnect.has(x.id))
  values.push(...connectResult.filter(isFulfilled).map(x => x.value))
  values.push(...createResult.filter(isFulfilled).map(x => x.value))

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

async function resolveCreateMutation(value: any, context: KeystoneContext, foreignListKey: string) {
  const mutationType = context.graphql.schema.getMutationType()!
  const fields = mutationType.getFields()
  const mutationName = context.__internal.lists[foreignListKey].graphql.names.createMutationName
  const resolveFn = fields[mutationName].resolve!

  const { id } = (await resolveFn(
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
  const keyCount = Object.keys(value).length
  if (keyCount !== 1) {
    throw new Error(
      `You must provide "connect" or "create" in to-one relationship inputs for "create" operations.`
    )
  }
  return handleCreateAndUpdate(value, context, foreignListKey)
}

export function resolveRelateToOneForUpdateInput(
  value: _UpdateValueType,
  context: KeystoneContext,
  foreignListKey: string
) {
  const keyCount = Object.keys(value).length
  if (keyCount !== 1) {
    throw new Error(
      `You must provide one of "connect", "create" or "disconnect" in to-one relationship inputs for "update" operations.`
    )
  }

  if (value.connect || value.create) {
    return handleCreateAndUpdate(value, context, foreignListKey)
  }
  if (value.disconnect) {
    return null
  }
}