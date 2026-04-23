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
 * Determine text alignment based on element or its parent data attribute.
 */
function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  const align = parent?.dataset.align
  if (align === 'center' || align === 'end') {
    return align
  }
  if (element instanceof HTMLElement) {
    const { textAlign } = element.style
    if (textAlign === 'center') return 'center'
    if (textAlign === 'right' || textAlign === 'end') return 'end'
  }
}

/**
 * Mapping of heading tag names to heading levels.
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
 * Extract marks from element attributes and inline styles.
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
 * Public API – deserialize an HTML string into Slate nodes.
 */
export function deserializeHTML(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

/**
 * Public API – deserialize a single DOM node.
 */
export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!(el instanceof globalThis.HTMLElement)) return handleTextNode(el)
  if (el.nodeName === 'BR') return getInlineNodes('\n')
  if (el.nodeName === 'IMG') return getInlineNodes(el.getAttribute('alt') ?? '')
  if (el.nodeName === 'HR') return [{ type: 'divider', children: [{ text: '' }] }]

  const marks = marksFromElementAttributes(el)

  if (el.classList.contains('listtype-quote')) {
    marks.delete('italic')
    return addMarksToChildren(marks, () => [
      { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
    ])
  }

  return addMarksToChildren(marks, () => handleElementNode(el))
}

/**
 * Handle non‑element nodes (text nodes, comments, etc.).
 */
function handleTextNode(node: globalThis.Node): DeserializedNode[] {
  const text = node.textContent
  if (!text) return []
  return getInlineNodes(text)
}

/**
 * Dispatch handling based on the element's tag name.
 */
function handleElementNode(el: globalThis.HTMLElement): DeserializedNode[] {
  switch (el.nodeName) {
    case 'A':
      return handleAnchor(el)
    case 'PRE':
      return handlePre(el)
    case 'LI':
      return handleListItem(el)
    case 'P':
      return handleParagraph(el)
    case 'BLOCKQUOTE':
      return [{ type: 'blockquote', children: deserializeChildren(el) }]
    case 'OL':
      return [{ type: 'ordered-list', children: deserializeChildren(el) }]
    case 'UL':
      return [{ type: 'unordered-list', children: deserializeChildren(el) }]
    case 'DIV':
      return handleDiv(el)
    default:
      return deserializeChildren(el)
  }
}

/**
 * Handle <a> elements – create a link node.
 */
function handleAnchor(el: globalThis.HTMLElement): DeserializedNode[] {
  const href = el.getAttribute('href')
  if (!href) return deserializeChildren(el)
  return setLinkForChildren(href, () =>
    forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
  )
}

/**
 * Handle <pre> elements – create a code block.
 */
function handlePre(el: globalThis.HTMLElement): DeserializedNode[] {
  if (!el.textContent) return []
  return [{ type: 'code', children: [{ text: el.textContent }] }]
}

/**
 * Handle <li> elements – may contain nested lists.
 */
function handleListItem(el: globalThis.HTMLElement): DeserializedNode[] {
  const children = fixNodesForBlockChildren(deserializeNodes(el.childNodes))
  let nestedList: Block | undefined

  const contentChildren = children.filter(node => {
    if (!nestedList && (node.type === 'ordered-list' || node.type === 'unordered-list')) {
      nestedList = node
      return false
    }
    return true
  })

  const listItemContent = { type: 'list-item-content' as const, children: contentChildren }
  const listItemChildren = nestedList ? [listItemContent, nestedList] : [listItemContent]

  return [{ type: 'list-item', children: listItemChildren }]
}

/**
 * Handle <p> elements – create a paragraph with optional alignment.
 */
function handleParagraph(el: globalThis.HTMLElement): DeserializedNode[] {
  return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children: deserializeChildren(el) }]
}

/**
 * Handle <div> elements – may be a paragraph if not a block.
 */
function handleDiv(el: globalThis.HTMLElement): DeserializedNode[] {
  const children = deserializeChildren(el)
  if (!isBlock(children[0])) {
    return [{ type: 'paragraph', children }]
  }
  return children
}

/**
 * Deserialize children of an element and fix block‑level constraints.
 */
function deserializeChildren(el: globalThis.HTMLElement): DeserializedNode[] {
  const deserialized = deserializeNodes(el.childNodes)
  return fixNodesForBlockChildren(deserialized)
}

/**
 * Deserialize a collection of DOM nodes.
 */
function deserializeNodes(nodes: Iterable<globalThis.Node>): DeserializedNode[] {
  const output: DeserializedNode[] = []
  for (const node of nodes) {
    output.push(...deserializeHTMLNode(node))
  }
  return output
}

/**
 * Ensure block‑level children are correctly structured.
 */
function fixNodesForBlockChildren(deserializedNodes: DeserializedNode[]): DeserializedNodes {
  if (!deserializedNodes.length) {
    return [{ text: '' }]
  }

  if (deserializedNodes.some(isBlock)) {
    const result: DeserializedNode[] = []
    let inlineQueue: InlineFromExternalPaste[] = []

    const flushInlines = () => {
      if (inlineQueue.length) {
        result.push({ type: 'paragraph', children: inlineQueue })
        inlineQueue = []
      }
    }

    for (const node of deserializedNodes) {
      if (isBlock(node)) {
        flushInlines()
        result.push(node)
        continue
      }
      if (Node.string(node).trim() !== '') {
        inlineQueue.push(node)
      }
    }

    flushInlines()
    return result as DeserializedNodes
  }

  return deserializedNodes as DeserializedNodes
}

/**
 * Types used throughout the module.
 */
type DeserializedNode = InlineFromExternalPaste | Block
type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]