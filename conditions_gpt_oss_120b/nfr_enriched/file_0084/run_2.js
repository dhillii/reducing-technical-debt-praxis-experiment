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

/* Validation helper */
function runValidation(
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

/* Helper to decide label props for filter UI */
function getFilterLabelProps(
  context: string,
  fieldLabel: string,
  typeLabel: string
): { label: string; description?: string } {
  return context === 'add'
    ? { label: fieldLabel, description: typeLabel }
    : { label: typeLabel }
}

/* Helper to render NumberField inside filter */
function renderFilterNumberField(
  props: Readonly<any>,
  configLabel: string,
  validateFn: (v: Value) => boolean
) {
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

  const labelProps = getFilterLabelProps(context, configLabel, typeLabel)

  return (
    <NumberField
      {...otherProps}
      {...labelProps}
      autoFocus={autoFocus}
      errorMessage={
        (forceValidation || isDirty) && !validateFn({ kind: 'update', initial: null, value })
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

/* GraphQL filter builder */
function buildGraphQLFilter(
  configKey: string,
  type: string,
  value: any
): Record<string, any> {
  switch (type) {
    case 'empty':
      return { [configKey]: { equals: null } }
    case 'not_empty':
      return { [configKey]: { not: { equals: null } } }
    case 'not':
      return { [configKey]: { not: { equals: value } } }
    default:
      return { [configKey]: { [type]: value } }
  }
}

/* GraphQL parser */
function parseGraphQLFilter(value: Record<string, any>) {
  return entriesTyped(value).flatMap(([type, val]) => {
    if (type === 'equals' && val === null) return [{ type: 'empty', value: null }]
    if (!val) return []
    if (type === 'equals') return { type: 'equals', value: val }
    if (type === 'not') {
      if (val?.equals === null) return { type: 'not_empty', value: null }
      if (val?.equals === undefined) return []
      return { type: 'not', value: val.equals }
    }
    if (['gt', 'gte', 'lt', 'lte'].includes(type)) return { type, value: val }
    return []
  })
}

/* Label formatter for filter chips */
function formatFilterLabel(
  label: string,
  type: string,
  value: any
): string {
  if (type === 'empty' || type === 'not_empty') return label.toLocaleLowerCase()
  const operator = TYPE_OPERATOR_MAP[type as keyof typeof TYPE_OPERATOR_MAP]
  return `${operator} ${value}`
}

/* Main controller */
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
    runValidation(
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
      Filter: (props: Readonly<any>) =>
        renderFilterNumberField(props, config.label, v =>
          validate(v, { isRequired: true }) === undefined
        ),
      graphql: ({ type, value }) => buildGraphQLFilter(config.fieldKey, type, value),
      parseGraphQL: parseGraphQLFilter,
      Label: ({ label, type, value }: any) => formatFilterLabel(label, type, value),
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

/* Field component with read‑only props */
type FieldComponentProps = Readonly<FieldProps<typeof controller>>

export function Field({
  field,
  value,
  onChange,
  autoFocus,
  forceValidation,
  isRequired,
}: FieldComponentProps) {
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
    runValidation(
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