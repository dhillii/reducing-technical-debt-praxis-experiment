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
 * Returns the alignment of an element based on its parent data attribute or
 * its own style.
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
 * Extracts marks from an element's attributes and style.
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
    return handleNonHTMLElement(el)
  }

  const nodeName = el.nodeName

  if (isBR(el)) {
    return getInlineNodes('\n')
  }

  if (isIMG(el)) {
    return getInlineNodes(el.getAttribute('alt') ?? '')
  }

  if (isHR(el)) {
    return [{ type: 'divider', children: [{ text: '' }] }]
  }

  const marks = marksFromElementAttributes(el)

  if (isConfluenceListQuote(el)) {
    marks.delete('italic')
    return addMarksToChildren(marks, () => [
      { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
    ])
  }

  return addMarksToChildren(marks, () => handleElementWithMarks(el))
}

/**
 * Handles nodes that are not HTMLElements.
 */
function handleNonHTMLElement(el: globalThis.Node): DeserializedNode[] {
  const text = el.textContent
  if (!text) {
    return []
  }
  return getInlineNodes(text)
}

/**
 * Handles an HTMLElement that has already had its marks extracted.
 */
function handleElementWithMarks(el: globalThis.HTMLElement): DeserializedNode[] {
  const nodeName = el.nodeName

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
    return handleListItem(children)
  }

  if (isParagraph(el)) {
    return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
  }

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

  if (isBlockquote(el)) {
    return [{ type: 'blockquote', children }]
  }

  if (isOrderedList(el)) {
    return [{ type: 'ordered-list', children }]
  }

  if (isUnorderedList(el)) {
    return [{ type: 'unordered-list', children }]
  }

  if (isDiv(el) && !isBlock(children[0])) {
    return [{ type: 'paragraph', children }]
  }

  return deserialized
}

/**
 * Handles a list item node.
 */
function handleListItem(children: DeserializedNode[]): DeserializedNode[] {
  let nestedList: Block | undefined

  const listItemContent: Block = {
    type: 'list-item-content',
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
 * Deserializes an iterable of DOM nodes into Slate nodes.
 */
function deserializeNodes(nodes: Iterable<globalThis.Node>): DeserializedNode[] {
  const outputNodes: (InlineFromExternalPaste | Block)[] = []
  for (const node of nodes) {
    outputNodes.push(...deserializeHTMLNode(node))
  }
  return outputNodes
}

/**
 * Ensures that block children are properly wrapped in paragraphs if needed.
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

/* -------------------------------------------------------------------------- */
/* Predicate helpers                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Checks if a node is a <br> element.
 */
function isBR(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'BR'
}

/**
 * Checks if a node is an <img> element.
 */
function isIMG(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'IMG'
}

/**
 * Checks if a node is an <hr> element.
 */
function isHR(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'HR'
}

/**
 * Checks if a node is an <a> element.
 */
function isAnchor(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'A'
}

/**
 * Checks if a node is a <pre> element.
 */
function isPre(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'PRE'
}

/**
 * Checks if a node is a <li> element.
 */
function isListItem(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'LI'
}

/**
 * Checks if a node is a <p> element.
 */
function isParagraph(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'P'
}

/**
 * Checks if a node is a <blockquote> element.
 */
function isBlockquote(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'BLOCKQUOTE'
}

/**
 * Checks if a node is an <ol> element.
 */
function isOrderedList(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'OL'
}

/**
 * Checks if a node is a <ul> element.
 */
function isUnorderedList(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'UL'
}

/**
 * Checks if a node is a <div> element.
 */
function isDiv(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'DIV'
}

/**
 * Checks if an element has the Confluence list quote class.
 */
function isConfluenceListQuote(el: globalThis.HTMLElement): boolean {
  return el.classList.contains('listtype-quote')
}