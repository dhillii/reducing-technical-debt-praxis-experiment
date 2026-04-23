```typescript
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

import { list } from '@keystone-6/core'
import { allowAll, denyAll } from '@keystone-6/core/access'
import { text } from '@keystone-6/core/fields'

// Helper functions
function makeName(o: Record<string, boolean>) {
  return (
    Object.entries(o)
      .filter(([_, v]) => v)
      .map(([k]) => (k === 'unique' ? 'x' : k.charAt(0)))
      .join('')
      .toUpperCase() ?? 'DENY'
  )
}

function countUniqueItems(items: readonly any[]) {
  return new Set(items.map(item => item.id)).size
}

// Assertion functions
function expectEqualItem(l: List, a: any, b: any, keys: string[] = []) {
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

function expectEqualItems(
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

  sorteda.forEach((xa, i) => {
    const xb = sortedb[i]
    expectEqualItem(l, xa, xb, keys)
  })
}

// Filter functions
function makeWhereUniqueFilter(fields: Field[], seeded: any) {
  return Object.fromEntries(
    fields.map(f => {
      return [f.name, seeded[f.name]]
    })
  )
}

function makeWhereFilter(
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

function makeWhereAndFilter(
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

// Field and list creation functions
function makeFieldEntry({
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
      isRequired: unique, // helps with debugging
    },
    defaultValue: unique ? null : `Value_${name}`,
  } as const
}

function makeList({
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

  const listOperation = {
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
    const listItem = {
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

    return [listOperation, listItem]
  }

  if ([access.query, access.update, access.delete].includes(false)) {
    const nameFB = `List_filterb_${suffix}`
    const listFilterB = {
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
    const listFilter = {
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

    return [listOperation, listFilterB, listFilter]
  }

  return [listOperation]
}

// Filter helpers
function allowFilter() {
  return {
    id: {
      not: null,
    },
  }
}

function denyFilter() {
  return {
    id: {
      equals: 'never',
    },
  }
}

// Random data generation
function randomCount() {
  return 6
}

function randomString() {
  return `foo-${randomUUID()}`
}

// Seeding functions
async function seed(l: List, context: any) {
  const data = Object.fromEntries(l.fields.map(f => [f.name, randomString()]))

  return (await context.sudo().db[l.name].createOne({ data })) as Record<string, any>
}

async function seedMany(l: List, context: any) {
  const data = [...Array(randomCount())].map(_ =>
    Object.fromEntries(l.fields.map(f => [f.name, randomString()]))
  )

  return (await context.sudo().db[l.name].createMany({ data })) as Record<string, any>[]
}

// Item creation
function makeItem(
  l: {
    fields: Field[]
  },
  operation: 'create' | 'update'
) {
  return Object.fromEntries(
    l.fields.filter(f => f.expect[operation]).map(f => [f.name, randomString()])
  )
}

// Type definitions
export type Field = ReturnType<typeof makeFieldEntry>
export type List = ReturnType<typeof makeList> extends (infer T)[] ? T : never

// List generation
const lists: List[] = []
for (const query of [false, true]) {
  for (const create of [false, true]) {
    for (const update of [false, true]) {
      for (const delete_ of [false, true]) {
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

        lists.push(...makeList({
          access: {
            query,
            create,
            update,
            delete: delete_,
          },
          fields,
        }))

        lists.push(...makeList({
          prefix: `UNIQUE_`,
          access: {
            query,
            create,
            update,
            delete: delete_,
          },
          fields: fieldsUnique,
        }))
      }
    }
  }
}

// Config
export const config = {
  lists: {
    ...Object.fromEntries(
      lists.map(l => [
        l.name,
        list({
          ...l,
          fields: {
            ...Object.fromEntries(
              l.fields.map(f => [f.name, text(f)])
            ),
          },
        }),
      ])
    ),
  },
}
```