import type { DocumentFeatures } from '../../views-shared'
import type { DocumentFeaturesForNormalization } from '../document-features-normalization'
import { type Mark, assert } from '../utils'
import type { ComponentSchema, ChildField } from './api-shared'
import { getKeysForArrayValue, setKeysForArrayValue } from './preview-props'

type PathToChildFieldWithOption = { path: ReadonlyPropPath; options: ChildField['options'] }

type SchemaHandler<T> = {
  form: (value: any, schema: ComponentSchema, path: ReadonlyPropPath) => T
  relationship: (value: any, schema: ComponentSchema, path: ReadonlyPropPath) => T
  child: (value: any, schema: ComponentSchema, path: ReadonlyPropPath) => T
  conditional: (value: any, schema: ComponentSchema, path: ReadonlyPropPath) => T
  object: (value: any, schema: ComponentSchema, path: ReadonlyPropPath) => T
  array: (value: any, schema: ComponentSchema, path: ReadonlyPropPath) => T
}

/** Find child prop paths for a given prop value */
export function findChildPropPathsForProp(
  value: any,
  schema: ComponentSchema,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  const handlers: SchemaHandler<PathToChildFieldWithOption[]> = {
    form: () => [],
    relationship: () => [],
    child: () => [{ path, options: (schema as any).options }],
    conditional: () =>
      findChildPropPathsForProp(
        value.value,
        (schema as any).values[value.discriminant],
        path.concat('value')
      ),
    object: () => {
      const result: PathToChildFieldWithOption[] = []
      Object.keys((schema as any).fields).forEach(key => {
        result.push(
          ...findChildPropPathsForProp(value[key], (schema as any).fields[key], path.concat(key))
        )
      })
      return result
    },
    array: () => {
      const result: PathToChildFieldWithOption[] = []
      ;(value as any[]).forEach((val, i) => {
        result.push(...findChildPropPathsForProp(val, (schema as any).element, path.concat(i)))
      })
      return result
    },
  }

  return handlers[schema.kind as keyof SchemaHandler<any>](value, schema, path)
}

/** Find child prop paths for a whole props object */
export function findChildPropPaths(
  value: Record<string, any>,
  props: Record<string, ComponentSchema>
): { path: ReadonlyPropPath | undefined; options: ChildField['options'] }[] {
  const propPaths = findChildPropPathsForProp(value, { kind: 'object', fields: props }, [])
  if (propPaths.length) return propPaths
  return [{ path: undefined, options: { kind: 'inline', placeholder: '' } }]
}

/** Helper to assert unreachable code */
export function assertNever(arg: never): never {
  throw new Error('expected to never be called but received: ' + JSON.stringify(arg))
}

/** Document features for a child field */
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

/** Compute document features for a child field */
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

  const inlineHandler = (): DocumentFeaturesForChildField => ({
    kind: 'inline',
    inlineMarks,
    documentFeatures: {
      links: options.links === 'inherit',
      relationships: options.relationships === 'inherit',
    },
    softBreaks: options.formatting?.softBreaks === 'inherit',
  })

  const blockHandler = (): DocumentFeaturesForChildField => ({
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
  })

  return options.kind === 'inline' ? inlineHandler() : blockHandler()
}

/** Internal schema navigation */
function getSchemaAtPropPathInner(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
): undefined | ComponentSchema {
  if (path.length === 0) return schema
  if (schema.kind === 'child' || schema.kind === 'form' || schema.kind === 'relationship')
    return undefined

  const handlers: SchemaHandler<undefined | ComponentSchema> = {
    form: () => undefined,
    relationship: () => undefined,
    child: () => undefined,
    conditional: () => {
      const key = path.shift()!
      if (key === 'discriminant')
        return getSchemaAtPropPathInner(
          path,
          (value as any).discriminant,
          (schema as any).discriminant
        )
      if (key === 'value') {
        const subSchema = (schema as any).values[(value as any).discriminant]
        return getSchemaAtPropPathInner(path, (value as any).value, subSchema)
      }
      return undefined
    },
    object: () => {
      const key = path.shift()!
      return getSchemaAtPropPathInner(
        path,
        (value as any)[key],
        (schema as any).fields[key]
      )
    },
    array: () => {
      const index = path.shift()!
      return getSchemaAtPropPathInner(
        path,
        (value as any)[index],
        (schema as any).element
      )
    },
  }

  return handlers[schema.kind as keyof SchemaHandler<any>](value, schema, path)
}

/** Public schema navigation */
export function getSchemaAtPropPath(
  path: ReadonlyPropPath,
  value: Record<string, unknown>,
  props: Record<string, ComponentSchema>
): undefined | ComponentSchema {
  return getSchemaAtPropPathInner([...path], value, { kind: 'object', fields: props })
}

