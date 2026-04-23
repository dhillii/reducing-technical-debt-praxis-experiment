import type { DocumentFeatures } from '../../views-shared'
import type { DocumentFeaturesForNormalization } from '../document-features-normalization'
import { type Mark, assert } from '../utils'
import type { ComponentSchema, ChildField } from './api-shared'
import { getKeysForArrayValue, setKeysForArrayValue } from './preview-props'

type PathToChildFieldWithOption = { path: ReadonlyPropPath; options: ChildField['options'] }

// Extracts child prop paths from a single schema node
function findChildPropPathsInSchema(
  value: any,
  schema: ComponentSchema,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  if (schema.kind === 'form' || schema.kind === 'relationship') {
    return []
  }
  if (schema.kind === 'child') {
    return [{ path: path, options: schema.options }]
  }
  if (schema.kind === 'conditional') {
    return findChildPropPathsForProp(
      value.value,
      schema.values[value.discriminant],
      path.concat('value')
    )
  }
  if (schema.kind === 'object') {
    return findChildPropPathsInObjectSchema(value, schema, path)
  }
  if (schema.kind === 'array') {
    return findChildPropPathsInArraySchema(value, schema, path)
  }
  return []
}

// Extracts child prop paths from object schema fields
function findChildPropPathsInObjectSchema(
  value: any,
  schema: Extract<ComponentSchema, { kind: 'object' }>,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  const paths: PathToChildFieldWithOption[] = []
  Object.keys(schema.fields).forEach(key => {
    paths.push(...findChildPropPathsForProp(value[key], schema.fields[key], path.concat(key)))
  })
  return paths
}

// Extracts child prop paths from array schema elements
function findChildPropPathsInArraySchema(
  value: any[],
  schema: Extract<ComponentSchema, { kind: 'array' }>,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  const paths: PathToChildFieldWithOption[] = []
  value.forEach((val, i) => {
    paths.push(...findChildPropPathsForProp(val, schema.element, path.concat(i)))
  })
  return paths
}

