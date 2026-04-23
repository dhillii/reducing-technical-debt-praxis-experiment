import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

import { list } from '@keystone-6/core'
import { allowAll, denyAll } from '@keystone-6/core/access'
import { text } from '@keystone-6/core/fields'

function makeName(o: Record<string, boolean>): string {
  const entries = Object.entries(o).filter(([_, v]) => v)
  const chars = entries.map(([k]) => (k === 'unique' ? 'x' : k.charAt(0)))
  const result = chars.join('').toUpperCase()
  return result ?? 'DENY'
}

export function countUniqueItems(items: readonly any[]): number {
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

  for (let i = 0; i < sorteda.length; i++) {
    expectEqualItem(l, sorteda[i], sortedb[i], keys)
  }
}

function makeWhereFilterItem(fields: Field[], seeded: Record<string, any>): any {
  return Object.fromEntries(
    fields.map(f => [f.name, { equals: seeded[f.name] }])
  )
}

export function makeWhereUniqueFilter(fields: Field[], seeded: any): any {
  return Object.fromEntries(
    fields.map(f => [f.name, seeded[f.name]])
  )
}

export function makeWhereFilter(
  fields: Field[],
  seeded: Record<string, any> | Record<string, any>[]
): any {
  if (Array.isArray(seeded)) {
    return {
      OR: seeded.map(s => makeWhereFilterItem(fields, s)),
    }
  }
  return makeWhereFilterItem(fields, seeded)
}

export function makeWhereAndFilter(
  fields: Field[],
  seeded: Record<string, any> | Record<string, any>[]
): any {
  if (Array.isArray(seeded)) {
    return {
      OR: seeded.map(s => makeWhereAndFilterItem(fields, s)),
    }
  }
  return {
    AND: fields.map(f => ({
      [f.name]: { equals: seeded[f.name] },
    })),
  }
}

function makeWhereAndFilterItem(fields: Field[], seeded: Record<string, any>): any {
  return {
    AND: fields.map(f => ({
      [f.name]: { equals: seeded[f.name] },
    })),
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

export function allowFilter() {
  return {
    id: {
      not: null,
    },
  }
}

export function denyFilter() {
  return {
    id: {
      equals: 'never',
    },
  }
}

export type Field = ReturnType<typeof makeFieldEntry>
export type List = ReturnType<typeof makeList> extends Generator<infer T, any, any> ? T : never

function* makeListItems({
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

  if (!access.create || !access.update || !access.delete) {
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
      graphql: {
        plural: nameI + 's',
      },
    } as const
  }

  if (!access.query || !access.update || !access.delete) {
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

export async function seedMany(
  l: List,
  context: any
): Promise<Record<string, any>[]> {
  const data = [...Array(randomCount())].map(_ =>
    Object.fromEntries(l.fields.map(f => [f.name, randomString()]))
  )
  return (await context.sudo().db[l.name].createMany({ data })) as Record<string, any>[]
}

export function makeItem(
  l: {
    fields: Field[]
  },
  operation: 'create' | 'update'
): Record<string, string> {
  return Object.fromEntries(
    l.fields.filter(f => f.expect[operation]).map(f => [f.name, randomString()])
  )
}

function* generateFields(): Generator<Field> {
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

function* generateFieldsUnique(): Generator<Field> {
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

function* generateLists(): Generator<List> {
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

function* generateConfig(): Generator<[string, any]> {
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
    ...Object.fromEntries(generateConfig()),
  },
}