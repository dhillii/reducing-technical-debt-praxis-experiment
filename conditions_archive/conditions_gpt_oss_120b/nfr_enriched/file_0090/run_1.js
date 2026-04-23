import type { DocumentFeatures } from '../../views-shared'
import type { DocumentFeaturesForNormalization } from '../document-features-normalization'
import { type Mark, assert } from '../utils'
import type { ComponentSchema, ChildField } from './api-shared'
import { getKeysForArrayValue, setKeysForArrayValue } from './preview-props'

type PathToChildFieldWithOption = { path: ReadonlyPropPath; options: ChildField['options'] }

export function findChildPropPathsForProp(
  value: any,
  schema: ComponentSchema,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  switch (schema.kind) {
    case 'form':
    case 'relationship':
      return []
    case 'child':
      return [{ path, options: schema.options }]
    case 'conditional':
      return findChildPropPathsForConditional(value, schema, path)
    case 'object':
      return findChildPropPathsForObject(value, schema, path)
    case 'array':
      return findChildPropPathsForArray(value, schema, path)
  }
}

/** Handles conditional schemas for child‑prop path extraction. */
function findChildPropPathsForConditional(
  value: any,
  schema: Extract<ComponentSchema, { kind: 'conditional' }>,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  return findChildPropPathsForProp(
    value.value,
    schema.values[value.discriminant],
    path.concat('value')
  )
}

/** Handles object schemas for child‑prop path extraction. */
function findChildPropPathsForObject(
  value: any,
  schema: Extract<ComponentSchema, { kind: 'object' }>,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  const paths: PathToChildFieldWithOption[] = []
  Object.keys(schema.fields).forEach(key => {
    paths.push(
      ...findChildPropPathsForProp(value[key], schema.fields[key], path.concat(key))
    )
  })
  return paths
}

/** Handles array schemas for child‑prop path extraction. */
function findChildPropPathsForArray(
  value: any,
  schema: Extract<ComponentSchema, { kind: 'array' }>,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  const paths: PathToChildFieldWithOption[] = []
  ;(value as any[]).forEach((val, i) => {
    paths.push(...findChildPropPathsForProp(val, schema.element, path.concat(i)))
  })
  return paths
}

export function findChildPropPaths(
  value: Record<string, any>,
  props: Record<string, ComponentSchema>
): { path: ReadonlyPropPath | undefined; options: ChildField['options'] }[] {
  const propPaths = findChildPropPathsForProp(value, { kind: 'object', fields: props }, [])
  if (propPaths.length) return propPaths
  return [{ path: undefined, options: { kind: 'inline', placeholder: '' } }]
}

export function assertNever(arg: never): never {
  throw new Error('expected to never be called but received: ' + JSON.stringify(arg))
}

export type DocumentFeaturesForChildField =
  | {
      kind: 'inline'
      inlineMarks: 'inherit' | DocumentFeatures['formatting']['inlineMarks']
      documentFeatures: { links: boolean; relationships: boolean }
      softBreaks: boolean
    }
  | {
      kind: 'block'
      inlineMarks: 'inherit' | DocumentFeatures['formatting']['inlineMarks']
      softBreaks: boolean
      componentBlocks: boolean
      documentFeatures: DocumentFeaturesForNormalization
    }

export function getDocumentFeaturesForChildField(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): DocumentFeaturesForChildField {
  const inlineMarks = computeInlineMarks(editorDocumentFeatures, options)
  if (options.kind === 'inline') {
    return buildInlineFeatures(inlineMarks, options)
  }
  return buildBlockFeatures(editorDocumentFeatures, inlineMarks, options)
}

/** Compute inline marks respecting inheritance. */
function computeInlineMarks(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): 'inherit' | Record<Mark, boolean> {
  const inlineMarksFromOptions = options.formatting?.inlineMarks
  if (inlineMarksFromOptions === 'inherit') {
    return 'inherit'
  }
  return Object.fromEntries(
    Object.keys(editorDocumentFeatures.formatting.inlineMarks).map(mark => [
      mark as Mark,
      !!(inlineMarksFromOptions || {})[mark as Mark],
    ])
  ) as Record<Mark, boolean>
}

/** Build the feature object for inline child fields. */
function buildInlineFeatures(
  inlineMarks: 'inherit' | Record<Mark, boolean>,
  options: ChildField['options']
) {
  return {
    kind: 'inline' as const,
    inlineMarks,
    documentFeatures: {
      links: options.links === 'inherit',
      relationships: options.relationships === 'inherit',
    },
    softBreaks: options.formatting?.softBreaks === 'inherit',
  }
}

/** Build the feature object for block child fields. */
function buildBlockFeatures(
  editorDocumentFeatures: DocumentFeatures,
  inlineMarks: 'inherit' | Record<Mark, boolean>,
  options: ChildField['options']
) {
  const formatting = buildFormatting(editorDocumentFeatures, options)
  return {
    kind: 'block' as const,
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
  }
}

