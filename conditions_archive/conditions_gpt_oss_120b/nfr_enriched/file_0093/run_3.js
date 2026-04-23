import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

import { list } from '@keystone-6/core'
import { allowAll, denyAll } from '@keystone-6/core/access'
import { text } from '@keystone-6/core/fields'

/**
 * Build a short name based on boolean flags.
 */
export function makeName(o: Record<string, boolean>) {
  return (
    Object.entries(o)
      .filter(([_, v]) => v)
      .map(([k]) => (k === 'unique' ? 'x' : k.charAt(0)))
      .join('')
      .toUpperCase() ?? 'DENY'
  )
}

/**
 * Count distinct `id` values in an array.
 */
export function countUniqueItems(items: readonly any[]) {
  return new Set(items.map(item => item.id)).size
}

/**
 * Assert that two items are equal according to the list definition.
 */
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

/**
 * Assert that two collections of items are equal (order‑independent by default).
 */
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

/**
 * Create a simple unique‑filter object from seeded values.
 */
export function makeWhereUniqueFilter(fields: Field[], seeded: any) {
  return Object.fromEntries(fields.map(f => [f.name, seeded[f.name]]))
}

/**
 * Build a `where` filter (supports array of seeds for OR logic).
 */
export function makeWhereFilter(
  fields: Field[],
  seeded: Record<string, any> | Record<string, any>[]
) {
  if (Array.isArray(seeded)) {
    return { OR: seeded.map(s => makeWhereFilter(fields, s)) }
  }
  return Object.fromEntries(
    fields.map(f => [f.name, { equals: seeded[f.name] }])
  )
}

/**
 * Build a `where` filter with AND semantics (supports array of seeds for OR logic).
 */
export function makeWhereAndFilter(
  fields: Field[],
  seeded: Record<string, any> | Record<string, any>[]
) {
  if (Array.isArray(seeded)) {
    return { OR: seeded.map(s => makeWhereAndFilter(fields, s)) }
  }
  return {
    AND: fields.map(f => ({
      [f.name]: { equals: seeded[f.name] },
    })),
  }
}

/**
 * Create a field definition entry.
 */
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

/**
 * Filter that always allows access.
 */
export function allowFilter() {
  return { id: { not: null } }
}

/**
 * Filter that always denies access.
 */
export function denyFilter() {
  return { id: { equals: 'never' } }
}

/**
 * Helper to generate the operation‑level list entry.
 */
function generateOperationEntry(
  suffix: string,
  access: {
    query: boolean
    create: boolean
    update: boolean
    delete: boolean
  },
  fields: Field[]
) {
  const name = `List_operation_${suffix}`
  return {
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
    graphql: { plural: name + 's' },
  } as const
}

/**
 * Helper to generate the item‑level list entry when any mutation is denied.
 */
function generateItemEntry(
  suffix: string,
  access: {
    query: boolean
    create: boolean
    update: boolean
    delete: boolean
  },
  fields: Field[]
) {
  const name = `List_item_${suffix}`
  return {
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
    graphql: { plural: name + 's' },
  } as const
}

/**
 * Helper to generate the filter‑b list entry when any read‑related permission is denied.
 */
function generateFilterBEntry(
  suffix: string,
  access: {
    query: boolean
    create: boolean
    update: boolean
    delete: boolean
  },
  fields: Field[]
) {
  const name = `List_filterb_${suffix}`
  return {
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
    graphql: { plural: name + 's' },
  } as const
}

/**
 * Helper to generate the standard filter list entry.
 */
function generateFilterEntry(
  suffix: string,
  access: {
    query: boolean
    create: boolean
    update: boolean
    delete: boolean
  },
  fields: Field[]
) {
  const name = `List_filter_${suffix}`
  return {
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
    graphql: { plural: name + 's' },
  } as const
}

/**
 * Generate all list variants for a given access configuration and field set.
 */
