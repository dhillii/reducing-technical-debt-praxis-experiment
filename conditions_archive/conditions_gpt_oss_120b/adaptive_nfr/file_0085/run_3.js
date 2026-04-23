```tsx
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

/**
 * Validate a password field value.
 */
function validate(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  fieldLabel: string
): string | undefined {
  if (isInitialAndSet(value)) return undefined
  if (isInitialMissingRequired(value, isRequired)) return `${fieldLabel} is required`
  if (isEditingMismatch(value)) return `The passwords do not match`
  if (value.kind === 'editing') {
    const val = value.value
    const lengthError = getLengthError(val, validation.length, fieldLabel)
    if (lengthError) return lengthError
    if (validation.match && !validation.match.regex.test(val)) {
      return validation.match.explanation
    }
    if (validation.rejectCommon && dumbPasswords.check(val)) {
      return `${fieldLabel} is too common and is not allowed`
    }
  }
  return undefined
}

/** @returns true when the value is in the initial state and considered set */
function isInitialAndSet(value: Value): boolean {
  return value.kind === 'initial' && (value.isSet === null || value.isSet === true)
}

/** @returns true when the initial value is required but not set */
function isInitialMissingRequired(value: Value, isRequired: boolean): boolean {
  return value.kind === 'initial' && isRequired
}

/** @returns true when editing values do not match */
function isEditingMismatch(value: Value): boolean {
  return value.kind === 'editing' && value.confirm !== value.value
}

/** @returns an error message for length violations or undefined */
function getLengthError(
  val: string,
  length: { min: number; max: number | null },
  fieldLabel: string
): string | undefined {
  if (val.length < length.min) {
    return length.min === 1
      ? `${fieldLabel} must not be empty`
      : `${fieldLabel} must be at least ${length.min} characters long`
  }
  if (length.max !== null && val.length > length.max) {
    return `${fieldLabel} must be no longer than ${length.max} characters`
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

/** Read‑only view */
function ReadOnlyView({ value }: { value: Value }) {
  return <Checkbox {...readonlyCheckboxProps(value.isSet)} />
}

/** Initial (non‑editing) view */
function InitialView({
  field,
  value,
  onChange,
  autoFocus,
  triggerRef,
}: {
  field: any
  value: Value
  onChange?: (v: Value) => void
  autoFocus?: boolean
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

/** Editing view */
function EditingView({
  field,
  value,
  onChange,
  touched,
  setTouched,
  secureTextEntry,
  setSecureTextEntry,
  triggerRef,
  onEscape,
}: {
  field: any
  value: Value
  onChange?: (v: Value) => void
  touched: { value: boolean; confirm: boolean }
  setTouched: React.Dispatch<React.SetStateAction<{ value: boolean; confirm: boolean }>>
  secureTextEntry: boolean
  setSecureTextEntry: React.Dispatch<React.SetStateAction<boolean>>
  triggerRef: React.RefObject<HTMLButtonElement>
  onEscape: (e: React.KeyboardEvent) => void
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
        aria-describedby={[field.descriptionId, field.messageId].filter(Boolean).join(' ')}
        // @ts-expect-error — needs to be fixed in "@keystar/ui"
        isInvalid={!!field.validationMessage}
        onBlur={() => setTouched((t) => ({ ...t, value: true }))}
        onChange={(text) => onChange?.({ ...value, value: text })}
        onKeyDown={onEscape}
        placeholder="New"
        type={secureTextEntry ? 'password' : 'text'}
        value={value.value}
        flex
      />
      <TextField
        aria-label={`confirm ${field.label}`}
        aria-describedby={field.messageId}
        // @ts-expect-error — needs to be fixed in "@keystar/ui"
        isInvalid={!!field.validationMessage}
        onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
        onChange={(text) => onChange?.({ ...value, confirm: text })}
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
          onPress={() => setSecureTextEntry((b) => !b)}
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
        <ActionButton onPress={() => {
          onChange?.({ kind: 'initial', isSet: value.isSet })
          setTimeout(() => {
            triggerRef.current?.focus()
          }, 0)
        }}>
          Cancel
        </ActionButton>
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

  const onEscape = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape' || value.kind !== 'editing') return
    if (value.value === '' && value.confirm === '') {
      onChange?.({ kind: 'initial', isSet: value.isSet })
      setTimeout(() => {
        triggerRef.current?.focus()
      }, 0)
    }
  }

  useEffect(() => {
    if (value.kind === 'initial') {
      setTouched({ value: false, confirm: false })
      setSecureTextEntry(true)
    }
  }, [value.kind])

  const sharedProps = {
    field: { ...field, descriptionId, messageId, validationMessage },
    value,
    onChange,
    autoFocus,
    triggerRef,
    touched,
    setTouched,
    secureTextEntry,
    setSecureTextEntry,
    onEscape,
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
      {isReadOnly ? (
        <ReadOnlyView value={value} />
      ) : value.kind === 'initial' ? (
        <InitialView {...sharedProps} />
      ) : (
        <EditingView {...sharedProps} />
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
      validate(state, validation, opts.isRequired, config.label) === undefined,
    deserialize: (data) => ({
      kind: 'initial',
      isSet: data[config.fieldKey]?.isSet ?? null,
    }),
    serialize: (value) => {
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
            parseGraphQL: (value) => {
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