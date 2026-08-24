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
    yield* makeItemAccessList(suffix, access, fields)
  }

  // filter duplicate tests
  if (hasFalse(access, ['query', 'update', 'delete'])) {
    yield* makeFilterBList(suffix, access, fields)
    yield* makeFilterList(suffix, access, fields)
  }
}

function hasFalse(
  obj: Record<string, boolean>,
  keys: string[]
): boolean {
  return keys.some(key => obj[key] === false)
}

function* makeItemAccessList(
  suffix: string,
  access: {
    query: boolean
    create: boolean
    update: boolean
    delete: boolean
  },
  fields: Field[]
) {
  const nameI = `List_item_${suffix}`
  yield {
    name: nameI,
    expect: { type: 'item' as const, ...access },
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
      plural: nameI + 's',
    },
  } as const
}

function* makeFilterBList(
  suffix: string,
  access: {
    query: boolean
    create: boolean
    update: boolean
    delete: boolean
  },
  fields: Field[]
) {
  const nameFB = `List_filterb_${suffix}`
  yield {
    name: nameFB,
    expect: { type: 'filter(b)' as const, ...access },
    access: {
      operation: {
        query: allowAll,
        create: access.create ? allowAll : denyAll,
        update: allowAll,
        delete: allowAll,
      },
      filter: {
        query: access.query ? allowAll : denyAll,
        update: access.update ? allowAll : denyAll,
        delete: access.delete ? allowAll : denyAll,
      },
      item: {
        create: allowAll,
        update: allowAll,
        delete: allowAll,
      },
    },
    fields,
    graphql: {
      plural: nameFB + 's',
    },
  } as const
}

function* makeFilterList(
  suffix: string,
  access: {
    query: boolean
    create: boolean
    update: boolean
    delete: boolean
  },
  fields: Field[]
) {
  const nameF = `List_filter_${suffix}`
  yield {
    name: nameF,
    expect: { type: 'filter' as const, ...access },
    access: {
      operation: {
        query: allowAll,
        create: access.create ? allowAll : denyAll,
        update: allowAll,
        delete: allowAll,
      },
      filter: {
        query: access.query ? allowFilter : denyFilter,
        update: access.update ? allowFilter : denyFilter,
        delete: access.delete ? allowFilter : denyFilter,
      },
      item: {
        create: allowAll,
        update: allowAll,
        delete: allowAll,
      },
    },
    fields,
    graphql: {
      plural: nameF + 's',
    },
  } as const
}