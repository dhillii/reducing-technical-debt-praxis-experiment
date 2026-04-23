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
 * Retrieves alignment from an element's parent using dataset.
 */
function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  const align = parent?.dataset.align
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
 * Extracts Slate marks from an element's attributes and styles.
 */
function marksFromElementAttributes(element: globalThis.HTMLElement): Set<Mark> {
  const marks = new Set<Mark>()
  const { nodeName, style } = element
  const markFromNodeName = TEXT_TAGS[nodeName]
  if (markFromNodeName) {
    marks.add(markFromNodeName)
  }
  const { fontWeight, textDecoration, verticalAlign } = style

  if (textDecoration === 'underline') {
    marks.add('underline')
  } else if (textDecoration === 'line-through') {
    marks.add('strikethrough')
  }

  if (nodeName === 'SPAN' && element.classList.contains('code')) {
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

  if (style.fontStyle === 'italic') {
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
 * Predicate: node is not an HTMLElement (i.e., a text node).
 */
function isTextNode(node: globalThis.Node): boolean {
  return !(node instanceof globalThis.HTMLElement)
}

/**
 * Predicate: element is a <br>.
 */
function isBreakNode(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'BR'
}

/**
 * Predicate: element is an <img>.
 */
function isImageNode(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'IMG'
}

/**
 * Predicate: element is an <hr>.
 */
function isHorizontalRule(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'HR'
}

/**
 * Predicate: element has Confluence quote list class.
 */
function isQuoteList(el: globalThis.HTMLElement): boolean {
  return el.classList.contains('listtype-quote')
}

/**
 * Predicate: element is an <a>.
 */
function isAnchorNode(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'A'
}

/**
 * Predicate: element is a <pre> with text content.
 */
function isPreNode(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'PRE' && !!el.textContent
}

/**
 * Predicate: element is a list item (<li>).
 */
function isListItemNode(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'LI'
}

/**
 * Predicate: element is a paragraph (<p>).
 */
function isParagraphNode(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'P'
}

/**
 * Predicate: element is a heading tag.
 */
function isHeadingNode(el: globalThis.HTMLElement): boolean {
  return typeof headings[el.nodeName] === 'number'
}

/**
 * Predicate: element is a blockquote (<blockquote>).
 */
function isBlockquoteNode(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'BLOCKQUOTE'
}

/**
 * Predicate: element is an ordered list (<ol>).
 */
function isOrderedListNode(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'OL'
}

/**
 * Predicate: element is an unordered list (<ul>).
 */
function isUnorderedListNode(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'UL'
}

/**
 * Predicate: element is a <div> that should be treated as a paragraph.
 */
function isDivParagraphNode(el: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return el.nodeName === 'DIV' && !isBlock(children[0])
}

/**
 * Handles deserialization of a list item element.
 */
function handleListItem(children: DeserializedNode[]): DeserializedNode[] {
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
 * Deserializes an HTML string into Slate nodes.
 */
export function deserializeHTML(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

type DeserializedNode = InlineFromExternalPaste | Block
type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]

/**
 * Deserializes a single DOM node into Slate nodes.
 */
export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (isTextNode(el)) {
    const text = el.textContent
    if (!text) {
      return []
    }
    return getInlineNodes(text)
  }

  const element = el as globalThis.HTMLElement

  if (isBreakNode(element)) {
    return getInlineNodes('\n')
  }

  if (isImageNode(element)) {
    const alt = element.getAttribute('alt')
    return getInlineNodes(alt ?? '')
  }

  if (isHorizontalRule(element)) {
    return [{ type: 'divider', children: [{ text: '' }] }]
  }

  const marks = marksFromElementAttributes(element)

  if (isQuoteList(element)) {
    marks.delete('italic')
    return addMarksToChildren(marks, () => [
      {
        type: 'blockquote',
        children: fixNodesForBlockChildren(deserializeNodes(element.childNodes)),
      },
    ])
  }

  const children = fixNodesForBlockChildren(deserializeNodes(element.childNodes))

  let result: DeserializedNode[] = []

  if (isAnchorNode(element)) {
    const href = element.getAttribute('href')
    if (href) {
      result = [
        setLinkForChildren(href, () =>
          forceDisableMarkForChildren('underline', () => deserializeNodes(element.childNodes))
        ),
      ]
    }
  } else if (isPreNode(element)) {
    result = [{ type: 'code', children: [{ text: element.textContent || '' }] }]
  } else if (isListItemNode(element)) {
    result = handleListItem(children)
  } else if (isParagraphNode(element)) {
    result = [{ type: 'paragraph', textAlign: getAlignmentFromElement(element), children }]
  } else if (isHeadingNode(element)) {
    const level = headings[element.nodeName] as number
    result = [
      {
        type: 'heading',
        level,
        textAlign: getAlignmentFromElement(element),
        children,
      },
    ]
  } else if (isBlockquoteNode(element)) {
    result = [{ type: 'blockquote', children }]
  } else if (isOrderedListNode(element)) {
    result = [{ type: 'ordered-list', children }]
  } else if (isUnorderedListNode(element)) {
    result = [{ type: 'unordered-list', children }]
  } else if (isDivParagraphNode(element, children)) {
    result = [{ type: 'paragraph', children }]
  } else {
    result = deserializeNodes(element.childNodes)
  }

  return addMarksToChildren(marks, () => result)
}

/**
 * Deserializes an iterable of DOM nodes.
 */
function deserializeNodes(nodes: Iterable<globalThis.Node>): DeserializedNode[] {
  const outputNodes: (InlineFromExternalPaste | Block)[] = []
  for (const node of nodes) {
    outputNodes.push(...deserializeHTMLNode(node))
  }
  return outputNodes
}

/**
 * Ensures block children have appropriate paragraph wrappers.
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