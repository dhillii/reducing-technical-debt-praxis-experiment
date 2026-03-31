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

export function randomString(): string {
  return `foo-${randomUUID()}`
}

export function randomCount(): number {
  return 6
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

  sorteda.forEach((xa, i) => expectEqualItem(l, xa, sortedb[i], keys))
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
// Item Builders
// ============================================================================

export function makeItem(
  l: { fields: Field[] },
  operation: 'create' | 'update'
): Record<string, string> {
  return Object.fromEntries(
    l.fields.filter(f => f.expect[operation]).map(f => [f.name, randomString()])
  )
}

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

// ============================================================================
// List Configuration
// ============================================================================

export type Field = ReturnType<typeof makeFieldEntry>
export type List = ReturnType<typeof makeList> extends Generator<infer T, any, any> ? T : never

interface AccessConfig {
  query: boolean
  create: boolean
  update: boolean
  delete: boolean
}

interface OperationAccess {
  query: typeof allowAll | typeof denyAll
  create: typeof allowAll | typeof denyAll
  update: typeof allowAll | typeof denyAll
  delete: typeof allowAll | typeof denyAll
}

interface FilterAccess {
  query: typeof allowAll | typeof denyAll | ReturnType<typeof allowFilter> | ReturnType<typeof denyFilter>
  update: typeof allowAll | typeof denyAll | ReturnType<typeof allowFilter> | ReturnType<typeof denyFilter>
  delete: typeof allowAll | typeof denyAll | ReturnType<typeof allowFilter> | ReturnType<typeof denyFilter>
}

function createOperationAccess(access: AccessConfig): OperationAccess {
  return {
    query: access.query ? allowAll : denyAll,
    create: access.create ? allowAll : denyAll,
    update: access.update ? allowAll : denyAll,
    delete: access.delete ? allowAll : denyAll,
  }
}

function createListConfig(
  name: string,
  type: 'operation' | 'item' | 'filter(b)' | 'filter',
  access: AccessConfig,
  fields: Field[],
  operationAccess: OperationAccess,
  filterAccess: FilterAccess
) {
  return {
    name,
    expect: { type, ...access },
    access: {
      operation: operationAccess,
      filter: {
        query: filterAccess.query,
        update: filterAccess.update,
        delete: filterAccess.delete,
      },
      item: {
        create: allowAll,
        update: allowAll,
        delete: allowAll,
      },
    },
    fields,
    graphql: {
      plural: name + 's',
    },
  } as const
}

export function* makeList({
  prefix = '',
  access,
  fields,
}: {
  prefix?: string
  access: AccessConfig
  fields: Field[]
}) {
  const suffix = `${prefix}${makeName(access)}`
  const operationAccess = createOperationAccess(access)

  // Operation-level access control
  yield createListConfig(
    `List_operation_${suffix}`,
    'operation',
    access,
    fields,
    operationAccess,
    {
      query: allowAll,
      update: allowAll,
      delete: allowAll,
    }
  )

  // Item-level access control
  if ([access.create, access.update, access.delete].includes(false)) {
    yield createListConfig(
      `List_item_${suffix}`,
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
        query: allowAll,
        update: allowAll,
        delete: allowAll,
      }
    )
  }

  // Filter-level access control
  if ([access.query, access.update, access.delete].includes(false)) {
    yield createListConfig(
      `List_filterb_${suffix}`,
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
        query: access.query ? allowAll : denyAll,
        update: access.update ? allowAll : denyAll,
        delete: access.delete ? allowAll : denyAll,
      }
    )

    yield createListConfig(
      `List_filter_${suffix}`,
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
        query: access.query ? allowFilter : denyFilter,
        update: access.update ? allowFilter : denyFilter,
        delete: access.delete ? allowFilter : denyFilter,
      }
    )
  }
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
    for (const create of [true]) {
      for (const update of [false, true]) {
        for (const filterable of [false, true]) {
          yield makeFieldEntry({
            access: { read, create, update, filterable },
            unique: true,
          })
        }
      }
    }
  }
}

function* generateLists(fields: Field[], fieldsUnique: Field[]): Generator<any> {
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

export const lists = [
  ...(function* () {
    const fields = [...generateFields()]
    const fieldsUnique = [...generateUniqueFields(fields)]
    yield* generateLists(fields, fieldsUnique)
  })(),
]

// ============================================================================
// Keystone Configuration
// ============================================================================

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
```