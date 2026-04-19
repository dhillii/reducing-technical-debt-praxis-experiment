```typescript
import type { DocumentFeatures } from '../../views-shared'
import type { DocumentFeaturesForNormalization } from '../document-features-normalization'
import { type Mark, assert } from '../utils'
import type { ComponentSchema, ChildField } from './api-shared'
import { getKeysForArrayValue, setKeysForArrayValue } from './preview-props'

type PathToChildFieldWithOption = { path: ReadonlyPropPath; options: ChildField['options'] }

function findChildPropPathsForFormOrRelationship(): PathToChildFieldWithOption[] {
  return []
}

function findChildPropPathsForChildField(path: ReadonlyPropPath, options: ChildField['options']): PathToChildFieldWithOption[] {
  return [{ path, options }]
}

function findChildPropPathsForConditionalField(
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

function findChildPropPathsForObjectField(
  value: Record<string, any>,
  schema: ComponentSchema,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  const paths: PathToChildFieldWithOption[] = []
  Object.keys(schema.fields).forEach(key => {
    paths.push(...findChildPropPathsForProp(value[key], schema.fields[key], path.concat(key)))
  })
  return paths
}

function findChildPropPathsForArrayField(
  value: any[],
  schema: ComponentSchema,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  const paths: PathToChildFieldWithOption[] = []
  value.forEach((val, i) => {
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
      return findChildPropPathsForFormOrRelationship()
    case 'child':
      return findChildPropPathsForChildField(path, schema.options)
    case 'conditional':
      return findChildPropPathsForConditionalField(value, schema, path)
    case 'object':
      return findChildPropPathsForObjectField(value, schema, path)
    case 'array':
      return findChildPropPathsForArrayField(value as any[], schema, path)
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

function calculateInlineMarks(
  editorDocumentFeatures: DocumentFeatures,
  inlineMarksFromOptions: string | undefined
): 'inherit' | Record<Mark, boolean> {
  if (inlineMarksFromOptions === 'inherit') {
    return 'inherit'
  }
  return Object.fromEntries(
    Object.keys(editorDocumentFeatures.formatting.inlineMarks).map(mark => {
      return [mark as Mark, !!(inlineMarksFromOptions || {})[mark as Mark]]
    })
  ) as Record<Mark, boolean>
}

function buildInlineDocumentFeatures(
  options: ChildField['options']
): {
  links: boolean
  relationships: boolean
} {
  return {
    links: options.links === 'inherit',
    relationships: options.relationships === 'inherit',
  }
}

function buildBlockDocumentFeatures(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): DocumentFeaturesForNormalization {
  return {
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
  }
}

export function getDocumentFeaturesForChildField(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): DocumentFeaturesForChildField {
  const inlineMarks = calculateInlineMarks(editorDocumentFeatures, options.formatting?.inlineMarks)
  const softBreaks = options.formatting?.softBreaks === 'inherit'

  if (options.kind === 'inline') {
    return {
      kind: 'inline',
      inlineMarks,
      documentFeatures: buildInlineDocumentFeatures(options),
      softBreaks,
    }
  }
  return {
    kind: 'block',
    inlineMarks,
    softBreaks,
    componentBlocks: options.componentBlocks === 'inherit',
    documentFeatures: buildBlockDocumentFeatures(editorDocumentFeatures, options),
  }
}

function getSchemaAtPropPathInnerForChildOrFormOrRelationship(): undefined | ComponentSchema {
  return undefined
}

function getSchemaAtPropPathInnerForConditional(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
): undefined | ComponentSchema {
  const key = path.shift()
  if (key === 'discriminant') {
    return getSchemaAtPropPathInnerForConditional(
      path,
      (value as any).discriminant,
      schema.discriminant
    )
  }
  if (key === 'value') {
    const propVal = schema.values[(value as any).discriminant]
    return getSchemaAtPropPathInnerForConditional(path, (value as any).value, propVal)
  }
  return undefined
}

function getSchemaAtPropPathInnerForObject(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
): undefined | ComponentSchema {
  const key = path.shift()!
  return getSchemaAtPropPathInnerForObject(path, (value as any)[key], schema.fields[key])
}

function getSchemaAtPropPathInnerForArray(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
): undefined | ComponentSchema {
  const index = path.shift()!
  return getSchemaAtPropPathInnerForArray(path, (value as any)[index], schema.element)
}

function getSchemaAtPropPathInnerForLeaf(): undefined | ComponentSchema {
  return undefined
}

export function getSchemaAtPropPathInner(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
): undefined | ComponentSchema {
  if (path.length === 0) return schema
  if (schema.kind === 'child' || schema.kind === 'form' || schema.kind === 'relationship') {
    return getSchemaAtPropPathInnerForLeaf()
  }
  if (schema.kind === 'conditional') {
    return getSchemaAtPropPathInnerForConditional(path, value, schema)
  }
  if (schema.kind === 'object') {
    return getSchemaAtPropPathInnerForObject(path, value, schema)
  }
  if (schema.kind === 'array') {
    return getSchemaAtPropPathInnerForArray(path, value, schema)
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

function validateChildOrRelationship(): boolean {
  return true
}

function validateForm(schema: ComponentSchema, value: unknown): boolean {
  return schema.validate(value)
}

function validatePrimitive(value: unknown): boolean {
  return typeof value === 'object' && value !== null
}

function validateConditional(
  schema: ComponentSchema,
  value: unknown
): boolean {
  if (!('discriminant' in value) || !('value' in value)) return false
  if (!schema.discriminant.validate(value.discriminant)) return false
  return clientSideValidateProp(
    schema.values[value.discriminant as string],
    value.value
  )
}

function validateObject(schema: ComponentSchema, value: Record<string, unknown>): boolean {
  for (const [key, childProp] of Object.entries(schema.fields)) {
    if (!clientSideValidateProp(childProp, (value as any)[key])) return false
  }
  return true
}

function validateArray(schema: ComponentSchema, value: unknown[]): boolean {
  for (const innerVal of value) {
    if (!clientSideValidateProp(schema.element, innerVal)) return false
  }
  return true
}

export function clientSideValidateProp(schema: ComponentSchema, value: unknown): boolean {
  if (schema.kind === 'child' || schema.kind === 'relationship') {
    return validateChildOrRelationship()
  }
  if (schema.kind === 'form') {
    return validateForm(schema, value)
  }
  if (!validatePrimitive(value)) {
    return false
  }
  switch (schema.kind) {
    case 'conditional':
      return validateConditional(schema, value)
    case 'object':
      return validateObject(schema, value as Record<string, unknown>)
    case 'array':
      return validateArray(schema, value as unknown[])
  }
}

function getAncestorSchemaForArray(
  currentProp: ComponentSchema,
  currentValue: unknown,
  key: string
): ComponentSchema {
  currentProp = currentProp.element
  currentValue = (currentValue as any)[key]
  return currentProp
}

function getAncestorSchemaForConditional(
  currentProp: ComponentSchema,
  currentValue: unknown,
  value: unknown
): ComponentSchema {
  currentProp = currentProp.values[(value as any).discriminant]
  currentValue = (currentValue as any).value
  return currentProp
}

function getAncestorSchemaForObject(
  currentProp: ComponentSchema,
  currentValue: unknown,
  key: string
): ComponentSchema {
  currentValue = (currentValue as any)[key]
  currentProp = currentProp.fields[key]
  return currentProp
}

function getAncestorSchemaForLeaf(
  currentProp: ComponentSchema,
  currentValue: unknown,
  key: string
): never {
  throw new Error(`unexpected prop "${key}"`)
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
    switch (currentProp.kind) {
      case 'array':
        currentProp = getAncestorSchemaForArray(currentProp, currentValue, key)
        break
      case 'conditional':
        currentProp = getAncestorSchemaForConditional(currentProp, currentValue, value)
        break
      case 'object':
        currentProp = getAncestorSchemaForObject(currentProp, currentValue, key)
        break
      case 'child':
      case 'form':
      case 'relationship':
        currentProp = getAncestorSchemaForLeaf(currentProp, currentValue, key)
        break
      default:
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

function traversePropsForLeaf(
  schema: ComponentSchema,
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath
): void {
  visitor(schema, value, path)
}

function traversePropsForObject(
  schema: ComponentSchema,
  value: Record<string, unknown>,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath
): void {
  for (const [key, childProp] of Object.entries(schema.fields)) {
    traverseProps(childProp, (value as any)[key], visitor, [...path, key])
  }
  traversePropsForLeaf(schema, value, visitor, path)
}

function traversePropsForArray(
  schema: ComponentSchema,
  value: unknown[],
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath
): void {
  for (const [idx, val] of value.entries()) {
    traverseProps(schema.element, val, visitor, path.concat(idx))
  }
  traversePropsForLeaf(schema, value, visitor, path)
}

function traversePropsForConditional(
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
  traversePropsForLeaf(schema, value, visitor, path)
}

export function traverseProps(
  schema: ComponentSchema,
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath = []
) {
  if (schema.kind === 'form' || schema.kind === 'relationship' || schema.kind === 'child') {
    traversePropsForLeaf(schema, value, visitor, path)
    return
  }
  if (schema.kind === 'object') {
    traversePropsForObject(schema, value as Record<string, unknown>, visitor, path)
    return
  }
  if (schema.kind === 'array') {
    traversePropsForArray(schema, value as unknown[], visitor, path)
    return
  }
  if (schema.kind === 'conditional') {
    traversePropsForConditional(schema, value, visitor, path)
    return
  }
  assertNever(schema)
}

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
    value: replaceValueAtPropPath(schema.values[path[0] as string], conditionalValue.value, newValue, path.slice(1)),
  }
}

function replaceValueAtPropPathForArray(
  schema: ComponentSchema,
  value: unknown[],
  newValue: unknown,
  path: ReadonlyPropPath
): unknown[] {
  const prevVal = value
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

  const [key, ...newPath] = path

  if (schema.kind === 'object') {
    return replaceValueAtPropPathForObject(schema, value, newValue, path)
  }

  if (schema.kind === 'conditional') {
    return replaceValueAtPropPathForConditional(schema, value, newValue, path)
  }

  if (schema.kind === 'array') {
    return replaceValueAtPropPathForArray(schema, value as unknown[], newValue, path)
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