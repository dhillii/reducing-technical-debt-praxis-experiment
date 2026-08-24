import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

import { list } from '@keystone-6/core'
import { allowAll, denyAll } from '@keystone-6/core/access'
import { text } from '@keystone-6/core/fields'

// Predicate functions
function isUniqueRequired(f: Field) {
  return f.expect.unique
}

function shouldIncludeFieldForOperation(f: Field, operation: 'create' | 'update') {
  return f.expect[operation]
}

function isFilterConditionRequired(allowRead: boolean, allowCreate: boolean, allowUpdate: boolean, allowDelete: boolean) {
  return [allowRead, allowUpdate, allowDelete].includes(false)
}

function isItemAccessConditionRequired(allowCreate: boolean, allowUpdate: boolean, allowDelete: boolean) {
  return [allowCreate, allowUpdate, allowDelete].includes(false)
}

// Helper for filtering fields by operation
function getFieldsForOperation(fields: Field[], operation: 'create' | 'update') {
  return fields.filter(f => shouldIncludeFieldForOperation(f, operation))
}

// Make unique filter
export function makeWhereUniqueFilter(fields: Field[], seeded: any) {
  return Object.fromEntries(
    fields.map(f => [f.name, seeded[f.name]])
  )
}

// Make OR filter
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

// Make AND filter
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
  const name = makeFieldEntryName({ ...access, unique })
  return {
    name,
    expect: {
      ...access,
      unique,
    },
    access: {
      read: createAccessControl(access.read, allowAll, denyAll),
      create: createAccessControl(access.create, allowAll, denyAll),
      update: createAccessControl(access.update, allowAll, denyAll),
    },
    isFilterable: createAccessControl(access.filterable, allowAll, denyAll),
    isIndexed: unique ? 'unique' : false,
    validation: {
      isRequired: isUniqueRequired({ expect: { unique } }),
    },
    defaultValue: unique ? null : `Value_${name}`,
  } as const
}

function makeFieldEntryName(o: Record<string, boolean>): string {
  return (
    Object.entries(o)
      .filter(([_, v]) => v)
      .map(([k]) => (k === 'unique' ? 'x' : k.charAt(0)))
      .join('')
      .toUpperCase() ?? 'DENY'
  )
}

function createAccessControl(allowed: boolean, allowFn: typeof allowAll, denyFn: typeof denyAll) {
  return allowed ? allowFn : denyFn
}

export function allowFilter() {
  return { id: { not: null } }
}

export function denyFilter() {
  return { id: { equals: 'never' } }
}

export type Field = ReturnType<typeof makeFieldEntry>
export type List = ReturnType<typeof makeList> extends Generator<infer T, any, any> ? T : never

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
  const suffix = makeListSuffix(prefix, access)
  const nameO = makeOperationListName(suffix)
  const nameI = makeItemAccessListName(suffix)
  const nameFB = makeFilterBListName(suffix)
  const nameF = makeFilterListName(suffix)

  // Primary operation list
  yield createOperationList(nameO, access, fields)

  // Item access control list
  if (isItemAccessConditionRequired(access.create, access.update, access.delete)) {
    yield createItemList(nameI, access, fields)
  }

  // Filter control lists
  if (isFilterConditionRequired(access.query, access.update, access.delete)) {
    yield createFilterBList(nameFB, access, fields)
    yield createFilterList(nameF, access, fields)
  }
}

function makeListSuffix(prefix: string, access: Record<string, boolean>): string {
  return `${prefix}${makeName(access)}`
}

function makeName(o: Record<string, boolean>): string {
  return makeFieldEntryName(o)
}

function makeOperationListName(suffix: string): string {
  return `List_operation_${suffix}`
}

function makeItemAccessListName(suffix: string): string {
  return `List_item_${suffix}`
}

function makeFilterBListName(suffix: string): string {
  return `List_filterb_${suffix}`
}

function makeFilterListName(suffix: string): string {
  return `List_filter_${suffix}`
}

function createOperationList(
  name: string,
  access: Record<string, boolean>,
  fields: Field[]
) {
  return {
    name,
    expect: { type: 'operation' as const, ...access },
    access: {
      operation: {
        query: createAccessControl(access.query, allowAll, denyAll),
        create: createAccessControl(access.create, allowAll, denyAll),
        update: createAccessControl(access.update, allowAll, denyAll),
        delete: createAccessControl(access.delete, allowAll, denyAll),
      },
      filter: allowAllFilter(),
      item: allowAllItem(),
    },
    fields,
    graphql: {
      plural: name + 's',
    },
  } as const
}

