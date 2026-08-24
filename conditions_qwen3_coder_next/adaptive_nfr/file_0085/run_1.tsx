function validate(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  fieldLabel: string
): string | undefined {
  if (isInitialAndNotSetOrUnchanged(value)) {
    return undefined
  }
  if (isInitialAndRequiredButUnset(value, isRequired)) {
    return `${fieldLabel} is required`
  }
  if (isEditingAndPasswordsDoNotMatch(value)) {
    return `The passwords do not match`
  }
  if (value.kind === 'editing') {
    return validateEditingValue(value.value, validation, fieldLabel)
  }
  return undefined
}

/**
 * Check if value is 'initial' and either unset or unchanged (i.e., isSet is null or true)
 */
function isInitialAndNotSetOrUnchanged(value: Value): boolean {
  return value.kind === 'initial' && (value.isSet === null || value.isSet === true)
}

/**
 * Check if value is 'initial', required, but unset (isSet === false)
 */
function isInitialAndRequiredButUnset(value: Value, isRequired: boolean): boolean {
  return value.kind === 'initial' && isRequired && value.isSet === false
}

/**
 * Check if value is 'editing' and confirm does not match value
 */
function isEditingAndPasswordsDoNotMatch(value: Value): boolean {
  return value.kind === 'editing' && value.confirm !== value.value
}

/**
 * Validate the editing value against all validation rules
 */
function validateEditingValue(
  val: string,
  validation: Validation,
  fieldLabel: string
): string | undefined {
  if (val.length < validation.length.min) {
    return validation.length.min === 1
      ? `${fieldLabel} must not be empty`
      : `${fieldLabel} must be at least ${validation.length.min} characters long`
  }
  if (validation.length.max !== null && val.length > validation.length.max) {
    return `${fieldLabel} must be no longer than ${validation.length.max} characters`
  }
  if (validation.match && !validation.match.regex.test(val)) {
    return validation.match.explanation
  }
  if (validation.rejectCommon && dumbPasswords.check(val)) {
    return `${fieldLabel} is too common and is not allowed`
  }
  return undefined
}