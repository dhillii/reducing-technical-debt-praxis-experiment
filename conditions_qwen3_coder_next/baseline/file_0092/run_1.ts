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

  switch (schema.kind) {
    case 'object':
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

    case 'array':
      return Promise.all(
        (value as any[]).map((val, i) =>
          getValueForUpdate(schema.element, val, prevValue[i], context, path.concat(i))
        )
      )

    case 'relationship':
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

    case 'conditional': {
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

    case 'child':
      throw new Error(
        `Child fields are not supported in the structure field, found one at ${path.join('.')}`
      )

    default:
      assertNever(schema)
  }
}