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

/** Creates a filter label for the given type and value */
function createFilterLabel(
  type: string,
  value: number | null,
  label: string
): string {
  if (type === 'empty' || type === 'not_empty') return label.toLocaleLowerCase()
  const operator = TYPE_OPERATOR_MAP[type as keyof typeof TYPE_OPERATOR_MAP]
  return `${operator} ${value}`
}

/** Converts GraphQL filter to internal filter representation */
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
      if ((filterValue as Record<string, unknown>)?.equals === null) {
        return { type: 'not_empty', value: null }
      }
      if ((filterValue as Record<string, unknown>)?.equals === undefined) return []
      return { type: 'not', value: (filterValue as Record<string, unknown>).equals }
    }
    if (type === 'gt' || type === 'gte' || type === 'lt' || type === 'lte') {
      return { type, value: filterValue }
    }
    return []
  })
}

/** Converts internal filter to GraphQL query format */
function toGraphQLFilter(
  type: string,
  value: number | null,
  fieldKey: string
): Record<string, unknown> {
  if (type === 'empty') return { [fieldKey]: { equals: null } }
  if (type === 'not_empty') return { [fieldKey]: { not: { equals: null } } }
  if (type === 'not') return { [fieldKey]: { not: { equals: value } } }
  return { [fieldKey]: { [type]: value } }
}

/** Filter component for integer field */
function IntegerFilterComponent(
  readonly props: Readonly<{
    autoFocus?: boolean
    context?: string
    forceValidation?: boolean
    typeLabel?: string
    onChange?: (value: number | null) => void
    type: string
    value: number | null
    [key: string]: unknown
  }>,
  readonly config: Readonly<{ label: string }>
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
        !validateIntegerValue({ kind: 'update', initial: null, value }, { min: undefined, max: undefined }, true, config.label, false)
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
  readonly config: Readonly<
    FieldControllerConfig<{
      validation: Validation
      defaultValue: number | null | 'autoincrement'
    }>
  >
): FieldController<Value, number | null, SimpleFieldTypeInfo<'Int'>['inputs']['where']> & {
  validation: Validation
  hasAutoIncrementDefault: boolean
} {
  const validate = (value: Value, opts: Readonly<{ isRequired: boolean }>) => {
    return validateIntegerValue(
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
    deserialize: (data) => ({
      kind: 'update',
      value: data[config.fieldKey],
      initial: data[config.fieldKey],
    }),
    serialize: (value) => ({ [config.fieldKey]: value.value }),
    hasAutoIncrementDefault,
    validate: (value, opts) => validate(value, opts) === undefined,
    filter: {
      Filter(props) {
        return IntegerFilterComponent(props, { label: config.label })
      },

      graphql: ({ type, value }) => {
        return toGraphQLFilter(type, value, config.fieldKey)
      },
      parseGraphQL: (value) => {
        return parseGraphQLFilter(value)
      },
      Label({ label, type, value }) {
        return createFilterLabel(type, value, label)
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

/** Renders auto-increment field in read-only mode */
function AutoIncrementField(
  readonly props: Readonly<{
    autoFocus?: boolean
    description?: string
    label: string
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

/** Renders editable integer field */
function EditableIntegerField(
  readonly props: Readonly<{
    autoFocus?: boolean
    description?: string
    label: string
    errorMessage?: string
    isReadOnly: boolean
    isRequired: boolean
    value: Value
    onChange?: (value: Value) => void
    onBlur: () => void
  }>
) {
  return (
    <NumberField
      autoFocus={props.autoFocus}
      description={props.description}
      label={props.label}
      errorMessage={props.errorMessage}
      isReadOnly={props.isReadOnly}
      isRequired={props.isRequired}
      width="alias.singleLineWidth"
      onBlur={props.onBlur}
      onChange={(x) =>
        props.onChange?.({ ...props.value, value: !Number.isFinite(x) ? null : x })
      }
      value={props.value.value ?? NaN}
    />
  )
}

export function Field(
  readonly props: Readonly<FieldProps<typeof controller>>
) {
  const { field, value, onChange, autoFocus, forceValidation, isRequired } = props
  const [isDirty, setDirty] = useState(false)
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
    return validateIntegerValue(val, field.validation, isRequired, field.label, field.hasAutoIncrementDefault)
  }

  return (
    <EditableIntegerField
      autoFocus={autoFocus}
      description={field.description}
      label={field.label}
      errorMessage={(forceValidation || isDirty) ? validate(value) : undefined}
      isReadOnly={isReadOnly}
      isRequired={isRequired}
      value={value}
      onChange={onChange}
      onBlur={() => setDirty(true)}
    />
  )
}
```