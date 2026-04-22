import type { DocumentFeatures } from '../../views-shared';
import type { DocumentFeaturesForNormalization } from '../document-features-normalization';
import { type Mark, assert } from '../utils';
import type { ComponentSchema, ChildField } from './api-shared';
import { getKeysForArrayValue, setKeysForArrayValue } from './preview-props';

type PathToChildFieldWithOption = { path: ReadonlyPropPath; options: ChildField['options'] };

type SchemaHandler<T, R> = (schema: T, ...args: any[]) => R;

const childPropPathHandlers: Record<
  ComponentSchema['kind'],
  SchemaHandler<ComponentSchema, PathToChildFieldWithOption[]>
> = {
  form: () => [],
  relationship: () => [],
  child: (schema: Extract<ComponentSchema, { kind: 'child' }>, _value: any, path: ReadonlyPropPath) => [
    { path, options: schema.options },
  ],
  conditional: (
    schema: Extract<ComponentSchema, { kind: 'conditional' }>,
    value: any,
    path: ReadonlyPropPath
  ) => {
    return findChildPropPathsForProp(
      value.value,
      schema.values[value.discriminant],
      path.concat('value')
    );
  },
  object: (
    schema: Extract<ComponentSchema, { kind: 'object' }>,
    value: any,
    path: ReadonlyPropPath
  ) => {
    const paths: PathToChildFieldWithOption[] = [];
    Object.entries(schema.fields).forEach(([key, childSchema]) => {
      paths.push(
        ...findChildPropPathsForProp(value[key], childSchema, path.concat(key))
      );
    });
    return paths;
  },
  array: (
    schema: Extract<ComponentSchema, { kind: 'array' }>,
    value: any[],
    path: ReadonlyPropPath
  ) => {
    const paths: PathToChildFieldWithOption[] = [];
    value.forEach((val, i) => {
      paths.push(...findChildPropPathsForProp(val, schema.element, path.concat(i)));
    });
    return paths;
  },
} as const;

export function findChildPropPathsForProp(
  value: any,
  schema: ComponentSchema,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  return childPropPathHandlers[schema.kind](schema, value, path);
}

export function findChildPropPaths(
  value: Record<string, any>,
  props: Record<string, ComponentSchema>
): { path: ReadonlyPropPath | undefined; options: ChildField['options'] }[] {
  const propPaths = findChildPropPathsForProp(value, { kind: 'object', fields: props }, []);
  if (propPaths.length) return propPaths;
  return [{ path: undefined, options: { kind: 'inline', placeholder: '' } }];
}

export function assertNever(arg: never): never {
  throw new Error('expected to never be called but received: ' + JSON.stringify(arg));
}

/** Document features for a child field */
export type DocumentFeaturesForChildField =
  | {
      kind: 'inline';
      inlineMarks: 'inherit' | DocumentFeatures['formatting']['inlineMarks'];
      documentFeatures: { links: boolean; relationships: boolean };
      softBreaks: boolean;
    }
  | {
      kind: 'block';
      inlineMarks: 'inherit' | DocumentFeatures['formatting']['inlineMarks'];
      softBreaks: boolean;
      componentBlocks: boolean;
      documentFeatures: DocumentFeaturesForNormalization;
    };

function computeInlineMarks(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
) {
  const fromOptions = options.formatting?.inlineMarks;
  if (fromOptions === 'inherit') return 'inherit';
  const marks = Object.fromEntries(
    Object.keys(editorDocumentFeatures.formatting.inlineMarks).map((mark) => [
      mark as Mark,
      !!(fromOptions || {})[mark as Mark],
    ])
  );
  return marks as Record<Mark, boolean>;
}

