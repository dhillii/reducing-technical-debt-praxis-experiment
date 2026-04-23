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
 * Determines text alignment based on element or its parent dataset.
 */
function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  const align = parent?.dataset?.align
  if (align === 'center' || align === 'end') {
    return align
  }
  if (element instanceof HTMLElement) {
    const textAlign = element.style.textAlign
    if (textAlign === 'center') {
      return 'center'
    }
    if (textAlign === 'right' || textAlign === 'end') {
      return 'end'
    }
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
 * Extracts Slate marks from element attributes and styles.
 */
function marksFromElementAttributes(element: globalThis.HTMLElement): Set<Mark> {
  const marks = new Set<Mark>()
  const { nodeName, style, classList } = element
  const markFromNodeName = TEXT_TAGS[nodeName]
  if (markFromNodeName) {
    marks.add(markFromNodeName)
  }

  const { fontWeight, textDecoration, verticalAlign, fontStyle } = style

  if (textDecoration === 'underline') {
    marks.add('underline')
  } else if (textDecoration === 'line-through') {
    marks.add('strikethrough')
  }

  if (nodeName === 'SPAN' && classList.contains('code')) {
    marks.add('code')
  }

  if (nodeName === 'B' && fontWeight !== 'normal') {
    marks.add('bold')
  } else if (
    typeof fontWeight === 'string' &&
    (fontWeight === 'bold' ||
      fontWeight === 'bolder' ||
      fontWeight === '1000' ||
      /^[5-9]\d{2}$/.test(fontWeight))
  ) {
    marks.add('bold')
  }

  if (fontStyle === 'italic') {
    marks.add('italic')
  }

  if (verticalAlign === 'super') {
    marks.add('superscript')
  } else if (verticalAlign === 'sub') {
    marks.add('subscript')
  }

  return marks
}

/**
 * Guard predicate: element is a line break.
 */
function isBreakNode(el: globalThis.Element): boolean {
  return el.nodeName === 'BR'
}

/**
 * Guard predicate: element is an image.
 */
function isImageNode(el: globalThis.Element): boolean {
  return el.nodeName === 'IMG'
}

/**
 * Guard predicate: element is a horizontal rule.
 */
function isHorizontalRuleNode(el: globalThis.Element): boolean {
  return el.nodeName === 'HR'
}

/**
 * Guard predicate: element represents a quoted list (Dropbox Paper).
 */
function isQuoteListNode(el: globalThis.Element): boolean {
  return el.classList.contains('listtype-quote')
}

/**
 * Guard predicate: element is an anchor.
 */
function isAnchorNode(el: globalThis.Element): boolean {
  return el.nodeName === 'A'
}

/**
 * Guard predicate: element is a preformatted block with text.
 */
function isPreNode(el: globalThis.Element): boolean {
  return el.nodeName === 'PRE' && !!el.textContent
}

/**
 * Guard predicate: element is a list item.
 */
function isListItemNode(el: globalThis.Element): boolean {
  return el.nodeName === 'LI'
}

/**
 * Guard predicate: element is a paragraph.
 */
function isParagraphNode(el: globalThis.Element): boolean {
  return el.nodeName === 'P'
}

/**
 * Guard predicate: element is a heading.
 */
function isHeadingNode(el: globalThis.Element): boolean {
  return typeof headings[el.nodeName] === 'number'
}

/**
 * Guard predicate: element is a blockquote.
 */
function isBlockquoteNode(el: globalThis.Element): boolean {
  return el.nodeName === 'BLOCKQUOTE'
}

/**
 * Guard predicate: element is an ordered list.
 */
function isOrderedListNode(el: globalThis.Element): boolean {
  return el.nodeName === 'OL'
}

/**
 * Guard predicate: element is an unordered list.
 */
function isUnorderedListNode(el: globalThis.Element): boolean {
  return el.nodeName === 'UL'
}

/**
 * Guard predicate: element is a div that should be treated as a paragraph.
 */
function isDivParagraphNode(el: globalThis.Element, children: DeserializedNode[]): boolean {
  return el.nodeName === 'DIV' && !isBlock(children[0])
}

/**
 * Handles deserialization of a list item element.
 */
function handleListItem(el: globalThis.Element, children: DeserializedNode[]): DeserializedNode[] {
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
 * Deserializes a single HTML node into Slate nodes.
 */
export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!(el instanceof globalThis.HTMLElement)) {
    const text = el.textContent
    return text ? getInlineNodes(text) : []
  }

  if (isBreakNode(el)) {
    return getInlineNodes('\n')
  }

  if (isImageNode(el)) {
    const alt = el.getAttribute('alt')
    return getInlineNodes(alt ?? '')
  }

  if (isHorizontalRuleNode(el)) {
    return [{ type: 'divider', children: [{ text: '' }] }]
  }

  const marks = marksFromElementAttributes(el)

  if (isQuoteListNode(el)) {
    marks.delete('italic')
    return addMarksToChildren(marks, () => [
      { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
    ])
  }

  return addMarksToChildren(marks, () => {
    const children = fixNodesForBlockChildren(deserializeNodes(el.childNodes))

    if (isAnchorNode(el)) {
      const href = el.getAttribute('href')
      if (href) {
        return setLinkForChildren(href, () =>
          forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
        )
      }
    }

    if (isPreNode(el)) {
      return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
    }

    if (isListItemNode(el)) {
      return handleListItem(el, children)
    }

    if (isParagraphNode(el)) {
      return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
    }

    if (isHeadingNode(el)) {
      const level = headings[el.nodeName] as number
      return [{ type: 'heading', level, textAlign: getAlignmentFromElement(el), children }]
    }

    if (isBlockquoteNode(el)) {
      return [{ type: 'blockquote', children }]
    }

    if (isOrderedListNode(el)) {
      return [{ type: 'ordered-list', children }]
    }

    if (isUnorderedListNode(el)) {
      return [{ type: 'unordered-list', children }]
    }

    if (isDivParagraphNode(el, children)) {
      return [{ type: 'paragraph', children }]
    }

    return children
  })
}

/**
 * Deserializes a collection of HTML nodes.
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
  if (deserializedNodes.length === 0) {
    return [{ text: '' }]
  }

  if (!deserializedNodes.some(isBlock)) {
    return deserializedNodes as DeserializedNodes
  }

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
      queuedInlines.push(node as InlineFromExternalPaste)
    }
  }

  flushInlines()
  return result as DeserializedNodes
}

/**
 * Parses HTML string into Slate nodes.
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