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
 * Validate a numeric value against field constraints.
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

/**
 * Render a NumberField for filter UI.
 */
function renderFilterNumberField(
  props: Readonly<{
    autoFocus?: boolean
    errorMessage?: string | null
    onBlur: () => void
    onChange: (value: number | null) => void
    value: number | null
    step?: number
    width?: string
    labelProps: { label: string; description?: string }
    otherProps: Record<string, unknown>
  }>
) {
  const {
    autoFocus,
    errorMessage,
    onBlur,
    onChange,
    value,
    step = 1,
    width = 'auto',
    labelProps,
    otherProps,
  } = props
  return (
    <NumberField
      {...otherProps}
      {...labelProps}
      autoFocus={autoFocus}
      errorMessage={errorMessage}
      step={step}
      width={width}
      onBlur={onBlur}
      onChange={x => onChange(!Number.isFinite(x) ? null : x)}
      value={value ?? NaN}
    />
  )
}

/**
 * Resolve GraphQL filter objects.
 */
function resolveGraphQLFilter(
  configFieldKey: string,
  type: string,
  value: number | null
) {
  if (type === 'empty') return { [configFieldKey]: { equals: null } }
  if (type === 'not_empty') return { [configFieldKey]: { not: { equals: null } } }
  if (type === 'not') return { [configFieldKey]: { not: { equals: value } } }
  return { [configFieldKey]: { [type]: value } }
}

/**
 * Parse GraphQL filter results into UI filter descriptors.
 */
function parseGraphQLFilter(
  value: Record<string, unknown>
) {
  return entriesTyped(value).flatMap(([type, value]) => {
    if (type === 'equals' && value === null) {
      return [{ type: 'empty', value: null }]
    }
    if (!value) return []
    if (type === 'equals') return { type: 'equals', value }
    if (type === 'not') {
      if ((value as any)?.equals === null) return { type: 'not_empty', value: null }
      if ((value as any)?.equals === undefined) return []
      return { type: 'not', value: (value as any).equals }
    }
    if (type === 'gt' || type === 'gte' || type === 'lt' || type === 'lte') {
      return { type, value }
    }
    return []
  })
}

/**
 * Render a label for a filter descriptor.
 */
function renderFilterLabel(
  type: string,
  value: number | null,
  label: string
) {
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
      Filter(props: Readonly<{
        autoFocus?: boolean
        context: string
        forceValidation?: boolean
        typeLabel: string
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
          context === 'add'
            ? { label: config.label, description: typeLabel }
            : { label: typeLabel }

        return renderFilterNumberField({
          autoFocus,
          errorMessage:
            (forceValidation || isDirty) &&
            !validate({ kind: 'update', initial: null, value }, { isRequired: true })
              ? 'Required'
              : null,
          onBlur: () => setDirty(true),
          onChange: x => onChange?.(!Number.isFinite(x) ? null : x),
          value,
          labelProps,
          otherProps,
        })
      },

      graphql({ type, value }) {
        return resolveGraphQLFilter(config.fieldKey, type, value)
      },

      parseGraphQL(value) {
        return parseGraphQLFilter(value)
      },

      Label({ label, type, value }) {
        return renderFilterLabel(type, value, label)
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

/**
 * Render the main field component.
 */
export function Field(
  props: Readonly<FieldProps<typeof controller>>
) {
  const { field, value, onChange, autoFocus, forceValidation, isRequired } = props
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