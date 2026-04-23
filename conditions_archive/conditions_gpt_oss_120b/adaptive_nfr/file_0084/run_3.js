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
 * Guard: creation with auto‑increment default and null input.
 */
function isCreateWithAutoIncrementAndNull(
  value: Value,
  hasAutoIncrementDefault: boolean
): boolean {
  return value.kind === 'create' && hasAutoIncrementDefault && value.value === null
}

/**
 * Guard: update where both initial and input are null.
 */
function isUpdateWithBothNull(value: Value): boolean {
  return value.kind === 'update' && value.initial === null && value.value === null
}

/**
 * Guard: required field with null input.
 */
function isRequiredAndNull(value: Value, isRequired: boolean): boolean {
  return isRequired && value.value === null
}

/**
 * Guard: input is not a number.
 */
function isNotNumber(value: Value): boolean {
  return typeof value.value !== 'number'
}

/**
 * Guard: input is not an integer.
 */
function isNotInteger(v: number): boolean {
  return !Number.isInteger(v)
}

/**
 * Guard: value below minimum.
 */
function isBelowMin(v: number, min: number): boolean {
  return v < min
}

/**
 * Guard: value above maximum.
 */
function isAboveMax(v: number, max: number): boolean {
  return v > max
}

/**
 * Validate a numeric field according to the provided rules.
 */
function validate_(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  label: string,
  hasAutoIncrementDefault: boolean
): string | undefined {
  if (isCreateWithAutoIncrementAndNull(value, hasAutoIncrementDefault)) return
  if (isUpdateWithBothNull(value)) return
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
 * Guard: GraphQL type is 'equals' with null value.
 */
function isEqualsNull(type: string, value: any): boolean {
  return type === 'equals' && value === null
}

/**
 * Guard: GraphQL value is falsy (null/undefined/0/'' etc.).
 */
function isFalsy(value: any): boolean {
  return !value
}

/**
 * Guard: GraphQL type is 'equals'.
 */
function isEquals(type: string): boolean {
  return type === 'equals'
}

/**
 * Guard: GraphQL type is 'not'.
 */
function isNot(type: string): boolean {
  return type === 'not'
}

/**
 * Guard: GraphQL type is a comparison operator.
 */
function isComparisonOperator(type: string): boolean {
  return ['gt', 'gte', 'lt', 'lte'].includes(type)
}

/**
 * Compute the error message for the filter field.
 */
function getFilterErrorMessage(
  forceValidation: boolean,
  isDirty: boolean,
  value: number | null,
  validate: (v: Value) => string | undefined
): string | null {
  if (!(forceValidation || isDirty)) return null
  const error = validate({ kind: 'update', initial: null, value })
  return error ? 'Required' : null
}

/**
 * Props for the Filter component are read‑only.
 */
type FilterProps = Readonly<{
  autoFocus?: boolean
  context?: string
  forceValidation?: boolean
  typeLabel?: string
  onChange?: (value: number | null) => void
  type: string
  value: number | null
  [key: string]: any
}>

/**
 * Props for the Field component are read‑only.
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

        if (type === 'empty' || type === 'not_empty') return null

        const labelProps =
          context === 'add'
            ? { label: config.label, description: typeLabel }
            : { label: typeLabel }

        const errorMessage = getFilterErrorMessage(
          !!forceValidation,
          false,
          value,
          v => validate(v, { isRequired: true })
        )

        return (
          <NumberField
            {...otherProps}
            {...labelProps}
            autoFocus={autoFocus}
            errorMessage={errorMessage}
            step={1}
            width="auto"
            onBlur={() => {}}
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
        if (type === 'not')
          return { [config.fieldKey]: { not: { equals: value } } }
        return { [config.fieldKey]: { [type]: value } }
      },

      parseGraphQL: value => {
        return entriesTyped(value).flatMap(([type, val]) => {
          if (isEqualsNull(type, val)) {
            return [{ type: 'empty', value: null }]
          }
          if (isFalsy(val)) return []
          if (isEquals(type)) return [{ type: 'equals', value: val }]
          if (isNot(type)) {
            if ((val as any)?.equals === null) return { type: 'not_empty', value: null }
            if ((val as any)?.equals === undefined) return []
            return { type: 'not', value: (val as any).equals }
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

  const validate = (v: Value) => {
    return validate_(
      v,
      field.validation,
      isRequired,
      field.label,
      field.hasAutoIncrementDefault
    )
  }

  const errorMessage = (forceValidation || isDirty) && validate(value)

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