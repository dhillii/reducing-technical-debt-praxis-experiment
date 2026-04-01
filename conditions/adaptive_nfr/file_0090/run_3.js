```typescript
import type { DocumentFeatures } from '../../views-shared'
import type { DocumentFeaturesForNormalization } from '../document-features-normalization'
import { type Mark, assert } from '../utils'
import type { ComponentSchema, ChildField } from './api-shared'
import { getKeysForArrayValue, setKeysForArrayValue } from './preview-props'

type PathToChildFieldWithOption = { path: ReadonlyPropPath; options: ChildField['options'] }

/** Strategy map for finding child prop paths by schema kind */
const childPropPathStrategies: Record<
  ComponentSchema['kind'],
  (value: any, schema: any, path: ReadonlyPropPath) => PathToChildFieldWithOption[]
> = {
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
  const strategy = childPropPathStrategies[schema.kind]
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

/** Compute inline marks from options and editor features */
function computeInlineMarks(
  editorDocumentFeatures: DocumentFeatures,
  inlineMarksFromOptions: any
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

/** Build inline child field features */
function buildInlineFeatures(
  inlineMarks: 'inherit' | Record<Mark, boolean>,
  options: ChildField['options'] & { kind: 'inline' }
): DocumentFeaturesForChildField & { kind: 'inline' } {
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

/** Build block child field features */
function buildBlockFeatures(
  editorDocumentFeatures: DocumentFeatures,
  inlineMarks: 'inherit' | Record<Mark, boolean>,
  options: ChildField['options'] & { kind: 'block' }
): DocumentFeaturesForChildField & { kind: 'block' } {
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
  const inlineMarksFromOptions = options.formatting?.inlineMarks
  const inlineMarks = computeInlineMarks(editorDocumentFeatures, inlineMarksFromOptions)

  if (options.kind === 'inline') {
    return buildInlineFeatures(inlineMarks, options)
  }
  return buildBlockFeatures(editorDocumentFeatures, inlineMarks, options)
}

/** Check if schema is a leaf node (terminal field) */
function isLeafSchema(schema: ComponentSchema): boolean {
  return schema.kind === 'child' || schema.kind === 'form' || schema.kind === 'relationship'
}

/** Strategy map for schema traversal by kind */
const schemaTraversalStrategies: Record<
  Exclude<ComponentSchema['kind'], 'child' | 'form' | 'relationship'>,
  (
    path: (string | number)[],
    value: unknown,
    schema: any
  ) => undefined | ComponentSchema
> = {
  conditional: (path, value, schema) => {
    const key = path.shift()
    if (key === 'discriminant')
      return getSchemaAtPropPathInner(path, (value as any).discriminant, schema.discriminant)
    if (key === 'value') {
      const propVal = schema.values[(value as any).discriminant]
      return getSchemaAtPropPathInner(path, (value as any).value, propVal)
    }
    return
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
  if (isLeafSchema(schema)) return

  const strategy = schemaTraversalStrategies[schema.kind as keyof typeof schemaTraversalStrategies]
  if (strategy) {
    return strategy(path, value, schema)
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

/** Validate conditional schema */
function validateConditional(schema: any, value: unknown): boolean {
  if (!('discriminant' in value) || !('value' in value)) return false
  if (!schema.discriminant.validate(value.discriminant)) return false
  return clientSideValidateProp(
    schema.values[(value.discriminant as string)],
    (value as any).value
  )
}

/** Validate object schema */
function validateObject(schema: any, value: unknown): boolean {
  for (const [key, childProp] of Object.entries(schema.fields)) {
    if (!clientSideValidateProp(childProp as ComponentSchema, (value as any)[key])) return false
  }
  return true
}

/** Validate array schema */
function validateArray(schema: any, value: unknown): boolean {
  if (!Array.isArray(value)) return false
  for (const innerVal of value) {
    if (!clientSideValidateProp(schema.element, innerVal)) return false
  }
  return true
}

/** Strategy map for validation by schema kind */
const validationStrategies: Record<
  Exclude<ComponentSchema['kind'], 'child' | 'relationship'>,
  (schema: any, value: unknown) => boolean
> = {
  form: (schema, value) => schema.validate(value),
  conditional: validateConditional,
  object: validateObject,
  array: validateArray,
}

export function clientSideValidateProp(schema: ComponentSchema, value: unknown): boolean {
  if (schema.kind === 'child' || schema.kind === 'relationship') return true

  if (typeof value !== 'object' || value === null) {
    return schema.kind === 'form' && schema.validate(value)
  }

  const strategy = validationStrategies[schema.kind as keyof typeof validationStrategies]
  return strategy ? strategy(schema, value) : false
}

/** Strategy map for ancestor schema traversal by kind */
const ancestorTraversalStrategies: Record<
  Exclude<ComponentSchema['kind'], 'child' | 'form' | 'relationship'>,
  (currentProp: any, key: string | number, currentValue: unknown, rootValue: unknown) => {
    prop: ComponentSchema
    value: unknown
  }
> = {
  array: (currentProp, key, currentValue) => ({
    prop: currentProp.element,
    value: (currentValue as any)[key],
  }),
  conditional: (currentProp, key, currentValue, rootValue) => ({
    prop: currentProp.values[(rootValue as any).discriminant],
    value: (currentValue as any).value,
  }),
  object: (currentProp, key, currentValue) => ({
    prop: currentProp.fields[key],
    value: (currentValue as any)[key],
  }),
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

    if (isLeafSchema(currentProp)) {
      throw new Error(`unexpected prop "${key}"`)
    }

    const strategy =
      ancestorTraversalStrategies[currentProp.kind as keyof typeof ancestorTraversalStrategies]
    if (strategy) {
      const result = strategy(currentProp, key, currentValue, value)
      currentProp = result.prop
      currentValue = result.value
    } else {
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

/** Strategy map for traversal visitor by schema kind */
const traversalVisitorStrategies: Record<
  Exclude<ComponentSchema['kind'], 'form' | 'relationship' | 'child'>,
  (
    schema: any,
    value: unknown,
    visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
    path: ReadonlyPropPath
  ) => void
> = {
  object: (schema, value, visitor, path) => {
    for (const [key, childProp] of Object.entries(schema.fields)) {
      traverseProps(childProp as ComponentSchema, (value as any)[key], visitor, [...path, key])
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
  if (isLeafSchema(schema)) {
    visitor(schema, value, path)
    return
  }

  const strategy =
    traversalVisitorStrategies[schema.kind as keyof typeof traversalVisitorStrategies]
  if (strategy) {
    strategy(schema, value, visitor, path)
  } else {
    assertNever(schema)
  }
}

/** Strategy map for value replacement by schema kind */
const replacementStrategies: Record<
  Exclude<ComponentSchema['kind'], 'form' | 'relationship' | 'child'>,
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