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

const FILTER_TYPES = {
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
} as const

type Value =
  | { kind: 'create'; value: number | null }
  | { kind: 'update'; initial: number | null; value: number | null }

type Validation = {
  min: number
  max: number
}

/**
 * Validates a numeric value against the provided validation rules.
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
 * Creates the default value for the controller.
 */
function createDefaultValue(
  config: FieldControllerConfig<{
    validation: Validation
    defaultValue: number | null | 'autoincrement'
  }>
) {
  return {
    kind: 'create',
    value:
      config.fieldMeta.defaultValue === 'autoincrement'
        ? null
        : config.fieldMeta.defaultValue,
  }
}

/**
 * Creates the deserialize function for the controller.
 */
function createDeserialize(
  config: FieldControllerConfig<{
    validation: Validation
    defaultValue: number | null | 'autoincrement'
  }>
) {
  return (data: Record<string, unknown>) => ({
    kind: 'update',
    value: data[config.fieldKey],
    initial: data[config.fieldKey],
  })
}

/**
 * Creates the serialize function for the controller.
 */
function createSerialize(
  config: FieldControllerConfig<{
    validation: Validation
    defaultValue: number | null | 'autoincrement'
  }>
) {
  return (value: Value) => ({ [config.fieldKey]: value.value })
}

/**
 * Creates the validate function for the controller.
 */
function createValidate(
  config: FieldControllerConfig<{
    validation: Validation
    defaultValue: number | null | 'autoincrement'
  }>
) {
  return (value: Value, opts: { isRequired: boolean }) => {
    return validate_(
      value,
      config.fieldMeta.validation,
      opts.isRequired,
      config.label,
      config.fieldMeta.defaultValue === 'autoincrement'
    )
  }
}

/**
 * Builds a GraphQL filter object for a given type and value.
 */
function buildGraphQLFilter(
  type: string,
  value: unknown,
  fieldKey: string
): Record<string, unknown> {
  if (type === 'empty')
    return { [fieldKey]: { equals: null } }
  if (type === 'not_empty')
    return { [fieldKey]: { not: { equals: null } } }
  if (type === 'not')
    return { [fieldKey]: { not: { equals: value } } }
  return { [fieldKey]: { [type]: value } }
}

/**
 * Parses a GraphQL filter value into an array of filter objects.
 */
function parseGraphQLValue(value: unknown): Array<{
  type: string
  value: unknown
}> {
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
    if (['gt', 'gte', 'lt', 'lte'].includes(type))
      return { type, value: val }
    return []
  })
}

/**
 * Generates the label text for a filter based on its type and value.
 */
function getLabelText(
  type: string,
  value: unknown,
  label: string
): string {
  if (type === 'empty' || type === 'not_empty')
    return label.toLocaleLowerCase()
  const operator = TYPE_OPERATOR_MAP[type as keyof typeof TYPE_OPERATOR_MAP]
  return `${operator} ${value}`
}

/**
 * Creates the filter object for the controller.
 */
function createFilter(
  config: FieldControllerConfig<{
    validation: Validation
    defaultValue: number | null | 'autoincrement'
  }>,
  validate: (value: Value, opts: { isRequired: boolean }) => string | undefined
) {
  return {
    Filter(props: {
      autoFocus?: boolean
      context?: string
      forceValidation?: boolean
      typeLabel?: string
      onChange?: (value: number | null) => void
      type: string
      value: number | null
      [key: string]: unknown
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

    graphql: ({ type, value }: { type: string; value: unknown }) =>
      buildGraphQLFilter(type, value, config.fieldKey),

    parseGraphQL: (value: unknown) => parseGraphQLValue(value),

    Label({ label, type, value }: { label: string; type: string; value: unknown }) {
      return getLabelText(type, value, label)
    },

    types: FILTER_TYPES,
  }
}

/**
 * Controller for the Int field type.
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
  const validate = createValidate(config)
  const filter = createFilter(config, validate)

  return {
    fieldKey: config.fieldKey,
    label: config.label,
    description: config.description,
    graphqlSelection: config.fieldKey,
    validation: config.fieldMeta.validation,
    defaultValue: createDefaultValue(config),
    deserialize: createDeserialize(config),
    serialize: createSerialize(config),
    hasAutoIncrementDefault: config.fieldMeta.defaultValue === 'autoincrement',
    validate: (value, opts) => validate(value, opts) === undefined,
    filter,
  }
}

/**
 * Field component for the Int field type.
 */
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