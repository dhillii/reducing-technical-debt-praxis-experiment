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
 * Retrieves alignment from an element's parent using dataset instead of getAttribute.
 */
function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  const align = parent?.dataset.align
  if (align === 'center' || align === 'end') {
    return align
  }
  if (element instanceof HTMLElement) {
    const textAlign = element.style.textAlign
    if (textAlign === 'center') return 'center'
    if (textAlign === 'right' || textAlign === 'end') return 'end'
  }
}

/**
 * Mapping of heading tag names to their levels.
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
 * Extracts Slate marks from an element's attributes and styles.
 */
function marksFromElementAttributes(element: globalThis.HTMLElement) {
  const marks = new Set<Mark>()
  const { nodeName, style } = element
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
  ) {
    marks.add('bold')
  }

  if (style.fontStyle === 'italic') marks.add('italic')

  if (verticalAlign === 'super') marks.add('superscript')
  else if (verticalAlign === 'sub') marks.add('subscript')

  return marks
}

/**
 * Public API: deserialize an HTML string into Slate nodes.
 */
export function deserializeHTML(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

type DeserializedNode = InlineFromExternalPaste | Block
type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]

/**
 * Public API: deserialize a single DOM node.
 */
export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!(el instanceof globalThis.HTMLElement)) return handleNonElementNode(el)
  switch (el.nodeName) {
    case 'BR':
      return getInlineNodes('\n')
    case 'IMG':
      return getInlineNodes(el.getAttribute('alt') ?? '')
    case 'HR':
      return [{ type: 'divider', children: [{ text: '' }] }]
    default:
      return handleElementNode(el)
  }
}

/**
 * Handles text nodes that are not HTMLElements.
 */
function handleNonElementNode(node: globalThis.Node): DeserializedNode[] {
  const text = node.textContent
  if (!text) return []
  return getInlineNodes(text)
}

/**
 * Handles generic HTMLElements, applying marks and delegating to specific processors.
 */
function handleElementNode(el: globalThis.HTMLElement): DeserializedNode[] {
  const marks = marksFromElementAttributes(el)

  // Dropbox Paper displays blockquotes as lists for some reason
  if (el.classList.contains('listtype-quote')) {
    marks.delete('italic')
    return addMarksToChildren(marks, () => [
      { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
    ])
  }

  return addMarksToChildren(marks, () => processElementContent(el))
}

/**
 * Dispatches processing based on the element's tag name.
 */
function processElementContent(el: globalThis.HTMLElement): DeserializedNode[] {
  const { nodeName } = el

  if (nodeName === 'A') return handleAnchor(el)
  if (nodeName === 'PRE' && el.textContent) return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
  if (nodeName === 'LI') return handleListItem(el)
  if (nodeName === 'P') return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children: deserializeChildren(el) }]
  if (nodeName === 'BLOCKQUOTE') return [{ type: 'blockquote', children: deserializeChildren(el) }]
  if (nodeName === 'OL') return [{ type: 'ordered-list', children: deserializeChildren(el) }]
  if (nodeName === 'UL') return [{ type: 'unordered-list', children: deserializeChildren(el) }]
  if (nodeName === 'DIV' && !isBlock(deserializeChildren(el)[0])) return [{ type: 'paragraph', children: deserializeChildren(el) }]

  const headingLevel = headings[nodeName]
  if (typeof headingLevel === 'number')
    return [{ type: 'heading', level: headingLevel, textAlign: getAlignmentFromElement(el), children: deserializeChildren(el) }]

  // Fallback: treat children as inline content
  return deserializeChildren(el)
}

/**
 * Handles anchor elements, applying link and disabling underline.
 */
function handleAnchor(el: globalThis.HTMLElement): DeserializedNode[] {
  const href = el.getAttribute('href')
  if (!href) return deserializeChildren(el)
  return setLinkForChildren(href, () =>
    forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
  )
}

/**
 * Handles list item elements, extracting nested lists if present.
 */
function handleListItem(el: globalThis.HTMLElement): DeserializedNode[] {
  const deserialized = deserializeNodes(el.childNodes)
  const children = fixNodesForBlockChildren(deserialized)

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
 * Deserializes child nodes of an element and fixes block children.
 */
function deserializeChildren(el: globalThis.HTMLElement): DeserializedNode[] {
  const deserialized = deserializeNodes(el.childNodes)
  return fixNodesForBlockChildren(deserialized)
}

/**
 * Deserializes an iterable of DOM nodes.
 */
function deserializeNodes(nodes: Iterable<globalThis.Node>): DeserializedNode[] {
  const output: DeserializedNode[] = []
  for (const node of nodes) {
    output.push(...deserializeHTMLNode(node))
  }
  return output
}

/**
 * Ensures that a list of deserialized nodes conforms to Slate's block/inline expectations.
 */
function fixNodesForBlockChildren(deserializedNodes: DeserializedNode[]): DeserializedNodes {
  if (!deserializedNodes.length) {
    // Slate also gets unhappy if an element has no children
    // the empty text nodes will get normalized away if they're not needed
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

      // ignore whitespace between block level elements
      if (Node.string(node).trim() !== '') {
        queuedInlines.push(node)
      }
    }

    flushInlines()
    return result as DeserializedNodes
  }

  return deserializedNodes as DeserializedNodes
}