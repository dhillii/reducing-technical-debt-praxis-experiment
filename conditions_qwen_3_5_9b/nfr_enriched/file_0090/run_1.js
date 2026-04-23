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
      return [{ path: path, options: schema.options }]
    case 'conditional':
      return findChildPropPathsForProp(
        value.value,
        schema.values[value.discriminant],
        path.concat('value')
      )
    case 'object':
      return flattenPaths(
        Object.keys(schema.fields).map(key =>
          findChildPropPathsForProp(value[key], schema.fields[key], path.concat(key))
        )
      )
    case 'array':
      return flattenPaths(
        (value as any[]).map((val, i) =>
          findChildPropPathsForProp(val, schema.element, path.concat(i))
        )
      )
  }
}

function flattenPaths<T>(paths: T[][]): T[] {
  return paths.flat()
}

export function findChildPropPaths(
  value: Record<string, any>,
  props: Record<string, ComponentSchema>
): { path: ReadonlyPropPath | undefined; options: ChildField['options'] }[] {
  const propPaths = findChildPropPathsForProp(value, { kind: 'object', fields: props }, [])
  return propPaths.length ? propPaths : [{ path: undefined, options: { kind: 'inline', placeholder: '' } }]
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
  const softBreaks = options.formatting?.softBreaks === 'inherit'
  const componentBlocks = options.componentBlocks === 'inherit'
  const inlineMarks = computeInlineMarks(editorDocumentFeatures, options)

  return {
    layouts: [],
    dividers: options.dividers === 'inherit' ? editorDocumentFeatures.dividers : false,
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
  const inlineFeatures = computeInlineFeatures(options)
  const inlineMarks = computeInlineMarks(editorDocumentFeatures, options)

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
    softBreaks: inlineFeatures.softBreaks,
    documentFeatures: computeBlockFeatures(editorDocumentFeatures, options),
    componentBlocks: componentBlocks(options),
  }
}

function componentBlocks(options: ChildField['options']): boolean {
  return options.componentBlocks === 'inherit'
}

function getSchemaAtPropPathInner(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
): undefined | ComponentSchema {
  if (path.length === 0) return schema
  if (schema.kind === 'child' || schema.kind === 'form' || schema.kind === 'relationship') return
  if (schema.kind === 'conditional') {
    const key = path.shift()
    if (key === 'discriminant')
      return getSchemaAtPropPathInner(path, (value as any).discriminant, schema.discriminant)
    if (key === 'value') {
      const propVal = schema.values[(value as any).discriminant]
      return getSchemaAtPropPathInner(path, (value as any).value, propVal)
    }
    return
  }
  if (schema.kind === 'object') {
    const key = path.shift()!
    return getSchemaAtPropPathInner(path, (value as any)[key], schema.fields[key])
  }
  if (schema.kind === 'array') {
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

export function clientSideValidateProp(schema: ComponentSchema, value: unknown): boolean {
  if (schema.kind === 'child' || schema.kind === 'relationship') return true
  if (schema.kind === 'form') return schema.validate(value)
  if (typeof value !== 'object' || value === null) return false

  switch (schema.kind) {
    case 'conditional': {
      if (!('discriminant' in value) || !('value' in value)) return false
      if (!schema.discriminant.validate(value.discriminant)) return false
      return clientSideValidateProp(
        schema.values[value.discriminant as string],
        value.value
      )
    }
    case 'object':
      return Object.entries(schema.fields).every(([key, childProp]) =>
        clientSideValidateProp(childProp, (value as any)[key])
      )
    case 'array':
      return Array.isArray(value) && value.every(innerVal =>
        clientSideValidateProp(schema.element, innerVal)
      )
  }
}

export function getAncestorSchemas(
  rootSchema: ComponentSchema,
  path: ReadonlyPropPath,
  value: unknown
): ComponentSchema[] {
  const ancestors: ComponentSchema[] = []
  const currentPath = [...path]
  let currentProp = rootSchema
  let currentValue = value

  while (currentPath.length) {
    ancestors.push(currentProp)
    const key = currentPath.shift()!
    if (currentProp.kind === 'array') {
      currentProp = currentProp.element
      currentValue = (currentValue as any)[key]
    } else if (currentProp.kind === 'conditional') {
      currentProp = currentProp.values[(value as any).discriminant]
      currentValue = (currentValue as any).value
    } else if (currentProp.kind === 'object') {
      currentValue = (currentValue as any)[key]
      currentProp = currentProp.fields[key]
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

export function getValueAtPropPath(value: unknown, inputPath: ReadonlyPropPath): unknown {
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
): void {
  if (schema.kind === 'form' || schema.kind === 'relationship' || schema.kind === 'child') {
    visitor(schema, value, path)
    return
  }
  if (schema.kind === 'object') {
    for (const [key, childProp] of Object.entries(schema.fields)) {
      traverseProps(childProp, (value as any)[key], visitor, [...path, key])
    }
    visitor(schema, value, path)
    return
  }
  if (schema.kind === 'array') {
    for (const [idx, val] of (value as unknown[]).entries()) {
      traverseProps(schema.element, val, visitor, path.concat(idx))
    }
    visitor(schema, value, path)
    return
  }
  if (schema.kind === 'conditional') {
    const discriminant: string | boolean = (value as any).discriminant
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

  const [key, ...newPath] = path

  if (schema.kind === 'object') {
    return {
      ...(value as any),
      [key]: replaceValueAtPropPath(schema.fields[key], (value as any)[key], newValue, newPath),
    }
  }

  if (schema.kind === 'conditional') {
    const conditionalValue = value as { discriminant: string | boolean; value: unknown }
    assert(key === 'value')
    return {
      discriminant: conditionalValue.discriminant,
      value: replaceValueAtPropPath(schema.values[key], conditionalValue.value, newValue, newPath),
    }
  }

  if (schema.kind === 'array') {
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