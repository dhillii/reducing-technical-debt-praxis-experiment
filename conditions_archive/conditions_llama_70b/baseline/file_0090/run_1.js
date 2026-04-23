```typescript
import type { DocumentFeatures } from '../../views-shared'
import type { DocumentFeaturesForNormalization } from '../document-features-normalization'
import { type Mark, assert } from '../utils'
import type { ComponentSchema, ChildField } from './api-shared'
import { getKeysForArrayValue, setKeysForArrayValue } from './preview-props'

type PathToChildFieldWithOption = { path: ReadonlyPropPath; options: ChildField['options'] }

function findChildPropPathsForPropObject(
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

function findChildPropPathsForPropArray(
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

function findChildPropPathsForPropConditional(
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

function findChildPropPathsForProp(
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
      return findChildPropPathsForPropConditional(value, schema, path)
    case 'object':
      return findChildPropPathsForPropObject(value, schema, path)
    case 'array':
      return findChildPropPathsForPropArray(value, schema, path)
    default:
      assertNever(schema)
      return []
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

function getInlineMarks(
  editorDocumentFeatures: DocumentFeatures,
  inlineMarksFromOptions: ChildField['options']['formatting']['inlineMarks']
): Record<Mark, boolean> {
  if (inlineMarksFromOptions === 'inherit') return { inherit: true }
  return Object.fromEntries(
    Object.keys(editorDocumentFeatures.formatting.inlineMarks).map(mark => {
      return [mark as Mark, !!(inlineMarksFromOptions || {})[mark as Mark]]
    })
  ) as Record<Mark, boolean>
}

function getDocumentFeaturesForChildFieldInline(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): DocumentFeaturesForChildField {
  const inlineMarks = getInlineMarks(editorDocumentFeatures, options.formatting?.inlineMarks)
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

function getDocumentFeaturesForChildFieldBlock(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): DocumentFeaturesForChildField {
  const inlineMarks = getInlineMarks(editorDocumentFeatures, options.formatting?.inlineMarks)
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
  if (options.kind === 'inline') {
    return getDocumentFeaturesForChildFieldInline(editorDocumentFeatures, options)
  }
  return getDocumentFeaturesForChildFieldBlock(editorDocumentFeatures, options)
}

function getSchemaAtPropPathInnerObject(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
): undefined | ComponentSchema {
  if (path.length === 0) return schema
  const key = path.shift()!
  return getSchemaAtPropPathInner(path, (value as any)[key], schema.fields[key])
}

function getSchemaAtPropPathInnerArray(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
): undefined | ComponentSchema {
  if (path.length === 0) return schema
  const index = path.shift()!
  return getSchemaAtPropPathInner(path, (value as any)[index], schema.element)
}

function getSchemaAtPropPathInnerConditional(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
): undefined | ComponentSchema {
  if (path.length === 0) return schema
  const key = path.shift()!
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
  switch (schema.kind) {
    case 'object':
      return getSchemaAtPropPathInnerObject(path, value, schema)
    case 'array':
      return getSchemaAtPropPathInnerArray(path, value, schema)
    case 'conditional':
      return getSchemaAtPropPathInnerConditional(path, value, schema)
    default:
      assertNever(schema)
      return
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

function clientSideValidatePropObject(
  schema: ComponentSchema,
  value: unknown
): boolean {
  for (const [key, childProp] of Object.entries(schema.fields)) {
    if (!clientSideValidateProp(childProp, (value as any)[key])) return false
  }
  return true
}

function clientSideValidatePropArray(
  schema: ComponentSchema,
  value: unknown
): boolean {
  if (!Array.isArray(value)) return false
  for (const innerVal of value) {
    if (!clientSideValidateProp(schema.element, innerVal)) return false
  }
  return true
}

function clientSideValidatePropConditional(
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

export function clientSideValidateProp(
  schema: ComponentSchema,
  value: unknown
): boolean {
  if (schema.kind === 'child') return true
  if (schema.kind === 'relationship') return true
  if (schema.kind === 'form') return schema.validate(value)
  if (typeof value !== 'object') return false
  if (value === null) return false
  switch (schema.kind) {
    case 'conditional':
      return clientSideValidatePropConditional(schema, value)
    case 'object':
      return clientSideValidatePropObject(schema, value)
    case 'array':
      return clientSideValidatePropArray(schema, value)
    default:
      assertNever(schema)
      return false
  }
}

function getAncestorSchemasObject(
  currentProp: ComponentSchema,
  currentValue: unknown,
  currentPath: ReadonlyPropPath,
  ancestors: ComponentSchema[]
): ComponentSchema[] {
  const key = currentPath.shift()!
  currentValue = (currentValue as any)[key]
  currentProp = currentProp.fields[key]
  ancestors.push(currentProp)
  return getAncestorSchemas(currentProp, currentValue, currentPath, ancestors)
}

function getAncestorSchemasArray(
  currentProp: ComponentSchema,
  currentValue: unknown,
  currentPath: ReadonlyPropPath,
  ancestors: ComponentSchema[]
): ComponentSchema[] {
  const index = currentPath.shift()!
  currentValue = (currentValue as any)[index]
  currentProp = currentProp.element
  ancestors.push(currentProp)
  return getAncestorSchemas(currentProp, currentValue, currentPath, ancestors)
}

function getAncestorSchemasConditional(
  currentProp: ComponentSchema,
  currentValue: unknown,
  currentPath: ReadonlyPropPath,
  ancestors: ComponentSchema[]
): ComponentSchema[] {
  const key = currentPath.shift()!
  if (key === 'value') {
    currentValue = (currentValue as any).value
    currentProp = currentProp.values[(currentValue as any).discriminant]
    ancestors.push(currentProp)
    return getAncestorSchemas(currentProp, currentValue, currentPath, ancestors)
  }
  return ancestors
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
    switch (currentProp.kind) {
      case 'object':
        return getAncestorSchemasObject(currentProp, currentValue, currentPath, ancestors)
      case 'array':
        return getAncestorSchemasArray(currentProp, currentValue, currentPath, ancestors)
      case 'conditional':
        return getAncestorSchemasConditional(currentProp, currentValue, currentPath, ancestors)
      default:
        throw new Error(`unexpected prop "${currentPath[0]}"`)
    }
  }
  return ancestors
}

export function getValueAtPropPath(value: unknown, inputPath: ReadonlyPropPath) {
  const path = [...inputPath]
  while (path.length) {
    const key = path.shift()!
    value = (value as any)[key]
  }
  return value
}

function traversePropsObject(
  schema: ComponentSchema,
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath = []
) {
  for (const [key, childProp] of Object.entries(schema.fields)) {
    traverseProps(childProp, (value as any)[key], visitor, [...path, key])
  }
  visitor(schema, value, path)
}

function traversePropsArray(
  schema: ComponentSchema,
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath = []
) {
  for (const [idx, val] of (value as unknown[]).entries()) {
    traverseProps(schema.element, val, visitor, path.concat(idx))
  }
  visitor(schema, value, path)
}

function traversePropsConditional(
  schema: ComponentSchema,
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath = []
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
      return traversePropsObject(schema, value, visitor, path)
    case 'array':
      return traversePropsArray(schema, value, visitor, path)
    case 'conditional':
      return traversePropsConditional(schema, value, visitor, path)
    default:
      assertNever(schema)
  }
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

function replaceValueAtPropPathConditional(
  schema: ComponentSchema,
  value: unknown,
  newValue: unknown,
  path: ReadonlyPropPath
): unknown {
  if (path.length === 0) return newValue
  const [key, ...newPath] = path
  if (key === 'value') {
    const conditionalValue = value as { discriminant: string | boolean; value: unknown }
    return {
      discriminant: conditionalValue.discriminant,
      value: replaceValueAtPropPath(schema.values[key], conditionalValue.value, newValue, newPath),
    }
  }
  return value
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
      return replaceValueAtPropPathObject(schema, value, newValue, path)
    case 'array':
      return replaceValueAtPropPathArray(schema, value, newValue, path)
    case 'conditional':
      return replaceValueAtPropPathConditional(schema, value, newValue, path)
    default:
      assertNever(schema)
      return value
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
```