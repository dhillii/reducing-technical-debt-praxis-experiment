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
  if (value === null) {
    throwNewNullError(schema.kind, path)
  }

  switch (schema.kind) {
    case 'object':
      return processObjectForUpdate(schema, value, prevValue, context, path)
    case 'array':
      return processArrayForUpdate(schema, value, prevValue, context, path)
    case 'relationship':
      return processRelationshipForUpdate(schema, value, context, prevValue, path)
    case 'conditional':
      return processConditionalForUpdate(schema, value, prevValue, context, path)
    case 'child':
      throw new Error(
        `Child fields are not supported in the structure field, found one at ${path.join('.')}`
      )
    default:
      assertNever(schema)
  }
}

function validateFormValue(
  schema: ComponentSchema,
  value: any,
  path: ReadonlyPropPath
): any {
  if (schema.validate(value)) return value
  throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
}

function processObjectForUpdate(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  return Object.fromEntries(
    Promise.all(
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

function processArrayForUpdate(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
): Promise<any> {
  return Promise.all(
    (value as any[]).map((val, i) =>
      getValueForUpdate(schema.element, val, prevValue[i] ?? null, context, path.concat(i))
    )
  )
}

function processRelationshipForUpdate(
  schema: ComponentSchema,
  value: any,
  context: KeystoneContext,
  prevValue: any,
  path: ReadonlyPropPath
): Promise<any> {
  if (schema.many) {
    const val = value as InferValueFromArg<
      GArg<NonNullable<GraphQLTypesForList['relateTo']['many']['update']>>
    >
    return resolveRelateToManyForUpdateInput(val, context, schema.listKey, prevValue)
  } else {
    const val = value as InferValueFromArg<
      GArg<NonNullable<GraphQLTypesForList['relateTo']['one']['update']>>
    >
    return resolveRelateToOneForUpdateInput(val, context, schema.listKey)
  }
}

function processConditionalForUpdate(
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

  const nestedSchema = (schema.values as any)[key]
  const previousValue =
    prevValue.discriminant === discriminant ? prevValue.value : getInitialPropsValue(schema)

  return getValueForUpdate(nestedSchema, value[key], previousValue, context, path.concat('value')).then(
    nestedValue => ({ discriminant, value: nestedValue })
  )
}

function throwNewNullError(kind: string, path: ReadonlyPropPath): never {
  throw new Error(
    `${kind[0].toUpperCase() + kind.slice(1)} fields cannot be set to null but the field at '${path.join(
      '.'
    )}' is null`
  )
}