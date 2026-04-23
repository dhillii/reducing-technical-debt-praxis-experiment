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

function isLengthTooShort(val: string, min: number): boolean {
  return val.length < min
}

function isLengthTooLong(val: string, max: number | null): boolean {
  return max !== null && val.length > max
}

function failsMatch(val: string, match: Validation['match']): boolean {
  return !!match && !match.regex.test(val)
}

function isCommonPassword(val: string, rejectCommon: boolean): boolean {
  return rejectCommon && dumbPasswords.check(val)
}

/**
 * Returns a validation message for the given password value or undefined if valid.
 */
function getValidationMessage(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  fieldLabel: string
): string | undefined {
  // Initial state handling
  if (value.kind === 'initial') {
    if (value.isSet === null || value.isSet === true) {
      return undefined
    }
    if (isRequired) {
      return `${fieldLabel} is required`
    }
    return undefined
  }

  // Editing state handling
  if (value.kind === 'editing') {
    if (value.confirm !== value.value) {
      return `The passwords do not match`
    }

    const val = value.value

    if (isLengthTooShort(val, validation.length.min)) {
      return validation.length.min === 1
        ? `${fieldLabel} must not be empty`
        : `${fieldLabel} must be at least ${validation.length.min} characters long`
    }

    if (isLengthTooLong(val, validation.length.max)) {
      return `${fieldLabel} must be no longer than ${validation.length.max} characters`
    }

    if (failsMatch(val, validation.match)) {
      return validation.match!.explanation
    }

    if (isCommonPassword(val, validation.rejectCommon)) {
      return `${fieldLabel} is too common and is not allowed`
    }
  }

  return undefined
}

/**
 * Returns props for a read‑only checkbox representing the password's set state.
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
 * Renders the read‑only view of the password field.
 */
function ReadOnlyField({ value }: { value: Value }) {
  return <Checkbox {...readonlyCheckboxProps(value.isSet)} />
}

/**
 * Renders the initial (non‑editing) view with an action button.
 */
function InitialField({
  autoFocus,
  field,
  onChange,
  value,
  triggerRef,
}: {
  autoFocus: boolean
  field: any
  onChange?: (v: Value) => void
  value: Value
  triggerRef: React.RefObject<HTMLButtonElement>
}) {
  return (
    <ActionButton
      ref={triggerRef}
      alignSelf="start"
      autoFocus={autoFocus}
      onPress={() => {
        onChange?.({
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

/**
 * Renders the editing view with password and confirm fields plus controls.
 */
function EditingField({
  field,
  value,
  onChange,
  onEscape,
  setTouched,
  touched,
  secureTextEntry,
  setSecureTextEntry,
  cancelEditing,
}: {
  field: any
  value: Value
  onChange?: (v: Value) => void
  onEscape: (e: React.KeyboardEvent) => void
  setTouched: React.Dispatch<React.SetStateAction<{ value: boolean; confirm: boolean }>>
  touched: { value: boolean; confirm: boolean }
  secureTextEntry: boolean
  setSecureTextEntry: React.Dispatch<React.SetStateAction<boolean>>
  cancelEditing: () => void
}) {
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
        aria-describedby={field.description ? field.description : undefined}
        // @ts-expect-error — needs to be fixed in "@keystar/ui"
        isInvalid={false}
        onBlur={() => setTouched({ ...touched, value: true })}
        onChange={text => onChange?.({ ...value, value: text })}
        onKeyDown={onEscape}
        placeholder="New"
        type={secureTextEntry ? 'password' : 'text'}
        value={value.value}
        flex
      />
      <TextField
        aria-label={`confirm ${field.label}`}
        // @ts-expect-error — needs to be fixed in "@keystar/ui"
        isInvalid={false}
        onBlur={() => setTouched({ ...touched, confirm: true })}
        onChange={text => onChange?.({ ...value, confirm: text })}
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
      ? getValidationMessage(value, field.validation, props.isRequired, field.label)
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

  // Reset state when editing is cancelled or form is submitted
  useEffect(() => {
    if (value.kind === 'initial') {
      setTouched({ value: false, confirm: false })
      setSecureTextEntry(true)
    }
  }, [value.kind])

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
      {isReadOnly ? (
        <ReadOnlyField value={value} />
      ) : value.kind === 'initial' ? (
        <InitialField
          autoFocus={autoFocus}
          field={field}
          onChange={onChange}
          value={value}
          triggerRef={triggerRef}
        />
      ) : (
        <EditingField
          field={field}
          value={value}
          onChange={onChange}
          onEscape={onEscape}
          setTouched={setTouched}
          touched={touched}
          secureTextEntry={secureTextEntry}
          setSecureTextEntry={setSecureTextEntry}
          cancelEditing={cancelEditing}
        />
      )}
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

export function controller(
  config: FieldControllerConfig<PasswordFieldMeta>
): FieldController<Value, boolean | null, { isSet?: boolean | null | undefined }> & {
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
      getValidationMessage(state, validation, opts.isRequired, config.label) === undefined,
    deserialize: data => ({
      kind: 'initial',
      isSet: data[config.fieldKey]?.isSet ?? null,
    }),
    serialize: value => {
      if (value.kind === 'initial') return {}
      return { [config.fieldKey]: value.value }
    },
    filter:
      config.fieldMeta.isNullable === false
        ? undefined
        : {
            Filter(props) {
              const { autoFocus, typeLabel, onChange, value, ...otherProps } = props
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