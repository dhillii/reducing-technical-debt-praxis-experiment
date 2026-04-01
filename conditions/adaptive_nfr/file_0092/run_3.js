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

/** @internal Handles form schema input type resolution */
function handleFormInputType(schema: ComponentSchema): GInputType {
  if (!schema.graphql) {
    throw new Error(`Field is missing a graphql field`)
  }
  return schema.graphql.input
}

/** @internal Handles object schema input type resolution */
function handleObjectInputType(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  return g.inputObject({
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
}

/** @internal Handles array schema input type resolution */
function handleArrayInputType(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  const innerType = getGraphQLInputType(name, schema.element, operation, cache, meta)
  return g.list(innerType)
}

/** @internal Handles conditional schema input type resolution */
function handleConditionalInputType(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  return g.inputObject({
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
}

/** @internal Handles relationship schema input type resolution */
function handleRelationshipInputType(
  schema: ComponentSchema,
  meta: FieldData,
  operation: 'create' | 'update'
): GInputType {
  const inputType =
    meta.lists[schema.listKey].types.relateTo[schema.many ? 'many' : 'one'][operation]
  if (inputType === undefined) {
    throw new Error('')
  }
  return inputType
}

/** @internal Dispatches schema kind to appropriate input type handler */
const inputTypeHandlers: Record<
  string,
  (
    name: string,
    schema: any,
    operation: 'create' | 'update',
    cache: Map<ComponentSchema, GInputType>,
    meta: FieldData
  ) => GInputType
> = {
  form: (name, schema) => handleFormInputType(schema),
  object: (name, schema, operation, cache, meta) =>
    handleObjectInputType(name, schema, operation, cache, meta),
  array: (name, schema, operation, cache, meta) =>
    handleArrayInputType(name, schema, operation, cache, meta),
  conditional: (name, schema, operation, cache, meta) =>
    handleConditionalInputType(name, schema, operation, cache, meta),
  relationship: (name, schema, operation, cache, meta) =>
    handleRelationshipInputType(schema, meta, operation),
}

function getGraphQLInputTypeInner(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  const handler = inputTypeHandlers[schema.kind]
  if (handler) {
    return handler(name, schema, operation, cache, meta)
  }

  if (schema.kind === 'child') {
    throw new Error(`Child fields are not supported in the structure field, found one at ${name}`)
  }

  assertNever(schema)
}

/** @internal Validates form value */
function validateFormValue(schema: ComponentSchema, value: any, path: ReadonlyPropPath): any {
  if (schema.validate(value)) return value
  throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
}

/** @internal Checks if value is null and throws appropriate error */
function checkNullValue(schema: ComponentSchema, value: any, path: ReadonlyPropPath): void {
  if (value === null) {
    throw new Error(
      `${schema.kind[0].toUpperCase() + schema.kind.slice(1)} fields cannot be set to null but the field at '${path.join('.')}' is null`
    )
  }
}

/** @internal Processes object schema for value updates */
async function processObjectForUpdate(
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

/** @internal Processes array schema for value updates */
async function processArrayForUpdate(
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

/** @internal Processes relationship schema for value updates */
async function processRelationshipForUpdate(
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
  } else {
    const val = (value as InferValueFromArg<
      GArg<NonNullable<GraphQLTypesForList['relateTo']['one']['update']>>
    >)!
    return resolveRelateToOneForUpdateInput(val, context, schema.listKey)
  }
}

/** @internal Extracts discriminant from conditional value key */
function extractDiscriminant(key: string, schema: ComponentSchema): string | boolean {
  if ((key === 'true' || key === 'false') && !schema.discriminant.validate(key)) {
    return key === 'true'
  }
  return key
}

/** @internal Processes conditional schema for value updates */
async function processConditionalForUpdate(
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
  const discriminant = extractDiscriminant(key, schema)

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

/** @internal Dispatches schema kind to appropriate update handler */
const updateHandlers: Record<
  string,
  (
    schema: any,
    value: any,
    prevValue: any,
    context: KeystoneContext,
    path: ReadonlyPropPath
  ) => Promise<any>
> = {
  form: (schema, value) => Promise.resolve(validateFormValue(schema, value, [])),
  object: (schema, value, prevValue, context, path) =>
    processObjectForUpdate(schema, value, prevValue, context, path),
  array: (schema, value, prevValue, context, path) =>
    processArrayForUpdate(schema, value, prevValue, context, path),
  relationship: (schema, value, prevValue, context) =>
    processRelationshipForUpdate(schema, value, context, prevValue),
  conditional: (schema, value, prevValue, context, path) =>
    processConditionalForUpdate(schema, value, prevValue, context, path),
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
    return validateFormValue(schema, value, path)
  }

  checkNullValue(schema, value, path)

  const handler = updateHandlers[schema.kind]
  if (handler) {
    return handler(schema, value, prevValue, context, path)
  }

  if (schema.kind === 'child') {
    throw new Error(
      `Child fields are not supported in the structure field, found one at ${path.join('.')}`
    )
  }

  assertNever(schema)
}

/** @internal Processes object schema for value creation */
async function processObjectForCreate(
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

/** @internal Processes array schema for value creation */
async function processArrayForCreate(
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

/** @internal Processes relationship schema for value creation */
async function processRelationshipForCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext
): Promise<any> {
  if (schema.many) {
    const val = (value as InferValueFromArg<
      GArg<NonNullable<GraphQLTypesForList['relateTo']['many']['create']>>
    >)!
    return resolveRelateToManyForCreateInput(val, context, schema.listKey)
  } else {
    const val = (value as InferValueFromArg<
      GArg<NonNullable<GraphQLTypesForList['relateTo']['one']['create']>>
    >)!
    return resolveRelateToOneForCreateInput(val, context, schema.listKey)
  }
}

/** @internal Processes conditional schema for value creation */
async function processConditionalForCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  const conditionalValueKeys = Object.keys(value)
  if (conditionalValueKeys.length !== 1) throw new Error()
  const key = conditionalValueKeys[0]
  const discriminant = extractDiscriminant(key, schema)

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

/** @internal Dispatches schema kind to appropriate create handler */
const createHandlers: Record<
  string,
  (
    schema: any,
    value: any,
    context: KeystoneContext,
    path: ReadonlyPropPath
  ) => Promise<any>
> = {
  form: (schema, value, context, path) => Promise.resolve(validateFormValue(schema, value, path)),
  array: (schema, value, context, path) => processArrayForCreate(schema, value, context, path),
  object: (schema, value, context, path) => processObjectForCreate(schema, value, context, path),
  relationship: (schema, value, context) => processRelationshipForCreate(schema, value, context),
  conditional: (schema, value, context, path) =>
    processConditionalForCreate(schema, value, context, path),
}

export async function getValueForCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  if (value === undefined) return getInitialPropsValue(schema)

  if (schema.kind === 'form') {
    return validateFormValue(schema, value, path)
  }

  checkNullValue(schema, value, path)

  const handler = createHandlers[schema.kind]
  if (handler) {
    return handler(schema, value, context, path)
  }

  if (schema.kind === 'child') {
    throw new Error(
      `Child fields are not supported in the structure field, found one at ${path.join('.')}`
    )
  }

  assertNever(schema)
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
```