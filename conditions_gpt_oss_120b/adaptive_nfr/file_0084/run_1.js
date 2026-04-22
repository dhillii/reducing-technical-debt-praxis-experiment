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
 * Determines if a create‑value should be ignored when auto‑increment is enabled.
 */
function shouldSkipAutoIncrementCreate(value: Value, hasAutoIncrementDefault: boolean): boolean {
  return value.kind === 'create' && hasAutoIncrementDefault && value.value === null
}

/**
 * Determines if an update‑value should be ignored when the initial value is null.
 */
function shouldSkipUpdateWhenInitialNull(value: Value): boolean {
  return value.kind === 'update' && value.initial === null && value.value === null
}

/**
 * Determines if a required field is missing a value.
 */
function isMissingRequired(input: number | null, isRequired: boolean): boolean {
  return isRequired && input === null
}

/**
 * Determines if the supplied value is not a valid integer.
 */
function isInvalidInteger(v: number): boolean {
  return !Number.isInteger(v)
}

/**
 * Determines if the value is below the configured minimum.
 */
function isBelowMin(v: number, min: number): boolean {
  return v < min
}

/**
 * Determines if the value is above the configured maximum.
 */
function isAboveMax(v: number, max: number): boolean {
  return v > max
}

function validate_(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  label: string,
  hasAutoIncrementDefault: boolean
): string | undefined {
  const { value: input } = value

  if (shouldSkipAutoIncrementCreate(value, hasAutoIncrementDefault)) return
  if (shouldSkipUpdateWhenInitialNull(value)) return
  if (isMissingRequired(input, isRequired)) return `${label} is required`
  if (typeof input !== 'number') return

  const v = input
  if (isInvalidInteger(v)) return `${label} is not a valid integer`
  if (validation.min !== undefined && isBelowMin(v, validation.min))
    return `${label} must be greater than or equal to ${validation.min}`
  if (validation.max !== undefined && isAboveMax(v, validation.max))
    return `${label} must be less than or equal to ${validation.max}`
}

/**
 * Predicate helpers for GraphQL filter generation.
 */
function isEmptyType(type: string): boolean {
  return type === 'empty'
}
function isNotEmptyType(type: string): boolean {
  return type === 'not_empty'
}
function isNotOperator(type: string): boolean {
  return type === 'not'
}
function isRangeOperator(type: string): boolean {
  return ['gt', 'gte', 'lt', 'lte'].includes(type)
}

/**
 * Predicate helpers for GraphQL parsing.
 */
function isEqualsNull(type: string, val: any): boolean {
  return type === 'equals' && val === null
}
function isFalsy(val: any): boolean {
  return !val
}
function isEquals(type: string): boolean {
  return type === 'equals'
}
function isNot(type: string): boolean {
  return type === 'not'
}

/**
 * Props for the filter component – marked as read‑only.
 */
type FilterProps = Readonly<{
  autoFocus?: boolean
  context: string
  forceValidation?: boolean
  typeLabel: string
  onChange?: (value: number | null) => void
  type: string
  value: number | null
  [key: string]: any
}>

/**
 * Props for the field component – marked as read‑only.
 */
type FieldComponentProps = Readonly<FieldProps<typeof controller>>

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
    deserialize: data => ({
      kind: 'update',
      value: data[config.fieldKey],
      initial: data[config.fieldKey],
    }),
    serialize: value => ({ [config.fieldKey]: value.value }),
    hasAutoIncrementDefault: config.fieldMeta.defaultValue === 'autoincrement',
    validate: (value, opts) => validate(value, opts) === undefined,
    filter: {
      Filter(props: FilterProps) {
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

        const shouldShowError =
          (forceValidation || isDirty) &&
          !validate({ kind: 'update', initial: null, value }, { isRequired: true })
        const errorMessage = shouldShowError ? 'Required' : null

        return (
          <NumberField
            {...otherProps}
            {...labelProps}
            autoFocus={autoFocus}
            errorMessage={errorMessage}
            step={1}
            width="auto"
            onBlur={() => setDirty(true)}
            onChange={x => onChange?.(!Number.isFinite(x) ? null : x)}
            value={value ?? NaN}
          />
        )
      },

      graphql: ({ type, value }) => {
        if (isEmptyType(type)) return { [config.fieldKey]: { equals: null } }
        if (isNotEmptyType(type)) return { [config.fieldKey]: { not: { equals: null } } }
        if (isNotOperator(type)) return { [config.fieldKey]: { not: { equals: value } } }
        return { [config.fieldKey]: { [type]: value } }
      },

      parseGraphQL: value => {
        return entriesTyped(value).flatMap(([type, val]) => {
          if (isEqualsNull(type, val)) {
            return [{ type: 'empty', value: null }]
          }
          if (isFalsy(val)) return []
          if (isEquals(type)) return { type: 'equals', value: val }
          if (isNot(type)) {
            if (val?.equals === null) return { type: 'not_empty', value: null }
            if (val?.equals === undefined) return []
            return { type: 'not', value: val.equals }
          }
          if (isRangeOperator(type)) {
            return { type, value: val }
          }
          return []
        })
      },

      Label({ label, type, value }) {
        if (type === 'empty' || type === 'not_empty') return label.toLocaleLowerCase()
        const operator = TYPE_OPERATOR_MAP[type as keyof typeof TYPE_OPERATOR_MAP]
        return `${operator} ${value}`
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

export function Field(props: FieldComponentProps) {
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