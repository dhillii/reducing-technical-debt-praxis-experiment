```typescript
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

import { list } from '@keystone-6/core'
import { allowAll, denyAll } from '@keystone-6/core/access'
import { text } from '@keystone-6/core/fields'

export function makeName(o: Record<string, boolean>): string {
  const entries = Object.entries(o).filter(([_, v]) => v)
  const chars = entries.map(([k]) => (k === 'unique' ? 'x' : k.charAt(0)))
  const result = chars.join('').toUpperCase()
  return result ?? 'DENY'
}

export function countUniqueItems(items: readonly any[]): number {
  return new Set(items.map(item => item.id)).size
}

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

  for (let i = 0; i < sorteda.length; i++) {
    expectEqualItem(l, sorteda[i], sortedb[i], keys)
  }
}

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
  return Object.fromEntries(fields.map(f => [f.name, { equals: seeded[f.name] }]))
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

export function makeFieldEntry({ access, unique }: { access: { read: boolean; create: boolean; update: boolean; filterable: boolean }; unique: boolean }): Field {
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

export function allowFilter(): Record<string, any> {
  return { id: { not: null } }
}

export function denyFilter(): Record<string, any> {
  return { id: { equals: 'never' } }
}

export type Field = ReturnType<typeof makeFieldEntry>
export type List = ReturnType<typeof makeList> extends Generator<infer T, any, any> ? T : never

function createOperationConfig(
  name: string,
  access: { query: boolean; create: boolean; update: boolean; delete: boolean },
  fields: Field[]
): any {
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

function createItemConfig(
  name: string,
  access: { query: boolean; create: boolean; update: boolean; delete: boolean },
  fields: Field[]
): any {
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

function createFilterConfig(
  name: string,
  access: { query: boolean; create: boolean; update: boolean; delete: boolean },
  fields: Field[]
): any {
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

function createFilterBConfig(
  name: string,
  access: { query: boolean; create: boolean; update: boolean; delete: boolean },
  fields: Field[]
): any {
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

function* createListConfig(
  prefix: string,
  access: { query: boolean; create: boolean; update: boolean; delete: boolean },
  fields: Field[]
): Generator<any> {
  const suffix = `${prefix}${makeName(access)}`
  const nameO = `List_operation_${suffix}`

  yield createOperationConfig(nameO, access, fields)

  if ([access.create, access.update, access.delete].includes(false)) {
    const nameI = `List_item_${suffix}`
    yield createItemConfig(nameI, access, fields)
  }

  if ([access.query, access.update, access.delete].includes(false)) {
    const nameFB = `List_filterb_${suffix}`
    yield createFilterBConfig(nameFB, access, fields)

    const nameF = `List_filter_${suffix}`
    yield createFilterConfig(nameF, access, fields)
  }
}

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
  yield* createListConfig(prefix, access, fields)
}

export function randomCount(): number {
  return 6
}

export function randomString(): string {
  return `foo-${randomUUID()}`
}

export async function seed(l: List, context: any): Promise<Record<string, any>> {
  const data = Object.fromEntries(l.fields.map(f => [f.name, randomString()]))
  return (await context.sudo().db[l.name].createOne({ data })) as Record<string, any>
}

export async function seedMany(l: List, context: any): Promise<Record<string, any>[]> {
  const data = [...Array(randomCount())].map(_ =>
    Object.fromEntries(l.fields.map(f => [f.name, randomString()]))
  )
  return (await context.sudo().db[l.name].createMany({ data })) as Record<string, any>[]
}

export function makeItem(l: { fields: Field[] }, operation: 'create' | 'update'): Record<string, any> {
  return Object.fromEntries(l.fields.filter(f => f.expect[operation]).map(f => [f.name, randomString()]))
}

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

function* generateFieldsUnique(): Generator<Field> {
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

function* generateListConfig(
  fields: Field[],
  fieldsUnique: Field[],
  query: boolean,
  create: boolean,
  update: boolean,
  delete_: boolean
): Generator<any> {
  yield* makeList({
    access: { query, create, update, delete: delete_ },
    fields,
  })

  yield* makeList({
    prefix: `UNIQUE_`,
    access: { query, create, update, delete: delete_ },
    fields: fieldsUnique,
  })
}

export const lists = [
  ...(function* () {
    const fields = [...generateFields()]
    const fieldsUnique = [...fields, ...generateFieldsUnique()]

    for (const query of [false, true]) {
      for (const create of [false, true]) {
        for (const update of [false, true]) {
          for (const delete_ of [false, true]) {
            yield* generateListConfig(fields, fieldsUnique, query, create, update, delete_)
          }
        }
      }
    }
  })(),
]

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

export const config = {
  lists: {
    ...Object.fromEntries(generateConfig()),
  },
}
```