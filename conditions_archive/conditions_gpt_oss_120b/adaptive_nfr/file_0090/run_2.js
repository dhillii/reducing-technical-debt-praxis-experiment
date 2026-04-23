import type { DocumentFeatures } from '../../views-shared'
import type { DocumentFeaturesForNormalization } from '../document-features-normalization'
import { type Mark, assert } from '../utils'
import type { ComponentSchema, ChildField } from './api-shared'
import { getKeysForArrayValue, setKeysForArrayValue } from './preview-props'

type PathToChildFieldWithOption = { path: ReadonlyPropPath; options: ChildField['options'] }

type SchemaKind = ComponentSchema['kind']

/** ---------- findChildPropPathsForProp ---------- */
function findChildPropPathsForFormOrRelationship(
  _value: any,
  _schema: ComponentSchema,
  _path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  return []
}
function findChildPropPathsForChild(
  _value: any,
  schema: Extract<ComponentSchema, { kind: 'child' }>,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  return [{ path, options: schema.options }]
}
function findChildPropPathsForConditional(
  value: any,
  schema: Extract<ComponentSchema, { kind: 'conditional' }>,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  return findChildPropPathsForProp(
    value.value,
    schema.values[value.discriminant],
    path.concat('value')
  )
}
function findChildPropPathsForObject(
  value: any,
  schema: Extract<ComponentSchema, { kind: 'object' }>,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  const paths: PathToChildFieldWithOption[] = []
  Object.keys(schema.fields).forEach(key => {
    paths.push(
      ...findChildPropPathsForProp(value[key], schema.fields[key], path.concat(key))
    )
  })
  return paths
}
function findChildPropPathsForArray(
  value: any,
  schema: Extract<ComponentSchema, { kind: 'array' }>,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  const paths: PathToChildFieldWithOption[] = []
  ;(value as any[]).forEach((val, i) => {
    paths.push(...findChildPropPathsForProp(val, schema.element, path.concat(i)))
  })
  return paths
}
const findChildPropPathsDispatch: Record<
  SchemaKind,
  (value: any, schema: ComponentSchema, path: ReadonlyPropPath) => PathToChildFieldWithOption[]
> = {
  form: findChildPropPathsForFormOrRelationship,
  relationship: findChildPropPathsForFormOrRelationship,
  child: findChildPropPathsForChild,
  conditional: findChildPropPathsForConditional,
  object: findChildPropPathsForObject,
  array: findChildPropPathsForArray,
}

/** Recursively find child prop paths */
export function findChildPropPathsForProp(
  value: any,
  schema: ComponentSchema,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  return findChildPropPathsDispatch[schema.kind](value, schema, path)
}

/** ---------- findChildPropPaths ---------- */
export function findChildPropPaths(
  value: Record<string, any>,
  props: Record<string, ComponentSchema>
): { path: ReadonlyPropPath | undefined; options: ChildField['options'] }[] {
  const propPaths = findChildPropPathsForProp(value, { kind: 'object', fields: props }, [])
  if (propPaths.length) return propPaths
  return [{ path: undefined, options: { kind: 'inline', placeholder: '' } }]
}