function createItemList(
  name: string,
  access: Record<string, boolean>,
  fields: Field[]
) {
  return {
    name,
    expect: { type: 'item' as const, ...access },
    access: {
      operation: {
        query: createAccessControl(access.query, allowAll, denyAll),
        create: allowAll,
        update: allowAll,
        delete: allowAll,
      },
      filter: allowAllFilter(),
      item: {
        create: createAccessControl(access.create, allowAll, denyAll),
        update: createAccessControl(access.update, allowAll, denyAll),
        delete: createAccessControl(access.delete, allowAll, denyAll),
      },
    },
    fields,
    graphql: {
      plural: name + 's',
    },
  } as const
}

function createFilterBList(
  name: string,
  access: Record<string, boolean>,
  fields: Field[]
) {
  return {
    name,
    expect: { type: 'filter(b)' as const, ...access },
    access: {
      operation: {
        query: allowAll,
        create: createAccessControl(access.create, allowAll, denyAll),
        update: allowAll,
        delete: allowAll,
      },
      filter: {
        query: createAccessControl(access.query, allowAll, denyAll),
        update: createAccessControl(access.update, allowAll, denyAll),
        delete: createAccessControl(access.delete, allowAll, denyAll),
      },
      item: allowAllItem(),
    },
    fields,
    graphql: {
      plural: name + 's',
    },
  } as const
}

function createFilterList(
  name: string,
  access: Record<string, boolean>,
  fields: Field[]
) {
  return {
    name,
    expect: { type: 'filter' as const, ...access },
    access: {
      operation: {
        query: allowAll,
        create: createAccessControl(access.create, allowAll, denyAll),
        update: allowAll,
        delete: allowAll,
      },
      filter: {
        query: createAccessControl(access.query, allowFilter, denyFilter),
        update: createAccessControl(access.update, allowFilter, denyFilter),
        delete: createAccessControl(access.delete, allowFilter, denyFilter),
      },
      item: allowAllItem(),
    },
    fields,
    graphql: {
      plural: name + 's',
    },
  } as const
}

function allowAllFilter() {
  return {
    query: allowAll,
    update: allowAll,
    delete: allowAll,
  }
}

function allowAllItem() {
  return {
    create: allowAll,
    update: allowAll,
    delete: allowAll,
  }
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

export function randomCount() {
  return 6
}

export function randomString() {
  return `foo-${randomUUID()}`
}

export async function seed(l: List, context: any) {
  const data = createSeedData(l.fields)
  return (await context.sudo().db[l.name].createOne({ data })) as Record<string, any>
}

export async function seedMany(l: List, context: any) {
  const data = createSeedDataMany(l.fields, randomCount())
  return (await context.sudo().db[l.name].createMany({ data })) as Record<string, any>[]
}

function createSeedData(fields: Field[]) {
  return Object.fromEntries(fields.map(f => [f.name, randomString()]))
}

function createFieldEntryForFields(l: { fields: Field[] }, operation: 'create' | 'update') {
  return Object.fromEntries(
    getFieldsForOperation(l.fields, operation).map(f => [f.name, randomString()])
  )
}

export function makeItem(
  l: {
    fields: Field[]
  },
  operation: 'create' | 'update'
) {
  return createFieldEntryForFields(l, operation)
}

export const lists = [
  ...(function* () {
    const fields = [...generateFields(false), ...generateFields(true)]
    for (const query of [false, true]) {
      for (const create of [false, true]) {
        for (const update of [false, true]) {
          for (const delete_ of [false, true]) {
            yield* makeList({
              access: { query, create, update, delete: delete_ },
              fields,
            })

            yield* makeList({
              prefix: `UNIQUE_`,
              access: { query, create, update, delete: delete_ },
              fields,
            })
          }
        }
      }
    }
  })(),
]

function* generateFields(unique: boolean) {
  for (const read of [false, true]) {
    for (const create of [false, true]) {
      for (const update of [false, true]) {
        for (const filterable of [false, true]) {
          if (unique && !create) continue
          yield makeFieldEntry({
            access: { read, create, update, filterable },
            unique,
          })
        }
      }
    }
  }
}

export const config = {
  lists: {
    ...Object.fromEntries(
      (function* () {
        for (const l of lists) {
          yield [
            l.name,
            list({
              ...l,
              fields: buildFieldConfig(l.fields),
            }),
          ]
        }
      })()
    ),
  },
}

function buildFieldConfig(fields: Field[]) {
  return Object.fromEntries(
    fields.map(({ name, expect, ...f }) => [name, text(f)])
  )
}