import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

import { list } from '@keystone-6/core'
import { allowAll, denyAll } from '@keystone-6/core/access'
import { text } from '@keystone-6/core/fields'

export function makeName(o: Record<string, boolean>) {
  return (
    Object.entries(o)
      .filter(([, v]) => v)
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
    fields.map(f => {
      return [f.name, seeded[f.name]]
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

  return Object.fromEntries(
    fields.map(f => {
      return [f.name, { equals: seeded[f.name] }]
    })
  )
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

  return {
    AND: fields.map(f => {
      return {
        [f.name]: { equals: seeded[f.name] },
      }
    }),
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

/** Helper to build operation access object */
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

/** Helper to build filter access object */
function buildFilterAccess(access: {
  query: boolean
  create: boolean
  update: boolean
  delete: boolean
}) {
  return {
    query: allowAll,
    update: allowAll,
    delete: allowAll,
  }
}

/** Helper to build item access object */
function buildItemAccess(access: {
  query: boolean
  create: boolean
  update: boolean
  delete: boolean
}) {
  return {
    create: allowAll,
    update: allowAll,
    delete: allowAll,
  }
}

/** Helper to build graphql config */
function buildGraphql(name: string) {
  return {
    plural: `${name}s`,
  }
}

/** Generator for list operation */
function* generateOperation(
  name: string,
  access: {
    query: boolean
    create: boolean
    update: boolean
    delete: boolean
  },
  fields: Field[]
) {
  yield {
    name,
    expect: { type: 'operation' as const, ...access },
    access: {
      operation: buildOperationAccess(access),
      filter: buildFilterAccess(access),
      item: buildItemAccess(access),
    },
    fields,
    graphql: buildGraphql(name),
  } as const
}

/** Generator for list item */
function* generateItem(
  name: string,
  access: {
    query: boolean
    create: boolean
    update: boolean
    delete: boolean
  },
  fields: Field[]
) {
  yield {
    name,
    expect: { type: 'item' as const, ...access },
    access: {
      operation: buildOperationAccess(access),
      filter: buildFilterAccess(access),
      item: {
        create: access.create ? allowAll : denyAll,
        update: access.update ? allowAll : denyAll,
        delete: access.delete ? allowAll : denyAll,
      },
    },
    fields,
    graphql: buildGraphql(name),
  } as const
}

/** Generator for filter(b) */
function* generateFilterB(
  name: string,
  access: {
    query: boolean
    create: boolean
    update: boolean
    delete: boolean
  },
  fields: Field[]
) {
  yield {
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
      item: buildItemAccess(access),
    },
    fields,
    graphql: buildGraphql(name),
  } as const
}

/** Generator for filter */
function* generateFilter(
  name: string,
  access: {
    query: boolean
    create: boolean
    update: boolean
    delete: boolean
  },
  fields: Field[]
) {
  yield {
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
      item: buildItemAccess(access),
    },
    fields,
    graphql: buildGraphql(name),
  } as const
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
  const nameO = `List_operation_${suffix}`

  yield* generateOperation(nameO, access, fields)

  if ([access.create, access.update, access.delete].includes(false)) {
    const nameI = `List_item_${suffix}`
    yield* generateItem(nameI, access, fields)
  }

  if ([access.query, access.update, access.delete].includes(false)) {
    const nameFB = `List_filterb_${suffix}`
    yield* generateFilterB(nameFB, access, fields)

    const nameF = `List_filter_${suffix}`
    yield* generateFilter(nameF, access, fields)
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

/** Helper to generate field entries */
function* generateFieldEntries(
  accessOptions: {
    read: boolean
    create: boolean
    update: boolean
    filterable: boolean
  }[],
  unique: boolean
) {
  for (const opts of accessOptions) {
    yield makeFieldEntry({
      access: opts,
      unique,
    })
  }
}

/** Helper to generate lists */
function* generateLists(
  accessOptions: {
    query: boolean
    create: boolean
    update: boolean
    delete: boolean
  }[],
  fields: Field[],
  fieldsUnique: Field[]
) {
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
            fields: fieldsUnique,
          })
        }
      }
    }
  }
}

export const lists = [
  ...(function* () {
    const baseAccess = [
      { read: false, create: false, update: false, filterable: false },
      { read: false, create: false, update: true, filterable: false },
      { read: false, create: true, update: false, filterable: false },
      { read: false, create: true, update: true, filterable: false },
      { read: true, create: false, update: false, filterable: false },
      { read: true, create: false, update: true, filterable: false },
      { read: true, create: true, update: false, filterable: false },
      { read: true, create: true, update: true, filterable: false },
      { read: false, create: false, update: false, filterable: true },
      { read: false, create: false, update: true, filterable: true },
      { read: false, create: true, update: false, filterable: true },
      { read: false, create: true, update: true, filterable: true },
      { read: true, create: false, update: false, filterable: true },
      { read: true, create: false, update: true, filterable: true },
      { read: true, create: true, update: false, filterable: true },
      { read: true, create: true, update: true, filterable: true },
    ]

    const fields = [...generateFieldEntries(baseAccess, false)]
    const fieldsUnique = [
      ...fields,
      ...generateFieldEntries(
        baseAccess.map(o => ({ ...o, create: true })), // create always true for unique
        true
      ),
    ]

    const listAccess = [
      { query: false, create: false, update: false, delete: false },
      { query: false, create: false, update: false, delete: true },
      { query: false, create: false, update: true, delete: false },
      { query: false, create: false, update: true, delete: true },
      { query: false, create: true, update: false, delete: false },
      { query: false, create: true, update: false, delete: true },
      { query: false, create: true, update: true, delete: false },
      { query: false, create: true, update: true, delete: true },
      { query: true, create: false, update: false, delete: false },
      { query: true, create: false, update: false, delete: true },
      { query: true, create: false, update: true, delete: false },
      { query: true, create: false, update: true, delete: true },
      { query: true, create: true, update: false, delete: false },
      { query: true, create: true, update: false, delete: true },
      { query: true, create: true, update: true, delete: false },
      { query: true, create: true, update: true, delete: true },
    ]

    yield* generateLists(listAccess, fields, fieldsUnique)
  })(),
]

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