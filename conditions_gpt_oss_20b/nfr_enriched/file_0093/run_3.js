import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

import { list } from '@keystone-6/core'
import { allowAll, denyAll } from '@keystone-6/core/access'
import { text } from '@keystone-6/core/fields'

export function makeName(o: Record<string, boolean>) {
  return (
    Object.entries(o)
      .filter(([, v]) => v)
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

/**
 * Helper to build operation access object.
 */
function buildOperationAccess(access: {
  query: boolean
  create: boolean
  update: boolean
  delete: boolean
}) {
  return {
    query: access.query ? allowAll : denyAll,
    create: access.create ? allowAll : denyAll,
    update: access.update ? allowAll : denyAll,
    delete: access.delete ? allowAll : denyAll,
  }
}

/**
 * Helper to build filter access object.
 */
function buildFilterAccess(access: {
  query: boolean
  create: boolean
  update: boolean
  delete: boolean
}) {
  return {
    query: allowAll,
    update: allowAll,
    delete: allowAll,
  }
}

/**
 * Helper to build item access object.
 */
function buildItemAccess(access: {
  query: boolean
  create: boolean
  update: boolean
  delete: boolean
}) {
  return {
    create: allowAll,
    update: allowAll,
    delete: allowAll,
  }
}

/**
 * Helper to build item access object with specific permissions.
 */
function buildItemAccessWithPermissions(access: {
  query: boolean
  create: boolean
  update: boolean
  delete: boolean
}) {
  return {
    create: access.create ? allowAll : denyAll,
    update: access.update ? allowAll : denyAll,
    delete: access.delete ? allowAll : denyAll,
  }
}

/**
 * Helper to create a yield object for a list component.
 */
function createYieldObject(
  name: string,
  type: string,
  access: {
    operation: any
    filter: any
    item: any
  },
  fields: Field[],
  pluralSuffix: string
) {
  return {
    name,
    expect: { type: type as const, ...access.operation },
    access,
    fields,
    graphql: {
      plural: name + pluralSuffix,
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

  yield createYieldObject(
    nameO,
    'operation',
    {
      operation: buildOperationAccess(access),
      filter: buildFilterAccess(access),
      item: buildItemAccess(access),
    },
    fields,
    's'
  )

  // filter duplicate tests
  if ([access.create, access.update, access.delete].includes(false)) {
    const nameI = `List_item_${suffix}`
    yield createYieldObject(
      nameI,
      'item',
      {
        operation: buildOperationAccess(access),
        filter: buildFilterAccess(access),
        item: buildItemAccessWithPermissions(access),
      },
      fields,
      's'
    )
  }

  // filter duplicate tests
  if ([access.query, access.update, access.delete].includes(false)) {
    const nameFB = `List_filterb_${suffix}`
    yield createYieldObject(
      nameFB,
      'filter(b)',
      {
        operation: buildOperationAccess(access),
        filter: buildFilterAccess(access),
        item: buildItemAccess(access),
      },
      fields,
      's'
    )

    const nameF = `List_filter_${suffix}`
    yield createYieldObject(
      nameF,
      'filter',
      {
        operation: buildOperationAccess(access),
        filter: {
          query: access.query ? allowFilter : denyFilter,
          update: access.update ? allowFilter : denyFilter,
          delete: access.delete ? allowFilter : denyFilter,
        },
        item: buildItemAccess(access),
      },
      fields,
      's'
    )
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
          for (const create of [/*false */ true]) {
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