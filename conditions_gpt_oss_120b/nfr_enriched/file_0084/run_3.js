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
 * Core validation logic shared by controller and field components.
 */
function validateCore(
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
 * Determines label props based on context.
 */
function getLabelProps(
  context: string | undefined,
  fieldLabel: string,
  typeLabel: string
): { label: string; description?: string } {
  return context === 'add'
    ? { label: fieldLabel, description: typeLabel }
    : { label: typeLabel }
}

/**
 * Returns true when an error message should be displayed.
 */
function shouldShowError(
  forceValidation: boolean,
  isDirty: boolean,
  value: number | null,
  field: ReturnType<typeof controller>
): boolean {
  return (forceValidation || isDirty) && !!field.validate({ kind: 'update', initial: null, value }, { isRequired: true })
}

/**
 * Builds GraphQL filter object for a given type/value pair.
 */
function buildGraphQLFilter(
  key: string,
  type: string,
  value: number | null
): Record<string, any> {
  if (type === 'empty') return { [key]: { equals: null } }
  if (type === 'not_empty') return { [key]: { not: { equals: null } } }
  if (type === 'not') return { [key]: { not: { equals: value } } }
  return { [key]: { [type]: value } }
}

/**
 * Parses a GraphQL filter object into internal filter representations.
 */
function parseGraphQLFilter(
  raw: Record<string, any>
): Array<{ type: string; value: any }> {
  return entriesTyped(raw).flatMap(([type, value]) => {
    if (type === 'equals' && value === null) {
      return [{ type: 'empty', value: null }]
    }
    if (!value) return []
    if (type === 'equals') return [{ type: 'equals', value }]
    if (type === 'not') {
      if (value?.equals === null) return [{ type: 'not_empty', value: null }]
      if (value?.equals === undefined) return []
      return [{ type: 'not', value: value.equals }]
    }
    if (['gt', 'gte', 'lt', 'lte'].includes(type)) {
      return [{ type, value }]
    }
    return []
  })
}

/**
 * Renders a read‑only auto‑increment field.
 */
function renderAutoIncrementField(
  field: ReturnType<typeof controller>,
  autoFocus: boolean | undefined
) {
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

/**
 * Main controller factory.
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
    validateCore(
      value,
      config.fieldMeta.validation,
      opts.isRequired,
      config.label,
      config.fieldMeta.defaultValue === 'autoincrement'
    )

  const hasAutoIncrementDefault = config.fieldMeta.defaultValue === 'autoincrement'

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
        [key: string]: any
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

        if (type === 'empty' || type === 'not_empty') return null

        const labelProps = getLabelProps(context, config.label, typeLabel ?? '')

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

      graphql({ type, value }) {
        return buildGraphQLFilter(config.fieldKey, type, value)
      },

      parseGraphQL(value) {
        return parseGraphQLFilter(value)
      },

      Label(props: Readonly<{ label: string; type: string; value: any }>) {
        const { label, type, value } = props
        if (type === 'empty' || type === 'not_empty') return label.toLocaleLowerCase()
        const operator = TYPE_OPERATOR_MAP[type as keyof typeof TYPE_OPERATOR_MAP]
        return `${operator} ${value}`
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
 * Field component rendering.
 */
export function Field(
  props: Readonly<FieldProps<typeof controller>>
) {
  const {
    field,
    value,
    onChange,
    autoFocus,
    forceValidation,
    isRequired,
  } = props

  const [isDirty, setDirty] = useState(false)
  const isReadOnly = !onChange || field.hasAutoIncrementDefault

  if (field.hasAutoIncrementDefault && value.kind === 'create') {
    return renderAutoIncrementField(field, autoFocus)
  }

  const errorMessage = (forceValidation || isDirty) && validateCore(
    value,
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