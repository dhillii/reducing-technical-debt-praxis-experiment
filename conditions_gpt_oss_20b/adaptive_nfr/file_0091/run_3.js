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
 * Returns the alignment of an element based on its parent data-align attribute
 * or its own text-align style.
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
 * Mapping of heading tags to their levels.
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
 * Mapping of text tags to Slate marks.
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
 * Extracts marks from an element's attributes and styles.
 */
function marksFromElementAttributes(element: globalThis.HTMLElement) {
  const marks = new Set<Mark>()
  const style = element.style
  const { nodeName } = element
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
 * Predicate helpers
 */
function isTextNode(node: globalThis.Node): node is globalThis.Text {
  return node.nodeType === Node.TEXT_NODE
}

function isEmptyTextNode(node: globalThis.Node): boolean {
  return isTextNode(node) && !node.textContent?.trim()
}

function isBR(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'BR'
}

function isImage(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'IMG'
}

function isHR(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'HR'
}

function isListQuote(el: globalThis.HTMLElement): boolean {
  return el.classList.contains('listtype-quote')
}

function isAnchor(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'A'
}

function isPre(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'PRE'
}

function isListItem(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'LI'
}

function isParagraph(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'P'
}

function isHeading(el: globalThis.HTMLElement): boolean {
  return el.nodeName in headings
}

function isBlockquote(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'BLOCKQUOTE'
}

function isOrderedList(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'OL'
}

function isUnorderedList(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'UL'
}

function isDiv(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'DIV'
}

function getHeadingLevel(nodeName: string): number | undefined {
  return headings[nodeName]
}

function isDivNonBlock(children: DeserializedNode[]): boolean {
  return children.length > 0 && !isBlock(children[0])
}

/**
 * Creates a list-item node, handling nested lists.
 */
function createListItem(children: DeserializedNode[]): DeserializedNode {
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
  return { type: 'list-item', children: listItemChildren }
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
  if (!(el instanceof globalThis.HTMLElement)) {
    const text = el.textContent
    if (!text) {
      return []
    }
    return getInlineNodes(text)
  }

  if (isBR(el)) {
    return getInlineNodes('\n')
  }

  if (isImage(el)) {
    const alt = el.getAttribute('alt')
    return getInlineNodes(alt ?? '')
  }

  if (isHR(el)) {
    return [{ type: 'divider', children: [{ text: '' }] }]
  }

  const marks = marksFromElementAttributes(el)

  if (isListQuote(el)) {
    marks.delete('italic')
    return addMarksToChildren(marks, () => [
      { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
    ])
  }

  return addMarksToChildren(marks, () => {
    const { nodeName } = el

    if (isAnchor(el)) {
      const href = el.getAttribute('href')
      if (href) {
        return setLinkForChildren(href, () =>
          forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
        )
      }
    }

    if (isPre(el) && el.textContent) {
      return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
    }

    const deserialized = deserializeNodes(el.childNodes)
    const children = fixNodesForBlockChildren(deserialized)

    if (isListItem(el)) {
      return [createListItem(children)]
    }

    if (isParagraph(el)) {
      return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
    }

    const headingLevel = getHeadingLevel(nodeName)
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

    if (isBlockquote(el)) {
      return [{ type: 'blockquote', children }]
    }

    if (isOrderedList(el)) {
      return [{ type: 'ordered-list', children }]
    }

    if (isUnorderedList(el)) {
      return [{ type: 'unordered-list', children }]
    }

    if (isDiv(el) && isDivNonBlock(children)) {
      return [{ type: 'paragraph', children }]
    }

    return deserialized
  })
}

function deserializeNodes(nodes: Iterable<globalThis.Node>): DeserializedNode[] {
  const outputNodes: (InlineFromExternalPaste | Block)[] = []
  for (const node of nodes) {
    outputNodes.push(...deserializeHTMLNode(node))
  }
  return outputNodes
}

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