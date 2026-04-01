```typescript
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

/** Check if value should skip validation due to auto-increment default on create */
function shouldSkipAutoIncrementValidation(
  kind: string,
  input: number | null,
  hasAutoIncrementDefault: boolean
): boolean {
  return kind === 'create' && hasAutoIncrementDefault && input === null
}

/** Check if value should skip validation due to null initial and current on update */
function shouldSkipNullUpdateValidation(
  kind: string,
  initial: number | null | undefined,
  input: number | null
): boolean {
  return kind === 'update' && initial === null && input === null
}

/** Check if required field is missing value */
function isRequiredFieldMissing(isRequired: boolean, input: number | null): boolean {
  return isRequired && input === null
}

/** Check if input is not a valid integer */
function isInvalidInteger(input: unknown): boolean {
  return typeof input === 'number' && !Number.isInteger(input)
}

/** Check if value violates minimum constraint */
function violatesMinConstraint(value: number, min: number | undefined): boolean {
  return min !== undefined && value < min
}

/** Check if value violates maximum constraint */
function violatesMaxConstraint(value: number, max: number | undefined): boolean {
  return max !== undefined && value > max
}

function validate_(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  label: string,
  hasAutoIncrementDefault: boolean
): string | undefined {
  const { value: input, kind } = value

  if (shouldSkipAutoIncrementValidation(kind, input, hasAutoIncrementDefault)) {
    return
  }

  if (shouldSkipNullUpdateValidation(kind, 'initial' in value ? value.initial : undefined, input)) {
    return
  }

  if (isRequiredFieldMissing(isRequired, input)) {
    return `${label} is required`
  }

  if (typeof input !== 'number') {
    return
  }

  if (isInvalidInteger(input)) {
    return `${label} is not a valid integer`
  }

  if (violatesMinConstraint(input, validation.min)) {
    return `${label} must be greater than or equal to ${validation.min}`
  }

  if (violatesMaxConstraint(input, validation.max)) {
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
  const hasAutoIncrementDefault = config.fieldMeta.defaultValue === 'autoincrement'

  const validate = (value: Value, opts: { isRequired: boolean }) => {
    return validate_(
      value,
      config.fieldMeta.validation,
      opts.isRequired,
      config.label,
      hasAutoIncrementDefault
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
      value: hasAutoIncrementDefault ? null : config.fieldMeta.defaultValue,
    },
    deserialize: data => ({
      kind: 'update',
      value: data[config.fieldKey],
      initial: data[config.fieldKey],
    }),
    serialize: value => ({ [config.fieldKey]: value.value }),
    hasAutoIncrementDefault,
    validate: (value, opts) => validate(value, opts) === undefined,
    filter: {
      Filter(props: Readonly<{
        autoFocus?: boolean
        context?: string
        forceValidation?: boolean
        typeLabel?: string
        onChange?: (value: number | null) => void
        type?: string
        value?: number | null
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

      Label({ label, type, value }: Readonly<{
        label: string
        type: string
        value: number | null
      }>) {
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
```