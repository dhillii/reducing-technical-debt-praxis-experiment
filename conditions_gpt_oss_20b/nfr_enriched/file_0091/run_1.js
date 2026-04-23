import { Node } from 'slate'
import { type Block, isBlock } from '../editor-shared'
import { type Mark } from '../utils'
import {
  type InlineFromExternalPaste,
  addMarksToChildren,
  getInlineNodes,
  forceDisableMarkForChildren,
  setLinkForChildren,
} from './utils'

/**
 * Retrieve alignment from an element or its parent.
 * Uses dataset for data attributes.
 */
function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  const attribute = parent?.dataset.align
  if (attribute === 'center' || attribute === 'end') {
    return attribute
  }
  if (element instanceof HTMLElement) {
    const textAlign = element.style.textAlign
    if (textAlign === 'center') return 'center'
    if (textAlign === 'right' || textAlign === 'end') return 'end'
  }
}

/**
 * Map node names to text marks.
 */
const TEXT_TAGS: Record<string, Mark | undefined> = {
  CODE: 'code',
  DEL: 'strikethrough',
  S: 'strikethrough',
  STRIKE: 'strikethrough',
  EM: 'italic',
  I: 'italic',
  STRONG: 'bold',
  U: 'underline',
  SUP: 'superscript',
  SUB: 'subscript',
  KBD: 'keyboard',
}

/**
 * Determine marks from element attributes and styles.
 */
function marksFromElementAttributes(element: globalThis.HTMLElement): Set<Mark> {
  const marks = new Set<Mark>()
  const style = element.style
  const { nodeName } = element

  const markFromNodeName = TEXT_TAGS[nodeName]
  if (markFromNodeName) marks.add(markFromNodeName)

  const { fontWeight, textDecoration, verticalAlign } = style

  if (textDecoration === 'underline') marks.add('underline')
  else if (textDecoration === 'line-through') marks.add('strikethrough')

  if (nodeName === 'SPAN' && element.classList.contains('code')) marks.add('code')

  if (nodeName === 'B' && fontWeight !== 'normal') marks.add('bold')
  else if (
    typeof fontWeight === 'string' &&
    (fontWeight === 'bold' ||
      fontWeight === 'bolder' ||
      fontWeight === '1000' ||
      /^[5-9]\d{2}$/.test(fontWeight))
  )
    marks.add('bold')

  if (style.fontStyle === 'italic') marks.add('italic')

  if (verticalAlign === 'super') marks.add('superscript')
  else if (verticalAlign === 'sub') marks.add('subscript')

  return marks
}

/**
 * Heading level mapping.
 */
const headings: Record<string, (Node & { type: 'heading' })['level'] | undefined> = {
  H1: 1,
  H2: 2,
  H3: 3,
  H4: 4,
  H5: 5,
  H6: 6,
}

/**
 * Deserialize a string of HTML into Slate nodes.
 */
export function deserializeHTML(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

type DeserializedNode = InlineFromExternalPaste | Block
type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]

/**
 * Deserialize a single DOM node into Slate nodes.
 */
export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!(el instanceof globalThis.HTMLElement)) {
    const text = el.textContent
    if (!text) return []
    return getInlineNodes(text)
  }

  if (el.nodeName === 'BR') return getInlineNodes('\n')
  if (el.nodeName === 'IMG') {
    const alt = el.getAttribute('alt')
    return getInlineNodes(alt ?? '')
  }
  if (el.nodeName === 'HR') return [{ type: 'divider', children: [{ text: '' }] }]

  const marks = marksFromElementAttributes(el)

  // Dropbox Paper displays blockquotes as lists for some reason
  if (el.classList.contains('listtype-quote')) {
    marks.delete('italic')
    return addMarksToChildren(marks, () => [
      { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
    ])
  }

  return addMarksToChildren(marks, () => {
    const { nodeName } = el
    const children = fixNodesForBlockChildren(deserializeNodes(el.childNodes))

    switch (nodeName) {
      case 'A':
        return handleAnchor(el, children)
      case 'PRE':
        return handlePre(el)
      case 'LI':
        return handleListItem(el, children)
      case 'P':
        return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
      case 'BLOCKQUOTE':
        return [{ type: 'blockquote', children }]
      case 'OL':
        return [{ type: 'ordered-list', children }]
      case 'UL':
        return [{ type: 'unordered-list', children }]
      case 'DIV':
        return handleDiv(el, children)
      default:
        return children
    }
  })
}

/**
 * Handle <a> elements, applying link and disabling underline.
 */
function handleAnchor(el: globalThis.HTMLElement, children: DeserializedNode[]): DeserializedNode[] {
  const href = el.getAttribute('href')
  if (!href) return []
  return setLinkForChildren(href, () =>
    forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
  )
}

/**
 * Handle <pre> elements as code blocks.
 */
function handlePre(el: globalThis.HTMLElement): DeserializedNode[] {
  if (!el.textContent) return []
  return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
}

/**
 * Handle <li> elements, separating nested lists.
 */
function handleListItem(el: globalThis.HTMLElement, children: DeserializedNode[]): DeserializedNode[] {
  let nestedList: Block | undefined
  const listItemContent = {
    type: 'list-item-content' as const,
    children: children.filter(node => {
      if (
        nestedList === undefined &&
        (node.type === 'ordered-list' || node.type === 'unordered-list')
      ) {
        nestedList = node
        return false
      }
      return true
    }),
  }
  const listItemChildren = nestedList ? [listItemContent, nestedList] : [listItemContent]
  return [{ type: 'list-item', children: listItemChildren }]
}

/**
 * Handle <div> elements that are not block-level.
 */
function handleDiv(el: globalThis.HTMLElement, children: DeserializedNode[]): DeserializedNode[] {
  if (!isBlock(children[0])) return [{ type: 'paragraph', children }]
  return children
}

/**
 * Deserialize an iterable of DOM nodes into Slate nodes.
 */
function deserializeNodes(nodes: Iterable<globalThis.Node>): DeserializedNode[] {
  const outputNodes: (InlineFromExternalPaste | Block)[] = []
  for (const node of nodes) {
    outputNodes.push(...deserializeHTMLNode(node))
  }
  return outputNodes
}

/**
 * Ensure block children are properly wrapped and inlines are grouped.
 */
function fixNodesForBlockChildren(deserializedNodes: DeserializedNode[]): DeserializedNodes {
  if (!deserializedNodes.length) return [{ text: '' }]

  if (deserializedNodes.some(isBlock)) {
    const result: DeserializedNode[] = []
    let queuedInlines: InlineFromExternalPaste[] = []

    const flushInlines = () => {
      if (queuedInlines.length) {
        result.push({ type: 'paragraph', children: queuedInlines })
        queuedInlines = []
      }
    }

    for (const node of deserializedNodes) {
      if (isBlock(node)) {
        flushInlines()
        result.push(node)
        continue
      }
      if (Node.string(node).trim() !== '') queuedInlines.push(node)
    }
    flushInlines()
    return result as DeserializedNodes
  }

  return deserializedNodes as DeserializedNodes
}