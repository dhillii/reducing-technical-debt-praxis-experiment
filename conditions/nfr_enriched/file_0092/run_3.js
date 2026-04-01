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

// Handles form schema input type resolution
function handleFormSchema(schema: ComponentSchema): GInputType {
  if (!schema.graphql) {
    throw new Error(`Field is missing a graphql field`)
  }
  return schema.graphql.input
}

// Generates input object name with operation suffix
function generateInputObjectName(name: string, operation: 'create' | 'update'): string {
  return `${name}${operation[0].toUpperCase()}${operation.slice(1)}Input`
}

// Capitalizes first letter of a string
function capitalizeFirstLetter(str: string): string {
  return str[0].toUpperCase() + str.slice(1)
}

// Handles object schema input type resolution
function handleObjectSchema(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  const input = g.inputObject({
    name: generateInputObjectName(name, operation),
    fields: () =>
      Object.fromEntries(
        Object.entries(schema.fields).map(([key, val]): [string, GArg<GInputType>] => {
          const type = getGraphQLInputType(
            `${name}${capitalizeFirstLetter(key)}`,
            val,
            operation,
            cache,
            meta
          )
          return [key, g.arg({ type })]
        })
      ),
  })
  return input
}

// Handles conditional schema input type resolution
function handleConditionalSchema(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  const input = g.inputObject({
    name: generateInputObjectName(name, operation),
    fields: () =>
      Object.fromEntries(
        Object.entries(schema.values).map(([key, val]): [string, GArg<GInputType>] => {
          const type = getGraphQLInputType(
            `${name}${capitalizeFirstLetter(key)}`,
            val,
            operation,
            cache,
            meta
          )
          return [key, g.arg({ type })]
        })
      ),
  })
  return input
}

// Handles relationship schema input type resolution
function handleRelationshipSchema(
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

function getGraphQLInputTypeInner(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  if (schema.kind === 'form') {
    return handleFormSchema(schema)
  }
  if (schema.kind === 'object') {
    return handleObjectSchema(name, schema, operation, cache, meta)
  }
  if (schema.kind === 'array') {
    const innerType = getGraphQLInputType(name, schema.element, operation, cache, meta)
    return g.list(innerType)
  }
  if (schema.kind === 'conditional') {
    return handleConditionalSchema(name, schema, operation, cache, meta)
  }
  if (schema.kind === 'relationship') {
    return handleRelationshipSchema(schema, meta, operation)
  }
  if (schema.kind === 'child') {
    throw new Error(`Child fields are not supported in the structure field, found one at ${name}`)
  }

  assertNever(schema)
}

// Validates form field value
function validateFormValue(schema: ComponentSchema, value: any, path: ReadonlyPropPath): void {
  if (!schema.validate(value)) {
    throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
  }
}

// Validates non-null constraint for schema kind
function validateNonNull(schema: ComponentSchema, value: any, path: ReadonlyPropPath): void {
  if (value === null) {
    throw new Error(
      `${capitalizeFirstLetter(schema.kind)} fields cannot be set to null but the field at '${path.join('.')}' is null`
    )
  }
}

// Processes object schema for update/create
async function processObjectSchema(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath,
  processor: (s: ComponentSchema, v: any, pv: any, c: KeystoneContext, p: ReadonlyPropPath) => Promise<any>
): Promise<any> {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(schema.fields).map(async ([key, val]) => {
        return [
          key,
          await processor(val, value[key], prevValue[key], context, path.concat(key)),
        ]
      })
    )
  )
}

// Processes array schema for update/create
async function processArraySchema(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath,
  processor: (s: ComponentSchema, v: any, pv: any, c: KeystoneContext, p: ReadonlyPropPath) => Promise<any>
): Promise<any> {
  return Promise.all(
    (value as any[]).map((val, i) =>
      processor(schema.element, val, prevValue[i], context, path.concat(i))
    )
  )
}

// Processes conditional schema discriminant
function processConditionalDiscriminant(key: string, schema: ComponentSchema): string | boolean {
  let discriminant: string | boolean = key
  if ((key === 'true' || key === 'false') && !schema.discriminant.validate(key)) {
    discriminant = key === 'true'
  }
  return discriminant
}

