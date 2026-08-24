function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement

  if (!parent) {
    return undefined
  }

  const alignmentFromDataAlign = getAlignmentFromDataAlign(parent)
  if (alignmentFromDataAlign) {
    return alignmentFromDataAlign
  }

  if (!(element instanceof HTMLElement)) {
    return undefined
  }

  return getAlignmentFromTextAlign(element.style.textAlign)
}

/**
 * Extracted predicate: checks if data-align attribute has valid alignment value
 */
function getAlignmentFromDataAlign(parent: globalThis.Element): 'center' | 'end' | undefined {
  const attribute = parent.dataset.align
  if (attribute === 'center' || attribute === 'end') {
    return attribute
  }
  return undefined
}

/**
 * Extracted predicate: maps textAlign style to alignment value
 */
function getAlignmentFromTextAlign(textAlign: string): 'center' | 'end' | undefined {
  if (textAlign === 'center') {
    return 'center'
  }
  if (textAlign === 'right' || textAlign === 'end') {
    return 'end'
  }
  return undefined
}