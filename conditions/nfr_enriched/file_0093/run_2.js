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

function sortItemsById(items: readonly any[]): any[] {
  return [...items].sort((x, y) => x.id.localeCompare(y.id))
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

  const sorteda = sort ? sortItemsById(a) : a
  const sortedb = sort ? sortItemsById(b) : b

  let i = 0
  for (const xa of sorteda) {
    const xb = sortedb[i++]
    expectEqualItem(l, xa, xb, keys)
  }
}

export function makeWhereUniqueFilter(fields: Field[], seeded: any) {
  return Object.fromEntries(
    fields.map(f => {
      return [f.name, seeded[f.name]]
    })
  )
}

function buildEqualsFilter(fields: Field[], seeded: Record<string, any>): any {
  return Object.fromEntries(
    fields.map(f => {
      return [f.name, { equals: seeded[f.name] }]
    })
  )
}

export function makeWhereFilter(
  fields: Field[],
  seeded: Record<string, any> | Record<string, any>[]
): any {
  if (Array.isArray(seeded)) {
    return {
      OR: seeded.map(s => makeWhereFilter(fields, s)),
    }
  }

  return buildEqualsFilter(fields, seeded)
}

function buildAndFilter(fields: Field[], seeded: Record<string, any>): any {
  return {
    AND: fields.map(f => {
      return {
        [f.name]: { equals: seeded[f.name] },
      }
    }),
  }
}

export function makeWhereAndFilter(
  fields: Field[],
  seeded: Record<string, any> | Record<string, any>[]
): any {
  if (Array.isArray(seeded)) {
    return {
      OR: seeded.map(s => makeWhereAndFilter(fields, s)),
    }
  }

  return buildAndFilter(fields, seeded)
}

function buildAccessConfig(access: {
  read: boolean
  create: boolean
  update: boolean
  filterable: boolean
}) {
  return {
    read: access.read ? allowAll : denyAll,
    create: access.create ? allowAll : denyAll,
    update: access.update ? allowAll : denyAll,
  }
}

function buildValidationConfig(unique: boolean) {
  return {
    isRequired: unique,
  }
}

function buildDefaultValue(name: string, unique: boolean) {
  return unique ? null : `Value_${name}`
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
  const name = `Field_${makeName({ ...access, unique })}` as const
  return {
    name,
    expect: {
      ...access,
      unique,
    },
    access: buildAccessConfig(access),
    isFilterable: access.filterable ? allowAll : denyAll,
    isIndexed: unique ? 'unique' : false,
    validation: buildValidationConfig(unique),
    defaultValue: buildDefaultValue(name, unique),
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

function buildOperationAccess(access: {
  query: boolean
  create: boolean
  update: boolean
  delete: boolean
}) {
  return {
    query: access.query ? allowAll : denyAll,
    create: access.create ? allowAll : denyAll,
    update: access.update ? allowAll : denyAll,
    delete: access.delete ? allowAll : denyAll,
  }
}

function createOperationList(
  suffix: string,
  access: {
    query: boolean
    create: boolean
    update: boolean
    delete: boolean
  },
  fields: Field[]
) {
  const nameO = `List_operation_${suffix}`
  return {
    name: nameO,
    expect: { type: 'operation' as const, ...access },
    access: {
      operation: buildOperationAccess(access),
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
}

function createItemList(
  suffix: string,
  access: {
    query: boolean
    create: boolean
    update: boolean
    delete: boolean
  },
  fields: Field[]
) {
  const nameI = `List_item_${suffix}`
  return {
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

function createFilterListB(
  suffix: string,
  access: {
    query: boolean
    create: boolean
    update: boolean
    delete: boolean
  },
  fields: Field[]
) {
  const nameFB = `List_filterb_${suffix}`
  return {
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
}

function createFilterList(
  suffix: string,
  access: {
    query: boolean
    create: boolean
    update: boolean
    delete: boolean
  },
  fields: Field[]
) {
  const nameF = `List_filter_${suffix}`
  return {
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

function* yieldFilterLists(
  suffix: string,
  access: {
    query: boolean
    create: boolean
    update: boolean
    delete: boolean
  },
  fields: Field[]
) {
  if ([access.query, access.update, access.delete].includes(false)) {
    yield createFilterListB(suffix, access, fields)
    yield createFilterList(suffix, access, fields)
  }
}

function* yieldItemList(
  suffix: string,
  access: {
    query: boolean
    create: boolean
    update: boolean
    delete: boolean
  },
  fields: Field[]
) {
  if ([access.create, access.update, access.delete].includes(false)) {
    yield createItemList(suffix, access, fields)
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
}) {
  const suffix = `${prefix}${makeName(access)}`
  yield createOperationList(suffix, access, fields)
  yield* yieldItemList(suffix, access, fields)
  yield* yieldFilterLists(suffix, access, fields)
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
) {
  return Object.fromEntries(
    l.fields.filter(f => f.expect[operation]).map(f => [f.name, randomString()])
  )
}

function* generateFieldVariations() {
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

function* generateUniqueFieldVariations(fields: Field[]) {
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

function* generateListVariations(fields: Field[], fieldsUnique: Field[]) {
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

export const lists = [
  ...(function* () {
    const fields = [...generateFieldVariations()]
    const fieldsUnique = [...fields, ...generateUniqueFieldVariations(fields)]
    yield* generateListVariations(fields, fieldsUnique)
  })(),
]

function* generateConfigEntries() {
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
    ...Object.fromEntries(generateConfigEntries()),
  },
}