export function* makeList({
  prefix = ``,
  access,
  fields,
}: {
  prefix?: string
  access: {
    query: boolean
    create: boolean
    update: boolean
    delete: boolean
  }
  fields: Field[]
}) {
  const suffix = `${prefix}${makeName(access)}`
  const nameO = `List_operation_${suffix}`

  yield {
    name: nameO,
    expect: { type: 'operation' as const, ...access },
    access: {
      operation: {
        query: access.query ? allowAll : denyAll,
        create: access.create ? allowAll : denyAll,
        update: access.update ? allowAll : denyAll,
        delete: access.delete ? allowAll : denyAll,
      },
      filter: {
        query: allowAll,
        update: allowAll,
        delete: allowAll,
      },
      item: {
        create: allowAll,
        update: allowAll,
        delete: allowAll,
      },
    },
    fields,
    graphql: {
      plural: nameO + 's',
    },
  } as const

  // filter duplicate tests
  if (hasFalse(access, ['create', 'update', 'delete'])) {
    yield* makeItemVariant(suffix, access, fields, 'item')
  }

  // filter duplicate tests
  if (hasFalse(access, ['query', 'update', 'delete'])) {
    yield* makeFilterVariant(suffix, access, fields, 'filter(b)', false)
    yield* makeFilterVariant(suffix, access, fields, 'filter', true)
  }
}

function hasFalse(
  obj: Record<string, boolean>,
  keys: string[]
): boolean {
  return keys.some(k => obj[k] === false)
}

function* makeItemVariant(
  suffix: string,
  access: {
    query: boolean
    create: boolean
    update: boolean
    delete: boolean
  },
  fields: Field[],
  type: 'item'
) {
  const name = `List_${type}_${suffix}`
  yield {
    name,
    expect: { type: type as const, ...access },
    access: {
      operation: {
        query: access.query ? allowAll : denyAll,
        create: allowAll,
        update: allowAll,
        delete: allowAll,
      },
      filter: {
        query: allowAll,
        update: allowAll,
        delete: allowAll,
      },
      item: {
        create: access.create ? allowAll : denyAll,
        update: access.update ? allowAll : denyAll,
        delete: access.delete ? allowAll : denyAll,
      },
    },
    fields,
    graphql: {
      plural: name + 's',
    },
  } as const
}

function* makeFilterVariant(
  suffix: string,
  access: {
    query: boolean
    create: boolean
    update: boolean
    delete: boolean
  },
  fields: Field[],
  type: 'filter(b)' | 'filter',
  useCustomFilters: boolean
) {
  const name = `List_${type.replace(/\(b\)/, '')}_${suffix}`
  const filterAccess = {
    query: access.query ? (useCustomFilters ? allowFilter : allowAll) : (useCustomFilters ? denyFilter : denyAll),
    update: access.update ? (useCustomFilters ? allowFilter : allowAll) : (useCustomFilters ? denyFilter : denyAll),
    delete: access.delete ? (useCustomFilters ? allowFilter : allowAll) : (useCustomFilters ? denyFilter : denyAll),
  }

  yield {
    name,
    expect: { type: type as const, ...access },
    access: {
      operation: {
        query: allowAll,
        create: access.create ? allowAll : denyAll,
        update: allowAll,
        delete: allowAll,
      },
      filter: filterAccess,
      item: {
        create: allowAll,
        update: allowAll,
        delete: allowAll,
      },
    },
    fields,
    graphql: {
      plural: name + 's',
    },
  } as const
}