/** ---------- getDocumentFeaturesForChildField ---------- */
function computeInlineMarks(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): 'inherit' | Record<Mark, boolean> {
  const inlineMarksFromOptions = options.formatting?.inlineMarks
  if (inlineMarksFromOptions === 'inherit') return 'inherit'
  return Object.fromEntries(
    Object.keys(editorDocumentFeatures.formatting.inlineMarks).map(mark => [
      mark as Mark,
      !!(inlineMarksFromOptions || {})[mark as Mark],
    ])
  ) as Record<Mark, boolean>
}
function getDocumentFeaturesForInline(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): DocumentFeaturesForChildField {
  const inlineMarks = computeInlineMarks(editorDocumentFeatures, options)
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
function getDocumentFeaturesForBlock(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): DocumentFeaturesForChildField {
  const inlineMarks = computeInlineMarks(editorDocumentFeatures, options)
  const formatting = {
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
  }
  return {
    kind: 'block',
    inlineMarks,
    softBreaks: options.formatting?.softBreaks === 'inherit',
    documentFeatures: {
      layouts: [],
      dividers:
        options.dividers === 'inherit' ? editorDocumentFeatures.dividers : false,
      formatting,
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
  return options.kind === 'inline'
    ? getDocumentFeaturesForInline(editorDocumentFeatures, options)
    : getDocumentFeaturesForBlock(editorDocumentFeatures, options)
}

/** ---------- getSchemaAtPropPathInner ---------- */
function getSchemaAtPropPathConditional(
  path: (string | number)[],
  value: any,
  schema: Extract<ComponentSchema, { kind: 'conditional' }>
): undefined | ComponentSchema {
  const key = path.shift()
  if (key === 'discriminant')
    return getSchemaAtPropPathInner(path, value.discriminant, schema.discriminant)
  if (key === 'value') {
    const propVal = schema.values[value.discriminant]
    return getSchemaAtPropPathInner(path, value.value, propVal)
  }
  return undefined
}
function getSchemaAtPropPathObject(
  path: (string | number)[],
  value: any,
  schema: Extract<ComponentSchema, { kind: 'object' }>
): undefined | ComponentSchema {
  const key = path.shift()!
  return getSchemaAtPropPathInner(path, value[key], schema.fields[key])
}
function getSchemaAtPropPathArray(
  path: (string | number)[],
  value: any,
  schema: Extract<ComponentSchema, { kind: 'array' }>
): undefined | ComponentSchema {
  const index = path.shift()!
  return getSchemaAtPropPathInner(path, value[index], schema.element)
}
const getSchemaAtPropPathDispatch: Record<
  SchemaKind,
  (path: (string | number)[], value: any, schema: ComponentSchema) => undefined | ComponentSchema
> = {
  child: () => undefined,
  form: () => undefined,
  relationship: () => undefined,
  conditional: getSchemaAtPropPathConditional,
  object: getSchemaAtPropPathObject,
  array: getSchemaAtPropPathArray,
}
function getSchemaAtPropPathInner(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
): undefined | ComponentSchema {
  if (path.length === 0) return schema
  return getSchemaAtPropPathDispatch[schema.kind](path, value, schema)
}
export function getSchemaAtPropPath(
  path: ReadonlyPropPath,
  value: Record<string, unknown>,
  props: Record<string, ComponentSchema>
): undefined | ComponentSchema {
  return getSchemaAtPropPathInner([...path], value, { kind: 'object', fields: props })
}

/** ---------- clientSideValidateProp ---------- */
function validateChildOrRelationship(): boolean {
  return true
}
function validateForm(schema: Extract<ComponentSchema, { kind: 'form' }>, value: unknown): boolean {
  return schema.validate(value)
}
function validateConditional(
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
function validateObject(
  schema: Extract<ComponentSchema, { kind: 'object' }>,
  value: any
): boolean {
  for (const [key, childProp] of Object.entries(schema.fields)) {
    if (!clientSideValidateProp(childProp, value[key])) return false
  }
  return true
}
function validateArray(
  schema: Extract<ComponentSchema, { kind: 'array' }>,
  value: any
): boolean {
  if (!Array.isArray(value)) return false
  for (const innerVal of value) {
    if (!clientSideValidateProp(schema.element, innerVal)) return false
  }
  return true
}
const clientSideValidateDispatch: Record<
  SchemaKind,
  (schema: ComponentSchema, value: unknown) => boolean
> = {
  child: () => validateChildOrRelationship(),
  relationship: () => validateChildOrRelationship(),
  form: (s, v) => validateForm(s as any, v),
  conditional: (s, v) => validateConditional(s as any, v as any),
  object: (s, v) => validateObject(s as any, v as any),
  array: (s, v) => validateArray(s as any, v as any),
}
export function clientSideValidateProp(schema: ComponentSchema, value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return schema.kind === 'form' ? clientSideValidateDispatch.form(schema, value) : false
  }
  return clientSideValidateDispatch[schema.kind](schema, value)
}

/** ---------- getAncestorSchemas ---------- */
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
    switch (currentProp.kind) {
      case 'array':
        currentProp = currentProp.element
        currentValue = (currentValue as any)[key]
        break
      case 'conditional':
        currentProp = currentProp.values[(value as any).discriminant]
        currentValue = (currentValue as any).value
        break
      case 'object':
        currentValue = (currentValue as any)[key]
        currentProp = currentProp.fields[key]
        break
      case 'child':
      case 'form':
      case 'relationship':
        throw new Error(`unexpected prop "${key}"`)
      default:
        assertNever(currentProp)
    }
  }
  return ancestors
}

/** ---------- getValueAtPropPath ---------- */
export function getValueAtPropPath(value: unknown, inputPath: ReadonlyPropPath) {
  const path = [...inputPath]
  while (path.length) {
    const key = path.shift()!
    value = (value as any)[key]
  }
  return value
}

/** ---------- traverseProps ---------- */
function traverseChildFormRelationship(
  schema: ComponentSchema,
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath
) {
  visitor(schema, value, path)
}
function traverseObject(
  schema: Extract<ComponentSchema, { kind: 'object' }>,
  value: any,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath
) {
  for (const [key, childProp] of Object.entries(schema.fields)) {
    traverseProps(childProp, value[key], visitor, [...path, key])
  }
  visitor(schema, value, path)
}
function traverseArray(
  schema: Extract<ComponentSchema, { kind: 'array' }>,
  value: unknown[],
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath
) {
  for (const [idx, val] of value.entries()) {
    traverseProps(schema.element, val, visitor, path.concat(idx))
  }
  visitor(schema, value, path)
}
function traverseConditional(
  schema: Extract<ComponentSchema, { kind: 'conditional' }>,
  value: any,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath
) {
  const discriminant: string | boolean = value.discriminant
  visitor(schema, discriminant, path.concat('discriminant'))
  traverseProps(
    schema.values[discriminant.toString()],
    value.value,
    visitor,
    path.concat('value')
  )
  visitor(schema, value, path)
}
const traverseDispatch: Record<
  SchemaKind,
  (
    schema: ComponentSchema,
    value: unknown,
    visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
    path: ReadonlyPropPath
  ) => void
> = {
  child: traverseChildFormRelationship,
  form: traverseChildFormRelationship,
  relationship: traverseChildFormRelationship,
  object: (s, v, vis, p) => traverseObject(s as any, v as any, vis, p),
  array: (s, v, vis, p) => traverseArray(s as any, v as any[], vis, p),
  conditional: (s, v, vis, p) => traverseConditional(s as any, v as any, vis, p),
}
export function traverseProps(
  schema: ComponentSchema,
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath = []
) {
  traverseDispatch[schema.kind](schema, value, visitor, path)
}

/** ---------- replaceValueAtPropPath ---------- */
function replaceInObject(
  schema: Extract<ComponentSchema, { kind: 'object' }>,
  value: any,
  newValue: unknown,
  key: string | number,
  newPath: ReadonlyPropPath
) {
  return {
    ...(value as any),
    [key]: replaceValueAtPropPath(schema.fields[key as string], value[key], newValue, newPath),
  }
}
function replaceInConditional(
  schema: Extract<ComponentSchema, { kind: 'conditional' }>,
  value: any,
  newValue: unknown,
  key: string | number,
  newPath: ReadonlyPropPath
) {
  // replaceValueAtPropPath should not be used to only update the discriminant
  assert(key === 'value')
  return {
    discriminant: value.discriminant,
    value: replaceValueAtPropPath(schema.values[key as string], value.value, newValue, newPath),
  }
}
function replaceInArray(
  schema: Extract<ComponentSchema, { kind: 'array' }>,
  value: unknown[],
  newValue: unknown,
  key: string | number,
  newPath: ReadonlyPropPath
) {
  const prevVal = value
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
  switch (schema.kind) {
    case 'object':
      return replaceInObject(schema, value, newValue, key, newPath)
    case 'conditional':
      return replaceInConditional(schema, value, newValue, key, newPath)
    case 'array':
      return replaceInArray(schema, value as unknown[], newValue, key, newPath)
    default:
      // form, relationship, child cannot have nested paths
      assert(schema.kind !== 'form' && schema.kind !== 'relationship' && schema.kind !== 'child')
      assertNever(schema)
  }
}

/** ---------- getPlaceholderTextForPropPath ---------- */
export function getPlaceholderTextForPropPath(
  propPath: ReadonlyPropPath,
  fields: Record<string, ComponentSchema>,
  formProps: Record<string, any>
): string {
  const field = getSchemaAtPropPath(propPath, formProps, fields)
  return field?.kind === 'child' ? field.options.placeholder : ''
}

/** ---------- utilities ---------- */
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

export type ReadonlyPropPath = readonly (string | number)[]