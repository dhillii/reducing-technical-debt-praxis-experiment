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
      return findChildPropPathsForProp(
        value.value,
        schema.values[value.discriminant],
        path.concat('value')
      )
    case 'object':
      return collectChildPathsFromObject(value, schema, path)
    case 'array':
      return collectChildPathsFromArray(value, schema, path)
  }
}

/** Collect child paths from an object schema */
function collectChildPathsFromObject(
  value: Record<string, any>,
  schema: Extract<ComponentSchema, { kind: 'object' }>,
  basePath: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  const paths: PathToChildFieldWithOption[] = []
  Object.keys(schema.fields).forEach(key => {
    paths.push(
      ...findChildPropPathsForProp(value[key], schema.fields[key], basePath.concat(key))
    )
  })
  return paths
}

/** Collect child paths from an array schema */
function collectChildPathsFromArray(
  value: any[],
  schema: Extract<ComponentSchema, { kind: 'array' }>,
  basePath: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  const paths: PathToChildFieldWithOption[] = []
  value.forEach((val, i) => {
    paths.push(...findChildPropPathsForProp(val, schema.element, basePath.concat(i)))
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
      documentFeatures: {
        links: boolean
        relationships: boolean
      }
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
    return {
      kind: 'inline',
      inlineMarks,
      documentFeatures: {
        links: options.links === 'inherit',
        relationships: options.relationships === 'inherit',
      },
      softBreaks: options.formatting?.softBreaks === 'inherit',
    }
  }
  return {
    kind: 'block',
    inlineMarks,
    softBreaks: options.formatting?.softBreaks === 'inherit',
    documentFeatures: computeBlockDocumentFeatures(editorDocumentFeatures, options),
    componentBlocks: options.componentBlocks === 'inherit',
  }
}

/** Compute inline marks based on editor features and field options */
function computeInlineMarks(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): 'inherit' | DocumentFeatures['formatting']['inlineMarks'] {
  const inlineMarksFromOptions = options.formatting?.inlineMarks
  if (inlineMarksFromOptions === 'inherit') {
    return 'inherit'
  }
  const result: Record<Mark, boolean> = {}
  Object.keys(editorDocumentFeatures.formatting.inlineMarks).forEach(mark => {
    result[mark as Mark] = !!(inlineMarksFromOptions || {})[mark as Mark]
  })
  return result as DocumentFeatures['formatting']['inlineMarks']
}

/** Build block‑type document features */
function computeBlockDocumentFeatures(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): DocumentFeaturesForNormalization {
  return {
    layouts: [],
    dividers:
      options.dividers === 'inherit' ? editorDocumentFeatures.dividers : false,
    formatting: {
      alignment: computeAlignment(editorDocumentFeatures, options),
      blockTypes: computeBlockTypes(editorDocumentFeatures, options),
      headingLevels:
        options.formatting?.headingLevels === 'inherit'
          ? editorDocumentFeatures.formatting.headingLevels
          : options.formatting?.headingLevels || [],
      listTypes: computeListTypes(editorDocumentFeatures, options),
    },
    links: options.links === 'inherit',
    relationships: options.relationships === 'inherit',
  }
}

function computeAlignment(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
) {
  return options.formatting?.alignment === 'inherit'
    ? editorDocumentFeatures.formatting.alignment
    : { center: false, end: false }
}

function computeBlockTypes(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
) {
  return options.formatting?.blockTypes === 'inherit'
    ? editorDocumentFeatures.formatting.blockTypes
    : { blockquote: false, code: false }
}

function computeListTypes(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
) {
  return options.formatting?.listTypes === 'inherit'
    ? editorDocumentFeatures.formatting.listTypes
    : { ordered: false, unordered: false }
}

function getSchemaAtPropPathInner(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
): undefined | ComponentSchema {
  if (path.length === 0) return schema
  if (schema.kind === 'child' || schema.kind === 'form' || schema.kind === 'relationship')
    return undefined
  if (schema.kind === 'conditional') return resolveConditionalPath(path, value, schema)
  if (schema.kind === 'object') return resolveObjectPath(path, value, schema)
  if (schema.kind === 'array') return resolveArrayPath(path, value, schema)
  assertNever(schema)
}

/** Resolve a path segment for a conditional schema */
function resolveConditionalPath(
  path: (string | number)[],
  value: unknown,
  schema: Extract<ComponentSchema, { kind: 'conditional' }>
): undefined | ComponentSchema {
  const key = path.shift()
  if (key === 'discriminant')
    return getSchemaAtPropPathInner(path, (value as any).discriminant, schema.discriminant)
  if (key === 'value') {
    const innerSchema = schema.values[(value as any).discriminant]
    return getSchemaAtPropPathInner(path, (value as any).value, innerSchema)
  }
  return undefined
}

/** Resolve a path segment for an object schema */
function resolveObjectPath(
  path: (string | number)[],
  value: unknown,
  schema: Extract<ComponentSchema, { kind: 'object' }>
): undefined | ComponentSchema {
  const key = path.shift()!
  return getSchemaAtPropPathInner(path, (value as any)[key], schema.fields[key])
}

/** Resolve a path segment for an array schema */
function resolveArrayPath(
  path: (string | number)[],
  value: unknown,
  schema: Extract<ComponentSchema, { kind: 'array' }>
): undefined | ComponentSchema {
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

/** Validate a conditional field */
function validateConditional(
  schema: Extract<ComponentSchema, { kind: 'conditional' }>,
  value: { discriminant: any; value: any }
): boolean {
  if (!('discriminant' in value) || !('value' in value)) return false
  if (!schema.discriminant.validate(value.discriminant)) return false
  const innerSchema = schema.values[value.discriminant as string]
  return clientSideValidateProp(innerSchema, value.value)
}

/** Validate an object field */
function validateObject(
  schema: Extract<ComponentSchema, { kind: 'object' }>,
  value: Record<string, any>
): boolean {
  for (const [key, childSchema] of Object.entries(schema.fields)) {
    if (!clientSideValidateProp(childSchema, value[key])) return false
  }
  return true
}

/** Validate an array field */
function validateArray(
  schema: Extract<ComponentSchema, { kind: 'array' }>,
  value: any[]
): boolean {
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
): ComponentSchema[] {
  const ancestors: ComponentSchema[] = []
  const remainingPath = [...path]
  let currentSchema: ComponentSchema = rootSchema
  let currentValue: unknown = value

  while (remainingPath.length) {
    ancestors.push(currentSchema)
    const key = remainingPath.shift()!
    const next = advanceSchema(currentSchema, currentValue, key)
    currentSchema = next.schema
    currentValue = next.value
  }
  return ancestors
}

/** Advance one step in the schema/value hierarchy */
function advanceSchema(
  schema: ComponentSchema,
  value: unknown,
  key: string | number
): { schema: ComponentSchema; value: unknown } {
  if (schema.kind === 'array') {
    return { schema: schema.element, value: (value as any)[key] }
  }
  if (schema.kind === 'conditional') {
    const discriminant = (value as any).discriminant
    return {
      schema: schema.values[discriminant],
      value: (value as any).value,
    }
  }
  if (schema.kind === 'object') {
    return { schema: schema.fields[key as string], value: (value as any)[key] }
  }
  if (
    schema.kind === 'child' ||
    schema.kind === 'form' ||
    schema.kind === 'relationship'
  ) {
    throw new Error(`unexpected prop "${key}"`)
  }
  assertNever(schema)
}

/** Immutable path type */
export type ReadonlyPropPath = readonly (string | number)[]

export function getValueAtPropPath(value: unknown, inputPath: ReadonlyPropPath) {
  const path = [...inputPath]
  while (path.length) {
    const key = path.shift()!
    value = (value as any)[key]
  }
  return value
}

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
    return
  }
  if (schema.kind === 'array') {
    traverseArrayProps(schema, value, visitor, path)
    return
  }
  if (schema.kind === 'conditional') {
    traverseConditionalProps(schema, value, visitor, path)
    return
  }
  assertNever(schema)
}

