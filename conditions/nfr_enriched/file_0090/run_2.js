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
function buildInlineChildFeatures(
  inlineMarks: 'inherit' | Record<Mark, boolean>,
  options: Extract<ChildField['options'], { kind: 'inline' }>
): Extract<DocumentFeaturesForChildField, { kind: 'inline' }> {
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
function buildBlockFormattingFeatures(
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

// Builds block child field document features
function buildBlockChildFeatures(
  inlineMarks: 'inherit' | Record<Mark, boolean>,
  editorDocumentFeatures: DocumentFeatures,
  options: Extract<ChildField['options'], { kind: 'block' }>
): Extract<DocumentFeaturesForChildField, { kind: 'block' }> {
  return {
    kind: 'block',
    inlineMarks,
    softBreaks: options.formatting?.softBreaks === 'inherit',
    documentFeatures: {
      layouts: [],
      dividers: options.dividers === 'inherit' ? editorDocumentFeatures.dividers : false,
      formatting: buildBlockFormattingFeatures(editorDocumentFeatures, options),
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
    return buildInlineChildFeatures(inlineMarks, options)
  }

  return buildBlockChildFeatures(inlineMarks, editorDocumentFeatures, options)
}

// Handles conditional schema traversal
function traverseConditionalSchema(
  path: (string | number)[],
  value: unknown,
  schema: Extract<ComponentSchema, { kind: 'conditional' }>
): undefined | ComponentSchema {
  const key = path.shift()
  if (key === 'discriminant')
    return getSchemaAtPropPathInner(path, (value as any).discriminant, schema.discriminant)
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
    return traverseConditionalSchema(path, value, schema)
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

// Validates conditional prop structure and values
function validateConditionalProp(
  schema: Extract<ComponentSchema, { kind: 'conditional' }>,
  value: any
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
  schema: Extract<ComponentSchema, { kind: 'object' }>,
  value: any
): boolean {
  for (const [key, childProp] of Object.entries(schema.fields)) {
    if (!clientSideValidateProp(childProp, value[key])) return false
  }
  return true
}

// Validates array prop elements
function validateArrayProp(
  schema: Extract<ComponentSchema, { kind: 'array' }>,
  value: any
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

// Handles array schema traversal in ancestor collection
function traverseArrayAncestor(
  currentProp: Extract<ComponentSchema, { kind: 'array' }>,
  currentValue: any,
  key: string | number
): { schema: ComponentSchema; value: unknown } {
  return {
    schema: currentProp.element,
    value: currentValue[key],
  }
}

// Handles conditional schema traversal in ancestor collection
function traverseConditionalAncestor(
  currentProp: Extract<ComponentSchema, { kind: 'conditional' }>,
  currentValue: any
): { schema: ComponentSchema; value: unknown } {
  return {
    schema: currentProp.values[(currentValue as any).discriminant],
    value: (currentValue as any).value,
  }
}

// Handles object schema traversal in ancestor collection
function traverseObjectAncestor(
  currentProp: Extract<ComponentSchema, { kind: 'object' }>,
  currentValue: any,
  key: string | number
): { schema: ComponentSchema; value: unknown } {
  return {
    schema: currentProp.fields[key],
    value: currentValue[key],
  }
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

    if (currentProp.kind === 'array') {
      const next = traverseArrayAncestor(currentProp, currentValue, key)
      currentProp = next.schema
      currentValue = next.value
    } else if (currentProp.kind === 'conditional') {
      const next = traverseConditionalAncestor(currentProp, currentValue)
      currentProp = next.schema
      currentValue = next.value
    } else if (currentProp.kind === 'object') {
      const next = traverseObjectAncestor(currentProp, currentValue, key)
      currentProp = next.schema
      currentValue = next.value
    } else if (
      currentProp.kind === 'child' ||
      currentProp.kind === 'form' ||
      currentProp.kind === 'relationship'
    ) {
      throw new Error(`unexpected prop "${key}"`)
    } else {
      assertNever(currentProp)
    }
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
function replaceInObjectSchema(
  schema: Extract<ComponentSchema, { kind: 'object' }>,
  value: any,
  key: string | number,
  newValue: unknown,
  newPath: ReadonlyPropPath
): unknown {
  return {
    ...(value as any),
    [key]: replaceValueAtPropPath(schema.fields[key], (value as any)[key], newValue, newPath),
  }
}

// Replaces value in conditional schema
function replaceInConditionalSchema(
  schema: Extract<ComponentSchema, { kind: 'conditional' }>,
  value: any,
  key: string | number,
  newValue: unknown,
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
function replaceInArraySchema(
  schema: Extract<ComponentSchema, { kind: 'array' }>,
  value: any,
  key: string | number,
  newValue: unknown,
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
    return replaceInObjectSchema(schema, value, key, newValue, newPath)
  }

  if (schema.kind === 'conditional') {
    return replaceInConditionalSchema(schema, value, key, newValue, newPath)
  }

  if (schema.kind === 'array') {
    return replaceInArraySchema(schema, value, key, newValue, newPath)
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
```