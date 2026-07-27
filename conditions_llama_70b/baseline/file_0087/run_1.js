const onSelectionChange = (key: Key | null) => {
  if (!onChange) return

  const newValue = field.options.find(opt => opt.value === key)
  onChange({ ...value, value: newValue ? { value: newValue.value } : null })
  setDirty(true)
}