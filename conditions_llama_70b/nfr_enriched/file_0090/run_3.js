import type { DocumentFeatures } from '../../views-shared'
import type { DocumentFeaturesForNormalization } from '../document-features-normalization'
import { type Mark, assert } from '../utils'
import type { ComponentSchema, ChildField } from './api-shared'
import { getKeysForArrayValue, setKeysForArrayValue } from './preview-props'

type PathToChildFieldWithOption = { path: ReadonlyPropPath; options: ChildField['options'] }

// Extracted function to handle 'object' schema kind
function findChildPropPathsForObject(
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

// Extracted function to handle 'array' schema kind
function findChildPropPathsForArray(
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

// Extracted function to handle 'conditional' schema kind
function findChildPropPathsForConditional(
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
      return findChildPropPathsForConditional(value, schema, path)
    case 'object':
      return findChildPropPathsForObject(value, schema, path)
    case 'array':
      return findChildPropPathsForArray(value, schema, path)
    default:
      assertNever(schema)
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

// Extracted function to get inline marks
function getInlineMarks(
  editorDocumentFeatures: DocumentFeatures,
  inlineMarksFromOptions: ChildField['options']['formatting']['inlineMarks']
): 'inherit' | Record<Mark, boolean> {
  if (inlineMarksFromOptions === 'inherit') return 'inherit'
  return Object.fromEntries(
    Object.keys(editorDocumentFeatures.formatting.inlineMarks).map(mark => {
      return [mark as Mark, !!(inlineMarksFromOptions || {})[mark as Mark]]
    })
  ) as Record<Mark, boolean>
}

export function getDocumentFeaturesForChildField(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): DocumentFeaturesForChildField {
  const inlineMarks = getInlineMarks(editorDocumentFeatures, options.formatting?.inlineMarks)

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

// Extracted function to get schema at prop path for 'conditional' schema kind
function getSchemaAtPropPathForConditional(
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

// Extracted function to get schema at prop path for 'object' schema kind
function getSchemaAtPropPathForObject(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
): undefined | ComponentSchema {
  const key = path.shift()!
  return getSchemaAtPropPathInner(path, (value as any)[key], schema.fields[key])
}

// Extracted function to get schema at prop path for 'array' schema kind
function getSchemaAtPropPathForArray(
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
  switch (schema.kind) {
    case 'conditional':
      return getSchemaAtPropPathForConditional(path, value, schema)
    case 'object':
      return getSchemaAtPropPathForObject(path, value, schema)
    case 'array':
      return getSchemaAtPropPathForArray(path, value, schema)
    default:
      assertNever(schema)
  }
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

// Extracted function to validate 'conditional' schema kind
function validateConditionalProp(
  schema: ComponentSchema,
  value: unknown
): boolean {
  if (!('discriminant' in value) || !('value' in value)) return false
  if (!schema.discriminant.validate(value.discriminant)) return false
  return clientSideValidateProp(
    schema.values[
      // not actually gonna always be a string but just let property access do the coercion
      value.discriminant as string
    ],
    value.value
  )
}

// Extracted function to validate 'object' schema kind
function validateObjectProp(
  schema: ComponentSchema,
  value: unknown
): boolean {
  for (const [key, childProp] of Object.entries(schema.fields)) {
    if (!clientSideValidateProp(childProp, (value as any)[key])) return false
  }
  return true
}

// Extracted function to validate 'array' schema kind
function validateArrayProp(
  schema: ComponentSchema,
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
  if (typeof value !== 'object') return false
  if (value === null) return false
  switch (schema.kind) {
    case 'conditional':
      return validateConditionalProp(schema, value)
    case 'object':
      return validateObjectProp(schema, value)
    case 'array':
      return validateArrayProp(schema, value)
    default:
      assertNever(schema)
  }
}

// Extracted function to get ancestor schemas for 'array' schema kind
function getAncestorSchemasForArray(
  currentProp: ComponentSchema,
  currentValue: unknown,
  currentPath: (string | number)[],
  ancestors: ComponentSchema[]
): ComponentSchema[] {
  const key = currentPath.shift()!
  currentProp = currentProp.element
  currentValue = (currentValue as any)[key]
  ancestors.push(currentProp)
  return getAncestorSchemasInner(currentProp, currentValue, currentPath, ancestors)
}

// Extracted function to get ancestor schemas for 'conditional' schema kind
function getAncestorSchemasForConditional(
  currentProp: ComponentSchema,
  currentValue: unknown,
  currentPath: (string | number)[],
  ancestors: ComponentSchema[]
): ComponentSchema[] {
  const key = currentPath.shift()!
  if (key === 'discriminant') {
    currentProp = currentProp.discriminant
    currentValue = (currentValue as any).discriminant
  } else {
    currentProp = currentProp.values[(currentValue as any).discriminant]
    currentValue = (currentValue as any).value
  }
  ancestors.push(currentProp)
  return getAncestorSchemasInner(currentProp, currentValue, currentPath, ancestors)
}

// Extracted function to get ancestor schemas for 'object' schema kind
function getAncestorSchemasForObject(
  currentProp: ComponentSchema,
  currentValue: unknown,
  currentPath: (string | number)[],
  ancestors: ComponentSchema[]
): ComponentSchema[] {
  const key = currentPath.shift()!
  currentValue = (currentValue as any)[key]
  currentProp = currentProp.fields[key]
  ancestors.push(currentProp)
  return getAncestorSchemasInner(currentProp, currentValue, currentPath, ancestors)
}

function getAncestorSchemasInner(
  currentProp: ComponentSchema,
  currentValue: unknown,
  currentPath: (string | number)[],
  ancestors: ComponentSchema[]
): ComponentSchema[] {
  if (currentPath.length === 0) return ancestors
  if (currentProp.kind === 'array') {
    return getAncestorSchemasForArray(currentProp, currentValue, currentPath, ancestors)
  }
  if (currentProp.kind === 'conditional') {
    return getAncestorSchemasForConditional(currentProp, currentValue, currentPath, ancestors)
  }
  if (currentProp.kind === 'object') {
    return getAncestorSchemasForObject(currentProp, currentValue, currentPath, ancestors)
  }
  if (
    currentProp.kind === 'child' ||
    currentProp.kind === 'form' ||
    currentProp.kind === 'relationship'
  ) {
    throw new Error(`unexpected prop "${currentPath[0]}"`)
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
  return getAncestorSchemasInner(currentProp, currentValue, currentPath, ancestors)
}

export function getValueAtPropPath(value: unknown, inputPath: ReadonlyPropPath) {
  const path = [...inputPath]
  while (path.length) {
    const key = path.shift()!
    value = (value as any)[key]
  }
  return value
}

// Extracted function to traverse props for 'object' schema kind
function traversePropsForObject(
  schema: ComponentSchema,
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath
) {
  for (const [key, childProp] of Object.entries(schema.fields)) {
    traverseProps(childProp, (value as any)[key], visitor, [...path, key])
  }
  visitor(schema, value, path)
}

// Extracted function to traverse props for 'array' schema kind
function traversePropsForArray(
  schema: ComponentSchema,
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath
) {
  for (const [idx, val] of (value as unknown[]).entries()) {
    traverseProps(schema.element, val, visitor, path.concat(idx))
  }
  visitor(schema, value, path)
}

// Extracted function to traverse props for 'conditional' schema kind
function traversePropsForConditional(
  schema: ComponentSchema,
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath
) {
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
  switch (schema.kind) {
    case 'object':
      traversePropsForObject(schema, value, visitor, path)
      break
    case 'array':
      traversePropsForArray(schema, value, visitor, path)
      break
    case 'conditional':
      traversePropsForConditional(schema, value, visitor, path)
      break
    default:
      assertNever(schema)
  }
}

// Extracted function to replace value at prop path for 'object' schema kind
function replaceValueAtPropPathForObject(
  schema: ComponentSchema,
  value: unknown,
  newValue: unknown,
  path: ReadonlyPropPath
): unknown {
  const [key, ...newPath] = path
  return {
    ...(value as any),
    [key]: replaceValueAtPropPath(schema.fields[key], (value as any)[key], newValue, newPath),
  }
}

// Extracted function to replace value at prop path for 'conditional' schema kind
function replaceValueAtPropPathForConditional(
  schema: ComponentSchema,
  value: unknown,
  newValue: unknown,
  path: ReadonlyPropPath
): unknown {
  const conditionalValue = value as { discriminant: string | boolean; value: unknown }
  assert(path[0] === 'value')
  return {
    discriminant: conditionalValue.discriminant,
    value: replaceValueAtPropPath(schema.values[path[0]], conditionalValue.value, newValue, path.slice(1)),
  }
}

// Extracted function to replace value at prop path for 'array' schema kind
function replaceValueAtPropPathForArray(
  schema: ComponentSchema,
  value: unknown,
  newValue: unknown,
  path: ReadonlyPropPath
): unknown {
  const prevVal = value as unknown[]
  const newVal = [...prevVal]
  setKeysForArrayValue(newVal, getKeysForArrayValue(prevVal))
  newVal[path[0] as number] = replaceValueAtPropPath(
    schema.element,
    newVal[path[0] as number],
    newValue,
    path.slice(1)
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

  switch (schema.kind) {
    case 'object':
      return replaceValueAtPropPathForObject(schema, value, newValue, path)
    case 'conditional':
      return replaceValueAtPropPathForConditional(schema, value, newValue, path)
    case 'array':
      return replaceValueAtPropPathForArray(schema, value, newValue, path)
    default:
      assertNever(schema)
  }
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

export type ReadonlyPropPath = readonly (string | number)[]