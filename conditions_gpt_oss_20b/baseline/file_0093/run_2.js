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
  const nameI = `List_item_${suffix}`
  const nameFB = `List_filterb_${suffix}`
  const nameF = `List_filter_${suffix}`

  const hasCreateOrUpdateOrDeleteFalse = [access.create, access.update, access.delete].includes(false)
  const hasQueryOrUpdateOrDeleteFalse = [access.query, access.update, access.delete].includes(false)

  const configs: Array<{
    name: string
    type: string
    op: Record<string, boolean>
    flt: Record<string, boolean>
    itm: Record<string, boolean>
    filterFunc?: Record<string, (b: boolean) => any>
  }> = []

  configs.push({
    name: nameO,
    type: 'operation',
    op: { query: access.query, create: access.create, update: access.update, delete: access.delete },
    flt: { query: true, update: true, delete: true },
    itm: { create: access.create, update: access.update, delete: access.delete },
  })

  if (hasCreateOrUpdateOrDeleteFalse) {
    configs.push({
      name: nameI,
      type: 'item',
      op: { query: access.query, create: true, update: true, delete: true },
      flt: { query: true, update: true, delete: true },
      itm: { create: access.create, update: access.update, delete: access.delete },
    })
  }

  if (hasQueryOrUpdateOrDeleteFalse) {
    configs.push({
      name: nameFB,
      type: 'filter(b)',
      op: { query: true, create: access.create, update: true, delete: true },
      flt: { query: access.query, update: access.update, delete: access.delete },
      itm: { create: true, update: true, delete: true },
    })
    configs.push({
      name: nameF,
      type: 'filter',
      op: { query: true, create: access.create, update: true, delete: access.delete },
      flt: { query: access.query, update: access.update, delete: access.delete },
      itm: { create: true, update: true, delete: true },
      filterFunc: {
        query: (b: boolean) => (b ? allowFilter : denyFilter),
        update: (b: boolean) => (b ? allowFilter : denyFilter),
        delete: (b: boolean) => (b ? allowFilter : denyFilter),
      },
    })
  }

  for (const cfg of configs) {
    const accessObj = {
      operation: {
        query: cfg.op.query ? allowAll : denyAll,
        create: cfg.op.create ? allowAll : denyAll,
        update: cfg.op.update ? allowAll : denyAll,
        delete: cfg.op.delete ? allowAll : denyAll,
      },
      filter: {
        query: cfg.filterFunc?.query
          ? cfg.filterFunc.query(cfg.op.query)
          : cfg.flt.query
          ? allowAll
          : denyAll,
        update: cfg.filterFunc?.update
          ? cfg.filterFunc.update(cfg.op.update)
          : cfg.flt.update
          ? allowAll
          : denyAll,
        delete: cfg.filterFunc?.delete
          ? cfg.filterFunc.delete(cfg.op.delete)
          : cfg.flt.delete
          ? allowAll
          : denyAll,
      },
      item: {
        create: cfg.itm.create ? allowAll : denyAll,
        update: cfg.itm.update ? allowAll : denyAll,
        delete: cfg.itm.delete ? allowAll : denyAll,
      },
    }

    yield {
      name: cfg.name,
      expect: { type: cfg.type as const, ...access },
      access: accessObj,
      fields,
      graphql: { plural: cfg.name + 's' },
    } as const
  }
}