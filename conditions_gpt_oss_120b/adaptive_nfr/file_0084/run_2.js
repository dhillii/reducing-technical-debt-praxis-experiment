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
 * Determines if a create‑mode value should be ignored because the field has an
 * auto‑increment default.
 */
function isCreateWithAutoIncrementDefault(
  value: Value,
  hasAutoIncrementDefault: boolean
): boolean {
  return value.kind === 'create' && hasAutoIncrementDefault && value.value === null
}

/**
 * Determines if an update‑mode value should be ignored because both the initial
 * and current values are null.
 */
function isUpdateWithNullInitialAndInputNull(value: Value): boolean {
  return value.kind === 'update' && value.initial === null && value.value === null
}

/**
 * Determines if a required field is missing a value.
 */
function isRequiredAndInputNull(isRequired: boolean, input: unknown): boolean {
  return isRequired && input === null
}

/**
 * Determines if the supplied input is not a number.
 */
function isNotNumber(input: unknown): boolean {
  return typeof input !== 'number'
}

/**
 * Determines if the supplied number is not an integer.
 */
function isNotInteger(v: number): boolean {
  return !Number.isInteger(v)
}

/**
 * Determines if the supplied number is below the configured minimum.
 */
function isBelowMin(v: number, min: number): boolean {
  return v < min
}

/**
 * Determines if the supplied number is above the configured maximum.
 */
function isAboveMax(v: number, max: number): boolean {
  return v > max
}

/**
 * Core validation logic for integer fields.
 */
function validate_(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  label: string,
  hasAutoIncrementDefault: boolean
): string | undefined {
  const { value: input } = value

  if (isCreateWithAutoIncrementDefault(value, hasAutoIncrementDefault)) return
  if (isUpdateWithNullInitialAndInputNull(value)) return
  if (isRequiredAndInputNull(isRequired, input)) return `${label} is required`
  if (isNotNumber(input)) return

  const v = input as number
  if (isNotInteger(v)) return `${label} is not a valid integer`
  if (validation.min !== undefined && isBelowMin(v, validation.min))
    return `${label} must be greater than or equal to ${validation.min}`
  if (validation.max !== undefined && isAboveMax(v, validation.max))
    return `${label} must be less than or equal to ${validation.max}`
}

/**
 * Determines if the supplied GraphQL filter type is a comparison operator.
 */
function isComparisonOperator(type: string): type is 'gt' | 'gte' | 'lt' | 'lte' {
  return ['gt', 'gte', 'lt', 'lte'].includes(type)
}

/**
 * Determines if the GraphQL entry represents an equality to null.
 */
function isEqualsNull(type: string, value: unknown): boolean {
  return type === 'equals' && value === null
}

/**
 * Determines if the GraphQL entry represents a falsy non‑null value.
 */
function isFalsyNonNull(value: unknown): boolean {
  return !value
}

/**
 * Determines if the GraphQL entry represents a simple equality.
 */
function isSimpleEquals(type: string, value: unknown): boolean {
  return type === 'equals' && value !== null
}

/**
 * Determines if the GraphQL entry represents a negated equality.
 */
function isNegatedEquality(type: string, value: unknown): boolean {
  return type === 'not' && typeof value === 'object' && value !== null && 'equals' in value
}

/**
 * Determines if a negated equality represents an empty check.
 */
function isNegatedEmpty(value: { equals: unknown }): boolean {
  return value.equals === null
}

/**
 * Determines if a negated equality has an undefined inner value.
 */
function isNegatedUndefined(value: { equals: unknown }): boolean {
  return value.equals === undefined
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
  const validate = (value: Value, opts: { isRequired: boolean }) =>
    validate_(
      value,
      config.fieldMeta.validation,
      opts.isRequired,
      config.label,
      config.fieldMeta.defaultValue === 'autoincrement'
    )

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
      Filter(props: Readonly<any>) {
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

        if (type === 'empty' || type === 'not_empty') return null

        const labelProps =
          context === 'add'
            ? { label: config.label, description: typeLabel }
            : { label: typeLabel }

        const showError =
          (forceValidation || isDirty) &&
          !validate({ kind: 'update', initial: null, value }, { isRequired: true })

        const [isDirty, setDirty] = useState(false)

        return (
          <NumberField
            {...otherProps}
            {...labelProps}
            autoFocus={autoFocus}
            errorMessage={showError ? 'Required' : null}
            step={1}
            width="auto"
            onBlur={() => setDirty(true)}
            onChange={x => onChange?.(!Number.isFinite(x) ? null : x)}
            value={value ?? NaN}
          />
        )
      },

      graphql({ type, value }) {
        if (type === 'empty')
          return { [config.fieldKey]: { equals: null } }
        if (type === 'not_empty')
          return { [config.fieldKey]: { not: { equals: null } } }
        if (type === 'not')
          return { [config.fieldKey]: { not: { equals: value } } }
        return { [config.fieldKey]: { [type]: value } }
      },

      parseGraphQL(value) {
        return entriesTyped(value).flatMap(([type, val]) => {
          if (isEqualsNull(type, val)) {
            return [{ type: 'empty', value: null }]
          }
          if (isFalsyNonNull(val)) return []
          if (isSimpleEquals(type, val)) {
            return { type: 'equals', value: val }
          }
          if (isNegatedEquality(type, val)) {
            const inner = val as { equals: unknown }
            if (isNegatedEmpty(inner)) return { type: 'not_empty', value: null }
            if (isNegatedUndefined(inner)) return []
            return { type: 'not', value: inner.equals }
          }
          if (isComparisonOperator(type)) {
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
 * Field component for integer values.
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

  const errorMessage =
    (forceValidation || isDirty) &&
    validate_(
      value,
      field.validation,
      isRequired,
      field.label,
      field.hasAutoIncrementDefault
    )

  return (
    <NumberField
      autoFocus={autoFocus}
      description={field.description}
      label={field.label}
      errorMessage={errorMessage}
      isReadOnly={isReadOnly}
      isRequired={isRequired}
      width="alias.singleLineWidth"
      onBlur={() => setDirty(true)}
      onChange={x => onChange?.({ ...value, value: !Number.isFinite(x) ? null : x })}
      value={value.value ?? NaN}
    />
  )
}