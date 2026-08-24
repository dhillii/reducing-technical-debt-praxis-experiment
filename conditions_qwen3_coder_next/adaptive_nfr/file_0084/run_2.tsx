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
 * Returns true if the value is valid for auto-increment creation.
 */
function isValidAutoIncrementCreate(
  value: Value,
  hasAutoIncrementDefault: boolean
): boolean {
  return value.kind === 'create' && hasAutoIncrementDefault && value.value === null
}

/**
 * Returns true if the value is valid for null update.
 */
function isValidNullUpdate(value: Value): boolean {
  return value.kind === 'update' && value.initial === null && value.value === null
}

/**
 * Returns true if the value is required but missing.
 */
function isRequiredButMissing(value: Value, isRequired: boolean): boolean {
  return isRequired && value.value === null
}

/**
 * Returns true if the value is not a number.
 */
function isNotANumber(value: Value): boolean {
  return typeof value.value !== 'number'
}

/**
 * Returns true if the value is not an integer.
 */
function isNotAnInteger(value: Value): boolean {
  return !Number.isInteger(value.value as number)
}

/**
 * Returns true if the value is below the minimum.
 */
function isBelowMinimum(value: Value, min: number | undefined): boolean {
  return min !== undefined && (value.value as number) < min
}

/**
 * Returns true if the value exceeds the maximum.
 */
function exceedsMaximum(value: Value, max: number | undefined): boolean {
  return max !== undefined && (value.value as number) > max
}

function validate_(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  label: string,
  hasAutoIncrementDefault: boolean
): string | undefined {
  if (isValidAutoIncrementCreate(value, hasAutoIncrementDefault)) return
  if (isValidNullUpdate(value)) return
  if (isRequiredButMissing(value, isRequired)) return `${label} is required`
  if (isNotANumber(value)) return
  const v = value.value as number
  if (isNotAnInteger(value)) return `${label} is not a valid integer`
  if (isBelowMinimum(value, validation.min))
    return `${label} must be greater than or equal to ${validation.min}`
  if (exceedsMaximum(value, validation.max))
    return `${label} must be less than or equal to ${validation.max}`
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