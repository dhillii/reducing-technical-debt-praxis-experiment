function validate(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  fieldLabel: string
): string | undefined {
  if (value.kind === 'initial') {
    return handleInitialValue(value, isRequired, fieldLabel)
  }
  if (value.kind === 'editing') {
    return handleEditingValue(value, validation, fieldLabel)
  }
  return undefined
}

/**
 * Handles validation logic for 'initial' value kinds.
 */
function handleInitialValue(
  value: Exclude<Value, { kind: 'editing' }>,
  isRequired: boolean,
  fieldLabel: string
): string | undefined {
  if (value.isSet === null || value.isSet === true) {
    return undefined
  }
  if (isRequired) {
    return `${fieldLabel} is required`
  }
  return undefined
}

/**
 * Handles validation logic for 'editing' value kinds.
 */
function handleEditingValue(
  value: Extract<Value, { kind: 'editing' }>,
  validation: Validation,
  fieldLabel: string
): string | undefined {
  if (value.confirm !== value.value) {
    return `The passwords do not match`
  }

  const val = value.value
  const lengthViolation = validateLength(val, validation.length, fieldLabel)
  if (lengthViolation) return lengthViolation

  if (validation.match && !validation.match.regex.test(val)) {
    return validation.match.explanation
  }

  if (validation.rejectCommon && dumbPasswords.check(val)) {
    return `${fieldLabel} is too common and is not allowed`
  }

  return undefined
}

/**
 * Validates password length constraints.
 */
function validateLength(
  password: string,
  lengthRules: { min: number; max: number | null },
  fieldLabel: string
): string | undefined {
  if (password.length < lengthRules.min) {
    return lengthRules.min === 1
      ? `${fieldLabel} must not be empty`
      : `${fieldLabel} must be at least ${lengthRules.min} characters long`
  }

  if (lengthRules.max !== null && password.length > lengthRules.max) {
    return `${fieldLabel} must be no longer than ${lengthRules.max} characters`
  }

  return undefined
}