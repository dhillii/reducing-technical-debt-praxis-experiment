import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

import { list } from '@keystone-6/core'
import { allowAll, denyAll } from '@keystone-6/core/access'
import { text } from '@keystone-6/core/fields'

/**
 * Generates a short name string from a record of boolean flags.
 * Maps 'unique' to 'x' and other keys to their first character.
 * Returns 'DENY' if no flags are set.
 */
export function makeName(o: Record<string, boolean>): string {
  const entries = Object.entries(o)
  const filtered = entries.filter(([_, v]) => v)
  const mapped = filtered.map(([k]) => (k === 'unique' ? 'x' : k.charAt(0)))
  const joined = mapped.join('').toUpperCase()
  return joined ?? 'DENY'
}

/**
 * Counts the number of unique items in an array based on their 'id' property.
 */
export function countUniqueItems(items: readonly any[]): number {
  return new Set(items.map(item => item.id)).size
}

/**
 * Asserts that two items are equal based on a list's fields.
 * Compares IDs and field values, respecting field expectations.
 */
export function expectEqualItem(l: List, a: any, b: any, keys: string[] = []): void {
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
 * Asserts that two arrays of items are equal.
 * Sorts items by ID before comparison unless sorting is disabled.
 */
export function expectEqualItems(
  l: List,
  a: readonly any[],
  b: any[],
  keys: string[] = [],
  sort = true
): void {
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
 * Constructs a filter object where each field equals the corresponding seeded value.
 * Handles both single objects and arrays of objects.
 */
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
    fields.map(f => [f.name, { equals: seeded[f.name] }])
  )
}

/**
 * Constructs a filter object where all fields must equal their seeded values (AND logic).
 * Handles both single objects and arrays of objects.
 */
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
    AND: fields.map(f => ({
      [f.name]: { equals: seeded[f.name] },
    })),
  }
}

/**
 * Creates a field entry configuration object based on access permissions and uniqueness.
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
}): Field {
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
 * Returns a filter allowing any ID except null.
 */
export function allowFilter(): any {
  return {
    id: {
      not: null,
    },
  }
}

/**
 * Returns a filter denying all items by setting ID to 'never'.
 */
export function denyFilter(): any {
  return {
    id: {
      equals: 'never',
    },
  }
}

/**
 * Generates a list configuration based on access permissions and fields.
 * Yields multiple list configurations (operation, item, filter, filterb) depending on access flags.
 */
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
}): Generator<any> {
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

  // Yield item list if create, update, or delete is false
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

  // Yield filter lists if query, update, or delete is false
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

/**
 * Returns a fixed count of 6 for random data generation.
 */
export function randomCount(): number {
  return 6
}

/**
 * Generates a random string prefixed with 'foo-'.
 */
export function randomString(): string {
  return `foo-${randomUUID()}`
}

/**
 * Seeds a single list item with random string values for all fields.
 * Requires sudo access to bypass potential read/query restrictions.
 */
export async function seed(l: List, context: any): Promise<Record<string, any>> {
  const data = Object.fromEntries(l.fields.map(f => [f.name, randomString()]))
  return (await context.sudo().db[l.name].createOne({ data })) as Record<string, any>
}

/**
 * Seeds multiple list items with random string values for all fields.
 * Requires sudo access to bypass potential read/query restrictions.
 */
export async function seedMany(l: List, context: any): Promise<Record<string, any>[]> {
  const data = [...Array(randomCount())].map(_ =>
    Object.fromEntries(l.fields.map(f => [f.name, randomString()]))
  )
  return (await context.sudo().db[l.name].createMany({ data })) as Record<string, any>[]
}

/**
 * Creates an item object with random string values for fields allowed in the specified operation.
 */
export function makeItem(
  l: {
    fields: Field[]
  },
  operation: 'create' | 'update'
): Record<string, any> {
  return Object.fromEntries(
    l.fields.filter(f => f.expect[operation]).map(f => [f.name, randomString()])
  )
}

/**
 * Generates a comprehensive list of test lists covering various field and list access configurations.
 */
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

/**
 * Configuration object mapping list names to their generated Keystone list definitions.
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