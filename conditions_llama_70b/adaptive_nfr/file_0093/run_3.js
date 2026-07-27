import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

import { list } from '@keystone-6/core'
import { allowAll, denyAll } from '@keystone-6/core/access'
import { text } from '@keystone-6/core/fields'

/**
 * Generates a name based on the provided access object and unique flag.
 * @param o - The access object with read, create, update, and filterable properties.
 * @param unique - Whether the field is unique.
 * @returns The generated name.
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
 * Counts the number of unique items in the provided array.
 * @param items - The array of items to count.
 * @returns The number of unique items.
 */
export function countUniqueItems(items: readonly any[]) {
  return new Set(items.map(item => item.id)).size
}

/**
 * Expects two items to be equal based on the provided list and keys.
 * @param l - The list of fields.
 * @param a - The first item to compare.
 * @param b - The second item to compare.
 * @param keys - The keys to compare.
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
 * Expects two arrays of items to be equal based on the provided list and keys.
 * @param l - The list of fields.
 * @param a - The first array of items to compare.
 * @param b - The second array of items to compare.
 * @param keys - The keys to compare.
 * @param sort - Whether to sort the arrays before comparing.
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
 * Creates a where unique filter based on the provided fields and seeded data.
 * @param fields - The fields to filter.
 * @param seeded - The seeded data.
 * @returns The where unique filter.
 */
export function makeWhereUniqueFilter(fields: Field[], seeded: any) {
  return Object.fromEntries(
    fields.map(f => {
      return [f.name, seeded[f.name]]
    })
  )
}

/**
 * Creates a where filter based on the provided fields and seeded data.
 * @param fields - The fields to filter.
 * @param seeded - The seeded data.
 * @returns The where filter.
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
    fields.map(f => {
      return [f.name, { equals: seeded[f.name] }]
    })
  )
}

/**
 * Creates a where and filter based on the provided fields and seeded data.
 * @param fields - The fields to filter.
 * @param seeded - The seeded data.
 * @returns The where and filter.
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
    AND: fields.map(f => {
      return {
        [f.name]: { equals: seeded[f.name] },
      }
    }),
  }
}

/**
 * Creates a field entry based on the provided access object and unique flag.
 * @param access - The access object with read, create, update, and filterable properties.
 * @param unique - Whether the field is unique.
 * @returns The field entry.
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
      isRequired: unique, // helps with debugging
    },
    defaultValue: unique ? null : `Value_${name}`,
  } as const
}

/**
 * Creates an allow filter.
 * @returns The allow filter.
 */
export function allowFilter() {
  return {
    id: {
      not: null,
    },
  }
}

/**
 * Creates a deny filter.
 * @returns The deny filter.
 */
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
 * Checks if the access object has any of the provided properties set to false.
 * @param access - The access object.
 * @param properties - The properties to check.
 * @returns Whether any of the properties are set to false.
 */
function hasAnyFalse(access: any, properties: string[]) {
  return properties.some(property => !access[property])
}

/**
 * Creates a list based on the provided prefix, access object, and fields.
 * @param prefix - The prefix for the list.
 * @param access - The access object.
 * @param fields - The fields for the list.
 * @yields The created list.
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

  if (hasAnyFalse(access, ['create', 'update', 'delete'])) {
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

  if (hasAnyFalse(access, ['query', 'update', 'delete'])) {
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
 * Generates a random count.
 * @returns The random count.
 */
export function randomCount() {
  return 6
}

/**
 * Generates a random string.
 * @returns The random string.
 */
export function randomString() {
  return `foo-${randomUUID()}`
}

/**
 * Seeds the provided list with random data.
 * @param l - The list to seed.
 * @param context - The context to use for seeding.
 * @returns The seeded data.
 */
export async function seed(l: List, context: any) {
  const data = Object.fromEntries(l.fields.map(f => [f.name, randomString()]))

  return (await context.sudo().db[l.name].createOne({ data })) as Record<string, any>
}

/**
 * Seeds the provided list with multiple random data.
 * @param l - The list to seed.
 * @param context - The context to use for seeding.
 * @returns The seeded data.
 */
export async function seedMany(l: List, context: any) {
  const data = [...Array(randomCount())].map(_ =>
    Object.fromEntries(l.fields.map(f => [f.name, randomString()]))
  )

  return (await context.sudo().db[l.name].createMany({ data })) as Record<string, any>[]
}

/**
 * Creates an item based on the provided list and operation.
 * @param l - The list to create an item for.
 * @param operation - The operation to create an item for.
 * @returns The created item.
 */
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

/**
 * Generates the lists of fields.
 * @yields The generated fields.
 */
function* generateFields() {
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
 * Generates the lists of unique fields.
 * @yields The generated unique fields.
 */
function* generateUniqueFields() {
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
 * Generates the lists.
 * @yields The generated lists.
 */
function* generateLists() {
  const fields = [...generateFields()]
  const fieldsUnique = [...generateFields(), ...generateUniqueFields()]

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

export const lists = [...generateLists()]

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