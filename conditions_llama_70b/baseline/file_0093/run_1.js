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
    access: getAccess(access),
    fields,
    graphql: {
      plural: nameO + 's',
    },
  } as const

  if (shouldYieldItem(access)) {
    const nameI = `List_item_${suffix}`
    yield {
      name: nameI,
      expect: { type: 'item' as const, ...access },
      access: getItemAccess(access),
      fields,
      graphql: {
        plural: nameI + 's',
      },
    } as const
  }

  if (shouldYieldFilter(access)) {
    const nameFB = `List_filterb_${suffix}`
    yield {
      name: nameFB,
      expect: { type: 'filter(b)' as const, ...access },
      access: getFilterAccess(access),
      fields,
      graphql: {
        plural: nameFB + 's',
      },
    } as const

    const nameF = `List_filter_${suffix}`
    yield {
      name: nameF,
      expect: { type: 'filter' as const, ...access },
      access: getFilterAccessWithAllowFilter(access),
      fields,
      graphql: {
        plural: nameF + 's',
      },
    } as const
  }
}

function getAccess(access: {
  query: boolean
  create: boolean
  update: boolean
  delete: boolean
}) {
  return {
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
  }
}

function getItemAccess(access: {
  query: boolean
  create: boolean
  update: boolean
  delete: boolean
}) {
  return {
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
  }
}

function getFilterAccess(access: {
  query: boolean
  create: boolean
  update: boolean
  delete: boolean
}) {
  return {
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
  }
}

function getFilterAccessWithAllowFilter(access: {
  query: boolean
  create: boolean
  update: boolean
  delete: boolean
}) {
  return {
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
  }
}

function shouldYieldItem(access: {
  query: boolean
  create: boolean
  update: boolean
  delete: boolean
}) {
  return [access.create, access.update, access.delete].includes(false)
}

function shouldYieldFilter(access: {
  query: boolean
  create: boolean
  update: boolean
  delete: boolean
}) {
  return [access.query, access.update, access.delete].includes(false)
}