export function* makeList({
  prefix = '',
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

  // operation list
  yield generateOperationEntry(suffix, access, fields)

  // item list (when any mutation is denied)
  if ([access.create, access.update, access.delete].includes(false)) {
    yield generateItemEntry(suffix, access, fields)
  }

  // filter(b) and filter lists (when any read‑related permission is denied)
  if ([access.query, access.update, access.delete].includes(false)) {
    yield generateFilterBEntry(suffix, access, fields)
    yield generateFilterEntry(suffix, access, fields)
  }
}

/**
 * Return a deterministic count for seeding.
 */
export function randomCount() {
  // return 1 + randomInt()
  return 6
}

/**
 * Generate a random string for field values.
 */
export function randomString() {
  return `foo-${randomUUID()}`
}

/**
 * Seed a single item using sudo privileges.
 */
export async function seed(l: List, context: any) {
  const data = Object.fromEntries(l.fields.map(f => [f.name, randomString()]))
  return (await context.sudo().db[l.name].createOne({ data })) as Record<string, any>
}

/**
 * Seed multiple items using sudo privileges.
 */
export async function seedMany(l: List, context: any) {
  const data = [...Array(randomCount())].map(() =>
    Object.fromEntries(l.fields.map(f => [f.name, randomString()]))
  )
  return (await context.sudo().db[l.name].createMany({ data })) as Record<string, any>[]
}

/**
 * Build an item payload for create or update operations.
 */
export function makeItem(
  l: { fields: Field[] },
  operation: 'create' | 'update'
) {
  return Object.fromEntries(
    l.fields.filter(f => f.expect[operation]).map(f => [f.name, randomString()])
  )
}

/**
 * Generate all possible field entries (including unique variants).
 */
function* generateAllFields(): Generator<Field> {
  for (const read of [false, true]) {
    for (const create of [false, true]) {
      for (const update of [false, true]) {
        for (const filterable of [false, true]) {
          yield makeFieldEntry({
            access: { read, create, update, filterable },
            unique: false,
          })
        }
      }
    }
  }
}

/**
 * Generate all possible unique field entries (read/write combos with unique constraint).
 */
function* generateUniqueFields(baseFields: Field[]): Generator<Field> {
  for (const read of [false, true]) {
    for (const create of [true]) {
      // only TRUE, otherwise we need create hooks when uniquely constrained
      for (const update of [false, true]) {
        for (const filterable of [false, true]) {
          yield makeFieldEntry({
            access: { read, create, update, filterable },
            unique: true,
          })
        }
      }
    }
  }
}

/**
 * Generate every list configuration used in tests.
 */
export const lists = [
  ...(function* () {
    const baseFields = [...generateAllFields()]
    const allFields = [
      ...baseFields,
      ...generateUniqueFields(baseFields),
    ]

    for (const query of [false, true]) {
      for (const create of [false, true]) {
        for (const update of [false, true]) {
          for (const delete_ of [false, true]) {
            yield* makeList({
              access: { query, create, update, delete: delete_ },
              fields: baseFields,
            })
            yield* makeList({
              prefix: 'UNIQUE_',
              access: { query, create, update, delete: delete_ },
              fields: allFields,
            })
          }
        }
      }
    }
  })(),
]

/**
 * Build the Keystone configuration object from generated lists.
 */
export const config = {
  lists: {
    ...Object.fromEntries(
      (function* () {
        for (const l of lists) {
          yield [
            l.name,
            list({
              ...l,
              fields: Object.fromEntries(
                (function* () {
                  for (const { name, expect, ...f } of l.fields) {
                    yield [name, text(f)]
                  }
                })()
              ),
            }),
          ]
        }
      })()
    ),
  },
}

/**
 * Types exported for external use.
 */
export type Field = ReturnType<typeof makeFieldEntry>
export type List = ReturnType<typeof makeList> extends Generator<infer T, any, any>
  ? T
  : never