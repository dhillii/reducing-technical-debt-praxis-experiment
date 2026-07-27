import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

import { list } from '@keystone-6/core'
import { allowAll, denyAll } from '@keystone-6/core/access'
import { text } from '@keystone-6/core/fields'

export function makeName(o: Record<string, boolean>) {
  return (
    Object.entries(o)
      .filter(([_, v]) => v)
      .map(([k]) => (k === 'unique' ? 'x' : k.charAt(0)))
      .join('')
      .toUpperCase() ?? 'DENY'
  )
}

export function countUniqueItems(items: readonly any[]) {
  return new Set(items.map(item => item.id)).size
}

export function expectEqualItem(l: List, a: any, b: any, keys: string[] = []) {
  assert.notEqual(a, null)
  if ('id' in b) assert.equal(a.id, b.id)
  for (const f of l.fields) {
    if (keys.length && !keys.includes(f.name)) continue
    if (f.expect.read) {
      assert.equal(a[f.name], b[f.name])
    } else {
      assert.equal(a[f.name], null)
    }
  }
}

export function expectEqualItems(
  l: List,
  a: readonly any[],
  b: any[],
  keys: string[] = [],
  sort = true
) {
  assert.notEqual(a, null)
  assert.equal(a.length, b.length)

  const sorteda = sort ? [...a].sort((x, y) => x.id.localeCompare(y.id)) : a
  const sortedb = sort ? [...b].sort((x, y) => x.id.localeCompare(y.id)) : b

  let i = 0
  for (const xa of sorteda) {
    const xb = sortedb[i++]
    expectEqualItem(l, xa, xb, keys)
  }
}

export function makeWhereUniqueFilter(fields: Field[], seeded: any) {
  return Object.fromEntries(
    fields.map(f => {
      return [f.name, seeded[f.name]]
    })
  )
}

export function makeWhereFilter(
  fields: Field[],
  seeded: Record<string, any> | Record<string, any>[]
): any {
  if (Array.isArray(seeded)) {
    return {
      OR: seeded.map(s => makeWhereFilter(fields, s)),
    }
  }

  return Object.fromEntries(
    fields.map(f => {
      return [f.name, { equals: seeded[f.name] }]
    })
  )
}

export function makeWhereAndFilter(
  fields: Field[],
  seeded: Record<string, any> | Record<string, any>[]
): any {
  if (Array.isArray(seeded)) {
    return {
      OR: seeded.map(s => makeWhereAndFilter(fields, s)),
    }
  }

  return {
    AND: fields.map(f => {
      return {
        [f.name]: { equals: seeded[f.name] },
      }
    }),
  }
}

export function makeFieldEntry({
  access,
  unique,
}: {
  access: {
    read: boolean
    create: boolean
    update: boolean
    filterable: boolean
  }
  unique: boolean
}) {
  const name = `Field_${makeName({ ...access, unique })}` as const
  return {
    name,
    expect: {
      ...access,
      unique,
    },
    access: {
      read: access.read ? allowAll : denyAll,
      create: access.create ? allowAll : denyAll,
      update: access.update ? allowAll : denyAll,
    },
    isFilterable: access.filterable ? allowAll : denyAll,
    isIndexed: unique ? 'unique' : false,
    validation: {
      isRequired: unique,
    },
    defaultValue: unique ? null : `Value_${name}`,
  } as const
}

export function allowFilter() {
  return {
    id: {
      not: null,
    },
  }
}

export function denyFilter() {
  return {
    id: {
      equals: 'never',
    },
  }
}

export type Field = ReturnType<typeof makeFieldEntry>
export type List = ReturnType<typeof makeList> extends Generator<infer T, any, any> ? T : never

