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
 * Checks if a create operation with auto‑increment default has a null value.
 */
function isAutoIncrementCreateNull(value: Value, hasAutoIncrementDefault: boolean): boolean {
  const { kind, value: input } = value
  return kind === 'create' && hasAutoIncrementDefault && input === null
}

/**
 * Checks if an update operation with a null initial and null input should be ignored.
 */
function isUpdateNull(value: Value): boolean {
  return value.kind === 'update' && value.initial === null && value.value === null
}

/**
 * Determines whether the field is required but the input is null.
 */
function isMissingRequired(input: number | null, isRequired: boolean): boolean {
  return isRequired && input === null
}

/**
 * Determines whether the input is not a number.
 */
function isNotNumber(input: unknown): boolean {
  return typeof input !== 'number'
}

/**
 * Determines whether the number is not an integer.
 */
function isNotInteger(num: number): boolean {
  return !Number.isInteger(num)
}

/**
 * Determines whether the number is below the minimum validation bound.
 */
function isBelowMin(num: number, min: number | undefined): boolean {
  return min !== undefined && num < min
}

/**
 * Determines whether the number is above the maximum validation bound.
 */
function isAboveMax(num: number, max: number | undefined): boolean {
  return max !== undefined && num > max
}

/**
 * Validates a numeric value according to the provided rules.
 */
function validate_(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  label: string,
  hasAutoIncrementDefault: boolean
): string | undefined {
  const { value: input } = value

  if (isAutoIncrementCreateNull(value, hasAutoIncrementDefault)) return
  if (isUpdateNull(value)) return
  if (isMissingRequired(input, isRequired)) return `${label} is required`
  if (isNotNumber(input)) return

  const num = input as number
  if (isNotInteger(num)) return `${label} is not a valid integer`
  if (isBelowMin(num, validation.min))
    return `${label} must be greater than or equal to ${validation.min}`
  if (isAboveMax(num, validation.max))
    return `${label} must be less than or equal to ${validation.max}`
}

/**
 * Determines whether a GraphQL filter type/value pair represents an empty filter.
 */
function isEmptyFilter(type: string): boolean {
  return type === 'empty'
}

/**
 * Determines whether a GraphQL filter type/value pair represents a non‑empty filter.
 */
function isNotEmptyFilter(type: string): boolean {
  return type === 'not_empty'
}

/**
 * Determines whether a GraphQL filter type/value pair represents a negated equality.
 */
function isNegatedEquality(type: string, value: unknown): boolean {
  return type === 'not' && typeof value === 'object' && value !== null && 'equals' in value
}

/**
 * Parses a GraphQL filter object into internal filter representations.
 */
function parseGraphQLEntry([type, value]: [string, any]): any {
  if (type === 'equals' && value === null) {
    return { type: 'empty', value: null }
  }
  if (!value) return null
  if (type === 'equals') {
    return { type: 'equals', value }
  }
  if (type === 'not') {
    if (value?.equals === null) return { type: 'not_empty', value: null }
    if (value?.equals === undefined) return null
    return { type: 'not', value: value.equals }
  }
  if (['gt', 'gte', 'lt', 'lte'].includes(type)) {
    return { type, value }
  }
  return null
}

/**
 * Returns the appropriate error message for the filter component.
 */
function getFilterErrorMessage(
  forceValidation: boolean,
  isDirty: boolean,
  validateFn: () => boolean
): string | null {
  if ((forceValidation || isDirty) && !validateFn()) {
    return 'Required'
  }
  return null
}

/**
 * Returns the appropriate error message for the field component.
 */
function getFieldErrorMessage(
  forceValidation: boolean,
  isDirty: boolean,
  message: string | undefined
): string | undefined {
  return (forceValidation || isDirty) ? message : undefined
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
        const [isDirty, setDirty] = useState(false)

        if (isEmptyFilter(type) || isNotEmptyFilter(type)) return null

        const labelProps =
          context === 'add'
            ? { label: config.label, description: typeLabel }
            : { label: typeLabel }

        const errorMessage = getFilterErrorMessage(
          forceValidation,
          isDirty,
          () =>
            !validate(
              { kind: 'update', initial: null, value },
              { isRequired: true }
            )
        )

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
        if (type === 'empty') return { [config.fieldKey]: { equals: null } }
        if (type === 'not_empty') return { [config.fieldKey]: { not: { equals: null } } }
        if (type === 'not') return { [config.fieldKey]: { not: { equals: value } } }
        return { [config.fieldKey]: { [type]: value } }
      },

      parseGraphQL: value => {
        return entriesTyped(value)
          .flatMap(entry => {
            const result = parseGraphQLEntry(entry)
            return result ? [result] : []
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

export function Field(props: Readonly<FieldProps<typeof controller>>) {
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

  const errorMessage = getFieldErrorMessage(
    forceValidation,
    isDirty,
    validate(value)
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