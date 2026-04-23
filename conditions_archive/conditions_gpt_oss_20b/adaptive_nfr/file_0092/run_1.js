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
  const handlers: Record<string, (n: string, s: ComponentSchema, op: 'create' | 'update', c: Map<ComponentSchema, GInputType>, m: FieldData) => GInputType> = {
    form: (_name, _schema, _op, _c, _m) => {
      if (!_schema.graphql) {
        throw new Error(`Field at ${_name} is missing a graphql field`)
      }
      return _schema.graphql.input
    },
    object: (_name, _schema, _op, _c, _m) => {
      const input = g.inputObject({
        name: `${_name}${_op[0].toUpperCase()}${_op.slice(1)}Input`,
        fields: () =>
          Object.fromEntries(
            Object.entries(_schema.fields).map(([key, val]): [string, GArg<GInputType>] => {
              const type = getGraphQLInputType(
                `${_name}${key[0].toUpperCase()}${key.slice(1)}`,
                val,
                _op,
                _c,
                _m
              )
              return [key, g.arg({ type })]
            })
          ),
      })
      return input
    },
    array: (_name, _schema, _op, _c, _m) => {
      const innerType = getGraphQLInputType(_name, _schema.element, _op, _c, _m)
      return g.list(innerType)
    },
    conditional: (_name, _schema, _op, _c, _m) => {
      const input = g.inputObject({
        name: `${_name}${_op[0].toUpperCase()}${_op.slice(1)}Input`,
        fields: () =>
          Object.fromEntries(
            Object.entries(_schema.values).map(([key, val]): [string, GArg<GInputType>] => {
              const type = getGraphQLInputType(
                `${_name}${key[0].toUpperCase()}${key.slice(1)}`,
                val,
                _op,
                _c,
                _m
              )
              return [key, g.arg({ type })]
            })
          ),
      })
      return input
    },
    relationship: (_name, _schema, _op, _c, _m) => {
      const inputType =
        _m.lists[_schema.listKey].types.relateTo[_schema.many ? 'many' : 'one'][_op]
      if (inputType === undefined) {
        throw new Error('')
      }
      return inputType
    },
    child: (_name, _schema, _op, _c, _m) => {
      throw new Error(`Child fields are not supported in the structure field, found one at ${_name}`)
    },
  }
  const handler = handlers[schema.kind]
  if (!handler) {
    assertNever(schema)
  }
  return handler(name, schema, operation, cache, meta)
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

  const handlers: Record<string, (s: ComponentSchema, v: any, p: any, ctx: KeystoneContext, pth: ReadonlyPropPath) => Promise<any>> = {
    form: async (_s, _v, _p, _c, _pth) => {
      if (_s.validate(_v)) return _v
      throw new Error(`The value of the form field at '${_pth.join('.')}' is invalid`)
    },
    object: async (_s, _v, _p, _c, _pth) => {
      return Object.fromEntries(
        await Promise.all(
          Object.entries(_s.fields).map(async ([key, val]) => {
            return [
              key,
              await getValueForUpdate(val, _v[key], _p[key], _c, _pth.concat(key)),
            ]
          })
        )
      )
    },
    array: async (_s, _v, _p, _c, _pth) => {
      return Promise.all(
        (_v as any[]).map((val, i) =>
          getValueForUpdate(_s.element, val, _p[i], _c, _pth.concat(i))
        )
      )
    },
    relationship: async (_s, _v, _p, _c, _pth) => {
      if (_s.many) {
        const val = (_v as InferValueFromArg<
          GArg<NonNullable<GraphQLTypesForList['relateTo']['many']['update']>>
        >)!
        return resolveRelateToManyForUpdateInput(val, _c, _s.listKey, _p)
      } else {
        const val = (_v as InferValueFromArg<
          GArg<NonNullable<GraphQLTypesForList['relateTo']['one']['update']>>
        >)!
        return resolveRelateToOneForUpdateInput(val, _c, _s.listKey)
      }
    },
    conditional: async (_s, _v, _p, _c, _pth) => {
      const conditionalValueKeys = Object.keys(_v)
      if (conditionalValueKeys.length !== 1) {
        throw new Error(
          `Conditional field inputs must set exactly one of the fields but the field at ${_pth.join(
            '.'
          )} has ${conditionalValueKeys.length} fields set`
        )
      }
      const key = conditionalValueKeys[0]
      let discriminant: string | boolean = key
      if ((key === 'true' || key === 'false') && !_s.discriminant.validate(key)) {
        discriminant = key === 'true'
      }
      return {
        discriminant,
        value: await getValueForUpdate(
          (_s.values as any)[key],
          _v[key],
          _p.discriminant === discriminant ? _p.value : getInitialPropsValue(_s),
          _c,
          _pth.concat('value')
        ),
      }
    },
    child: async (_s, _v, _p, _c, _pth) => {
      throw new Error(
        `Child fields are not supported in the structure field, found one at ${_pth.join('.')}`
      )
    },
  }

  if (value === null) {
    throw new Error(
      `${schema.kind[0].toUpperCase() + schema.kind.slice(1)} fields cannot be set to null but the field at '${path.join('.')}' is null`
    )
  }

  const handler = handlers[schema.kind]
  if (!handler) {
    assertNever(schema)
  }
  return handler(schema, value, prevValue, context, path)
}

