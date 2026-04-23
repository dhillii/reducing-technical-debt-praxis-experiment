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

/**
 * Validates password length requirements
 */
function validateLength(value: string, validation: Validation): string | undefined {
  if (value.length < validation.length.min) {
    if (validation.length.min === 1) {
      return 'Password must not be empty'
    }
    return `Password must be at least ${validation.length.min} characters long`
  }
  if (validation.length.max !== null && value.length > validation.length.max) {
    return `Password must be no longer than ${validation.length.max} characters`
  }
  return undefined
}

/**
 * Validates password against regex pattern
 */
function validateRegex(value: string, validation: Validation): string | undefined {
  if (validation.match && !validation.match.regex.test(value)) {
    return validation.match.explanation
  }
  return undefined
}

/**
 * Validates password is not a common password
 */
function validateCommonPassword(value: string, validation: Validation): string | undefined {
  if (validation.rejectCommon && dumbPasswords.check(value)) {
    return 'Password is too common and is not allowed'
  }
  return undefined
}

/**
 * Main validation function for password field
 */
function validatePassword(
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
    return 'The passwords do not match'
  }
  if (value.kind === 'editing') {
    const val = value.value
    const lengthError = validateLength(val, validation)
    if (lengthError) return lengthError
    const regexError = validateRegex(val, validation)
    if (regexError) return regexError
    const commonError = validateCommonPassword(val, validation)
    if (commonError) return commonError
  }
  return undefined
}

/**
 * Props for readonly checkbox
 */
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

/**
 * Props for password input field
 */
