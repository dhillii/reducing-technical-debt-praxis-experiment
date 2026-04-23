import type { DocumentFeatures } from '../../views-shared'
import type { DocumentFeaturesForNormalization } from '../document-features-normalization'
import { type Mark, assert } from '../utils'
import type { ComponentSchema, ChildField } from './api-shared'
import { getKeysForArrayValue, setKeysForArrayValue } from './preview-props'

type PathToChildFieldWithOption = { path: ReadonlyPropPath; options: ChildField['options'] }

// Define a lookup table for schema kinds
const schemaKindHandlers = {
  form: () => [],
  relationship: () => [],
  child: (path, schema) => [{ path, options: schema.options }],
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
  // Use the lookup table to handle different schema kinds
  return schemaKindHandlers[schema.kind](value, schema, path)
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
const schemaAtPropPathHandlers = {
  child: () => undefined,
  form: () => undefined,
  relationship: () => undefined,
  conditional: (path, value, schema) => {
    const key = path.shift()
    if (key === 'discriminant')
      return schemaAtPropPathHandlers[schema.discriminant.kind](
        path,
        (value as any).discriminant,
        schema.discriminant
      )
    if (key === 'value') {
      const propVal = schema.values[(value as any).discriminant]
      return schemaAtPropPathHandlers[propVal.kind](path, (value as any).value, propVal)
    }
    return undefined
  },
  object: (path, value, schema) => {
    const key = path.shift()
    return schemaAtPropPathHandlers[schema.fields[key].kind](path, (value as any)[key], schema.fields[key])
  },
  array: (path, value, schema) => {
    const index = path.shift()
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
  // Use the lookup table to handle different schema kinds
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
const clientSideValidatePropHandlers = {
  child: () => true,
  relationship: () => true,
  form: (schema, value) => schema.validate(value),
  conditional: (schema, value) => {
    if (!('discriminant' in value) || !('value' in value)) return false
    if (!schema.discriminant.validate(value.discriminant)) return false
    return clientSideValidatePropHandlers[schema.values[value.discriminant].kind](
      schema.values[value.discriminant],
      value.value
    )
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
  // Use the lookup table to handle different schema kinds
  return clientSideValidatePropHandlers[schema.kind](schema, value)
}

// Define a lookup table for schema kinds
const getAncestorSchemasHandlers = {
  array: (currentProp, currentValue, currentPath) => {
    const key = currentPath.shift()!
    currentProp = currentProp.element
    currentValue = (currentValue as any)[key]
    return [currentProp, currentValue, currentPath]
  },
  conditional: (currentProp, currentValue, currentPath) => {
    const key = currentPath.shift()!
    if (key === 'discriminant') {
      currentProp = currentProp.discriminant
      currentValue = (currentValue as any).discriminant
    } else if (key === 'value') {
      currentProp = currentProp.values[(currentValue as any).discriminant]
      currentValue = (currentValue as any).value
    }
    return [currentProp, currentValue, currentPath]
  },
  object: (currentProp, currentValue, currentPath) => {
    const key = currentPath.shift()!
    currentValue = (currentValue as any)[key]
    currentProp = currentProp.fields[key]
    return [currentProp, currentValue, currentPath]
  },
  child: () => {
    throw new Error('unexpected prop')
  },
  form: () => {
    throw new Error('unexpected prop')
  },
  relationship: () => {
    throw new Error('unexpected prop')
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
    // Use the lookup table to handle different schema kinds
    [currentProp, currentValue, currentPath] = getAncestorSchemasHandlers[currentProp.kind](
      currentProp,
      currentValue,
      currentPath
    )
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

// Define a lookup table for schema kinds
const traversePropsHandlers = {
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
    traversePropsHandlers[schema.values[discriminant.toString()].kind](
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
  // Use the lookup table to handle different schema kinds
  traversePropsHandlers[schema.kind](schema, value, visitor, path)
}

// Define a lookup table for schema kinds
const replaceValueAtPropPathHandlers = {
  object: (schema, value, newValue, path) => {
    const [key, ...newPath] = path
    return {
      ...(value as any),
      [key]: replaceValueAtPropPath(schema.fields[key], (value as any)[key], newValue, newPath),
    }
  },
  conditional: (schema, value, newValue, path) => {
    const conditionalValue = value as { discriminant: string | boolean; value: unknown }
    // replaceValueAtPropPath should not be used to only update the discriminant of a conditional field
    // if you want to update the discriminant of a conditional field, replace the value of the whole conditional field
    assert(path[0] === 'value')
    return {
      discriminant: conditionalValue.discriminant,
      value: replaceValueAtPropPath(schema.values[path[0]], conditionalValue.value, newValue, path.slice(1)),
    }
  },
  array: (schema, value, newValue, path) => {
    const prevVal = value as unknown[]
    const newVal = [...prevVal]
    setKeysForArrayValue(newVal, getKeysForArrayValue(prevVal))
    newVal[path[0] as number] = replaceValueAtPropPath(
      schema.element,
      newVal[path[0] as number],
      newValue,
      path.slice(1)
    )
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

  // Use the lookup table to handle different schema kinds
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