const onSelectionChange = (key: Key | null, onChange: (value: Value) => void, fieldOptions: Value['value']['value'][]): void => {
  if (!onChange) return

  const newValue = findOptionByValue(fieldOptions, key) ?? null
  onChange({ ...value, value: newValue })
  setDirty(true)
}

const findOptionByValue = (options: Value['value']['value'][], key: Key | null): Value['value']['value'] | undefined => {
  return options.find(opt => opt.value === key)
}

const onNullChange = (isChecked: boolean, onChange: (value: Value) => void, value: Value, preNullValue: Value['value'] | null, fieldOptions: Value['value']['value'][]): void => {
  if (!onChange) return

  if (isChecked) {
    onChange({ ...value, value: null })
    setPreNullValue(value.value)
  } else {
    onChange({ ...value, value: preNullValue || fieldOptions[0] })
  }
  setDirty(true)
}