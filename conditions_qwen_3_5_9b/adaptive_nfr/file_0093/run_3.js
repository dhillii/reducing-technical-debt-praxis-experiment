import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

import { list } from '@keystone-6/core'
import { allowAll, denyAll } from '@keystone-6/core/access'
import { text } from '@keystone-6/core/fields'

/**
 * Generate a name from access configuration object
 */
function makeName(o: Record<string, boolean>): string {
  const entries = Object.entries(o).filter(([_, v]) => v)
  const initials = entries.map(([k]) => (k === 'unique' ? 'x' : k.charAt(0)))
  return initials.join('').toUpperCase() ?? 'DENY'
}

/**
 * Count unique items by ID
 */
function countUniqueItems(items: readonly any[]): number {
  return new Set(items.map(item => item.id)).size
}

/**
 * Validate a single item matches expected values
 */
function expectEqualItem(l: List, a: any, b: any, keys: string[] = []): void {
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
 * Validate multiple items match expected values
 */
function expectEqualItems(
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
 * Create unique filter from fields
 */
function makeWhereUniqueFilter(fields: Field[], seeded: any): Record<string, any> {
  return Object.fromEntries(
    fields.map(f => [f.name, seeded[f.name]])
  )
}

/**
 * Create filter from fields and seeded data
 */
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

/**
 * Create AND filter from fields and seeded data
 */
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

/**
 * Create field entry from access configuration
 */
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
 * Allow filter for ID
 */
function allowFilter(): Record<string, any> {
  return {
    id: {
      not: null,
    },
  }
}

/**
 * Deny filter for ID
 */
function denyFilter(): Record<string, any> {
  return {
    id: {
      equals: 'never',
    },
  }
}

/**
 * Check if any access permission is disabled
 */
function hasAccessDisabled(access: {
  query: boolean
  create: boolean
  update: boolean
  delete: boolean
}): boolean {
  return [access.query, access.create, access.update, access.delete].includes(false)
}

/**
 * Check if any write access is disabled
 */
function hasWriteAccessDisabled(access: {
  create: boolean
  update: boolean
  delete: boolean
}): boolean {
  return [access.create, access.update, access.delete].includes(false)
}

/**
 * Check if any query access is disabled
 */
function hasQueryAccessDisabled(access: {
  query: boolean
  update: boolean
  delete: boolean
}): boolean {
  return [access.query, access.update, access.delete].includes(false)
}

/**
 * Generate list operation name
 */
function makeListOperationName(prefix: string, access: {
  query: boolean
  create: boolean
  update: boolean
  delete: boolean
}): string {
  const suffix = `${prefix}${makeName(access)}`
  return `List_operation_${suffix}`
}

/**
 * Generate list item name
 */
function makeListItemName(suffix: string): string {
  return `List_item_${suffix}`
}

/**
 * Generate list filterb name
 */
function makeListFilterbName(suffix: string): string {
  return `List_filterb_${suffix}`
}

/**
 * Generate list filter name
 */
function makeListFilterName(suffix: string): string {
  return `List_filter_${suffix}`
}

/**
 * Create list generator
 */
function* makeList({
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
  const nameO = makeListOperationName(prefix, access)

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

  if (hasWriteAccessDisabled(access)) {
    const nameI = makeListItemName(suffix)
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

  if (hasQueryAccessDisabled(access)) {
    const nameFB = makeListFilterbName(suffix)
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

    const nameF = makeListFilterName(suffix)
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
 * Generate random count
 */
function randomCount(): number {
  return 6
}

/**
 * Generate random string
 */
function randomString(): string {
  return `foo-${randomUUID()}`
}

/**
 * Seed single item
 */
async function seed(l: List, context: any): Promise<Record<string, any>> {
  const data = Object.fromEntries(l.fields.map(f => [f.name, randomString()]))
  return (await context.sudo().db[l.name].createOne({ data })) as Record<string, any>
}

/**
 * Seed multiple items
 */
async function seedMany(l: List, context: any): Promise<Record<string, any>[]> {
  const data = [...Array(randomCount())].map(_ =>
    Object.fromEntries(l.fields.map(f => [f.name, randomString()]))
  )
  return (await context.sudo().db[l.name].createMany({ data })) as Record<string, any>[]
}

/**
 * Create item for operation
 */
function makeItem(
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
 * Generate standard fields
 */
function* generateStandardFields(): Generator<Field> {
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
 * Generate unique fields
 */
function* generateUniqueFields(): Generator<Field> {
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
 * Generate all lists
 */
function* lists(): Generator<any> {
  const fields = [...generateStandardFields()]
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
 * Generate config
 */
function* generateConfig(): Generator<[string, any]> {
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
}

export const lists = lists()

export const config = {
  lists: {
    ...Object.fromEntries(generateConfig()),
  },
}

export type Field = ReturnType<typeof makeFieldEntry>
export type List = ReturnType<typeof makeList> extends Generator<infer T, any, any> ? T : never