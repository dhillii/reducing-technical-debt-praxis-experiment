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

// Function to get GraphQL input type for a given schema and operation
export function getGraphQLInputType(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  // Check if the schema is already in the cache
  if (!cache.has(schema)) {
    // If not, calculate the input type and store it in the cache
    const res = getGraphQLInputTypeInner(name, schema, operation, cache, meta)
    cache.set(schema, res)
  }
  // Return the cached input type
  return cache.get(schema)!
}

// Inner function to calculate the GraphQL input type
function getGraphQLInputTypeInner(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  // Handle different schema kinds
  switch (schema.kind) {
    case 'form':
      // Check if the schema has a graphql field
      if (!schema.graphql) {
        throw new Error(`Field at ${name} is missing a graphql field`)
      }
      // Return the input type from the graphql field
      return schema.graphql.input
    case 'object':
      // Create an input object with fields from the schema
      return g.inputObject({
        name: `${name}${operation[0].toUpperCase()}${operation.slice(1)}Input`,
        fields: () =>
          Object.fromEntries(
            Object.entries(schema.fields).map(([key, val]): [string, GArg<GInputType>] => {
              // Recursively get the input type for each field
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
    case 'array':
      // Get the input type for the array element
      const innerType = getGraphQLInputType(name, schema.element, operation, cache, meta)
      // Return a list of the inner type
      return g.list(innerType)
    case 'conditional':
      // Create an input object with fields from the schema values
      return g.inputObject({
        name: `${name}${operation[0].toUpperCase()}${operation.slice(1)}Input`,
        fields: () =>
          Object.fromEntries(
            Object.entries(schema.values).map(([key, val]): [string, GArg<GInputType>] => {
              // Recursively get the input type for each value
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
    case 'relationship':
      // Get the input type from the meta lists
      const inputType =
        meta.lists[schema.listKey].types.relateTo[schema.many ? 'many' : 'one'][operation]
      // Check if the input type exists
      if (inputType === undefined) {
        throw new Error('')
      }
      return inputType
    default:
      // If the schema kind is not handled, assert never
      assertNever(schema)
  }
}

// Function to get the value for an update operation
export async function getValueForUpdate(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  // If the value is undefined, return the previous value
  if (value === undefined) return prevValue
  // If the previous value is undefined, get the initial props value
  if (prevValue === undefined) {
    prevValue = getInitialPropsValue(schema)
  }

  // Handle different schema kinds
  switch (schema.kind) {
    case 'form':
      // Check if the value is valid
      if (schema.validate(value)) return value
      // If not, throw an error
      throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
    case 'object':
      // Recursively get the values for each field
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
    case 'array':
      // Recursively get the values for each array element
      return Promise.all(
        (value as any[]).map((val, i) =>
          getValueForUpdate(schema.element, val, prevValue[i], context, path.concat(i))
        )
      )
    case 'relationship':
      // Handle many and one relationships
      if (schema.many) {
        // Get the value for a many relationship update
        return resolveRelateToManyForUpdateInput(
          value,
          context,
          schema.listKey,
          prevValue
        )
      } else {
        // Get the value for a one relationship update
        return resolveRelateToOneForUpdateInput(value, context, schema.listKey)
      }
    case 'conditional':
      // Get the value for a conditional update
      return getConditionalValueForUpdate(value, schema, prevValue, context, path)
    default:
      // If the schema kind is not handled, assert never
      assertNever(schema)
  }
}

// Function to get the value for a conditional update
async function getConditionalValueForUpdate(
  value: any,
  schema: ComponentSchema,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  // Get the conditional value keys
  const conditionalValueKeys = Object.keys(value)
  // Check if exactly one key is set
  if (conditionalValueKeys.length !== 1) {
    throw new Error(
      `Conditional field inputs must set exactly one of the fields but the field at ${path.join(
        '.'
      )} has ${conditionalValueKeys.length} fields set`
    )
  }
  // Get the key and discriminant
  const key = conditionalValueKeys[0]
  let discriminant: string | boolean = key
  if ((key === 'true' || key === 'false') && !schema.discriminant.validate(key)) {
    discriminant = key === 'true'
  }
  // Recursively get the value for the conditional value
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

// Function to get the value for a create operation
export async function getValueForCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  // If the value is undefined, get the initial props value
  if (value === undefined) return getInitialPropsValue(schema)
  // Handle different schema kinds
  switch (schema.kind) {
    case 'form':
      // Check if the value is valid
      if (schema.validate(value)) return value
      // If not, throw an error
      throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
    case 'object':
      // Recursively get the values for each field
      return Object.fromEntries(
        await Promise.all(
          Object.entries(schema.fields).map(async ([key, val]) => {
            return [key, await getValueForCreate(val, value[key], context, path.concat(key))]
          })
        )
      )
    case 'array':
      // Recursively get the values for each array element
      return Promise.all(
        (value as any[]).map((val, i) =>
          getValueForCreate(schema.element, val, context, path.concat(i))
        )
      )
    case 'relationship':
      // Handle many and one relationships
      if (schema.many) {
        // Get the value for a many relationship create
        return resolveRelateToManyForCreateInput(value, context, schema.listKey)
      } else {
        // Get the value for a one relationship create
        return resolveRelateToOneForCreateInput(value, context, schema.listKey)
      }
    case 'conditional':
      // Get the value for a conditional create
      return getConditionalValueForCreate(value, schema, context, path)
    default:
      // If the schema kind is not handled, assert never
      assertNever(schema)
  }
}

// Function to get the value for a conditional create
async function getConditionalValueForCreate(
  value: any,
  schema: ComponentSchema,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  // Get the conditional value keys
  const conditionalValueKeys = Object.keys(value)
  // Check if exactly one key is set
  if (conditionalValueKeys.length !== 1) {
    throw new Error(
      `Conditional field inputs must set exactly one of the fields but the field at ${path.join(
        '.'
      )} has ${conditionalValueKeys.length} fields set`
    )
  }
  // Get the key and discriminant
  const key = conditionalValueKeys[0]
  let discriminant: string | boolean = key
  if ((key === 'true' || key === 'false') && !schema.discriminant.validate(key)) {
    discriminant = key === 'true'
  }
  // Recursively get the value for the conditional value
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

// Function to resolve a many relationship for a create operation
export async function resolveRelateToManyForCreateInput(
  value: any,
  context: KeystoneContext,
  foreignListKey: string
): Promise<any> {
  // Check if the value has a connect or create field
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

  // Wait for the promises to resolve
  const [connectResult, createResult] = await Promise.all([connects, creates])

  // Collect all the errors
  const errors = [...connectResult, ...createResult].filter(isRejected)
  if (errors.length) {
    // Throw a relationship error
    throw new RelationshipErrors(errors.map(x => ({ error: x.reason, tag: '' })))
  }

  // Return the resolved values
  return [...connectResult, ...createResult].filter(isFulfilled).map(x => x.value)
}

// Function to resolve a many relationship for an update operation
export async function resolveRelateToManyForUpdateInput(
  value: any,
  context: KeystoneContext,
  foreignListKey: string,
  prevVal: any
): Promise<any> {
  // Check if the value has a connect, create, disconnect, or set field
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
  // Check if the set and disconnect fields are both provided
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

  // Wait for the promises to resolve
  const [connectResult, createResult, disconnectResult, setResult] = await Promise.all([
    connects,
    creates,
    disconnects,
    sets,
  ])

  // Collect all the errors
  const errors = [
    ...connectResult,
    ...createResult,
    ...disconnectResult,
    ...setResult,
  ].filter(isRejected)
  if (errors.length) {
    // Throw a relationship error
    throw new RelationshipErrors(errors.map(x => ({ error: x.reason, tag: '' })))
  }

  // Get the values
  let values = prevVal
  if (value.set) {
    values = setResult.filter(isFulfilled).map(x => x.value)
  }

  // Get the ids to disconnect
  const idsToDisconnect = new Set(disconnectResult.filter(isFulfilled).map(x => x.value.id))
  values = values.filter(x => !idsToDisconnect.has(x.id))
  values.push(...connectResult.filter(isFulfilled).map(x => x.value))
  values.push(...createResult.filter(isFulfilled).map(x => x.value))

  // Return the values
  return values
}

// Function to resolve a one relationship for a create operation
export function resolveRelateToOneForCreateInput(
  value: any,
  context: KeystoneContext,
  foreignListKey: string
): Promise<any> {
  // Check if the value has a connect or create field
  const numOfKeys = Object.keys(value).length
  if (numOfKeys !== 1) {
    throw new Error(
      `You must provide "connect" or "create" in to-one relationship inputs for "create" operations.`
    )
  }
  // Handle the connect and create fields
  return handleCreateAndUpdate(value, context, foreignListKey)
}

// Function to resolve a one relationship for an update operation
export function resolveRelateToOneForUpdateInput(
  value: any,
  context: KeystoneContext,
  foreignListKey: string
): Promise<any> {
  // Check if the value has a connect, create, or disconnect field
  if (Object.keys(value).length !== 1) {
    throw new Error(
      `You must provide one of "connect", "create" or "disconnect" in to-one relationship inputs for "update" operations.`
    )
  }
  // Handle the connect, create, and disconnect fields
  if (value.connect || value.create) {
    return handleCreateAndUpdate(value, context, foreignListKey)
  }
  if (value.disconnect) {
    return null
  }
}

// Function to handle create and update for a one relationship
async function handleCreateAndUpdate(
  value: any,
  context: KeystoneContext,
  foreignListKey: string
): Promise<any> {
  // Check if the value has a connect field
  if (value.connect) {
    // Check if the item exists
    return checkUniqueItemExists(value.connect, foreignListKey, context, 'connect')
  }
  // If not, resolve the create mutation
  return resolveCreateMutation(value, context, foreignListKey)
}

// Function to resolve a create mutation
async function resolveCreateMutation(
  value: any,
  context: KeystoneContext,
  foreignListKey: string
): Promise<any> {
  // Get the mutation type
  const mutationType = context.graphql.schema.getMutationType()!
  // Get the create mutation name
  const { id } = (await mutationType.getFields()[
    context.__internal.lists[foreignListKey].graphql.names.createMutationName
  ].resolve!(
    {},
    { data: value.create },
    context,
    {} as GraphQLResolveInfo
  )) as BaseItem
  // Return the id
  return { id: id.toString() }
}

// Function to check if a unique item exists
async function checkUniqueItemExists(
  uniqueInput: Record<string, unknown>,
  listKey: string,
  context: KeystoneContext,
  operation: string
): Promise<any> {
  // Check if the item exists
  const item = await context.db[listKey].findOne({ where: uniqueInput })
  if (item === null) {
    // If not, throw an error
    throw missingItem(operation, uniqueInput)
  }
  // Return the id
  return { id: item.id.toString() }
}

// Function to get the resolved unique wheres
function getResolvedUniqueWheres(
  uniqueInputs: Record<string, any>[],
  context: KeystoneContext,
  foreignListKey: string,
  operation: string
): Promise<any>[] {
  // Map over the unique inputs and check if each item exists
  return uniqueInputs.map(uniqueInput =>
    checkUniqueItemExists(uniqueInput, foreignListKey, context, operation)
  )
}

// Function to check if a promise is fulfilled
export const isFulfilled = <T>(arg: PromiseSettledResult<T>): arg is PromiseFulfilledResult<T> =>
  arg.status === 'fulfilled'

// Function to check if a promise is rejected
export const isRejected = (arg: PromiseSettledResult<any>): arg is PromiseRejectedResult =>
  arg.status === 'rejected'

// Class for relationship errors
export class RelationshipErrors extends Error {
  errors: { error: Error; tag: string }[]
  constructor(errors: { error: Error; tag: string }[]) {
    super('Multiple relationship errors')
    this.errors = errors
  }
}

// Function to throw an error for a missing item
function missingItem(operation: string, uniqueWhere: Record<string, any>) {
  throw new Error(
    `You cannot ${operation} the item '${JSON.stringify(uniqueWhere)}' - it may not exist`
  )
}