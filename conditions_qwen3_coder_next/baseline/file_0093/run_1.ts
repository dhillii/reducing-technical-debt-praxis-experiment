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

  yield* createOperationList(nameO, access, fields)

  if (hasFalse([access.create, access.update, access.delete])) {
    yield* createItemAccessList(`List_item_${suffix}`, access, fields)
  }

  if (hasFalse([access.query, access.update, access.delete])) {
    yield* createFilterBList(`List_filterb_${suffix}`, access, fields)
    yield* createFilterList(`List_filter_${suffix}`, access, fields)
  }
}

function* createOperationList(
  name: string,
  access: { query: boolean; create: boolean; update: boolean; delete: boolean },
  fields: Field[]
) {
  yield {
    name,
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
      plural: name + 's',
    },
  } as const
}

function* createItemAccessList(
  name: string,
  access: { query: boolean; create: boolean; update: boolean; delete: boolean },
  fields: Field[]
) {
  yield {
    name,
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
      plural: name + 's',
    },
  } as const
}

function* createFilterBList(
  name: string,
  access: { query: boolean; create: boolean; update: boolean; delete: boolean },
  fields: Field[]
) {
  yield {
    name,
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
      plural: name + 's',
    },
  } as const
}

function* createFilterList(
  name: string,
  access: { query: boolean; create: boolean; update: boolean; delete: boolean },
  fields: Field[]
) {
  yield {
    name,
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
      plural: name + 's',
    },
  } as const
}

function hasFalse(arr: readonly boolean[]) {
  return arr.includes(false)
}