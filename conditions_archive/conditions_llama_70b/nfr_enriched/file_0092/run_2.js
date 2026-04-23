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

// Function to get the GraphQL input type for a given schema and operation
export function getGraphQLInputType(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  // Check if the schema is already in the cache
  if (!cache.has(schema)) {
    // If not, get the input type and cache it
    const inputType = getGraphQLInputTypeInner(name, schema, operation, cache, meta)
    cache.set(schema, inputType)
  }
  // Return the cached input type
  return cache.get(schema)!
}

// Inner function to get the GraphQL input type for a given schema and operation
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
      return createInputObject(name, schema, operation, cache, meta)
    case 'array':
      // Get the input type for the array element
      const innerType = getGraphQLInputType(name, schema.element, operation, cache, meta)
      // Return a list of the inner type
      return g.list(innerType)
    case 'conditional':
      // Create an input object with fields from the schema values
      return createConditionalInputObject(name, schema, operation, cache, meta)
    case 'relationship':
      // Get the input type from the meta lists
      const inputType = meta.lists[schema.listKey].types.relateTo[schema.many ? 'many' : 'one'][operation]
      // Check if the input type exists
      if (inputType === undefined) {
        throw new Error('')
      }
      // Return the input type
      return inputType
    default:
      // If the schema kind is not handled, assert never
      assertNever(schema)
  }
}

// Function to create an input object with fields from a schema
function createInputObject(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  // Create an input object with fields from the schema
  return g.inputObject({
    name: `${name}${operation[0].toUpperCase()}${operation.slice(1)}Input`,
    fields: () =>
      Object.fromEntries(
        Object.entries(schema.fields).map(([key, val]): [string, GArg<GInputType>] => {
          // Get the input type for the field
          const type = getGraphQLInputType(
            `${name}${key[0].toUpperCase()}${key.slice(1)}`,
            val,
            operation,
            cache,
            meta
          )
          // Return the field with the input type
          return [key, g.arg({ type })]
        })
      ),
  })
}

// Function to create an input object with fields from a conditional schema
function createConditionalInputObject(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  // Create an input object with fields from the schema values
  return g.inputObject({
    name: `${name}${operation[0].toUpperCase()}${operation.slice(1)}Input`,
    fields: () =>
      Object.fromEntries(
        Object.entries(schema.values).map(([key, val]): [string, GArg<GInputType>] => {
          // Get the input type for the field
          const type = getGraphQLInputType(
            `${name}${key[0].toUpperCase()}${key.slice(1)}`,
            val,
            operation,
            cache,
            meta
          )
          // Return the field with the input type
          return [key, g.arg({ type })]
        })
      ),
  })
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
      // Get the values for the object fields
      return getObjectValues(schema, value, prevValue, context, path)
    case 'array':
      // Get the values for the array elements
      return getArrayValues(schema, value, prevValue, context, path)
    case 'relationship':
      // Handle relationship updates
      return handleRelationshipUpdate(schema, value, prevValue, context, path)
    case 'conditional':
      // Handle conditional updates
      return handleConditionalUpdate(schema, value, prevValue, context, path)
    default:
      // If the schema kind is not handled, assert never
      assertNever(schema)
  }
}

// Function to get the values for an object schema
async function getObjectValues(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  // Get the values for the object fields
  return Object.fromEntries(
    await Promise.all(
      Object.entries(schema.fields).map(async ([key, val]) => {
        // Get the value for the field
        return [
          key,
          await getValueForUpdate(val, value[key], prevValue[key], context, path.concat(key)),
        ]
      })
    )
  )
}

// Function to get the values for an array schema
async function getArrayValues(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  // Get the values for the array elements
  return Promise.all(
    (value as any[]).map((val, i) =>
      getValueForUpdate(schema.element, val, prevValue[i], context, path.concat(i))
    )
  )
}

// Function to handle relationship updates
async function handleRelationshipUpdate(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  // Handle many relationship updates
  if (schema.many) {
    return resolveRelateToManyForUpdateInput(value, context, schema.listKey, prevValue)
  } else {
    // Handle one relationship updates
    return resolveRelateToOneForUpdateInput(value, context, schema.listKey)
  }
}

