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

// Define a lookup table for getGraphQLInputType
const getGraphQLInputTypeLookup = {
  form: (name: string, schema: ComponentSchema, operation: 'create' | 'update', cache: Map<ComponentSchema, GInputType>, meta: FieldData) => {
    if (!schema.graphql) {
      throw new Error(`Field at ${name} is missing a graphql field`)
    }
    return schema.graphql.input
  },
  object: (name: string, schema: ComponentSchema, operation: 'create' | 'update', cache: Map<ComponentSchema, GInputType>, meta: FieldData) => {
    const input = g.inputObject({
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
    return input
  },
  array: (name: string, schema: ComponentSchema, operation: 'create' | 'update', cache: Map<ComponentSchema, GInputType>, meta: FieldData) => {
    const innerType = getGraphQLInputType(name, schema.element, operation, cache, meta)
    return g.list(innerType)
  },
  conditional: (name: string, schema: ComponentSchema, operation: 'create' | 'update', cache: Map<ComponentSchema, GInputType>, meta: FieldData) => {
    const input = g.inputObject({
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
    return input
  },
  relationship: (name: string, schema: ComponentSchema, operation: 'create' | 'update', cache: Map<ComponentSchema, GInputType>, meta: FieldData) => {
    const inputType =
      meta.lists[schema.listKey].types.relateTo[schema.many ? 'many' : 'one'][operation]
    // there are cases where this won't exist
    // for example if gql omit is enabled on the related field
    if (inputType === undefined) {
      throw new Error('')
    }
    return inputType
  },
  child: (name: string, schema: ComponentSchema, operation: 'create' | 'update', cache: Map<ComponentSchema, GInputType>, meta: FieldData) => {
    throw new Error(`Child fields are not supported in the structure field, found one at ${name}`)
  },
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
  const handler = getGraphQLInputTypeLookup[schema.kind]
  if (!handler) {
    assertNever(schema)
  }
  return handler(name, schema, operation, cache, meta)
}

// Define a lookup table for getValueForUpdate
const getValueForUpdateLookup = {
  form: async (schema: ComponentSchema, value: any, prevValue: any, context: KeystoneContext, path: ReadonlyPropPath) => {
    if (schema.validate(value)) return value
    throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
  },
  object: async (schema: ComponentSchema, value: any, prevValue: any, context: KeystoneContext, path: ReadonlyPropPath) => {
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
  },
  array: async (schema: ComponentSchema, value: any, prevValue: any, context: KeystoneContext, path: ReadonlyPropPath) => {
    return Promise.all(
      (value as any[]).map((val, i) =>
        getValueForUpdate(schema.element, val, prevValue[i], context, path.concat(i))
      )
    )
  },
  relationship: async (schema: ComponentSchema, value: any, prevValue: any, context: KeystoneContext, path: ReadonlyPropPath) => {
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
  },
  conditional: async (schema: ComponentSchema, value: any, prevValue: any, context: KeystoneContext, path: ReadonlyPropPath) => {
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
  child: async (schema: ComponentSchema, value: any, prevValue: any, context: KeystoneContext, path: ReadonlyPropPath) => {
    throw new Error(
      `Child fields are not supported in the structure field, found one at ${path.join('.')}`
    )
  },
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

  if (value === null) {
    throw new Error(
      `${schema.kind[0].toUpperCase() + schema.kind.slice(1)} fields cannot be set to null but the field at '${path.join('.')}' is null`
    )
  }

  const handler = getValueForUpdateLookup[schema.kind]
  if (!handler) {
    assertNever(schema)
  }
  return handler(schema, value, prevValue, context, path)
}

// Define a lookup table for getValueForCreate
const getValueForCreateLookup = {
  form: async (schema: ComponentSchema, value: any, context: KeystoneContext, path: ReadonlyPropPath) => {
    if (schema.validate(value)) return value
    throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
  },
  object: async (schema: ComponentSchema, value: any, context: KeystoneContext, path: ReadonlyPropPath) => {
    return Object.fromEntries(
      await Promise.all(
        Object.entries(schema.fields).map(async ([key, val]) => {
          return [key, await getValueForCreate(val, value[key], context, path.concat(key))]
        })
      )
    )
  },
  array: async (schema: ComponentSchema, value: any, context: KeystoneContext, path: ReadonlyPropPath) => {
    return Promise.all(
      (value as any[]).map((val, i) =>
        getValueForCreate(schema.element, val, context, path.concat(i))
      )
    )
  },
  relationship: async (schema: ComponentSchema, value: any, context: KeystoneContext, path: ReadonlyPropPath) => {
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
  },
  conditional: async (schema: ComponentSchema, value: any, context: KeystoneContext, path: ReadonlyPropPath) => {
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
  child: async (schema: ComponentSchema, value: any, context: KeystoneContext, path: ReadonlyPropPath) => {
    throw new Error(
      `Child fields are not supported in the structure field, found one at ${path.join('.')}`
    )
  },
}

export async function getValueForCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  // If value is undefined, get the specified defaultValue
  if (value === undefined) return getInitialPropsValue(schema)

  if (value === null) {
    throw new Error(
      `${
        schema.kind[0].toUpperCase() + schema.kind.slice(1)
      } fields cannot be set to null but the field at '${path.join('.')}' is null`
    )
  }

  const handler = getValueForCreateLookup[schema.kind]
  if (!handler) {
    assertNever(schema)
  }
  return handler(schema, value, context, path)
}

// Rest of the code remains the same