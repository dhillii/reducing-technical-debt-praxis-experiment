import type { DocumentFeatures } from '../../views-shared'
import type { DocumentFeaturesForNormalization } from '../document-features-normalization'
import { type Mark, assert } from '../utils'
import type { ComponentSchema, ChildField } from './api-shared'
import { getKeysForArrayValue, setKeysForArrayValue } from './preview-props'

type PathToChildFieldWithOption = { path: ReadonlyPropPath; options: ChildField['options'] }

type SchemaKindHandler = (
  value: any,
  schema: ComponentSchema,
  path: ReadonlyPropPath
) => PathToChildFieldWithOption[]

const schemaKindHandlers: Record<string, SchemaKindHandler> = {
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
  const handler = schemaKindHandlers[schema.kind]
  if (!handler) {
    assertNever(schema)
  }
  return handler(value, schema, path)
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

function computeInlineMarks(
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

function computeInlineFeatures(
  options: ChildField['options']
): { links: boolean; relationships: boolean; softBreaks: boolean } {
  return {
    links: options.links === 'inherit',
    relationships: options.relationships === 'inherit',
    softBreaks: options.formatting?.softBreaks === 'inherit',
  }
}

function computeBlockFeatures(
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
  const inlineMarks = computeInlineMarks(editorDocumentFeatures, options.formatting?.inlineMarks)
  const inlineFeatures = computeInlineFeatures(options)
  const blockFeatures = computeBlockFeatures(editorDocumentFeatures, options)

  if (options.kind === 'inline') {
    return {
      kind: 'inline',
      inlineMarks,
      documentFeatures: inlineFeatures,
      softBreaks: inlineFeatures.softBreaks,
    }
  }
  return {
    kind: 'block',
    inlineMarks,
    softBreaks: blockFeatures.formatting.alignment.center || blockFeatures.formatting.alignment.end,
    componentBlocks: options.componentBlocks === 'inherit',
    documentFeatures: blockFeatures,
  }
}

function getSchemaAtPropPathInner(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
): undefined | ComponentSchema {
  if (path.length === 0) return schema

  const schemaKind = schema.kind
  if (schemaKind === 'child' || schemaKind === 'form' || schemaKind === 'relationship') {
    return undefined
  }

  if (schemaKind === 'conditional') {
    const key = path.shift()
    if (key === 'discriminant') {
      return getSchemaAtPropPathInner(path, (value as any).discriminant, schema.discriminant)
    }
    if (key === 'value') {
      const propVal = schema.values[(value as any).discriminant]
      return getSchemaAtPropPathInner(path, (value as any).value, propVal)
    }
    return undefined
  }

  if (schemaKind === 'object') {
    const key = path.shift()!
    return getSchemaAtPropPathInner(path, (value as any)[key], schema.fields[key])
  }

  if (schemaKind === 'array') {
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

function validateSchemaKind(schema: ComponentSchema): boolean {
  return schema.kind === 'child' || schema.kind === 'relationship' || schema.kind === 'form'
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

function validateConditionalSchema(schema: ComponentSchema, value: unknown): boolean {
  if (!('discriminant' in value) || !('value' in value)) return false
  if (!schema.discriminant.validate(value.discriminant)) return false
  return clientSideValidateProp(
    schema.values[value.discriminant as string],
    value.value
  )
}

export function clientSideValidateProp(schema: ComponentSchema, value: unknown): boolean {
  if (validateSchemaKind(schema)) return true
  if (schema.kind === 'conditional') return validateConditionalSchema(schema, value)
  if (schema.kind === 'object') return validateObjectSchema(schema, value)
  if (schema.kind === 'array') return validateArraySchema(schema, value)
  return false
}

function getAncestorSchemaAtPath(
  path: (string | number)[],
  value: unknown,
  currentProp: ComponentSchema,
  currentValue: unknown
): ComponentSchema | undefined {
  if (path.length === 0) return currentProp

  const key = path.shift()!
  if (currentProp.kind === 'array') {
    return getAncestorSchemaAtPath(path, (currentValue as any)[key], currentProp.element, (currentValue as any)[key])
  }
  if (currentProp.kind === 'conditional') {
    return getAncestorSchemaAtPath(path, (currentValue as any).value, currentProp.values[(currentValue as any).discriminant], (currentValue as any).value)
  }
  if (currentProp.kind === 'object') {
    return getAncestorSchemaAtPath(path, (currentValue as any)[key], currentProp.fields[key], (currentValue as any)[key])
  }
  if (currentProp.kind === 'child' || currentProp.kind === 'form' || currentProp.kind === 'relationship') {
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
    const key = currentPath.shift()!
    currentProp = getAncestorSchemaAtPath(currentPath, currentValue, currentProp, currentValue)
    if (!currentProp) break
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

function traverseSchemaKind(
  schema: ComponentSchema,
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath
): void {
  if (schema.kind === 'form' || schema.kind === 'relationship' || schema.kind === 'child') {
    visitor(schema, value, path)
    return
  }
  if (schema.kind === 'object') {
    for (const [key, childProp] of Object.entries(schema.fields)) {
      traverseSchemaKind(childProp, (value as any)[key], visitor, [...path, key])
    }
    visitor(schema, value, path)
    return
  }
  if (schema.kind === 'array') {
    for (const [idx, val] of (value as unknown[]).entries()) {
      traverseSchemaKind(schema.element, val, visitor, path.concat(idx))
    }
    return visitor(schema, value, path)
  }
  if (schema.kind === 'conditional') {
    const discriminant: string | boolean = (value as any).discriminant
    visitor(schema, discriminant, path.concat('discriminant'))
    traverseSchemaKind(
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

export function traverseProps(
  schema: ComponentSchema,
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath = []
) {
  traverseSchemaKind(schema, value, visitor, path)
}

function replaceValueAtPropPathInner(
  schema: ComponentSchema,
  value: unknown,
  newValue: unknown,
  path: ReadonlyPropPath
): unknown {
  if (path.length === 0) return newValue

  const [key, ...newPath] = path

  if (schema.kind === 'object') {
    return {
      ...(value as any),
      [key]: replaceValueAtPropPathInner(schema.fields[key], (value as any)[key], newValue, newPath),
    }
  }

  if (schema.kind === 'conditional') {
    const conditionalValue = value as { discriminant: string | boolean; value: unknown }
    assert(key === 'value')
    return {
      discriminant: conditionalValue.discriminant,
      value: replaceValueAtPropPathInner(schema.values[key], conditionalValue.value, newValue, newPath),
    }
  }

  if (schema.kind === 'array') {
    const prevVal = value as unknown[]
    const newVal = [...prevVal]
    setKeysForArrayValue(newVal, getKeysForArrayValue(prevVal))
    newVal[key as number] = replaceValueAtPropPathInner(
      schema.element,
      newVal[key as number],
      newValue,
      newPath
    )
    return newVal
  }

  assert(schema.kind !== 'form' && schema.kind !== 'relationship' && schema.kind !== 'child')
  assertNever(schema)
}

export function replaceValueAtPropPath(
  schema: ComponentSchema,
  value: unknown,
  newValue: unknown,
  path: ReadonlyPropPath
): unknown {
  return replaceValueAtPropPathInner(schema, value, newValue, path)
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