import { useState } from 'react'

import { ContextualHelp } from '@keystar/ui/contextual-help'
import { Content } from '@keystar/ui/slots'
import { NumberField } from '@keystar/ui/number-field'

import { Heading, Text } from '@keystar/ui/typography'

import type {
  FieldController,
  FieldControllerConfig,
  FieldProps,
  SimpleFieldTypeInfo,
} from '../../../../types'
import { entriesTyped } from '../../../../lib/core/utils'

// TODO: extract
const TYPE_OPERATOR_MAP = {
  equals: '=',
  not: '≠',
  gt: '>',
  lt: '<',
  gte: '≥',
  lte: '≤',
} as const

type Value =
  | { kind: 'create'; value: number | null }
  | { kind: 'update'; initial: number | null; value: number | null }

type Validation = {
  min: number
  max: number
}

/**
 * Core validation logic for numeric fields.
 */
function validate_(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  label: string,
  hasAutoIncrementDefault: boolean
): string | undefined {
  const { value: input, kind } = value
  if (kind === 'create' && hasAutoIncrementDefault && input === null) return
  if (kind === 'update' && value.initial === null && input === null) return
  if (isRequired && input === null) return `${label} is required`
  if (typeof input !== 'number') return
  const v = input
  if (!Number.isInteger(v)) return `${label} is not a valid integer`
  if (validation.min !== undefined && v < validation.min)
    return `${label} must be greater than or equal to ${validation.min}`
  if (validation.max !== undefined && v > validation.max)
    return `${label} must be less than or equal to ${validation.max}`
}

/* Predicate helpers */

function isAutoIncrementCreate(field: any, value: Value): boolean {
  return field.hasAutoIncrementDefault && value.kind === 'create'
}

function shouldShowError(forceValidation: boolean, isDirty: boolean): boolean {
  return forceValidation || isDirty
}

function isEmptyType(type: string): boolean {
  return type === 'empty'
}

function isNotEmptyType(type: string): boolean {
  return type === 'not_empty'
}

function isNotType(type: string): boolean {
  return type === 'not'
}

/**
 * Returns label props based on context.
 */
function getLabelProps(
  context: string | undefined,
  fieldLabel: string,
  typeLabel: string
): { label: string; description?: string } {
  return context === 'add'
    ? { label: fieldLabel, description: typeLabel }
    : { label: typeLabel }
}

/**
 * Renders the filter UI for the numeric field.
 */
function FilterComponent(props: any) {
  const {
    autoFocus,
    context,
    forceValidation,
    typeLabel,
    onChange,
    type,
    value,
    ...otherProps
  } = props
  const [isDirty, setDirty] = useState(false)

  if (isEmptyType(type) || isNotEmptyType(type)) return null

  const labelProps = getLabelProps(context, config.label, typeLabel)

  return (
    <NumberField
      {...otherProps}
      {...labelProps}
      autoFocus={autoFocus}
      errorMessage={
        (forceValidation || isDirty) &&
        !validate_(
          { kind: 'update', initial: null, value },
          config.fieldMeta.validation,
          true,
          config.label,
          config.fieldMeta.defaultValue === 'autoincrement'
        )
          ? 'Required'
          : null
      }
      step={1}
      width="auto"
      onBlur={() => setDirty(true)}
      onChange={(x) => onChange?.(!Number.isFinite(x) ? null : x)}
      value={value ?? NaN}
    />
  )
}

/**
 * Builds a GraphQL filter object based on type and value.
 */
function buildGraphQL(
  config: FieldControllerConfig<any>,
  type: string,
  value: any
): Record<string, any> {
  if (isEmptyType(type))
    return { [config.fieldKey]: { equals: null } }
  if (isNotEmptyType(type))
    return { [config.fieldKey]: { not: { equals: null } } }
  if (isNotType(type))
    return { [config.fieldKey]: { not: { equals: value } } }
  return { [config.fieldKey]: { [type]: value } }
}

/**
 * Parses a GraphQL filter object into internal representation.
 */
function parseGraphQLEntries(
  config: FieldControllerConfig<any>,
  value: Record<string, any>
) {
  return entriesTyped(value).flatMap(([type, val]) => {
    if (type === 'equals' && val === null) {
      return [{ type: 'empty', value: null }]
    }
    if (!val) return []
    if (type === 'equals') return { type: 'equals', value: val }
    if (type === 'not') {
      if (val?.equals === null) return { type: 'not_empty', value: null }
      if (val?.equals === undefined) return []
      return { type: 'not', value: val.equals }
    }
    if (type === 'gt' || type === 'gte' || type === 'lt' || type === 'lte') {
      return { type, value: val }
    }
    return []
  })
}

