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

// Extracted function to handle caching of GraphQL input types
function getGraphQLInputTypeFromCache(
  schema: ComponentSchema,
  cache: Map<ComponentSchema, GInputType>
): GInputType | undefined {
  return cache.get(schema)
}

// Extracted function to create a new GraphQL input type
function createGraphQLInputType(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  meta: FieldData
): GInputType {
  if (schema.kind === 'form') {
    if (!schema.graphql) {
      throw new Error(`Field at ${name} is missing a graphql field`)
    }
    return schema.graphql.input
  }
  if (schema.kind === 'object') {
    return g.inputObject({
      name: `${name}${operation[0].toUpperCase()}${operation.slice(1)}Input`,
      fields: () =>
        Object.fromEntries(
          Object.entries(schema.fields).map(([key, val]): [string, GArg<GInputType>] => {
            const type = getGraphQLInputType(
              `${name}${key[0].toUpperCase()}${key.slice(1)}`,
              val,
              operation,
              new Map(),
              meta
            )
            return [key, g.arg({ type })]
          })
        ),
    })
  }
  if (schema.kind === 'array') {
    const innerType = getGraphQLInputType(name, schema.element, operation, new Map(), meta)
    return g.list(innerType)
  }
  if (schema.kind === 'conditional') {
    return g.inputObject({
      name: `${name}${operation[0].toUpperCase()}${operation.slice(1)}Input`,
      fields: () =>
        Object.fromEntries(
          Object.entries(schema.values).map(([key, val]): [string, GArg<GInputType>] => {
            const type = getGraphQLInputType(
              `${name}${key[0].toUpperCase()}${key.slice(1)}`,
              val,
              operation,
              new Map(),
              meta
            )
            return [key, g.arg({ type })]
          })
        ),
    })
  }

  if (schema.kind === 'relationship') {
    const inputType =
      meta.lists[schema.listKey].types.relateTo[schema.many ? 'many' : 'one'][operation]
    // there are cases where this won't exist
    // for example if gql omit is enabled on the related field
    if (inputType === undefined) {
      throw new Error('')
    }
    return inputType
  }
  if (schema.kind === 'child') {
    throw new Error(`Child fields are not supported in the structure field, found one at ${name}`)
  }

  assertNever(schema)
}

// Refactored function to get the GraphQL input type
export function getGraphQLInputType(
  name: string,
  schema: ComponentSchema,
  operation: 'create' | 'update',
  cache: Map<ComponentSchema, GInputType>,
  meta: FieldData
): GInputType {
  const cachedType = getGraphQLInputTypeFromCache(schema, cache)
  if (cachedType) return cachedType
  const type = createGraphQLInputType(name, schema, operation, meta)
  cache.set(schema, type)
  return type
}

// Extracted function to validate the value of a form field
function validateFormField(schema: ComponentSchema, value: any, path: ReadonlyPropPath): any {
  if (schema.validate(value)) return value
  throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
}

// Extracted function to handle null values
function handleNullValue(schema: ComponentSchema, value: any, path: ReadonlyPropPath): any {
  if (value === null) {
    throw new Error(
      `${schema.kind[0].toUpperCase() + schema.kind.slice(1)} fields cannot be set to null but the field at '${path.join('.')}' is null`
    )
  }
  return value
}

// Extracted function to get the initial value of a field
function getInitialValue(schema: ComponentSchema): any {
  return getInitialPropsValue(schema)
}

// Refactored function to get the value for update
export async function getValueForUpdate(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  if (value === undefined) return prevValue
  if (prevValue === undefined) {
    prevValue = getInitialValue(schema)
  }

  if (schema.kind === 'form') {
    return validateFormField(schema, value, path)
  }
  if (schema.kind === 'object') {
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
  if (schema.kind === 'array') {
    return Promise.all(
      (value as any[]).map((val, i) =>
        getValueForUpdate(schema.element, val, prevValue[i], context, path.concat(i))
      )
    )
  }
  if (schema.kind === 'relationship') {
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
  if (schema.kind === 'conditional') {
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
        prevValue.discriminant === discriminant ? prevValue.value : getInitialValue(schema),
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

// Refactored function to get the value for create
export async function getValueForCreate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  // If value is undefined, get the specified defaultValue
  if (value === undefined) return getInitialValue(schema)
  if (schema.kind === 'form') {
    return validateFormField(schema, value, path)
  }
  if (value === null) {
    throw new Error(
      `${schema.kind[0].toUpperCase() + schema.kind.slice(1)} fields cannot be set to null but the field at '${path.join('.')}' is null`
    )
  }
  if (schema.kind === 'array') {
    return Promise.all(
      (value as any[]).map((val, i) =>
        getValueForCreate(schema.element, val, context, path.concat(i))
      )
    )
  }
  if (schema.kind === 'object') {
    return Object.fromEntries(
      await Promise.all(
        Object.entries(schema.fields).map(async ([key, val]) => {
          return [key, await getValueForCreate(val, value[key], context, path.concat(key))]
        })
      )
    )
  }
  if (schema.kind === 'relationship') {
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
  if (schema.kind === 'conditional') {
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

  if (schema.kind === 'child') {
    throw new Error(
      `Child fields are not supported in the structure field, found one at ${path.join('.')}`
    )
  }

  assertNever(schema)
}

// ... (rest of the code remains the same)
```