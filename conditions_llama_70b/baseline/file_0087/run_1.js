const onSelectionChange = (key: Key | null) => {
  if (!onChange) return

  const newValue = field.options.find(opt => opt.value === key)?.value ?? null

  onChange({ ...value, value: { value: newValue, kind: value.kind } })
  setDirty(true)
}