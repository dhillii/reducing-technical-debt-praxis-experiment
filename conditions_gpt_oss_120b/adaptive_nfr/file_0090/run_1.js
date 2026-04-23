import type { DocumentFeatures } from '../../views-shared'
import type { DocumentFeaturesForNormalization } from '../document-features-normalization'
import { type Mark, assert } from '../utils'
import type { ComponentSchema, ChildField } from './api-shared'
import { getKeysForArrayValue, setKeysForArrayValue } from './preview-props'

type PathToChildFieldWithOption = { path: ReadonlyPropPath; options: ChildField['options'] }

type SchemaHandler<T, R> = (schema: T, ...args: any[]) => R

/** Dispatch map for findChildPropPathsForProp */
const findChildHandlers: Record<
  ComponentSchema['kind'],
  SchemaHandler<ComponentSchema, PathToChildFieldWithOption[]>
> = {
  form: () => [],
  relationship: () => [],
  child: (schema: Extract<ComponentSchema, { kind: 'child' }>, _value, path) => [
    { path, options: schema.options },
  ],
  conditional: (
    schema: Extract<ComponentSchema, { kind: 'conditional' }>,
    value,
    path
  ) => {
    return findChildPropPathsForProp(
      value.value,
      schema.values[value.discriminant],
      path.concat('value')
    )
  },
  object: (schema: Extract<ComponentSchema, { kind: 'object' }>, value, path) => {
    const paths: PathToChildFieldWithOption[] = []
    Object.keys(schema.fields).forEach((key) => {
      paths.push(
        ...findChildPropPathsForProp(value[key], schema.fields[key], path.concat(key))
      )
    })
    return paths
  },
  array: (schema: Extract<ComponentSchema, { kind: 'array' }>, value, path) => {
    const paths: PathToChildFieldWithOption[] = []
    ;(value as any[]).forEach((val, i) => {
      paths.push(...findChildPropPathsForProp(val, schema.element, path.concat(i)))
    })
    return paths
  },
}

/** Recursively find child prop paths */
export function findChildPropPathsForProp(
  value: any,
  schema: ComponentSchema,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  const handler = findChildHandlers[schema.kind] as any
  return handler(schema, value, path)
}

/** Public wrapper */
export function findChildPropPaths(
  value: Record<string, any>,
  props: Record<string, ComponentSchema>
): { path: ReadonlyPropPath | undefined; options: ChildField['options'] }[] {
  const propPaths = findChildPropPathsForProp(value, { kind: 'object', fields: props }, [])
  if (propPaths.length) return propPaths
  return [{ path: undefined, options: { kind: 'inline', placeholder: '' } }]
}

/** Helper for inline marks */
function computeInlineMarks(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): 'inherit' | Record<Mark, boolean> {
  const inlineMarksFromOptions = options.formatting?.inlineMarks
  if (inlineMarksFromOptions === 'inherit') return 'inherit'
  return Object.fromEntries(
    Object.keys(editorDocumentFeatures.formatting.inlineMarks).map((mark) => [
      mark as Mark,
      !!(inlineMarksFromOptions || {})[mark as Mark],
    ])
  ) as Record<Mark, boolean>
}

/** Inline field features */
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

