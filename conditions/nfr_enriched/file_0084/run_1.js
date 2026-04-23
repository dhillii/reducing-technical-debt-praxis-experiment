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

// Validates that the value is a valid integer within the specified bounds
function validateInteger(
  input: number,
  validation: Validation,
  label: string
): string | undefined {
  if (!Number.isInteger(input)) return `${label} is not a valid integer`
  if (validation.min !== undefined && input < validation.min)
    return `${label} must be greater than or equal to ${validation.min}`
  if (validation.max !== undefined && input > validation.max)
    return `${label} must be less than or equal to ${validation.max}`
}

// Validates that the value is not null when required
function validateRequired(input: number | null, isRequired: boolean, label: string): string | undefined {
  if (isRequired && input === null) return `${label} is required`
}

// Determines if the value should be considered empty based on its kind and initial state
function isValueEmpty(value: Value, hasAutoIncrementDefault: boolean): boolean {
  const { value: input, kind } = value
  if (kind === 'create' && hasAutoIncrementDefault && input === null) return true
  if (kind === 'update' && value.initial === null && input === null) return true
  return false
}

// Validates a numeric field value against constraints
function validate_(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  label: string,
  hasAutoIncrementDefault: boolean
): string | undefined {
  if (isValueEmpty(value, hasAutoIncrementDefault)) return

  const { value: input } = value
  if (typeof input !== 'number') return

  const requiredError = validateRequired(input, isRequired, label)
  if (requiredError) return requiredError

  return validateInteger(input, validation, label)
}

// Creates a filter component for integer field filtering
function createFilterComponent(
  config: FieldControllerConfig<{
    validation: Validation
    defaultValue: number | null | 'autoincrement'
  }>,
  validate: (value: Value, opts: { isRequired: boolean }) => boolean
) {
  return function Filter(readonly props: Readonly<{
    autoFocus?: boolean
    context?: string
    forceValidation?: boolean
    typeLabel?: string
    onChange?: (value: number | null) => void
    type: string
    value: number | null
    [key: string]: unknown
  }>) {
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
      context === 'add' ? { label: config.label, description: typeLabel } : { label: typeLabel }

    return (
      <NumberField
        {...otherProps}
        {...labelProps}
        autoFocus={autoFocus}
        errorMessage={
          (forceValidation || isDirty) &&
          !validate({ kind: 'update', initial: null, value }, { isRequired: true })
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
}

// Converts filter type and value to GraphQL query format
function filterToGraphQL(
  config: FieldControllerConfig<{
    validation: Validation
    defaultValue: number | null | 'autoincrement'
  }>,
  type: string,
  value: number | null
): Record<string, unknown> {
  if (type === 'empty') return { [config.fieldKey]: { equals: null } }
  if (type === 'not_empty') return { [config.fieldKey]: { not: { equals: null } } }
  if (type === 'not') return { [config.fieldKey]: { not: { equals: value } } }
  return { [config.fieldKey]: { [type]: value } }
}

// Parses GraphQL filter response into filter type and value
function parseGraphQLFilter(value: Record<string, unknown>): Array<{ type: string; value: number | null }> {
  return entriesTyped(value).flatMap(([type, filterValue]) => {
    if (type === 'equals' && filterValue === null) {
      return [{ type: 'empty', value: null }]
    }
    if (!filterValue) return []
    if (type === 'equals') return { type: 'equals', value: filterValue }
    if (type === 'not') {
      if ((filterValue as Record<string, unknown>)?.equals === null) return { type: 'not_empty', value: null }
      if ((filterValue as Record<string, unknown>)?.equals === undefined) return []
      return { type: 'not', value: (filterValue as Record<string, unknown>).equals }
    }
    if (type === 'gt' || type === 'gte' || type === 'lt' || type === 'lte') {
      return { type, value: filterValue }
    }
    return []
  })
}

// Formats filter label for display
function formatFilterLabel(
  label: string,
  type: string,
  value: number | null
): string {
  if (type === 'empty' || type === 'not_empty') return label.toLocaleLowerCase()
  const operator = TYPE_OPERATOR_MAP[type as keyof typeof TYPE_OPERATOR_MAP]
  return `${operator} ${value}`
}

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
        config.fieldMeta.defaultValue === 'autoincrement' ? null : config.fieldMeta.defaultValue,
    },
    deserialize: data => ({
      kind: 'update',
      value: data[config.fieldKey],
      initial: data[config.fieldKey],
    }),
    serialize: value => ({ [config.fieldKey]: value.value }),
    hasAutoIncrementDefault: config.fieldMeta.defaultValue === 'autoincrement',
    validate: (value, opts) => validate(value, opts) === undefined,
    filter: {
      Filter: createFilterComponent(config, validate),
      graphql: ({ type, value }) => filterToGraphQL(config, type, value),
      parseGraphQL: value => parseGraphQLFilter(value),
      Label({ label, type, value }: Readonly<{ label: string; type: string; value: number | null }>) {
        return formatFilterLabel(label, type, value)
      },
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

// Renders the auto-increment field display
function renderAutoIncrementField(
  readonly field: Readonly<{
    label: string
    description?: string
    hasAutoIncrementDefault: boolean
  }>,
  autoFocus?: boolean
) {
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

// Renders the editable number field
function renderEditableNumberField(
  readonly field: Readonly<{
    label: string
    description?: string
    validation: Validation
    hasAutoIncrementDefault: boolean
  }>,
  readonly value: Value,
  readonly isReadOnly: boolean,
  readonly isRequired: boolean,
  readonly isDirty: boolean,
  readonly autoFocus?: boolean,
  readonly forceValidation?: boolean,
  readonly onChange?: (value: Value) => void,
  readonly validate?: (value: Value) => string | undefined
) {
  return (
    <NumberField
      autoFocus={autoFocus}
      description={field.description}
      label={field.label}
      errorMessage={(forceValidation || isDirty) && validate?.(value)}
      isReadOnly={isReadOnly}
      isRequired={isRequired}
      width="alias.singleLineWidth"
      onBlur={() => {}}
      onChange={x => onChange?.({ ...value, value: !Number.isFinite(x) ? null : x })}
      value={value.value ?? NaN}
    />
  )
}

export function Field(readonly props: Readonly<FieldProps<typeof controller>>) {
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
    return renderAutoIncrementField(field, autoFocus)
  }

  const validate = (value: Value) => {
    return validate_(
      value,
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