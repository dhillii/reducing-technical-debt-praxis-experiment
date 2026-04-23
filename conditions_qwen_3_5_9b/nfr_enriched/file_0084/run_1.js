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

function validateValue(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  label: string,
  hasAutoIncrementDefault: boolean
): string | undefined {
  const { value: input, kind } = value
  if (kind === 'create' && hasAutoIncrementDefault && input === null) return
  if (kind === 'update' && value.initial === null && input === null) return
  if (isRequired && input === null) return `${label} is required`
  if (typeof input !== 'number') return
  const v = input
  if (!Number.isInteger(v)) return `${label} is not a valid integer`
  if (validation.min !== undefined && v < validation.min)
    return `${label} must be greater than or equal to ${validation.min}`
  if (validation.max !== undefined && v > validation.max)
    return `${label} must be less than or equal to ${validation.max}`
}

function createFilterBuilder(config: FieldControllerConfig<{
  validation: Validation
  defaultValue: number | null | 'autoincrement'
}>) {
  const fieldKey = config.fieldKey
  const label = config.label
  const description = config.description
  const validation = config.fieldMeta.validation
  const hasAutoIncrementDefault = config.fieldMeta.defaultValue === 'autoincrement'

  return {
    fieldKey,
    label,
    description,
    graphqlSelection: fieldKey,
    validation,
    defaultValue: {
      kind: 'create',
      value: hasAutoIncrementDefault ? null : config.fieldMeta.defaultValue,
    },
    deserialize: (data: Record<string, unknown>) => ({
      kind: 'update',
      value: data[fieldKey],
      initial: data[fieldKey],
    }),
    serialize: (value: Value) => ({ [fieldKey]: value.value }),
    hasAutoIncrementDefault,
    validate: (value: Value, opts: { isRequired: boolean }) => {
      const error = validateValue(
        value,
        validation,
        opts.isRequired,
        label,
        hasAutoIncrementDefault
      )
      return error === undefined
    },
    filter: {
      Filter(props: any) {
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
          context === 'add' ? { label, description: typeLabel } : { label: typeLabel }

        return (
          <NumberField
            {...otherProps}
            {...labelProps}
            autoFocus={autoFocus}
            errorMessage={
              (forceValidation || isDirty) &&
              !validateValue(
                { kind: 'update', initial: null, value },
                validation,
                true,
                label,
                hasAutoIncrementDefault
              )
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

      graphql: ({ type, value }: { type: string; value: unknown }) => {
        if (type === 'empty') return { [fieldKey]: { equals: null } }
        if (type === 'not_empty') return { [fieldKey]: { not: { equals: null } } }
        if (type === 'not') return { [fieldKey]: { not: { equals: value } } }
        return { [fieldKey]: { [type]: value } }
      },
      parseGraphQL: (value: Record<string, unknown>) => {
        return entriesTyped(value).flatMap(([type, val]) => {
          if (type === 'equals' && val === null) {
            return [{ type: 'empty', value: null }]
          }
          if (!val) return []
          if (type === 'equals') return { type: 'equals', value: val }
          if (type === 'not') {
            if (val?.equals === null) return { type: 'not_empty', value: null }
            if (val?.equals === undefined) return []
            return { type: 'not', value: val.equals }
          }
          if (type === 'gt' || type === 'gte' || type === 'lt' || type === 'lte') {
            return { type, value: val }
          }
          return []
        })
      },
      Label({ label, type, value }: { label: string; type: string; value: unknown }) {
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

export function controller(
  config: FieldControllerConfig<{
    validation: Validation
    defaultValue: number | null | 'autoincrement'
  }>
): FieldController<Value, number | null, SimpleFieldTypeInfo<'Int'>['inputs']['where']> & {
  validation: Validation
  hasAutoIncrementDefault: boolean
} {
  return createFilterBuilder(config)
}

function FieldComponent({
  field,
  value,
  onChange,
  autoFocus,
  forceValidation,
  isRequired,
}: FieldProps<typeof controller>) {
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
    return validateValue(
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

export function Field({
  field,
  value,
  onChange,
  autoFocus,
  forceValidation,
  isRequired,
}: FieldProps<typeof controller>) {
  return FieldComponent({ field, value, onChange, autoFocus, forceValidation, isRequired })
}