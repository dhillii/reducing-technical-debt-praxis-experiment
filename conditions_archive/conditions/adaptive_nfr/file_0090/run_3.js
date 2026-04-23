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

/** Determines if inline marks should be inherited */
function shouldInheritInlineMarks(
  inlineMarksFromOptions: Record<Mark, boolean> | undefined
): inlineMarksFromOptions is undefined {
  return inlineMarksFromOptions === undefined
}

/** Builds inline marks configuration from options and editor features */
function buildInlineMarks(
  inlineMarksFromOptions: 'inherit' | Record<Mark, boolean> | undefined,
  editorInlineMarks: Record<Mark, boolean>
): 'inherit' | Record<Mark, boolean> {
  if (inlineMarksFromOptions === 'inherit') return 'inherit'
  return Object.fromEntries(
    Object.keys(editorInlineMarks).map(mark => [
      mark as Mark,
      !!(inlineMarksFromOptions || {})[mark as Mark],
    ])
  ) as Record<Mark, boolean>
}

/** Creates inline child field document features */
function createInlineDocumentFeatures(
  inlineMarks: 'inherit' | Record<Mark, boolean>,
  options: ChildField['options'] & { kind: 'inline' }
): DocumentFeaturesForChildField {
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

/** Creates block child field document features */
function createBlockDocumentFeatures(
  inlineMarks: 'inherit' | Record<Mark, boolean>,
  options: ChildField['options'] & { kind: 'block' },
  editorDocumentFeatures: DocumentFeatures
): DocumentFeaturesForChildField {
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
  const inlineMarks = buildInlineMarks(
    inlineMarksFromOptions,
    editorDocumentFeatures.formatting.inlineMarks
  )

  if (options.kind === 'inline') {
    return createInlineDocumentFeatures(inlineMarks, options)
  }
  return createBlockDocumentFeatures(inlineMarks, options, editorDocumentFeatures)
}

/** Strategy map for schema traversal by kind */
const schemaTraversalStrategies: Record<
  ComponentSchema['kind'],
  (
    path: (string | number)[],
    value: unknown,
    schema: any
  ) => undefined | ComponentSchema
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

  const strategy = schemaTraversalStrategies[schema.kind]
  return strategy(path, value, schema)
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

/** Validates a prop based on its schema */
function validatePropByKind(schema: ComponentSchema, value: unknown): boolean {
  if (schema.kind === 'child' || schema.kind === 'relationship') return true
  if (schema.kind === 'form') return schema.validate(value)
  if (typeof value !== 'object' || value === null) return false

  if (schema.kind === 'conditional') {
    if (!('discriminant' in value) || !('value' in value)) return false
    if (!schema.discriminant.validate(value.discriminant)) return false
    return clientSideValidateProp(
      schema.values[(value.discriminant as string)],
      value.value
    )
  }

  if (schema.kind === 'object') {
    for (const [key, childProp] of Object.entries(schema.fields)) {
      if (!clientSideValidateProp(childProp, (value as any)[key])) return false
    }
    return true
  }

  if (schema.kind === 'array') {
    if (!Array.isArray(value)) return false
    for (const innerVal of value) {
      if (!clientSideValidateProp(schema.element, innerVal)) return false
    }
    return true
  }

  return false
}

export function clientSideValidateProp(schema: ComponentSchema, value: unknown): boolean {
  return validatePropByKind(schema, value)
}

/** Strategy map for ancestor schema traversal */
const ancestorTraversalStrategies: Record<
  ComponentSchema['kind'],
  (
    currentProp: any,
    currentValue: any,
    key: string | number,
    rootValue: unknown
  ) => { prop: ComponentSchema; value: unknown } | null
> = {
  array: (currentProp, currentValue, key) => ({
    prop: currentProp.element,
    value: (currentValue as any)[key],
  }),
  conditional: (currentProp, currentValue, key, rootValue) => ({
    prop: currentProp.values[(rootValue as any).discriminant],
    value: (currentValue as any).value,
  }),
  object: (currentProp, currentValue, key) => ({
    prop: currentProp.fields[key],
    value: (currentValue as any)[key],
  }),
  child: () => null,
  form: () => null,
  relationship: () => null,
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
    const strategy = ancestorTraversalStrategies[currentProp.kind]
    const result = strategy(currentProp, currentValue, key, value)

    if (result === null) {
      throw new Error(`unexpected prop "${key}"`)
    }

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

/** Strategy map for prop traversal by schema kind */
const propTraversalStrategies: Record<
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
  const strategy = propTraversalStrategies[schema.kind]
  strategy(schema, value, visitor, path)
}

/** Strategy map for value replacement by schema kind */
const valueReplacementStrategies: Record<
  ComponentSchema['kind'],
  (
    schema: any,
    value: unknown,
    newValue: unknown,
    key: string | number,
    newPath: ReadonlyPropPath
  ) => unknown | null
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
  form: () => null,
  relationship: () => null,
  child: () => null,
}

export function replaceValueAtPropPath(
  schema: ComponentSchema,
  value: unknown,
  newValue: unknown,
  path: ReadonlyPropPath
): unknown {
  if (path.length === 0) return newValue

  const [key, ...newPath] = path

  const strategy = valueReplacementStrategies[schema.kind]
  const result = strategy(schema, value, newValue, key, newPath)

  if (result !== null) return result

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