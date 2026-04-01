```typescript
import type { DocumentFeatures } from '../../views-shared'
import type { DocumentFeaturesForNormalization } from '../document-features-normalization'
import { type Mark, assert } from '../utils'
import type { ComponentSchema, ChildField } from './api-shared'
import { getKeysForArrayValue, setKeysForArrayValue } from './preview-props'

type PathToChildFieldWithOption = { path: ReadonlyPropPath; options: ChildField['options'] }

// Extracts child prop paths from object schema fields
function findChildPropPathsInObjectFields(
  value: any,
  fields: Record<string, ComponentSchema>,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  const paths: PathToChildFieldWithOption[] = []
  Object.keys(fields).forEach(key => {
    paths.push(...findChildPropPathsForProp(value[key], fields[key], path.concat(key)))
  })
  return paths
}

// Extracts child prop paths from array schema elements
function findChildPropPathsInArrayElements(
  value: any[],
  elementSchema: ComponentSchema,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  const paths: PathToChildFieldWithOption[] = []
  value.forEach((val, i) => {
    paths.push(...findChildPropPathsForProp(val, elementSchema, path.concat(i)))
  })
  return paths
}

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
      return [{ path: path, options: schema.options }]
    case 'conditional':
      return findChildPropPathsForProp(
        value.value,
        schema.values[value.discriminant],
        path.concat('value')
      )
    case 'object':
      return findChildPropPathsInObjectFields(value, schema.fields, path)
    case 'array':
      return findChildPropPathsInArrayElements(value, schema.element, path)
  }
}

export function findChildPropPaths(
  value: Record<string, any>,
  props: Record<string, ComponentSchema>
): { path: ReadonlyPropPath | undefined; options: ChildField['options'] }[] {
  const propPaths = findChildPropPathsForProp(value, { kind: 'object', fields: props }, [])
  if (propPaths.length) return propPaths

  return [
    {
      path: undefined,
      options: { kind: 'inline', placeholder: '' },
    },
  ]
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

// Resolves inline marks from options and editor features
function resolveInlineMarks(
  editorInlineMarks: DocumentFeatures['formatting']['inlineMarks'],
  optionInlineMarks: ChildField['options']['formatting']?.inlineMarks
): 'inherit' | Record<Mark, boolean> {
  if (optionInlineMarks === 'inherit') {
    return 'inherit'
  }
  return Object.fromEntries(
    Object.keys(editorInlineMarks).map(mark => {
      return [mark as Mark, !!(optionInlineMarks || {})[mark as Mark]]
    })
  ) as Record<Mark, boolean>
}

// Builds inline child field document features
function buildInlineDocumentFeatures(
  options: ChildField['options'] & { kind: 'inline' },
  inlineMarks: 'inherit' | Record<Mark, boolean>
): DocumentFeaturesForChildField {
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

// Builds block child field formatting features
function buildBlockFormatting(
  options: ChildField['options'] & { kind: 'block' },
  editorDocumentFeatures: DocumentFeatures
) {
  return {
    alignment:
      options.formatting?.alignment === 'inherit'
        ? editorDocumentFeatures.formatting.alignment
        : {
            center: false,
            end: false,
          },
    blockTypes:
      options.formatting?.blockTypes === 'inherit'
        ? editorDocumentFeatures.formatting.blockTypes
        : {
            blockquote: false,
            code: false,
          },
    headingLevels:
      options.formatting?.headingLevels === 'inherit'
        ? editorDocumentFeatures.formatting.headingLevels
        : options.formatting?.headingLevels || [],
    listTypes:
      options.formatting?.listTypes === 'inherit'
        ? editorDocumentFeatures.formatting.listTypes
        : {
            ordered: false,
            unordered: false,
          },
  }
}

// Builds block child field document features
function buildBlockDocumentFeatures(
  options: ChildField['options'] & { kind: 'block' },
  editorDocumentFeatures: DocumentFeatures,
  inlineMarks: 'inherit' | Record<Mark, boolean>
): DocumentFeaturesForChildField {
  return {
    kind: 'block',
    inlineMarks,
    softBreaks: options.formatting?.softBreaks === 'inherit',
    documentFeatures: {
      layouts: [],
      dividers: options.dividers === 'inherit' ? editorDocumentFeatures.dividers : false,
      formatting: buildBlockFormatting(options, editorDocumentFeatures),
      links: options.links === 'inherit',
      relationships: options.relationships === 'inherit',
    },
    componentBlocks: options.componentBlocks === 'inherit',
  }
}

export function getDocumentFeaturesForChildField(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): DocumentFeaturesForChildField {
  const inlineMarks = resolveInlineMarks(
    editorDocumentFeatures.formatting.inlineMarks,
    options.formatting?.inlineMarks
  )

  if (options.kind === 'inline') {
    return buildInlineDocumentFeatures(options, inlineMarks)
  }

  return buildBlockDocumentFeatures(options, editorDocumentFeatures, inlineMarks)
}

// Handles conditional schema traversal
function getSchemaAtConditionalPath(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema & { kind: 'conditional' }
): undefined | ComponentSchema {
  const key = path.shift()
  if (key === 'discriminant') {
    return getSchemaAtPropPathInner(path, (value as any).discriminant, schema.discriminant)
  }
  if (key === 'value') {
    const propVal = schema.values[(value as any).discriminant]
    return getSchemaAtPropPathInner(path, (value as any).value, propVal)
  }
  return
}

function getSchemaAtPropPathInner(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
): undefined | ComponentSchema {
  if (path.length === 0) return schema
  if (schema.kind === 'child' || schema.kind === 'form' || schema.kind === 'relationship') return
  if (schema.kind === 'conditional') {
    return getSchemaAtConditionalPath(path, value, schema)
  }
  if (schema.kind === 'object') {
    const key = path.shift()!
    return getSchemaAtPropPathInner(path, (value as any)[key], schema.fields[key])
  }
  if (schema.kind === 'array') {
    const index = path.shift()!
    return getSchemaAtPropPathInner(path, (value as any)[index], schema.element)
  }
  assertNever(schema)
}

export function getSchemaAtPropPath(
  path: ReadonlyPropPath,
  value: Record<string, unknown>,
  props: Record<string, ComponentSchema>
): undefined | ComponentSchema {
  return getSchemaAtPropPathInner([...path], value, {
    kind: 'object',
    fields: props,
  })
}

// Validates conditional prop structure and content
function validateConditionalProp(
  schema: ComponentSchema & { kind: 'conditional' },
  value: unknown
): boolean {
  if (!('discriminant' in value) || !('value' in value)) return false
  if (!schema.discriminant.validate(value.discriminant)) return false
  return clientSideValidateProp(
    schema.values[value.discriminant as string],
    value.value
  )
}

// Validates object prop fields
function validateObjectProp(
  schema: ComponentSchema & { kind: 'object' },
  value: unknown
): boolean {
  for (const [key, childProp] of Object.entries(schema.fields)) {
    if (!clientSideValidateProp(childProp, (value as any)[key])) return false
  }
  return true
}

// Validates array prop elements
function validateArrayProp(
  schema: ComponentSchema & { kind: 'array' },
  value: unknown
): boolean {
  if (!Array.isArray(value)) return false
  for (const innerVal of value) {
    if (!clientSideValidateProp(schema.element, innerVal)) return false
  }
  return true
}

export function clientSideValidateProp(schema: ComponentSchema, value: unknown): boolean {
  if (schema.kind === 'child') return true
  if (schema.kind === 'relationship') return true
  if (schema.kind === 'form') return schema.validate(value)
  if (typeof value !== 'object' || value === null) return false

  switch (schema.kind) {
    case 'conditional':
      return validateConditionalProp(schema, value)
    case 'object':
      return validateObjectProp(schema, value)
    case 'array':
      return validateArrayProp(schema, value)
  }
}

// Updates current prop based on schema kind
function updateCurrentProp(
  currentProp: ComponentSchema,
  key: string | number,
  currentValue: unknown,
  value: unknown
): { prop: ComponentSchema; value: unknown } {
  if (currentProp.kind === 'array') {
    return {
      prop: currentProp.element,
      value: (currentValue as any)[key],
    }
  }
  if (currentProp.kind === 'conditional') {
    return {
      prop: currentProp.values[(value as any).discriminant],
      value: (currentValue as any).value,
    }
  }
  if (currentProp.kind === 'object') {
    return {
      prop: currentProp.fields[key],
      value: (currentValue as any)[key],
    }
  }
  throw new Error(`unexpected prop "${key}"`)
}

export function getAncestorSchemas(
  rootSchema: ComponentSchema,
  path: ReadonlyPropPath,
  value: unknown
) {
  const ancestors: ComponentSchema[] = []
  const currentPath = [...path]
  let currentProp = rootSchema
  let currentValue = value

  while (currentPath.length) {
    ancestors.push(currentProp)
    const key = currentPath.shift()!

    if (
      currentProp.kind === 'child' ||
      currentProp.kind === 'form' ||
      currentProp.kind === 'relationship'
    ) {
      throw new Error(`unexpected prop "${key}"`)
    }

    const updated = updateCurrentProp(currentProp, key, currentValue, value)
    currentProp = updated.prop
    currentValue = updated.value
  }

  return ancestors
}

export type ReadonlyPropPath = readonly (string | number)[]

export function getValueAtPropPath(value: unknown, inputPath: ReadonlyPropPath) {
  const path = [...inputPath]
  while (path.length) {
    const key = path.shift()!
    value = (value as any)[key]
  }
  return value
}

// Traverses object schema fields
function traverseObjectProps(
  schema: ComponentSchema & { kind: 'object' },
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath
): void {
  for (const [key, childProp] of Object.entries(schema.fields)) {
    traverseProps(childProp, (value as any)[key], visitor, [...path, key])
  }
  visitor(schema, value, path)
}

// Traverses array schema elements
function traverseArrayProps(
  schema: ComponentSchema & { kind: 'array' },
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath
): void {
  for (const [idx, val] of (value as unknown[]).entries()) {
    traverseProps(schema.element, val, visitor, path.concat(idx))
  }
  visitor(schema, value, path)
}

// Traverses conditional schema discriminant and value
function traverseConditionalProps(
  schema: ComponentSchema & { kind: 'conditional' },
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath
): void {
  const discriminant: string | boolean = (value as any).discriminant
  visitor(schema, discriminant, path.concat('discriminant'))
  traverseProps(
    schema.values[discriminant.toString()],
    (value as any).value,
    visitor,
    path.concat('value')
  )
  visitor(schema, value, path)
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

// Replaces value in object schema
function replaceValueInObject(
  schema: ComponentSchema & { kind: 'object' },
  value: unknown,
  key: string | number,
  newValue: unknown,
  newPath: ReadonlyPropPath
): unknown {
  return {
    ...(value as any),
    [key]: replaceValueAtPropPath(schema.fields[key], (value as any)[key], newValue, newPath),
  }
}

//