export async function getValueForCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  if (value === undefined) return getInitialPropsValue(schema)

  const handlers: Record<string, (s: ComponentSchema, v: any, ctx: KeystoneContext, pth: ReadonlyPropPath) => Promise<any>> = {
    form: async (_s, _v, _c, _p) => {
      if (_s.validate(_v)) return _v
      throw new Error(`The value of the form field at '${_p.join('.')}' is invalid`)
    },
    array: async (_s, _v, _c, _p) => {
      return Promise.all(
        (_v as any[]).map((val, i) =>
          getValueForCreate(_s.element, val, _c, _p.concat(i))
        )
      )
    },
    object: async (_s, _v, _c, _p) => {
      return Object.fromEntries(
        await Promise.all(
          Object.entries(_s.fields).map(async ([key, val]) => {
            return [key, await getValueForCreate(val, _v[key], _c, _p.concat(key))]
          })
        )
      )
    },
    relationship: async (_s, _v, _c, _p) => {
      if (_s.many) {
        const val = (_v as InferValueFromArg<
          GArg<NonNullable<GraphQLTypesForList['relateTo']['many']['create']>>
        >)!
        return resolveRelateToManyForCreateInput(val, _c, _s.listKey)
      } else {
        const val = (_v as InferValueFromArg<
          GArg<NonNullable<GraphQLTypesForList['relateTo']['one']['create']>>
        >)!
        return resolveRelateToOneForCreateInput(val, _c, _s.listKey)
      }
    },
    conditional: async (_s, _v, _c, _p) => {
      if (_v === null) throw new Error()
      const conditionalValueKeys = Object.keys(_v)
      if (conditionalValueKeys.length !== 1) throw new Error()
      const key = conditionalValueKeys[0]
      let discriminant: string | boolean = key
      if ((key === 'true' || key === 'false') && !_s.discriminant.validate(key)) {
        discriminant = key === 'true'
      }
      return {
        discriminant,
        value: await getValueForCreate(
          (_s.values as any)[key],
          _v[key],
          _c,
          _p.concat('value')
        ),
      }
    },
    child: async (_s, _v, _c, _p) => {
      throw new Error(
        `Child fields are not supported in the structure field, found one at ${_p.join('.')}`
      )
    },
  }

  if (value === null) {
    throw new Error(
      `${schema.kind[0].toUpperCase() + schema.kind.slice(1)} fields cannot be set to null but the field at '${path.join('.')}' is null`
    )
  }

  const handler = handlers[schema.kind]
  if (!handler) {
    assertNever(schema)
  }
  return handler(schema, value, context, path)
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

  // Perform queries for the connections
  const connects = Promise.allSettled(
    getResolvedUniqueWheres(value.connect || [], context, foreignListKey, 'connect')
  )

  // Perform nested mutations for the creations
  const creates = Promise.allSettled(
    (value.create || []).map(x => resolveCreateMutation(x, context, foreignListKey))
  )

  const [connectResult, createResult] = await Promise.all([connects, creates])

  // Collect all the errors
  const errors = [...connectResult, ...createResult].filter(isRejected)
  if (errors.length) {
    // readd tag
    throw new RelationshipErrors(errors.map(x => ({ error: x.reason, tag: tag || '' })))
  }

  // Perform queries for the connections
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

  // Perform queries for the connections
  const connects = Promise.allSettled(
    getResolvedUniqueWheres(value.connect || [], context, foreignListKey, 'connect')
  )

  const disconnects = Promise.allSettled(
    getResolvedUniqueWheres(value.disconnect || [], context, foreignListKey, 'disconnect')
  )

  const sets = Promise.allSettled(
    getResolvedUniqueWheres(value.set || [], context, foreignListKey, 'set')
  )

  // Perform nested mutations for the creations
  const creates = Promise.allSettled(
    (value.create || []).map(x => resolveCreateMutation(x, context, foreignListKey))
  )

  const [connectResult, createResult, disconnectResult, setResult] = await Promise.all([
    connects,
    creates,
    disconnects,
    sets,
  ])

  // Collect all the errors
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
  // Check whether the item exists (from this users POV).
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
    // we happen to know this isn't used
    // no one else should rely on that though
    // it could change in the future
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