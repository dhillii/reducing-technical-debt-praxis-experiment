const sortByFieldAndOrder = (fieldKey, a, b) => {
  if (a[fieldKey] === null && b[fieldKey] === null) return 0;
  if (a[fieldKey] === null) return 1;
  if (b[fieldKey] === null) return -1;
  if (a[fieldKey] === b[fieldKey]) return 0;
  return a[fieldKey] < b[fieldKey] ? -1 : 1;
};

const sortByField = (field) => (a, b) => {
  if (!field) {
    return 0;
  }

  const fieldKey = this.normalizeFieldKey(field);
  const sortIsRegular = this.sortOrderRegular(field);

  const first = sortIsRegular ? a : b;
  const second = sortIsRegular ? b : a;

  return sortByFieldAndOrder(fieldKey, first, second);
};