/**
 * Renders a label for the filter UI.
 */
function renderLabel({
  label,
  type,
  value,
}: {
  label: string
  type: string
  value: any
}) {
  if (isEmptyType(type) || isNotEmptyType(type)) return label.toLocaleLowerCase()
  const operator = TYPE_OPERATOR_MAP[type as keyof typeof TYPE_OPERATOR_MAP]
  return `${operator} ${value}`
}

/* Controller */

export function controller(
  config: FieldControllerConfig<{
    validation: Validation
    defaultValue: number | null | 'autoincrement'
  }>
): FieldController<Value, number | null, SimpleFieldTypeInfo<'Int'>['inputs']['where']> & {
  validation: Validation
  hasAutoIncrementDefault: boolean
} {
  const validate = (value: Value, opts: { isRequired: boolean }) => {
    return validate_(
      value,
      config.fieldMeta.validation,
      opts.isRequired,
      config.label,
      config.fieldMeta.defaultValue === 'autoincrement'
    )
  }

  return {
    fieldKey: config.fieldKey,
    label: config.label,
    description: config.description,
    graphqlSelection: config.fieldKey,
    validation: config.fieldMeta.validation,
    defaultValue: {
      kind: 'create',
      value:
        config.fieldMeta.defaultValue === 'autoincrement'
          ? null
          : config.fieldMeta.defaultValue,
    },
    deserialize: (data) => ({
      kind: 'update',
      value: data[config.fieldKey],
      initial: data[config.fieldKey],
    }),
    serialize: (value) => ({ [config.fieldKey]: value.value }),
    hasAutoIncrementDefault: config.fieldMeta.defaultValue === 'autoincrement',
    validate: (value, opts) => validate(value, opts) === undefined,
    filter: {
      Filter: FilterComponent,
      graphql: ({ type, value }) => buildGraphQL(config, type, value),
      parseGraphQL: (value) => parseGraphQLEntries(config, value),
      Label: renderLabel,
      types: {
        equals: {
          label: 'Is exactly',
          initialValue: null,
        },
        not: {
          label: 'Is not exactly',
          initialValue: null,
        },
        gt: {
          label: 'Is greater than',
          initialValue: null,
        },
        lt: {
          label: 'Is less than',
          initialValue: null,
        },
        gte: {
          label: 'Is greater than or equal to',
          initialValue: null,
        },
        lte: {
          label: 'Is less than or equal to',
          initialValue: null,
        },
        empty: {
          label: 'Is empty',
          initialValue: null,
        },
        not_empty: {
          label: 'Is not empty',
          initialValue: null,
        },
      },
    },
  }
}

/* Field component with read‑only props */

type ReadonlyFieldProps = Readonly<FieldProps<typeof controller>>

export function Field({
  field,
  value,
  onChange,
  autoFocus,
  forceValidation,
  isRequired,
}: ReadonlyFieldProps) {
  const [isDirty, setDirty] = useState(false)
  const isReadOnly = !onChange || field.hasAutoIncrementDefault

  if (isAutoIncrementCreate(field, value)) {
    return (
      <NumberField
        autoFocus={autoFocus}
        description={field.description}
        label={field.label}
        isReadOnly
        contextualHelp={
          <ContextualHelp>
            <Heading>Auto increment</Heading>
            <Content>
              <Text>
                This field is set to auto increment. It will default to the next available number.
              </Text>
            </Content>
          </ContextualHelp>
        }
      />
    )
  }

  const validate = (val: Value) => {
    return validate_(
      val,
      field.validation,
      isRequired,
      field.label,
      field.hasAutoIncrementDefault
    )
  }

  return (
    <NumberField
      autoFocus={autoFocus}
      description={field.description}
      label={field.label}
      errorMessage={shouldShowError(forceValidation, isDirty) && validate(value)}
      isReadOnly={isReadOnly}
      isRequired={isRequired}
      width="alias.singleLineWidth"
      onBlur={() => setDirty(true)}
      onChange={(x) => onChange?.({ ...value, value: !Number.isFinite(x) ? null : x })}
      value={value.value ?? NaN}
    />
  )
}