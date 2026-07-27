import type { DocumentFeatures } from '../../views-shared'
import type { DocumentFeaturesForNormalization } from '../document-features-normalization'
import { type Mark, assert } from '../utils'
import type { ComponentSchema, ChildField } from './api-shared'
import { getKeysForArrayValue, setKeysForArrayValue } from './preview-props'

type PathToChildFieldWithOption = { path: ReadonlyPropPath; options: ChildField['options'] }

/**
 * Finds child prop paths for a given value and schema.
 * @param value The value to find child prop paths for.
 * @param schema The schema to find child prop paths in.
 * @param path The current path.
 * @returns An array of child prop paths.
 */
function findChildPropPathsForPropInner(
  value: any,
  schema: ComponentSchema,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  switch (schema.kind) {
    case 'form':
    case 'relationship':
      return []
    case 'child':
      return [{ path: path, options: schema.options }]
    case 'conditional':
      return findChildPropPathsForPropInner(
        value.value,
        schema.values[value.discriminant],
        path.concat('value')
      )
    case 'object': {
      const paths: PathToChildFieldWithOption[] = []
      Object.keys(schema.fields).forEach(key => {
        paths.push(...findChildPropPathsForPropInner(value[key], schema.fields[key], path.concat(key)))
      })
      return paths
    }
    case 'array': {
      const paths: PathToChildFieldWithOption[] = []
      ;(value as any[]).forEach((val, i) => {
        paths.push(...findChildPropPathsForPropInner(val, schema.element, path.concat(i)))
      })
      return paths
    }
    default:
      assertNever(schema)
      return []
  }
}

/**
 * Finds child prop paths for a given value and schema.
 * @param value The value to find child prop paths for.
 * @param schema The schema to find child prop paths in.
 * @param path The current path.
 * @returns An array of child prop paths.
 */
export function findChildPropPathsForProp(
  value: any,
  schema: ComponentSchema,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  return findChildPropPathsForPropInner(value, schema, path)
}

/**
 * Finds child prop paths for a given value and props.
 * @param value The value to find child prop paths for.
 * @param props The props to find child prop paths in.
 * @returns An array of child prop paths.
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
 * Gets document features for a child field.
 * @param editorDocumentFeatures The editor document features.
 * @param options The child field options.
 * @returns The document features for the child field.
 */
function getInlineMarks(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): Record<Mark, boolean> {
  const inlineMarksFromOptions = options.formatting?.inlineMarks

  if (inlineMarksFromOptions === 'inherit') {
    return 'inherit'
  }

  return Object.fromEntries(
    Object.keys(editorDocumentFeatures.formatting.inlineMarks).map(mark => {
      return [mark as Mark, !!(inlineMarksFromOptions || {})[mark as Mark]]
    })
  ) as Record<Mark, boolean>
}

/**
 * Gets document features for a child field.
 * @param editorDocumentFeatures The editor document features.
 * @param options The child field options.
 * @returns The document features for the child field.
 */
