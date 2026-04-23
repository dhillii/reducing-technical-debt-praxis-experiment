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

/**
 * Determines if an item‑level list should be generated.
 */
function shouldYieldItem(access: {
  create: boolean
  update: boolean
  delete: boolean
}): boolean {
  return [access.create, access.update, access.delete].includes(false)
}

/**
 * Determines if a filter‑b list should be generated.
 */
function shouldYieldFilterB(access: {
  query: boolean
  update: boolean
  delete: boolean
}): boolean {
  return [access.query, access.update, access.delete].includes(false)
}

/**
 * Generates the various list configurations for a given access set.
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

  // operation list – always yielded
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
    graphql: { plural: nameO + 's' },
  } as const

  if (shouldYieldItem(access)) {
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
      graphql: { plural: nameI + 's' },
    } as const
  }

  if (shouldYieldFilterB(access)) {
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
      graphql: { plural: nameFB + 's' },
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
      graphql: { plural: nameF + 's' },
    } as const
  }
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
 * Returns the Cartesian product of the supplied arrays.
 */
function cartesianProduct<T>(arrays: T[][]): T[][] {
  return arrays.reduce<T[][]>(
    (acc, cur) =>
      acc
        .map(a => cur.map(c => [...a, c]))
        .reduce((a, b) => a.concat(b), []),
    [[]]
  )
}

/**
 * Generates all field entries for the given `unique` flag.
 */
function generateFieldEntries(unique: boolean): Field[] {
  const bools = [[false, true], [false, true], [false, true], [false, true]]
  const combos = cartesianProduct(bools)
  return combos.map(([read, create, update, filterable]) =>
    makeFieldEntry({
      access: { read, create, update, filterable },
      unique,
    })
  )
}

/**
 * Generates the complete list of `List` configurations.
 */
function generateLists(): List[] {
  const fields = generateFieldEntries(false)

  const fieldsUnique = [
    ...fields,
    ...generateFieldEntries(true),
  ]

  const accessBools = [
    [false, true],
    [false, true],
    [false, true],
    [false, true],
  ]

  const accessCombos = cartesianProduct(accessBools).map(
    ([query, create, update, del]) => ({
      query,
      create,
      update,
      delete: del,
    })
  )

  const result: List[] = []
  for (const access of accessCombos) {
    result.push(
      ...Array.from(
        makeList({
          access,
          fields,
        })
      )
    )
    result.push(
      ...Array.from(
        makeList({
          prefix: `UNIQUE_`,
          access,
          fields: fieldsUnique,
        })
      )
    )
  }
  return result
}

export const lists = generateLists()

/**
 * Builds the Keystone configuration object from the generated lists.
 */
export const config = {
  lists: Object.fromEntries(
    lists.map(l => [
      l.name,
      list({
        ...l,
        fields: Object.fromEntries(
          l.fields.map(({ name, expect, ...f }) => [name, text(f)])
        ),
      }),
    ])
  ),
}

/**
 * Returns a deterministic count used for seeding.
 */
export function randomCount() {
  // return 1 + randomInt()
  return 6
}

/**
 * Generates a random string value.
 */
export function randomString() {
  return `foo-${randomUUID()}`
}

/**
 * Seeds a single item for the given list.
 */
export async function seed(l: List, context: any) {
  const data = Object.fromEntries(l.fields.map(f => [f.name, randomString()]))
  // sudo required, as we might not have query/read access
  return (await context.sudo().db[l.name].createOne({ data })) as Record<string, any>
}

/**
 * Seeds multiple items for the given list.
 */
export async function seedMany(l: List, context: any) {
  const data = [...Array(randomCount())].map(() =>
    Object.fromEntries(l.fields.map(f => [f.name, randomString()]))
  )
  // sudo required, as we might not have query/read access
  return (await context.sudo().db[l.name].createMany({ data })) as Record<string, any>[]
}

/**
 * Creates an item payload for the specified operation.
 */
export function makeItem(
  l: { fields: Field[] },
  operation: 'create' | 'update'
) {
  return Object.fromEntries(
    l.fields
      .filter(f => f.expect[operation])
      .map(f => [f.name, randomString()])
  )
}