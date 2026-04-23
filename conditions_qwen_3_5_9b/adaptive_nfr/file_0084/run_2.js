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

function validate_(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  label: string,
  hasAutoIncrementDefault: boolean
): string | undefined {
  const { value: input, kind } = value

  if (kind === 'create' && hasAutoIncrementDefault && input === null) {
    return
  }

  if (kind === 'update' && value.initial === null && input === null) {
    return
  }

  if (isRequired && input === null) {
    return `${label} is required`
  }

  if (typeof input !== 'number') {
    return
  }

  const v = input

  if (!Number.isInteger(v)) {
    return `${label} is not a valid integer`
  }

  if (validation.min !== undefined && v < validation.min) {
    return `${label} must be greater than or equal to ${validation.min}`
  }

  if (validation.max !== undefined && v > validation.max) {
    return `${label} must be less than or equal to ${validation.max}`
  }
}

function isAutoIncrementCreate(value: Value, hasAutoIncrementDefault: boolean): boolean {
  return value.kind === 'create' && hasAutoIncrementDefault
}

function isUpdateWithNullInitial(value: Value): boolean {
  return value.kind === 'update' && value.initial === null
}

function isUpdateWithNullValue(value: Value): boolean {
  return value.kind === 'update' && value.value === null
}

function isValueNull(value: Value): boolean {
  return value.value === null
}

function isValueNotFinite(value: number): boolean {
  return !Number.isFinite(value)
}

function isValueInteger(value: number): boolean {
  return Number.isInteger(value)
}

function isValueInRange(value: number, validation: Validation): boolean {
  if (validation.min !== undefined && value < validation.min) {
    return false
  }
  if (validation.max !== undefined && value > validation.max) {
    return false
  }
  return true
}

function isValueValidInteger(value: number): boolean {
  return isValueInteger(value)
}

function isValueRequired(value: Value, isRequired: boolean): boolean {
  return isRequired && isValueNull(value)
}

function isValueInvalidType(value: Value): boolean {
  return typeof value.value !== 'number'
}

function isValueOutOfRange(value: number, validation: Validation): boolean {
  return !isValueInRange(value, validation)
}

function getErrorMessage(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  label: string,
  hasAutoIncrementDefault: boolean
): string | undefined {
  if (isAutoIncrementCreate(value, hasAutoIncrementDefault)) {
    return
  }

  if (isUpdateWithNullInitial(value) && isValueNull(value)) {
    return
  }

  if (isValueRequired(value, isRequired)) {
    return `${label} is required`
  }

  if (isValueInvalidType(value)) {
    return
  }

  const v = value.value

  if (!isValueValidInteger(v)) {
    return `${label} is not a valid integer`
  }

  if (isValueOutOfRange(v, validation)) {
    if (validation.min !== undefined && v < validation.min) {
      return `${label} must be greater than or equal to ${validation.min}`
    }
    if (validation.max !== undefined && v > validation.max) {
      return `${label} must be less than or equal to ${validation.max}`
    }
  }
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
    return getErrorMessage(
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

        if (type === 'empty' || type === 'not_empty') {
          return null
        }

        const [isDirty, setDirty] = useState(false)

        const labelProps =
          context === 'add'
            ? { label: config.label, description: typeLabel }
            : { label: typeLabel }

        const shouldValidate = forceValidation || isDirty

        const validationError =
          shouldValidate &&
          !validate({ kind: 'update', initial: null, value }, { isRequired: true })

        return (
          <NumberField
            {...otherProps}
            {...labelProps}
            autoFocus={autoFocus}
            errorMessage={validationError ? 'Required' : null}
            step={1}
            width="auto"
            onBlur={() => setDirty(true)}
            onChange={x => onChange?.(!Number.isFinite(x) ? null : x)}
            value={value ?? NaN}
          />
        )
      },

      graphql: ({ type, value }) => {
        if (type === 'empty') {
          return { [config.fieldKey]: { equals: null } }
        }
        if (type === 'not_empty') {
          return { [config.fieldKey]: { not: { equals: null } } }
        }
        if (type === 'not') {
          return { [config.fieldKey]: { not: { equals: value } } }
        }
        return { [config.fieldKey]: { [type]: value } }
      },
      parseGraphQL: value => {
        return entriesTyped(value).flatMap(([type, value]) => {
          if (type === 'equals' && value === null) {
            return [{ type: 'empty', value: null }]
          }
          if (!value) {
            return []
          }
          if (type === 'equals') {
            return { type: 'equals', value }
          }
          if (type === 'not') {
            if (value?.equals === null) {
              return { type: 'not_empty', value: null }
            }
            if (value?.equals === undefined) {
              return []
            }
            return { type: 'not', value: value.equals }
          }
          if (type === 'gt' || type === 'gte' || type === 'lt' || type === 'lte') {
            return { type, value }
          }
          return []
        })
      },
      Label({ label, type, value }) {
        if (type === 'empty' || type === 'not_empty') {
          return label.toLocaleLowerCase()
        }
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

  if (isAutoIncrementCreate(value, field.hasAutoIncrementDefault)) {
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
    return getErrorMessage(
      value,
      field.validation,
      isRequired,
      field.label,
      field.hasAutoIncrementDefault
    )
  }

  const shouldValidate = forceValidation || isDirty
  const validationError = shouldValidate && validate(value)

  return (
    <NumberField
      autoFocus={autoFocus}
      description={field.description}
      label={field.label}
      errorMessage={validationError}
      isReadOnly={isReadOnly}
      isRequired={isRequired}
      width="alias.singleLineWidth"
      onBlur={() => setDirty(true)}
      onChange={x => onChange?.({ ...value, value: !Number.isFinite(x) ? null : x })}
      value={value.value ?? NaN}
    />
  )
}