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

/** Determines if value is null or empty */
function isEmptyValue(type: string, value: unknown): boolean {
  return type === 'empty' || type === 'not_empty'
}

/** Converts filter type to GraphQL operator */
function filterTypeToGraphQLOperator(
  type: string,
  value: number | null,
  fieldKey: string
): Record<string, unknown> {
  if (type === 'empty') return { [fieldKey]: { equals: null } }
  if (type === 'not_empty') return { [fieldKey]: { not: { equals: null } } }
  if (type === 'not') return { [fieldKey]: { not: { equals: value } } }
  return { [fieldKey]: { [type]: value } }
}

/** Parses GraphQL filter response into filter state */
function parseGraphQLFilter(
  value: Record<string, unknown>
): Array<{ type: string; value: number | null }> {
  return entriesTyped(value).flatMap(([type, filterValue]) => {
    if (type === 'equals' && filterValue === null) {
      return [{ type: 'empty', value: null }]
    }
    if (!filterValue) return []
    if (type === 'equals') return { type: 'equals', value: filterValue }
    if (type === 'not') {
      const notValue = filterValue as Record<string, unknown>
      if (notValue?.equals === null) return { type: 'not_empty', value: null }
      if (notValue?.equals === undefined) return []
      return { type: 'not', value: notValue.equals as number }
    }
    if (type === 'gt' || type === 'gte' || type === 'lt' || type === 'lte') {
      return { type, value: filterValue as number }
    }
    return []
  })
}

/** Formats filter label with operator symbol */
function formatFilterLabel(
  label: string,
  type: string,
  value: number | null
): string {
  if (type === 'empty' || type === 'not_empty') return label.toLocaleLowerCase()
  const operator = TYPE_OPERATOR_MAP[type as keyof typeof TYPE_OPERATOR_MAP]
  return `${operator} ${value}`
}

export function controller(
  config: FieldControllerConfig<{
    readonly validation: Validation
    readonly defaultValue: number | null | 'autoincrement'
  }>
): FieldController<Value, number | null, SimpleFieldTypeInfo<'Int'>['inputs']['where']> & {
  readonly validation: Validation
  readonly hasAutoIncrementDefault: boolean
} {
  const hasAutoIncrementDefault = config.fieldMeta.defaultValue === 'autoincrement'

  const validate = (value: Value, opts: { readonly isRequired: boolean }) => {
    return validateIntegerValue(
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
        readonly autoFocus?: boolean
        readonly context?: string
        readonly forceValidation?: boolean
        readonly typeLabel?: string
        readonly onChange?: (value: number | null) => void
        readonly type: string
        readonly value: number | null
        readonly [key: string]: unknown
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
        if (isEmptyValue(type, value)) return null

        const labelProps =
          context === 'add' ? { label: config.label, description: typeLabel } : { label: typeLabel }

        return (
          <NumberField
            {...otherProps}
            {...labelProps}
            autoFocus={autoFocus}
            errorMessage={
              (forceValidation || isDirty) &&
              !validateIntegerValue({ kind: 'update', initial: null, value }, config.fieldMeta.validation, true, config.label, hasAutoIncrementDefault)
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

      graphql: ({ type, value }) => filterTypeToGraphQLOperator(type, value, config.fieldKey),
      parseGraphQL: parseGraphQLFilter,
      Label({ label, type, value }: Readonly<{
        readonly label: string
        readonly type: string
        readonly value: number | null
      }>) {
        return formatFilterLabel(label, type, value)
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
    return validateIntegerValue(
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
```