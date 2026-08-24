function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  if (!parent) {
    return undefined
  }

  const confluenceAlignment = getConfluenceAlignment(parent)
  if (confluenceAlignment) {
    return confluenceAlignment
  }

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

/**
 * Returns alignment value if present on parent element's data-align attribute.
 */
function getConfluenceAlignment(parent: globalThis.Element): 'center' | 'end' | undefined {
  const attribute = parent.getAttribute('data-align')
  if (attribute === 'center' || attribute === 'end') {
    return attribute as 'center' | 'end'
  }
  return undefined
}