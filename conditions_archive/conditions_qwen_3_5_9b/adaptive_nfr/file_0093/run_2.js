import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

import { list } from '@keystone-6/core'
import { allowAll, denyAll } from '@keystone-6/core/access'
import { text } from '@keystone-6/core/fields'

/**
 * Generate a name from boolean flags
 */
export function makeName(o: Record<string, boolean>): string {
  const entries = Object.entries(o).filter(([_, v]) => v)
  const chars = entries.map(([k]) => (k === 'unique' ? 'x' : k.charAt(0)))
  const result = chars.join('').toUpperCase()
  return result ?? 'DENY'
}

/**
 * Count unique items by ID
 */
export function countUniqueItems(items: readonly any[]): number {
  return new Set(items.map(item => item.id)).size
}

/**
 * Expect two items to be equal based on list fields
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
 * Expect two arrays of items to be equal based on list fields
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
 * Create a unique filter from fields and seeded data
 */
export function makeWhereUniqueFilter(fields: Field[], seeded: any): Record<string, any> {
  return Object.fromEntries(fields.map(f => [f.name, seeded[f.name]]))
}

/**
 * Create a filter object from fields and seeded data
 */
export function makeWhereFilter(
  fields: Field[],
  seeded: Record<string, any> | Record<string, any>[]
): any {
  if (Array.isArray(seeded)) {
    return { OR: seeded.map(s => makeWhereFilter(fields, s)) }
  }

  return Object.fromEntries(fields.map(f => [f.name, { equals: seeded[f.name] }]))
}

/**
 * Create an AND filter object from fields and seeded data
 */
export function makeWhereAndFilter(
  fields: Field[],
  seeded: Record<string, any> | Record<string, any>[]
): any {
  if (Array.isArray(seeded)) {
    return { OR: seeded.map(s => makeWhereAndFilter(fields, s)) }
  }

  return {
    AND: fields.map(f => ({ [f.name]: { equals: seeded[f.name] } })),
  }
}

/**
 * Create a field entry with access controls and validation
 */
export function makeFieldEntry({ access, unique }: {
  access: {
    read: boolean
    create: boolean
    update: boolean
    filterable: boolean
  }
  unique: boolean
}): Field {
  const name = `Field_${makeName({ ...access, unique })}` as const
  const accessRead = access.read ? allowAll : denyAll
  const accessCreate = access.create ? allowAll : denyAll
  const accessUpdate = access.update ? allowAll : denyAll
  const accessFilterable = access.filterable ? allowAll : denyAll

  return {
    name,
    expect: {
      ...access,
      unique,
    },
    access: {
      read: accessRead,
      create: accessCreate,
      update: accessUpdate,
    },
    isFilterable: accessFilterable,
    isIndexed: unique ? 'unique' : false,
    validation: {
      isRequired: unique,
    },
    defaultValue: unique ? null : `Value_${name}`,
  } as const
}

/**
 * Allow all items through the filter
 */
export function allowFilter(): Record<string, any> {
  return {
    id: {
      not: null,
    },
  }
}

/**
 * Deny all items through the filter
 */
export function denyFilter(): Record<string, any> {
  return {
    id: {
      equals: 'never',
    },
  }
}

export type Field = ReturnType<typeof makeFieldEntry>
export type List = ReturnType<typeof makeList> extends Generator<infer T, any, any> ? T : never

/**
 * Generate list operations based on access configuration
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

  const hasCreate = access.create
  const hasUpdate = access.update
  const hasDelete = access.delete
  const hasQuery = access.query

  // Generate item operation if not all operations are disabled
  if (!hasCreate || !hasUpdate || !hasDelete) {
    const nameI = `List_item_${suffix}`
    yield {
      name: nameI,
      expect: { type: 'item' as const, ...access },
      access: {
        operation: {
          query: hasQuery ? allowAll : denyAll,
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
          create: hasCreate ? allowAll : denyAll,
          update: hasUpdate ? allowAll : denyAll,
          delete: hasDelete ? allowAll : denyAll,
        },
      },
      fields,
      graphql: {
        plural: nameI + 's',
      },
    } as const
  }

  // Generate filter operations if not all operations are disabled
  if (!hasQuery || !hasUpdate || !hasDelete) {
    const nameFB = `List_filterb_${suffix}`
    yield {
      name: nameFB,
      expect: { type: 'filter(b)' as const, ...access },
      access: {
        operation: {
          query: allowAll,
          create: hasCreate ? allowAll : denyAll,
          update: allowAll,
          delete: allowAll,
        },
        filter: {
          query: hasQuery ? allowAll : denyAll,
          update: hasUpdate ? allowAll : denyAll,
          delete: hasDelete ? allowAll : denyAll,
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
          create: hasCreate ? allowAll : denyAll,
          update: allowAll,
          delete: allowAll,
        },
        filter: {
          query: hasQuery ? allowFilter : denyFilter,
          update: hasUpdate ? allowFilter : denyFilter,
          delete: hasDelete ? allowFilter : denyFilter,
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
 * Generate a random count for seeding
 */
export function randomCount(): number {
  return 6
}

/**
 * Generate a random string with UUID
 */
export function randomString(): string {
  return `foo-${randomUUID()}`
}

/**
 * Seed a single list item with random data
 */
export async function seed(l: List, context: any): Promise<Record<string, any>> {
  const data = Object.fromEntries(l.fields.map(f => [f.name, randomString()]))
  return (await context.sudo().db[l.name].createOne({ data })) as Record<string, any>
}

/**
 * Seed multiple list items with random data
 */
export async function seedMany(l: List, context: any): Promise<Record<string, any>[]> {
  const data = [...Array(randomCount())].map(_ =>
    Object.fromEntries(l.fields.map(f => [f.name, randomString()]))
  )
  return (await context.sudo().db[l.name].createMany({ data })) as Record<string, any>[]
}

/**
 * Create item data for create or update operations
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
 * Generate all field configurations for testing
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
 * Generate all unique field configurations for testing
 */
export function* generateFieldsUnique(): Generator<Field> {
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
 * Generate all list configurations for testing
 */
export function* generateLists(): Generator<List> {
  const fields = [...generateFields()]
  const fieldsUnique = [...fields, ...generateFieldsUnique()]

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

/**
 * Generate list configurations for the keystone config
 */
export function* generateConfigLists(): Generator<[string, any]> {
  for (const l of lists) {
    yield [
      l.name,
      list({
        ...l,
        fields: {
          ...Object.fromEntries(
            [...l.fields].map(({ name, expect, ...f }) => [name, text(f)])
          ),
        },
      }),
    ]
  }
}

export const config = {
  lists: {
    ...Object.fromEntries(generateConfigLists()),
  },
}