export function findChildPropPathsForProp(
  value: any,
  schema: ComponentSchema,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  return findChildPropPathsInSchema(value, schema, path)
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

// Builds document features for inline child field
function buildInlineDocumentFeatures(
  inlineMarks: 'inherit' | Record<Mark, boolean>,
  options: Extract<ChildField['options'], { kind: 'inline' }>
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

// Builds formatting configuration for block child field
function buildBlockFormatting(
  editorDocumentFeatures: DocumentFeatures,
  options: Extract<ChildField['options'], { kind: 'block' }>
): DocumentFeaturesForNormalization['formatting'] {
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

// Builds document features for block child field
function buildBlockDocumentFeatures(
  editorDocumentFeatures: DocumentFeatures,
  inlineMarks: 'inherit' | Record<Mark, boolean>,
  options: Extract<ChildField['options'], { kind: 'block' }>
): DocumentFeaturesForChildField {
  return {
    kind: 'block',
    inlineMarks,
    softBreaks: options.formatting?.softBreaks === 'inherit',
    documentFeatures: {
      layouts: [],
      dividers: options.dividers === 'inherit' ? editorDocumentFeatures.dividers : false,
      formatting: buildBlockFormatting(editorDocumentFeatures, options),
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
    return buildInlineDocumentFeatures(inlineMarks, options)
  }

  return buildBlockDocumentFeatures(editorDocumentFeatures, inlineMarks, options)
}

// Handles conditional schema traversal
function getSchemaAtConditionalPath(
  path: (string | number)[],
  value: unknown,
  schema: Extract<ComponentSchema, { kind: 'conditional' }>
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

// Handles object schema traversal
function getSchemaAtObjectPath(
  path: (string | number)[],
  value: unknown,
  schema: Extract<ComponentSchema, { kind: 'object' }>
): undefined | ComponentSchema {
  const key = path.shift()!
  return getSchemaAtPropPathInner(path, (value as any)[key], schema.fields[key])
}

// Handles array schema traversal
function getSchemaAtArrayPath(
  path: (string | number)[],
  value: unknown,
  schema: Extract<ComponentSchema, { kind: 'array' }>
): undefined | ComponentSchema {
  const index = path.shift()!
  return getSchemaAtPropPathInner(path, (value as any)[index], schema.element)
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
    return getSchemaAtObjectPath(path, value, schema)
  }
  if (schema.kind === 'array') {
    return getSchemaAtArrayPath(path, value, schema)
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

// Validates conditional prop structure and values
function validateConditionalProp(
  schema: Extract<ComponentSchema, { kind: 'conditional' }>,
  value: unknown
): boolean {
  if (!('discriminant' in (value as any)) || !('value' in (value as any))) return false
  if (!schema.discriminant.validate((value as any).discriminant)) return false
  return clientSideValidateProp(
    schema.values[(value as any).discriminant as string],
    (value as any).value
  )
}

// Validates object prop fields
function validateObjectProp(
  schema: Extract<ComponentSchema, { kind: 'object' }>,
  value: unknown
): boolean {
  for (const [key, childProp] of Object.entries(schema.fields)) {
    if (!clientSideValidateProp(childProp, (value as any)[key])) return false
  }
  return true
}

// Validates array prop elements
function validateArrayProp(
  schema: Extract<ComponentSchema, { kind: 'array' }>,
  value: unknown
): boolean {
  if (!Array.isArray(value)) return false
  for (const innerVal of value) {
    if (!clientSideValidateProp(schema.element, innerVal)) return false
  }
  return true
}

export function clientSideValidateProp(schema: ComponentSchema, value: unknown): boolean {
  if (schema.kind === 'child' || schema.kind === 'relationship') return true
  if (schema.kind === 'form') return schema.validate(value)
  if (typeof value !== 'object' || value === null) return false

  if (schema.kind === 'conditional') {
    return validateConditionalProp(schema, value)
  }
  if (schema.kind === 'object') {
    return validateObjectProp(schema, value)
  }
  if (schema.kind === 'array') {
    return validateArrayProp(schema, value)
  }

  return false
}

// Updates ancestor schema based on current prop kind
function updateAncestorSchema(
  currentProp: ComponentSchema,
  currentValue: unknown,
  key: string | number,
  value: unknown
): { schema: ComponentSchema; value: unknown } {
  if (currentProp.kind === 'array') {
    return {
      schema: currentProp.element,
      value: (currentValue as any)[key],
    }
  }
  if (currentProp.kind === 'conditional') {
    return {
      schema: currentProp.values[(value as any).discriminant],
      value: (currentValue as any).value,
    }
  }
  if (currentProp.kind === 'object') {
    return {
      schema: currentProp.fields[key],
      value: (currentValue as any)[key],
    }
  }
  if (
    currentProp.kind === 'child' ||
    currentProp.kind === 'form' ||
    currentProp.kind === 'relationship'
  ) {
    throw new Error(`unexpected prop "${key}"`)
  }
  assertNever(currentProp)
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
    const updated = updateAncestorSchema(currentProp, currentValue, key, value)
    currentProp = updated.schema
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
function traverseObjectSchema(
  schema: Extract<ComponentSchema, { kind: 'object' }>,
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
function traverseArraySchema(
  schema: Extract<ComponentSchema, { kind: 'array' }>,
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
function traverseConditionalSchema(
  schema: Extract<ComponentSchema, { kind: 'conditional' }>,
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
    traverseObjectSchema(schema, value, visitor, path)
    return
  }
  if (schema.kind === 'array') {
    traverseArraySchema(schema, value, visitor, path)
    return
  }
  if (schema.kind === 'conditional') {
    traverseConditionalSchema(schema, value, visitor, path)
    return
  }
  assertNever(schema)
}

// Replaces value in object schema
function replaceValueInObject(
  schema: Extract<ComponentSchema, { kind: 'object' }>,
  value: unknown,
  newValue: unknown,
  key: string | number,
  newPath: ReadonlyPropPath
): unknown {
  return {
    ...(value as any),
    [key]: replaceValueAtPropPath(schema.fields[key], (value as any)[key], newValue, newPath),
  }
}

// Replaces value in conditional schema
function replaceValueInConditional(
  schema: Extract<ComponentSchema, { kind: 'conditional' }>,
  value: unknown,
  newValue: unknown,
  key: string | number,
  newPath: ReadonlyPropPath
): unknown {
  const conditionalValue = value as { discriminant: string | boolean; value: unknown }
  assert(key === 'value')
  return {
    discriminant: conditionalValue.discriminant,
    value: replaceValueAtPropPath(schema.values[key], conditionalValue.value, newValue, newPath),
  }
}

// Replaces value in array schema
function replaceValueInArray(
  schema: Extract<ComponentSchema, { kind: 'array' }>,
  value: unknown,
  newValue: unknown,
  key: string | number,
  newPath: ReadonlyPropPath
): unknown {
  const prevVal = value as unknown[]
  const newVal = [...prevVal]
  setKeysForArrayValue(newVal, getKeysForArrayValue(prevVal))
  newVal[key as number] = replaceValueAtPropPath(
    schema.element,
    newVal[key as number],
    newValue,
    newPath
  )
  return newVal
}

export function replaceValueAtPropPath(
  schema: ComponentSchema,
  value: unknown,
  newValue: unknown,
  path: ReadonlyPropPath
): unknown {
  if (path.length === 0) return newValue

  const [key, ...newPath] = path

  if (schema.kind === 'object') {
    return replaceValueInObject(schema, value, newValue, key, newPath)
  }

  if (schema.kind === 'conditional') {
    return replaceValueInConditional(schema, value, newValue, key, newPath)
  }

  if (schema.kind === 'array') {
    return replaceValueInArray(schema, value, newValue, key, newPath)
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
  if (field?.kind === 'child') return field.options.placeholder
  return ''
}