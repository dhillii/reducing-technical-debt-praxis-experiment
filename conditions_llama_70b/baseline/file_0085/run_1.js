function validate(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  fieldLabel: string
): string | undefined {
  if (value.kind === 'initial') {
    return isRequired ? `${fieldLabel} is required` : undefined
  }

  if (value.kind === 'editing') {
    if (value.confirm !== value.value) {
      return `The passwords do not match`
    }

    const val = value.value
    const errors = getValidationErrors(val, validation, fieldLabel)
    return errors.length > 0 ? errors[0] : undefined
  }

  return undefined
}

function getValidationErrors(
  value: string,
  validation: Validation,
  fieldLabel: string
): string[] {
  const errors: string[] = []

  if (value.length < validation.length.min) {
    errors.push(
      validation.length.min === 1
        ? `${fieldLabel} must not be empty`
        : `${fieldLabel} must be at least ${validation.length.min} characters long`
    )
  }

  if (validation.length.max !== null && value.length > validation.length.max) {
    errors.push(`${fieldLabel} must be no longer than ${validation.length.max} characters`)
  }

  if (validation.match && !validation.match.regex.test(value)) {
    errors.push(validation.match.explanation)
  }

  if (validation.rejectCommon && dumbPasswords.check(value)) {
    errors.push(`${fieldLabel} is too common and is not allowed`)
  }

  return errors
}