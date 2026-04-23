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
 * Checks if the value is a creation with auto‑increment default and null input.
 */
function isCreateWithAutoIncrementDefault(
  value: Value,
  hasAutoIncrementDefault: boolean
): boolean {
  return value.kind === 'create' && hasAutoIncrementDefault && value.value === null
}

/**
 * Checks if the value is an update where both initial and input are null.
 */
function isUpdateWithNullInitialAndInputNull(value: Value): boolean {
  return value.kind === 'update' && value.initial === null && value.value === null
}

/**
 * Checks if the field is required and the input is null.
 */
function isRequiredAndNull(value: Value, isRequired: boolean): boolean {
  return isRequired && value.value === null
}

/**
 * Checks if the input is not a number.
 */
function isNotNumber(value: Value): boolean {
  return typeof value.value !== 'number'
}

/**
 * Checks if the number is not an integer.
 */
function isNotInteger(v: number): boolean {
  return !Number.isInteger(v)
}

/**
 * Checks if the number is below the minimum allowed.
 */
function isBelowMin(v: number, min: number): boolean {
  return v < min
}

/**
 * Checks if the number is above the maximum allowed.
 */
function isAboveMax(v: number, max: number): boolean {
  return v > max
}

/**
 * Core validation logic with guard clauses.
 */
function validate_(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  label: string,
  hasAutoIncrementDefault: boolean
): string | undefined {
  if (isCreateWithAutoIncrementDefault(value, hasAutoIncrementDefault)) return
  if (isUpdateWithNullInitialAndInputNull(value)) return
  if (isRequiredAndNull(value, isRequired)) return `${label} is required`
  if (isNotNumber(value)) return
  const v = value.value as number
  if (isNotInteger(v)) return `${label} is not a valid integer`
  if (validation.min !== undefined && isBelowMin(v, validation.min))
    return `${label} must be greater than or equal to ${validation.min}`
  if (validation.max !== undefined && isAboveMax(v, validation.max))
    return `${label} must be less than or equal to ${validation.max}`
}

/**
 * Checks if the GraphQL entry is an equals operator with a null value.
 */
function isEqualsNull(type: string, val: any): boolean {
  return type === 'equals' && val === null
}

/**
 * Checks if the provided value is falsy.
 */
function isFalsy(val: any): boolean {
  return !val
}

/**
 * Checks if the operator type is 'equals'.
 */
function isEquals(type: string): boolean {
  return type === 'equals'
}

/**
 * Checks if the operator type is 'not'.
 */
function isNot(type: string): boolean {
  return type === 'not'
}

/**
 * Checks if the operator type is a range comparison.
 */
function isRangeOperator(type: string): boolean {
  return ['gt', 'gte', 'lt', 'lte'].includes(type)
}

/**
 * Checks if the 'not' operator value equals null.
 */
function isNotEqualsNull(val: any): boolean {
  return val?.equals === null
}

/**
 * Checks if the 'not' operator value is undefined.
 */
function isNotEqualsUndefined(val: any): boolean {
  return val?.equals === undefined
}

/**
 * Predicate for empty or not_empty filter types.
 */
function isEmptyOrNotEmpty(type: string): boolean {
  return type === 'empty' || type === 'not_empty'
}

/**
 * Predicate for 'not' filter type.
 */
function isNotFilter(type: string): boolean {
  return type === 'not'
}

/**
 * Predicate for range filter types.
 */
function isRangeFilter(type: string): boolean {
  return ['gt', 'gte', 'lt', 'lte'].includes(type)
}

/**
 * Type for Filter component props, marked as read‑only.
 */
type FilterProps = Readonly<{
  autoFocus?: boolean
  context?: string
  forceValidation?: boolean
  typeLabel?: string
  onChange?: (value: number | null) => void
  type?: string
  value?: number | null
  [key: string]: any
}>

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

        if (isEmptyOrNotEmpty(type ?? '')) return null

        const labelProps =
          context === 'add'
            ? { label: config.label, description: typeLabel }
            : { label: typeLabel }

        const showRequiredError =
          (forceValidation || isDirty) &&
          !validate({ kind: 'update', initial: null, value }, { isRequired: true })

        return (
          <NumberField
            {...otherProps}
            {...labelProps}
            autoFocus={autoFocus}
            errorMessage={showRequiredError ? 'Required' : null}
            step={1}
            width="auto"
            onBlur={() => setDirty(true)}
            onChange={x => onChange?.(!Number.isFinite(x) ? null : x)}
            value={value ?? NaN}
          />
        )
      },

      graphql: ({ type, value }) => {
        if (type === 'empty')
          return { [config.fieldKey]: { equals: null } }
        if (type === 'not_empty')
          return { [config.fieldKey]: { not: { equals: null } } }
        if (isNotFilter(type))
          return { [config.fieldKey]: { not: { equals: value } } }
        return { [config.fieldKey]: { [type]: value } }
      },

      parseGraphQL: value => {
        const entries = entriesTyped(value)
        return entries.flatMap(([type, val]) => {
          if (isEqualsNull(type, val)) {
            return [{ type: 'empty', value: null }]
          }
          if (isFalsy(val)) return []
          if (isEquals(type)) {
            return { type: 'equals', value: val }
          }
          if (isNot(type)) {
            if (isNotEqualsNull(val)) return { type: 'not_empty', value: null }
            if (isNotEqualsUndefined(val)) return []
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

/**
 * Props for the Field component, marked as read‑only.
 */
type FieldComponentProps = Readonly<
  FieldProps<typeof controller>
>

export function Field({
  field,
  value,
  onChange,
  autoFocus,
  forceValidation,
  isRequired,
}: FieldComponentProps) {
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

  const showError = (forceValidation || isDirty) && validate(value)

  return (
    <NumberField
      autoFocus={autoFocus}
      description={field.description}
      label={field.label}
      errorMessage={showError}
      isReadOnly={isReadOnly}
      isRequired={isRequired}
      width="alias.singleLineWidth"
      onBlur={() => setDirty(true)}
      onChange={x => onChange?.({ ...value, value: !Number.isFinite(x) ? null : x })}
      value={value.value ?? NaN}
    />
  )
}