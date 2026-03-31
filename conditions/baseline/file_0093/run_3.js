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
// Assertion Functions
// ============================================================================

export function expectEqualItem(l: List, a: any, b: any, keys: string[] = []): void {
  assert.notEqual(a, null)
  if ('id' in b) assert.equal(a.id, b.id)
  
  for (const f of l.fields) {
    if (keys.length && !keys.includes(f.name)) continue
    const expected = f.expect.read ? b[f.name] : null
    assert.equal(a[f.name], expected)
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

  sorteda.forEach((xa, i) => expectEqualItem(l, xa, sortedb[i], keys))
}

// ============================================================================
// Filter Functions
// ============================================================================

export function makeWhereUniqueFilter(fields: Field[], seeded: any): Record<string, any> {
  return Object.fromEntries(fields.map(f => [f.name, seeded[f.name]]))
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

export function allowFilter(): Record<string, any> {
  return { id: { not: null } }
}

export function denyFilter(): Record<string, any> {
  return { id: { equals: 'never' } }
}

// ============================================================================
// Field Entry Factory
// ============================================================================

interface AccessConfig {
  read: boolean
  create: boolean
  update: boolean
  filterable: boolean
}

export function makeFieldEntry({
  access,
  unique,
}: {
  access: AccessConfig
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

// ============================================================================
// Type Definitions
// ============================================================================

export type Field = ReturnType<typeof makeFieldEntry>
export type List = ReturnType<typeof makeList> extends Generator<infer T, any, any> ? T : never

// ============================================================================
// List Factory
// ============================================================================

interface ListAccessConfig {
  query: boolean
  create: boolean
  update: boolean
  delete: boolean
}

interface ListConfig {
  prefix?: string
  access: ListAccessConfig
  fields: Field[]
}

function createOperationAccess(access: ListAccessConfig) {
  return {
    query: access.query ? allowAll : denyAll,
    create: access.create ? allowAll : denyAll,
    update: access.update ? allowAll : denyAll,
    delete: access.delete ? allowAll : denyAll,
  }
}

function createBaseListConfig(
  name: string,
  type: 'operation' | 'item' | 'filter(b)' | 'filter',
  access: ListAccessConfig,
  fields: Field[],
  operationAccess: any,
  itemAccess: any,
  filterAccess: any
) {
  return {
    name,
    expect: { type, ...access },
    access: {
      operation: operationAccess,
      filter: filterAccess,
      item: itemAccess,
    },
    fields,
    graphql: {
      plural: name + 's',
    },
  } as const
}

export function* makeList({ prefix = '', access, fields }: ListConfig) {
  const suffix = `${prefix}${makeName(access)}`
  const nameO = `List_operation_${suffix}`

  const operationAccess = createOperationAccess(access)

  yield createBaseListConfig(
    nameO,
    'operation',
    access,
    fields,
    operationAccess,
    {
      create: allowAll,
      update: allowAll,
      delete: allowAll,
    },
    {
      query: allowAll,
      update: allowAll,
      delete: allowAll,
    }
  )

  // Item-level access control variant
  if ([access.create, access.update, access.delete].includes(false)) {
    const nameI = `List_item_${suffix}`
    yield createBaseListConfig(
      nameI,
      'item',
      access,
      fields,
      {
        query: access.query ? allowAll : denyAll,
        create: allowAll,
        update: allowAll,
        delete: allowAll,
      },
      {
        create: access.create ? allowAll : denyAll,
        update: access.update ? allowAll : denyAll,
        delete: access.delete ? allowAll : denyAll,
      },
      {
        query: allowAll,
        update: allowAll,
        delete: allowAll,
      }
    )
  }

  // Filter-level access control variants
  if ([access.query, access.update, access.delete].includes(false)) {
    const nameFB = `List_filterb_${suffix}`
    yield createBaseListConfig(
      nameFB,
      'filter(b)',
      access,
      fields,
      {
        query: allowAll,
        create: access.create ? allowAll : denyAll,
        update: allowAll,
        delete: allowAll,
      },
      {
        create: allowAll,
        update: allowAll,
        delete: allowAll,
      },
      {
        query: access.query ? allowAll : denyAll,
        update: access.update ? allowAll : denyAll,
        delete: access.delete ? allowAll : denyAll,
      }
    )

    const nameF = `List_filter_${suffix}`
    yield createBaseListConfig(
      nameF,
      'filter',
      access,
      fields,
      {
        query: allowAll,
        create: access.create ? allowAll : denyAll,
        update: allowAll,
        delete: allowAll,
      },
      {
        create: allowAll,
        update: allowAll,
        delete: allowAll,
      },
      {
        query: access.query ? allowFilter : denyFilter,
        update: access.update ? allowFilter : denyFilter,
        delete: access.delete ? allowFilter : denyFilter,
      }
    )
  }
}

// ============================================================================
// Database Seeding
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

function* generateFields(unique: boolean): Generator<Field> {
  for (const read of [false, true]) {
    for (const create of [false, true]) {
      for (const update of [false, true]) {
        for (const filterable of [false, true]) {
          yield makeFieldEntry({
            access: { read, create, update, filterable },
            unique,
          })
        }
      }
    }
  }
}

function* generateUniqueFields(): Generator<Field> {
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

// ============================================================================
// List Generation
// ============================================================================

function* generateLists(): Generator<List> {
  const fields = [...generateFields(false)]
  const fieldsUnique = [...fields, ...generateUniqueFields()]

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

export const lists = [...generateLists()]

// ============================================================================
// Configuration
// ============================================================================

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