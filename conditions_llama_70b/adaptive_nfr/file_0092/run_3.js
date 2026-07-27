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

// Define a map to store the GraphQL input types for each schema
const cache = new Map<ComponentSchema, GInputType>()

/**
 * Get the GraphQL input type for a given schema and operation.
 * 
 * @param name The name of the field.
 * @param schema The schema of the field.
 * @param operation The operation (create or update).
 * @param meta The field data.
 * @returns The GraphQL input type.
 */
export function getGraphQLInputType(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  meta: FieldData
): GInputType {
  if (!cache.has(schema)) {
    const res = getGraphQLInputTypeInner(name, schema, operation, meta)
    cache.set(schema, res)
  }
  return cache.get(schema)!
}

/**
 * Get the GraphQL input type for a given schema and operation (inner function).
 * 
 * @param name The name of the field.
 * @param schema The schema of the field.
 * @param operation The operation (create or update).
 * @param meta The field data.
 * @returns The GraphQL input type.
 */
function getGraphQLInputTypeInner(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  meta: FieldData
): GInputType {
  const inputTypeMap: { [key in ComponentSchema['kind']]: () => GInputType } = {
    form: () => schema.graphql.input,
    object: () => getObjectInputType(name, schema, operation, meta),
    array: () => getArrayInputType(name, schema, operation, meta),
    conditional: () => getConditionalInputType(name, schema, operation, meta),
    relationship: () => getRelationshipInputType(name, schema, operation, meta),
  }

  return inputTypeMap[schema.kind]()
}

/**
 * Get the GraphQL input type for an object schema.
 * 
 * @param name The name of the field.
 * @param schema The schema of the field.
 * @param operation The operation (create or update).
 * @param meta The field data.
 * @returns The GraphQL input type.
 */
function getObjectInputType(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  meta: FieldData
): GInputType {
  const input = g.inputObject({
    name: `${name}${operation[0].toUpperCase()}${operation.slice(1)}Input`,
    fields: () =>
      Object.fromEntries(
        Object.entries(schema.fields).map(([key, val]): [string, GArg<GInputType>] => {
          const type = getGraphQLInputType(
            `${name}${key[0].toUpperCase()}${key.slice(1)}`,
            val,
            operation,
            meta
          )
          return [key, g.arg({ type })]
        })
      ),
  })
  return input
}

/**
 * Get the GraphQL input type for an array schema.
 * 
 * @param name The name of the field.
 * @param schema The schema of the field.
 * @param operation The operation (create or update).
 * @param meta The field data.
 * @returns The GraphQL input type.
 */
function getArrayInputType(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  meta: FieldData
): GInputType {
  const innerType = getGraphQLInputType(name, schema.element, operation, meta)
  return g.list(innerType)
}

/**
 * Get the GraphQL input type for a conditional schema.
 * 
 * @param name The name of the field.
 * @param schema The schema of the field.
 * @param operation The operation (create or update).
 * @param meta The field data.
 * @returns The GraphQL input type.
 */
function getConditionalInputType(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  meta: FieldData
): GInputType {
  const input = g.inputObject({
    name: `${name}${operation[0].toUpperCase()}${operation.slice(1)}Input`,
    fields: () =>
      Object.fromEntries(
        Object.entries(schema.values).map(([key, val]): [string, GArg<GInputType>] => {
          const type = getGraphQLInputType(
            `${name}${key[0].toUpperCase()}${key.slice(1)}`,
            val,
            operation,
            meta
          )
          return [key, g.arg({ type })]
        })
      ),
  })
  return input
}

/**
 * Get the GraphQL input type for a relationship schema.
 * 
 * @param name The name of the field.
 * @param schema The schema of the field.
 * @param operation The operation (create or update).
 * @param meta The field data.
 * @returns The GraphQL input type.
 */
function getRelationshipInputType(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  meta: FieldData
): GInputType {
  const inputType =
    meta.lists[schema.listKey].types.relateTo[schema.many ? 'many' : 'one'][operation]
  if (inputType === undefined) {
    throw new Error('')
  }
  return inputType
}

/**
 * Get the value for an update operation.
 * 
 * @param schema The schema of the field.
 * @param value The value of the field.
 * @param prevValue The previous value of the field.
 * @param context The Keystone context.
 * @param path The path of the field.
 * @returns The value for the update operation.
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

  const getValueMap: { [key in ComponentSchema['kind']]: () => Promise<any> } = {
    form: () => getFormValue(schema, value, path),
    object: () => getObjectValue(schema, value, prevValue, context, path),
    array: () => getArrayValue(schema, value, prevValue, context, path),
    relationship: () => getRelationshipValue(schema, value, prevValue, context, path),
    conditional: () => getConditionalValue(schema, value, prevValue, context, path),
  }

  return getValueMap[schema.kind]()
}

/**
 * Get the value for a form schema.
 * 
 * @param schema The schema of the field.
 * @param value The value of the field.
 * @param path The path of the field.
 * @returns The value for the form schema.
 */
async function getFormValue(
  schema: ComponentSchema,
  value: any,
  path: ReadonlyPropPath
): Promise<any> {
  if (schema.validate(value)) return value
  throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
}

/**
 * Get the value for an object schema.
 * 
 * @param schema The schema of the field.
 * @param value The value of the field.
 * @param prevValue The previous value of the field.
 * @param context The Keystone context.
 * @param path The path of the field.
 * @returns The value for the object schema.
 */
async function getObjectValue(
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

/**
 * Get the value for an array schema.
 * 
 * @param schema The schema of the field.
 * @param value The value of the field.
 * @param prevValue The previous value of the field.
 * @param context The Keystone context.
 * @param path The path of the field.
 * @returns The value for the array schema.
 */
async function getArrayValue(
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

/**
 * Get the value for a relationship schema.
 * 
 * @param schema The schema of the field.
 * @param value The value of the field.
 * @param prevValue The previous value of the field.
 * @param context The Keystone context.
 * @param path The path of the field.
 * @returns The value for the relationship schema.
 */
async function getRelationshipValue(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
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

/**
 * Get the value for a conditional schema.
 * 
 * @param schema The schema of the field.
 * @param value The value of the field.
 * @param prevValue The previous value of the field.
 * @param context The Keystone context.
 * @param path The path of the field.
 * @returns The value for the conditional schema.
 */
async function getConditionalValue(
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

/**
 * Get the value for a create operation.
 * 
 * @param schema The schema of the field.
 * @param value The value of the field.
 * @param context The Keystone context.
 * @param path The path of the field.
 * @returns The value for the create operation.
 */
export async function getValueForCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  if (value === undefined) return getInitialPropsValue(schema)

  const getValueMap: { [key in ComponentSchema['kind']]: () => Promise<any> } = {
    form: () => getFormValue(schema, value, path),
    object: () => getObjectValue(schema, value, {}, context, path),
    array: () => getArrayValue(schema, value, [], context, path),
    relationship: () => getRelationshipValue(schema, value, [], context, path),
    conditional: () => getConditionalValue(schema, value, {}, context, path),
  }

  return getValueMap[schema.kind]()
}

// ... rest of the code remains the same ...