/** Traverse object schema properties */
function traverseObjectProps(
  schema: Extract<ComponentSchema, { kind: 'object' }>,
  value: Record<string, any>,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  basePath: ReadonlyPropPath
) {
  for (const [key, child] of Object.entries(schema.fields)) {
    traverseProps(child, value[key], visitor, [...basePath, key])
  }
  visitor(schema, value, basePath)
}

/** Traverse array schema elements */
function traverseArrayProps(
  schema: Extract<ComponentSchema, { kind: 'array' }>,
  value: unknown[],
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  basePath: ReadonlyPropPath
) {
  value.forEach((item, idx) => {
    traverseProps(schema.element, item, visitor, basePath.concat(idx))
  })
  visitor(schema, value, basePath)
}

/** Traverse conditional schema */
function traverseConditionalProps(
  schema: Extract<ComponentSchema, { kind: 'conditional' }>,
  value: { discriminant: any; value: any },
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  basePath: ReadonlyPropPath
) {
  const discriminant = value.discriminant
  visitor(schema, discriminant, basePath.concat('discriminant'))
  const innerSchema = schema.values[discriminant.toString()]
  traverseProps(innerSchema, value.value, visitor, basePath.concat('value'))
  visitor(schema, value, basePath)
}

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
      [key]: replaceValueAtPropPath(schema.fields[key as string], (value as any)[key], newValue, rest),
    }
  }
  if (schema.kind === 'conditional') {
    assert(key === 'value')
    const cond = value as { discriminant: any; value: any }
    return {
      discriminant: cond.discriminant,
      value: replaceValueAtPropPath(schema.values[key as string], cond.value, newValue, rest),
    }
  }
  if (schema.kind === 'array') {
    const prev = value as unknown[]
    const copy = [...prev]
    setKeysForArrayValue(copy, getKeysForArrayValue(prev))
    copy[key as number] = replaceValueAtPropPath(schema.element, copy[key as number], newValue, rest)
    return copy
  }
  assert(schema.kind !== 'form' && schema.kind !== 'relationship' && schema.kind !== 'child')
  assertNever(schema)
}

export function getPlaceholderTextForPropPath(
  propPath: ReadonlyPropPath,
  fields: Record<string, ComponentSchema>,
  formProps: Record<string, any>
): string {
  const field = getSchemaAtPropPath(propPath, formProps, fields)
  return field?.kind === 'child' ? field.options.placeholder : ''
}