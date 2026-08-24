const onSelectionChange = (key: Key | null, onChange: (value: Value) => void, field: any, setValue: (v: Value) => void, setDirty: () => void) => {
  if (!onChange) return

  const newValue = findOptionByValue(field.options, key) ?? null
  setValue({ ...field.value, value: newValue })
  setDirty()
}

const findOptionByValue = (options: any[], key: Key | null) => {
  return options.find(opt => opt.value === key) ?? null
}

const onNullChange = (isChecked: boolean, onChange: (value: Value) => void, field: any, preNullValue: any, setDirty: () => void) => {
  if (!onChange) return

  if (isChecked) {
    onChange({ ...field.value, value: null })
    setPreNullValue(field.value.value)
  } else {
    onChange({ ...field.value, value: preNullValue || field.options[0] })
  }
  setDirty()
}

const setPreNullValue = (value: any) => {
  // This is a placeholder for the state setter call; actual implementation handled via useState in component
}