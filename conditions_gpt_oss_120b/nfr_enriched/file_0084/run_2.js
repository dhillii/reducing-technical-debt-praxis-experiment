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
 * Core validation logic for integer fields.
 */
function validate_(
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

/**
 * Convert GraphQL filter objects into internal filter descriptors.
 */
function parseGraphQLFilter(value: Record<string, any>) {
  const result: Array<{ type: string; value: any }> = []
  for (const [type, val] of Object.entries(value)) {
    if (type === 'equals' && val === null) {
      result.push({ type: 'empty', value: null })
      continue
    }
    if (!val) continue
    if (type === 'equals') {
      result.push({ type: 'equals', value: val })
      continue
    }
    if (type === 'not') {
      if (val?.equals === null) {
        result.push({ type: 'not_empty', value: null })
      } else if (val?.equals !== undefined) {
        result.push({ type: 'not', value: val.equals })
      }
      continue
    }
    if (['gt', 'gte', 'lt', 'lte'].includes(type)) {
      result.push({ type, value: val })
    }
  }
  return result
}

/**
 * Build a controller for integer fields.
 */
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

  const Filter = (props: Readonly<{
    autoFocus?: boolean
    context: string
    forceValidation?: boolean
    typeLabel: string
    onChange?: (value: number | null) => void
    type: string
    value: number | null
    [key: string]: any
  }>) => {
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
      context === 'add'
        ? { label: config.label, description: typeLabel }
        : { label: typeLabel }

    const showError =
      (forceValidation || isDirty) &&
      !validate({ kind: 'update', initial: null, value }, { isRequired: true })

    return (
      <NumberField
        {...otherProps}
        {...labelProps}
        autoFocus={autoFocus}
        errorMessage={showError ? 'Required' : null}
        step={1}
        width="auto"
        onBlur={() => setDirty(true)}
        onChange={x => onChange?.(!Number.isFinite(x) ? null : x)}
        value={value ?? NaN}
      />
    )
  }

  const graphql = ({ type, value }: { type: string; value: any }) => {
    if (type === 'empty') return { [config.fieldKey]: { equals: null } }
    if (type === 'not_empty') return { [config.fieldKey]: { not: { equals: null } } }
    if (type === 'not') return { [config.fieldKey]: { not: { equals: value } } }
    return { [config.fieldKey]: { [type]: value } }
  }

  const Label = ({
    label,
    type,
    value,
  }: Readonly<{ label: string; type: string; value: any }>) => {
    if (type === 'empty' || type === 'not_empty') return label.toLocaleLowerCase()
    const operator = TYPE_OPERATOR_MAP[type as keyof typeof TYPE_OPERATOR_MAP]
    return `${operator} ${value}`
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
      Filter,
      graphql,
      parseGraphQL: parseGraphQLFilter,
      Label,
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
 * Render an integer field UI component.
 */
export function Field(
  props: Readonly<FieldProps<typeof controller>>
) {
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