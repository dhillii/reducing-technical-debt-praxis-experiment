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
 * Validates the given value against the provided validation rules.
 * @param value The value to validate.
 * @param validation The validation rules.
 * @param isRequired Whether the field is required.
 * @param label The label of the field.
 * @param hasAutoIncrementDefault Whether the field has an auto-increment default.
 * @returns An error message if the value is invalid, or undefined if it's valid.
 */
function validate_(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  label: string,
  hasAutoIncrementDefault: boolean
): string | undefined {
  const { value: input, kind } = value
  if (isAutoIncrementDefaultAndCreate(kind, hasAutoIncrementDefault, input)) return
  if (isUpdateAndNull(kind, value.initial, input)) return
  if (isRequiredAndNull(isRequired, input)) return `${label} is required`
  if (!isValidNumber(input)) return
  const v = input
  if (!isInteger(v)) return `${label} is not a valid integer`
  if (isBelowMin(validation.min, v)) return `${label} must be greater than or equal to ${validation.min}`
  if (isAboveMax(validation.max, v)) return `${label} must be less than or equal to ${validation.max}`
}

/**
 * Checks if the value is an auto-increment default and create.
 * @param kind The kind of the value.
 * @param hasAutoIncrementDefault Whether the field has an auto-increment default.
 * @param input The input value.
 * @returns Whether the value is an auto-increment default and create.
 */
function isAutoIncrementDefaultAndCreate(
  kind: 'create' | 'update',
  hasAutoIncrementDefault: boolean,
  input: number | null
): boolean {
  return kind === 'create' && hasAutoIncrementDefault && input === null
}

/**
 * Checks if the value is an update and null.
 * @param kind The kind of the value.
 * @param initial The initial value.
 * @param input The input value.
 * @returns Whether the value is an update and null.
 */
function isUpdateAndNull(
  kind: 'create' | 'update',
  initial: number | null,
  input: number | null
): boolean {
  return kind === 'update' && initial === null && input === null
}

/**
 * Checks if the field is required and the input is null.
 * @param isRequired Whether the field is required.
 * @param input The input value.
 * @returns Whether the field is required and the input is null.
 */
function isRequiredAndNull(isRequired: boolean, input: number | null): boolean {
  return isRequired && input === null
}

/**
 * Checks if the input is a valid number.
 * @param input The input value.
 * @returns Whether the input is a valid number.
 */
function isValidNumber(input: number | null): boolean {
  return typeof input === 'number'
}

/**
 * Checks if the input is an integer.
 * @param input The input value.
 * @returns Whether the input is an integer.
 */
function isInteger(input: number): boolean {
  return Number.isInteger(input)
}

/**
 * Checks if the input is below the minimum value.
 * @param min The minimum value.
 * @param input The input value.
 * @returns Whether the input is below the minimum value.
 */
function isBelowMin(min: number | undefined, input: number): boolean {
  return min !== undefined && input < min
}

/**
 * Checks if the input is above the maximum value.
 * @param max The maximum value.
 * @param input The input value.
 * @returns Whether the input is above the maximum value.
 */
function isAboveMax(max: number | undefined, input: number): boolean {
  return max !== undefined && input > max
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
      Filter(props) {
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
}: FieldProps<typeof controller>) {
  const [isDirty, setDirty] = useState(false)
  const isReadOnly = !onChange || field.hasAutoIncrementDefault

  if (isAutoIncrementDefaultAndCreate(value.kind, field.hasAutoIncrementDefault, value.value)) {
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