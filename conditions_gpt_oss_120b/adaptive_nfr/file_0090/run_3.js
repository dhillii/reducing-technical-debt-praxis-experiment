import type { DocumentFeatures } from '../../views-shared'
import type { DocumentFeaturesForNormalization } from '../document-features-normalization'
import { type Mark, assert } from '../utils'
import type { ComponentSchema, ChildField } from './api-shared'
import { getKeysForArrayValue, setKeysForArrayValue } from './preview-props'

type PathToChildFieldWithOption = { path: ReadonlyPropPath; options: ChildField['options'] }

type SchemaHandler<T> = (value: any, schema: ComponentSchema, path: ReadonlyPropPath) => T

/** Dispatch map for findChildPropPathsForProp */
const findChildPropPathsHandlers: Record<ComponentSchema['kind'], SchemaHandler<PathToChildFieldWithOption[]>> = {
  form: () => [],
  relationship: () => [],
  child: (_, schema, path) => [{ path, options: (schema as any).options }],
  conditional: (value, schema, path) => {
    const cond = schema as any
    return findChildPropPathsForProp(value.value, cond.values[value.discriminant], path.concat('value'))
  },
  object: (value, schema, path) => {
    const obj = schema as any
    const paths: PathToChildFieldWithOption[] = []
    Object.keys(obj.fields).forEach(key => {
      paths.push(...findChildPropPathsForProp(value[key], obj.fields[key], path.concat(key)))
    })
    return paths
  },
  array: (value, schema, path) => {
    const arr = schema as any
    const paths: PathToChildFieldWithOption[] = []
    ;(value as any[]).forEach((val, i) => {
      paths.push(...findChildPropPathsForProp(val, arr.element, path.concat(i)))
    })
    return paths
  },
}

/** Recursively collect child field paths */
export function findChildPropPathsForProp(
  value: any,
  schema: ComponentSchema,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  return findChildPropPathsHandlers[schema.kind](value, schema, path)
}

/** Wrapper that ensures a fallback when no child fields are found */
export function findChildPropPaths(
  value: Record<string, any>,
  props: Record<string, ComponentSchema>
): { path: ReadonlyPropPath | undefined; options: ChildField['options'] }[] {
  const propPaths = findChildPropPathsForProp(value, { kind: 'object', fields: props }, [])
  if (propPaths.length) return propPaths
  return [{ path: undefined, options: { kind: 'inline', placeholder: '' } }]
}

/** Simple utility for exhaustive checks */
export function assertNever(arg: never): never {
  throw new Error('expected to never be called but received: ' + JSON.stringify(arg))
}

/** Document feature shape for child fields */
export type DocumentFeaturesForChildField =
  | {
      kind: 'inline'
      inlineMarks: 'inherit' | DocumentFeatures['formatting']['inlineMarks']
      documentFeatures: { links: boolean; relationships: boolean }
      softBreaks: boolean
    }
  | {
      kind: 'block'
      inlineMarks: 'inherit' | DocumentFeatures['formatting']['inlineMarks']
      softBreaks: boolean
      componentBlocks: boolean
      documentFeatures: DocumentFeaturesForNormalization
    }

/** Compute document features for a child field based on editor features and field options */
export function getDocumentFeaturesForChildField(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): DocumentFeaturesForChildField {
  const inlineMarksFromOptions = options.formatting?.inlineMarks

  const inlineMarks =
    inlineMarksFromOptions === 'inherit'
      ? 'inherit'
      : (Object.fromEntries(
          Object.keys(editorDocumentFeatures.formatting.inlineMarks).map(mark => [
            mark as Mark,
            !!(inlineMarksFromOptions || {})[mark as Mark],
          ])
        ) as Record<Mark, boolean>)

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

  const formatting = {
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
  }

  return {
    kind: 'block',
    inlineMarks,
    softBreaks: options.formatting?.softBreaks === 'inherit',
    documentFeatures: {
      layouts: [],
      dividers:
        options.dividers === 'inherit' ? editorDocumentFeatures.dividers : false,
      formatting,
      links: options.links === 'inherit',
      relationships: options.relationships === 'inherit',
    },
    componentBlocks: options.componentBlocks === 'inherit',
  }
}

/** Dispatch map for schema traversal helpers */
type SchemaVisitor<T> = (value: unknown, schema: ComponentSchema, path: (string | number)[]) => T

