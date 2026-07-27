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

/** Validates that a value is not null when required. */
function isRequiredButEmpty(input: number | null, isRequired: boolean): boolean {
  return isRequired && input === null
}

/** Validates that a value is an integer. */
function isNotInteger(input: number): boolean {
  return !Number.isInteger(input)
}

/** Validates that a value meets minimum constraint. */
function isBelowMinimum(input: number, min: number | undefined): boolean {
  return min !== undefined && input < min
}

/** Validates that a value exceeds maximum constraint. */
function isAboveMaximum(input: number, max: number | undefined): boolean {
  return max !== undefined && input > max
}

/** Validates that auto-increment create values are null. */
function shouldSkipAutoIncrementValidation(
  kind: string,
  hasAutoIncrementDefault: boolean,
  input: number | null
): boolean {
  return kind === 'create' && hasAutoIncrementDefault && input === null
}

/** Validates that update values with null initial and null current are valid. */
function shouldSkipNullUpdateValidation(kind: string, initial: number | null, input: number | null): boolean {
  return kind === 'update' && initial === null && input === null
}

function validate_(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  label: string,
  hasAutoIncrementDefault: boolean
): string | undefined {
  const { value: input, kind } = value

  if (shouldSkipAutoIncrementValidation(kind, hasAutoIncrementDefault, input)) {
    return
  }

  if (shouldSkipNullUpdateValidation(kind, value.kind === 'update' ? value.initial : null, input)) {
    return
  }

  if (isRequiredButEmpty(input, isRequired)) {
    return `${label} is required`
  }

  if (typeof input !== 'number') {
    return
  }

  const v = input

  if (isNotInteger(v)) {
    return `${label} is not a valid integer`
  }

  if (isBelowMinimum(v, validation.min)) {
    return `${label} must be greater than or equal to ${validation.min}`
  }

  if (isAboveMaximum(v, validation.max)) {
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
      Filter(props: Readonly<{
        autoFocus?: boolean
        context?: string
        forceValidation?: boolean
        typeLabel?: string
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

        if (type === 'empty' || type === 'not_empty') {
          return null
        }

        const labelProps =
          context === 'add' ? { label: config.label, description: typeLabel } : { label: typeLabel }

        const isInvalid = forceValidation || isDirty
        const validationError = !validate({ kind: 'update', initial: null, value }, { isRequired: true })
        const errorMessage = isInvalid && validationError ? 'Required' : null

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

/** Determines if field should be read-only. */
function isFieldReadOnly(onChange: unknown, hasAutoIncrementDefault: boolean): boolean {
  return !onChange || hasAutoIncrementDefault
}

/** Determines if auto-increment create state should be rendered. */
function shouldRenderAutoIncrementCreate(hasAutoIncrementDefault: boolean, valueKind: string): boolean {
  return hasAutoIncrementDefault && valueKind === 'create'
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
  const isReadOnly = isFieldReadOnly(onChange, field.hasAutoIncrementDefault)

  if (shouldRenderAutoIncrementCreate(field.hasAutoIncrementDefault, value.kind)) {
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

  const isInvalid = forceValidation || isDirty
  const validationError = validate(value)
  const errorMessage = isInvalid ? validationError : undefined

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