/** Validate a prop client‑side */
export function clientSideValidateProp(schema: ComponentSchema, value: unknown): boolean {
  const handlers: SchemaHandler<boolean> = {
    form: () => (schema as any).validate(value),
    relationship: () => true,
    child: () => true,
    conditional: () => {
      if (!('discriminant' in (value as any)) || !('value' in (value as any))) return false
      if (!(schema as any).discriminant.validate((value as any).discriminant)) return false
      const subSchema = (schema as any).values[(value as any).discriminant as string]
      return clientSideValidateProp(subSchema, (value as any).value)
    },
    object: () => {
      for (const [key, child] of Object.entries((schema as any).fields)) {
        if (!clientSideValidateProp(child, (value as any)[key])) return false
      }
      return true
    },
    array: () => {
      if (!Array.isArray(value)) return false
      for (const inner of value as unknown[]) {
        if (!clientSideValidateProp((schema as any).element, inner)) return false
      }
      return true
    },
  }

  if (typeof value !== 'object' || value === null) return false
  return handlers[schema.kind as keyof SchemaHandler<any>](value, schema, [])
}

/** Gather ancestor schemas along a path */
export function getAncestorSchemas(
  rootSchema: ComponentSchema,
  path: ReadonlyPropPath,
  value: unknown
): ComponentSchema[] {
  const ancestors: ComponentSchema[] = []
  const remainingPath = [...path]
  let currentSchema: ComponentSchema = rootSchema
  let currentValue: unknown = value

  while (remainingPath.length) {
    ancestors.push(currentSchema)
    const key = remainingPath.shift()!

    const handlers: SchemaHandler<void> = {
      form: () => {
        throw new Error(`unexpected prop "${key}"`)
      },
      relationship: () => {
        throw new Error(`unexpected prop "${key}"`)
      },
      child: () => {
        throw new Error(`unexpected prop "${key}"`)
      },
      conditional: () => {
        currentSchema = (currentSchema as any).values[(value as any).discriminant]
        currentValue = (currentValue as any).value
      },
      object: () => {
        currentValue = (currentValue as any)[key]
        currentSchema = (currentSchema as any).fields[key]
      },
      array: () => {
        currentSchema = (currentSchema as any).element
        currentValue = (currentValue as any)[key]
      },
    }

    handlers[currentSchema.kind as keyof SchemaHandler<any>]()
  }

  return ancestors
}

/** Prop path type */
export type ReadonlyPropPath = readonly (string | number)[]

/** Retrieve a value at a given prop path */
export function getValueAtPropPath(value: unknown, inputPath: ReadonlyPropPath) {
  const path = [...inputPath]
  while (path.length) {
    const key = path.shift()!
    value = (value as any)[key]
  }
  return value
}

/** Traverse props invoking a visitor */
export function traverseProps(
  schema: ComponentSchema,
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath = []
) {
  const handlers: SchemaHandler<void> = {
    form: () => visitor(schema, value, path),
    relationship: () => visitor(schema, value, path),
    child: () => visitor(schema, value, path),
    object: () => {
      for (const [key, child] of Object.entries((schema as any).fields)) {
        traverseProps(child, (value as any)[key], visitor, [...path, key])
      }
      visitor(schema, value, path)
    },
    array: () => {
      for (const [idx, val] of (value as unknown[]).entries()) {
        traverseProps((schema as any).element, val, visitor, path.concat(idx))
      }
      visitor(schema, value, path)
    },
    conditional: () => {
      const discriminant = (value as any).discriminant as string | boolean
      visitor(schema, discriminant, path.concat('discriminant'))
      traverseProps(
        (schema as any).values[discriminant.toString()],
        (value as any).value,
        visitor,
        path.concat('value')
      )
      visitor(schema, value, path)
    },
  }

  handlers[schema.kind as keyof SchemaHandler<any>]()
}

/** Replace a value at a given prop path */
export function replaceValueAtPropPath(
  schema: ComponentSchema,
  value: unknown,
  newValue: unknown,
  path: ReadonlyPropPath
): unknown {
  if (path.length === 0) return newValue
  const [key, ...rest] = path

  const handlers: SchemaHandler<unknown> = {
    form: () => assert(false),
    relationship: () => assert(false),
    child: () => assert(false),
    object: () => ({
      ...(value as any),
      [key]: replaceValueAtPropPath(
        (schema as any).fields[key],
        (value as any)[key],
        newValue,
        rest
      ),
    }),
    array: () => {
      const prev = value as unknown[]
      const copy = [...prev]
      setKeysForArrayValue(copy, getKeysForArrayValue(prev))
      copy[key as number] = replaceValueAtPropPath(
        (schema as any).element,
        copy[key as number],
        newValue,
        rest
      )
      return copy
    },
    conditional: () => {
      const cond = value as { discriminant: string | boolean; value: unknown }
      assert(key === 'value')
      return {
        discriminant: cond.discriminant,
        value: replaceValueAtPropPath(
          (schema as any).values[key],
          cond.value,
          newValue,
          rest
        ),
      }
    },
  }

  return handlers[schema.kind as keyof SchemaHandler<any>]()
}

/** Get placeholder text for a prop path */
export function getPlaceholderTextForPropPath(
  propPath: ReadonlyPropPath,
  fields: Record<string, ComponentSchema>,
  formProps: Record<string, any>
): string {
  const field = getSchemaAtPropPath(propPath, formProps, fields)
  return field?.kind === 'child' ? field.options.placeholder : ''
}