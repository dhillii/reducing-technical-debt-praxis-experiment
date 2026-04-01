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

// Handles form schema input type
function handleFormInputType(schema: ComponentSchema & { kind: 'form' }): GInputType {
  if (!schema.graphql) {
    throw new Error(`Field is missing a graphql field`)
  }
  return schema.graphql.input
}

// Handles object schema input type
function handleObjectInputType(
  name: string,
  schema: ComponentSchema & { kind: 'object' },
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

// Handles array schema input type
function handleArrayInputType(
  name: string,
  schema: ComponentSchema & { kind: 'array' },
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  const innerType = getGraphQLInputType(name, schema.element, operation, cache, meta)
  return g.list(innerType)
}

// Handles conditional schema input type
function handleConditionalInputType(
  name: string,
  schema: ComponentSchema & { kind: 'conditional' },
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

// Handles relationship schema input type
function handleRelationshipInputType(
  schema: ComponentSchema & { kind: 'relationship' },
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

function getGraphQLInputTypeInner(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  if (schema.kind === 'form') {
    return handleFormInputType(schema)
  }
  if (schema.kind === 'object') {
    return handleObjectInputType(name, schema, operation, cache, meta)
  }
  if (schema.kind === 'array') {
    return handleArrayInputType(name, schema, operation, cache, meta)
  }
  if (schema.kind === 'conditional') {
    return handleConditionalInputType(name, schema, operation, cache, meta)
  }
  if (schema.kind === 'relationship') {
    return handleRelationshipInputType(schema, meta, operation)
  }
  if (schema.kind === 'child') {
    throw new Error(`Child fields are not supported in the structure field, found one at ${name}`)
  }

  assertNever(schema)
}

// Validates form field value
function validateFormValue(schema: ComponentSchema & { kind: 'form' }, value: any, path: ReadonlyPropPath): any {
  if (schema.validate(value)) return value
  throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
}

// Validates null value for non-nullable schema kinds
function validateNonNullValue(schema: ComponentSchema, value: any, path: ReadonlyPropPath): void {
  if (value === null) {
    throw new Error(
      `${schema.kind[0].toUpperCase() + schema.kind.slice(1)} fields cannot be set to null but the field at '${path.join('.')}' is null`
    )
  }
}

// Processes object schema value
async function processObjectValue(
  schema: ComponentSchema & { kind: 'object' },
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath,
  isUpdate: boolean
): Promise<any> {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(schema.fields).map(async ([key, val]) => {
        const prevVal = isUpdate ? prevValue[key] : undefined
        return [
          key,
          await getValueForUpdate(val, value[key], prevVal, context, path.concat(key)),
        ]
      })
    )
  )
}

// Processes array schema value
async function processArrayValue(
  schema: ComponentSchema & { kind: 'array' },
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath,
  isUpdate: boolean
): Promise<any> {
  return Promise.all(
    (value as any[]).map((val, i) =>
      getValueForUpdate(schema.element, val, isUpdate ? prevValue[i] : undefined, context, path.concat(i))
    )
  )
}

// Processes relationship schema value for update
async function processRelationshipValueForUpdate(
  schema: ComponentSchema & { kind: 'relationship' },
  value: any,
  prevValue: any,
  context: KeystoneContext
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

// Processes conditional schema value
async function processConditionalValue(
  schema: ComponentSchema & { kind: 'conditional' },
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath,
  isUpdate: boolean
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
  
  const prevConditionalValue = isUpdate && prevValue.discriminant === discriminant 
    ? prevValue.value 
    : getInitialPropsValue(schema)
  
  return {
    discriminant,
    value: await getValueForUpdate(
      (schema.values as any)[key],
      value[key],
      prevConditionalValue,
      context,
      path.concat('value')
    ),
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

  if (schema.kind === 'form') {
    return validateFormValue(schema, value, path)
  }
  
  validateNonNullValue(schema, value, path)
  
  if (schema.kind === 'object') {
    return processObjectValue(schema, value, prevValue, context, path, true)
  }
  if (schema.kind === 'array') {
    return processArrayValue(schema, value, prevValue, context, path, true)
  }
  if (schema.kind === 'relationship') {
    return processRelationshipValueForUpdate(schema, value, prevValue, context)
  }
  if (schema.kind === 'conditional') {
    return processConditionalValue(schema, value, prevValue, context, path, true)
  }
  if (schema.kind === 'child') {
    throw new Error(
      `Child fields are not supported in the structure field, found one at ${path.join('.')}`
    )
  }

  assertNever(schema)
}

// Processes relationship schema value for create
async function processRelationshipValueForCreate(
  schema: ComponentSchema & { kind: 'relationship' },
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

// Processes conditional schema value for create
async function processConditionalValueForCreate(
  schema: ComponentSchema & { kind: 'conditional' },
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
  
  validateNonNullValue(schema, value, path)
  
  if (schema.kind === 'array') {
    return processArrayValue(schema, value, undefined, context, path, false)
  }
  if (schema.kind === 'object') {
    return processObjectValue(schema, value, {}, context, path, false)
  }
  if (schema.kind === 'relationship') {
    return processRelationshipValueForCreate(schema, value, context)
  }
  if (schema.kind === 'conditional') {
    return processConditionalValueForCreate(schema, value, context, path)
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

// Collects errors from settled promises
function collectRelationshipErrors(
  results: PromiseSettledResult<any>[],
  tag?: string
): { error: Error; tag: string }[] {
  return results.filter(isRejected).map(x => ({ error: x.reason, tag: tag || '' }))
}

// Filters and maps fulfilled results
function getFulfilledValues<T>(results: PromiseSettledResult<T>[]): T[] {
  return results.filter(isFulfilled).map(x => x.value)
}

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

  const errors = collectRelationshipErrors([...connectResult, ...createResult], tag)
  if (errors.length) {
    throw new RelationshipErrors(errors)
  }

  return getFulfilledValues([...connectResult, ...createResult])
}

// Validates update input has required fields
function validateUpdateInput(value: _UpdateValueManyType): void {
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

// Applies relationship changes to previous values
function applyRelationshipChanges(
  prevVal: { id: string }[],
  setResult: PromiseSettledResult<any>[],
  disconnectResult: PromiseSettledResult<any>[],
  connectResult: PromiseSettledResult<any>[],
  createResult: PromiseSettledResult<any>[],
  value: _UpdateValueManyType
): { id: string }[] {
  let values = prevVal
  if (value.set) {
    values = getFulfilledValues(setResult)
  }

  const idsToDisconnect = new Set(getFulfilledValues(disconnectResult).map(x => x.id))
  values = values.filter(x => !idsToDisconnect.has(x.id))
  values.push(...getFulfilledValues(connectResult))
  values.push(...getFulfilledValues(createResult))

  return values
}

export async function resolveRelateToManyForUpdateInput(
  value: _UpdateValueManyType,
  context: KeystoneContext,
  foreignListKey: string,
  prevVal: { id: string }[]
) {
  validateUpdateInput(value)

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

  const errors = collectRelationshipErrors([...connectResult, ...createResult, ...disconnectResult, ...setResult])
  if (errors.length) throw new RelationshipErrors(errors)

  return applyRelationshipChanges(prevVal, setResult, disconnectResult, connectResult, createResult, value)
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