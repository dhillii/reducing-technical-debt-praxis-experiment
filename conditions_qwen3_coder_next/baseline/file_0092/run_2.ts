function handleConditionalValue(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath,
  operation: 'create' | 'update'
) {
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
  const getPrevValue = () =>
    operation === 'update' && prevValue.discriminant === discriminant ? prevValue.value : getInitialPropsValue(schema)
  return {
    discriminant,
    value: operation === 'update'
      ? getValueForUpdate(
        (schema.values as any)[key],
        value[key],
        getPrevValue(),
        context,
        path.concat('value')
      )
      : getValueForCreate(
        (schema.values as any)[key],
        value[key],
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
    if (schema.validate(value)) return value
    throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
  }
  if (value === null) {
    throw new Error(
      `${schema.kind[0].toUpperCase() + schema.kind.slice(1)} fields cannot be set to null but the field at '${path.join('.')}' is null`
    )
  }
  if (schema.kind === 'object') {
    return Object.fromEntries(
      await Promise.all(
        Object.entries(schema.fields).map(async ([key, val]) => {
          return [
            key,
            await getValueForUpdate(
              val,
              value[key],
              prevValue[key],
              context,
              path.concat(key)
            ),
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
    return handleConditionalValue(schema, value, prevValue, context, path, 'update')
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
  // If value is undefined, get the specified defaultValue
  if (value === undefined) return getInitialPropsValue(schema)
  if (schema.kind === 'form') {
    if (schema.validate(value)) return value
    throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
  }
  if (value === null) {
    throw new Error(
      `${
        schema.kind[0].toUpperCase() + schema.kind.slice(1)
      } fields cannot be set to null but the field at '${path.join('.')}' is null`
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
    return handleConditionalValue(schema, value, undefined, context, path, 'create')
  }

  if (schema.kind === 'child') {
    throw new Error(
      `Child fields are not supported in the structure field, found one at ${path.join('.')}`
    )
  }

  assertNever(schema)
}