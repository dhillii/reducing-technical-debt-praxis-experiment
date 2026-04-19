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
  min: number
  max: number
}

/**
 * Validates a create operation value against constraints.
 * Returns error message or undefined if valid.
 */
function validateCreateValue(
  value: number | null,
  validation: Validation,
  isRequired: boolean,
  label: string,
  hasAutoIncrementDefault: boolean
): string | undefined {
  if (hasAutoIncrementDefault && value === null) return
  if (isRequired && value === null) return `${label} is required`
  if (typeof value !== 'number') return
  const v = value
  if (!Number.isInteger(v)) return `${label} is not a valid integer`
  if (validation.min !== undefined && v < validation.min)
    return `${label} must be greater than or equal to ${validation.min}`
  if (validation.max !== undefined && v > validation.max)
    return `${label} must be less than or equal to ${validation.max}`
}

/**
 * Validates an update operation value against constraints.
 * Returns error message or undefined if valid.
 */
function validateUpdateValue(
  initial: number | null,
  value: number | null,
  validation: Validation,
  isRequired: boolean,
  label: string,
  hasAutoIncrementDefault: boolean
): string | undefined {
  if (initial === null && value === null) return
  if (isRequired && value === null) return `${label} is required`
  if (typeof value !== 'number') return
  const v = value
  if (!Number.isInteger(v)) return `${label} is not a valid integer`
  if (validation.min !== undefined && v < validation.min)
    return `${label} must be greater than or equal to ${validation.min}`
  if (validation.max !== undefined && v > validation.max)
    return `${label} must be less than or equal to ${validation.max}`
}

/**
 * Validates a value based on its kind (create or update).
 */
function validateValue(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  label: string,
  hasAutoIncrementDefault: boolean
): string | undefined {
  if (value.kind === 'create') {
    return validateCreateValue(
      value.value,
      validation,
      isRequired,
      label,
      hasAutoIncrementDefault
    )
  }
  return validateUpdateValue(
    value.initial,
    value.value,
    validation,
    isRequired,
    label,
    hasAutoIncrementDefault
  )
}

/**
 * Generates GraphQL filter object based on type and value.
 */
function generateGraphQLFilter(
  config: FieldControllerConfig<{
    validation: Validation
    defaultValue: number | null | 'autoincrement'
  }>,
  type: string,
  value: number | null
): { [key: string]: { [key: string]: any } } {
  if (type === 'empty') return { [config.fieldKey]: { equals: null } }
  if (type === 'not_empty') return { [config.fieldKey]: { not: { equals: null } } }
  if (type === 'not') return { [config.fieldKey]: { not: { equals: value } } }
  return { [config.fieldKey]: { [type]: value } }
}

/**
 * Parses GraphQL filter values into structured format.
 */
function parseGraphQLFilter(
  value: { [key: string]: { [key: string]: any } }
): Array<{ type: string; value: number | null }> {
  return entriesTyped(value).flatMap(([type, value]) => {
    if (type === 'equals' && value === null) {
      return [{ type: 'empty', value: null }]
    }
    if (!value) return []
    if (type === 'equals') return { type: 'equals', value }
    if (type === 'not') {
      if (value?.equals === null) return { type: 'not_empty', value: null }
      if (value?.equals === undefined) return []
      return { type: 'not', value: value.equals }
    }
    if (type === 'gt' || type === 'gte' || type === 'lt' || type === 'lte') {
      return { type, value }
    }
    return []
  })
}

/**
 * Renders label text based on filter type and value.
 */
function renderFilterLabel(
  label: string,
  type: string,
  value: number | null
): string {
  if (type === 'empty' || type === 'not_empty') return label.toLocaleLowerCase()
  const operator = TYPE_OPERATOR_MAP[type as keyof typeof TYPE_OPERATOR_MAP]
  return `${operator} ${value}`
}

/**
 * Creates type configuration for filter options.
 */
function createFilterTypes(
  config: FieldControllerConfig<{
    validation: Validation
    defaultValue: number | null | 'autoincrement'
  }>
): { [key: string]: { label: string; initialValue: number | null } } {
  return {
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
    return validateValue(
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
      Filter(props) {
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
          context === 'add' ? { label: config.label, description: typeLabel } : { label: typeLabel }

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

      graphql: ({ type, value }) => generateGraphQLFilter(config, type, value),
      parseGraphQL: parseGraphQLFilter,
      Label: ({ label, type, value }) => renderFilterLabel(label, type, value),
      types: createFilterTypes(config),
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
```