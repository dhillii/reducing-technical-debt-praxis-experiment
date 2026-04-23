import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

import { list } from '@keystone-6/core'
import { allowAll, denyAll } from '@keystone-6/core/access'
import { text } from '@keystone-6/core/fields'

/**
 * Generates a short string identifier based on boolean flags.
 * Maps 'unique' to 'x' and other keys to their first character.
 * Returns 'DENY' if no flags are set.
 */
export function makeName(o: Record<string, boolean>): string {
  const entries = Object.entries(o).filter(([_, v]) => v)
  if (entries.length === 0) return 'DENY'

  const chars = entries.map(([k]) => (k === 'unique' ? 'x' : k.charAt(0)))
  return chars.join('').toUpperCase()
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

  for (let i = 0; i < sorteda.length; i++) {
    expectEqualItem(l, sorteda[i], sortedb[i], keys)
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
 * Creates a field configuration object based on access permissions and uniqueness.
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
 * Returns a filter that allows any item with a non-null ID.
 */
export function allowFilter(): any {
  return {
    id: {
      not: null,
    },
  }
}

/**
 * Returns a filter that denies all items by matching an impossible ID.
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
 * Yields multiple list configurations depending on the combination of permissions.
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

  // Yield item-level list if create, update, or delete is restricted
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

  // Yield filter-specific lists if query, update, or delete is restricted
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
 * Seeds a single item into a list using the provided context.
 * Uses sudo to bypass access restrictions if necessary.
 */
export async function seed(l: List, context: any): Promise<Record<string, any>> {
  const data = Object.fromEntries(l.fields.map(f => [f.name, randomString()]))
  return (await context.sudo().db[l.name].createOne({ data })) as Record<string, any>
}

/**
 * Seeds multiple items into a list using the provided context.
 * Uses sudo to bypass access restrictions if necessary.
 */
export async function seedMany(l: List, context: any): Promise<Record<string, any>[]> {
  const data = [...Array(randomCount())].map(_ =>
    Object.fromEntries(l.fields.map(f => [f.name, randomString()]))
  )
  return (await context.sudo().db[l.name].createMany({ data })) as Record<string, any>[]
}

/**
 * Creates an object with random string values for fields that allow the specified operation.
 */
export function makeItem(
  l: {
    fields: Field[]
  },
  operation: 'create' | 'update'
): Record<string, string> {
  return Object.fromEntries(
    l.fields.filter(f => f.expect[operation]).map(f => [f.name, randomString()])
  )
}

/**
 * Generator that yields all field configurations for testing.
 * Iterates through combinations of read, create, update, and filterable permissions.
 */
export function* generateFields(): Generator<Field> {
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
}

/**
 * Generator that yields all unique field configurations for testing.
 * Similar to generateFields but with unique set to true.
 */
export function* generateUniqueFields(): Generator<Field> {
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
}

/**
 * Generator that yields all list configurations for testing.
 * Combines field configurations with various access permission combinations.
 */
export function* generateLists(): Generator<any> {
  const fields = [...generateFields()]
  const fieldsUnique = [...fields, ...generateUniqueFields()]

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
}

/**
 * Array of all generated list configurations.
 */
export const lists = [...generateLists()]

/**
 * Configuration object for Keystone lists.
 * Dynamically creates list definitions based on the generated configurations.
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