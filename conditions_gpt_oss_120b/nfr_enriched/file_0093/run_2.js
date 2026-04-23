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
  return Object.fromEntries(fields.map(f => [f.name, seeded[f.name]]))
}

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

/** Build a field entry descriptor */
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
    expect: { ...access, unique },
    access: {
      read: access.read ? allowAll : denyAll,
      create: access.create ? allowAll : denyAll,
      update: access.update ? allowAll : denyAll,
    },
    isFilterable: access.filterable ? allowAll : denyAll,
    isIndexed: unique ? 'unique' : false,
    validation: { isRequired: unique },
    defaultValue: unique ? null : `Value_${name}`,
  } as const
}

export function allowFilter() {
  return { id: { not: null } }
}

export function denyFilter() {
  return { id: { equals: 'never' } }
}

export type Field = ReturnType<typeof makeFieldEntry>
export type List = ReturnType<typeof makeList> extends Generator<infer T, any, any>
  ? T
  : never

/** Determine if an item‑level list should be generated */
function shouldYieldItem(access: {
  create: boolean
  update: boolean
  delete: boolean
}) {
  return [access.create, access.update, access.delete].includes(false)
}

/** Determine if a filter‑b list should be generated */
function shouldYieldFilterB(access: {
  query: boolean
  update: boolean
  delete: boolean
}) {
  return [access.query, access.update, access.delete].includes(false)
}

/** Determine if a filter list should be generated */
function shouldYieldFilter(access: {
  query: boolean
  update: boolean
  delete: boolean
}) {
  return [access.query, access.update, access.delete].includes(false)
}

/** Build the operation‑level list descriptor */
function buildOperationList({
  suffix,
  access,
  fields,
}: {
  suffix: string
  access: {
    query: boolean
    create: boolean
    update: boolean
    delete: boolean
  }
  fields: Field[]
}) {
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
      filter: { query: allowAll, update: allowAll, delete: allowAll },
      item: { create: allowAll, update: allowAll, delete: allowAll },
    },
    fields,
    graphql: { plural: name + 's' },
  } as const
}

/** Build the item‑level list descriptor */
function buildItemList({
  suffix,
  access,
  fields,
}: {
  suffix: string
  access: {
    query: boolean
    create: boolean
    update: boolean
    delete: boolean
  }
  fields: Field[]
}) {
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
      filter: { query: allowAll, update: allowAll, delete: allowAll },
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

/** Build the filter‑b list descriptor */
function buildFilterBList({
  suffix,
  access,
  fields,
}: {
  suffix: string
  access: {
    query: boolean
    create: boolean
    update: boolean
    delete: boolean
  }
  fields: Field[]
}) {
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
      item: { create: allowAll, update: allowAll, delete: allowAll },
    },
    fields,
    graphql: { plural: name + 's' },
  } as const
}

/** Build the filter list descriptor */
function buildFilterList({
  suffix,
  access,
  fields,
}: {
  suffix: string
  access: {
    query: boolean
    create: boolean
    update: boolean
    delete: boolean
  }
  fields: Field[]
}) {
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
      item: { create: allowAll, update: allowAll, delete: allowAll },
    },
    fields,
    graphql: { plural: name + 's' },
  } as const
}

/** Generate all list descriptors for a given access configuration */
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

  // operation list – always present
  yield buildOperationList({ suffix, access, fields })

  // optional item list
  if (shouldYieldItem(access)) {
    yield buildItemList({ suffix, access, fields })
  }

  // optional filter‑b and filter lists
  if (shouldYieldFilterB(access)) {
    yield buildFilterBList({ suffix, access, fields })
    yield buildFilterList({ suffix, access, fields })
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
  const data = [...Array(randomCount())].map(() =>
    Object.fromEntries(l.fields.map(f => [f.name, randomString()]))
  )
  return (await context.sudo().db[l.name].createMany({ data })) as Record<string, any>[]
}

export function makeItem(
  l: { fields: Field[] },
  operation: 'create' | 'update'
) {
  return Object.fromEntries(
    l.fields.filter(f => f.expect[operation]).map(f => [f.name, randomString()])
  )
}

/** Generate all field descriptors (non‑unique) */
function generateFields(): Field[] {
  const combos: Field[] = []
  for (const read of [false, true]) {
    for (const create of [false, true]) {
      for (const update of [false, true]) {
        for (const filterable of [false, true]) {
          combos.push(
            makeFieldEntry({
              access: { read, create, update, filterable },
              unique: false,
            })
          )
        }
      }
    }
  }
  return combos
}

/** Generate all field descriptors (including unique) */
function generateFieldsWithUnique(base: Field[]): Field[] {
  const withUnique: Field[] = [...base]
  for (const read of [false, true]) {
    for (const create of [true]) {
      for (const update of [false, true]) {
        for (const filterable of [false, true]) {
          withUnique.push(
            makeFieldEntry({
              access: { read, create, update, filterable },
              unique: true,
            })
          )
        }
      }
    }
  }
  return withUnique
}

/** Generate all list descriptors */
function generateAllLists(): List[] {
  const lists: List[] = []
  const fields = generateFields()
  const fieldsUnique = generateFieldsWithUnique(fields)

  for (const query of [false, true]) {
    for (const create of [false, true]) {
      for (const update of [false, true]) {
        for (const del of [false, true]) {
          lists.push(
            ...Array.from(
              makeList({
                access: { query, create, update, delete: del },
                fields,
              })
            )
          )
          lists.push(
            ...Array.from(
              makeList({
                prefix: 'UNIQUE_',
                access: { query, create, update, delete: del },
                fields: fieldsUnique,
              })
            )
          )
        }
      }
    }
  }
  return lists
}

export const lists = generateAllLists()

/** Build Keystone config object from generated lists */
export const config = {
  lists: Object.fromEntries(
    lists.map(l => [
      l.name,
      list({
        ...l,
        fields: Object.fromEntries(
          l.fields.map(({ name, expect, ...rest }) => [name, text(rest)])
        ),
      }),
    ])
  ),
}