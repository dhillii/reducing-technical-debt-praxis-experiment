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
    case 'object': {
      const paths: PathToChildFieldWithOption[] = []
      Object.keys(schema.fields).forEach(key => {
        paths.push(...findChildPropPathsForProp(value[key], schema.fields[key], path.concat(key)))
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

function getDocumentFeaturesForChildFieldInline(
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

function getDocumentFeaturesForChildFieldBlock(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): DocumentFeaturesForChildField['block'] {
  const inlineMarks = getInlineMarksFromOptions(editorDocumentFeatures, options)

  return {
    kind: 'block',
    inlineMarks,
    softBreaks: options.formatting?.softBreaks === 'inherit',
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
    return getDocumentFeaturesForChildFieldInline(editorDocumentFeatures, options)
  }
  return getDocumentFeaturesForChildFieldBlock(editorDocumentFeatures, options)
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

function validatePropKind(schema: ComponentSchema, value: unknown): boolean {
  if (schema.kind === 'child') return true
  if (schema.kind === 'relationship') return true
  if (schema.kind === 'form') return schema.validate(value)
  if (typeof value !== 'object') return false
  if (value === null) return false
  return false
}

function validateConditionalProp(schema: ComponentSchema, value: unknown): boolean {
  if (!('discriminant' in value) || !('value' in value)) return false
  if (!schema.discriminant.validate(value.discriminant)) return false
  return validatePropKind(
    schema.values[
      // not actually gonna always be a string but just let property access do the coercion
      value.discriminant as string
    ],
    value.value
  )
}

function validateObjectProp(schema: ComponentSchema, value: unknown): boolean {
  for (const [key, childProp] of Object.entries(schema.fields)) {
    if (!validatePropKind(childProp, (value as any)[key])) return false
  }
  return true
}

function validateArrayProp(schema: ComponentSchema, value: unknown): boolean {
  if (!Array.isArray(value)) return false
  for (const innerVal of value) {
    if (!validatePropKind(schema.element, innerVal)) return false
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
  }
}

function getAncestorSchemaAtStep(
  currentProp: ComponentSchema,
  key: string | number,
  currentValue: unknown,
  value: unknown
): ComponentSchema {
  if (currentProp.kind === 'array') {
    return currentProp.element
  } else if (currentProp.kind === 'conditional') {
    return currentProp.values[(value as any).discriminant]
  } else if (currentProp.kind === 'object') {
    return currentProp.fields[key]
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

function getAncestorValueAtStep(
  currentProp: ComponentSchema,
  key: string | number,
  currentValue: unknown,
  value: unknown
): unknown {
  if (currentProp.kind === 'array') {
    return (currentValue as any)[key]
  } else if (currentProp.kind === 'conditional') {
    return (currentValue as any).value
  } else if (currentProp.kind === 'object') {
    return (currentValue as any)[key]
  } else {
    throw new Error(`unexpected prop "${key}"`)
  }
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
    currentValue = getAncestorValueAtStep(currentProp, key, currentValue, value)
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
    return visitor(schema, value, path)
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

function replaceValueAtPropPathRecursive(
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
      [key]: replaceValueAtPropPathRecursive(schema.fields[key], (value as any)[key], newValue, newPath),
    }
  }

  if (schema.kind === 'conditional') {
    const conditionalValue = value as { discriminant: string | boolean; value: unknown }
    // replaceValueAtPropPath should not be used to only update the discriminant of a conditional field
    // if you want to update the discriminant of a conditional field, replace the value of the whole conditional field
    assert(key === 'value')
    return {
      discriminant: conditionalValue.discriminant,
      value: replaceValueAtPropPathRecursive(schema.values[key], conditionalValue.value, newValue, newPath),
    }
  }

  if (schema.kind === 'array') {
    const prevVal = value as unknown[]
    const newVal = [...prevVal]
    setKeysForArrayValue(newVal, getKeysForArrayValue(prevVal))
    newVal[key as number] = replaceValueAtPropPathRecursive(
      schema.element,
      newVal[key as number],
      newValue,
      newPath
    )
    return newVal
  }

  // we should never reach here since form, relationship or child fields don't contain other fields
  // so the only thing that can happen to them is to be replaced which happens at the start of this function when path.length === 0
  assert(schema.kind !== 'form' && schema.kind !== 'relationship' && schema.kind !== 'child')

  assertNever(schema)
}

export function replaceValueAtPropPath(
  schema: ComponentSchema,
  value: unknown,
  newValue: unknown,
  path: ReadonlyPropPath
): unknown {
  return replaceValueAtPropPathRecursive(schema, value, newValue, path)
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