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

/** Document features for a child field, derived from editor features and field options */
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

export function getDocumentFeaturesForChildField(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): DocumentFeaturesForChildField {
  const inlineMarks = computeInlineMarks(editorDocumentFeatures, options.formatting?.inlineMarks)

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
    componentBlocks: options.componentBlocks === 'inherit',
    documentFeatures: buildBlockDocumentFeatures(editorDocumentFeatures, options),
  }
}

/** Compute inline marks respecting inheritance */
function computeInlineMarks(
  editorFeatures: DocumentFeatures,
  marksOption?: Record<Mark, boolean> | 'inherit'
): 'inherit' | Record<Mark, boolean> {
  if (marksOption === 'inherit') return 'inherit'
  const result: Record<Mark, boolean> = {}
  Object.keys(editorFeatures.formatting.inlineMarks).forEach(mark => {
    result[mark as Mark] = !!(marksOption || {})[mark as Mark]
  })
  return result
}

/** Build block‑level document features based on editor features and field options */
function buildBlockDocumentFeatures(
  editorFeatures: DocumentFeatures,
  options: ChildField['options']
): DocumentFeaturesForNormalization {
  const formatting = options.formatting || {}
  return {
    layouts: [],
    dividers:
      options.dividers === 'inherit' ? editorFeatures.dividers : false,
    formatting: {
      alignment:
        formatting.alignment === 'inherit'
          ? editorFeatures.formatting.alignment
          : { center: false, end: false },
      blockTypes:
        formatting.blockTypes === 'inherit'
          ? editorFeatures.formatting.blockTypes
          : { blockquote: false, code: false },
      headingLevels:
        formatting.headingLevels === 'inherit'
          ? editorFeatures.formatting.headingLevels
          : formatting.headingLevels || [],
      listTypes:
        formatting.listTypes === 'inherit'
          ? editorFeatures.formatting.listTypes
          : { ordered: false, unordered: false },
    },
    links: options.links === 'inherit',
    relationships: options.relationships === 'inherit',
  }
}

/** Recursively locate a schema at a given prop path */
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
      return handleConditionalSchemaPath(path, value, schema, key)
    case 'object':
      return getSchemaAtPropPathInner(path, (value as any)[key], schema.fields[key])
    case 'array':
      return getSchemaAtPropPathInner(path, (value as any)[key], schema.element)
    default:
      return assertNever(schema)
  }
}

/** Resolve schema for a conditional field */
function handleConditionalSchemaPath(
  remainingPath: (string | number)[],
  value: unknown,
  schema: ComponentSchema & { kind: 'conditional' },
  key: string | number
): undefined | ComponentSchema {
  if (key === 'discriminant')
    return getSchemaAtPropPathInner(remainingPath, (value as any).discriminant, schema.discriminant)
  if (key === 'value') {
    const branch = schema.values[(value as any).discriminant]
    return getSchemaAtPropPathInner(remainingPath, (value as any).value, branch)
  }
  return undefined
}

export function getSchemaAtPropPath(
  path: ReadonlyPropPath,
  value: Record<string, unknown>,
  props: Record<string, ComponentSchema>
): undefined | ComponentSchema {
  return getSchemaAtPropPathInner([...path], value, { kind: 'object', fields: props })
}

/** Validate a prop value on the client side according to its schema */
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
    default:
      return assertNever(schema)
  }
}

/** Validate a conditional field */
function validateConditional(
  schema: ComponentSchema & { kind: 'conditional' },
  value: { discriminant: any; value: any }
): boolean {
  if (!('discriminant' in value) || !('value' in value)) return false
  if (!schema.discriminant.validate(value.discriminant)) return false
  const branch = schema.values[value.discriminant as string]
  return clientSideValidateProp(branch, value.value)
}

/** Validate an object field */
function validateObject(
  schema: ComponentSchema & { kind: 'object' },
  value: Record<string, any>
): boolean {
  for (const [key, child] of Object.entries(schema.fields)) {
    if (!clientSideValidateProp(child, value[key])) return false
  }
  return true
}

/** Validate an array field */
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

/** Retrieve all ancestor schemas for a given prop path */
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
    const next = advanceSchema(currentSchema, currentValue, key)
    currentSchema = next.schema
    currentValue = next.value
  }

  return ancestors
}

/** Advance one step in the schema/value hierarchy */
function advanceSchema(
  schema: ComponentSchema,
  value: unknown,
  key: string | number
): { schema: ComponentSchema; value: unknown } {
  if (schema.kind === 'array') {
    return { schema: schema.element, value: (value as any)[key] }
  }
  if (schema.kind === 'conditional') {
    const discriminant = (value as any).discriminant
    return {
      schema: schema.values[discriminant],
      value: (value as any).value,
    }
  }
  if (schema.kind === 'object') {
    return { schema: schema.fields[key as string], value: (value as any)[key] }
  }
  throw new Error(`unexpected prop "${key}"`)
}

/** Retrieve a value at a given prop path */
export type ReadonlyPropPath = readonly (string | number)[]

export function getValueAtPropPath(value: unknown, inputPath: ReadonlyPropPath) {
  const path = [...inputPath]
  while (path.length) {
    const key = path.shift()!
    value = (value as any)[key]
  }
  return value
}

/** Traverse a schema/value tree, invoking a visitor for each node */
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

/** Replace a value at a specific prop path, returning a new value tree */
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
      [key]: replaceValueAtPropPath(schema.fields[key as string], (value as any)[key], newValue, rest),
    }
  }

  if (schema.kind === 'conditional') {
    const cond = value as { discriminant: string | boolean; value: unknown }
    assert(key === 'value')
    return {
      discriminant: cond.discriminant,
      value: replaceValueAtPropPath(
        schema.values[cond.discriminant.toString()],
        cond.value,
        newValue,
        rest
      ),
    }
  }

  if (schema.kind === 'array') {
    const arr = [...(value as unknown[])]
    setKeysForArrayValue(arr, getKeysForArrayValue(value as unknown[]))
    arr[key as number] = replaceValueAtPropPath(schema.element, arr[key as number], newValue, rest)
    return arr
  }

  assert(schema.kind !== 'form' && schema.kind !== 'relationship' && schema.kind !== 'child')
  return assertNever(schema)
}

/** Get placeholder text for a prop path, if the field is a child */
export function getPlaceholderTextForPropPath(
  propPath: ReadonlyPropPath,
  fields: Record<string, ComponentSchema>,
  formProps: Record<string, any>
): string {
  const field = getSchemaAtPropPath(propPath, formProps, fields)
  return field?.kind === 'child' ? field.options.placeholder : ''
}