/** Resolve formatting options for block child fields. */
function buildFormatting(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
) {
  return {
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
  }
}

function getSchemaAtPropPathInner(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
): undefined | ComponentSchema {
  if (path.length === 0) return schema
  if (schema.kind === 'child' || schema.kind === 'form' || schema.kind === 'relationship')
    return undefined

  switch (schema.kind) {
    case 'conditional':
      return resolveConditionalPath(path, value, schema)
    case 'object':
      return resolveObjectPath(path, value, schema)
    case 'array':
      return resolveArrayPath(path, value, schema)
  }
  assertNever(schema)
}

/** Resolve a path inside a conditional schema. */
function resolveConditionalPath(
  path: (string | number)[],
  value: unknown,
  schema: Extract<ComponentSchema, { kind: 'conditional' }>
) {
  const key = path.shift()
  if (key === 'discriminant')
    return getSchemaAtPropPathInner(path, (value as any).discriminant, schema.discriminant)
  if (key === 'value') {
    const innerSchema = schema.values[(value as any).discriminant]
    return getSchemaAtPropPathInner(path, (value as any).value, innerSchema)
  }
  return undefined
}

/** Resolve a path inside an object schema. */
function resolveObjectPath(
  path: (string | number)[],
  value: unknown,
  schema: Extract<ComponentSchema, { kind: 'object' }>
) {
  const key = path.shift()!
  return getSchemaAtPropPathInner(path, (value as any)[key], schema.fields[key])
}

/** Resolve a path inside an array schema. */
function resolveArrayPath(
  path: (string | number)[],
  value: unknown,
  schema: Extract<ComponentSchema, { kind: 'array' }>
) {
  const index = path.shift()!
  return getSchemaAtPropPathInner(path, (value as any)[index], schema.element)
}

export function getSchemaAtPropPath(
  path: ReadonlyPropPath,
  value: Record<string, unknown>,
  props: Record<string, ComponentSchema>
): undefined | ComponentSchema {
  return getSchemaAtPropPathInner([...path], value, { kind: 'object', fields: props })
}

/** Validate a value against a component schema on the client side. */
export function clientSideValidateProp(schema: ComponentSchema, value: unknown): boolean {
  if (schema.kind === 'child' || schema.kind === 'relationship') return true
  if (schema.kind === 'form') return schema.validate(value)
  if (typeof value !== 'object' || value === null) return false

  switch (schema.kind) {
    case 'conditional':
      return validateConditional(schema, value as any)
    case 'object':
      return validateObject(schema, value as any)
    case 'array':
      return validateArray(schema, value as any)
  }
}

/** Validate a conditional schema. */
function validateConditional(
  schema: Extract<ComponentSchema, { kind: 'conditional' }>,
  value: { discriminant: unknown; value: unknown }
) {
  if (!('discriminant' in value) || !('value' in value)) return false
  if (!schema.discriminant.validate(value.discriminant)) return false
  const innerSchema = schema.values[value.discriminant as string]
  return clientSideValidateProp(innerSchema, value.value)
}

/** Validate an object schema. */
function validateObject(
  schema: Extract<ComponentSchema, { kind: 'object' }>,
  value: Record<string, unknown>
) {
  for (const [key, child] of Object.entries(schema.fields)) {
    if (!clientSideValidateProp(child, (value as any)[key])) return false
  }
  return true
}

/** Validate an array schema. */
function validateArray(
  schema: Extract<ComponentSchema, { kind: 'array' }>,
  value: unknown[]
) {
  if (!Array.isArray(value)) return false
  for (const inner of value) {
    if (!clientSideValidateProp(schema.element, inner)) return false
  }
  return true
}

export function getAncestorSchemas(
  rootSchema: ComponentSchema,
  path: ReadonlyPropPath,
  value: unknown
) {
  const ancestors: ComponentSchema[] = []
  const remainingPath = [...path]
  let currentSchema = rootSchema
  let currentValue = value

  while (remainingPath.length) {
    ancestors.push(currentSchema)
    const key = remainingPath.shift()!
    ({ currentSchema, currentValue } = stepIntoSchema(currentSchema, currentValue, key, value))
  }

  return ancestors
}

/** Advance one step into the schema hierarchy based on the current key. */
function stepIntoSchema(
  schema: ComponentSchema,
  currentValue: unknown,
  key: string | number,
  rootValue: unknown
): { currentSchema: ComponentSchema; currentValue: unknown } {
  if (schema.kind === 'array') {
    return {
      currentSchema: schema.element,
      currentValue: (currentValue as any)[key],
    }
  }
  if (schema.kind === 'conditional') {
    return {
      currentSchema: schema.values[(rootValue as any).discriminant],
      currentValue: (currentValue as any).value,
    }
  }
  if (schema.kind === 'object') {
    return {
      currentSchema: schema.fields[key as string],
      currentValue: (currentValue as any)[key],
    }
  }
  if (schema.kind === 'child' || schema.kind === 'form' || schema.kind === 'relationship') {
    throw new Error(`unexpected prop "${key}"`)
  }
  assertNever(schema)
}

