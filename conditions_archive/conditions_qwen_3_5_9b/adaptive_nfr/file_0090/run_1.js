import type { DocumentFeatures } from '../../views-shared'
import type { DocumentFeaturesForNormalization } from '../document-features-normalization'
import { type Mark, assert } from '../utils'
import type { ComponentSchema, ChildField } from './api-shared'
import { getKeysForArrayValue, setKeysForArrayValue } from './preview-props'

type PathToChildFieldWithOption = { path: ReadonlyPropPath; options: ChildField['options'] }

type FindChildPropPathsStrategy = (
  value: any,
  schema: ComponentSchema,
  path: ReadonlyPropPath
) => PathToChildFieldWithOption[]

const findChildPropPathsStrategies: Record<string, FindChildPropPathsStrategy> = {
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
  if (!strategy) {
    assertNever(schema)
  }
  return strategy(value, schema, path)
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
  if (inlineMarksFromOptions === 'inherit') {
    return 'inherit' as any
  }
  return Object.fromEntries(
    Object.keys(editorDocumentFeatures.formatting.inlineMarks).map(mark => {
      return [mark as Mark, !!(inlineMarksFromOptions || {})[mark as Mark]]
    })
  ) as Record<Mark, boolean>
}

function getInlineDocumentFeatures(
  options: ChildField['options']
): {
  links: boolean
  relationships: boolean
  softBreaks: boolean
} {
  return {
    links: options.links === 'inherit',
    relationships: options.relationships === 'inherit',
    softBreaks: options.formatting?.softBreaks === 'inherit',
  }
}

function getBlockDocumentFeatures(
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
  const inlineMarks = getInlineMarks(editorDocumentFeatures, options.formatting?.inlineMarks)
  const inlineFeatures = getInlineDocumentFeatures(options)
  const blockFeatures = getBlockDocumentFeatures(editorDocumentFeatures, options)

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
    softBreaks: blockFeatures.formatting.listTypes.ordered || blockFeatures.formatting.listTypes.unordered,
    documentFeatures: blockFeatures,
    componentBlocks: options.componentBlocks === 'inherit',
  }
}

function getSchemaAtPropPathStrategy(
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

function validateProp(schema: ComponentSchema, value: unknown): boolean {
  if (schema.kind === 'child') return true
  if (schema.kind === 'relationship') return true
  if (schema.kind === 'form') return schema.validate(value)
  if (typeof value !== 'object') return false
  if (value === null) return false
  return false
}

function validateConditional(schema: ComponentSchema, value: unknown): boolean {
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

function validateObject(schema: ComponentSchema, value: unknown): boolean {
  for (const [key, childProp] of Object.entries(schema.fields)) {
    if (!clientSideValidateProp(childProp, (value as any)[key])) return false
  }
  return true
}

function validateArray(schema: ComponentSchema, value: unknown): boolean {
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

  const validationStrategies: Record<string, (schema: ComponentSchema, value: unknown) => boolean> = {
    conditional: validateConditional,
    object: validateObject,
    array: validateArray,
  }

  const strategy = validationStrategies[schema.kind]
  if (!strategy) {
    assertNever(schema)
  }
  return strategy(schema, value)
}

function getAncestorSchemaStrategy(
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
  if (
    currentProp.kind === 'child' ||
    currentProp.kind === 'form' ||
    currentProp.kind === 'relationship'
  ) {
    throw new Error(`unexpected prop "${key}"`)
  }
  assertNever(currentProp)
}

function getAncestorCurrentValueStrategy(
  currentProp: ComponentSchema,
  key: string | number,
  currentValue: unknown,
  value: unknown
): unknown {
  if (currentProp.kind === 'array') {
    return (currentValue as any)[key]
  }
  if (currentProp.kind === 'conditional') {
    return (currentValue as any).value
  }
  if (currentProp.kind === 'object') {
    return (currentValue as any)[key]
  }
  if (
    currentProp.kind === 'child' ||
    currentProp.kind === 'form' ||
    currentProp.kind === 'relationship'
  ) {
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
    currentProp = getAncestorSchemaStrategy(currentProp, key, currentValue, value)
    currentValue = getAncestorCurrentValueStrategy(currentProp, key, currentValue, value)
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

type TraversePropsStrategy = (
  schema: ComponentSchema,
  value: unknown,
  path: ReadonlyPropPath,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void
) => void

const traversePropsStrategies: Record<string, TraversePropsStrategy> = {
  form: (schema, value, path, visitor) => {
    visitor(schema, value, path)
  },
  relationship: (schema, value, path, visitor) => {
    visitor(schema, value, path)
  },
  child: (schema, value, path, visitor) => {
    visitor(schema, value, path)
  },
  object: (schema, value, path, visitor) => {
    for (const [key, childProp] of Object.entries(schema.fields)) {
      traverseProps(childProp, (value as any)[key], visitor, [...path, key])
    }
    visitor(schema, value, path)
  },
  array: (schema, value, path, visitor) => {
    for (const [idx, val] of (value as unknown[]).entries()) {
      traverseProps(schema.element, val, visitor, path.concat(idx))
    }
    visitor(schema, value, path)
  },
  conditional: (schema, value, path, visitor) => {
    const discriminant: string | boolean = (value as any).discriminant
    visitor(schema, discriminant, path.concat('discriminant'))
    traverseProps(
      schema.values[discriminant.toString()],
      (value as any).value,
      visitor,
      path.concat('value')
    )
    visitor(schema, value, path)
  },
}

export function traverseProps(
  schema: ComponentSchema,
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath = []
) {
  const strategy = traversePropsStrategies[schema.kind]
  if (!strategy) {
    assertNever(schema)
  }
  strategy(schema, value, path, visitor)
}

function replaceValueAtPropPathStrategy(
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

export function replaceValueAtPropPath(
  schema: ComponentSchema,
  value: unknown,
  newValue: unknown,
  path: ReadonlyPropPath
): unknown {
  return replaceValueAtPropPathStrategy(schema, value, newValue, path)
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