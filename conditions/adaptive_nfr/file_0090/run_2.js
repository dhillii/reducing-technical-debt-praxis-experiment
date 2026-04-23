import type { DocumentFeatures } from '../../views-shared'
import type { DocumentFeaturesForNormalization } from '../document-features-normalization'
import { type Mark, assert } from '../utils'
import type { ComponentSchema, ChildField } from './api-shared'
import { getKeysForArrayValue, setKeysForArrayValue } from './preview-props'

type PathToChildFieldWithOption = { path: ReadonlyPropPath; options: ChildField['options'] }

/** Strategy map for finding child prop paths by schema kind */
const findChildPropPathsStrategies: Record<
  ComponentSchema['kind'],
  (value: any, schema: ComponentSchema, path: ReadonlyPropPath) => PathToChildFieldWithOption[]
> = {
  form: () => [],
  relationship: () => [],
  child: (value, schema, path) => [{ path, options: schema.options }],
  conditional: (value, schema, path) =>
    findChildPropPathsForProp(value.value, schema.values[value.discriminant], path.concat('value')),
  object: (value, schema, path) => {
    const paths: PathToChildFieldWithOption[] = []
    Object.keys(schema.fields).forEach(key => {
      paths.push(...findChildPropPathsForProp(value[key], schema.fields[key], path.concat(key)))
    })
    return paths
  },
  array: (value, schema, path) => {
    const paths: PathToChildFieldWithOption[] = []
    ;(value as any[]).forEach((val, i) => {
      paths.push(...findChildPropPathsForProp(val, schema.element, path.concat(i)))
    })
    return paths
  },
}

export function findChildPropPathsForProp(
  value: any,
  schema: ComponentSchema,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  const strategy = findChildPropPathsStrategies[schema.kind]
  return strategy(value, schema as any, path)
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

/** Determines if inline marks should be inherited */
function shouldInheritInlineMarks(
  inlineMarksFromOptions: Record<Mark, boolean> | undefined
): boolean {
  return inlineMarksFromOptions === 'inherit'
}

/** Builds inline marks configuration from options and editor features */
function buildInlineMarks(
  inlineMarksFromOptions: Record<Mark, boolean> | undefined,
  editorInlineMarks: Record<Mark, boolean>
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

/** Creates inline child field document features */
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

/** Creates block child field document features */
function createBlockDocumentFeatures(
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
  const inlineMarks = buildInlineMarks(inlineMarksFromOptions, editorDocumentFeatures.formatting.inlineMarks)

  if (options.kind === 'inline') {
    return createInlineDocumentFeatures(inlineMarks, options)
  }
  return createBlockDocumentFeatures(inlineMarks, options, editorDocumentFeatures)
}

/** Handles conditional schema path traversal */
function handleConditionalPath(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema & { kind: 'conditional' }
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

/** Handles object schema path traversal */
function handleObjectPath(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema & { kind: 'object' }
): undefined | ComponentSchema {
  const key = path.shift()!
  return getSchemaAtPropPathInner(path, (value as any)[key], schema.fields[key])
}

/** Handles array schema path traversal */
function handleArrayPath(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema & { kind: 'array' }
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

/** Validates conditional schema value */
function validateConditional(
  schema: ComponentSchema & { kind: 'conditional' },
  value: unknown
): boolean {
  if (!('discriminant' in value) || !('value' in value)) return false
  if (!schema.discriminant.validate((value as any).discriminant)) return false
  return clientSideValidateProp(
    schema.values[(value as any).discriminant as string],
    (value as any).value
  )
}

/** Validates object schema value */
function validateObject(
  schema: ComponentSchema & { kind: 'object' },
  value: unknown
): boolean {
  for (const [key, childProp] of Object.entries(schema.fields)) {
    if (!clientSideValidateProp(childProp, (value as any)[key])) return false
  }
  return true
}

/** Validates array schema value */
function validateArray(
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

  if (schema.kind === 'conditional') return validateConditional(schema, value)
  if (schema.kind === 'object') return validateObject(schema, value)
  if (schema.kind === 'array') return validateArray(schema, value)

  assertNever(schema)
}

/** Handles array ancestor traversal */
function handleArrayAncestor(
  currentProp: ComponentSchema & { kind: 'array' },
  currentValue: unknown,
  key: string | number
): { currentProp: ComponentSchema; currentValue: unknown } {
  return {
    currentProp: currentProp.element,
    currentValue: (currentValue as any)[key],
  }
}

/** Handles conditional ancestor traversal */
function handleConditionalAncestor(
  currentProp: ComponentSchema & { kind: 'conditional' },
  currentValue: unknown
): { currentProp: ComponentSchema; currentValue: unknown } {
  return {
    currentProp: currentProp.values[(currentValue as any).discriminant],
    currentValue: (currentValue as any).value,
  }
}

/** Handles object ancestor traversal */
function handleObjectAncestor(
  currentProp: ComponentSchema & { kind: 'object' },
  currentValue: unknown,
  key: string | number
): { currentProp: ComponentSchema; currentValue: unknown } {
  return {
    currentProp: currentProp.fields[key],
    currentValue: (currentValue as any)[key],
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
      currentProp = result.currentProp
      currentValue = result.currentValue
    } else if (currentProp.kind === 'conditional') {
      const result = handleConditionalAncestor(currentProp, currentValue)
      currentProp = result.currentProp
      currentValue = result.currentValue
    } else if (currentProp.kind === 'object') {
      const result = handleObjectAncestor(currentProp, currentValue, key)
      currentProp = result.currentProp
      currentValue = result.currentValue
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

/** Visits form/relationship/child schema */
function visitLeafSchema(
  schema: ComponentSchema,
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath
): void {
  visitor(schema, value, path)
}

/** Visits object schema and its children */
function visitObjectSchema(
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

/** Visits array schema and its children */
function visitArraySchema(
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

/** Visits conditional schema and its children */
function visitConditionalSchema(
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
    visitLeafSchema(schema, value, visitor, path)
    return
  }
  if (schema.kind === 'object') {
    visitObjectSchema(schema, value, visitor, path)
    return
  }
  if (schema.kind === 'array') {
    visitArraySchema(schema, value, visitor, path)
    return
  }
  if (schema.kind === 'conditional') {
    visitConditionalSchema(schema, value, visitor, path)
    return
  }
  assertNever(schema)
}

/** Replaces value in object schema */
function replaceObjectValue(
  schema: ComponentSchema & { kind: 'object' },
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

/** Replaces value in conditional schema */
function replaceConditionalValue(
  schema: ComponentSchema & { kind: 'conditional' },
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

/** Replaces value in array schema */
function replaceArrayValue(
  schema: ComponentSchema & { kind: 'array' },
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