function isCenterOrEnd(value: string | undefined): value is 'center' | 'end' {
  /** @returns true if the value is 'center' or 'end' */
  return value === 'center' || value === 'end';
}

function isRightOrEnd(value: string | undefined): boolean {
  /** @returns true if the value is 'right' or 'end' */
  return value === 'right' || value === 'end';
}

function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement;
  const align = parent?.dataset.align;
  if (isCenterOrEnd(align)) {
    return align;
  }
  if (!(element instanceof HTMLElement)) {
    return undefined;
  }
  const textAlign = element.style.textAlign;
  if (textAlign === 'center') {
    return 'center';
  }
  if (isRightOrEnd(textAlign)) {
    return 'end';
  }
  return undefined;
}