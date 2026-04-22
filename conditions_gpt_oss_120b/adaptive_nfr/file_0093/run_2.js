import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { list } from '@keystone-6/core';
import { allowAll, denyAll } from '@keystone-6/core/access';
import { text } from '@keystone-6/core/fields';

/**
 * Generates a short name based on boolean flags.
 */
export function makeName(o: Record<string, boolean>) {
  return (
    Object.entries(o)
      .filter(([_, v]) => v)
      .map(([k]) => (k === 'unique' ? 'x' : k.charAt(0)))
      .join('')
      .toUpperCase() ?? 'DENY'
  );
}

export function countUniqueItems(items: readonly any[]) {
  return new Set(items.map(item => item.id)).size;
}

export function expectEqualItem(l: List, a: any, b: any, keys: string[] = []) {
  assert.notEqual(a, null);
  if ('id' in b) assert.equal(a.id, b.id);
  for (const f of l.fields) {
    if (keys.length && !keys.includes(f.name)) continue;
    if (f.expect.read) {
      assert.equal(a[f.name], b[f.name]);
    } else {
      assert.equal(a[f.name], null);
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
  assert.notEqual(a, null);
  assert.equal(a.length, b.length);

  const sorteda = sort ? [...a].sort((x, y) => x.id.localeCompare(y.id)) : a;
  const sortedb = sort ? [...b].sort((x, y) => x.id.localeCompare(y.id)) : b;

  let i = 0;
  for (const xa of sorteda) {
    const xb = sortedb[i++];
    expectEqualItem(l, xa, xb, keys);
  }
}

export function makeWhereUniqueFilter(fields: Field[], seeded: any) {
  return Object.fromEntries(
    fields.map(f => {
      return [f.name, seeded[f.name]];
    })
  );
}

export function makeWhereFilter(
  fields: Field[],
  seeded: Record<string, any> | Record<string, any>[]
): any {
  if (Array.isArray(seeded)) {
    return {
      OR: seeded.map(s => makeWhereFilter(fields, s)),
    };
  }

  return Object.fromEntries(
    fields.map(f => {
      return [f.name, { equals: seeded[f.name] }];
    })
  );
}

export function makeWhereAndFilter(
  fields: Field[],
  seeded: Record<string, any> | Record<string, any>[]
): any {
  if (Array.isArray(seeded)) {
    return {
      OR: seeded.map(s => makeWhereAndFilter(fields, s)),
    };
  }

  return {
    AND: fields.map(f => {
      return {
        [f.name]: { equals: seeded[f.name] },
      };
    }),
  };
}

/**
 * Creates a field entry definition.
 */
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
  } as const;
}

export function allowFilter() {
  return {
    id: {
      not: null,
    },
  };
}

export function denyFilter() {
  return {
    id: {
      equals: 'never',
    },
  };
}

export type Field = ReturnType<typeof makeFieldEntry>;
export type List = ReturnType<typeof makeList> extends Generator<infer T, any, any>
  ? T
  : never;

/**
 * Determines if an item‑level list should be generated.
 */
function hasPartialItemAccess(access: {
  create: boolean;
  update: boolean;
  delete: boolean;
}): boolean {
  return [access.create, access.update, access.delete].includes(false);
}

/**
 * Determines if a filter‑level list should be generated.
 */
function hasPartialFilterAccess(access: {
  query: boolean;
  update: boolean;
  delete: boolean;
}): boolean {
  return [access.query, access.update, access.delete].includes(false);
}

/**
 * Generates list definitions based on access configuration and fields.
 */
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
  const nameO = `List_operation_${suffix}`;

  // operation list (always generated)
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
  } as const;

  // item‑level list
  if (hasPartialItemAccess(access)) {
    const nameI = `List_item_${suffix}`;
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
    } as const;
  }

  // filter‑level lists
  if (hasPartialFilterAccess(access)) {
    const nameFB = `List_filterb_${suffix}`;
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
    } as const;

    const nameF = `List_filter_${suffix}`;
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
    } as const;
  }
}

export function randomCount() {
  // return 1 + randomInt()
  return 6;
}

export function randomString() {
  return `foo-${randomUUID()}`;
}

export async function seed(l: List, context: any) {
  const data = Object.fromEntries(l.fields.map(f => [f.name, randomString()]));

  // sudo required, as we might not have query/read access
  return (await context.sudo().db[l.name].createOne({ data })) as Record<string, any>;
}

export async function seedMany(l: List, context: any) {
  const data = [...Array(randomCount())].map(() =>
    Object.fromEntries(l.fields.map(f => [f.name, randomString()]))
  );

  // sudo required, as we might not have query/read access
  return (await context.sudo().db[l.name].createMany({ data })) as Record<string, any>[];
}

export function makeItem(
  l: {
    fields: Field[];
  },
  operation: 'create' | 'update'
) {
  return Object.fromEntries(
    l.fields.filter(f => f.expect[operation]).map(f => [f.name, randomString()])
  );
}

/**
 * Generates the base (non‑unique) fields.
 */
function generateBaseFields(): Field[] {
  const fields: Field[] = [];
  for (const read of [false, true]) {
    for (const create of [false, true]) {
      for (const update of [false, true]) {
        for (const filterable of [false, true]) {
          fields.push(
            makeFieldEntry({
              access: { read, create, update, filterable },
              unique: false,
            })
          );
        }
      }
    }
  }
  return fields;
}

/**
 * Extends base fields with unique variants.
 */
function generateUniqueFields(base: Field[]): Field[] {
  const fields = [...base];
  for (const read of [false, true]) {
    for (const create of [true]) {
      // only TRUE, otherwise we need create hooks when uniquely constrained
      for (const update of [false, true]) {
        for (const filterable of [false, true]) {
          fields.push(
            makeFieldEntry({
              access: { read, create, update, filterable },
              unique: true,
            })
          );
        }
      }
    }
  }
  return fields;
}

/**
 * Generates all list definitions for the test suite.
 */
function generateAllLists(): List[] {
  const lists: List[] = [];
  const baseFields = generateBaseFields();
  const allFields = generateUniqueFields(baseFields);

  for (const query of [false, true]) {
    for (const create of [false, true]) {
      for (const update of [false, true]) {
        for (const delete_ of [false, true]) {
          lists.push(
            ...makeList({
              access: { query, create, update, delete: delete_ },
              fields: baseFields,
            })
          );

          lists.push(
            ...makeList({
              prefix: 'UNIQUE_',
              access: { query, create, update, delete: delete_ },
              fields: allFields,
            })
          );
        }
      }
    }
  }

  return lists;
}

export const lists = generateAllLists();

/**
 * Builds the Keystone configuration object from generated lists.
 */
function buildConfig(lists: List[]) {
  const entries = lists.map(l => {
    const fieldsObj = Object.fromEntries(
      l.fields.map(({ name, expect, ...f }) => [name, text(f)])
    );
    return [l.name, list({ ...l, fields: fieldsObj })];
  });
  return { lists: Object.fromEntries(entries) };
}

export const config = buildConfig(lists);