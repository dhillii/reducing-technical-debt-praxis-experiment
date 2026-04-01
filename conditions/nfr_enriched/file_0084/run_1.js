```typescript
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

/** Validates integer field value against constraints */
function validateIntegerValue(
  input: number | null,
  validation: Validation,
  label: string
): string | undefined {
  if (typeof input !== 'number') return
  if (!Number.isInteger(input)) return `${label} is not a valid integer`
  if (validation.min !== undefined && input < validation.min)
    return `${label} must be greater than or equal to ${validation.min}`
  if (validation.max !== undefined && input > validation.max)
    return `${label} must be less than or equal to ${validation.max}`
}

/** Validates required field constraint */
function validateRequired(
  value: number | null,
  isRequired: boolean,
  label: string
): string | undefined {
  if (isRequired && value === null) return `${label} is required`
}

/** Validates auto-increment field behavior */
function validateAutoIncrement(
  value: Value,
  hasAutoIncrementDefault: boolean
): boolean {
  if (value.kind === 'create' && hasAutoIncrementDefault && value.value === null) return true
  if (value.kind === 'update' && value.initial === null && value.value === null) return true
  return false
}

/** Comprehensive validation for integer field values */
function validate_(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  label: string,
  hasAutoIncrementDefault: boolean
): string | undefined {
  const { value: input } = value

  if (validateAutoIncrement(value, hasAutoIncrementDefault)) return

  const requiredError = validateRequired(input, isRequired, label)
  if (requiredError) return requiredError

  return validateIntegerValue(input, validation, label)
}

/** Builds filter type configuration for integer field */
function buildFilterTypes(): Record<
  string,
  { readonly label: string; readonly initialValue: null }
> {
  return {
    equals: { label: 'Is exactly', initialValue: null },
    not: { label: 'Is not exactly', initialValue: null },
    gt: { label: 'Is greater than', initialValue: null },
    lt: { label: 'Is less than', initialValue: null },
    gte: { label: 'Is greater than or equal to', initialValue: null },
    lte: { label: 'Is less than or equal to', initialValue: null },
    empty: { label: 'Is empty', initialValue: null },
    not_empty: { label: 'Is not empty', initialValue: null },
  }
}

/** Converts filter type to GraphQL operator */
function filterTypeToGraphQL(
  type: string,
  value: number | null,
  fieldKey: string
): Record<string, unknown> {
  if (type === 'empty') return { [fieldKey]: { equals: null } }
  if (type === 'not_empty') return { [fieldKey]: { not: { equals: null } } }
  if (type === 'not') return { [fieldKey]: { not: { equals: value } } }
  return { [fieldKey]: { [type]: value } }
}

/** Parses GraphQL filter response into filter UI format */
function parseGraphQLFilter(
  value: Record<string, unknown>
): Array<{ type: string; value: number | null }> {
  return entriesTyped(value).flatMap(([type, filterValue]) => {
    if (type === 'equals' && filterValue === null) {
      return [{ type: 'empty', value: null }]
    }
    if (!filterValue) return []
    if (type === 'equals') return { type: 'equals', value: filterValue }
    if (type === 'not') {
      const notValue = filterValue as Record<string, unknown>
      if (notValue?.equals === null) return { type: 'not_empty', value: null }
      if (notValue?.equals === undefined) return []
      return { type: 'not', value: notValue.equals as number }
    }
    if (type === 'gt' || type === 'gte' || type === 'lt' || type === 'lte') {
      return { type, value: filterValue as number }
    }
    return []
  })
}

/** Formats filter label for display */
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
    readonly validation: Validation
    readonly defaultValue: number | null | 'autoincrement'
  }>
): FieldController<Value, number | null, SimpleFieldTypeInfo<'Int'>['inputs']['where']> & {
  readonly validation: Validation
  readonly hasAutoIncrementDefault: boolean
} {
  const validate = (value: Value, opts: { readonly isRequired: boolean }) => {
    return validate_(
      value,
      config.fieldMeta.validation,
      opts.isRequired,
      config.label,
      config.fieldMeta.defaultValue === 'autoincrement'
    )
  }

  const hasAutoIncrementDefault = config.fieldMeta.defaultValue === 'autoincrement'

  return {
    fieldKey: config.fieldKey,
    label: config.label,
    description: config.description,
    graphqlSelection: config.fieldKey,
    validation: config.fieldMeta.validation,
    defaultValue: {
      kind: 'create',
      value: hasAutoIncrementDefault ? null : config.fieldMeta.defaultValue,
    },
    deserialize: data => ({
      kind: 'update',
      value: data[config.fieldKey],
      initial: data[config.fieldKey],
    }),
    serialize: value => ({ [config.fieldKey]: value.value }),
    hasAutoIncrementDefault,
    validate: (value, opts) => validate(value, opts) === undefined,
    filter: {
      Filter(props: Readonly<{
        readonly autoFocus?: boolean
        readonly context?: string
        readonly forceValidation?: boolean
        readonly typeLabel?: string
        readonly onChange?: (value: number | null) => void
        readonly type: string
        readonly value: number | null
      }>) {
        const {
          autoFocus,
          context,
          forceValidation,
          typeLabel,
          onChange,
          type,
          value,
        } = props
        const [isDirty, setDirty] = useState(false)
        if (type === 'empty' || type === 'not_empty') return null

        const labelProps =
          context === 'add'
            ? { label: config.label, description: typeLabel }
            : { label: typeLabel }

        const isInvalid =
          (forceValidation || isDirty) &&
          !validate({ kind: 'update', initial: null, value }, { isRequired: true })

        return (
          <NumberField
            {...labelProps}
            autoFocus={autoFocus}
            errorMessage={isInvalid ? 'Required' : null}
            step={1}
            width="auto"
            onBlur={() => setDirty(true)}
            onChange={x => onChange?.(!Number.isFinite(x) ? null : x)}
            value={value ?? NaN}
          />
        )
      },

      graphql: ({ type, value }) => filterTypeToGraphQL(type, value, config.fieldKey),
      parseGraphQL: parseGraphQLFilter,
      Label(props: Readonly<{
        readonly label: string
        readonly type: string
        readonly value: number | null
      }>) {
        return formatFilterLabel(props.label, props.type, props.value)
      },
      types: buildFilterTypes(),
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
```