function createOperationConfig(
  access: {
    query: boolean
    create: boolean
    update: boolean
    delete: boolean
  },
  suffix: string,
  type: 'operation' | 'item' | 'filter(b)' | 'filter'
): {
  name: string
  expect: { type: string } & { [key: string]: boolean }
  access: {
    operation: {
      query: boolean
      create: boolean
      update: boolean
      delete: boolean
    }
    filter: {
      query: boolean
      update: boolean
      delete: boolean
    }
    item: {
      create: boolean
      update: boolean
      delete: boolean
    }
  }
  fields: Field[]
  graphql: { plural: string }
} {
  const nameO = `List_operation_${suffix}`
  const nameI = `List_item_${suffix}`
  const nameFB = `List_filterb_${suffix}`
  const nameF = `List_filter_${suffix}`

  const buildAccess = (
    op: 'operation' | 'filter' | 'item',
    query: boolean,
    create: boolean,
    update: boolean,
    delete: boolean
  ) => ({
    [op]: {
      query: query ? allowAll : denyAll,
      create: create ? allowAll : denyAll,
      update: update ? allowAll : denyAll,
      delete: delete ? allowAll : denyAll,
    },
  })

  const buildFilterAccess = (query: boolean, update: boolean, delete: boolean) => ({
    filter: {
      query: query ? allowAll : denyAll,
      update: update ? allowAll : denyAll,
      delete: delete ? allowAll : denyAll,
    },
  })

  const buildItemAccess = (create: boolean, update: boolean, delete: boolean) => ({
    item: {
      create: create ? allowAll : denyAll,
      update: update ? allowAll : denyAll,
      delete: delete ? allowAll : denyAll,
    },
  })

  const baseAccess = {
    operation: {
      query: access.query ? allowAll : denyAll,
      create: access.create ? allowAll : denyAll,
      update: access.update ? allowAll : denyAll,
      delete: access.delete ? allowAll : denyAll,
    },
  }

  const filterAccess = {
    filter: {
      query: allowAll,
      update: allowAll,
      delete: allowAll,
    },
  }

  const itemAccess = {
    item: {
      create: allowAll,
      update: allowAll,
      delete: allowAll,
    },
  }

  const filterbAccess = {
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

  const filterAccessWithFilter = {
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

  const configs: {
    operation: { name: string; access: typeof baseAccess }
    item: { name: string; access: typeof itemAccess }
    filterb: { name: string; access: typeof filterbAccess }
    filter: { name: string; access: typeof filterAccessWithFilter }
  } = {
    operation: { name: nameO, access: baseAccess },
    item: { name: nameI, access: itemAccess },
    filterb: { name: nameFB, access: filterbAccess },
    filter: { name: nameF, access: filterAccessWithFilter },
  }

  const result: {
    operation: { name: string; access: typeof baseAccess }
    item: { name: string; access: typeof itemAccess }
    filterb: { name: string; access: typeof filterbAccess }
    filter: { name: string; access: typeof filterAccessWithFilter }
  } = {
    operation: { name: nameO, access: baseAccess },
    item: { name: nameI, access: itemAccess },
    filterb: { name: nameFB, access: filterbAccess },
    filter: { name: nameF, access: filterAccessWithFilter },
  }

  if ([access.create, access.update, access.delete].includes(false)) {
    result.item = {
      name: nameI,
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
    }
  }

  if ([access.query, access.update, access.delete].includes(false)) {
    result.filterb = {
      name: nameFB,
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
    }

    result.filter = {
      name: nameF,
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
    }
  }

  return {
    name: result.operation.name,
    expect: { type: 'operation' as const, ...access },
    access: result.operation.access,
    fields,
    graphql: {
      plural: result.operation.name + 's',
    },
  } as const
}

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

  if ([access.create, access.update, access.delete].includes(false)) {
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

  if ([access.query, access.update, access.delete].includes(false)) {
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
}

export function randomCount() {
  return 6
}

export function randomString() {
  return `foo-${randomUUID()}`
}

export async function seed(l: List, context: any) {
  const data = Object.fromEntries(l.fields.map(f => [f.name, randomString()]))

  return (await context.sudo().db[l.name].createOne({ data })) as Record<string, any>
}

export async function seedMany(l: List, context: any) {
  const data = [...Array(randomCount())].map(_ =>
    Object.fromEntries(l.fields.map(f => [f.name, randomString()]))
  )

  return (await context.sudo().db[l.name].createMany({ data })) as Record<string, any>[]
}

export function makeItem(
  l: {
    fields: Field[]
  },
  operation: 'create' | 'update'
) {
  return Object.fromEntries(
    l.fields.filter(f => f.expect[operation]).map(f => [f.name, randomString()])
  )
}

export const lists = [
  ...(function* () {
    const fields = [
      ...(function* () {
        for (const read of [false, true]) {
          for (const create of [false, true]) {
            for (const update of [false, true]) {
              for (const filterable of [false, true]) {
                yield makeFieldEntry({
                  access: {
                    read,
                    create,
                    update,
                    filterable,
                  },
                  unique: false,
                })
              }
            }
          }
        }
      })(),
    ]

    const fieldsUnique = [
      ...fields,
      ...(function* () {
        for (const read of [false, true]) {
          for (const create of [true]) {
            for (const update of [false, true]) {
              for (const filterable of [false, true]) {
                yield makeFieldEntry({
                  access: {
                    read,
                    create,
                    update,
                    filterable,
                  },
                  unique: true,
                })
              }
            }
          }
        }
      })(),
    ]

    for (const query of [false, true]) {
      for (const create of [false, true]) {
        for (const update of [false, true]) {
          for (const delete_ of [false, true]) {
            yield* makeList({
              access: {
                query,
                create,
                update,
                delete: delete_,
              },
              fields,
            })

            yield* makeList({
              prefix: `UNIQUE_`,
              access: {
                query,
                create,
                update,
                delete: delete_,
              },
              fields: fieldsUnique,
            })
          }
        }
      }
    }
  })(),
]

export const config = {
  lists: {
    ...Object.fromEntries(
      (function* () {
        for (const l of lists) {
          yield [
            l.name,
            list({
              ...l,
              fields: {
                ...Object.fromEntries(
                  (function* () {
                    for (const { name, expect, ...f } of l.fields) {
                      yield [name, text(f)]
                    }
                  })()
                ),
              },
            }),
          ]
        }
      })()
    ),
  },
}