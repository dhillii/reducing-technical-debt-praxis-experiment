import type { DocumentFeatures } from '../../views-shared'
import type { DocumentFeaturesForNormalization } from '../document-features-normalization'
import { type Mark, assert } from '../utils'
import type { ComponentSchema, ChildField } from './api-shared'
import { getKeysForArrayValue, setKeysForArrayValue } from './preview-props'

type PathToChildFieldWithOption = { path: ReadonlyPropPath; options: ChildField['options'] }

/** @internal Dispatches schema traversal based on schema kind */
const schemaKindHandlers = {
  form: () => [],
  relationship: () => [],
  child: (path: ReadonlyPropPath, schema: ComponentSchema) => [{ path, options: (schema as any).options }],
  conditional: (value: any, schema: ComponentSchema, path: ReadonlyPropPath, recurse: Function) =>
    recurse(value.value, schema.values[value.discriminant], path.concat('value')),
  object: (value: any, schema: ComponentSchema, path: ReadonlyPropPath, recurse: Function) => {
    const paths: PathToChildFieldWithOption[] = []
    Object.keys(schema.fields).forEach(key => {
      paths.push(...recurse(value[key], schema.fields[key], path.concat(key)))
    })
    return paths
  },
  array: (value: any, schema: ComponentSchema, path: ReadonlyPropPath, recurse: Function) => {
    const paths: PathToChildFieldWithOption[] = []
    ;(value as any[]).forEach((val, i) => {
      paths.push(...recurse(val, schema.element, path.concat(i)))
    })
    return paths
  },
}

export function findChildPropPathsForProp(
  value: any,
  schema: ComponentSchema,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  const handler = schemaKindHandlers[schema.kind as keyof typeof schemaKindHandlers]
  if (schema.kind === 'form' || schema.kind === 'relationship') {
    return handler()
  }
  if (schema.kind === 'child') {
    return handler(path, schema)
  }
  return handler(value, schema, path, findChildPropPathsForProp)
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

/** @internal Determines if inline marks should be inherited */
function shouldInheritInlineMarks(inlineMarksFromOptions: any): boolean {
  return inlineMarksFromOptions === 'inherit'
}

/** @internal Builds inline marks object from editor features and options */
function buildInlineMarks(
  editorDocumentFeatures: DocumentFeatures,
  inlineMarksFromOptions: any
): 'inherit' | Record<Mark, boolean> {
  if (shouldInheritInlineMarks(inlineMarksFromOptions)) {
    return 'inherit'
  }
  return Object.fromEntries(
    Object.keys(editorDocumentFeatures.formatting.inlineMarks).map(mark => {
      return [mark as Mark, !!(inlineMarksFromOptions || {})[mark as Mark]]
    })
  ) as Record<Mark, boolean>
}

/** @internal Builds inline child field features */
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

/** @internal Builds block child field features */
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
      formatting: {
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
  const inlineMarksFromOptions = options.formatting?.inlineMarks
  const inlineMarks = buildInlineMarks(editorDocumentFeatures, inlineMarksFromOptions)

  if (options.kind === 'inline') {
    return buildInlineFeatures(inlineMarks, options)
  }
  return buildBlockFeatures(inlineMarks, options, editorDocumentFeatures)
}

/** @internal Handles conditional schema path resolution */
function handleConditionalPath(
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

/** @internal Handles object schema path resolution */
function handleObjectPath(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
): undefined | ComponentSchema {
  const key = path.shift()!
  return getSchemaAtPropPathInner(path, (value as any)[key], schema.fields[key])
}

/** @internal Handles array schema path resolution */
function handleArrayPath(
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
    return handleConditionalPath(path, value, schema)
  }
  if (schema.kind === 'object') {
    return handleObjectPath(path, value, schema)
  }
  if (schema.kind === 'array') {
    return handleArrayPath(path, value, schema)
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

/** @internal Validates conditional schema value */
function validateConditional(schema: ComponentSchema, value: any): boolean {
  if (!('discriminant' in value) || !('value' in value)) return false
  if (!schema.discriminant.validate(value.discriminant)) return false
  return clientSideValidateProp(
    schema.values[value.discriminant as string],
    value.value
  )
}

/** @internal Validates object schema value */
function validateObject(schema: ComponentSchema, value: any): boolean {
  for (const [key, childProp] of Object.entries(schema.fields)) {
    if (!clientSideValidateProp(childProp, value[key])) return false
  }
  return true
}

/** @internal Validates array schema value */
function validateArray(schema: ComponentSchema, value: any): boolean {
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

  if (schema.kind === 'conditional') return validateConditional(schema, value)
  if (schema.kind === 'object') return validateObject(schema, value)
  if (schema.kind === 'array') return validateArray(schema, value)

  assertNever(schema)
}

/** @internal Handles array ancestor schema resolution */
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

/** @internal Handles conditional ancestor schema resolution */
function handleConditionalAncestor(
  currentProp: ComponentSchema,
  currentValue: unknown
): { prop: ComponentSchema; value: unknown } {
  return {
    prop: currentProp.values[(currentValue as any).discriminant],
    value: (currentValue as any).value,
  }
}

/** @internal Handles object ancestor schema resolution */
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
    let result: { prop: ComponentSchema; value: unknown } | null = null

    if (currentProp.kind === 'array') {
      result = handleArrayAncestor(currentProp, currentValue, key)
    } else if (currentProp.kind === 'conditional') {
      result = handleConditionalAncestor(currentProp, currentValue)
    } else if (currentProp.kind === 'object') {
      result = handleObjectAncestor(currentProp, currentValue, key)
    } else if (
      currentProp.kind === 'child' ||
      currentProp.kind === 'form' ||
      currentProp.kind === 'relationship'
    ) {
      throw new Error(`unexpected prop "${key}"`)
    } else {
      assertNever(currentProp)
    }

    if (result) {
      currentProp = result.prop
      currentValue = result.value
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

/** @internal Handles form/relationship/child schema traversal */
function traverseLeafSchema(
  schema: ComponentSchema,
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath
): void {
  visitor(schema, value, path)
}

/** @internal Handles object schema traversal */
function traverseObjectSchema(
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

/** @internal Handles array schema traversal */
function traverseArraySchema(
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

/** @internal Handles conditional schema traversal */
function traverseConditionalSchema(
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
    traverseLeafSchema(schema, value, visitor, path)
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

/** @internal Handles object value replacement */
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

/** @internal Handles conditional value replacement */
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

/** @internal Handles array value replacement */
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