export function getDocumentFeaturesForChildField(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): DocumentFeaturesForChildField {
  const inlineMarks = computeInlineMarks(editorDocumentFeatures, options);
  if (options.kind === 'inline') {
    return {
      kind: 'inline',
      inlineMarks,
      documentFeatures: {
        links: options.links === 'inherit',
        relationships: options.relationships === 'inherit',
      },
      softBreaks: options.formatting?.softBreaks === 'inherit',
    };
  }

  const formatting = {
    alignment:
      options.formatting?.alignment === 'inherit'
        ? editorDocumentFeatures.formatting.alignment
        : { center: false, end: false },
    blockTypes:
      options.formatting?.blockTypes === 'inherit'
        ? editorDocumentFeatures.formatting.blockTypes
        : { blockquote: false, code: false },
    headingLevels:
      options.formatting?.headingLevels === 'inherit'
        ? editorDocumentFeatures.formatting.headingLevels
        : options.formatting?.headingLevels || [],
    listTypes:
      options.formatting?.listTypes === 'inherit'
        ? editorDocumentFeatures.formatting.listTypes
        : { ordered: false, unordered: false },
  };

  return {
    kind: 'block',
    inlineMarks,
    softBreaks: options.formatting?.softBreaks === 'inherit',
    documentFeatures: {
      layouts: [],
      dividers:
        options.dividers === 'inherit' ? editorDocumentFeatures.dividers : false,
      formatting,
      links: options.links === 'inherit',
      relationships: options.relationships === 'inherit',
    },
    componentBlocks: options.componentBlocks === 'inherit',
  };
}

/** Dispatch helpers for schema navigation */
const schemaAtPathHandlers: Record<
  ComponentSchema['kind'],
  SchemaHandler<ComponentSchema, ComponentSchema | undefined>
> = {
  child: () => undefined,
  form: () => undefined,
  relationship: () => undefined,
  conditional: (
    schema: Extract<ComponentSchema, { kind: 'conditional' }>,
    value: any,
    path: (string | number)[]
  ) => {
    const key = path.shift();
    if (key === 'discriminant')
      return getSchemaAtPropPathInner(
        path,
        value.discriminant,
        schema.discriminant
      );
    if (key === 'value') {
      const subSchema = schema.values[value.discriminant];
      return getSchemaAtPropPathInner(path, value.value, subSchema);
    }
    return undefined;
  },
  object: (
    schema: Extract<ComponentSchema, { kind: 'object' }>,
    value: any,
    path: (string | number)[]
  ) => {
    const key = path.shift() as string;
    return getSchemaAtPropPathInner(path, value[key], schema.fields[key]);
  },
  array: (
    schema: Extract<ComponentSchema, { kind: 'array' }>,
    value: any,
    path: (string | number)[]
  ) => {
    const index = path.shift() as number;
    return getSchemaAtPropPathInner(path, value[index], schema.element);
  },
} as const;

function getSchemaAtPropPathInner(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
): ComponentSchema | undefined {
  if (path.length === 0) return schema;
  if (schema.kind === 'child' || schema.kind === 'form' || schema.kind === 'relationship')
    return undefined;
  return schemaAtPathHandlers[schema.kind](schema, value, path);
}

export function getSchemaAtPropPath(
  path: ReadonlyPropPath,
  value: Record<string, unknown>,
  props: Record<string, ComponentSchema>
): ComponentSchema | undefined {
  return getSchemaAtPropPathInner([...path], value, { kind: 'object', fields: props });
}

/** Validation dispatch */
const validatorHandlers: Record<
  ComponentSchema['kind'],
  SchemaHandler<ComponentSchema, boolean>
> = {
  child: () => true,
  relationship: () => true,
  form: (schema: Extract<ComponentSchema, { kind: 'form' }>, value: unknown) =>
    schema.validate(value),
  conditional: (
    schema: Extract<ComponentSchema, { kind: 'conditional' }>,
    value: any
  ) => {
    if (!('discriminant' in value) || !('value' in value)) return false;
    if (!schema.discriminant.validate(value.discriminant)) return false;
    const subSchema = schema.values[value.discriminant as string];
    return clientSideValidateProp(subSchema, value.value);
  },
  object: (
    schema: Extract<ComponentSchema, { kind: 'object' }>,
    value: any
  ) => {
    for (const [key, child] of Object.entries(schema.fields)) {
      if (!clientSideValidateProp(child, value[key])) return false;
    }
    return true;
  },
  array: (
    schema: Extract<ComponentSchema, { kind: 'array' }>,
    value: any
  ) => {
    if (!Array.isArray(value)) return false;
    for (const inner of value) {
      if (!clientSideValidateProp(schema.element, inner)) return false;
    }
    return true;
  },
} as const;

export function clientSideValidateProp(schema: ComponentSchema, value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return schema.kind === 'form' ? validatorHandlers.form(schema, value) : false;
  }
  return validatorHandlers[schema.kind](schema, value);
}

