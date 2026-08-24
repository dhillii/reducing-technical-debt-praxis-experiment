function validate(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  fieldLabel: string
): string | undefined {
  if (value.kind === 'initial') {
    if (value.isSet === null || value.isSet === true) {
      return undefined
    }
    if (isRequired) {
      return `${fieldLabel} is required`
    }
    return undefined
  }

  if (value.kind !== 'editing') {
    return undefined
  }

  if (value.confirm !== value.value) {
    return `The passwords do not match`
  }

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

  if (validation.match && !validation.match.regex.test(val)) {
    return validation.match.explanation
  }

  if (validation.rejectCommon && dumbPasswords.check(val)) {
    return `${fieldLabel} is too common and is not allowed`
  }

  return undefined
}