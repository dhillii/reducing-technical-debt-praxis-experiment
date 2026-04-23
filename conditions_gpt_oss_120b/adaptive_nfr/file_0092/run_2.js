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
 * Retrieves (and caches) the GraphQL input type for a component schema.
 */
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

/**
 * Dispatches to a kind‑specific handler to build the GraphQL input type.
 */
function getGraphQLInputTypeInner(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  const handlers: {
    [K in ComponentSchema['kind']]: (s: Extract<ComponentSchema, { kind: K }>) => GInputType
  } = {
    form: s => {
      if (!s.graphql) {
        throw new Error(`Field at ${name} is missing a graphql field`)
      }
      return s.graphql.input
    },
    object: s => {
      return g.inputObject({
        name: `${name}${operation[0].toUpperCase()}${operation.slice(1)}Input`,
        fields: () =>
          Object.fromEntries(
            Object.entries(s.fields).map(([key, val]) => {
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
    },
    array: s => g.list(getGraphQLInputType(name, s.element, operation, cache, meta)),
    conditional: s => {
      return g.inputObject({
        name: `${name}${operation[0].toUpperCase()}${operation.slice(1)}Input`,
        fields: () =>
          Object.fromEntries(
            Object.entries(s.values).map(([key, val]) => {
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
    },
    relationship: s => {
      const inputType =
        meta.lists[s.listKey].types.relateTo[s.many ? 'many' : 'one'][operation]
      if (inputType === undefined) {
        throw new Error('')
      }
      return inputType
    },
    child: () => {
      throw new Error(`Child fields are not supported in the structure field, found one at ${name}`)
    },
  }

  const handler = handlers[schema.kind as keyof typeof handlers] as any
  if (!handler) assertNever(schema)
  return handler(schema)
}

/**
 * Retrieves the updated value for a component schema.
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

  const handlers: {
    [K in ComponentSchema['kind']]: (
      s: Extract<ComponentSchema, { kind: K }>
    ) => Promise<any>
  } = {
    form: async s => {
      if (s.validate(value)) return value
      throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
    },
    object: async s => {
      const entries = await Promise.all(
        Object.entries(s.fields).map(async ([key, val]) => [
          key,
          await getValueForUpdate(
            val,
            value[key],
            prevValue[key],
            context,
            path.concat(key)
          ),
        ])
      )
      return Object.fromEntries(entries)
    },
    array: async s => {
      return Promise.all(
        (value as any[]).map((v, i) =>
          getValueForUpdate(s.element, v, prevValue[i], context, path.concat(i))
        )
      )
    },
    relationship: async s => {
      if (s.many) {
        const val = value as InferValueFromArg<
          GArg<NonNullable<GraphQLTypesForList['relateTo']['many']['update']>>
        >
        return resolveRelateToManyForUpdateInput(val, context, s.listKey, prevValue)
      }
      const val = value as InferValueFromArg<
        GArg<NonNullable<GraphQLTypesForList['relateTo']['one']['update']>>
      >
      return resolveRelateToOneForUpdateInput(val, context, s.listKey)
    },
    conditional: async s => {
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
      if ((key === 'true' || key === 'false') && !s.discriminant.validate(key)) {
        discriminant = key === 'true'
      }
      const prev = prevValue?.discriminant === discriminant ? prevValue?.value : undefined
      return {
        discriminant,
        value: await getValueForUpdate(
          (s.values as any)[key],
          value[key],
          prev ?? getInitialPropsValue(s),
          context,
          path.concat('value')
        ),
      }
    },
    child: async () => {
      throw new Error(
        `Child fields are not supported in the structure field, found one at ${path.join('.')}`
      )
    },
    // placeholder for exhaustive check
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _: () => {
      assertNever(schema)
      return undefined as never
    },
  }

  if (value === null) {
    throw new Error(
      `${schema.kind[0].toUpperCase() + schema.kind.slice(1)} fields cannot be set to null but the field at '${path.join(
        '.'
      )}' is null`
    )
  }

  const handler = (handlers as any)[schema.kind] as any
  if (!handler) assertNever(schema)
  return handler(schema)
}

/**
 * Retrieves the created value for a component schema.
 */
export async function getValueForCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  if (value === undefined) return getInitialPropsValue(schema)

  const handlers: {
    [K in ComponentSchema['kind']]: (s: Extract<ComponentSchema, { kind: K }>) => Promise<any>
  } = {
    form: async s => {
      if (s.validate(value)) return value
      throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
    },
    array: async s => {
      return Promise.all(
        (value as any[]).map((v, i) => getValueForCreate(s.element, v, context, path.concat(i)))
      )
    },
    object: async s => {
      const entries = await Promise.all(
        Object.entries(s.fields).map(async ([key, val]) => [
          key,
          await getValueForCreate(val, value[key], context, path.concat(key)),
        ])
      )
      return Object.fromEntries(entries)
    },
    relationship: async s => {
      if (s.many) {
        const val = value as InferValueFromArg<
          GArg<NonNullable<GraphQLTypesForList['relateTo']['many']['create']>>
        >
        return resolveRelateToManyForCreateInput(val, context, s.listKey)
      }
      const val = value as InferValueFromArg<
        GArg<NonNullable<GraphQLTypesForList['relateTo']['one']['create']>>
      >
      return resolveRelateToOneForCreateInput(val, context, s.listKey)
    },
    conditional: async s => {
      if (value === null) throw new Error()
      const keys = Object.keys(value)
      if (keys.length !== 1) throw new Error()
      const key = keys[0]
      let discriminant: string | boolean = key
      if ((key === 'true' || key === 'false') && !s.discriminant.validate(key)) {
        discriminant = key === 'true'
      }
      return {
        discriminant,
        value: await getValueForCreate(
          (s.values as any)[key],
          value[key],
          context,
          path.concat('value')
        ),
      }
    },
    child: async () => {
      throw new Error(
        `Child fields are not supported in the structure field, found one at ${path.join('.')}`
      )
    },
    _: async () => {
      assertNever(schema)
      return undefined as never
    },
  }

  if (value === null) {
    throw new Error(
      `${schema.kind[0].toUpperCase() + schema.kind.slice(1)} fields cannot be set to null but the field at '${path.join(
        '.'
      )}' is null`
    )
  }

  const handler = (handlers as any)[schema.kind] as any
  if (!handler) assertNever(schema)
  return handler(schema)
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

// these aren't here out of thinking this is better syntax(i do not think it is),
// it's just because TS won't infer the arg is X bit
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

/**
 * Resolves a to‑one relationship input for a create operation.
 */
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

/**
 * Resolves a to‑one relationship input for an update operation.
 */
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