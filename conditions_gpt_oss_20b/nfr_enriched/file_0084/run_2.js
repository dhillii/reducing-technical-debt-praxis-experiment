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
 * Creates the Filter component used in the controller's filter object.
 * It renders a NumberField with validation logic based on the controller config.
 */
function createFilterComponent(
  config: FieldControllerConfig<{
    validation: Validation
    defaultValue: number | null | 'autoincrement'
  }>
) {
  return function Filter(props: {
    autoFocus?: boolean
    context: string
    forceValidation?: boolean
    typeLabel: string
    onChange?: (value: number | null) => void
    type: string
    value: number | null
    [key: string]: any
  }) {
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

    return (
      <NumberField
        {...otherProps}
        {...labelProps}
        autoFocus={autoFocus}
        errorMessage={
          (forceValidation || isDirty) &&
          !validate_(
            { kind: 'update', initial: null, value },
            config.fieldMeta.validation,
            true,
            config.label,
            config.fieldMeta.defaultValue === 'autoincrement'
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
  }
}

/**
 * Creates the graphql filter function used in the controller's filter object.
 */
function createGraphqlFilter(
  config: FieldControllerConfig<{
    validation: Validation
    defaultValue: number | null | 'autoincrement'
  }>
) {
  return function graphql({ type, value }: { type: string; value: number | null }) {
    if (type === 'empty') return { [config.fieldKey]: { equals: null } }
    if (type === 'not_empty') return { [config.fieldKey]: { not: { equals: null } } }
    if (type === 'not') return { [config.fieldKey]: { not: { equals: value } } }
    return { [config.fieldKey]: { [type]: value } }
  }
}

/**
 * Parses GraphQL filter values into the controller's internal representation.
 */
function parseGraphQL(value: any) {
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
}

/**
 * Creates the Label function used in the controller's filter object.
 */
function createLabel() {
  return function Label({ label, type, value }: { label: string; type: string; value: number | null }) {
    if (type === 'empty' || type === 'not_empty') return label.toLocaleLowerCase()
    const operator = TYPE_OPERATOR_MAP[type as keyof typeof TYPE_OPERATOR_MAP]
    return `${operator} ${value}`
  }
}

/**
 * Static filter type definitions.
 */
const filterTypes = {
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

  const Filter = createFilterComponent(config)
  const graphql = createGraphqlFilter(config)
  const Label = createLabel()

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
      Filter,
      graphql,
      parseGraphQL,
      Label,
      types: filterTypes,
    },
  }
}

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