import type { DocumentFeatures } from '../../views-shared'
import type { DocumentFeaturesForNormalization } from '../document-features-normalization'
import { type Mark, assert } from '../utils'
import type { ComponentSchema, ChildField } from './api-shared'
import { getKeysForArrayValue, setKeysForArrayValue } from './preview-props'

type PathToChildFieldWithOption = { path: ReadonlyPropPath; options: ChildField['options'] }

type Handler<T extends ComponentSchema['kind']> = (
  value: any,
  schema: Extract<ComponentSchema, { kind: T }>,
  path: ReadonlyPropPath
) => PathToChildFieldWithOption[]

const findChildPropPathsHandlers: {
  [K in ComponentSchema['kind']]: Handler<K>
} = {
  form: () => [],
  relationship: () => [],
  child: (_value, schema, path) => [{ path, options: schema.options }],
  conditional: (value, schema, path) =>
    findChildPropPathsForProp(value.value, schema.values[value.discriminant], path.concat('value')),
  object: (value, schema, path) => {
    const paths: PathToChildFieldWithOption[] = []
    Object.entries(schema.fields).forEach(([key, childSchema]) => {
      paths.push(...findChildPropPathsForProp(value[key], childSchema as any, path.concat(key)))
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

/**
 * Recursively find child prop paths for a given value and schema.
 */
export function findChildPropPathsForProp(
  value: any,
  schema: ComponentSchema,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  // @ts-expect-error runtime dispatch based on schema.kind
  return findChildPropPathsHandlers[schema.kind](value, schema as any, path)
}

/**
 * Find child prop paths for a top‑level object.
 */
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

/**
 * Throws an error for impossible code paths.
 */
export function assertNever(arg: never): never {
  throw new Error('expected to never be called but received: ' + JSON.stringify(arg))
}

/**
 * Document features for a child field, derived from editor features and field options.
 */
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
) {
  const inlineMarksFromOptions = options.formatting?.inlineMarks
  return inlineMarksFromOptions === 'inherit'
    ? 'inherit'
    : (Object.fromEntries(
        Object.keys(editorDocumentFeatures.formatting.inlineMarks).map(mark => [
          mark as Mark,
          !!(inlineMarksFromOptions || {})[mark as Mark],
        ])
      ) as Record<Mark, boolean>)
}

/**
 * Build document features for an inline child field.
 */
function getInlineFeatures(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): DocumentFeaturesForChildField {
  return {
    kind: 'inline',
    inlineMarks: computeInlineMarks(editorDocumentFeatures, options),
    documentFeatures: {
      links: options.links === 'inherit',
      relationships: options.relationships === 'inherit',
    },
    softBreaks: options.formatting?.softBreaks === 'inherit',
  }
}

/**
 * Build document features for a block child field.
 */
function getBlockFeatures(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): DocumentFeaturesForChildField {
  return {
    kind: 'block',
    inlineMarks: computeInlineMarks(editorDocumentFeatures, options),
    softBreaks: options.formatting?.softBreaks === 'inherit',
    documentFeatures: {
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
    },
    componentBlocks: options.componentBlocks === 'inherit',
  }
}

/**
 * Derive document features for a child field based on editor features and field options.
 */
export function getDocumentFeaturesForChildField(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): DocumentFeaturesForChildField {
  return options.kind === 'inline'
    ? getInlineFeatures(editorDocumentFeatures, options)
    : getBlockFeatures(editorDocumentFeatures, options)
}

/**
 * Recursively retrieve the schema at a given prop path.
 */
function getSchemaAtPropPathInner(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
): undefined | ComponentSchema {
  if (path.length === 0) return schema
  if (schema.kind === 'child' || schema.kind === 'form' || schema.kind === 'relationship')
    return undefined

  const handlers: {
    [K in ComponentSchema['kind']]: (
      path: (string | number)[],
      value: unknown,
      schema: Extract<ComponentSchema, { kind: K }>
    ) => undefined | ComponentSchema
  } = {
    conditional: (p, v, s) => {
      const key = p.shift()
      if (key === 'discriminant')
        return getSchemaAtPropPathInner(p, (v as any).discriminant, s.discriminant)
      if (key === 'value') {
        const propVal = s.values[(v as any).discriminant]
        return getSchemaAtPropPathInner(p, (v as any).value, propVal)
      }
      return undefined
    },
    object: (p, v, s) => {
      const key = p.shift()!
      return getSchemaAtPropPathInner(p, (v as any)[key], s.fields[key])
    },
    array: (p, v, s) => {
      const index = p.shift()!
      return getSchemaAtPropPathInner(p, (v as any)[index], s.element)
    },
    // unreachable kinds handled by assertNever
    child: () => undefined,
    form: () => undefined,
    relationship: () => undefined,
  }

  // @ts-expect-error runtime dispatch
  return handlers[schema.kind](path, value, schema as any)
}

/**
 * Public API to get schema at a prop path.
 */
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

/**
 * Validate a prop value against its schema on the client side.
 */
function clientSideValidatePropConditional(
  schema: Extract<ComponentSchema, { kind: 'conditional' }>,
  value: any
): boolean {
  if (!('discriminant' in value) || !('value' in value)) return false
  if (!schema.discriminant.validate(value.discriminant)) return false
  const innerSchema = schema.values[value.discriminant as string]
  return clientSideValidateProp(innerSchema, value.value)
}

function clientSideValidatePropObject(
  schema: Extract<ComponentSchema, { kind: 'object' }>,
  value: any
): boolean {
  for (const [key, childProp] of Object.entries(schema.fields)) {
    if (!clientSideValidateProp(childProp, (value as any)[key])) return false
  }
  return true
}

function clientSideValidatePropArray(
  schema: Extract<ComponentSchema, { kind: 'array' }>,
  value: any
): boolean {
  if (!Array.isArray(value)) return false
  for (const innerVal of value) {
    if (!clientSideValidateProp(schema.element, innerVal)) return false
  }
  return true
}

/**
 * Validate a prop value against its schema on the client side.
 */
export function clientSideValidateProp(schema: ComponentSchema, value: unknown): boolean {
  if (schema.kind === 'child' || schema.kind === 'relationship') return true
  if (schema.kind === 'form') return schema.validate(value)
  if (typeof value !== 'object' || value === null) return false

  const validators: {
    [K in ComponentSchema['kind']]: (schema: any, value: any) => boolean
  } = {
    conditional: clientSideValidatePropConditional,
    object: clientSideValidatePropObject,
    array: clientSideValidatePropArray,
    child: () => true,
    form: () => false,
    relationship: () => true,
  }

  // @ts-expect-error runtime dispatch
  return validators[schema.kind](schema, value)
}

/**
 * Get all ancestor schemas for a given path.
 */
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

    if (currentProp.kind === 'array') {
      currentProp = currentProp.element
      currentValue = (currentValue as any)[key]
    } else if (currentProp.kind === 'conditional') {
      currentProp = currentProp.values[(value as any).discriminant]
      currentValue = (currentValue as any).value
    } else if (currentProp.kind === 'object') {
      currentValue = (currentValue as any)[key]
      currentProp = currentProp.fields[key]
    } else {
      if (
        currentProp.kind === 'child' ||
        currentProp.kind === 'form' ||
        currentProp.kind === 'relationship'
      ) {
        throw new Error(`unexpected prop "${key}"`)
      }
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

/**
 * Traverse a schema/value tree, invoking a visitor at each node.
 */
function traverseObject(
  schema: Extract<ComponentSchema, { kind: 'object' }>,
  value: any,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath
) {
  for (const [key, childProp] of Object.entries(schema.fields)) {
    traverseProps(childProp, (value as any)[key], visitor, [...path, key])
  }
  visitor(schema, value, path)
}

function traverseArray(
  schema: Extract<ComponentSchema, { kind: 'array' }>,
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath
) {
  for (const [idx, val] of (value as unknown[]).entries()) {
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

/**
 * Recursively traverse a schema/value tree.
 */
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

  const handlers: {
    [K in ComponentSchema['kind']]: (
      schema: any,
      value: any,
      visitor: typeof visitor,
      path: ReadonlyPropPath
    ) => void
  } = {
    object: traverseObject,
    array: traverseArray,
    conditional: traverseConditional,
    child: () => {},
    form: () => {},
    relationship: () => {},
  }

  // @ts-expect-error runtime dispatch
  handlers[schema.kind](schema, value, visitor, path)
}

/**
 * Replace a value at a given prop path, returning a new value tree.
 */
function replaceInObject(
  schema: Extract<ComponentSchema, { kind: 'object' }>,
  value: any,
  newValue: unknown,
  key: string | number,
  newPath: ReadonlyPropPath
) {
  return {
    ...(value as any),
    [key]: replaceValueAtPropPath(schema.fields[key as string], (value as any)[key], newValue, newPath),
  }
}

function replaceInArray(
  schema: Extract<ComponentSchema, { kind: 'array' }>,
  value: unknown,
  newValue: unknown,
  key: string | number,
  newPath: ReadonlyPropPath
) {
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

/**
 * Replace a value at a given prop path.
 */
export function replaceValueAtPropPath(
  schema: ComponentSchema,
  value: unknown,
  newValue: unknown,
  path: ReadonlyPropPath
): unknown {
  if (path.length === 0) return newValue

  const [key, ...newPath] = path

  const handlers: {
    [K in ComponentSchema['kind']]: (
      schema: any,
      value: any,
      newValue: unknown,
      key: string | number,
      newPath: ReadonlyPropPath
    ) => unknown
  } = {
    object: replaceInObject,
    conditional: (s, v, nv, k, np) => {
      const conditionalValue = v as { discriminant: string | boolean; value: unknown }
      assert(k === 'value')
      return {
        discriminant: conditionalValue.discriminant,
        value: replaceValueAtPropPath(s.values[k as string], conditionalValue.value, nv, np),
      }
    },
    array: replaceInArray,
    child: () => {
      // should never reach here because path length > 0
      assert(false)
    },
    form: () => {
      assert(false)
    },
    relationship: () => {
      assert(false)
    },
  }

  // @ts-expect-error runtime dispatch
  return handlers[schema.kind](schema, value, newValue, key, newPath)
}

/**
 * Get placeholder text for a given prop path.
 */
export function getPlaceholderTextForPropPath(
  propPath: ReadonlyPropPath,
  fields: Record<string, ComponentSchema>,
  formProps: Record<string, any>
): string {
  const field = getSchemaAtPropPath(propPath, formProps, fields)
  if (field?.kind === 'child') return field.options.placeholder
  return ''
}