export function getDocumentFeaturesForChildField(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): DocumentFeaturesForChildField {
  const inlineMarks = getInlineMarks(editorDocumentFeatures, options)

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

/**
 * Gets the schema at a prop path.
 * @param path The prop path.
 * @param value The value.
 * @param schema The schema.
 * @returns The schema at the prop path.
 */
function getSchemaAtPropPathInner(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
): undefined | ComponentSchema {
  if (path.length === 0) return schema
  if (schema.kind === 'child' || schema.kind === 'form' || schema.kind === 'relationship') return

  switch (schema.kind) {
    case 'conditional': {
      const key = path.shift()
      if (key === 'discriminant')
        return getSchemaAtPropPathInner(path, (value as any).discriminant, schema.discriminant)
      if (key === 'value') {
        const propVal = schema.values[(value as any).discriminant]
        return getSchemaAtPropPathInner(path, (value as any).value, propVal)
      }
      return
    }
    case 'object': {
      const key = path.shift()!
      return getSchemaAtPropPathInner(path, (value as any)[key], schema.fields[key])
    }
    case 'array': {
      const index = path.shift()!
      return getSchemaAtPropPathInner(path, (value as any)[index], schema.element)
    }
    default:
      assertNever(schema)
      return
  }
}

/**
 * Gets the schema at a prop path.
 * @param path The prop path.
 * @param value The value.
 * @param props The props.
 * @returns The schema at the prop path.
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
 * Validates a prop.
 * @param schema The schema.
 * @param value The value.
 * @returns Whether the prop is valid.
 */
function validatePropInner(schema: ComponentSchema, value: unknown): boolean {
  switch (schema.kind) {
    case 'conditional': {
      if (!('discriminant' in value) || !('value' in value)) return false
      if (!schema.discriminant.validate(value.discriminant)) return false
      return validatePropInner(
        schema.values[
          // not actually gonna always be a string but just let property access do the coercion
          value.discriminant as string
        ],
        value.value
      )
    }
    case 'object': {
      for (const [key, childProp] of Object.entries(schema.fields)) {
        if (!validatePropInner(childProp, (value as any)[key])) return false
      }
      return true
    }
    case 'array': {
      if (!Array.isArray(value)) return false
      for (const innerVal of value) {
        if (!validatePropInner(schema.element, innerVal)) return false
      }
      return true
    }
    default:
      return true
  }
}

/**
 * Validates a prop.
 * @param schema The schema.
 * @param value The value.
 * @returns Whether the prop is valid.
 */
export function clientSideValidateProp(schema: ComponentSchema, value: unknown): boolean {
  if (schema.kind === 'child') return true
  if (schema.kind === 'relationship') return true
  if (schema.kind === 'form') return schema.validate(value)
  if (typeof value !== 'object') return false
  if (value === null) return false
  return validatePropInner(schema, value)
}

/**
 * Gets the ancestor schemas.
 * @param rootSchema The root schema.
 * @param path The path.
 * @param value The value.
 * @returns The ancestor schemas.
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
    const key = currentPath.shift()! // this code only runs when path.length is truthy so this non-null assertion is fine
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

/**
 * Gets the value at a prop path.
 * @param value The value.
 * @param inputPath The input path.
 * @returns The value at the prop path.
 */
export function getValueAtPropPath(value: unknown, inputPath: ReadonlyPropPath) {
  const path = [...inputPath]
  while (path.length) {
    const key = path.shift()!
    value = (value as any)[key]
  }
  return value
}

/**
 * Traverses props.
 * @param schema The schema.
 * @param value The value.
 * @param visitor The visitor.
 * @param path The path.
 */
function traversePropsInner(
  schema: ComponentSchema,
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath
) {
  if (schema.kind === 'form' || schema.kind === 'relationship' || schema.kind === 'child') {
    visitor(schema, value, path)
    return
  }

  switch (schema.kind) {
    case 'object': {
      for (const [key, childProp] of Object.entries(schema.fields)) {
        traversePropsInner(childProp, (value as any)[key], visitor, [...path, key])
      }
      visitor(schema, value, path)
      return
    }
    case 'array': {
      for (const [idx, val] of (value as unknown[]).entries()) {
        traversePropsInner(schema.element, val, visitor, path.concat(idx))
      }
      return visitor(schema, value, path)
    }
    case 'conditional': {
      const discriminant: string | boolean = (value as any).discriminant
      visitor(schema, discriminant, path.concat('discriminant'))
      traversePropsInner(
        schema.values[discriminant.toString()],
        (value as any).value,
        visitor,
        path.concat('value')
      )
      visitor(schema, value, path)
      return
    }
    default:
      assertNever(schema)
      return
  }
}

/**
 * Traverses props.
 * @param schema The schema.
 * @param value The value.
 * @param visitor The visitor.
 * @param path The path.
 */
export function traverseProps(
  schema: ComponentSchema,
  value: unknown,
  visitor: (schema: ComponentSchema, value: unknown, path: ReadonlyPropPath) => void,
  path: ReadonlyPropPath = []
) {
  traversePropsInner(schema, value, visitor, path)
}

/**
 * Replaces a value at a prop path.
 * @param schema The schema.
 * @param value The value.
 * @param newValue The new value.
 * @param path The path.
 * @returns The new value.
 */
function replaceValueAtPropPathInner(
  schema: ComponentSchema,
  value: unknown,
  newValue: unknown,
  path: ReadonlyPropPath
): unknown {
  if (path.length === 0) return newValue

  const [key, ...newPath] = path

  switch (schema.kind) {
    case 'object': {
      return {
        ...(value as any),
        [key]: replaceValueAtPropPathInner(schema.fields[key], (value as any)[key], newValue, newPath),
      }
    }
    case 'conditional': {
      const conditionalValue = value as { discriminant: string | boolean; value: unknown }
      // replaceValueAtPropPath should not be used to only update the discriminant of a conditional field
      // if you want to update the discriminant of a conditional field, replace the value of the whole conditional field
      assert(key === 'value')
      return {
        discriminant: conditionalValue.discriminant,
        value: replaceValueAtPropPathInner(schema.values[key], conditionalValue.value, newValue, newPath),
      }
    }
    case 'array': {
      const prevVal = value as unknown[]
      const newVal = [...prevVal]
      setKeysForArrayValue(newVal, getKeysForArrayValue(prevVal))
      newVal[key as number] = replaceValueAtPropPathInner(
        schema.element,
        newVal[key as number],
        newValue,
        newPath
      )
      return newVal
    }
    default:
      assertNever(schema)
      return
  }
}

/**
 * Replaces a value at a prop path.
 * @param schema The schema.
 * @param value The value.
 * @param newValue The new value.
 * @param path The path.
 * @returns The new value.
 */
export function replaceValueAtPropPath(
  schema: ComponentSchema,
  value: unknown,
  newValue: unknown,
  path: ReadonlyPropPath
): unknown {
  return replaceValueAtPropPathInner(schema, value, newValue, path)
}

/**
 * Gets the placeholder text for a prop path.
 * @param propPath The prop path.
 * @param fields The fields.
 * @param formProps The form props.
 * @returns The placeholder text.
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

export type ReadonlyPropPath = readonly (string | number)[]