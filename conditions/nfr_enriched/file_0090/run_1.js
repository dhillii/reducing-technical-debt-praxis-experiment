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

// Handles conditional schema type
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

// Handles object schema type
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

// Handles array schema type
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
  inlineMarksFromOptions: DocumentFeatures['formatting']['inlineMarks'] | undefined,
  editorInlineMarks: DocumentFeatures['formatting']['inlineMarks']
): 'inherit' | Record<Mark, boolean> {
  if (inlineMarksFromOptions === 'inherit') {
    return 'inherit'
  }
  return Object.fromEntries(
    Object.keys(editorInlineMarks).map(mark => {
      return [mark as Mark, !!(inlineMarksFromOptions || {})[mark as Mark]]
    })
  ) as Record<Mark, boolean>
}

// Builds inline child field features
function buildInlineFeatures(
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

// Builds block formatting features
function buildBlockFormatting(
  options: ChildField['options'],
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

// Builds block child field features
function buildBlockFeatures(
  inlineMarks: 'inherit' | Record<Mark, boolean>,
  options: ChildField['options'],
  editorDocumentFeatures: DocumentFeatures
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
  const inlineMarksFromOptions = options.formatting?.inlineMarks
  const inlineMarks = resolveInlineMarks(inlineMarksFromOptions, editorDocumentFeatures.formatting.inlineMarks)

  if (options.kind === 'inline') {
    return buildInlineFeatures(inlineMarks, options)
  }
  return buildBlockFeatures(inlineMarks, options, editorDocumentFeatures)
}

// Handles conditional schema in path traversal
function handleConditionalSchemaPath(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
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

// Handles object schema in path traversal
function handleObjectSchemaPath(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
): undefined | ComponentSchema {
  const key = path.shift()!
  return getSchemaAtPropPathInner(path, (value as any)[key], schema.fields[key])
}

// Handles array schema in path traversal
function handleArraySchemaPath(
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
    return handleConditionalSchemaPath(path, value, schema)
  }
  if (schema.kind === 'object') {
    return handleObjectSchemaPath(path, value, schema)
  }
  if (schema.kind === 'array') {
    return handleArraySchemaPath(path, value, schema)
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

// Validates conditional schema
function validateConditionalProp(schema: ComponentSchema, value: unknown): boolean {
  if (!('discriminant' in value) || !('value' in value)) return false
  if (!schema.discriminant.validate(value.discriminant)) return false
  return clientSideValidateProp(
    schema.values[value.discriminant as string],
    value.value
  )
}

// Validates object schema
function validateObjectProp(schema: ComponentSchema, value: unknown): boolean {
  for (const [key, childProp] of Object.entries(schema.fields)) {
    if (!clientSideValidateProp(childProp, (value as any)[key])) return false
  }
  return true
}

// Validates array schema
function validateArrayProp(schema: ComponentSchema, value: unknown): boolean {
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
function handleArrayAncestor(
  currentProp: ComponentSchema,
  currentValue: unknown,
  key: string | number
): { prop: ComponentSchema; value: unknown } {
  return {
    prop: currentProp.element,
    value: (currentValue as any)[key],
  }
}

// Handles conditional schema in ancestor traversal
function handleConditionalAncestor(
  currentProp: ComponentSchema,
  currentValue: unknown,
  value: unknown
): { prop: ComponentSchema; value: unknown } {
  return {
    prop: currentProp.values[(value as any).discriminant],
    value: (currentValue as any).value,
  }
}

// Handles object schema in ancestor traversal
function handleObjectAncestor(
  currentProp: ComponentSchema,
  currentValue: unknown,
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
      const result = handleArrayAncestor(currentProp, currentValue, key)
      currentProp = result.prop
      currentValue = result.value
    } else if (currentProp.kind === 'conditional') {
      const result = handleConditionalAncestor(currentProp, currentValue, value)
      currentProp = result.prop
      currentValue = result.value
    } else if (currentProp.kind === 'object') {
      const result = handleObjectAncestor(currentProp, currentValue, key)
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

// Traverses object schema properties
function traverseObjectProps(
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

// Traverses array schema properties
function traverseArrayProps(
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

// Traverses conditional schema properties
function traverseConditionalProps(
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
function replaceObjectValue(
  schema: ComponentSchema,
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
function replaceConditionalValue(
  schema: ComponentSchema,
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
function replaceArrayValue(
  schema: ComponentSchema,
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
    return replaceObjectValue(schema, value, newValue, key, newPath)
  }

  if (schema.kind === 'conditional') {
    return replaceConditionalValue(schema, value, newValue, key, newPath)
  }

  if (schema.kind === 'array') {
    return replaceArrayValue(schema, value, newValue, key, newPath)
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