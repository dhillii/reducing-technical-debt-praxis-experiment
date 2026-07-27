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
  readonly min: number
  readonly max: number
}

/** Validates a numeric value against constraints and business rules */
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

/** Creates a validation function bound to field configuration */
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

/** Determines if the field has an auto-increment default value */
function hasAutoIncrementDefault(
  defaultValue: number | null | 'autoincrement'
): boolean {
  return defaultValue === 'autoincrement'
}

/** Gets the initial value for a new field instance */
function getDefaultValue(
  defaultValue: number | null | 'autoincrement'
): Value {
  return {
    kind: 'create',
    value: hasAutoIncrementDefault(defaultValue) ? null : defaultValue,
  }
}

/** Parses GraphQL filter value into internal representation */
function parseGraphQLFilter(value: Record<string, unknown>) {
  return entriesTyped(value).flatMap(([type, value]) => {
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
  })
}

/** Converts internal filter representation to GraphQL query format */
function toGraphQLFilter(
  type: string,
  value: unknown,
  fieldKey: string
): Record<string, unknown> {
  if (type === 'empty') return { [fieldKey]: { equals: null } }
  if (type === 'not_empty') return { [fieldKey]: { not: { equals: null } } }
  if (type === 'not') return { [fieldKey]: { not: { equals: value } } }
  return { [fieldKey]: { [type]: value } }
}

/** Renders the filter label with appropriate operator symbol */
function FilterLabel({
  readonly label,
  readonly type,
  readonly value,
}: Readonly<{
  label: string
  type: string
  value: unknown
}>) {
  if (type === 'empty' || type === 'not_empty') return label.toLocaleLowerCase()
  const operator = TYPE_OPERATOR_MAP[type as keyof typeof TYPE_OPERATOR_MAP]
  return `${operator} ${value}`
}

/** Renders the filter input component for numeric values */
function FilterInput({
  readonly autoFocus,
  readonly context,
  readonly forceValidation,
  readonly typeLabel,
  readonly onChange,
  readonly type,
  readonly value,
  readonly validate,
  readonly label,
  ...otherProps
}: Readonly<
  {
    autoFocus?: boolean
    context?: string
    forceValidation?: boolean
    typeLabel: string
    onChange?: (value: number | null) => void
    type: string
    value: number | null
    validate: (value: Value, opts: { isRequired: boolean }) => boolean
    label: string
  } & Record<string, unknown>
>) {
  const [isDirty, setDirty] = useState(false)
  if (type === 'empty' || type === 'not_empty') return null

  const labelProps =
    context === 'add' ? { label, description: typeLabel } : { label: typeLabel }

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

/** Renders auto-increment field with contextual help */
function AutoIncrementField({
  readonly autoFocus,
  readonly description,
  readonly label,
}: Readonly<{
  autoFocus?: boolean
  description?: string
  label: string
}>) {
  return (
    <NumberField
      autoFocus={autoFocus}
      description={description}
      label={label}
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

/** Renders editable numeric field with validation */
function EditableNumberField({
  readonly autoFocus,
  readonly description,
  readonly label,
  readonly errorMessage,
  readonly isReadOnly,
  readonly isRequired,
  readonly value,
  readonly onChange,
}: Readonly<{
  autoFocus?: boolean
  description?: string
  label: string
  errorMessage?: string
  isReadOnly: boolean
  isRequired: boolean
  value: Value
  onChange?: (value: Value) => void
}>) {
  const [isDirty, setDirty] = useState(false)

  return (
    <NumberField
      autoFocus={autoFocus}
      description={description}
      label={label}
      errorMessage={errorMessage}
      isReadOnly={isReadOnly}
      isRequired={isRequired}
      width="alias.singleLineWidth"
      onBlur={() => setDirty(true)}
      onChange={(x) => onChange?.({ ...value, value: !Number.isFinite(x) ? null : x })}
      value={value.value ?? NaN}
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
      Filter(props: Readonly<{
        autoFocus?: boolean
        context?: string
        forceValidation?: boolean
        typeLabel: string
        onChange?: (value: number | null) => void
        type: string
        value: number | null
      }>) {
        return (
          <FilterInput
            {...props}
            validate={validate}
            label={config.label}
          />
        )
      },

      graphql: ({ type, value }) => toGraphQLFilter(type, value, config.fieldKey),
      parseGraphQL: parseGraphQLFilter,
      Label: FilterLabel,
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
        description={field.description}
        label={field.label}
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

  const errorMessage = (forceValidation || false) && validate(value)

  return (
    <EditableNumberField
      autoFocus={autoFocus}
      description={field.description}
      label={field.label}
      errorMessage={errorMessage || undefined}
      isReadOnly={isReadOnly}
      isRequired={isRequired}
      value={value}
      onChange={onChange}
    />
  )
}