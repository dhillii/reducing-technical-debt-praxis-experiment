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

/** Validates minimum password length constraint */
function validateMinLength(
  val: string,
  minLength: number,
  fieldLabel: string
): string | undefined {
  if (val.length < minLength) {
    if (minLength === 1) {
      return `${fieldLabel} must not be empty`
    }
    return `${fieldLabel} must be at least ${minLength} characters long`
  }
  return undefined
}

/** Validates maximum password length constraint */
function validateMaxLength(
  val: string,
  maxLength: number | null,
  fieldLabel: string
): string | undefined {
  if (maxLength !== null && val.length > maxLength) {
    return `${fieldLabel} must be no longer than ${maxLength} characters`
  }
  return undefined
}

/** Validates password regex match constraint */
function validateRegexMatch(
  val: string,
  match: { regex: RegExp; explanation: string } | null
): string | undefined {
  if (match && !match.regex.test(val)) {
    return match.explanation
  }
  return undefined
}

/** Validates password against common passwords list */
function validateCommonPassword(val: string, rejectCommon: boolean, fieldLabel: string): string | undefined {
  if (rejectCommon && dumbPasswords.check(val)) {
    return `${fieldLabel} is too common and is not allowed`
  }
  return undefined
}

/** Validates editing state password constraints */
function validateEditingPassword(
  value: string,
  validation: Validation,
  fieldLabel: string
): string | undefined {
  const minLengthError = validateMinLength(value, validation.length.min, fieldLabel)
  if (minLengthError) return minLengthError

  const maxLengthError = validateMaxLength(value, validation.length.max, fieldLabel)
  if (maxLengthError) return maxLengthError

  const regexError = validateRegexMatch(value, validation.match)
  if (regexError) return regexError

  const commonError = validateCommonPassword(value, validation.rejectCommon, fieldLabel)
  if (commonError) return commonError

  return undefined
}

