export function Field({
  field,
  value,
  onChange,
  autoFocus,
  forceValidation,
  isRequired,
}: FieldProps<typeof controller>) {
  const [isDirty, setDirty] = useState(false)
  const isReadOnly = !onChange || field.hasAutoIncrementDefault

  if (shouldRenderAutoIncrementField({ field, value })) {
    return renderAutoIncrementField({ field, autoFocus })
  }

  const validationMessage = (forceValidation || isDirty) && validateValue({ value, field, isRequired })

  return (
    <NumberField
      autoFocus={autoFocus}
      description={field.description}
      label={field.label}
      errorMessage={validationMessage}
      isReadOnly={isReadOnly}
      isRequired={isRequired}
      width="alias.singleLineWidth"
      onBlur={() => setDirty(true)}
      onChange={x => onChange?.({ ...value, value: !Number.isFinite(x) ? null : x })}
      value={value.value ?? NaN}
    />
  )
}

/**
 * Indicates whether to render the auto-increment field variant.
 */
function shouldRenderAutoIncrementField({
  field,
  value,
}: {
  field: { hasAutoIncrementDefault: boolean }
  value: { kind: string }
}): boolean {
  return field.hasAutoIncrementDefault && value.kind === 'create'
}

/**
 * Renders the auto-increment field with contextual help.
 */
function renderAutoIncrementField({
  field,
  autoFocus,
}: {
  field: { description?: string; label: string }
  autoFocus: boolean | undefined
}) {
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

/**
 * Validates the field value and returns an error message if invalid.
 */
function validateValue({
  value,
  field,
  isRequired,
}: {
  value: Value
  field: { validation: Validation; label: string; hasAutoIncrementDefault: boolean }
  isRequired: boolean | undefined
}): string | undefined {
  return validate_(
    value,
    field.validation,
    isRequired ?? false,
    field.label,
    field.hasAutoIncrementDefault
  )
}