type PasswordInputProps = {
  autoFocus?: boolean
  ariaLabel: string
  ariaDescribedBy: string
  isInvalid: boolean
  onBlur: () => void
  onChange: (text: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  placeholder: string
  type: 'password' | 'text'
  value: string
  flex?: boolean
}

/**
 * Password input field component
 */
function PasswordInput({
  autoFocus,
  ariaLabel,
  ariaDescribedBy,
  isInvalid,
  onBlur,
  onChange,
  onKeyDown,
  placeholder,
  type,
  value,
  flex,
}: PasswordInputProps) {
  return (
    <TextField
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      // @ts-expect-error — needs to be fixed in "@keystar/ui"
      isInvalid={isInvalid}
      onBlur={onBlur}
      onChange={onChange}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      type={type}
      value={value}
      flex={flex}
    />
  )
}

/**
 * Props for confirm input field
 */
type ConfirmInputProps = {
  ariaLabel: string
  ariaDescribedBy: string
  isInvalid: boolean
  onBlur: () => void
  onChange: (text: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  placeholder: string
  type: 'password' | 'text'
  value: string
  flex?: boolean
}

/**
 * Confirm input field component
 */
function ConfirmInput({
  ariaLabel,
  ariaDescribedBy,
  isInvalid,
  onBlur,
  onChange,
  onKeyDown,
  placeholder,
  type,
  value,
  flex,
}: ConfirmInputProps) {
  return (
    <TextField
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      // @ts-expect-error — needs to be fixed in "@keystar/ui"
      isInvalid={isInvalid}
      onBlur={onBlur}
      onChange={onChange}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      type={type}
      value={value}
      flex={flex}
    />
  )
}

/**
 * Props for show/hide toggle button
 */
type ShowHideToggleProps = {
  isSelected: boolean
  onPress: () => void
}

/**
 * Show/hide password toggle button component
 */
function ShowHideToggle({ isSelected, onPress }: ShowHideToggleProps) {
  return (
    <ToggleButton
      aria-label="show"
      isSelected={isSelected}
      onPress={onPress}
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
  )
}

/**
 * Props for cancel button
 */
type CancelButtonProps = {
  onPress: () => void
}

/**
 * Cancel editing button component
 */
function CancelButton({ onPress }: CancelButtonProps) {
  return <ActionButton onPress={onPress}>Cancel</ActionButton>
}

/**
 * Props for password action button
 */
type PasswordActionProps = {
  onPress: () => void
  isSet: boolean
  label: string
}

/**
 * Set/Change password action button component
 */
function PasswordAction({ onPress, isSet, label }: PasswordActionProps) {
  return (
    <ActionButton
      alignSelf="start"
      onPress={onPress}
    >
      {isSet ? `Change ` : `Set `}
      {label.toLocaleLowerCase()}
    </ActionButton>
  )
}

/**
 * Props for field message
 */
type FieldMessageProps = {
  id: string
  message: string
}

/**
 * Field message component
 */
function FieldMessage({ id, message }: FieldMessageProps) {
  return <FieldMessage id={id}>{message}</FieldMessage>
}

/**
 * Props for field description
 */
type FieldDescriptionProps = {
  id: string
  description: string
}

/**
 * Field description component
 */
function FieldDescription({ id, description }: FieldDescriptionProps) {
  return (
    <Text id={id} size="regular" color="neutralSecondary">
      {description}
    </Text>
  )
}

/**
 * Props for field label
 */
type FieldLabelProps = {
  id: string
  label: string
}

/**
 * Field label component
 */
function FieldLabel({ id, label }: FieldLabelProps) {
  return <FieldLabel elementType="span" id={id}>{label}</FieldLabel>
}

/**
 * Props for password field container
 */
type PasswordFieldContainerProps = {
  children: React.ReactNode
  labelId: string
  descriptionId: string
  messageId: string
}

/**
 * Password field container component
 */
function PasswordFieldContainer({
  children,
  labelId,
  descriptionId,
  messageId,
}: PasswordFieldContainerProps) {
  return (
    <VStack
      role="group"
      aria-labelledby={labelId}
      aria-describedby={descriptionId}
      gap="medium"
      minWidth={0}
    >
      {children}
    </VStack>
  )
}

/**
 * Props for input container
 */
type InputContainerProps = {
  children: React.ReactNode
}

/**
 * Input container component
 */
function InputContainer({ children }: InputContainerProps) {
  return (
    <Flex
      gap="regular"
      UNSAFE_className={css({
        [containerQueries.below.tablet]: {
          flexDirection: 'column',
        },
      })}
    >
      {children}
    </Flex>
  )
}

/**
 * Props for button container
 */
type ButtonContainerProps = {
  children: React.ReactNode
}

/**
 * Button container component
 */
function ButtonContainer({ children }: ButtonContainerProps) {
  return (
    <Flex gap="regular">
      {children}
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
      ? validatePassword(value, field.validation, props.isRequired, field.label)
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

  // reset when the user cancels, or when the form is submitted
  useEffect(() => {
    if (value.kind === 'initial') {
      setTouched({ value: false, confirm: false })
      setSecureTextEntry(true)
    }
  }, [value.kind])

  return (
    <PasswordFieldContainer
      labelId={labelId}
      descriptionId={descriptionId}
      messageId={messageId}
    >
      <FieldLabel id={labelId}>{field.label}</FieldLabel>
      {field.description && <FieldDescription id={descriptionId} description={field.description} />}
      
      {isReadOnly ? (
        <Checkbox {...readonlyCheckboxProps(value.isSet)} />
      ) : value.kind === 'initial' ? (
        <PasswordAction
          onPress={() => {
            onChange({
              kind: 'editing',
              confirm: '',
              value: '',
              isSet: value.isSet,
            }}
          }
          isSet={value.isSet}
          label={field.label}
        />
      ) : (
        <InputContainer>
          <PasswordInput
            autoFocus
            ariaLabel={`new ${field.label}`}
            ariaDescribedBy={[descriptionId, messageId].filter(Boolean).join(' ')}
            // @ts-expect-error — needs to be fixed in "@keystar/ui"
            isInvalid={!!validationMessage}
            onBlur={() => setTouched({ ...touched, value: true })}
            onChange={text => onChange({ ...value, value: text })}
            onKeyDown={onEscape}
            placeholder="New"
            type={secureTextEntry ? 'password' : 'text'}
            value={value.value}
            flex
          />
          <ConfirmInput
            ariaLabel={`confirm ${field.label}`}
            ariaDescribedBy={messageId}
            // @ts-expect-error — needs to be fixed in "@keystar/ui"
            isInvalid={!!validationMessage}
            onBlur={() => setTouched({ ...touched, confirm: true })}
            onChange={text => onChange({ ...value, confirm: text })}
            onKeyDown={onEscape}
            placeholder="Confirm"
            type={secureTextEntry ? 'password' : 'text'}
            value={value.confirm}
            flex
          />

          <ButtonContainer>
            <ShowHideToggle
              isSelected={!secureTextEntry}
              onPress={() => setSecureTextEntry(bool => !bool)}
            />
            <CancelButton onPress={cancelEditing} />
          </ButtonContainer>
        </InputContainer>
      )}
      {validationMessage && <FieldMessage id={messageId} message={validationMessage} />}
    </PasswordFieldContainer>
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
      validatePassword(state, validation, opts.isRequired, config.label) === undefined,
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