function validate(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  fieldLabel: string
): string | undefined {
  if (value.kind === 'initial' && (value.isSet === null || value.isSet === true)) {
    return undefined
  }
  if (value.kind === 'initial' && isRequired) {
    return `${fieldLabel} is required`
  }
  if (value.kind === 'editing' && value.confirm !== value.value) {
    return `The passwords do not match`
  }
  if (value.kind === 'editing') {
    return validateEditingPassword(value.value, validation, fieldLabel)
  }
  return undefined
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

/** Renders the initial state button to start password editing */
function InitialStateButton(props: {
  triggerRef: React.RefObject<HTMLButtonElement>
  autoFocus: boolean
  isSet: boolean | null
  fieldLabel: string
  onChange: (value: Value) => void
}) {
  return (
    <ActionButton
      ref={props.triggerRef}
      alignSelf="start"
      autoFocus={props.autoFocus}
      onPress={() => {
        props.onChange({
          kind: 'editing',
          confirm: '',
          value: '',
          isSet: props.isSet,
        })
      }}
    >
      {props.isSet ? `Change ` : `Set `}
      {props.fieldLabel.toLocaleLowerCase()}
    </ActionButton>
  )
}

/** Renders password input fields for editing state */
function PasswordInputFields(props: {
  value: string
  confirm: string
  fieldLabel: string
  secureTextEntry: boolean
  validationMessage: string | undefined
  descriptionId: string
  messageId: string
  touched: { value: boolean; confirm: boolean }
  onChange: (value: Value) => void
  onTouched: (field: 'value' | 'confirm') => void
  onKeyDown: (e: React.KeyboardEvent) => void
}) {
  return (
    <>
      <TextField
        autoFocus
        aria-label={`new ${props.fieldLabel}`}
        aria-describedby={[props.descriptionId, props.messageId].filter(Boolean).join(' ')}
        // @ts-expect-error — needs to be fixed in "@keystar/ui"
        isInvalid={!!props.validationMessage}
        onBlur={() => props.onTouched('value')}
        onChange={text => props.onChange({ ...{ value: props.value, confirm: props.confirm, kind: 'editing', isSet: null }, value: text })}
        onKeyDown={props.onKeyDown}
        placeholder="New"
        type={props.secureTextEntry ? 'password' : 'text'}
        value={props.value}
        flex
      />
      <TextField
        aria-label={`confirm ${props.fieldLabel}`}
        aria-describedby={props.messageId}
        // @ts-expect-error — needs to be fixed in "@keystar/ui"
        isInvalid={!!props.validationMessage}
        onBlur={() => props.onTouched('confirm')}
        onChange={text => props.onChange({ ...{ value: props.value, confirm: props.confirm, kind: 'editing', isSet: null }, confirm: text })}
        onKeyDown={props.onKeyDown}
        placeholder="Confirm"
        type={props.secureTextEntry ? 'password' : 'text'}
        value={props.confirm}
        flex
      />
    </>
  )
}

/** Renders action buttons for password editing (show/cancel) */
function EditingActionButtons(props: {
  secureTextEntry: boolean
  onToggleSecureText: () => void
  onCancel: () => void
}) {
  return (
    <Flex gap="regular">
      <ToggleButton
        aria-label="show"
        isSelected={!props.secureTextEntry}
        onPress={props.onToggleSecureText}
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
      <ActionButton onPress={props.onCancel}>Cancel</ActionButton>
    </Flex>
  )
}

/** Renders the editing state UI with password inputs and controls */
function EditingStateContent(props: {
  value: Value & { kind: 'editing' }
  field: { label: string; description?: string }
  secureTextEntry: boolean
  validationMessage: string | undefined
  descriptionId: string
  messageId: string
  touched: { value: boolean; confirm: boolean }
  onChange: (value: Value) => void
  onCancel: () => void
  onEscape: (e: React.KeyboardEvent) => void
}) {
  const handleTouched = (field: 'value' | 'confirm') => {
    props.onChange({
      ...props.value,
      [field]: props.value[field],
    })
  }

  return (
    <Flex
      gap="regular"
      UNSAFE_className={css({
        [containerQueries.below.tablet]: {
          flexDirection: 'column',
        },
      })}
    >
      <PasswordInputFields
        value={props.value.value}
        confirm={props.value.confirm}
        fieldLabel={props.field.label}
        secureTextEntry={props.secureTextEntry}
        validationMessage={props.validationMessage}
        descriptionId={props.descriptionId}
        messageId={props.messageId}
        touched={props.touched}
        onChange={props.onChange}
        onTouched={handleTouched}
        onKeyDown={props.onEscape}
      />
      <EditingActionButtons
        secureTextEntry={props.secureTextEntry}
        onToggleSecureText={() => {}}
        onCancel={props.onCancel}
      />
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
      return <Checkbox {...readonlyCheckboxProps(value.isSet)} />
    }
    if (value.kind === 'initial') {
      return (
        <InitialStateButton
          triggerRef={triggerRef}
          autoFocus={autoFocus}
          isSet={value.isSet}
          fieldLabel={field.label}
          onChange={onChange!}
        />
      )
    }
    return (
      <Flex
        gap="regular"
        UNSAFE_className={css({
          [containerQueries.below.tablet]: {
            flexDirection: 'column',
          },
        })}
      >
        <PasswordInputFields
          value={value.value}
          confirm={value.confirm}
          fieldLabel={field.label}
          secureTextEntry={secureTextEntry}
          validationMessage={validationMessage}
          descriptionId={descriptionId}
          messageId={messageId}
          touched={touched}
          onChange={onChange!}
          onTouched={(field) => setTouched({ ...touched, [field]: true })}
          onKeyDown={onEscape}
        />
        <EditingActionButtons
          secureTextEntry={secureTextEntry}
          onToggleSecureText={() => setSecureTextEntry(bool => !bool)}
          onCancel={cancelEditing}
        />
      </Flex>
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

/** Builds validation regex from serialized format */
function buildValidationRegex(match: PasswordFieldMeta['validation']['match']): Validation['match'] {
  if (match === null) return null
  return {
    regex: new RegExp(match.regex.source, match.regex.flags),
    explanation: match.explanation,
  }
}

/** Creates the filter configuration for password field */
function createFilterConfig(fieldKey: string, isNullable: boolean) {
  if (isNullable === false) return undefined

  return {
    Filter(props: any) {
      const { autoFocus, onChange, value, ...otherProps } = props
      return (
        <Checkbox
          autoFocus={autoFocus}
          onChange={onChange}
          isSelected={value ?? false}
          {...otherProps}
        >
          {props.typeLabel} set
        </Checkbox>
      )
    },
    graphql({ type, value }: any) {
      return {
        [fieldKey]: {
          isSet: type === 'not' ? !value : value,
        },
      }
    },
    parseGraphQL(value: any) {
      if (value?.isSet !== undefined) {
        return [{ type: 'is', value: value.isSet }]
      }
      return []
    },
    Label({ type, value }: any) {
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
  }
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
    match: buildValidationRegex(config.fieldMeta.validation.match),
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
    filter: createFilterConfig(config.fieldKey, config.fieldMeta.isNullable),
  }
}
```