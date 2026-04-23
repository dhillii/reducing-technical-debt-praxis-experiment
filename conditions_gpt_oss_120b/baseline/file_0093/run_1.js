import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { list } from '@keystone-6/core';
import { allowAll, denyAll } from '@keystone-6/core/access';
import { text } from '@keystone-6/core/fields';

export function makeName(o: Record<string, boolean>) {
  return (
    Object.entries(o)
      .filter(([, v]) => v)
      .map(([k]) => (k === 'unique' ? 'x' : k.charAt(0)))
      .join('')
      .toUpperCase() ?? 'DENY'
  );
}

export function countUniqueItems(items: readonly any[]) {
  return new Set(items.map((item) => item.id)).size;
}

export function expectEqualItem(l: List, a: any, b: any, keys: string[] = []) {
  assert.notEqual(a, null);
  if ('id' in b) assert.equal(a.id, b.id);
  for (const f of l.fields) {
    if (keys.length && !keys.includes(f.name)) continue;
    const expected = f.expect.read ? a[f.name] : null;
    assert.equal(expected, b[f.name]);
  }
}

export function expectEqualItems(
  l: List,
  a: readonly any[],
  b: any[],
  keys: string[] = [],
  sort = true
) {
  assert.notEqual(a, null);
  assert.equal(a.length, b.length);
  const sortFn = (x: any, y: any) => x.id.localeCompare(y.id);
  const sortedA = sort ? [...a].sort(sortFn) : a;
  const sortedB = sort ? [...b].sort(sortFn) : b;
  sortedA.forEach((xa, i) => expectEqualItem(l, xa, sortedB[i], keys));
}

export function makeWhereUniqueFilter(fields: Field[], seeded: any) {
  return Object.fromEntries(fields.map((f) => [f.name, seeded[f.name]]));
}

export function makeWhereFilter(
  fields: Field[],
  seeded: Record<string, any> | Record<string, any>[]
) {
  if (Array.isArray(seeded)) {
    return { OR: seeded.map((s) => makeWhereFilter(fields, s)) };
  }
  return Object.fromEntries(
    fields.map((f) => [f.name, { equals: seeded[f.name] }])
  );
}

export function makeWhereAndFilter(
  fields: Field[],
  seeded: Record<string, any> | Record<string, any>[]
) {
  if (Array.isArray(seeded)) {
    return { OR: seeded.map((s) => makeWhereAndFilter(fields, s)) };
  }
  return {
    AND: fields.map((f) => ({
      [f.name]: { equals: seeded[f.name] },
    })),
  };
}

export function makeFieldEntry({
  access,
  unique,
}: {
  access: {
    read: boolean;
    create: boolean;
    update: boolean;
    filterable: boolean;
  };
  unique: boolean;
}) {
  const name = `Field_${makeName({ ...access, unique })}` as const;
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
  } as const;
}

export function allowFilter() {
  return { id: { not: null } };
}
export function denyFilter() {
  return { id: { equals: 'never' } };
}

export type Field = ReturnType<typeof makeFieldEntry>;
export type List = ReturnType<typeof makeList> extends Generator<infer T, any, any>
  ? T
  : never;

function operationList({
  suffix,
  access,
  fields,
}: {
  suffix: string;
  access: {
    query: boolean;
    create: boolean;
    update: boolean;
    delete: boolean;
  };
  fields: Field[];
}) {
  const name = `List_operation_${suffix}`;
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
    graphql: { plural: `${name}s` },
  } as const;
}

function itemList({
  suffix,
  access,
  fields,
}: {
  suffix: string;
  access: {
    query: boolean;
    create: boolean;
    update: boolean;
    delete: boolean;
  };
  fields: Field[];
}) {
  const name = `List_item_${suffix}`;
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
    graphql: { plural: `${name}s` },
  } as const;
}

function filterBList({
  suffix,
  access,
  fields,
}: {
  suffix: string;
  access: {
    query: boolean;
    create: boolean;
    update: boolean;
    delete: boolean;
  };
  fields: Field[];
}) {
  const name = `List_filterb_${suffix}`;
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
    graphql: { plural: `${name}s` },
  } as const;
}