/** Block field features */
function getBlockFeatures(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): DocumentFeaturesForChildField {
  const inlineMarks = computeInlineMarks(editorDocumentFeatures, options)
  return {
    kind: 'block',
    inlineMarks,
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

/** Public API */
export function getDocumentFeaturesForChildField(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): DocumentFeaturesForChildField {
  return options.kind === 'inline'
    ? getInlineFeatures(editorDocumentFeatures, options)
    : getBlockFeatures(editorDocumentFeatures, options)
}

/** Dispatch map for getSchemaAtPropPathInner */
const schemaPathHandlers: Record<
  ComponentSchema['kind'],
  SchemaHandler<ComponentSchema, undefined | ComponentSchema>
> = {
  child: () => undefined,
  form: () => undefined,
  relationship: () => undefined,
  conditional: (
    schema: Extract<ComponentSchema, { kind: 'conditional' }>,
    path,
    value
  ) => {
    const key = path.shift()
    if (key === 'discriminant')
      return getSchemaAtPropPathInner(
        path,
        (value as any).discriminant,
        schema.discriminant
      )
    if (key === 'value') {
      const propVal = schema.values[(value as any).discriminant]
      return getSchemaAtPropPathInner(path, (value as any).value, propVal)
    }
    return undefined
  },
  object: (
    schema: Extract<ComponentSchema, { kind: 'object' }>,
    path,
    value
  ) => {
    const key = path.shift()!
    return getSchemaAtPropPathInner(
      path,
      (value as any)[key],
      schema.fields[key]
    )
  },
  array: (
    schema: Extract<ComponentSchema, { kind: 'array' }>,
    path,
    value
  ) => {
    const index = path.shift()!
    return getSchemaAtPropPathInner(
      path,
      (value as any)[index],
      schema.element
    )
  },
}

/** Recursive schema lookup */
function getSchemaAtPropPathInner(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
): undefined | ComponentSchema {
  if (path.length === 0) return schema
  if (schema.kind === 'child' || schema.kind === 'form' || schema.kind === 'relationship')
    return undefined
  const handler = schemaPathHandlers[schema.kind] as any
  return handler(schema, path, value)
}

/** Public wrapper */
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

/** Dispatch map for clientSideValidateProp */
const validateHandlers: Record<
  ComponentSchema['kind'],
  SchemaHandler<ComponentSchema, boolean>
> = {
  child: () => true,
  relationship: () => true,
  form: (schema: Extract<ComponentSchema, { kind: 'form' }>, value) =>
    schema.validate(value),
  conditional: (
    schema: Extract<ComponentSchema, { kind: 'conditional' }>,
    value
  ) => {
    if (!('discriminant' in value) || !('value' in value)) return false
    if (!schema.discriminant.validate(value.discriminant)) return false
    return clientSideValidateProp(
      schema.values[value.discriminant as string],
      value.value
    )
  },
  object: (
    schema: Extract<ComponentSchema, { kind: 'object' }>,
    value
  ) => {
    for (const [key, childProp] of Object.entries(schema.fields)) {
      if (!clientSideValidateProp(childProp, (value as any)[key])) return false
    }
    return true
  },
  array: (
    schema: Extract<ComponentSchema, { kind: 'array' }>,
    value
  ) => {
    if (!Array.isArray(value)) return false
    for (const innerVal of value) {
      if (!clientSideValidateProp(schema.element, innerVal)) return false
    }
    return true
  },
}

/** Public validator */
export function clientSideValidateProp(schema: ComponentSchema, value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return schema.kind === 'form' ? false : false
  }
  const handler = validateHandlers[schema.kind] as any
  return handler(schema, value)
}

/** Ancestor collection */
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
      assertNever(currentProp)
    }
  }
  return ancestors
}

/** Readonly path type */
export type ReadonlyPropPath = readonly (string | number)[]

/** Value extraction */
export function getValueAtPropPath(value: unknown, inputPath: ReadonlyPropPath) {
  const path = [...inputPath]
  while (path.length) {
    const key = path.shift()!
    value = (value as any)[key]
  }
  return value
}

/** Dispatch map for traverseProps */
const traverseHandlers: Record<
  ComponentSchema['kind'],
  SchemaHandler<ComponentSchema, void>
> = {
  form: (schema, value, visitor, path) => visitor(schema, value, path),
  relationship: (schema, value, visitor, path) => visitor(schema, value, path),
  child: (schema, value, visitor, path) => visitor(schema, value, path),
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

/** Recursive traversal */
export function traverseProps(
  schema: ComponentSchema,
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath = []
) {
  const handler = traverseHandlers[schema.kind] as any
  handler(schema, value, visitor, path)
}

/** Dispatch map for replaceValueAtPropPath */
const replaceHandlers: Record<
  ComponentSchema['kind'],
  SchemaHandler<ComponentSchema, unknown>
> = {
  object: (schema, value, newValue, path) => {
    const [key, ...newPath] = path
    return {
      ...(value as any),
      [key]: replaceValueAtPropPath(
        schema.fields[key],
        (value as any)[key],
        newValue,
        newPath
      ),
    }
  },
  conditional: (schema, value, newValue, path) => {
    const [key, ...newPath] = path
    assert(key === 'value')
    const conditionalValue = value as { discriminant: string | boolean; value: unknown }
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
  array: (schema, value, newValue, path) => {
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
  },
}

/** Replace value at a given prop path */
export function replaceValueAtPropPath(
  schema: ComponentSchema,
  value: unknown,
  newValue: unknown,
  path: ReadonlyPropPath
): unknown {
  if (path.length === 0) return newValue
  const handler = replaceHandlers[schema.kind] as any
  if (!handler) {
    assert(schema.kind !== 'form' && schema.kind !== 'relationship' && schema.kind !== 'child')
    assertNever(schema)
  }
  return handler(schema, value, newValue, path)
}

/** Placeholder extraction */
export function getPlaceholderTextForPropPath(
  propPath: ReadonlyPropPath,
  fields: Record<string, ComponentSchema>,
  formProps: Record<string, any>
): string {
  const field = getSchemaAtPropPath(propPath, formProps, fields)
  return field?.kind === 'child' ? field.options.placeholder : ''
}

/** Utility */
export function assertNever(arg: never): never {
  throw new Error('expected to never be called but received: ' + JSON.stringify(arg))
}