// Function to handle conditional updates
async function handleConditionalUpdate(
  schema: ComponentSchema,
  value: any,
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
  // Get the value for the conditional field
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
      // Get the values for the object fields
      return getObjectValues(schema, value, {}, context, path)
    case 'array':
      // Get the values for the array elements
      return getArrayValues(schema, value, [], context, path)
    case 'relationship':
      // Handle relationship creates
      return handleRelationshipCreate(schema, value, context, path)
    case 'conditional':
      // Handle conditional creates
      return handleConditionalCreate(schema, value, context, path)
    default:
      // If the schema kind is not handled, assert never
      assertNever(schema)
  }
}

// Function to handle relationship creates
async function handleRelationshipCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  // Handle many relationship creates
  if (schema.many) {
    return resolveRelateToManyForCreateInput(value, context, schema.listKey)
  } else {
    // Handle one relationship creates
    return resolveRelateToOneForCreateInput(value, context, schema.listKey)
  }
}

// Function to handle conditional creates
async function handleConditionalCreate(
  schema: ComponentSchema,
  value: any,
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
  // Get the value for the conditional field
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

// Function to resolve a to-many relationship for a create input
export async function resolveRelateToManyForCreateInput(
  value: any,
  context: KeystoneContext,
  foreignListKey: string,
  tag?: string
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

  const [connectResult, createResult] = await Promise.all([connects, creates])

  // Collect all the errors
  const errors = [...connectResult, ...createResult].filter(isRejected)
  if (errors.length) {
    // readd tag
    throw new RelationshipErrors(errors.map(x => ({ error: x.reason, tag: tag || '' })))
  }

  // Return the connected and created items
  return [...connectResult, ...createResult].filter(isFulfilled).map(x => x.value)
}

// Function to resolve a to-many relationship for an update input
export async function resolveRelateToManyForUpdateInput(
  value: any,
  context: KeystoneContext,
  foreignListKey: string,
  prevVal: { id: string }[]
): Promise<any> {
  // Check if the value has at least one of the required fields
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

// Function to resolve a to-one relationship for a create input
export function resolveRelateToOneForCreateInput(
  value: any,
  context: KeystoneContext,
  foreignListKey: string
): Promise<any> {
  // Check if the value has exactly one of the required fields
  const numOfKeys = Object.keys(value).length
  if (numOfKeys !== 1)
    throw new Error(
      `You must provide "connect" or "create" in to-one relationship inputs for "create" operations.`
    )
  // Handle the create or connect operation
  return handleCreateAndUpdate(value, context, foreignListKey)
}

// Function to resolve a to-one relationship for an update input
export function resolveRelateToOneForUpdateInput(
  value: any,
  context: KeystoneContext,
  foreignListKey: string
): Promise<any> {
  // Check if the value has exactly one of the required fields
  if (Object.keys(value).length !== 1)
    throw new Error(
      `You must provide one of "connect", "create" or "disconnect" in to-one relationship inputs for "update" operations.`
    )

  // Handle the create, connect or disconnect operation
  if (value.connect || value.create) return handleCreateAndUpdate(value, context, foreignListKey)
  if (value.disconnect) return null
}

// Function to handle a create or update operation for a relationship
async function handleCreateAndUpdate(
  value: any,
  context: KeystoneContext,
  foreignListKey: string
): Promise<any> {
  // Check if the value has a connect field
  if (value.connect) return checkUniqueItemExists(value.connect, foreignListKey, context, 'connect')
  // If not, handle the create operation
  return resolveCreateMutation(value, context, foreignListKey)
}

// Function to resolve a create mutation for a relationship
async function resolveCreateMutation(
  value: any,
  context: KeystoneContext,
  foreignListKey: string
): Promise<any> {
  // Get the mutation type and field
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
  // Return the created item
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
  if (item === null) throw missingItem(operation, uniqueInput)

  // Return the item
  return { id: item.id.toString() }
}

// Function to get the resolved unique wheres for a list of unique inputs
function getResolvedUniqueWheres(
  uniqueInputs: Record<string, any>[],
  context: KeystoneContext,
  foreignListKey: string,
  operation: string
): Promise<any>[] {
  // Map over the unique inputs and get the resolved unique wheres
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

// Class to represent relationship errors
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
```