const schemaVisitorMap: Record<ComponentSchema['kind'], SchemaVisitor<any>> = {
  child: () => undefined,
  form: () => undefined,
  relationship: () => undefined,
  conditional: (value, schema, path) => {
    const key = path.shift()
    if (key === 'discriminant')
      return getSchemaAtPropPathInner(path, (value as any).discriminant, (schema as any).discriminant)
    if (key === 'value') {
      const cond = schema as any
      const propVal = cond.values[(value as any).discriminant]
      return getSchemaAtPropPathInner(path, (value as any).value, propVal)
    }
    return undefined
  },
  object: (value, schema, path) => {
    const key = path.shift()!
    return getSchemaAtPropPathInner(path, (value as any)[key], (schema as any).fields[key])
  },
  array: (value, schema, path) => {
    const index = path.shift()!
    return getSchemaAtPropPathInner(path, (value as any)[index], (schema as any).element)
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
  return schemaVisitorMap[schema.kind](value, schema, path)
}

/** Public wrapper for schema lookup */
export function getSchemaAtPropPath(
  path: ReadonlyPropPath,
  value: Record<string, unknown>,
  props: Record<string, ComponentSchema>
): undefined | ComponentSchema {
  return getSchemaAtPropPathInner([...path], value, { kind: 'object', fields: props })
}

/** Validate a prop value client‑side based on its schema */
export function clientSideValidateProp(schema: ComponentSchema, value: unknown): boolean {
  if (schema.kind === 'child' || schema.kind === 'relationship') return true
  if (schema.kind === 'form') return schema.validate(value)
  if (typeof value !== 'object' || value === null) return false

  switch (schema.kind) {
    case 'conditional': {
      const cond = schema as any
      if (!('discriminant' in value) || !('value' in value)) return false
      if (!cond.discriminant.validate((value as any).discriminant)) return false
      return clientSideValidateProp(
        cond.values[(value as any).discriminant as string],
        (value as any).value
      )
    }
    case 'object': {
      const obj = schema as any
      for (const [key, child] of Object.entries(obj.fields)) {
        if (!clientSideValidateProp(child, (value as any)[key])) return false
      }
      return true
    }
    case 'array': {
      const arr = schema as any
      if (!Array.isArray(value)) return false
      for (const inner of value as unknown[]) {
        if (!clientSideValidateProp(arr.element, inner)) return false
      }
      return true
    }
  }
  return assertNever(schema)
}

/** Gather ancestor schemas along a prop path */
export function getAncestorSchemas(
  rootSchema: ComponentSchema,
  path: ReadonlyPropPath,
  value: unknown
): ComponentSchema[] {
  const ancestors: ComponentSchema[] = []
  const remainingPath = [...path]
  let currentSchema = rootSchema
  let currentValue = value

  while (remainingPath.length) {
    ancestors.push(currentSchema)
    const key = remainingPath.shift()!

    if (currentSchema.kind === 'array') {
      currentSchema = currentSchema.element
      currentValue = (currentValue as any)[key]
    } else if (currentSchema.kind === 'conditional') {
      currentSchema = currentSchema.values[(value as any).discriminant]
      currentValue = (currentValue as any).value
    } else if (currentSchema.kind === 'object') {
      currentValue = (currentValue as any)[key]
      currentSchema = currentSchema.fields[key]
    } else {
      if (['child', 'form', 'relationship'].includes(currentSchema.kind)) {
        throw new Error(`unexpected prop "${key}"`)
      }
      assertNever(currentSchema)
    }
  }
  return ancestors
}

/** Immutable path type */
export type ReadonlyPropPath = readonly (string | number)[]

/** Retrieve a nested value by path */
export function getValueAtPropPath(value: unknown, inputPath: ReadonlyPropPath) {
  const path = [...inputPath]
  while (path.length) {
    const key = path.shift()!
    value = (value as any)[key]
  }
  return value
}

/** Visitor pattern for traversing component schemas */
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
    const obj = schema as any
    for (const [key, child] of Object.entries(obj.fields)) {
      traverseProps(child, (value as any)[key], visitor, [...path, key])
    }
    visitor(schema, value, path)
    return
  }

  if (schema.kind === 'array') {
    const arr = schema as any
    for (const [idx, val] of (value as unknown[]).entries()) {
      traverseProps(arr.element, val, visitor, path.concat(idx))
    }
    visitor(schema, value, path)
    return
  }

  if (schema.kind === 'conditional') {
    const cond = schema as any
    const discriminant: string | boolean = (value as any).discriminant
    visitor(schema, discriminant, path.concat('discriminant'))
    traverseProps(
      cond.values[discriminant.toString()],
      (value as any).value,
      visitor,
      path.concat('value')
    )
    visitor(schema, value, path)
    return
  }

  assertNever(schema)
}

/** Replace a nested value at a given prop path */
export function replaceValueAtPropPath(
  schema: ComponentSchema,
  value: unknown,
  newValue: unknown,
  path: ReadonlyPropPath
): unknown {
  if (path.length === 0) return newValue

  const [key, ...rest] = path

  if (schema.kind === 'object') {
    const obj = schema as any
    return {
      ...(value as any),
      [key]: replaceValueAtPropPath(obj.fields[key], (value as any)[key], newValue, rest),
    }
  }

  if (schema.kind === 'conditional') {
    const condValue = value as { discriminant: string | boolean; value: unknown }
    assert(key === 'value')
    const cond = schema as any
    return {
      discriminant: condValue.discriminant,
      value: replaceValueAtPropPath(cond.values[key], condValue.value, newValue, rest),
    }
  }

  if (schema.kind === 'array') {
    const prev = value as unknown[]
    const copy = [...prev]
    setKeysForArrayValue(copy, getKeysForArrayValue(prev))
    copy[key as number] = replaceValueAtPropPath(schema.element, copy[key as number], newValue, rest)
    return copy
  }

  assert(schema.kind !== 'form' && schema.kind !== 'relationship' && schema.kind !== 'child')
  return assertNever(schema)
}

/** Resolve placeholder text for a given prop path */
export function getPlaceholderTextForPropPath(
  propPath: ReadonlyPropPath,
  fields: Record<string, ComponentSchema>,
  formProps: Record<string, any>
): string {
  const field = getSchemaAtPropPath(propPath, formProps, fields)
  return field?.kind === 'child' ? field.options.placeholder : ''
}