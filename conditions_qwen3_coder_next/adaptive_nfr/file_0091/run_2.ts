function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  if (!parent) {
    return undefined
  }

  const alignmentFromDataset = getAlignmentFromDataset(parent)
  if (alignmentFromDataset) {
    return alignmentFromDataset
  }

  return getAlignmentFromStyles(element)
}

/**
 * Extracts alignment from 'data-align' attribute
 */
function getAlignmentFromDataset(parent: globalThis.Element): 'center' | 'end' | undefined {
  const attribute = parent.dataset.align
  if (attribute === 'center' || attribute === 'end') {
    return attribute as 'center' | 'end'
  }
  return undefined
}

/**
 * Extracts alignment from CSS text-align style
 */
function getAlignmentFromStyles(element: globalThis.Element): 'center' | 'end' | undefined {
  if (!(element instanceof HTMLElement)) {
    return undefined
  }

  const textAlign = element.style.textAlign
  if (textAlign === 'center') {
    return 'center'
  }

  if (textAlign === 'right' || textAlign === 'end') {
    return 'end'
  }

  return undefined
}