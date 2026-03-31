```typescript
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

import { list } from '@keystone-6/core'
import { allowAll, denyAll } from '@keystone-6/core/access'
import { text } from '@keystone-6/core/fields'

// ============================================================================
// Utility Functions
// ============================================================================

export function makeName(o: Record<string, boolean>): string {
  return (
    Object.entries(o)
      .filter(([_, v]) => v)
      .map(([k]) => (k === 'unique' ? 'x' : k.charAt(0)))
      .join('')
      .toUpperCase() ?? 'DENY'
  )
}

export function countUniqueItems(items: readonly any[]): number {
  return new Set(items.map(item => item.id)).size
}

export function randomCount(): number {
  return 6
}

export function randomString(): string {
  return `foo-${randomUUID()}`
}

// ============================================================================
// Filter Helpers
// ============================================================================

export function allowFilter() {
  return { id: { not: null } }
}

export function denyFilter() {
  return { id: { equals: 'never' } }
}

// ============================================================================
// Where Filter Builders
// ============================================================================

export function makeWhereUniqueFilter(fields: Field[], seeded: any): Record<string, any> {
  return Object.fromEntries(fields.map(f => [f.name, seeded[f.name]]))
}

function buildWhereCondition(fields: Field[], seeded: Record<string, any>): Record<string, any> {
  return Object.fromEntries(fields.map(f => [f.name, { equals: seeded[f.name] }]))
}

export function makeWhereFilter(
  fields: Field[],
  seeded: Record<string, any> | Record<string, any>[]
): any {
  if (Array.isArray(seeded)) {
    return { OR: seeded.map(s => makeWhereFilter(fields, s)) }
  }
  return buildWhereCondition(fields, seeded)
}

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

// ============================================================================
// Item Comparison
// ============================================================================

export function expectEqualItem(l: List, a: any, b: any, keys: string[] = []): void {
  assert.notEqual(a, null)
  if ('id' in b) assert.equal(a.id, b.id)
  
  for (const f of l.fields) {
    if (keys.length && !keys.includes(f.name)) continue
    const expectedValue = f.expect.read ? b[f.name] : null
    assert.equal(a[f.name], expectedValue)
  }
}

export function expectEqualItems(
  l: List,
  a: readonly any[],
  b: any[],
  keys: string[] = [],
  sort = true
): void {
  assert.notEqual(a, null)
  assert.equal(a.length, b.length)

  const sortById = (items: any[]) => items.sort((x, y) => x.id.localeCompare(y.id))
  const sorteda = sort ? sortById([...a]) : a
  const sortedb = sort ? sortById([...b]) : b

  sorteda.forEach((xa, i) => {
    expectEqualItem(l, xa, sortedb[i], keys)
  })
}

// ============================================================================
// Field Entry Builder
// ============================================================================

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

// ============================================================================
// Type Definitions
// ============================================================================

export type Field = ReturnType<typeof makeFieldEntry>
export type List = ReturnType<typeof makeList> extends Generator<infer T, any, any> ? T : never

// ============================================================================
// List Configuration Builders
// ============================================================================

interface AccessConfig {
  query: boolean
  create: boolean
  update: boolean
  delete: boolean
}

function createOperationListConfig(
  name: string,
  access: AccessConfig,
  fields: Field[]
): ReturnType<typeof makeList> {
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

function createItemListConfig(
  name: string,
  access: AccessConfig,
  fields: Field[]
): ReturnType<typeof makeList> {
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

function createFilterListConfigs(
  suffix: string,
  access: AccessConfig,
  fields: Field[]
): ReturnType<typeof makeList>[] {
  const configs: ReturnType<typeof makeList>[] = []

  const nameFB = `List_filterb_${suffix}`
  configs.push({
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
      item: { create: allowAll, update: allowAll, delete: allowAll },
    },
    fields,
    graphql: { plural: nameFB + 's' },
  } as const)

  const nameF = `List_filter_${suffix}`
  configs.push({
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
      item: { create: allowAll, update: allowAll, delete: allowAll },
    },
    fields,
    graphql: { plural: nameF + 's' },
  } as const)

  return configs
}

export function* makeList({
  prefix = '',
  access,
  fields,
}: {
  prefix?: string
  access: AccessConfig
  fields: Field[]
}): Generator<ReturnType<typeof makeList>> {
  const suffix = `${prefix}${makeName(access)}`
  const nameO = `List_operation_${suffix}`

  yield createOperationListConfig(nameO, access, fields)

  if ([access.create, access.update, access.delete].includes(false)) {
    const nameI = `List_item_${suffix}`
    yield createItemListConfig(nameI, access, fields)
  }

  if ([access.query, access.update, access.delete].includes(false)) {
    yield* createFilterListConfigs(suffix, access, fields)
  }
}

// ============================================================================
// Seeding Functions
// ============================================================================

export async function seed(l: List, context: any): Promise<Record<string, any>> {
  const data = Object.fromEntries(l.fields.map(f => [f.name, randomString()]))
  return (await context.sudo().db[l.name].createOne({ data })) as Record<string, any>
}

export async function seedMany(l: List, context: any): Promise<Record<string, any>[]> {
  const data = [...Array(randomCount())].map(() =>
    Object.fromEntries(l.fields.map(f => [f.name, randomString()]))
  )
  return (await context.sudo().db[l.name].createMany({ data })) as Record<string, any>[]
}

export function makeItem(
  l: { fields: Field[] },
  operation: 'create' | 'update'
): Record<string, string> {
  return Object.fromEntries(
    l.fields.filter(f => f.expect[operation]).map(f => [f.name, randomString()])
  )
}

// ============================================================================
// Field Generation
// ============================================================================

function* generateFields(): Generator<Field> {
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

function* generateUniqueFields(baseFields: Field[]): Generator<Field> {
  yield* baseFields
  for (const read of [false, true]) {
    for (const update of [false, true]) {
      for (const filterable of [false, true]) {
        yield makeFieldEntry({
          access: { read, create: true, update, filterable },
          unique: true,
        })
      }
    }
  }
}

function* generateLists(): Generator<List> {
  const fields = [...generateFields()]
  const fieldsUnique = [...generateUniqueFields(fields)]

  for (const query of [false, true]) {
    for (const create of [false, true]) {
      for (const update of [false, true]) {
        for (const delete_ of [false, true]) {
          yield* makeList({
            access: { query, create, update, delete: delete_ },
            fields,
          })

          yield* makeList({
            prefix: 'UNIQUE_',
            access: { query, create, update, delete: delete_ },
            fields: fieldsUnique,
          })
        }
      }
    }
  }
}

// ============================================================================
// Configuration Export
// ============================================================================

export const lists = [...generateLists()]

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
```