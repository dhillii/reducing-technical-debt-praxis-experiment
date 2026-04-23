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
      return findChildPropPathsForProp(
        value.value,
        schema.values[value.discriminant],
        path.concat('value')
      )
    case 'object': {
      const paths: PathToChildFieldWithOption[] = []
      Object.keys(schema.fields).forEach(key => {
        paths.push(
          ...findChildPropPathsForProp(value[key], schema.fields[key], path.concat(key))
        )
      })
      return paths
    }
    case 'array': {
      const paths: PathToChildFieldWithOption[] = []
      ;(value as any[]).forEach((val, i) => {
        paths.push(...findChildPropPathsForProp(val, schema.element, path.concat(i)))
      })
      return paths
    }
  }
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

function computeInlineMarks(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): 'inherit' | Record<Mark, boolean> {
  const fromOptions = options.formatting?.inlineMarks
  if (fromOptions === 'inherit') return 'inherit'
  const result: Record<Mark, boolean> = {}
  Object.keys(editorDocumentFeatures.formatting.inlineMarks).forEach(mark => {
    result[mark as Mark] = !!(fromOptions || {})[mark as Mark]
  })
  return result
}

function buildBlockDocumentFeatures(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
) {
  return {
    layouts: [],
    dividers:
      options.dividers === 'inherit' ? editorDocumentFeatures.dividers : false,
    formatting: {
      alignment:
        options.formatting?.alignment === 'inherit'
          ? editorDocumentFeatures.formatting.alignment
          : { center: false, end: false },
      blockTypes:
        options.formatting?.blockTypes === 'inherit'
          ? editorDocumentFeatures.formatting.blockTypes
          : { blockquote: false, code: false },
      headingLevels:
        options.formatting?.headingLevels === 'inherit'
          ? editorDocumentFeatures.formatting.headingLevels
          : options.formatting?.headingLevels || [],
      listTypes:
        options.formatting?.listTypes === 'inherit'
          ? editorDocumentFeatures.formatting.listTypes
          : { ordered: false, unordered: false },
    },
    links: options.links === 'inherit',
    relationships: options.relationships === 'inherit',
  }
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
    documentFeatures: buildBlockDocumentFeatures(editorDocumentFeatures, options),
    componentBlocks: options.componentBlocks === 'inherit',
  }
}

function getSchemaAtPropPathInner(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
): undefined | ComponentSchema {
  if (path.length === 0) return schema
  if (schema.kind === 'child' || schema.kind === 'form' || schema.kind === 'relationship')
    return undefined

  const key = path.shift()!
  switch (schema.kind) {
    case 'conditional':
      if (key === 'discriminant')
        return getSchemaAtPropPathInner(
          path,
          (value as any).discriminant,
          schema.discriminant
        )
      if (key === 'value')
        return getSchemaAtPropPathInner(
          path,
          (value as any).value,
          schema.values[(value as any).discriminant]
        )
      return undefined
    case 'object':
      return getSchemaAtPropPathInner(
        path,
        (value as any)[key],
        schema.fields[key]
      )
    case 'array':
      return getSchemaAtPropPathInner(
        path,
        (value as any)[key],
        schema.element
      )
  }
  assertNever(schema)
}

export function getSchemaAtPropPath(
  path: ReadonlyPropPath,
  value: Record<string, unknown>,
  props: Record<string, ComponentSchema>
): undefined | ComponentSchema {
  return getSchemaAtPropPathInner([...path], value, { kind: 'object', fields: props })
}

/** Validate a value against a schema on the client side. */
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
  }
  assertNever(schema)
}

/** Validate a conditional schema. */
function validateConditional(
  schema: ComponentSchema & { kind: 'conditional' },
  value: { discriminant: any; value: any }
): boolean {
  if (!('discriminant' in value) || !('value' in value)) return false
  if (!schema.discriminant.validate(value.discriminant)) return false
  const innerSchema = schema.values[value.discriminant as string]
  return clientSideValidateProp(innerSchema, value.value)
}

/** Validate an object schema. */
function validateObject(
  schema: ComponentSchema & { kind: 'object' },
  value: Record<string, any>
): boolean {
  for (const [key, child] of Object.entries(schema.fields)) {
    if (!clientSideValidateProp(child, value[key])) return false
  }
  return true
}

/** Validate an array schema. */
function validateArray(
  schema: ComponentSchema & { kind: 'array' },
  value: unknown[]
): boolean {
  if (!Array.isArray(value)) return false
  for (const item of value) {
    if (!clientSideValidateProp(schema.element, item)) return false
  }
  return true
}

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

    switch (currentSchema.kind) {
      case 'array':
        currentSchema = currentSchema.element
        currentValue = (currentValue as any)[key]
        break
      case 'conditional':
        currentSchema = currentSchema.values[(value as any).discriminant]
        currentValue = (currentValue as any).value
        break
      case 'object':
        currentValue = (currentValue as any)[key]
        currentSchema = currentSchema.fields[key]
        break
      case 'child':
      case 'form':
      case 'relationship':
        throw new Error(`unexpected prop "${key}"`)
      default:
        assertNever(currentSchema)
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
    for (const [key, child] of Object.entries(schema.fields)) {
      traverseProps(child, (value as any)[key], visitor, [...path, key])
    }
    visitor(schema, value, path)
    return
  }

  if (schema.kind === 'array') {
    (value as unknown[]).forEach((item, idx) => {
      traverseProps(schema.element, item, visitor, path.concat(idx))
    })
    visitor(schema, value, path)
    return
  }

  if (schema.kind === 'conditional') {
    const discriminant = (value as any).discriminant
    visitor(schema, discriminant, path.concat('discriminant'))
    traverseProps(
      schema.values[discriminant.toString()],
      (value as any).value,
      visitor,
      path.concat('value')
    )
    visitor(schema, value, path)
    return
  }

  assertNever(schema)
}

export function replaceValueAtPropPath(
  schema: ComponentSchema,
  value: unknown,
  newValue: unknown,
  path: ReadonlyPropPath
): unknown {
  if (path.length === 0) return newValue

  const [key, ...rest] = path

  if (schema.kind === 'object') {
    return {
      ...(value as any),
      [key]: replaceValueAtPropPath(schema.fields[key], (value as any)[key], newValue, rest),
    }
  }

  if (schema.kind === 'conditional') {
    const cond = value as { discriminant: string | boolean; value: unknown }
    assert(key === 'value')
    return {
      discriminant: cond.discriminant,
      value: replaceValueAtPropPath(
        schema.values[key],
        cond.value,
        newValue,
        rest
      ),
    }
  }

  if (schema.kind === 'array') {
    const prev = value as unknown[]
    const copy = [...prev]
    setKeysForArrayValue(copy, getKeysForArrayValue(prev))
    copy[key as number] = replaceValueAtPropPath(
      schema.element,
      copy[key as number],
      newValue,
      rest
    )
    return copy
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
  return field?.kind === 'child' ? field.options.placeholder : ''
}