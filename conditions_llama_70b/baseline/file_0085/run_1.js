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
    const errors = [
      validateLength(val, validation.length, fieldLabel),
      validateMatch(val, validation.match, fieldLabel),
      validateCommon(val, validation.rejectCommon, fieldLabel),
    ]

    return errors.find(error => error !== undefined)
  }

  return undefined
}

function validateLength(val: string, length: { min: number; max: number | null }, fieldLabel: string): string | undefined {
  if (val.length < length.min) {
    return length.min === 1 ? `${fieldLabel} must not be empty` : `${fieldLabel} must be at least ${length.min} characters long`
  }

  if (length.max !== null && val.length > length.max) {
    return `${fieldLabel} must be no longer than ${length.max} characters`
  }

  return undefined
}

function validateMatch(val: string, match: { regex: RegExp; explanation: string } | null, fieldLabel: string): string | undefined {
  if (match === null) return undefined
  if (!match.regex.test(val)) return match.explanation
  return undefined
}

function validateCommon(val: string, rejectCommon: boolean, fieldLabel: string): string | undefined {
  if (!rejectCommon) return undefined
  if (dumbPasswords.check(val)) return `${fieldLabel} is too common and is not allowed`
  return undefined
}