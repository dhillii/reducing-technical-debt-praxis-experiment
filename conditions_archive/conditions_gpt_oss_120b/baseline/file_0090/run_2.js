import type { DocumentFeatures } from '../../views-shared';
import type { DocumentFeaturesForNormalization } from '../document-features-normalization';
import { type Mark, assert } from '../utils';
import type { ComponentSchema, ChildField } from './api-shared';
import { getKeysForArrayValue, setKeysForArrayValue } from './preview-props';

type PathToChildFieldWithOption = { path: ReadonlyPropPath; options: ChildField['options'] };

export function findChildPropPathsForProp(
  value: any,
  schema: ComponentSchema,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  if (schema.kind === 'form' || schema.kind === 'relationship') return [];

  if (schema.kind === 'child') {
    return [{ path, options: schema.options }];
  }

  if (schema.kind === 'conditional') {
    const childSchema = schema.values[value.discriminant];
    return findChildPropPathsForProp(value.value, childSchema, [...path, 'value']);
  }

  if (schema.kind === 'object') {
    return Object.entries(schema.fields).flatMap(([key, childSchema]) =>
      findChildPropPathsForProp(value[key], childSchema, [...path, key])
    );
  }

  // schema.kind === 'array'
  return (value as any[]).flatMap((item, idx) =>
    findChildPropPathsForProp(item, schema.element, [...path, idx])
  );
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

export function getDocumentFeaturesForChildField(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): DocumentFeaturesForChildField {
  const inlineMarksFromOptions = options.formatting?.inlineMarks;
  const inlineMarks =
    inlineMarksFromOptions === 'inherit'
      ? 'inherit'
      : (Object.fromEntries(
          Object.keys(editorDocumentFeatures.formatting.inlineMarks).map(mark => [
            mark as Mark,
            !!(inlineMarksFromOptions || {})[mark as Mark],
          ])
        ) as Record<Mark, boolean>);

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

  return {
    kind: 'block',
    inlineMarks,
    softBreaks: options.formatting?.softBreaks === 'inherit',
    documentFeatures: {
      layouts: [],
      dividers:
        options.dividers === 'inherit' ? editorDocumentFeatures.dividers : false,
      formatting: {
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
      },
      links: options.links === 'inherit',
      relationships: options.relationships === 'inherit',
    },
    componentBlocks: options.componentBlocks === 'inherit',
  };
}

function getSchemaAtPropPathInner(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
): undefined | ComponentSchema {
  if (path.length === 0) return schema;
  if (schema.kind === 'child' || schema.kind === 'form' || schema.kind === 'relationship')
    return undefined;

  const [key, ...rest] = path;

  if (schema.kind === 'conditional') {
    if (key === 'discriminant')
      return getSchemaAtPropPathInner(rest, (value as any).discriminant, schema.discriminant);
    if (key === 'value')
      return getSchemaAtPropPathInner(
        rest,
        (value as any).value,
        schema.values[(value as any).discriminant]
      );
    return undefined;
  }

  if (schema.kind === 'object')
    return getSchemaAtPropPathInner(rest, (value as any)[key], schema.fields[key]);

  // schema.kind === 'array'
  return getSchemaAtPropPathInner(rest, (value as any)[key], schema.element);
}

export function getSchemaAtPropPath(
  path: ReadonlyPropPath,
  value: Record<string, unknown>,
  props: Record<string, ComponentSchema>
): undefined | ComponentSchema {
  return getSchemaAtPropPathInner([...path], value, { kind: 'object', fields: props });
}

export function clientSideValidateProp(schema: ComponentSchema, value: unknown): boolean {
  if (schema.kind === 'child' || schema.kind === 'relationship') return true;
  if (schema.kind === 'form') return schema.validate(value);
  if (typeof value !== 'object' || value === null) return false;

  if (schema.kind === 'conditional') {
    if (!('discriminant' in value) || !('value' in value)) return false;
    if (!schema.discriminant.validate((value as any).discriminant)) return false;
    const childSchema = schema.values[(value as any).discriminant as string];
    return clientSideValidateProp(childSchema, (value as any).value);
  }

  if (schema.kind === 'object') {
    return Object.entries(schema.fields).every(
      ([key, childSchema]) => clientSideValidateProp(childSchema, (value as any)[key])
    );
  }

  // schema.kind === 'array'
  return Array.isArray(value) && value.every(item => clientSideValidateProp(schema.element, item));
}

export function getAncestorSchemas(
  rootSchema: ComponentSchema,
  path: ReadonlyPropPath,
  value: unknown
) {
  const ancestors: ComponentSchema[] = [];
  const remainingPath = [...path];
  let currentSchema = rootSchema;
  let currentValue = value;

  while (remainingPath.length) {
    ancestors.push(currentSchema);
    const key = remainingPath.shift()!;

    if (currentSchema.kind === 'array') {
      currentSchema = currentSchema.element;
      currentValue = (currentValue as any)[key];
    } else if (currentSchema.kind === 'conditional') {
      currentSchema = currentSchema.values[(value as any).discriminant];
      currentValue = (currentValue as any).value;
    } else if (currentSchema.kind === 'object') {
      currentSchema = currentSchema.fields[key];
      currentValue = (currentValue as any)[key];
    } else {
      throw new Error(`unexpected prop "${key}"`);
    }
  }

  return ancestors;
}

export type ReadonlyPropPath = readonly (string | number)[];

export function getValueAtPropPath(value: unknown, inputPath: ReadonlyPropPath) {
  let result = value;
  for (const key of inputPath) {
    result = (result as any)[key];
  }
  return result;
}

export function traverseProps(
  schema: ComponentSchema,
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath = []
) {
  if (schema.kind === 'form' || schema.kind === 'relationship' || schema.kind === 'child') {
    visitor(schema, value, path);
    return;
  }

  if (schema.kind === 'object') {
    for (const [key, child] of Object.entries(schema.fields)) {
      traverseProps(child, (value as any)[key], visitor, [...path, key]);
    }
    visitor(schema, value, path);
    return;
  }

  if (schema.kind === 'array') {
    (value as unknown[]).forEach((item, idx) => {
      traverseProps(schema.element, item, visitor, [...path, idx]);
    });
    visitor(schema, value, path);
    return;
  }

  // schema.kind === 'conditional'
  const discriminant = (value as any).discriminant;
  visitor(schema, discriminant, [...path, 'discriminant']);
  traverseProps(
    schema.values[discriminant.toString()],
    (value as any).value,
    visitor,
    [...path, 'value']
  );
  visitor(schema, value, path);
}

export function replaceValueAtPropPath(
  schema: ComponentSchema,
  value: unknown,
  newValue: unknown,
  path: ReadonlyPropPath
): unknown {
  if (path.length === 0) return newValue;

  const [key, ...rest] = path;

  if (schema.kind === 'object') {
    return {
      ...(value as any),
      [key]: replaceValueAtPropPath(schema.fields[key], (value as any)[key], newValue, rest),
    };
  }

  if (schema.kind === 'conditional') {
    const cond = value as { discriminant: string | boolean; value: unknown };
    assert(key === 'value');
    return {
      discriminant: cond.discriminant,
      value: replaceValueAtPropPath(schema.values[key], cond.value, newValue, rest),
    };
  }

  if (schema.kind === 'array') {
    const arr = [...(value as unknown[])];
    setKeysForArrayValue(arr, getKeysForArrayValue(value as unknown[]));
    arr[key as number] = replaceValueAtPropPath(schema.element, arr[key as number], newValue, rest);
    return arr;
  }

  assert(schema.kind !== 'form' && schema.kind !== 'relationship' && schema.kind !== 'child');
  return assertNever(schema);
}

export function getPlaceholderTextForPropPath(
  propPath: ReadonlyPropPath,
  fields: Record<string, ComponentSchema>,
  formProps: Record<string, any>
): string {
  const field = getSchemaAtPropPath(propPath, formProps, fields);
  return field?.kind === 'child' ? field.options.placeholder : '';
}