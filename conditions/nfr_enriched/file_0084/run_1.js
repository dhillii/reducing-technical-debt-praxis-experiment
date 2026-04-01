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
function validateIntegerValue(
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

/** Determines label properties based on context */
function getLabelProps(
  readonly context: string,
  readonly configLabel: string,
  readonly typeLabel: string
): { readonly label: string; readonly description?: string } {
  return context === 'add'
    ? { label: configLabel, description: typeLabel }
    : { label: typeLabel }
}

/** Converts filter type and value to GraphQL query format */
function filterToGraphQL(
  readonly type: string,
  readonly value: number | null,
  readonly fieldKey: string
): Record<string, unknown> {
  if (type === 'empty') return { [fieldKey]: { equals: null } }
  if (type === 'not_empty') return { [fieldKey]: { not: { equals: null } } }
  if (type === 'not') return { [fieldKey]: { not: { equals: value } } }
  return { [fieldKey]: { [type]: value } }
}

/** Parses GraphQL filter response into filter state */
function parseGraphQLFilter(
  readonly value: Record<string, unknown>
): Array<{ readonly type: string; readonly value: number | null }> {
  return entriesTyped(value).flatMap(([type, filterValue]) => {
    if (type === 'equals' && filterValue === null) {
      return [{ type: 'empty', value: null }]
    }
    if (!filterValue) return []
    if (type === 'equals') return { type: 'equals', value: filterValue }
    if (type === 'not') {
      if ((filterValue as Record<string, unknown>)?.equals === null) {
        return { type: 'not_empty', value: null }
      }
      if ((filterValue as Record<string, unknown>)?.equals === undefined) return []
      return { type: 'not', value: (filterValue as Record<string, unknown>).equals }
    }
    if (type === 'gt' || type === 'gte' || type === 'lt' || type === 'lte') {
      return { type, value: filterValue }
    }
    return []
  })
}

/** Formats filter label for display */
function formatFilterLabel(
  readonly label: string,
  readonly type: string,
  readonly value: number | null
): string {
  if (type === 'empty' || type === 'not_empty') return label.toLocaleLowerCase()
  const operator = TYPE_OPERATOR_MAP[type as keyof typeof TYPE_OPERATOR_MAP]
  return `${operator} ${value}`
}

export function controller(
  readonly config: FieldControllerConfig<{
    readonly validation: Validation
    readonly defaultValue: number | null | 'autoincrement'
  }>
): FieldController<Value, number | null, SimpleFieldTypeInfo<'Int'>['inputs']['where']> & {
  readonly validation: Validation
  readonly hasAutoIncrementDefault: boolean
} {
  const validate = (value: Value, opts: { readonly isRequired: boolean }) => {
    return validateIntegerValue(
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
      Filter(readonly props: Readonly<{
        readonly autoFocus?: boolean
        readonly context: string
        readonly forceValidation: boolean
        readonly typeLabel: string
        readonly onChange?: (value: number | null) => void
        readonly type: string
        readonly value: number | null
      }>) {
        const [isDirty, setDirty] = useState(false)
        if (props.type === 'empty' || props.type === 'not_empty') return null

        const labelProps = getLabelProps(props.context, config.label, props.typeLabel)

        return (
          <NumberField
            {...labelProps}
            autoFocus={props.autoFocus}
            errorMessage={
              (props.forceValidation || isDirty) &&
              !validate({ kind: 'update', initial: null, value: props.value }, { isRequired: true })
                ? 'Required'
                : null
            }
            step={1}
            width="auto"
            onBlur={() => setDirty(true)}
            onChange={x => props.onChange?.(!Number.isFinite(x) ? null : x)}
            value={props.value ?? NaN}
          />
        )
      },

      graphql: ({ type, value }) => filterToGraphQL(type, value, config.fieldKey),

      parseGraphQL: value => parseGraphQLFilter(value),

      Label(readonly props: Readonly<{
        readonly label: string
        readonly type: string
        readonly value: number | null
      }>) {
        return formatFilterLabel(props.label, props.type, props.value)
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

export function Field(readonly props: Readonly<FieldProps<typeof controller>>) {
  const [isDirty, setDirty] = useState(false)
  const isReadOnly = !props.onChange || props.field.hasAutoIncrementDefault

  if (props.field.hasAutoIncrementDefault && props.value.kind === 'create') {
    return (
      <NumberField
        autoFocus={props.autoFocus}
        description={props.field.description}
        label={props.field.label}
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
    return validateIntegerValue(
      value,
      props.field.validation,
      props.isRequired,
      props.field.label,
      props.field.hasAutoIncrementDefault
    )
  }

  return (
    <NumberField
      autoFocus={props.autoFocus}
      description={props.field.description}
      label={props.field.label}
      errorMessage={(props.forceValidation || isDirty) && validate(props.value)}
      isReadOnly={isReadOnly}
      isRequired={props.isRequired}
      width="alias.singleLineWidth"
      onBlur={() => setDirty(true)}
      onChange={x => props.onChange?.({ ...props.value, value: !Number.isFinite(x) ? null : x })}
      value={props.value.value ?? NaN}
    />
  )
}
```