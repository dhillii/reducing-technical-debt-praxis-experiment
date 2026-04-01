```typescript
import type { DocumentFeatures } from '../../views-shared'
import type { DocumentFeaturesForNormalization } from '../document-features-normalization'
import { type Mark, assert } from '../utils'
import type { ComponentSchema, ChildField } from './api-shared'
import { getKeysForArrayValue, setKeysForArrayValue } from './preview-props'

type PathToChildFieldWithOption = { path: ReadonlyPropPath; options: ChildField['options'] }

// Handles child schema type
function handleChildSchema(path: ReadonlyPropPath, schema: ComponentSchema): PathToChildFieldWithOption[] {
  return [{ path, options: schema.options }]
}

// Handles conditional schema type by recursing into discriminant value
function handleConditionalSchema(
  value: any,
  schema: ComponentSchema,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  return findChildPropPathsForProp(
    value.value,
    schema.values[value.discriminant],
    path.concat('value')
  )
}

// Handles object schema type by iterating over fields
function handleObjectSchema(
  value: any,
  schema: ComponentSchema,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  const paths: PathToChildFieldWithOption[] = []
  Object.keys(schema.fields).forEach(key => {
    paths.push(...findChildPropPathsForProp(value[key], schema.fields[key], path.concat(key)))
  })
  return paths
}

// Handles array schema type by iterating over elements
function handleArraySchema(
  value: any,
  schema: ComponentSchema,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  const paths: PathToChildFieldWithOption[] = []
  ;(value as any[]).forEach((val, i) => {
    paths.push(...findChildPropPathsForProp(val, schema.element, path.concat(i)))
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
      return handleChildSchema(path, schema)
    case 'conditional':
      return handleConditionalSchema(value, schema, path)
    case 'object':
      return handleObjectSchema(value, schema, path)
    case 'array':
      return handleArraySchema(value, schema, path)
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

// Creates inline child field document features
function createInlineDocumentFeatures(
  inlineMarks: 'inherit' | Record<Mark, boolean>,
  options: ChildField['options']
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

// Resolves alignment formatting from options and editor features
function resolveAlignment(
  editorAlignment: DocumentFeatures['formatting']['alignment'],
  optionAlignment: ChildField['options']['formatting']?.alignment
): DocumentFeatures['formatting']['alignment'] {
  return optionAlignment === 'inherit'
    ? editorAlignment
    : {
        center: false,
        end: false,
      }
}

// Resolves block types formatting from options and editor features
function resolveBlockTypes(
  editorBlockTypes: DocumentFeatures['formatting']['blockTypes'],
  optionBlockTypes: ChildField['options']['formatting']?.blockTypes
): DocumentFeatures['formatting']['blockTypes'] {
  return optionBlockTypes === 'inherit'
    ? editorBlockTypes
    : {
        blockquote: false,
        code: false,
      }
}

// Resolves heading levels formatting from options and editor features
function resolveHeadingLevels(
  editorHeadingLevels: DocumentFeatures['formatting']['headingLevels'],
  optionHeadingLevels: ChildField['options']['formatting']?.headingLevels
): DocumentFeatures['formatting']['headingLevels'] {
  return optionHeadingLevels === 'inherit'
    ? editorHeadingLevels
    : optionHeadingLevels || []
}

// Resolves list types formatting from options and editor features
function resolveListTypes(
  editorListTypes: DocumentFeatures['formatting']['listTypes'],
  optionListTypes: ChildField['options']['formatting']?.listTypes
): DocumentFeatures['formatting']['listTypes'] {
  return optionListTypes === 'inherit'
    ? editorListTypes
    : {
        ordered: false,
        unordered: false,
      }
}

// Creates block child field document features
function createBlockDocumentFeatures(
  editorDocumentFeatures: DocumentFeatures,
  inlineMarks: 'inherit' | Record<Mark, boolean>,
  options: ChildField['options']
): DocumentFeaturesForChildField {
  const formatting = options.formatting
  return {
    kind: 'block',
    inlineMarks,
    softBreaks: formatting?.softBreaks === 'inherit',
    documentFeatures: {
      layouts: [],
      dividers: options.dividers === 'inherit' ? editorDocumentFeatures.dividers : false,
      formatting: {
        alignment: resolveAlignment(editorDocumentFeatures.formatting.alignment, formatting?.alignment),
        blockTypes: resolveBlockTypes(editorDocumentFeatures.formatting.blockTypes, formatting?.blockTypes),
        headingLevels: resolveHeadingLevels(editorDocumentFeatures.formatting.headingLevels, formatting?.headingLevels),
        listTypes: resolveListTypes(editorDocumentFeatures.formatting.listTypes, formatting?.listTypes),
      },
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
    return createInlineDocumentFeatures(inlineMarks, options)
  }

  return createBlockDocumentFeatures(editorDocumentFeatures, inlineMarks, options)
}

// Handles conditional schema in path traversal
function getSchemaAtConditionalPath(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
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

// Handles object schema in path traversal
function getSchemaAtObjectPath(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
): undefined | ComponentSchema {
  const key = path.shift()!
  return getSchemaAtPropPathInner(path, (value as any)[key], schema.fields[key])
}

// Handles array schema in path traversal
function getSchemaAtArrayPath(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
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

// Validates conditional schema value
function validateConditionalProp(schema: ComponentSchema, value: any): boolean {
  if (!('discriminant' in value) || !('value' in value)) return false
  if (!schema.discriminant.validate(value.discriminant)) return false
  return clientSideValidateProp(
    schema.values[value.discriminant as string],
    value.value
  )
}

// Validates object schema value
function validateObjectProp(schema: ComponentSchema, value: any): boolean {
  for (const [key, childProp] of Object.entries(schema.fields)) {
    if (!clientSideValidateProp(childProp, value[key])) return false
  }
  return true
}

// Validates array schema value
function validateArrayProp(schema: ComponentSchema, value: any): boolean {
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
  if (typeof value !== 'object') return false
  if (value === null) return false

  switch (schema.kind) {
    case 'conditional':
      return validateConditionalProp(schema, value)
    case 'object':
      return validateObjectProp(schema, value)
    case 'array':
      return validateArrayProp(schema, value)
  }
}

// Handles array schema in ancestor traversal
function traverseArrayAncestor(
  currentProp: ComponentSchema,
  currentValue: any,
  key: string | number
): { prop: ComponentSchema; value: unknown } {
  return {
    prop: currentProp.element,
    value: currentValue[key],
  }
}

// Handles conditional schema in ancestor traversal
function traverseConditionalAncestor(
  currentProp: ComponentSchema,
  currentValue: any
): { prop: ComponentSchema; value: unknown } {
  return {
    prop: currentProp.values[(currentValue as any).discriminant],
    value: (currentValue as any).value,
  }
}

// Handles object schema in ancestor traversal
function traverseObjectAncestor(
  currentProp: ComponentSchema,
  currentValue: any,
  key: string | number
): { prop: ComponentSchema; value: unknown } {
  return {
    prop: currentProp.fields[key],
    value: (currentValue as any)[key],
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
      const result = traverseArrayAncestor(currentProp, currentValue, key)
      currentProp = result.prop
      currentValue = result.value
    } else if (currentProp.kind === 'conditional') {
      const result = traverseConditionalAncestor(currentProp, currentValue)
      currentProp = result.prop
      currentValue = result.value
    } else if (currentProp.kind === 'object') {
      const result = traverseObjectAncestor(currentProp, currentValue, key)
      currentProp = result.prop
      currentValue = result.value
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

// Traverses form/relationship/child leaf nodes
function traverseLeafProp(
  schema: ComponentSchema,
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath
): void {
  visitor(schema, value, path)
}

// Traverses object schema properties
function traverseObjectProp(
  schema: ComponentSchema,
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
function traverseArrayProp(
  schema: ComponentSchema,
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
function traverseConditionalProp(
  schema: ComponentSchema,
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
    traverseLeafProp(schema, value, visitor, path)
    return
  }
  if (schema.kind === 'object') {
    traverseObjectProp(schema, value, visitor, path)
    return
  }
  if (schema.kind === 'array') {
    traverseArrayProp(schema, value, visitor, path)
    return
  }
  if (schema.kind === 'conditional') {
    traverseConditionalProp(schema, value, visitor, path)
    return
  }
  assertNever(schema)
}

// Replaces value in object schema
function replaceInObject(
  schema: ComponentSchema,
  value: any,
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
function replaceInConditional(
  schema: ComponentSchema,
  value: any,
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
function replaceInArray(
  schema: ComponentSchema,
  value: any,
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
    return replaceInObject(schema, value, newValue, key, newPath)
  }

  if (schema.kind === 'conditional') {
    return replaceInConditional(schema, value, newValue, key, newPath)
  }

  if (schema.kind === 'array') {
    return replaceInArray(schema, value, newValue, key, newPath)
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