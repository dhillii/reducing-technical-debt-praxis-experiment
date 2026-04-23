import type { DocumentFeatures } from '../../views-shared'
import type { DocumentFeaturesForNormalization } from '../document-features-normalization'
import { type Mark, assert } from '../utils'
import type { ComponentSchema, ChildField } from './api-shared'
import { getKeysForArrayValue, setKeysForArrayValue } from './preview-props'

type PathToChildFieldWithOption = { path: ReadonlyPropPath; options: ChildField['options'] }

function isLeafSchema(schema: ComponentSchema): boolean {
  return schema.kind === 'form' || schema.kind === 'relationship' || schema.kind === 'child'
}

function isConditionalSchema(schema: ComponentSchema): schema is ComponentSchema & { kind: 'conditional' } {
  return schema.kind === 'conditional'
}

function isObjectSchema(schema: ComponentSchema): schema is ComponentSchema & { kind: 'object' } {
  return schema.kind === 'object'
}

function isArraySchema(schema: ComponentSchema): schema is ComponentSchema & { kind: 'array' } {
  return schema.kind === 'array'
}

export function findChildPropPathsForProp(
  value: any,
  schema: ComponentSchema,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  if (isLeafSchema(schema)) {
    return []
  }

  if (schema.kind === 'child') {
    return [{ path: path, options: schema.options }]
  }

  if (isConditionalSchema(schema)) {
    return findChildPropPathsForProp(
      value.value,
      schema.values[value.discriminant],
      path.concat('value')
    )
  }

  if (isObjectSchema(schema)) {
    const paths: PathToChildFieldWithOption[] = []
    Object.keys(schema.fields).forEach(key => {
      paths.push(...findChildPropPathsForProp(value[key], schema.fields[key], path.concat(key)))
    })
    return paths
  }

  if (isArraySchema(schema)) {
    const paths: PathToChildFieldWithOption[] = []
    ;(value as any[]).forEach((val, i) => {
      paths.push(...findChildPropPathsForProp(val, schema.element, path.concat(i)))
    })
    return paths
  }

  assertNever(schema)
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

function getInlineMarksFromOptions(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): 'inherit' | Record<Mark, boolean> {
  const inlineMarksFromOptions = options.formatting?.inlineMarks

  if (inlineMarksFromOptions === 'inherit') {
    return 'inherit'
  }

  return Object.fromEntries(
    Object.keys(editorDocumentFeatures.formatting.inlineMarks).map(mark => {
      return [mark as Mark, !!(inlineMarksFromOptions || {})[mark as Mark]]
    })
  ) as Record<Mark, boolean>
}

function getDocumentFeaturesForInlineChild(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): DocumentFeaturesForChildField['inline'] {
  const inlineMarks = getInlineMarksFromOptions(editorDocumentFeatures, options)

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

function getDocumentFeaturesForBlockChild(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): DocumentFeaturesForChildField['block'] {
  const inlineMarks = getInlineMarksFromOptions(editorDocumentFeatures, options)
  const softBreaks = options.formatting?.softBreaks === 'inherit'

  return {
    kind: 'block',
    inlineMarks,
    softBreaks,
    componentBlocks: options.componentBlocks === 'inherit',
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
  }
}

export function getDocumentFeaturesForChildField(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): DocumentFeaturesForChildField {
  if (options.kind === 'inline') {
    return getDocumentFeaturesForInlineChild(editorDocumentFeatures, options)
  }
  return getDocumentFeaturesForBlockChild(editorDocumentFeatures, options)
}

function getSchemaAtPropPathInner(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
): undefined | ComponentSchema {
  if (path.length === 0) return schema
  if (isLeafSchema(schema)) return
  if (isConditionalSchema(schema)) {
    const key = path.shift()
    if (key === 'discriminant')
      return getSchemaAtPropPathInner(path, (value as any).discriminant, schema.discriminant)
    if (key === 'value') {
      const propVal = schema.values[(value as any).discriminant]
      return getSchemaAtPropPathInner(path, (value as any).value, propVal)
    }
    return
  }
  if (isObjectSchema(schema)) {
    const key = path.shift()!
    return getSchemaAtPropPathInner(path, (value as any)[key], schema.fields[key])
  }
  if (isArraySchema(schema)) {
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

function validateLeafSchema(schema: ComponentSchema, value: unknown): boolean {
  if (schema.kind === 'child') return true
  if (schema.kind === 'relationship') return true
  if (schema.kind === 'form') return schema.validate(value)
  return false
}

function validateConditionalSchema(schema: ComponentSchema, value: unknown): boolean {
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

function validateObjectSchema(schema: ComponentSchema, value: unknown): boolean {
  if (typeof value !== 'object') return false
  if (value === null) return false
  for (const [key, childProp] of Object.entries(schema.fields)) {
    if (!clientSideValidateProp(childProp, (value as any)[key])) return false
  }
  return true
}

function validateArraySchema(schema: ComponentSchema, value: unknown): boolean {
  if (!Array.isArray(value)) return false
  for (const innerVal of value) {
    if (!clientSideValidateProp(schema.element, innerVal)) return false
  }
  return true
}

export function clientSideValidateProp(schema: ComponentSchema, value: unknown): boolean {
  if (validateLeafSchema(schema, value)) return true
  if (isConditionalSchema(schema)) return validateConditionalSchema(schema, value)
  if (isObjectSchema(schema)) return validateObjectSchema(schema, value)
  if (isArraySchema(schema)) return validateArraySchema(schema, value)
  return false
}

function getAncestorSchemaAtStep(
  currentProp: ComponentSchema,
  key: string | number,
  currentValue: unknown,
  value: unknown
): ComponentSchema {
  if (currentProp.kind === 'array') {
    return currentProp.element
  }
  if (currentProp.kind === 'conditional') {
    return currentProp.values[(value as any).discriminant]
  }
  if (currentProp.kind === 'object') {
    return currentProp.fields[key]
  }
  if (isLeafSchema(currentProp)) {
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
    const key = currentPath.shift()! // this code only runs when path.length is truthy so this non-null assertion is fine
    currentProp = getAncestorSchemaAtStep(currentProp, key, currentValue, value)
    if (currentProp.kind === 'array') {
      currentValue = (currentValue as any)[key]
    } else if (currentProp.kind === 'conditional') {
      currentValue = (currentValue as any).value
    } else if (currentProp.kind === 'object') {
      currentValue = (currentValue as any)[key]
    } else if (isLeafSchema(currentProp)) {
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

function traverseLeafSchema(schema: ComponentSchema, value: unknown, visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void, path: ReadonlyPropPath) {
  visitor(schema, value, path)
}

function traverseObjectSchema(schema: ComponentSchema, value: unknown, visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void, path: ReadonlyPropPath) {
  for (const [key, childProp] of Object.entries(schema.fields)) {
    traverseProps(childProp, (value as any)[key], visitor, [...path, key])
  }
  visitor(schema, value, path)
}

function traverseArraySchema(schema: ComponentSchema, value: unknown, visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void, path: ReadonlyPropPath) {
  for (const [idx, val] of (value as unknown[]).entries()) {
    traverseProps(schema.element, val, visitor, path.concat(idx))
  }
  visitor(schema, value, path)
}

function traverseConditionalSchema(schema: ComponentSchema, value: unknown, visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void, path: ReadonlyPropPath) {
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
  if (isLeafSchema(schema)) {
    traverseLeafSchema(schema, value, visitor, path)
    return
  }
  if (isObjectSchema(schema)) {
    traverseObjectSchema(schema, value, visitor, path)
    return
  }
  if (isArraySchema(schema)) {
    traverseArraySchema(schema, value, visitor, path)
    return
  }
  if (isConditionalSchema(schema)) {
    traverseConditionalSchema(schema, value, visitor, path)
    return
  }
  assertNever(schema)
}

function replaceValueAtPropPathLeaf(
  schema: ComponentSchema,
  value: unknown,
  newValue: unknown,
  path: ReadonlyPropPath
): unknown {
  if (path.length === 0) return newValue
  return value
}

function replaceValueAtPropPathObject(
  schema: ComponentSchema,
  value: unknown,
  newValue: unknown,
  path: ReadonlyPropPath
): unknown {
  if (path.length === 0) return newValue

  const [key, ...newPath] = path

  return {
    ...(value as any),
    [key]: replaceValueAtPropPath(schema.fields[key], (value as any)[key], newValue, newPath),
  }
}

function replaceValueAtPropPathConditional(
  schema: ComponentSchema,
  value: unknown,
  newValue: unknown,
  path: ReadonlyPropPath
): unknown {
  if (path.length === 0) return newValue

  const [key, ...newPath] = path

  // replaceValueAtPropPath should not be used to only update the discriminant of a conditional field
  // if you want to update the discriminant of a conditional field, replace the value of the whole conditional field
  assert(key === 'value')

  const conditionalValue = value as { discriminant: string | boolean; value: unknown }
  return {
    discriminant: conditionalValue.discriminant,
    value: replaceValueAtPropPath(schema.values[key], conditionalValue.value, newValue, newPath),
  }
}

function replaceValueAtPropPathArray(
  schema: ComponentSchema,
  value: unknown,
  newValue: unknown,
  path: ReadonlyPropPath
): unknown {
  if (path.length === 0) return newValue

  const [key, ...newPath] = path

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

  if (isObjectSchema(schema)) {
    return replaceValueAtPropPathObject(schema, value, newValue, path)
  }

  if (isConditionalSchema(schema)) {
    return replaceValueAtPropPathConditional(schema, value, newValue, path)
  }

  if (isArraySchema(schema)) {
    return replaceValueAtPropPathArray(schema, value, newValue, path)
  }

  // we should never reach here since form, relationship or child fields don't contain other fields
  // so the only thing that can happen to them is to be replaced which happens at the start of this function when path.length === 0
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