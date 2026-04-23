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
    fields.map(f => [f.name, seeded[f.name]])
  )
}

export function makeWhereFilter(
  fields: Field[],
  seeded: Record<string, any> | Record<string, any>[]
): any {
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
): any {
  if (Array.isArray(seeded)) {
    return { OR: seeded.map(s => makeWhereAndFilter(fields, s)) }
  }
  return {
    AND: fields.map(f => ({
      [f.name]: { equals: seeded[f.name] },
    })),
  }
}

/** Create a field entry with consistent naming and access configuration */
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
  return { id: { not: null } }
}

export function denyFilter() {
  return { id: { equals: 'never' } }
}

export type Field = ReturnType<typeof makeFieldEntry>
export type List = ReturnType<typeof makeList> extends Generator<infer T, any, any> ? T : never

/** Helper to decide if an item‑level list is needed */
function needsItemList(access: {
  create: boolean
  update: boolean
  delete: boolean
}) {
  return [access.create, access.update, access.delete].includes(false)
}

/** Helper to decide if filter‑related lists are needed */
function needsFilterLists(access: {
  query: boolean
  update: boolean
  delete: boolean
}) {
  return [access.query, access.update, access.delete].includes(false)
}

/** Create the operation‑level list definition */
function createOperationList(name: string, access: any, fields: Field[]) {
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

/** Create the item‑level list definition */
function createItemList(baseName: string, access: any, fields: Field[], suffix: string) {
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

/** Create the filter‑b list definition */
function createFilterBList(baseName: string, access: any, fields: Field[], suffix: string) {
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

/** Create the standard filter list definition */
function createFilterList(baseName: string, access: any, fields: Field[], suffix: string) {
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

/** Generate list definitions with reduced cognitive complexity */
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
  const operationName = `List_operation_${suffix}`

  // always yield the operation list
  yield createOperationList(operationName, access, fields)

  // conditionally yield item list
  if (needsItemList(access)) {
    yield createItemList(operationName, access, fields, suffix)
  }

  // conditionally yield filter‑b and filter lists
  if (needsFilterLists(access)) {
    yield createFilterBList(operationName, access, fields, suffix)
    yield createFilterList(operationName, access, fields, suffix)
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

/** Generate all field permutations */
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

/** Generate field permutations that include a unique field */
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

/** Generate all list definitions */
function generateLists(): List[] {
  const fields = generateFields()
  const fieldsUnique = generateFieldsWithUnique(fields)

  const allLists: List[] = []
  for (const query of [false, true]) {
    for (const create of [false, true]) {
      for (const update of [false, true]) {
        for (const delete_ of [false, true]) {
          allLists.push(
            ...Array.from(
              makeList({
                access: { query, create, update, delete: delete_ },
                fields,
              })
            )
          )
          allLists.push(
            ...Array.from(
              makeList({
                prefix: `UNIQUE_`,
                access: { query, create, update, delete: delete_ },
                fields: fieldsUnique,
              })
            )
          )
        }
      }
    }
  }
  return allLists
}

export const lists = generateLists()

/** Build Keystone config from generated lists */
function buildConfig(lists: List[]) {
  return {
    lists: {
      ...Object.fromEntries(
        lists.map(l => [
          l.name,
          list({
            ...l,
            fields: {
              ...Object.fromEntries(
                l.fields.map(({ name, expect, ...f }) => [name, text(f)])
              ),
            },
          }),
        ])
      ),
    },
  }
}

export const config = buildConfig(lists)