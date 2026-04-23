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
 * Determine text alignment based on element or its parent.
 * Uses dataset for data attributes.
 */
function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  const dataAlign = parent?.dataset.align
  if (dataAlign === 'center' || dataAlign === 'end') {
    return dataAlign
  }
  if (element instanceof HTMLElement) {
    const { textAlign } = element.style
    if (textAlign === 'center') return 'center'
    if (textAlign === 'right' || textAlign === 'end') return 'end'
  }
}

/**
 * Mapping of heading tag names to levels.
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
 * Mapping of HTML tags to Slate marks.
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
 * Extract marks from element based on tag name, classes, and styles.
 */
function marksFromElementAttributes(element: globalThis.HTMLElement): Set<Mark> {
  const marks = new Set<Mark>()
  const { nodeName, style, classList } = element
  const tagMark = TEXT_TAGS[nodeName]
  if (tagMark) marks.add(tagMark)

  const { fontWeight, textDecoration, verticalAlign, fontStyle } = style

  if (textDecoration === 'underline') marks.add('underline')
  else if (textDecoration === 'line-through') marks.add('strikethrough')

  if (nodeName === 'SPAN' && classList.contains('code')) marks.add('code')

  if (nodeName === 'B' && fontWeight !== 'normal') marks.add('bold')
  else if (
    typeof fontWeight === 'string' &&
    (fontWeight === 'bold' ||
      fontWeight === 'bolder' ||
      fontWeight === '1000' ||
      /^[5-9]\d{2}$/.test(fontWeight))
  ) {
    marks.add('bold')
  }

  if (fontStyle === 'italic') marks.add('italic')

  if (verticalAlign === 'super') marks.add('superscript')
  else if (verticalAlign === 'sub') marks.add('subscript')

  return marks
}

/**
 * Deserialize an entire HTML string.
 */
export function deserializeHTML(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

/**
 * Types for deserialized nodes.
 */
type DeserializedNode = InlineFromExternalPaste | Block
type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]

/**
 * Entry point for deserializing a single DOM node.
 */
export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!(el instanceof globalThis.HTMLElement)) {
    const text = el.textContent
    return text ? getInlineNodes(text) : []
  }

  if (el.nodeName === 'BR') return getInlineNodes('\n')
  if (el.nodeName === 'IMG') return handleImageNode(el)
  if (el.nodeName === 'HR') return [{ type: 'divider', children: [{ text: '' }] }]

  const marks = marksFromElementAttributes(el)

  if (el.classList.contains('listtype-quote')) {
    marks.delete('italic')
    return addMarksToChildren(marks, () => [
      { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
    ])
  }

  return addMarksToChildren(marks, () => deserializeElement(el))
}

/**
 * Handle <img> elements by using the alt attribute as text.
 */
function handleImageNode(el: globalThis.HTMLElement): DeserializedNode[] {
  const alt = el.getAttribute('alt')
  return getInlineNodes(alt ?? '')
}

/**
 * Dispatch handling based on element tag name.
 */
function deserializeElement(el: globalThis.HTMLElement): DeserializedNode[] {
  const { nodeName } = el

  if (nodeName === 'A') return handleLinkNode(el)
  if (nodeName === 'PRE') return handlePreNode(el)

  const children = fixNodesForBlockChildren(deserializeNodes(el.childNodes))

  switch (nodeName) {
    case 'LI':
      return handleListItemNode(children)
    case 'P':
      return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
    case 'BLOCKQUOTE':
      return [{ type: 'blockquote', children }]
    case 'OL':
      return [{ type: 'ordered-list', children }]
    case 'UL':
      return [{ type: 'unordered-list', children }]
    case 'DIV':
      return handleDivNode(children)
    default:
      if (headings[nodeName] !== undefined) return handleHeadingNode(el, children)
      return deserializeNodes(el.childNodes)
  }
}

/**
 * Handle anchor elements, applying link and disabling underline.
 */
function handleLinkNode(el: globalThis.HTMLElement): DeserializedNode[] {
  const href = el.getAttribute('href')
  if (!href) return deserializeNodes(el.childNodes)
  return setLinkForChildren(href, () =>
    forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
  )
}

/**
 * Handle <pre> elements as code blocks.
 */
function handlePreNode(el: globalThis.HTMLElement): DeserializedNode[] {
  if (!el.textContent) return []
  return [{ type: 'code', children: [{ text: el.textContent }] }]
}

/**
 * Convert list item children, extracting any nested list.
 */
function handleListItemNode(children: DeserializedNode[]): DeserializedNode[] {
  let nestedList: Block | undefined
  const listItemContent = {
    type: 'list-item-content' as const,
    children: children.filter(node => {
      if (!nestedList && (node.type === 'ordered-list' || node.type === 'unordered-list')) {
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
 * Handle heading elements based on tag name.
 */
function handleHeadingNode(el: globalThis.HTMLElement, children: DeserializedNode[]): DeserializedNode[] {
  const level = headings[el.nodeName]!
  return [{ type: 'heading', level, textAlign: getAlignmentFromElement(el), children }]
}

/**
 * Treat a DIV without a block child as a paragraph.
 */
function handleDivNode(children: DeserializedNode[]): DeserializedNode[] {
  if (!isBlock(children[0])) {
    return [{ type: 'paragraph', children }]
  }
  return children as DeserializedNode[]
}

/**
 * Recursively deserialize a collection of nodes.
 */
function deserializeNodes(nodes: Iterable<globalThis.Node>): DeserializedNode[] {
  const output: DeserializedNode[] = []
  for (const node of nodes) {
    output.push(...deserializeHTMLNode(node))
  }
  return output
}

/**
 * Ensure block children are correctly wrapped; convert stray inlines to paragraphs.
 */
function fixNodesForBlockChildren(deserializedNodes: DeserializedNode[]): DeserializedNodes {
  if (!deserializedNodes.length) {
    return [{ text: '' }]
  }

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
      if (Node.string(node).trim() !== '') {
        queuedInlines.push(node)
      }
    }

    flushInlines()
    return result as DeserializedNodes
  }

  return deserializedNodes as DeserializedNodes
}