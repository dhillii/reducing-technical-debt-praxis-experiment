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

// Validates that a number value meets min/max constraints and required status
function validateNumberValue(
  input: number | null,
  validation: Validation,
  isRequired: boolean,
  label: string
): string | undefined {
  if (isRequired && input === null) return `${label} is required`
  if (typeof input !== 'number') return
  const v = input
  if (!Number.isInteger(v)) return `${label} is not a valid integer`
  if (validation.min !== undefined && v < validation.min)
    return `${label} must be greater than or equal to ${validation.min}`
  if (validation.max !== undefined && v > validation.max)
    return `${label} must be less than or equal to ${validation.max}`
}

// Determines if validation should be skipped based on value kind and auto-increment status
function shouldSkipValidation(
  value: Value,
  hasAutoIncrementDefault: boolean
): boolean {
  if (value.kind === 'create' && hasAutoIncrementDefault && value.value === null) return true
  if (value.kind === 'update' && value.initial === null && value.value === null) return true
  return false
}

// Validates a value object against constraints
function validate_(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  label: string,
  hasAutoIncrementDefault: boolean
): string | undefined {
  if (shouldSkipValidation(value, hasAutoIncrementDefault)) return
  return validateNumberValue(value.value, validation, isRequired, label)
}

// Creates a validation function bound to field configuration
function createFieldValidator(
  config: FieldControllerConfig<{
    validation: Validation
    defaultValue: number | null | 'autoincrement'
  }>
) {
  return (value: Value, opts: { isRequired: boolean }) => {
    return validate_(
      value,
      config.fieldMeta.validation,
      opts.isRequired,
      config.label,
      config.fieldMeta.defaultValue === 'autoincrement'
    )
  }
}

// Determines the default value based on configuration
function getDefaultValue(
  defaultValue: number | null | 'autoincrement'
): Value {
  return {
    kind: 'create',
    value: defaultValue === 'autoincrement' ? null : defaultValue,
  }
}

// Checks if field has auto-increment default
function hasAutoIncrementDefault(
  defaultValue: number | null | 'autoincrement'
): boolean {
  return defaultValue === 'autoincrement'
}

// Parses GraphQL filter value into filter type and value
function parseGraphQLFilterValue(
  type: string,
  value: any
): { type: string; value: any } | { type: string; value: any }[] | [] {
  if (type === 'equals' && value === null) {
    return [{ type: 'empty', value: null }]
  }
  if (!value) return []
  if (type === 'equals') return { type: 'equals', value }
  if (type === 'not') {
    if (value?.equals === null) return { type: 'not_empty', value: null }
    if (value?.equals === undefined) return []
    return { type: 'not', value: value.equals }
  }
  if (type === 'gt' || type === 'gte' || type === 'lt' || type === 'lte') {
    return { type, value }
  }
  return []
}

// Converts filter type and value to GraphQL query format
function filterToGraphQL(
  fieldKey: string,
  type: string,
  value: any
): Record<string, any> {
  if (type === 'empty') return { [fieldKey]: { equals: null } }
  if (type === 'not_empty') return { [fieldKey]: { not: { equals: null } } }
  if (type === 'not') return { [fieldKey]: { not: { equals: value } } }
  return { [fieldKey]: { [type]: value } }
}

// Renders filter label based on type and value
function renderFilterLabel(
  label: string,
  type: string,
  value: any
): string {
  if (type === 'empty' || type === 'not_empty') return label.toLocaleLowerCase()
  const operator = TYPE_OPERATOR_MAP[type as keyof typeof TYPE_OPERATOR_MAP]
  return `${operator} ${value}`
}

// Filter component for number field
function FilterComponent(
  readonly props: Readonly<{
    autoFocus?: boolean
    context?: string
    forceValidation?: boolean
    typeLabel?: string
    onChange?: (value: number | null) => void
    type: string
    value: number | null
    [key: string]: any
  }>,
  readonly config: Readonly<{
    label: string
    fieldKey: string
  }>,
  readonly validate: (value: Value, opts: { isRequired: boolean }) => string | undefined
) {
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
      onChange={(x) => onChange?.(!Number.isFinite(x) ? null : x)}
      value={value ?? NaN}
    />
  )
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
  const validate = createFieldValidator(config)
  const autoIncrementDefault = hasAutoIncrementDefault(config.fieldMeta.defaultValue)

  return {
    fieldKey: config.fieldKey,
    label: config.label,
    description: config.description,
    graphqlSelection: config.fieldKey,
    validation: config.fieldMeta.validation,
    defaultValue: getDefaultValue(config.fieldMeta.defaultValue),
    deserialize: (data) => ({
      kind: 'update',
      value: data[config.fieldKey],
      initial: data[config.fieldKey],
    }),
    serialize: (value) => ({ [config.fieldKey]: value.value }),
    hasAutoIncrementDefault: autoIncrementDefault,
    validate: (value, opts) => validate(value, opts) === undefined,
    filter: {
      Filter(props) {
        return FilterComponent(props, config, validate)
      },

      graphql: ({ type, value }) => {
        return filterToGraphQL(config.fieldKey, type, value)
      },
      parseGraphQL: (value) => {
        return entriesTyped(value).flatMap(([type, filterValue]) => {
          return parseGraphQLFilterValue(type, filterValue)
        })
      },
      Label({ label, type, value }) {
        return renderFilterLabel(label, type, value)
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

// Renders auto-increment field display
function AutoIncrementField(
  readonly props: Readonly<{
    autoFocus?: boolean
    label: string
    description?: string
  }>
) {
  return (
    <NumberField
      autoFocus={props.autoFocus}
      description={props.description}
      label={props.label}
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

// Renders editable number field
function EditableNumberField(
  readonly props: Readonly<{
    autoFocus?: boolean
    label: string
    description?: string
    isReadOnly: boolean
    isRequired: boolean
    errorMessage?: string
    value: number
    onChange?: (value: Value) => void
  }>,
  readonly currentValue: Readonly<Value>
) {
  const [isDirty, setDirty] = useState(false)

  return (
    <NumberField
      autoFocus={props.autoFocus}
      description={props.description}
      label={props.label}
      errorMessage={props.errorMessage}
      isReadOnly={props.isReadOnly}
      isRequired={props.isRequired}
      width="alias.singleLineWidth"
      onBlur={() => setDirty(true)}
      onChange={(x) =>
        props.onChange?.({ ...currentValue, value: !Number.isFinite(x) ? null : x })
      }
      value={props.value ?? NaN}
    />
  )
}

export function Field({
  field,
  value,
  onChange,
  autoFocus,
  forceValidation,
  isRequired,
}: Readonly<FieldProps<typeof controller>>) {
  const isReadOnly = !onChange || field.hasAutoIncrementDefault

  if (field.hasAutoIncrementDefault && value.kind === 'create') {
    return (
      <AutoIncrementField
        autoFocus={autoFocus}
        label={field.label}
        description={field.description}
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

  const errorMessage = (forceValidation) && validate(value)

  return (
    <EditableNumberField
      autoFocus={autoFocus}
      label={field.label}
      description={field.description}
      isReadOnly={isReadOnly}
      isRequired={isRequired}
      errorMessage={errorMessage}
      value={value.value ?? NaN}
      onChange={onChange}
    />
  )
}