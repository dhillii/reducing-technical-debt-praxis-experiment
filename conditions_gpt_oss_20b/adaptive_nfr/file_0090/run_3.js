import type { DocumentFeatures } from '../../views-shared'
import type { DocumentFeaturesForNormalization } from '../document-features-normalization'
import { type Mark, assert } from '../utils'
import type { ComponentSchema, ChildField } from './api-shared'
import { getKeysForArrayValue, setKeysForArrayValue } from './preview-props'

type PathToChildFieldWithOption = { path: ReadonlyPropPath; options: ChildField['options'] }

/**
 * Find all child property paths for a given value and schema.
 * Uses a strategy map to dispatch based on schema kind.
 */
export function findChildPropPathsForProp(
  value: any,
  schema: ComponentSchema,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  const handlers: Record<
    ComponentSchema['kind'],
    (value: any, schema: ComponentSchema, path: ReadonlyPropPath) => PathToChildFieldWithOption[]
  > = {
    form: () => [],
    relationship: () => [],
    child: (_v, _s, p) => [{ path: p, options: _s.options }],
    conditional: (v, s, p) => {
      const childSchema = s.values[v.discriminant]
      return findChildPropPathsForProp(v.value, childSchema, p.concat('value'))
    },
    object: (v, s, p) => {
      const paths: PathToChildFieldWithOption[] = []
      for (const key in s.fields) {
        paths.push(...findChildPropPathsForProp(v[key], s.fields[key], p.concat(key)))
      }
      return paths
    },
    array: (v, s, p) => {
      const paths: PathToChildFieldWithOption[] = []
      (v as any[]).forEach((val, i) => {
        paths.push(...findChildPropPathsForProp(val, s.element, p.concat(i)))
      })
      return paths
    },
  }
  return handlers[schema.kind](value, schema, path)
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

/**
 * Compute inline marks based on options and editor features.
 */
function computeInlineMarks(
  options: ChildField['options'],
  editorDocumentFeatures: DocumentFeatures
): 'inherit' | Record<Mark, boolean> {
  const inlineMarksFromOptions = options.formatting?.inlineMarks
  if (inlineMarksFromOptions === 'inherit') return 'inherit'
  return Object.fromEntries(
    Object.keys(editorDocumentFeatures.formatting.inlineMarks).map(mark => {
      return [mark as Mark, !!(inlineMarksFromOptions || {})[mark as Mark]]
    })
  ) as Record<Mark, boolean>
}

/**
 * Get document features for a child field.
 * Uses a strategy map for kind dispatch.
 */
export function getDocumentFeaturesForChildField(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): DocumentFeaturesForChildField {
  const inlineMarks = computeInlineMarks(options, editorDocumentFeatures)

  const handlers: Record<
    ChildField['options']['kind'],
    (opts: ChildField['options']) => DocumentFeaturesForChildField
  > = {
    inline: opts => ({
      kind: 'inline',
      inlineMarks,
      documentFeatures: {
        links: opts.links === 'inherit',
        relationships: opts.relationships === 'inherit',
      },
      softBreaks: opts.formatting?.softBreaks === 'inherit',
    }),
    block: opts => ({
      kind: 'block',
      inlineMarks,
      softBreaks: opts.formatting?.softBreaks === 'inherit',
      componentBlocks: opts.componentBlocks === 'inherit',
      documentFeatures: {
        layouts: [],
        dividers: opts.dividers === 'inherit' ? editorDocumentFeatures.dividers : false,
        formatting: {
          alignment:
            opts.formatting?.alignment === 'inherit'
              ? editorDocumentFeatures.formatting.alignment
              : { center: false, end: false },
          blockTypes:
            opts.formatting?.blockTypes === 'inherit'
              ? editorDocumentFeatures.formatting.blockTypes
              : { blockquote: false, code: false },
          headingLevels:
            opts.formatting?.headingLevels === 'inherit'
              ? editorDocumentFeatures.formatting.headingLevels
              : opts.formatting?.headingLevels || [],
          listTypes:
            opts.formatting?.listTypes === 'inherit'
              ? editorDocumentFeatures.formatting.listTypes
              : { ordered: false, unordered: false },
        },
        links: opts.links === 'inherit',
        relationships: opts.relationships === 'inherit',
      },
    }),
  }

  return handlers[options.kind](options)
}

function getSchemaAtPropPathInner(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
): undefined | ComponentSchema {
  if (path.length === 0) return schema
  if (schema.kind === 'child' || schema.kind === 'form' || schema.kind === 'relationship') return

  const handlers: Record<
    ComponentSchema['kind'],
    (path: (string | number)[], value: unknown, schema: ComponentSchema) => undefined | ComponentSchema
  > = {
    conditional: (p, v, s) => {
      const key = p.shift()
      if (key === 'discriminant')
        return getSchemaAtPropPathInner(p, (v as any).discriminant, s.discriminant)
      if (key === 'value') {
        const propVal = s.values[(v as any).discriminant]
        return getSchemaAtPropPathInner(p, (v as any).value, propVal)
      }
      return
    },
    object: (p, v, s) => {
      const key = p.shift()!
      return getSchemaAtPropPathInner(p, (v as any)[key], s.fields[key])
    },
    array: (p, v, s) => {
      const index = p.shift()!
      return getSchemaAtPropPathInner(p, (v as any)[index], s.element)
    },
  }

  const handler = handlers[schema.kind]
  if (!handler) return
  return handler(path, value, schema)
}

export function getSchemaAtPropPath(
  path: ReadonlyPropPath,
  value: Record<string, unknown>,
  props: Record<string, ComponentSchema>
): undefined | ComponentSchema {
  return getSchemaAtPropPathInner([...path], value, { kind: 'object', fields: props })
}

function clientSideValidatePropInner(
  schema: ComponentSchema,
  value: unknown
): boolean {
  const handlers: Record<
    ComponentSchema['kind'],
    (schema: ComponentSchema, value: unknown) => boolean
  > = {
    child: () => true,
    relationship: () => true,
    form: (s, v) => s.validate(v),
    conditional: (s, v) => {
      if (!('discriminant' in v) || !('value' in v)) return false
      if (!s.discriminant.validate(v.discriminant)) return false
      const childSchema = s.values[v.discriminant as string]
      return clientSideValidatePropInner(childSchema, v.value)
    },
    object: (s, v) => {
      for (const [key, childProp] of Object.entries(s.fields)) {
        if (!clientSideValidatePropInner(childProp, (v as any)[key])) return false
      }
      return true
    },
    array: (s, v) => {
      if (!Array.isArray(v)) return false
      for (const innerVal of v) {
        if (!clientSideValidatePropInner(s.element, innerVal)) return false
      }
      return true
    },
  }

  const handler = handlers[schema.kind]
  if (!handler) return false
  return handler(schema, value)
}

export function clientSideValidateProp(schema: ComponentSchema, value: unknown): boolean {
  return clientSideValidatePropInner(schema, value)
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

export function getValueAtPropPath(value: unknown, inputPath: ReadonlyPropPath) {
  const path = [...inputPath]
  while (path.length) {
    const key = path.shift()!
    value = (value as any)[key]
  }
  return value
}

function traversePropsInner(
  schema: ComponentSchema,
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath
) {
  const handlers: Record<
    ComponentSchema['kind'],
    (s: ComponentSchema, v: unknown, p: ReadonlyPropPath) => void
  > = {
    form: (s, v, p) => {
      visitor(s, v, p)
    },
    relationship: (s, v, p) => {
      visitor(s, v, p)
    },
    child: (s, v, p) => {
      visitor(s, v, p)
    },
    object: (s, v, p) => {
      for (const [key, childProp] of Object.entries(s.fields)) {
        traversePropsInner(childProp, (v as any)[key], visitor, [...p, key])
      }
      visitor(s, v, p)
    },
    array: (s, v, p) => {
      for (const [idx, val] of (v as unknown[]).entries()) {
        traversePropsInner(s.element, val, visitor, p.concat(idx))
      }
      visitor(s, v, p)
    },
    conditional: (s, v, p) => {
      const discriminant: string | boolean = (v as any).discriminant
      visitor(s, discriminant, p.concat('discriminant'))
      traversePropsInner(
        s.values[discriminant.toString()],
        (v as any).value,
        visitor,
        p.concat('value')
      )
      visitor(s, v, p)
    },
  }

  const handler = handlers[schema.kind]
  if (!handler) return
  handler(schema, value, path)
}

export function traverseProps(
  schema: ComponentSchema,
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath = []
) {
  traversePropsInner(schema, value, visitor, path)
}

export function replaceValueAtPropPath(
  schema: ComponentSchema,
  value: unknown,
  newValue: unknown,
  path: ReadonlyPropPath
): unknown {
  if (path.length === 0) return newValue

  const [key, ...newPath] = path

  const handlers: Record<
    ComponentSchema['kind'],
    (s: ComponentSchema, v: unknown, k: string | number, np: ReadonlyPropPath) => unknown
  > = {
    object: (s, v, k, np) => {
      return {
        ...(v as any),
        [k]: replaceValueAtPropPath(s.fields[k as string], (v as any)[k], newValue, np),
      }
    },
    conditional: (s, v, k, np) => {
      const conditionalValue = v as { discriminant: string | boolean; value: unknown }
      assert(k === 'value')
      return {
        discriminant: conditionalValue.discriminant,
        value: replaceValueAtPropPath(s.values[k as string], conditionalValue.value, newValue, np),
      }
    },
    array: (s, v, k, np) => {
      const prevVal = v as unknown[]
      const newVal = [...prevVal]
      setKeysForArrayValue(newVal, getKeysForArrayValue(prevVal))
      newVal[k as number] = replaceValueAtPropPath(
        s.element,
        newVal[k as number],
        newValue,
        np
      )
      return newVal
    },
  }

  const handler = handlers[schema.kind]
  if (!handler) {
    assert(schema.kind !== 'form' && schema.kind !== 'relationship' && schema.kind !== 'child')
    assertNever(schema)
  }
  return handler(schema, value, key, newPath)
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