```typescript
// @ts-expect-error
import dumbPasswords from 'dumb-passwords'
import { useEffect, useId, useRef, useState } from 'react'
import { useSlotId } from '@react-aria/utils'

import { ActionButton, ToggleButton } from '@keystar/ui/button'
import { Checkbox } from '@keystar/ui/checkbox'
import { FieldLabel, FieldMessage } from '@keystar/ui/field'
import { Icon } from '@keystar/ui/icon'
import { eyeIcon } from '@keystar/ui/icon/icons/eyeIcon'
import { asteriskIcon } from '@keystar/ui/icon/icons/asteriskIcon'
import { Flex, VStack } from '@keystar/ui/layout'
import { containerQueries, css } from '@keystar/ui/style'
import { TextField } from '@keystar/ui/text-field'
import { Text, VisuallyHidden } from '@keystar/ui/typography'

import type {
  CellComponent,
  FieldController,
  FieldControllerConfig,
  FieldProps,
} from '../../../../types'

function validateInitialState(value: Value, isRequired: boolean, fieldLabel: string): string | undefined {
  if (value.kind === 'initial' && (value.isSet === null || value.isSet === true)) {
    return undefined
  }
  if (value.kind === 'initial' && isRequired) {
    return `${fieldLabel} is required`
  }
  return undefined
}

function validatePasswordMatch(value: Value): string | undefined {
  if (value.kind === 'editing' && value.confirm !== value.value) {
    return `The passwords do not match`
  }
  return undefined
}

function validatePasswordLength(value: Value, validation: Validation, fieldLabel: string): string | undefined {
  if (value.kind !== 'editing') return undefined
  
  const val = value.value
  if (val.length < validation.length.min) {
    if (validation.length.min === 1) {
      return `${fieldLabel} must not be empty`
    }
    return `${fieldLabel} must be at least ${validation.length.min} characters long`
  }
  if (validation.length.max !== null && val.length > validation.length.max) {
    return `${fieldLabel} must be no longer than ${validation.length.max} characters`
  }
  return undefined
}

function validatePasswordPattern(value: Value, validation: Validation): string | undefined {
  if (value.kind !== 'editing') return undefined
  
  if (validation.match && !validation.match.regex.test(value.value)) {
    return validation.match.explanation
  }
  return undefined
}

function validatePasswordCommonality(value: Value, validation: Validation, fieldLabel: string): string | undefined {
  if (value.kind !== 'editing') return undefined
  
  if (validation.rejectCommon && dumbPasswords.check(value.value)) {
    return `${fieldLabel} is too common and is not allowed`
  }
  return undefined
}

function validate(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  fieldLabel: string
): string | undefined {
  return (
    validateInitialState(value, isRequired, fieldLabel) ||
    validatePasswordMatch(value) ||
    validatePasswordLength(value, validation, fieldLabel) ||
    validatePasswordPattern(value, validation) ||
    validatePasswordCommonality(value, validation, fieldLabel)
  )
}

function readonlyCheckboxProps(isSet: null | undefined | boolean) {
  const isIndeterminate = isSet == null
  const isSelected = isSet == null ? undefined : isSet
  return {
    children: isIndeterminate ? 'Access denied' : 'Value is set',
    isIndeterminate,
    isReadOnly: true,
    isSelected,
    prominence: 'low' as const,
  }
}

function renderReadOnlyField(value: Value) {
  return <Checkbox {...readonlyCheckboxProps(value.isSet)} />
}

function renderInitialField(value: Value, field: any, autoFocus: boolean, onChange: any, triggerRef: any) {
  return (
    <ActionButton
      ref={triggerRef}
      alignSelf="start"
      autoFocus={autoFocus}
      onPress={() => {
        onChange({
          kind: 'editing',
          confirm: '',
          value: '',
          isSet: value.isSet,
        })
      }}
    >
      {value.isSet ? `Change ` : `Set `}
      {field.label.toLocaleLowerCase()}
    </ActionButton>
  )
}

function renderEditingField(
  value: Value,
  field: any,
  secureTextEntry: boolean,
  setSecureTextEntry: any,
  touched: any,
  setTouched: any,
  onChange: any,
  onEscape: any,
  validationMessage: any,
  descriptionId: string,
  messageId: string,
  cancelEditing: any
) {
  return (
    <Flex
      gap="regular"
      UNSAFE_className={css({
        [containerQueries.below.tablet]: {
          flexDirection: 'column',
        },
      })}
    >
      <TextField
        autoFocus
        aria-label={`new ${field.label}`}
        aria-describedby={[descriptionId, messageId].filter(Boolean).join(' ')}
        isInvalid={!!validationMessage}
        onBlur={() => setTouched({ ...touched, value: true })}
        onChange={text => onChange({ ...value, value: text })}
        onKeyDown={onEscape}
        placeholder="New"
        type={secureTextEntry ? 'password' : 'text'}
        value={value.value}
        flex
      />
      <TextField
        aria-label={`confirm ${field.label}`}
        aria-describedby={messageId}
        isInvalid={!!validationMessage}
        onBlur={() => setTouched({ ...touched, confirm: true })}
        onChange={text => onChange({ ...value, confirm: text })}
        onKeyDown={onEscape}
        placeholder="Confirm"
        type={secureTextEntry ? 'password' : 'text'}
        value={value.confirm}
        flex
      />

      <Flex gap="regular">
        <ToggleButton
          aria-label="show"
          isSelected={!secureTextEntry}
          onPress={() => setSecureTextEntry(bool => !bool)}
        >
          <Icon src={eyeIcon} />
          <Text
            UNSAFE_className={css({
              [containerQueries.above.mobile]: {
                display: 'none',
              },
            })}
          >
            Show
          </Text>
        </ToggleButton>
        <ActionButton onPress={cancelEditing}>Cancel</ActionButton>
      </Flex>
    </Flex>
  )
}

export function Field(props: FieldProps<typeof controller>) {
  const { autoFocus, field, forceValidation, onChange, value } = props

  const [secureTextEntry, setSecureTextEntry] = useState(true)
  const [touched, setTouched] = useState({ value: false, confirm: false })
  const triggerRef = useRef<HTMLButtonElement>(null)

  const isReadOnly = onChange == null
  const validationMessage =
    forceValidation || (touched.value && touched.confirm)
      ? validate(value, field.validation, props.isRequired, field.label)
      : undefined

  const labelId = useId()
  const descriptionId = useSlotId([!!field.description, !!validationMessage])
  const messageId = useSlotId([!!field.description, !!validationMessage])

  const cancelEditing = () => {
    onChange?.({ kind: 'initial', isSet: value.isSet })
    setTimeout(() => {
      triggerRef.current?.focus()
    }, 0)
  }

  const onEscape = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape' || value.kind !== 'editing') return
    if (value.value === '' && value.confirm === '') {
      cancelEditing()
    }
  }

  useEffect(() => {
    if (value.kind === 'initial') {
      setTouched({ value: false, confirm: false })
      setSecureTextEntry(true)
    }
  }, [value.kind])

  const renderContent = () => {
    if (isReadOnly) {
      return renderReadOnlyField(value)
    }
    if (value.kind === 'initial') {
      return renderInitialField(value, field, autoFocus, onChange, triggerRef)
    }
    return renderEditingField(
      value,
      field,
      secureTextEntry,
      setSecureTextEntry,
      touched,
      setTouched,
      onChange,
      onEscape,
      validationMessage,
      descriptionId,
      messageId,
      cancelEditing
    )
  }

  return (
    <VStack
      role="group"
      aria-labelledby={labelId}
      aria-describedby={descriptionId}
      gap="medium"
      minWidth={0}
    >
      <FieldLabel elementType="span" id={labelId}>
        {field.label}
      </FieldLabel>
      {!!field.description && (
        <Text id={descriptionId} size="regular" color="neutralSecondary">
          {field.description}
        </Text>
      )}
      {renderContent()}
      {!!validationMessage && <FieldMessage id={messageId}>{validationMessage}</FieldMessage>}
    </VStack>
  )
}

export const Cell: CellComponent<typeof controller> = ({ value }) => {
  return value !== null ? (
    <div aria-label="is set" style={{ display: 'flex' }}>
      <Icon src={asteriskIcon} size="small" />
      <Icon src={asteriskIcon} size="small" />
      <Icon src={asteriskIcon} size="small" />
    </div>
  ) : (
    <VisuallyHidden>not set</VisuallyHidden>
  )
}

type Validation = {
  rejectCommon: boolean
  match: {
    regex: RegExp
    explanation: string
  } | null
  length: {
    min: number
    max: number | null
  }
}

export type PasswordFieldMeta = {
  isNullable: boolean
  validation: {
    rejectCommon: boolean
    match: {
      regex: { source: string; flags: string }
      explanation: string
    } | null
    length: {
      min: number
      max: number | null
    }
  }
}

type Value =
  | {
      kind: 'initial'
      isSet: boolean | null
    }
  | {
      kind: 'editing'
      isSet: boolean | null
      value: string
      confirm: string
    }

export function controller(config: FieldControllerConfig<PasswordFieldMeta>): FieldController<
  Value,
  boolean | null,
  { isSet?: boolean | null | undefined }
> & {
  validation: Validation
} {
  const validation: Validation = {
    ...config.fieldMeta.validation,
    match:
      config.fieldMeta.validation.match === null
        ? null
        : {
            regex: new RegExp(
              config.fieldMeta.validation.match.regex.source,
              config.fieldMeta.validation.match.regex.flags
            ),
            explanation: config.fieldMeta.validation.match.explanation,
          },
  }
  return {
    fieldKey: config.fieldKey,
    label: config.label,
    description: config.description,
    graphqlSelection: `${config.fieldKey} {isSet}`,
    validation,
    defaultValue: {
      kind: 'initial',
      isSet: false,
    },
    validate: (state, opts) =>
      validate(state, validation, opts.isRequired, config.label) === undefined,
    deserialize: data => ({ kind: 'initial', isSet: data[config.fieldKey]?.isSet ?? null }),
    serialize: value => {
      if (value.kind === 'initial') return {}
      return { [config.fieldKey]: value.value }
    },
    filter:
      config.fieldMeta.isNullable === false
        ? undefined
        : {
            Filter(props) {
              const { autoFocus, context, typeLabel, onChange, value, type, ...otherProps } = props
              return (
                <Checkbox
                  autoFocus={autoFocus}
                  onChange={onChange}
                  isSelected={value ?? false}
                  {...otherProps}
                >
                  {typeLabel} set
                </Checkbox>
              )
            },
            graphql({ type, value }) {
              return {
                [config.fieldKey]: {
                  isSet: type === 'not' ? !value : value,
                },
              }
            },
            parseGraphQL: value => {
              if (value?.isSet !== undefined) {
                return [{ type: 'is', value: value.isSet }]
              }
              return []
            },
            Label({ type, value }) {
              if ((type === 'is' && value) || (type === 'not' && !value)) return `is set`
              return `is not set`
            },
            types: {
              is: {
                label: 'Is',
                initialValue: true,
              },
              not: {
                label: 'Is not',
                initialValue: true,
              },
            },
          },
  }
}
```