/** Ancestor collection */
export function getAncestorSchemas(
  rootSchema: ComponentSchema,
  path: ReadonlyPropPath,
  value: unknown
): ComponentSchema[] {
  const ancestors: ComponentSchema[] = [];
  const remaining = [...path];
  let currentSchema = rootSchema;
  let currentValue = value;

  while (remaining.length) {
    ancestors.push(currentSchema);
    const key = remaining.shift()!;
    switch (currentSchema.kind) {
      case 'array':
        currentSchema = currentSchema.element;
        currentValue = (currentValue as any)[key];
        break;
      case 'conditional':
        currentSchema = currentSchema.values[(value as any).discriminant];
        currentValue = (currentValue as any).value;
        break;
      case 'object':
        currentSchema = currentSchema.fields[key as string];
        currentValue = (currentValue as any)[key];
        break;
      case 'child':
      case 'form':
      case 'relationship':
        throw new Error(`unexpected prop "${key}"`);
      default:
        assertNever(currentSchema);
    }
  }
  return ancestors;
}

/** Path utilities */
export type ReadonlyPropPath = readonly (string | number)[];

export function getValueAtPropPath(value: unknown, inputPath: ReadonlyPropPath) {
  let result = value;
  const path = [...inputPath];
  while (path.length) {
    const key = path.shift()!;
    result = (result as any)[key];
  }
  return result;
}

/** Traversal dispatch */
const traverseHandlers: Record<
  ComponentSchema['kind'],
  SchemaHandler<ComponentSchema, void>
> = {
  form: (schema, value, path, visitor) => visitor(schema, value, path),
  relationship: (schema, value, path, visitor) => visitor(schema, value, path),
  child: (schema, value, path, visitor) => visitor(schema, value, path),
  object: (schema, value, path, visitor) => {
    Object.entries(schema.fields).forEach(([key, child]) => {
      traverseProps(child, (value as any)[key], visitor, [...path, key]);
    });
    visitor(schema, value, path);
  },
  array: (schema, value, path, visitor) => {
    (value as unknown[]).forEach((val, idx) => {
      traverseProps(schema.element, val, visitor, path.concat(idx));
    });
    visitor(schema, value, path);
  },
  conditional: (schema, value, path, visitor) => {
    const discriminant = (value as any).discriminant;
    visitor(schema, discriminant, path.concat('discriminant'));
    traverseProps(
      schema.values[discriminant.toString()],
      (value as any).value,
      visitor,
      path.concat('value')
    );
    visitor(schema, value, path);
  },
} as const;

export function traverseProps(
  schema: ComponentSchema,
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath = []
) {
  traverseHandlers[schema.kind](schema, value, path, visitor);
}

/** Replacement dispatch */
const replaceHandlers: Record<
  ComponentSchema['kind'],
  SchemaHandler<ComponentSchema, unknown>
> = {
  object: (schema, value, newValue, path) => {
    const [key, ...rest] = path;
    return {
      ...(value as any),
      [key]: replaceValueAtPropPath(
        schema.fields[key as string],
        (value as any)[key],
        newValue,
        rest
      ),
    };
  },
  conditional: (schema, value, newValue, path) => {
    const [key, ...rest] = path;
    assert(key === 'value');
    const cond = value as { discriminant: string | boolean; value: unknown };
    return {
      discriminant: cond.discriminant,
      value: replaceValueAtPropPath(
        schema.values[key],
        cond.value,
        newValue,
        rest
      ),
    };
  },
  array: (schema, value, newValue, path) => {
    const [key, ...rest] = path;
    const prev = value as unknown[];
    const copy = [...prev];
    setKeysForArrayValue(copy, getKeysForArrayValue(prev));
    copy[key as number] = replaceValueAtPropPath(
      schema.element,
      copy[key as number],
      newValue,
      rest
    );
    return copy;
  },
  form: () => assertNever('form' as never),
  relationship: () => assertNever('relationship' as never),
  child: () => assertNever('child' as never),
} as const;

export function replaceValueAtPropPath(
  schema: ComponentSchema,
  value: unknown,
  newValue: unknown,
  path: ReadonlyPropPath
): unknown {
  if (path.length === 0) return newValue;
  return replaceHandlers[schema.kind](schema, value, newValue, path);
}

/** Placeholder extraction */
export function getPlaceholderTextForPropPath(
  propPath: ReadonlyPropPath,
  fields: Record<string, ComponentSchema>,
  formProps: Record<string, any>
): string {
  const field = getSchemaAtPropPath(propPath, formProps, fields);
  return field?.kind === 'child' ? field.options.placeholder : '';
}