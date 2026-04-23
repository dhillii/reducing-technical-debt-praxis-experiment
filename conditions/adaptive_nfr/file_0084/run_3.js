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

/** Check if value should skip validation due to auto-increment default on create */
function shouldSkipAutoIncrementValidation(
  value: Value,
  hasAutoIncrementDefault: boolean
): boolean {
  return value.kind === 'create' && hasAutoIncrementDefault && value.value === null
}

/** Check if value should skip validation due to unchanged null on update */
function shouldSkipUnchangedNullValidation(value: Value): boolean {
  return value.kind === 'update' && value.initial === null && value.value === null
}

/** Check if required field is missing value */
function isRequiredFieldMissing(value: Value, isRequired: boolean): boolean {
  return isRequired && value.value === null
}

/** Check if value is not a valid integer */
function isInvalidInteger(value: Value): boolean {
  if (typeof value.value !== 'number') return false
  return !Number.isInteger(value.value)
}

/** Check if value violates minimum constraint */
function violatesMinConstraint(value: Value, validation: Validation): boolean {
  if (typeof value.value !== 'number') return false
  if (validation.min === undefined) return false
  return value.value < validation.min
}

/** Check if value violates maximum constraint */
function violatesMaxConstraint(value: Value, validation: Validation): boolean {
  if (typeof value.value !== 'number') return false
  if (validation.max === undefined) return false
  return value.value > validation.max
}

function validate_(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  label: string,
  hasAutoIncrementDefault: boolean
): string | undefined {
  if (shouldSkipAutoIncrementValidation(value, hasAutoIncrementDefault)) {
    return
  }

  if (shouldSkipUnchangedNullValidation(value)) {
    return
  }

  if (isRequiredFieldMissing(value, isRequired)) {
    return `${label} is required`
  }

  if (isInvalidInteger(value)) {
    return `${label} is not a valid integer`
  }

  if (violatesMinConstraint(value, validation)) {
    return `${label} must be greater than or equal to ${validation.min}`
  }

  if (violatesMaxConstraint(value, validation)) {
    return `${label} must be less than or equal to ${validation.max}`
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
      Filter(props: Readonly<Parameters<typeof NumberField>[0] & {
        autoFocus?: boolean
        context?: string
        forceValidation?: boolean
        typeLabel?: string
        onChange?: (value: number | null) => void
        type?: string
        value?: number | null
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

        if (type === 'empty' || type === 'not_empty') {
          return null
        }

        const labelProps =
          context === 'add' ? { label: config.label, description: typeLabel } : { label: typeLabel }

        const isInvalid =
          (forceValidation || isDirty) &&
          !validate({ kind: 'update', initial: null, value }, { isRequired: true })

        return (
          <NumberField
            {...otherProps}
            {...labelProps}
            autoFocus={autoFocus}
            errorMessage={isInvalid ? 'Required' : null}
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

      Label({ label, type, value }: Readonly<{ label: string; type: string; value: number }>) {
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

  const validate = (val: Value) => {
    return validate_(
      val,
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