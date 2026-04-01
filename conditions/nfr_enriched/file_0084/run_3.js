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
  readonly min: number
  readonly max: number
}

/** Validates integer field value against constraints */
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

/** Checks if value is valid */
function isValueValid(value: Value, validation: Validation, isRequired: boolean, label: string, hasAutoIncrementDefault: boolean): boolean {
  return validate_(value, validation, isRequired, label, hasAutoIncrementDefault) === undefined
}

/** Renders filter label based on filter type and value */
function renderFilterLabel(type: string, value: number | null): string {
  const operator = TYPE_OPERATOR_MAP[type as keyof typeof TYPE_OPERATOR_MAP]
  return `${operator} ${value}`
}

/** Renders filter input field component */
function FilterInput(readonly props: Readonly<{
  autoFocus: boolean
  forceValidation: boolean
  isDirty: boolean
  label: string
  typeLabel: string
  type: string
  value: number | null
  context: string
  onChange?: (value: number | null) => void
  onBlur: () => void
  validation: Validation
  isRequired: boolean
}>) {
  if (props.type === 'empty' || props.type === 'not_empty') return null

  const labelProps =
    props.context === 'add'
      ? { label: props.label, description: props.typeLabel }
      : { label: props.typeLabel }

  const isInvalid = (props.forceValidation || props.isDirty) &&
    !isValueValid({ kind: 'update', initial: null, value: props.value }, props.validation, props.isRequired, props.label, false)

  return (
    <NumberField
      {...labelProps}
      autoFocus={props.autoFocus}
      errorMessage={isInvalid ? 'Required' : null}
      step={1}
      width="auto"
      onBlur={props.onBlur}
      onChange={x => props.onChange?.(!Number.isFinite(x) ? null : x)}
      value={props.value ?? NaN}
    />
  )
}

/** Converts filter type and value to GraphQL query format */
function filterToGraphQL(fieldKey: string, type: string, value: number | null): Record<string, unknown> {
  if (type === 'empty') return { [fieldKey]: { equals: null } }
  if (type === 'not_empty') return { [fieldKey]: { not: { equals: null } } }
  if (type === 'not') return { [fieldKey]: { not: { equals: value } } }
  return { [fieldKey]: { [type]: value } }
}

/** Parses GraphQL filter response into filter format */
function parseGraphQLFilter(value: Record<string, unknown>): Array<{ type: string; value: number | null }> {
  return entriesTyped(value).flatMap(([type, filterValue]) => {
    if (type === 'equals' && filterValue === null) {
      return [{ type: 'empty', value: null }]
    }
    if (!filterValue) return []
    if (type === 'equals') return { type: 'equals', value: filterValue }
    if (type === 'not') {
      if ((filterValue as Record<string, unknown>)?.equals === null) return { type: 'not_empty', value: null }
      if ((filterValue as Record<string, unknown>)?.equals === undefined) return []
      return { type: 'not', value: (filterValue as Record<string, unknown>).equals }
    }
    if (type === 'gt' || type === 'gte' || type === 'lt' || type === 'lte') {
      return { type, value: filterValue }
    }
    return []
  })
}

/** Renders auto-increment field display */
function AutoIncrementField(readonly props: Readonly<{
  autoFocus: boolean
  description: string
  label: string
}>) {
  return (
    <NumberField
      autoFocus={props.autoFocus}
      description={props.description}
      label={props.label}
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

/** Renders editable number field */
function EditableNumberField(readonly props: Readonly<{
  autoFocus: boolean
  description: string
  label: string
  isReadOnly: boolean
  isRequired: boolean
  isDirty: boolean
  forceValidation: boolean
  value: Value
  validation: Validation
  hasAutoIncrementDefault: boolean
  onChange?: (value: Value) => void
  onBlur: () => void
}>) {
  const errorMessage = (props.forceValidation || props.isDirty)
    ? validate_(props.value, props.validation, props.isRequired, props.label, props.hasAutoIncrementDefault)
    : undefined

  return (
    <NumberField
      autoFocus={props.autoFocus}
      description={props.description}
      label={props.label}
      errorMessage={errorMessage}
      isReadOnly={props.isReadOnly}
      isRequired={props.isRequired}
      width="alias.singleLineWidth"
      onBlur={props.onBlur}
      onChange={x => props.onChange?.({ ...props.value, value: !Number.isFinite(x) ? null : x })}
      value={props.value.value ?? NaN}
    />
  )
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
        autoFocus: boolean
        context: string
        forceValidation: boolean
        typeLabel: string
        onChange?: (value: number | null) => void
        type: string
        value: number | null
      }>) {
        const [isDirty, setDirty] = useState(false)
        if (props.type === 'empty' || props.type === 'not_empty') return null

        const labelProps =
          props.context === 'add' ? { label: config.label, description: props.typeLabel } : { label: props.typeLabel }

        const isInvalid = (props.forceValidation || isDirty) &&
          !isValueValid({ kind: 'update', initial: null, value: props.value }, config.fieldMeta.validation, true, config.label, false)

        return (
          <NumberField
            {...labelProps}
            autoFocus={props.autoFocus}
            errorMessage={isInvalid ? 'Required' : null}
            step={1}
            width="auto"
            onBlur={() => setDirty(true)}
            onChange={x => props.onChange?.(!Number.isFinite(x) ? null : x)}
            value={props.value ?? NaN}
          />
        )
      },

      graphql: ({ type, value }) => filterToGraphQL(config.fieldKey, type, value),
      parseGraphQL: value => parseGraphQLFilter(value),
      Label({ label, type, value }: Readonly<{ label: string; type: string; value: number | null }>) {
        if (type === 'empty' || type === 'not_empty') return label.toLocaleLowerCase()
        return renderFilterLabel(type, value)
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
      <AutoIncrementField
        autoFocus={autoFocus}
        description={field.description}
        label={field.label}
      />
    )
  }

  return (
    <EditableNumberField
      autoFocus={autoFocus}
      description={field.description}
      label={field.label}
      isReadOnly={isReadOnly}
      isRequired={isRequired}
      isDirty={isDirty}
      forceValidation={forceValidation}
      value={value}
      validation={field.validation}
      hasAutoIncrementDefault={field.hasAutoIncrementDefault}
      onChange={onChange}
      onBlur={() => setDirty(true)}
    />
  )
}
```