/** Retrieve a value from a nested prop path. */
export function getValueAtPropPath(value: unknown, inputPath: ReadonlyPropPath) {
  const path = [...inputPath]
  while (path.length) {
    const key = path.shift()!
    value = (value as any)[key]
  }
  return value
}

/** Traverse a component schema tree, invoking a visitor for each node. */
export function traverseProps(
  schema: ComponentSchema,
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath = []
) {
  if (schema.kind === 'form' || schema.kind === 'relationship' || schema.kind === 'child') {
    visitor(schema, value, path)
    return
  }

  if (schema.kind === 'object') {
    traverseObjectProps(schema, value, visitor, path)
    visitor(schema, value, path)
    return
  }

  if (schema.kind === 'array') {
    traverseArrayProps(schema, value, visitor, path)
    return visitor(schema, value, path)
  }

  if (schema.kind === 'conditional') {
    traverseConditionalProps(schema, value, visitor, path)
    return
  }

  assertNever(schema)
}

/** Helper for traversing object schemas. */
function traverseObjectProps(
  schema: Extract<ComponentSchema, { kind: 'object' }>,
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  basePath: ReadonlyPropPath
) {
  for (const [key, child] of Object.entries(schema.fields)) {
    traverseProps(child, (value as any)[key], visitor, [...basePath, key])
  }
}

/** Helper for traversing array schemas. */
function traverseArrayProps(
  schema: Extract<ComponentSchema, { kind: 'array' }>,
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  basePath: ReadonlyPropPath
) {
  for (const [idx, val] of (value as unknown[]).entries()) {
    traverseProps(schema.element, val, visitor, basePath.concat(idx))
  }
}

/** Helper for traversing conditional schemas. */
function traverseConditionalProps(
  schema: Extract<ComponentSchema, { kind: 'conditional' }>,
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  basePath: ReadonlyPropPath
) {
  const discriminant: string | boolean = (value as any).discriminant
  visitor(schema, discriminant, basePath.concat('discriminant'))
  traverseProps(
    schema.values[discriminant.toString()],
    (value as any).value,
    visitor,
    basePath.concat('value')
  )
  visitor(schema, value, basePath)
}

/** Replace a nested value at the given prop path, returning a new structure. */
export function replaceValueAtPropPath(
  schema: ComponentSchema,
  value: unknown,
  newValue: unknown,
  path: ReadonlyPropPath
): unknown {
  if (path.length === 0) return newValue

  const [key, ...rest] = path

  if (schema.kind === 'object') {
    return {
      ...(value as any),
      [key]: replaceValueAtPropPath(schema.fields[key], (value as any)[key], newValue, rest),
    }
  }

  if (schema.kind === 'conditional') {
    return replaceConditionalValue(schema, value as any, newValue, key, rest)
  }

  if (schema.kind === 'array') {
    return replaceArrayValue(schema, value as unknown[], key as number, newValue, rest)
  }

  assert(schema.kind !== 'form' && schema.kind !== 'relationship' && schema.kind !== 'child')
  assertNever(schema)
}

/** Replace a value inside a conditional schema (only the `value` branch). */
function replaceConditionalValue(
  schema: Extract<ComponentSchema, { kind: 'conditional' }>,
  current: { discriminant: string | boolean; value: unknown },
  newValue: unknown,
  key: string | number,
  rest: ReadonlyPropPath
) {
  assert(key === 'value')
  return {
    discriminant: current.discriminant,
    value: replaceValueAtPropPath(schema.values[key as any], current.value, newValue, rest),
  }
}

/** Replace a value inside an array schema, preserving array keys. */
function replaceArrayValue(
  schema: Extract<ComponentSchema, { kind: 'array' }>,
  arr: unknown[],
  index: number,
  newValue: unknown,
  rest: ReadonlyPropPath
) {
  const copy = [...arr]
  setKeysForArrayValue(copy, getKeysForArrayValue(arr))
  copy[index] = replaceValueAtPropPath(schema.element, copy[index], newValue, rest)
  return copy
}

export function getPlaceholderTextForPropPath(
  propPath: ReadonlyPropPath,
  fields: Record<string, ComponentSchema>,
  formProps: Record<string, any>
): string {
  const field = getSchemaAtPropPath(propPath, formProps, fields)
  return field?.kind === 'child' ? field.options.placeholder : ''
}

export type ReadonlyPropPath = readonly (string | number)[]