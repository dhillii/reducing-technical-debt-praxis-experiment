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
 * Determines text alignment from an element or its parent using dataset.
 */
function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  const align = parent?.dataset?.align
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
  const { nodeName, style, classList } = element
  const markFromNodeName = TEXT_TAGS[nodeName]
  if (markFromNodeName) marks.add(markFromNodeName)

  const { fontWeight, textDecoration, verticalAlign } = style

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
 * Entry point for deserializing a single DOM node.
 */
export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!(el instanceof globalThis.HTMLElement)) return handleTextNode(el)
  switch (el.nodeName) {
    case 'BR':
      return [{ text: '\n' }]
    case 'IMG':
      return handleImageNode(el)
    case 'HR':
      return [{ type: 'divider', children: [{ text: '' }] }]
    default:
      return handleElementNode(el)
  }
}

/**
 * Handles plain text nodes.
 */
function handleTextNode(node: globalThis.Node): DeserializedNode[] {
  const text = node.textContent
  if (!text) return []
  return getInlineNodes(text)
}

/**
 * Handles <img> elements by using the alt attribute as text.
 */
function handleImageNode(el: globalThis.HTMLElement): DeserializedNode[] {
  const alt = el.getAttribute('alt')
  return getInlineNodes(alt ?? '')
}

/**
 * Handles generic HTMLElement nodes, applying marks and delegating content processing.
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
 * Processes the inner content of an element based on its tag name.
 */
function processElementContent(el: globalThis.HTMLElement): DeserializedNode[] {
  const { nodeName } = el

  if (nodeName === 'A') {
    const href = el.getAttribute('href')
    if (href) {
      return setLinkForChildren(href, () =>
        forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
      )
    }
  }

  if (nodeName === 'PRE' && el.textContent) {
    return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
  }

  const deserialized = deserializeNodes(el.childNodes)
  const children = fixNodesForBlockChildren(deserialized)

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
      if (!isBlock(children[0])) return [{ type: 'paragraph', children }]
      break
    default:
      break
  }

  // Heading handling
  const headingLevel = headings[nodeName]
  if (typeof headingLevel === 'number') {
    return [
      {
        type: 'heading',
        level: headingLevel,
        textAlign: getAlignmentFromElement(el),
        children,
      },
    ]
  }

  return deserialized
}

/**
 * Handles <li> elements, separating nested lists from content.
 */
function handleListItemNode(children: DeserializedNode[]): DeserializedNode[] {
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
 * Recursively deserializes a collection of DOM nodes.
 */
function deserializeNodes(nodes: Iterable<globalThis.Node>): DeserializedNode[] {
  const output: DeserializedNode[] = []
  for (const node of nodes) {
    output.push(...deserializeHTMLNode(node))
  }
  return output
}

/**
 * Ensures block children have appropriate paragraph wrappers.
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