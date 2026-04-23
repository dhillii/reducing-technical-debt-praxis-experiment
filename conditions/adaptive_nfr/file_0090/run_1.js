import type { DocumentFeatures } from '../../views-shared'
import type { DocumentFeaturesForNormalization } from '../document-features-normalization'
import { type Mark, assert } from '../utils'
import type { ComponentSchema, ChildField } from './api-shared'
import { getKeysForArrayValue, setKeysForArrayValue } from './preview-props'

type PathToChildFieldWithOption = { path: ReadonlyPropPath; options: ChildField['options'] }

/** Dispatch table for schema kind handlers in findChildPropPathsForProp */
const childPropPathHandlers: Record<
  ComponentSchema['kind'],
  (value: any, schema: any, path: ReadonlyPropPath) => PathToChildFieldWithOption[]
> = {
  form: () => [],
  relationship: () => [],
  child: (_, schema, path) => [{ path, options: schema.options }],
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
  const handler = childPropPathHandlers[schema.kind]
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

/** Determines if inline marks should be inherited */
function shouldInheritInlineMarks(
  inlineMarksFromOptions: any
): inlineMarksFromOptions is 'inherit' {
  return inlineMarksFromOptions === 'inherit'
}

/** Builds inline marks object from editor features and options */
function buildInlineMarks(
  editorDocumentFeatures: DocumentFeatures,
  inlineMarksFromOptions: any
): 'inherit' | Record<Mark, boolean> {
  if (shouldInheritInlineMarks(inlineMarksFromOptions)) {
    return 'inherit'
  }
  return Object.fromEntries(
    Object.keys(editorDocumentFeatures.formatting.inlineMarks).map(mark => {
      return [mark as Mark, !!(inlineMarksFromOptions || {})[mark as Mark]]
    })
  ) as Record<Mark, boolean>
}

/** Builds document features for inline child field */
function buildInlineDocumentFeatures(options: ChildField['options']): DocumentFeaturesForChildField {
  const inlineMarksFromOptions = options.formatting?.inlineMarks
  const inlineMarks = buildInlineMarks({} as DocumentFeatures, inlineMarksFromOptions)

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

/** Builds formatting alignment configuration */
function buildAlignment(
  editorAlignment: any,
  optionsAlignment: any
): { center: boolean; end: boolean } {
  return optionsAlignment === 'inherit'
    ? editorAlignment
    : {
        center: false,
        end: false,
      }
}

/** Builds formatting block types configuration */
function buildBlockTypes(
  editorBlockTypes: any,
  optionsBlockTypes: any
): { blockquote: boolean; code: boolean } {
  return optionsBlockTypes === 'inherit'
    ? editorBlockTypes
    : {
        blockquote: false,
        code: false,
      }
}

/** Builds formatting heading levels configuration */
function buildHeadingLevels(
  editorHeadingLevels: any,
  optionsHeadingLevels: any
): any[] {
  return optionsHeadingLevels === 'inherit' ? editorHeadingLevels : optionsHeadingLevels || []
}

/** Builds formatting list types configuration */
function buildListTypes(
  editorListTypes: any,
  optionsListTypes: any
): { ordered: boolean; unordered: boolean } {
  return optionsListTypes === 'inherit'
    ? editorListTypes
    : {
        ordered: false,
        unordered: false,
      }
}

/** Builds document features for block child field */
function buildBlockDocumentFeatures(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): DocumentFeaturesForNormalization {
  const optionsFormatting = options.formatting || {}

  return {
    layouts: [],
    dividers: options.dividers === 'inherit' ? editorDocumentFeatures.dividers : false,
    formatting: {
      alignment: buildAlignment(
        editorDocumentFeatures.formatting.alignment,
        optionsFormatting.alignment
      ),
      blockTypes: buildBlockTypes(
        editorDocumentFeatures.formatting.blockTypes,
        optionsFormatting.blockTypes
      ),
      headingLevels: buildHeadingLevels(
        editorDocumentFeatures.formatting.headingLevels,
        optionsFormatting.headingLevels
      ),
      listTypes: buildListTypes(
        editorDocumentFeatures.formatting.listTypes,
        optionsFormatting.listTypes
      ),
    },
    links: options.links === 'inherit',
    relationships: options.relationships === 'inherit',
  }
}

export function getDocumentFeaturesForChildField(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): DocumentFeaturesForChildField {
  const inlineMarksFromOptions = options.formatting?.inlineMarks
  const inlineMarks = buildInlineMarks(editorDocumentFeatures, inlineMarksFromOptions)

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

/** Dispatch table for schema kind handlers in getSchemaAtPropPathInner */
const schemaPathHandlers: Record<
  ComponentSchema['kind'],
  (path: (string | number)[], value: unknown, schema: any) => undefined | ComponentSchema
> = {
  child: () => undefined,
  form: () => undefined,
  relationship: () => undefined,
  conditional: (path, value, schema) => {
    const key = path.shift()
    if (key === 'discriminant')
      return getSchemaAtPropPathInner(path, (value as any).discriminant, schema.discriminant)
    if (key === 'value') {
      const propVal = schema.values[(value as any).discriminant]
      return getSchemaAtPropPathInner(path, (value as any).value, propVal)
    }
    return undefined
  },
  object: (path, value, schema) => {
    const key = path.shift()!
    return getSchemaAtPropPathInner(path, (value as any)[key], schema.fields[key])
  },
  array: (path, value, schema) => {
    const index = path.shift()!
    return getSchemaAtPropPathInner(path, (value as any)[index], schema.element)
  },
}

function getSchemaAtPropPathInner(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
): undefined | ComponentSchema {
  if (path.length === 0) return schema

  const handler = schemaPathHandlers[schema.kind]
  if (handler) {
    return handler(path, value, schema)
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

/** Validates a form schema value */
function validateFormProp(schema: ComponentSchema, value: unknown): boolean {
  return schema.kind === 'form' ? schema.validate(value) : true
}

/** Validates a conditional schema value */
function validateConditionalProp(schema: any, value: unknown): boolean {
  if (!('discriminant' in value) || !('value' in value)) return false
  if (!schema.discriminant.validate((value as any).discriminant)) return false
  return clientSideValidateProp(
    schema.values[(value as any).discriminant as string],
    (value as any).value
  )
}

/** Validates an object schema value */
function validateObjectProp(schema: any, value: unknown): boolean {
  for (const [key, childProp] of Object.entries(schema.fields)) {
    if (!clientSideValidateProp(childProp as ComponentSchema, (value as any)[key])) return false
  }
  return true
}

/** Validates an array schema value */
function validateArrayProp(schema: any, value: unknown): boolean {
  if (!Array.isArray(value)) return false
  for (const innerVal of value) {
    if (!clientSideValidateProp(schema.element, innerVal)) return false
  }
  return true
}

/** Dispatch table for validation handlers */
const validationHandlers: Record<
  ComponentSchema['kind'],
  (schema: any, value: unknown) => boolean
> = {
  child: () => true,
  relationship: () => true,
  form: validateFormProp,
  conditional: validateConditionalProp,
  object: validateObjectProp,
  array: validateArrayProp,
}

export function clientSideValidateProp(schema: ComponentSchema, value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return schema.kind === 'child' || schema.kind === 'relationship' || schema.kind === 'form'
      ? schema.kind !== 'form'
        ? true
        : schema.validate(value)
      : false
  }

  const handler = validationHandlers[schema.kind]
  return handler(schema, value)
}

/** Dispatch table for ancestor schema handlers */
const ancestorHandlers: Record<
  ComponentSchema['kind'],
  (currentProp: any, currentValue: any, key: string | number, value: unknown) => {
    prop: ComponentSchema
    value: unknown
  }
> = {
  array: (currentProp, currentValue, key) => ({
    prop: currentProp.element,
    value: (currentValue as any)[key],
  }),
  conditional: (currentProp, _, __, value) => ({
    prop: currentProp.values[(value as any).discriminant],
    value: (currentValue as any).value,
  }),
  object: (currentProp, currentValue, key) => ({
    prop: currentProp.fields[key],
    value: (currentValue as any)[key],
  }),
  child: () => {
    throw new Error(`unexpected prop`)
  },
  form: () => {
    throw new Error(`unexpected prop`)
  },
  relationship: () => {
    throw new Error(`unexpected prop`)
  },
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
    const handler = ancestorHandlers[currentProp.kind]
    const result = handler(currentProp, currentValue, key, value)
    currentProp = result.prop
    currentValue = result.value
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

/** Dispatch table for traverseProps handlers */
const traverseHandlers: Record<
  ComponentSchema['kind'],
  (
    schema: any,
    value: unknown,
    visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
    path: ReadonlyPropPath
  ) => void
> = {
  form: (schema, value, visitor, path) => {
    visitor(schema, value, path)
  },
  relationship: (schema, value, visitor, path) => {
    visitor(schema, value, path)
  },
  child: (schema, value, visitor, path) => {
    visitor(schema, value, path)
  },
  object: (schema, value, visitor, path) => {
    for (const [key, childProp] of Object.entries(schema.fields)) {
      traverseProps(childProp, (value as any)[key], visitor, [...path, key])
    }
    visitor(schema, value, path)
  },
  array: (schema, value, visitor, path) => {
    for (const [idx, val] of (value as unknown[]).entries()) {
      traverseProps(schema.element, val, visitor, path.concat(idx))
    }
    visitor(schema, value, path)
  },
  conditional: (schema, value, visitor, path) => {
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
  const handler = traverseHandlers[schema.kind]
  handler(schema, value, visitor, path)
}

/** Dispatch table for replaceValueAtPropPath handlers */
const replaceHandlers: Record<
  ComponentSchema['kind'],
  (
    schema: any,
    value: unknown,
    newValue: unknown,
    key: string | number,
    newPath: ReadonlyPropPath
  ) => unknown
> = {
  object: (schema, value, newValue, key, newPath) => ({
    ...(value as any),
    [key]: replaceValueAtPropPath(schema.fields[key], (value as any)[key], newValue, newPath),
  }),
  conditional: (schema, value, newValue, key, newPath) => {
    const conditionalValue = value as { discriminant: string | boolean; value: unknown }
    assert(key === 'value')
    return {
      discriminant: conditionalValue.discriminant,
      value: replaceValueAtPropPath(
        schema.values[key],
        conditionalValue.value,
        newValue,
        newPath
      ),
    }
  },
  array: (schema, value, newValue, key, newPath) => {
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
  },
  form: () => {
    throw new Error('Unexpected form field in replaceValueAtPropPath')
  },
  relationship: () => {
    throw new Error('Unexpected relationship field in replaceValueAtPropPath')
  },
  child: () => {
    throw new Error('Unexpected child field in replaceValueAtPropPath')
  },
}

export function replaceValueAtPropPath(
  schema: ComponentSchema,
  value: unknown,
  newValue: unknown,
  path: ReadonlyPropPath
): unknown {
  if (path.length === 0) return newValue

  const [key, ...newPath] = path

  const handler = replaceHandlers[schema.kind]
  return handler(schema, value, newValue, key, newPath)
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