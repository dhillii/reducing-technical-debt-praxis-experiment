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

/**
 * Validate a numeric value against field constraints.
 */
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
  if (!Number.isInteger(input)) return `${label} is not a valid integer`
  if (validation.min !== undefined && input < validation.min)
    return `${label} must be greater than or equal to ${validation.min}`
  if (validation.max !== undefined && input > validation.max)
    return `${label} must be less than or equal to ${validation.max}`
}

/**
 * Determine if a filter type should render a UI component.
 */
function shouldRenderFilter(type: string): boolean {
  return type !== 'empty' && type !== 'not_empty'
}

/**
 * Build GraphQL filter object based on type and value.
 */
function buildGraphQLFilter(
  type: string,
  value: any,
  fieldKey: string
): Record<string, any> {
  if (type === 'empty')
    return { [fieldKey]: { equals: null } }
  if (type === 'not_empty')
    return { [fieldKey]: { not: { equals: null } } }
  if (type === 'not')
    return { [fieldKey]: { not: { equals: value } } }
  return { [fieldKey]: { [type]: value } }
}

/**
 * Parse a GraphQL filter entry into internal representation.
 */
function parseGraphQLEntry(
  type: string,
  value: any
): { type: string; value: any } | null {
  if (type === 'equals' && value === null) {
    return { type: 'empty', value: null }
  }
  if (!value) return null
  if (type === 'equals') return { type: 'equals', value }
  if (type === 'not') {
    if (value?.equals === null) return { type: 'not_empty', value: null }
    if (value?.equals === undefined) return null
    return { type: 'not', value: value.equals }
  }
  if (['gt', 'gte', 'lt', 'lte'].includes(type)) {
    return { type, value }
  }
  return null
}

/**
 * Format label for filter UI.
 */
function formatFilterLabel(
  type: string,
  value: any
): string {
  const operator = TYPE_OPERATOR_MAP[type as keyof typeof TYPE_OPERATOR_MAP]
  return `${operator} ${value}`
}

/**
 * Controller factory for integer fields.
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
  const validate = (value: Value, opts: { isRequired: boolean }) =>
    validateValue(
      value,
      config.fieldMeta.validation,
      opts.isRequired,
      config.label,
      config.fieldMeta.defaultValue === 'autoincrement'
    )

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
      Filter(props: Readonly<any>) {
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

        if (!shouldRenderFilter(type)) return null

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

      graphql: ({ type, value }) => buildGraphQLFilter(type, value, config.fieldKey),

      parseGraphQL: value => {
        return entriesTyped(value)
          .flatMap(([type, val]) => {
            const result = parseGraphQLEntry(type, val)
            return result ? [result] : []
          })
      },

      Label({ label, type, value }: Readonly<any>) {
        if (type === 'empty' || type === 'not_empty') return label.toLocaleLowerCase()
        return formatFilterLabel(type, value)
      },

      types: {
        equals: { label: 'Is exactly', initialValue: null },
        not: { label: 'Is not exactly', initialValue: null },
        gt: { label: 'Is greater than', initialValue: null },
        lt: { label: 'Is less than', initialValue: null },
        gte: { label: 'Is greater than or equal to', initialValue: null },
        lte: { label: 'Is less than or equal to', initialValue: null },
        empty: { label: 'Is empty', initialValue: null },
        not_empty: { label: 'Is not empty', initialValue: null },
      },
    },
  }
}

/**
 * Field component for integer input.
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

  const validate = (val: Value) =>
    validateValue(
      val,
      field.validation,
      isRequired,
      field.label,
      field.hasAutoIncrementDefault
    )

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