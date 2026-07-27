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

  switch (schema.kind) {
    case 'form':
      return validateFormValue(schema, value, path)
    case 'object':
      return updateObjectValue(schema, value, prevValue, context, path)
    case 'array':
      return updateArrayValue(schema, value, prevValue, context, path)
    case 'relationship':
      return updateRelationshipValue(schema, value, prevValue, context, path)
    case 'conditional':
      return updateConditionalValue(schema, value, prevValue, context, path)
    default:
      throw new Error(`Unsupported schema kind: ${schema.kind}`)
  }
}

function validateFormValue(schema: ComponentSchema, value: any, path: ReadonlyPropPath) {
  if (schema.validate(value)) return value
  throw new Error(`The value of the form field at '${path.join('.')}' is invalid`)
}

function updateObjectValue(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
) {
  if (value === null) {
    throw new Error(
      `Object fields cannot be set to null but the field at '${path.join('.')}' is null`
    )
  }
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

function updateArrayValue(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
) {
  if (value === null) {
    throw new Error(
      `Array fields cannot be set to null but the field at '${path.join('.')}' is null`
    )
  }
  return Promise.all(
    (value as any[]).map((val, i) =>
      getValueForUpdate(schema.element, val, prevValue[i], context, path.concat(i))
    )
  )
}

function updateRelationshipValue(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
) {
  if (schema.many) {
    return resolveRelateToManyForUpdateInput(value, context, schema.listKey, prevValue)
  } else {
    return resolveRelateToOneForUpdateInput(value, context, schema.listKey)
  }
}

function updateConditionalValue(
  schema: ComponentSchema,
  value: any,
  prevValue: any,
  context: KeystoneContext,
  path: ReadonlyPropPath
) {
  if (value === null) {
    throw new Error(
      `Conditional fields cannot be set to null but the field at '${path.join('.')}' is null`
    )
  }
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