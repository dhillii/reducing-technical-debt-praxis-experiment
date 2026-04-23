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

/** Public type describing document features for a child field. */
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
    componentBlocks: options.componentBlocks === 'inherit',
    documentFeatures: computeBlockDocumentFeatures(editorDocumentFeatures, options),
  }
}

/** Computes inline marks respecting inheritance rules. */
function computeInlineMarks(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): 'inherit' | DocumentFeatures['formatting']['inlineMarks'] {
  const inlineMarksFromOptions = options.formatting?.inlineMarks
  if (inlineMarksFromOptions === 'inherit') return 'inherit'
  return Object.fromEntries(
    Object.keys(editorDocumentFeatures.formatting.inlineMarks).map(mark => [
      mark as Mark,
      !!(inlineMarksFromOptions || {})[mark as Mark],
    ])
  ) as Record<Mark, boolean>
}

/** Builds block‑level document features respecting inheritance. */
function computeBlockDocumentFeatures(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): DocumentFeaturesForNormalization {
  const formatting = options.formatting ?? {}
  return {
    layouts: [],
    dividers:
      options.dividers === 'inherit' ? editorDocumentFeatures.dividers : false,
    formatting: {
      alignment:
        formatting.alignment === 'inherit'
          ? editorDocumentFeatures.formatting.alignment
          : { center: false, end: false },
      blockTypes:
        formatting.blockTypes === 'inherit'
          ? editorDocumentFeatures.formatting.blockTypes
          : { blockquote: false, code: false },
      headingLevels:
        formatting.headingLevels === 'inherit'
          ? editorDocumentFeatures.formatting.headingLevels
          : formatting.headingLevels || [],
      listTypes:
        formatting.listTypes === 'inherit'
          ? editorDocumentFeatures.formatting.listTypes
          : { ordered: false, unordered: false },
    },
    links: options.links === 'inherit',
    relationships: options.relationships === 'inherit',
  }
}

/** Recursively resolves a schema at a given prop path. */
function getSchemaAtPropPathInner(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
): undefined | ComponentSchema {
  if (path.length === 0) return schema
  if (schema.kind === 'child' || schema.kind === 'form' || schema.kind === 'relationship')
    return undefined

  const [key, ...rest] = path
  switch (schema.kind) {
    case 'conditional':
      return handleConditionalSchemaAtPath(key, rest, value, schema)
    case 'object':
      return getSchemaAtPropPathInner(rest, (value as any)[key], schema.fields[key])
    case 'array':
      return getSchemaAtPropPathInner(rest, (value as any)[key], schema.element)
    default:
      return assertNever(schema)
  }
}

/** Handles conditional schema traversal for getSchemaAtPropPathInner. */
function handleConditionalSchemaAtPath(
  key: string | number,
  remainingPath: (string | number)[],
  value: unknown,
  schema: Extract<ComponentSchema, { kind: 'conditional' }>
): undefined | ComponentSchema {
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

/** Validates a prop value against its schema on the client side. */
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
    default:
      return assertNever(schema)
  }
}

/** Validates a conditional schema. */
function validateConditional(
  schema: Extract<ComponentSchema, { kind: 'conditional' }>,
  value: { discriminant: any; value: any }
): boolean {
  if (!('discriminant' in value) || !('value' in value)) return false
  if (!schema.discriminant.validate(value.discriminant)) return false
  const innerSchema = schema.values[value.discriminant as string]
  return clientSideValidateProp(innerSchema, value.value)
}

/** Validates an object schema. */
function validateObject(
  schema: Extract<ComponentSchema, { kind: 'object' }>,
  value: Record<string, any>
): boolean {
  for (const [key, childSchema] of Object.entries(schema.fields)) {
    if (!clientSideValidateProp(childSchema, value[key])) return false
  }
  return true
}

/** Validates an array schema. */
function validateArray(
  schema: Extract<ComponentSchema, { kind: 'array' }>,
  value: unknown[]
): boolean {
  if (!Array.isArray(value)) return false
  for (const innerVal of value) {
    if (!clientSideValidateProp(schema.element, innerVal)) return false
  }
  return true
}

/** Returns all ancestor schemas for a given prop path. */
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
    ({ schema: currentSchema, value: currentValue } = stepIntoSchema(
      currentSchema,
      currentValue,
      key
    ))
  }
  return ancestors
}

/** Steps into the next schema/value based on the current schema kind. */
function stepIntoSchema(
  schema: ComponentSchema,
  value: unknown,
  key: string | number
): { schema: ComponentSchema; value: unknown } {
  if (schema.kind === 'array') {
    return { schema: schema.element, value: (value as any)[key] }
  }
  if (schema.kind === 'conditional') {
    return {
      schema: schema.values[(value as any).discriminant],
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
  return assertNever(schema)
}

/** Represents a read‑only path to a prop. */
export type ReadonlyPropPath = readonly (string | number)[]

export function getValueAtPropPath(value: unknown, inputPath: ReadonlyPropPath) {
  const path = [...inputPath]
  while (path.length) {
    const key = path.shift()!
    value = (value as any)[key]
  }
  return value
}

/** Traverses a schema/value tree invoking a visitor at each node. */
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

/** Traverses object schema children. */
function traverseObjectProps(
  schema: Extract<ComponentSchema, { kind: 'object' }>,
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  basePath: ReadonlyPropPath
) {
  for (const [key, childSchema] of Object.entries(schema.fields)) {
    traverseProps(childSchema, (value as any)[key], visitor, [...basePath, key])
  }
}

/** Traverses array schema children. */
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

/** Traverses conditional schema children. */
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

/** Replaces a value at a specific prop path, returning a new value tree. */
export function replaceValueAtPropPath(
  schema: ComponentSchema,
  value: unknown,
  newValue: unknown,
  path: ReadonlyPropPath
): unknown {
  if (path.length === 0) return newValue

  const [key, ...restPath] = path

  if (schema.kind === 'object') {
    return {
      ...(value as any),
      [key]: replaceValueAtPropPath(schema.fields[key], (value as any)[key], newValue, restPath),
    }
  }

  if (schema.kind === 'conditional') {
    return replaceInConditional(schema, value as any, newValue, key, restPath)
  }

  if (schema.kind === 'array') {
    return replaceInArray(schema, value as unknown[], newValue, key as number, restPath)
  }

  // Should never reach here for leaf schemas
  assert(schema.kind !== 'form' && schema.kind !== 'relationship' && schema.kind !== 'child')
  return assertNever(schema)
}

/** Handles replacement inside a conditional schema. */
function replaceInConditional(
  schema: Extract<ComponentSchema, { kind: 'conditional' }>,
  current: { discriminant: string | boolean; value: unknown },
  newValue: unknown,
  key: string | number,
  restPath: (string | number)[]
) {
  // Only the 'value' branch is replaceable; discriminant changes require full replacement
  assert(key === 'value')
  return {
    discriminant: current.discriminant,
    value: replaceValueAtPropPath(
      schema.values[key as any],
      current.value,
      newValue,
      restPath
    ),
  }
}

/** Handles replacement inside an array schema. */
function replaceInArray(
  schema: Extract<ComponentSchema, { kind: 'array' }>,
  arr: unknown[],
  newValue: unknown,
  index: number,
  restPath: (string | number)[]
) {
  const copy = [...arr]
  setKeysForArrayValue(copy, getKeysForArrayValue(arr))
  copy[index] = replaceValueAtPropPath(schema.element, copy[index], newValue, restPath)
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