// Validates conditional field has exactly one key set
function validateConditionalInput(value: any, path: ReadonlyPropPath): string {
  const conditionalValueKeys = Object.keys(value)
  if (conditionalValueKeys.length !== 1) {
    throw new Error(
      `Conditional field inputs must set exactly one of the fields but the field at ${path.join(
        '.'
      )} has ${conditionalValueKeys.length} fields set`
    )
  }
  return conditionalValueKeys[0]
}

// Handles relationship update for many
async function handleRelationshipUpdateMany(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  prevValue: any
): Promise<any> {
  const val = (value as InferValueFromArg<
    GArg<NonNullable<GraphQLTypesForList['relateTo']['many']['update']>>
  >)!
  return resolveRelateToManyForUpdateInput(val, context, schema.listKey, prevValue)
}

// Handles relationship update for one
async function handleRelationshipUpdateOne(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext
): Promise<any> {
  const val = (value as InferValueFromArg<
    GArg<NonNullable<GraphQLTypesForList['relateTo']['one']['update']>>
  >)!
  return resolveRelateToOneForUpdateInput(val, context, schema.listKey)
}

// Handles relationship create for many
async function handleRelationshipCreateMany(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext
): Promise<any> {
  const val = (value as InferValueFromArg<
    GArg<NonNullable<GraphQLTypesForList['relateTo']['many']['create']>>
  >)!
  return resolveRelateToManyForCreateInput(val, context, schema.listKey)
}

// Handles relationship create for one
async function handleRelationshipCreateOne(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext
): Promise<any> {
  const val = (value as InferValueFromArg<
    GArg<NonNullable<GraphQLTypesForList['relateTo']['one']['create']>>
  >)!
  return resolveRelateToOneForCreateInput(val, context, schema.listKey)
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
    validateFormValue(schema, value, path)
    return value
  }
  if (value === null) {
    validateNonNull(schema, value, path)
  }
  if (schema.kind === 'object') {
    return processObjectSchema(schema, value, prevValue, context, path, getValueForUpdate)
  }
  if (schema.kind === 'array') {
    return processArraySchema(schema, value, prevValue, context, path, getValueForUpdate)
  }
  if (schema.kind === 'relationship') {
    if (schema.many) {
      return handleRelationshipUpdateMany(schema, value, context, prevValue)
    } else {
      return handleRelationshipUpdateOne(schema, value, context)
    }
  }
  if (schema.kind === 'conditional') {
    const key = validateConditionalInput(value, path)
    const discriminant = processConditionalDiscriminant(key, schema)
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

  if (schema.kind === 'child') {
    throw new Error(
      `Child fields are not supported in the structure field, found one at ${path.join('.')}`
    )
  }

  assertNever(schema)
}

export async function getValueForCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  if (value === undefined) return getInitialPropsValue(schema)
  if (schema.kind === 'form') {
    validateFormValue(schema, value, path)
    return value
  }
  if (value === null) {
    validateNonNull(schema, value, path)
  }
  if (schema.kind === 'array') {
    return processArraySchema(schema, value, undefined, context, path, getValueForCreate)
  }
  if (schema.kind === 'object') {
    return processObjectSchema(schema, value, undefined, context, path, getValueForCreate)
  }
  if (schema.kind === 'relationship') {
    if (schema.many) {
      return handleRelationshipCreateMany(schema, value, context)
    } else {
      return handleRelationshipCreateOne(schema, value, context)
    }
  }
  if (schema.kind === 'conditional') {
    const key = validateConditionalInput(value, path)
    const discriminant = processConditionalDiscriminant(key, schema)
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

export const isFulfilled = <T>(arg: PromiseSettledResult<T>): arg is PromiseFulfilledResult<T> =>
  arg.status === 'fulfilled'
export const isRejected = (arg: PromiseSettledResult<any>): arg is PromiseRejectedResult =>
  arg.status === 'rejected'

// Collects errors from settled promises
function collectErrors(results: PromiseSettledResult<any>[]): PromiseRejectedResult[] {
  return results.filter(isRejected)
}

// Extracts fulfilled values from settled promises
function extractFulfilledValues(results: PromiseSettledResult<any>[]): any[] {
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

  const errors = collectErrors([...connectResult, ...createResult])