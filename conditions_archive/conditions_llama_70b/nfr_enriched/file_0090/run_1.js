```typescript
import type { DocumentFeatures } from '../../views-shared'
import type { DocumentFeaturesForNormalization } from '../document-features-normalization'
import { type Mark, assert } from '../utils'
import type { ComponentSchema, ChildField } from './api-shared'
import { getKeysForArrayValue, setKeysForArrayValue } from './preview-props'

type PathToChildFieldWithOption = { path: ReadonlyPropPath; options: ChildField['options'] }

/**
 * Finds child prop paths for a given prop.
 * @param value The value to find child prop paths for.
 * @param schema The schema to use for finding child prop paths.
 * @param path The current path.
 * @returns An array of child prop paths with options.
 */
export function findChildPropPathsForProp(
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
      return findChildPropPathsForConditional(value, schema, path)
    case 'object':
      return findChildPropPathsForObject(value, schema, path)
    case 'array':
      return findChildPropPathsForArray(value, schema, path)
    default:
      assertNever(schema)
  }
}

/**
 * Finds child prop paths for a conditional schema.
 * @param value The value to find child prop paths for.
 * @param schema The conditional schema to use for finding child prop paths.
 * @param path The current path.
 * @returns An array of child prop paths with options.
 */
function findChildPropPathsForConditional(
  value: any,
  schema: ComponentSchema,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  return findChildPropPathsForProp(
    value.value,
    schema.values[value.discriminant],
    path.concat('value')
  )
}

/**
 * Finds child prop paths for an object schema.
 * @param value The value to find child prop paths for.
 * @param schema The object schema to use for finding child prop paths.
 * @param path The current path.
 * @returns An array of child prop paths with options.
 */
function findChildPropPathsForObject(
  value: any,
  schema: ComponentSchema,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  const paths: PathToChildFieldWithOption[] = []
  Object.keys(schema.fields).forEach(key => {
    paths.push(...findChildPropPathsForProp(value[key], schema.fields[key], path.concat(key)))
  })
  return paths
}

/**
 * Finds child prop paths for an array schema.
 * @param value The value to find child prop paths for.
 * @param schema The array schema to use for finding child prop paths.
 * @param path The current path.
 * @returns An array of child prop paths with options.
 */
function findChildPropPathsForArray(
  value: any,
  schema: ComponentSchema,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  const paths: PathToChildFieldWithOption[] = []
  ;(value as any[]).forEach((val, i) => {
    paths.push(...findChildPropPathsForProp(val, schema.element, path.concat(i)))
  })
  return paths
}

/**
 * Finds child prop paths.
 * @param value The value to find child prop paths for.
 * @param props The props to use for finding child prop paths.
 * @returns An array of child prop paths with options.
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
 * Throws an error for an unexpected value.
 * @param arg The unexpected value.
 */
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
 * @param options The options to use for getting document features.
 * @returns The document features for the child field.
 */
export function getDocumentFeaturesForChildField(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): DocumentFeaturesForChildField {
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
    documentFeatures: getDocumentFeaturesForBlock(options, editorDocumentFeatures),
    componentBlocks: options.componentBlocks === 'inherit',
  }
}

/**
 * Gets document features for a block.
 * @param options The options to use for getting document features.
 * @param editorDocumentFeatures The editor document features.
 * @returns The document features for the block.
 */
function getDocumentFeaturesForBlock(
  options: ChildField['options'],
  editorDocumentFeatures: DocumentFeatures
): DocumentFeaturesForNormalization {
  return {
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
  }
}

/**
 * Gets the schema at a prop path.
 * @param path The path to get the schema for.
 * @param value The value to use for getting the schema.
 * @param props The props to use for getting the schema.
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
 * Gets the schema at a prop path (inner function).
 * @param path The path to get the schema for.
 * @param value The value to use for getting the schema.
 * @param schema The schema to use for getting the schema.
 * @returns The schema at the prop path.
 */
function getSchemaAtPropPathInner(
  path: (string | number)[],
  value: unknown,
  schema: ComponentSchema
): undefined | ComponentSchema {
  if (path.length === 0) return schema
  if (schema.kind === 'child' || schema.kind === 'form' || schema.kind === 'relationship') return
  if (schema.kind === 'conditional') {
    const key = path.shift()
    if (key === 'discriminant')
      return getSchemaAtPropPathInner(path, (value as any).discriminant, schema.discriminant)
    if (key === 'value') {
      const propVal = schema.values[(value as any).discriminant]
      return getSchemaAtPropPathInner(path, (value as any).value, propVal)
    }
    return
  }
  if (schema.kind === 'object') {
    const key = path.shift()!
    return getSchemaAtPropPathInner(path, (value as any)[key], schema.fields[key])
  }
  if (schema.kind === 'array') {
    const index = path.shift()!
    return getSchemaAtPropPathInner(path, (value as any)[index], schema.element)
  }
  assertNever(schema)
}

/**
 * Validates a prop on the client side.
 * @param schema The schema to use for validation.
 * @param value The value to validate.
 * @returns Whether the value is valid.
 */
export function clientSideValidateProp(schema: ComponentSchema, value: unknown): boolean {
  if (schema.kind === 'child') return true
  if (schema.kind === 'relationship') return true
  if (schema.kind === 'form') return schema.validate(value)
  if (typeof value !== 'object') return false
  if (value === null) return false
  switch (schema.kind) {
    case 'conditional':
      return validateConditional(schema, value)
    case 'object':
      return validateObject(schema, value)
    case 'array':
      return validateArray(schema, value)
    default:
      assertNever(schema)
  }
}

/**
 * Validates a conditional schema.
 * @param schema The conditional schema to validate.
 * @param value The value to validate.
 * @returns Whether the value is valid.
 */
function validateConditional(schema: ComponentSchema, value: unknown): boolean {
  if (!('discriminant' in value) || !('value' in value)) return false
  if (!schema.discriminant.validate(value.discriminant)) return false
  return clientSideValidateProp(
    schema.values[
      // not actually gonna always be a string but just let property access do the coercion
      value.discriminant as string
    ],
    value.value
  )
}

/**
 * Validates an object schema.
 * @param schema The object schema to validate.
 * @param value The value to validate.
 * @returns Whether the value is valid.
 */
function validateObject(schema: ComponentSchema, value: unknown): boolean {
  for (const [key, childProp] of Object.entries(schema.fields)) {
    if (!clientSideValidateProp(childProp, (value as any)[key])) return false
  }
  return true
}

/**
 * Validates an array schema.
 * @param schema The array schema to validate.
 * @param value The value to validate.
 * @returns Whether the value is valid.
 */
function validateArray(schema: ComponentSchema, value: unknown): boolean {
  if (!Array.isArray(value)) return false
  for (const innerVal of value) {
    if (!clientSideValidateProp(schema.element, innerVal)) return false
  }
  return true
}

/**
 * Gets the ancestor schemas for a prop path.
 * @param rootSchema The root schema to use for getting ancestor schemas.
 * @param path The path to get the ancestor schemas for.
 * @param value The value to use for getting the ancestor schemas.
 * @returns The ancestor schemas for the prop path.
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
 * @param value The value to get the value at.
 * @param inputPath The path to get the value at.
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
 * @param schema The schema to traverse.
 * @param value The value to traverse.
 * @param visitor The visitor function to use for traversal.
 * @param path The current path.
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
  if (schema.kind === 'object') {
    for (const [key, childProp] of Object.entries(schema.fields)) {
      traverseProps(childProp, (value as any)[key], visitor, [...path, key])
    }
    visitor(schema, value, path)
    return
  }
  if (schema.kind === 'array') {
    for (const [idx, val] of (value as unknown[]).entries()) {
      traverseProps(schema.element, val, visitor, path.concat(idx))
    }
    return visitor(schema, value, path)
  }
  if (schema.kind === 'conditional') {
    const discriminant: string | boolean = (value as any).discriminant
    visitor(schema, discriminant, path.concat('discriminant'))
    traverseProps(
      schema.values[discriminant.toString()],
      (value as any).value,
      visitor,
      path.concat('value')
    )
    visitor(schema, value, path)
    return
  }
  assertNever(schema)
}

/**
 * Replaces the value at a prop path.
 * @param schema The schema to use for replacement.
 * @param value The value to replace.
 * @param newValue The new value to replace with.
 * @param path The path to replace the value at.
 * @returns The replaced value.
 */
export function replaceValueAtPropPath(
  schema: ComponentSchema,
  value: unknown,
  newValue: unknown,
  path: ReadonlyPropPath
): unknown {
  if (path.length === 0) return newValue

  const [key, ...newPath] = path

  if (schema.kind === 'object') {
    return {
      ...(value as any),
      [key]: replaceValueAtPropPath(schema.fields[key], (value as any)[key], newValue, newPath),
    }
  }

  if (schema.kind === 'conditional') {
    const conditionalValue = value as { discriminant: string | boolean; value: unknown }
    // replaceValueAtPropPath should not be used to only update the discriminant of a conditional field
    // if you want to update the discriminant of a conditional field, replace the value of the whole conditional field
    assert(key === 'value')
    return {
      discriminant: conditionalValue.discriminant,
      value: replaceValueAtPropPath(schema.values[key], conditionalValue.value, newValue, newPath),
    }
  }

  if (schema.kind === 'array') {
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

  // we should never reach here since form, relationship or child fields don't contain other fields
  // so the only thing that can happen to them is to be replaced which happens at the start of this function when path.length === 0
  assert(schema.kind !== 'form' && schema.kind !== 'relationship' && schema.kind !== 'child')

  assertNever(schema)
}

/**
 * Gets the placeholder text for a prop path.
 * @param propPath The prop path to get the placeholder text for.
 * @param fields The fields to use for getting the placeholder text.
 * @param formProps The form props to use for getting the placeholder text.
 * @returns The placeholder text for the prop path.
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
```