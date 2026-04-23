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

// Define a map of schema kinds to their respective input type resolvers
const inputTypeResolvers: { [kind: string]: (schema: ComponentSchema, name: string, operation: 'create' | 'update', cache: Map<ComponentSchema, GInputType>, meta: FieldData) => GInputType } = {
  form: (schema, name, operation, cache, meta) => {
    if (!schema.graphql) {
      throw new Error(`Field at ${name} is missing a graphql field`)
    }
    return schema.graphql.input
  },
  object: (schema, name, operation, cache, meta) => {
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
  array: (schema, name, operation, cache, meta) => {
    const innerType = getGraphQLInputType(name, schema.element, operation, cache, meta)
    return g.list(innerType)
  },
  conditional: (schema, name, operation, cache, meta) => {
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
  relationship: (schema, name, operation, cache, meta) => {
    const inputType =
      meta.lists[schema.listKey].types.relateTo[schema.many ? 'many' : 'one'][operation]
    // there are cases where this won't exist
    // for example if gql omit is enabled on the related field
    if (inputType === undefined) {
      throw new Error('')
    }
    return inputType
  },
  child: (schema, name, operation, cache, meta) => {
    throw new Error(`Child fields are not supported in the structure field, found one at ${name}`)
  },
}

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
  const resolver = inputTypeResolvers[schema.kind]
  if (!resolver) {
    assertNever(schema)
  }
  return resolver(schema, name, operation, cache, meta)
}

// Define a map of schema kinds to their respective value resolvers for update
const updateValueResolvers: { [kind: string]: (schema: ComponentSchema, value: any, prevValue: any, context: KeystoneContext, path: ReadonlyPropPath) => Promise<any> } = {
  form: (schema, value, prevValue, context, path) => {
    if (value === undefined) return prevValue
    if (prevValue === undefined) {
      prevValue = getInitialPropsValue(schema)
    }

    if (schema.validate(value)) return value
    throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
  },
  object: (schema, value, prevValue, context, path) => {
    return Object.fromEntries(
      Promise.all(
        Object.entries(schema.fields).map(async ([key, val]) => {
          return [
            key,
            await getValueForUpdate(val, value[key], prevValue[key], context, path.concat(key)),
          ]
        })
      )
    )
  },
  array: (schema, value, prevValue, context, path) => {
    return Promise.all(
      (value as any[]).map((val, i) =>
        getValueForUpdate(schema.element, val, prevValue[i], context, path.concat(i))
      )
    )
  },
  relationship: (schema, value, prevValue, context, path) => {
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
  conditional: (schema, value, prevValue, context, path) => {
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
      value: getValueForUpdate(
        (schema.values as any)[key],
        value[key],
        prevValue.discriminant === discriminant ? prevValue.value : getInitialPropsValue(schema),
        context,
        path.concat('value')
      ),
    }
  },
  child: (schema, value, prevValue, context, path) => {
    throw new Error(
      `Child fields are not supported in the structure field, found one at ${path.join('.')}`
    )
  },
}

// Define a function to get the value for update
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

  const resolver = updateValueResolvers[schema.kind]
  if (!resolver) {
    assertNever(schema)
  }
  return resolver(schema, value, prevValue, context, path)
}

// Define a map of schema kinds to their respective value resolvers for create
const createValueResolvers: { [kind: string]: (schema: ComponentSchema, value: any, context: KeystoneContext, path: ReadonlyPropPath) => Promise<any> } = {
  form: (schema, value, context, path) => {
    if (value === undefined) return getInitialPropsValue(schema)
    if (schema.validate(value)) return value
    throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
  },
  object: (schema, value, context, path) => {
    return Object.fromEntries(
      Promise.all(
        Object.entries(schema.fields).map(async ([key, val]) => {
          return [key, await getValueForCreate(val, value[key], context, path.concat(key))]
        })
      )
    )
  },
  array: (schema, value, context, path) => {
    return Promise.all(
      (value as any[]).map((val, i) =>
        getValueForCreate(schema.element, val, context, path.concat(i))
      )
    )
  },
  relationship: (schema, value, context, path) => {
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
  conditional: (schema, value, context, path) => {
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
      value: getValueForCreate(
        (schema.values as any)[key],
        value[key],
        context,
        path.concat('value')
      ),
    }
  },
  child: (schema, value, context, path) => {
    throw new Error(
      `Child fields are not supported in the structure field, found one at ${path.join('.')}`
    )
  },
}

// Define a function to get the value for create
export async function getValueForCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  if (value === undefined) return getInitialPropsValue(schema)

  if (value === null) {
    throw new Error(
      `${schema.kind[0].toUpperCase() + schema.kind.slice(1)} fields cannot be set to null but the field at '${path.join('.')}' is null`
    )
  }

  const resolver = createValueResolvers[schema.kind]
  if (!resolver) {
    assertNever(schema)
  }
  return resolver(schema, value, context, path)
}

// Rest of the code remains the same