```javascript
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
const inputTypeResolvers: { [kind: string]: (schema: ComponentSchema, name: string, operation: string, cache: Map<ComponentSchema, GInputType>, meta: FieldData) => GInputType } = {
  'form': (schema, name, operation, cache, meta) => {
    if (!schema.graphql) {
      throw new Error(`Field at ${name} is missing a graphql field`)
    }
    return schema.graphql.input
  },
  'object': (schema, name, operation, cache, meta) => {
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
  'array': (schema, name, operation, cache, meta) => {
    const innerType = getGraphQLInputType(name, schema.element, operation, cache, meta)
    return g.list(innerType)
  },
  'conditional': (schema, name, operation, cache, meta) => {
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
  'relationship': (schema, name, operation, cache, meta) => {
    const inputType =
      meta.lists[schema.listKey].types.relateTo[schema.many ? 'many' : 'one'][operation]
    // there are cases where this won't exist
    // for example if gql omit is enabled on the related field
    if (inputType === undefined) {
      throw new Error('')
    }
    return inputType
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
  const resolver = inputTypeResolvers[schema.kind]
  if (!resolver) {
    throw new Error(`Unsupported schema kind: ${schema.kind}`)
  }
  return resolver(schema, name, operation, cache, meta)
}

// Define a map of schema kinds to their respective value resolvers for update
const updateValueResolvers: { [kind: string]: (schema: ComponentSchema, value: any, prevValue: any, context: KeystoneContext, path: ReadonlyPropPath) => Promise<any> } = {
  'form': async (schema, value, prevValue, context, path) => {
    if (value === undefined) return prevValue
    if (prevValue === undefined) {
      prevValue = getInitialPropsValue(schema)
    }

    if (schema.validate(value)) return value
    throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
  },
  'object': async (schema, value, prevValue, context, path) => {
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
  'array': async (schema, value, prevValue, context, path) => {
    return Promise.all(
      (value as any[]).map((val, i) =>
        getValueForUpdate(schema.element, val, prevValue[i], context, path.concat(i))
      )
    )
  },
  'relationship': async (schema, value, prevValue, context, path) => {
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
  'conditional': async (schema, value, prevValue, context, path) => {
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

export async function getValueForUpdate(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  const resolver = updateValueResolvers[schema.kind]
  if (!resolver) {
    throw new Error(`Unsupported schema kind: ${schema.kind}`)
  }
  return resolver(schema, value, prevValue, context, path)
}

// Define a map of schema kinds to their respective value resolvers for create
const createValueResolvers: { [kind: string]: (schema: ComponentSchema, value: any, context: KeystoneContext, path: ReadonlyPropPath) => Promise<any> } = {
  'form': async (schema, value, context, path) => {
    // If value is undefined, get the specified defaultValue
    if (value === undefined) return getInitialPropsValue(schema)
    if (schema.validate(value)) return value
    throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
  },
  'object': async (schema, value, context, path) => {
    return Object.fromEntries(
      await Promise.all(
        Object.entries(schema.fields).map(async ([key, val]) => {
          return [key, await getValueForCreate(val, value[key], context, path.concat(key))]
        })
      )
    )
  },
  'array': async (schema, value, context, path) => {
    return Promise.all(
      (value as any[]).map((val, i) =>
        getValueForCreate(schema.element, val, context, path.concat(i))
      )
    )
  },
  'relationship': async (schema, value, context, path) => {
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
  'conditional': async (schema, value, context, path) => {
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

export async function getValueForCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  const resolver = createValueResolvers[schema.kind]
  if (!resolver) {
    throw new Error(`Unsupported schema kind: ${schema.kind}`)
  }
  return resolver(schema, value, context, path)
}

// Rest of the code remains the same
```