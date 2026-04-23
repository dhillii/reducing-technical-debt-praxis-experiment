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
 * Core validation logic shared by field and filter.
 */
function coreValidate(
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
  if (!Number.isInteger(input)) return `${label} is not a valid integer`
  if (validation.min !== undefined && input < validation.min)
    return `${label} must be greater than or equal to ${validation.min}`
  if (validation.max !== undefined && input > validation.max)
    return `${label} must be less than or equal to ${validation.max}`
}

/**
 * Wrapper used by the field component.
 */
function fieldValidate(
  value: Value,
  field: {
    validation: Validation
    label: string
    hasAutoIncrementDefault: boolean
  },
  isRequired: boolean
) {
  return coreValidate(
    value,
    field.validation,
    isRequired,
    field.label,
    field.hasAutoIncrementDefault
  )
}

/**
 * Generates GraphQL filter objects.
 */
function buildGraphQLFilter(
  fieldKey: string,
  type: string,
  value: number | null
) {
  if (type === 'empty')
    return { [fieldKey]: { equals: null } }
  if (type === 'not_empty')
    return { [fieldKey]: { not: { equals: null } } }
  if (type === 'not')
    return { [fieldKey]: { not: { equals: value } } }
  return { [fieldKey]: { [type]: value } }
}

/**
 * Parses GraphQL filter objects into internal representation.
 */
function parseGraphQLFilter(value: Record<string, any>) {
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
    if (['gt', 'gte', 'lt', 'lte'].includes(type)) {
      return { type, value: val }
    }
    return []
  })
}

/**
 * Renders a human‑readable label for a filter.
 */
function renderFilterLabel(type: string, value: number | null, label: string) {
  if (type === 'empty' || type === 'not_empty') return label.toLocaleLowerCase()
  const operator = TYPE_OPERATOR_MAP[type as keyof typeof TYPE_OPERATOR_MAP]
  return `${operator} ${value}`
}

/**
 * Filter component with read‑only props.
 */
function FilterComponent(props: Readonly<any>) {
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
  if (type === 'empty' || type === 'not_empty') return null

  const labelProps =
    context === 'add'
      ? { label: config.label, description: typeLabel }
      : { label: typeLabel }

  return (
    <NumberField
      {...otherProps}
      {...labelProps}
      autoFocus={autoFocus}
      errorMessage={
        (forceValidation || isDirty) &&
        !fieldValidate(
          { kind: 'update', initial: null, value },
          {
            validation: config.fieldMeta.validation,
            label: config.label,
            hasAutoIncrementDefault:
              config.fieldMeta.defaultValue === 'autoincrement',
          },
          true
        )
          ? 'Required'
          : null
      }
      step={1}
      width="auto"
      onBlur={() => setDirty(true)}
      onChange={x => onChange?.(!Number.isFinite(x) ? null : x)}
      value={value ?? NaN}
    />
  )
}

/**
 * Main controller factory.
 */
export function controller(
  config: FieldControllerConfig<{
    validation: Validation
    defaultValue: number | null | 'autoincrement'
  }>
): FieldController<Value, number | null, SimpleFieldTypeInfo<'Int'>['inputs']['where']> & {
  validation: Validation
  hasAutoIncrementDefault: boolean
} {
  const hasAutoInc = config.fieldMeta.defaultValue === 'autoincrement'

  const validate = (value: Value, opts: { isRequired: boolean }) =>
    coreValidate(
      value,
      config.fieldMeta.validation,
      opts.isRequired,
      config.label,
      hasAutoInc
    )

  return {
    fieldKey: config.fieldKey,
    label: config.label,
    description: config.description,
    graphqlSelection: config.fieldKey,
    validation: config.fieldMeta.validation,
    defaultValue: {
      kind: 'create',
      value: hasAutoInc ? null : config.fieldMeta.defaultValue,
    },
    deserialize: data => ({
      kind: 'update',
      value: data[config.fieldKey],
      initial: data[config.fieldKey],
    }),
    serialize: value => ({ [config.fieldKey]: value.value }),
    hasAutoIncrementDefault: hasAutoInc,
    validate: (value, opts) => validate(value, opts) === undefined,
    filter: {
      Filter: FilterComponent,
      graphql: ({ type, value }) => buildGraphQLFilter(config.fieldKey, type, value),
      parseGraphQL: parseGraphQLFilter,
      Label({ label, type, value }) {
        return renderFilterLabel(type, value, label)
      },
      types: {
        equals: { label: 'Is exactly', initialValue: null },
        not: { label: 'Is not exactly', initialValue: null },
        gt: { label: 'Is greater than', initialValue: null },
        lt: { label: 'Is less than', initialValue: null },
        gte: { label: 'Is greater than or equal to', initialValue: null },
        lte: { label: 'Is less than or equal to', initialValue: null },
        empty: { label: 'Is empty', initialValue: null },
        not_empty: { label: 'Is not empty', initialValue: null },
      },
    },
  }
}

/**
 * Field component with read‑only props.
 */
export function Field(
  props: Readonly<FieldProps<typeof controller>>
) {
  const {
    field,
    value,
    onChange,
    autoFocus,
    forceValidation,
    isRequired,
  } = props
  const [isDirty, setDirty] = useState(false)
  const isReadOnly = !onChange || field.hasAutoIncrementDefault

  if (field.hasAutoIncrementDefault && value.kind === 'create') {
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

  const validate = (val: Value) =>
    fieldValidate(val, field, isRequired)

  return (
    <NumberField
      autoFocus={autoFocus}
      description={field.description}
      label={field.label}
      errorMessage={(forceValidation || isDirty) && validate(value)}
      isReadOnly={isReadOnly}
      isRequired={isRequired}
      width="alias.singleLineWidth"
      onBlur={() => setDirty(true)}
      onChange={x => onChange?.({ ...value, value: !Number.isFinite(x) ? null : x })}
      value={value.value ?? NaN}
    />
  )
}