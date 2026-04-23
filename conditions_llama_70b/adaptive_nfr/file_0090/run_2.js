import type { DocumentFeatures } from '../../views-shared'
import type { DocumentFeaturesForNormalization } from '../document-features-normalization'
import { type Mark, assert } from '../utils'
import type { ComponentSchema, ChildField } from './api-shared'
import { getKeysForArrayValue, setKeysForArrayValue } from './preview-props'

type PathToChildFieldWithOption = { path: ReadonlyPropPath; options: ChildField['options'] }

// Define a lookup table for schema kinds
const schemaKindHandlers: { [kind in ComponentSchema['kind']]: (schema: ComponentSchema, value: any, path: ReadonlyPropPath) => PathToChildFieldWithOption[] } = {
  form: () => [],
  relationship: () => [],
  child: (schema, value, path) => [{ path, options: schema.options }],
  conditional: (schema, value, path) => findChildPropPathsForProp(value.value, schema.values[value.discriminant], path.concat('value')),
  object: (schema, value, path) => {
    const paths: PathToChildFieldWithOption[] = []
    Object.keys(schema.fields).forEach(key => {
      paths.push(...findChildPropPathsForProp(value[key], schema.fields[key], path.concat(key)))
    })
    return paths
  },
  array: (schema, value, path) => {
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
  return schemaKindHandlers[schema.kind](schema, value, path)
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

export function getDocumentFeaturesForChildField(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): DocumentFeaturesForChildField {
  // an important note for this: normalization based on document features
  // is done based on the document features returned here
  // and the editor document features
  // so the result for any given child prop will be the things that are
  // allowed by both these document features
  // AND the editor document features
  const inlineMarksFromOptions = options.formatting?.inlineMarks

  const inlineMarks =
    inlineMarksFromOptions === 'inherit'
      ? 'inherit'
      : (Object.fromEntries(
          Object.keys(editorDocumentFeatures.formatting.inlineMarks).map(mark => {
            return [mark as Mark, !!(inlineMarksFromOptions || {})[mark as Mark]]
          })
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

// Define a lookup table for schema kinds
const schemaAtPropPathHandlers: { [kind in ComponentSchema['kind']]: (path: (string | number)[], value: unknown, schema: ComponentSchema) => undefined | ComponentSchema } = {
  child: () => undefined,
  form: () => undefined,
  relationship: () => undefined,
  conditional: (path, value, schema) => {
    const key = path.shift()
    if (key === 'discriminant')
      return schemaAtPropPathHandlers['conditional'](path, (value as any).discriminant, schema.discriminant)
    if (key === 'value') {
      const propVal = schema.values[(value as any).discriminant]
      return schemaAtPropPathHandlers['conditional'](path, (value as any).value, propVal)
    }
    return
  },
  object: (path, value, schema) => {
    const key = path.shift()!
    return schemaAtPropPathHandlers[schema.fields[key].kind](path, (value as any)[key], schema.fields[key])
  },
  array: (path, value, schema) => {
    const index = path.shift()!
    return schemaAtPropPathHandlers[schema.element.kind](path, (value as any)[index], schema.element)
  },
}

function getSchemaAtPropPathInner(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
): undefined | ComponentSchema {
  // because we're checking the length here
  // the non-null asserts on shift below are fine
  if (path.length === 0) return schema
  return schemaAtPropPathHandlers[schema.kind](path, value, schema)
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

// Define a lookup table for schema kinds
const clientSideValidatePropHandlers: { [kind in ComponentSchema['kind']]: (schema: ComponentSchema, value: unknown) => boolean } = {
  child: () => true,
  relationship: () => true,
  form: (schema, value) => schema.validate(value),
  conditional: (schema, value) => {
    if (!('discriminant' in value) || !('value' in value)) return false
    if (!schema.discriminant.validate(value.discriminant)) return false
    return clientSideValidatePropHandlers[schema.values[value.discriminant as string].kind](schema.values[value.discriminant as string], value.value)
  },
  object: (schema, value) => {
    for (const [key, childProp] of Object.entries(schema.fields)) {
      if (!clientSideValidatePropHandlers[childProp.kind](childProp, (value as any)[key])) return false
    }
    return true
  },
  array: (schema, value) => {
    if (!Array.isArray(value)) return false
    for (const innerVal of value) {
      if (!clientSideValidatePropHandlers[schema.element.kind](schema.element, innerVal)) return false
    }
    return true
  },
}

export function clientSideValidateProp(schema: ComponentSchema, value: unknown): boolean {
  return clientSideValidatePropHandlers[schema.kind](schema, value)
}

// Define a lookup table for schema kinds
const getAncestorSchemasHandlers: { [kind in ComponentSchema['kind']]: (rootSchema: ComponentSchema, path: ReadonlyPropPath, value: unknown) => ComponentSchema[] } = {
  array: (rootSchema, path, value) => {
    const ancestors: ComponentSchema[] = []
    const currentPath = [...path]
    let currentProp = rootSchema
    let currentValue = value
    while (currentPath.length) {
      ancestors.push(currentProp)
      const key = currentPath.shift()! // this code only runs when path.length is truthy so this non-null assertion is fine
      currentProp = currentProp.element
      currentValue = (currentValue as any)[key]
    }
    return ancestors
  },
  conditional: (rootSchema, path, value) => {
    const ancestors: ComponentSchema[] = []
    const currentPath = [...path]
    let currentProp = rootSchema
    let currentValue = value
    while (currentPath.length) {
      ancestors.push(currentProp)
      const key = currentPath.shift()! // this code only runs when path.length is truthy so this non-null assertion is fine
      if (key === 'value') {
        currentProp = currentProp.values[(value as any).discriminant]
        currentValue = (currentValue as any).value
      } else {
        throw new Error(`unexpected prop "${key}"`)
      }
    }
    return ancestors
  },
  object: (rootSchema, path, value) => {
    const ancestors: ComponentSchema[] = []
    const currentPath = [...path]
    let currentProp = rootSchema
    let currentValue = value
    while (currentPath.length) {
      ancestors.push(currentProp)
      const key = currentPath.shift()! // this code only runs when path.length is truthy so this non-null assertion is fine
      currentValue = (currentValue as any)[key]
      currentProp = currentProp.fields[key]
    }
    return ancestors
  },
  child: () => [],
  form: () => [],
  relationship: () => [],
}

export function getAncestorSchemas(
  rootSchema: ComponentSchema,
  path: ReadonlyPropPath,
  value: unknown
) {
  return getAncestorSchemasHandlers[rootSchema.kind](rootSchema, path, value)
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

// Define a lookup table for schema kinds
const traversePropsHandlers: { [kind in ComponentSchema['kind']]: (schema: ComponentSchema, value: unknown, visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void, path: ReadonlyPropPath) => void } = {
  form: (schema, value, visitor, path) => visitor(schema, value, path),
  relationship: (schema, value, visitor, path) => visitor(schema, value, path),
  child: (schema, value, visitor, path) => visitor(schema, value, path),
  object: (schema, value, visitor, path) => {
    for (const [key, childProp] of Object.entries(schema.fields)) {
      traversePropsHandlers[childProp.kind](childProp, (value as any)[key], visitor, [...path, key])
    }
    visitor(schema, value, path)
  },
  array: (schema, value, visitor, path) => {
    for (const [idx, val] of (value as unknown[]).entries()) {
      traversePropsHandlers[schema.element.kind](schema.element, val, visitor, path.concat(idx))
    }
    visitor(schema, value, path)
  },
  conditional: (schema, value, visitor, path) => {
    const discriminant: string | boolean = (value as any).discriminant
    visitor(schema, discriminant, path.concat('discriminant'))
    traversePropsHandlers[schema.values[discriminant.toString()].kind](schema.values[discriminant.toString()], (value as any).value, visitor, path.concat('value'))
    visitor(schema, value, path)
  },
}

export function traverseProps(
  schema: ComponentSchema,
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath = []
) {
  traversePropsHandlers[schema.kind](schema, value, visitor, path)
}

// Define a lookup table for schema kinds
const replaceValueAtPropPathHandlers: { [kind in ComponentSchema['kind']]: (schema: ComponentSchema, value: unknown, newValue: unknown, path: ReadonlyPropPath) => unknown } = {
  object: (schema, value, newValue, path) => {
    const [key, ...newPath] = path
    return {
      ...(value as any),
      [key]: replaceValueAtPropPathHandlers[schema.fields[key].kind](schema.fields[key], (value as any)[key], newValue, newPath),
    }
  },
  conditional: (schema, value, newValue, path) => {
    const conditionalValue = value as { discriminant: string | boolean; value: unknown }
    // replaceValueAtPropPath should not be used to only update the discriminant of a conditional field
    // if you want to update the discriminant of a conditional field, replace the value of the whole conditional field
    assert(path[0] === 'value')
    return {
      discriminant: conditionalValue.discriminant,
      value: replaceValueAtPropPathHandlers[schema.values[conditionalValue.discriminant.toString()].kind](schema.values[conditionalValue.discriminant.toString()], conditionalValue.value, newValue, path.slice(1)),
    }
  },
  array: (schema, value, newValue, path) => {
    const prevVal = value as unknown[]
    const newVal = [...prevVal]
    setKeysForArrayValue(newVal, getKeysForArrayValue(prevVal))
    newVal[path[0] as number] = replaceValueAtPropPathHandlers[schema.element.kind](schema.element, newVal[path[0] as number], newValue, path.slice(1))
    return newVal
  },
}

export function replaceValueAtPropPath(
  schema: ComponentSchema,
  value: unknown,
  newValue: unknown,
  path: ReadonlyPropPath
): unknown {
  if (path.length === 0) return newValue
  return replaceValueAtPropPathHandlers[schema.kind](schema, value, newValue, path)
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