function filterList({
  suffix,
  access,
  fields,
}: {
  suffix: string;
  access: {
    query: boolean;
    create: boolean;
    update: boolean;
    delete: boolean;
  };
  fields: Field[];
}) {
  const name = `List_filter_${suffix}`;
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
      item: { create: allowAll, update: allowAll, delete: allowAll },
    },
    fields,
    graphql: { plural: `${name}s` },
  } as const;
}

export function* makeList({
  prefix = '',
  access,
  fields,
}: {
  prefix?: string;
  access: {
    query: boolean;
    create: boolean;
    update: boolean;
    delete: boolean;
  };
  fields: Field[];
}) {
  const suffix = `${prefix}${makeName(access)}`;
  yield operationList({ suffix, access, fields });

  const needItem = [access.create, access.update, access.delete].includes(false);
  if (needItem) yield itemList({ suffix, access, fields });

  const needFilter = [access.query, access.update, access.delete].includes(false);
  if (needFilter) {
    yield filterBList({ suffix, access, fields });
    yield filterList({ suffix, access, fields });
  }
}

export function randomCount() {
  return 6;
}
export function randomString() {
  return `foo-${randomUUID()}`;
}
export async function seed(l: List, context: any) {
  const data = Object.fromEntries(l.fields.map((f) => [f.name, randomString()]));
  return (await context.sudo().db[l.name].createOne({ data })) as Record<string, any>;
}
export async function seedMany(l: List, context: any) {
  const data = Array.from({ length: randomCount() }, () =>
    Object.fromEntries(l.fields.map((f) => [f.name, randomString()]))
  );
  return (await context.sudo().db[l.name].createMany({ data })) as Record<string, any>[];
}
export function makeItem(
  l: { fields: Field[] },
  operation: 'create' | 'update'
) {
  return Object.fromEntries(
    l.fields.filter((f) => f.expect[operation]).map((f) => [f.name, randomString()])
  );
}

function generateFields(): Field[] {
  const bools = [false, true];
  const combos: Field[] = [];
  for (const read of bools) {
    for (const create of bools) {
      for (const update of bools) {
        for (const filterable of bools) {
          combos.push(
            makeFieldEntry({
              access: { read, create, update, filterable },
              unique: false,
            })
          );
        }
      }
    }
  }
  return combos;
}

function generateFieldsUnique(base: Field[]): Field[] {
  const bools = [false, true];
  const extra: Field[] = [];
  for (const read of bools) {
    for (const create of [true]) {
      for (const update of bools) {
        for (const filterable of bools) {
          extra.push(
            makeFieldEntry({
              access: { read, create, update, filterable },
              unique: true,
            })
          );
        }
      }
    }
  }
  return [...base, ...extra];
}

function cartesian<T>(...arrays: T[][]): T[][] {
  return arrays.reduce<T[][]>(
    (acc, arr) => acc.flatMap((a) => arr.map((b) => [...a, b])),
    [[]]
  );
}

export const lists = (() => {
  const fields = generateFields();
  const fieldsUnique = generateFieldsUnique(fields);
  const bools = [false, true];
  const combos = cartesian<bool>(bools, bools, bools, bools);
  const result: ReturnType<typeof makeList>[] = [];
  for (const [query, create, update, del] of combos) {
    result.push(
      ...makeList({
        access: { query, create, update, delete: del },
        fields,
      })
    );
    result.push(
      ...makeList({
        prefix: 'UNIQUE_',
        access: { query, create, update, delete: del },
        fields: fieldsUnique,
      })
    );
  }
  return result;
})();

export const config = {
  lists: Object.fromEntries(
    lists.map((l) => [
      l.name,
      list({
        ...l,
        fields: Object.fromEntries(
          l.fields.map(({ name, expect, ...f }) => [name, text(f)])
        ),
      }),
    ])
  ),
};