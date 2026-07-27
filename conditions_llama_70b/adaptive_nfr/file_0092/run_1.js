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

// Define a function to get the GraphQL input type for a given schema
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

// Define a function to get the GraphQL input type for a given schema (inner function)
function getGraphQLInputTypeInner(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  // Use a lookup table to determine the GraphQL input type
  const inputTypes: { [key in ComponentSchema['kind']]: () => GInputType } = {
    form: () => schema.graphql.input,
    object: () =>
      g.inputObject({
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
      }),
    array: () => g.list(getGraphQLInputType(name, schema.element, operation, cache, meta)),
    conditional: () =>
      g.inputObject({
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
      }),
    relationship: () => meta.lists[schema.listKey].types.relateTo[schema.many ? 'many' : 'one'][operation],
  }

  // Check if the schema kind is valid
  if (!(schema.kind in inputTypes)) {
    throw new Error(`Invalid schema kind: ${schema.kind}`)
  }

  // Return the GraphQL input type
  return inputTypes[schema.kind]()
}

// Define a function to get the value for an update operation
export async function getValueForUpdate(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  // Use a lookup table to determine the value for the update operation
  const getValueForUpdateInner: { [key in ComponentSchema['kind']]: () => Promise<any> } = {
    form: async () => {
      if (schema.validate(value)) return value
      throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
    },
    object: async () =>
      Object.fromEntries(
        await Promise.all(
          Object.entries(schema.fields).map(async ([key, val]) => {
            return [
              key,
              await getValueForUpdate(val, value[key], prevValue[key], context, path.concat(key)),
            ]
          })
        )
      ),
    array: async () =>
      Promise.all(
        (value as any[]).map((val, i) =>
          getValueForUpdate(schema.element, val, prevValue[i], context, path.concat(i))
        )
      ),
    relationship: async () => {
      if (schema.many) {
        return resolveRelateToManyForUpdateInput(value, context, schema.listKey, prevValue)
      } else {
        return resolveRelateToOneForUpdateInput(value, context, schema.listKey)
      }
    },
    conditional: async () => {
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
    },
  }

  // Check if the schema kind is valid
  if (!(schema.kind in getValueForUpdateInner)) {
    throw new Error(`Invalid schema kind: ${schema.kind}`)
  }

  // Return the value for the update operation
  return getValueForUpdateInner[schema.kind]()
}

// Define a function to get the value for a create operation
export async function getValueForCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  // Use a lookup table to determine the value for the create operation
  const getValueForCreateInner: { [key in ComponentSchema['kind']]: () => Promise<any> } = {
    form: async () => {
      if (schema.validate(value)) return value
      throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
    },
    object: async () =>
      Object.fromEntries(
        await Promise.all(
          Object.entries(schema.fields).map(async ([key, val]) => {
            return [key, await getValueForCreate(val, value[key], context, path.concat(key))]
          })
        )
      ),
    array: async () =>
      Promise.all(
        (value as any[]).map((val, i) =>
          getValueForCreate(schema.element, val, context, path.concat(i))
        )
      ),
    relationship: async () => {
      if (schema.many) {
        return resolveRelateToManyForCreateInput(value, context, schema.listKey)
      } else {
        return resolveRelateToOneForCreateInput(value, context, schema.listKey)
      }
    },
    conditional: async () => {
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
    },
  }

  // Check if the schema kind is valid
  if (!(schema.kind in getValueForCreateInner)) {
    throw new Error(`Invalid schema kind: ${schema.kind}`)
  }

  // Return the value for the create operation
  return getValueForCreateInner[schema.kind]()
}

// Define a class to represent relationship errors
export class RelationshipErrors extends Error {
  errors: { error: Error; tag: string }[]
  constructor(errors: { error: Error; tag: string }[]) {
    super('Multiple relationship errors')
    this.errors = errors
  }
}

// Define a function to get the resolved unique wheres
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

// Define a function to check if a promise is fulfilled
export const isFulfilled = <T>(arg: PromiseSettledResult<T>): arg is PromiseFulfilledResult<T> =>
  arg.status === 'fulfilled'

// Define a function to check if a promise is rejected
export const isRejected = (arg: PromiseSettledResult<any>): arg is PromiseRejectedResult =>
  arg.status === 'rejected'

// Define a function to resolve the relate to many for create input
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

// Define a function to resolve the relate to many for update input
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

// Define a function to handle create and update
async function handleCreateAndUpdate(
  value: _CreateValueType,
  context: KeystoneContext,
  foreignListKey: string
) {
  if (value.connect) return checkUniqueItemExists(value.connect, foreignListKey, context, 'connect')
  return resolveCreateMutation(value, context, foreignListKey)
}

// Define a function to resolve the create mutation
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

// Define a function to resolve the relate to one for create input
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

// Define a function to resolve the relate to one for update input
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

// Define a function to check if an item exists
async function checkUniqueItemExists(
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

// Define a function to throw an error for a missing item
function missingItem(operation: string, uniqueWhere: Record<string, any>) {
  throw new Error(
    `You cannot ${operation} the item '${JSON.stringify(uniqueWhere)}' - it may not exist`
  )
}