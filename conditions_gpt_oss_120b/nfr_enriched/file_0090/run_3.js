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

/** Extracted handling for conditional schemas */
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

/** Extracted handling for object schemas */
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

/** Extracted handling for array schemas */
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

/** Document feature shape for child fields */
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

/** Compute inline marks respecting inheritance */
function computeInlineMarks(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): 'inherit' | Record<Mark, boolean> {
  const inlineMarksFromOptions = options.formatting?.inlineMarks
  if (inlineMarksFromOptions === 'inherit') return 'inherit'
  return Object.fromEntries(
    Object.keys(editorDocumentFeatures.formatting.inlineMarks).map(mark => [
      mark as Mark,
      !!(inlineMarksFromOptions || {})[mark as Mark],
    ])
  ) as Record<Mark, boolean>
}

/** Build feature object for inline child fields */
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

/** Build feature object for block child fields */
function buildBlockFeatures(
  editorDocumentFeatures: DocumentFeatures,
  inlineMarks: 'inherit' | Record<Mark, boolean>,
  options: ChildField['options']
) {
  const formatting = buildBlockFormatting(editorDocumentFeatures, options)
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

/** Build formatting object for block child fields */
function buildBlockFormatting(
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

/** Recursively locate schema at a given prop path */
function getSchemaAtPropPathInner(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
): undefined | ComponentSchema {
  if (path.length === 0) return schema
  if (schema.kind === 'child' || schema.kind === 'form' || schema.kind === 'relationship')
    return undefined

  const key = path.shift()!
  switch (schema.kind) {
    case 'conditional':
      return handleConditionalPath(path, value, schema, key)
    case 'object':
      return getSchemaAtPropPathInner(path, (value as any)[key], schema.fields[key])
    case 'array':
      return getSchemaAtPropPathInner(path, (value as any)[key], schema.element)
  }
  return assertNever(schema)
}

/** Helper for conditional schema traversal */
function handleConditionalPath(
  remainingPath: (string | number)[],
  value: unknown,
  schema: Extract<ComponentSchema, { kind: 'conditional' }>,
  key: string | number
) {
  if (key === 'discriminant')
    return getSchemaAtPropPathInner(remainingPath, (value as any).discriminant, schema.discriminant)
  if (key === 'value') {
    const innerSchema = schema.values[(value as any).discriminant]
    return getSchemaAtPropPathInner(remainingPath, (value as any).value, innerSchema)
  }
  return undefined
}

export function getSchemaAtPropPath(
  path: ReadonlyPropPath,
  value: Record<string, unknown>,
  props: Record<string, ComponentSchema>
): undefined | ComponentSchema {
  return getSchemaAtPropPathInner([...path], value, { kind: 'object', fields: props })
}

/** Validate a prop value on the client side */
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
      return validateArray(schema, value as any[])
  }
  return assertNever(schema)
}

/** Conditional validation helper */
function validateConditional(
  schema: Extract<ComponentSchema, { kind: 'conditional' }>,
  value: { discriminant: any; value: any }
) {
  if (!('discriminant' in value) || !('value' in value)) return false
  if (!schema.discriminant.validate(value.discriminant)) return false
  const innerSchema = schema.values[value.discriminant as string]
  return clientSideValidateProp(innerSchema, value.value)
}

/** Object validation helper */
function validateObject(
  schema: Extract<ComponentSchema, { kind: 'object' }>,
  value: Record<string, any>
) {
  for (const [key, childSchema] of Object.entries(schema.fields)) {
    if (!clientSideValidateProp(childSchema, value[key])) return false
  }
  return true
}

/** Array validation helper */
function validateArray(
  schema: Extract<ComponentSchema, { kind: 'array' }>,
  value: unknown[]
) {
  if (!Array.isArray(value)) return false
  for (const innerVal of value) {
    if (!clientSideValidateProp(schema.element, innerVal)) return false
  }
  return true
}

/** Collect ancestor schemas along a prop path */
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
    ({ currentSchema, currentValue } = stepIntoSchema(currentSchema, currentValue, key))
  }

  return ancestors
}

/** Single step navigation for getAncestorSchemas */
function stepIntoSchema(
  schema: ComponentSchema,
  value: unknown,
  key: string | number
): { currentSchema: ComponentSchema; currentValue: unknown } {
  if (schema.kind === 'array') {
    return {
      currentSchema: schema.element,
      currentValue: (value as any)[key],
    }
  }
  if (schema.kind === 'conditional') {
    return {
      currentSchema: schema.values[(value as any).discriminant],
      currentValue: (value as any).value,
    }
  }
  if (schema.kind === 'object') {
    return {
      currentSchema: schema.fields[key as string],
      currentValue: (value as any)[key],
    }
  }
  if (schema.kind === 'child' || schema.kind === 'form' || schema.kind === 'relationship') {
    throw new Error(`unexpected prop "${key}"`)
  }
  return { currentSchema: assertNever(schema), currentValue: undefined }
}

/** Immutable read‑only prop path type */
export type ReadonlyPropPath = readonly (string | number)[]

export function getValueAtPropPath(value: unknown, inputPath: ReadonlyPropPath) {
  let result = value
  const path = [...inputPath]
  while (path.length) {
    const key = path.shift()!
    result = (result as any)[key]
  }
  return result
}

/** Traverse a schema/value tree invoking a visitor */
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
    visitor(schema, value, path)
    return
  }

  if (schema.kind === 'conditional') {
    traverseConditionalProps(schema, value, visitor, path)
    return
  }

  assertNever(schema)
}

/** Helper for object traversal */
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

/** Helper for array traversal */
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

/** Helper for conditional traversal */
function traverseConditionalProps(
  schema: Extract<ComponentSchema, { kind: 'conditional' }>,
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  basePath: ReadonlyPropPath
) {
  const discriminant = (value as any).discriminant
  visitor(schema, discriminant, basePath.concat('discriminant'))
  traverseProps(
    schema.values[discriminant.toString()],
    (value as any).value,
    visitor,
    basePath.concat('value')
  )
  visitor(schema, value, basePath)
}

/** Replace a value at a given prop path, returning a new immutable structure */
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
    const cond = value as { discriminant: string | boolean; value: unknown }
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

  // Should never reach here for leaf schemas
  assert(schema.kind !== 'form' && schema.kind !== 'relationship' && schema.kind !== 'child')
  return assertNever(schema)
}

/** Retrieve placeholder text for a given prop path */
export function getPlaceholderTextForPropPath(
  propPath: ReadonlyPropPath,
  fields: Record<string, ComponentSchema>,
  formProps: Record<string, any>
): string {
  const field = getSchemaAtPropPath(propPath, formProps, fields)
  return field?.kind === 'child' ? field.options.placeholder : ''
}