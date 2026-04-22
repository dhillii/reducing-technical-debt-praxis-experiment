// very loosely based on https://github.com/ianstormtaylor/slate/blob/d22c76ae1313fe82111317417912a2670e73f5c9/site/examples/paste-html.tsx
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
 * Determines if a string value represents a valid alignment.
 */
function isCenterOrEndAlignment(value: string | undefined): value is 'center' | 'end' {
  return value === 'center' || value === 'end'
}

/**
 * Checks if a CSS text-align value corresponds to center alignment.
 */
function isGoogleDocsCenter(textAlign: string): boolean {
  return textAlign === 'center'
}

/**
 * Checks if a CSS text-align value corresponds to end/right alignment.
 */
function isGoogleDocsEnd(textAlign: string): boolean {
  return textAlign === 'right' || textAlign === 'end'
}

/**
 * Retrieves alignment information from an element, preferring dataset over attributes.
 */
function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parentAlign = element.parentElement?.dataset.align
  if (isCenterOrEndAlignment(parentAlign)) {
    return parentAlign
  }
  if (element instanceof HTMLElement) {
    const textAlign = element.style.textAlign
    if (isGoogleDocsCenter(textAlign)) {
      return 'center'
    }
    if (isGoogleDocsEnd(textAlign)) {
      return 'end'
    }
  }
  return undefined
}

const headings: Record<string, (Node & { type: 'heading' })['level'] | undefined> = {
  H1: 1,
  H2: 2,
  H3: 3,
  H4: 4,
  H5: 5,
  H6: 6,
}

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
 * Extracts marks from element attributes and inline styles.
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
 * Determines if a node is an HTMLElement.
 */
function isHTMLElement(node: globalThis.Node): node is globalThis.HTMLElement {
  return node instanceof globalThis.HTMLElement
}

/**
 * Handles plain text nodes.
 */
function getTextNodeChildren(node: globalThis.Node): DeserializedNode[] {
  const text = node.textContent
  if (!text) {
    return []
  }
  return getInlineNodes(text)
}

/**
 * Checks for a line break element.
 */
function isLineBreak(el: HTMLElement): boolean {
  return el.nodeName === 'BR'
}

/**
 * Checks for an image element.
 */
function isImageNode(el: HTMLElement): boolean {
  return el.nodeName === 'IMG'
}

/**
 * Retrieves inline nodes from an image's alt attribute.
 */
function getImageInlineNodes(el: HTMLElement): DeserializedNode[] {
  const alt = el.getAttribute('alt')
  return getInlineNodes(alt ?? '')
}

/**
 * Checks for a horizontal rule element.
 */
function isHorizontalRule(el: HTMLElement): boolean {
  return el.nodeName === 'HR'
}

/**
 * Checks for the Dropbox Paper quote list class.
 */
function isQuoteListClass(el: HTMLElement): boolean {
  return el.classList.contains('listtype-quote')
}

/**
 * Checks for an anchor element.
 */
function isAnchorNode(el: HTMLElement): boolean {
  return el.nodeName === 'A'
}

/**
 * Checks for a preformatted text element.
 */
function isPreNode(el: HTMLElement): boolean {
  return el.nodeName === 'PRE'
}

/**
 * Deserializes a list item, handling possible nested lists.
 */
function deserializeListItem(children: DeserializedNode[]): DeserializedNode[] {
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
 * Deserializes the children of a generic element.
 */
function deserializeElementChildren(el: HTMLElement): DeserializedNode[] {
  const nodeName = el.nodeName

  if (isAnchorNode(el)) {
    const href = el.getAttribute('href')
    if (href) {
      return setLinkForChildren(href, () =>
        forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
      )
    }
  }

  if (isPreNode(el) && el.textContent) {
    return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
  }

  const deserialized = deserializeNodes(el.childNodes)
  const children = fixNodesForBlockChildren(deserialized)

  if (nodeName === 'LI') {
    return deserializeListItem(children)
  }

  if (nodeName === 'P') {
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

  if (nodeName === 'BLOCKQUOTE') {
    return [{ type: 'blockquote', children }]
  }

  if (nodeName === 'OL') {
    return [{ type: 'ordered-list', children }]
  }

  if (nodeName === 'UL') {
    return [{ type: 'unordered-list', children }]
  }

  if (nodeName === 'DIV' && !isBlock(children[0])) {
    return [{ type: 'paragraph', children }]
  }

  return deserialized
}

/**
 * Deserializes a single HTML node into Slate nodes.
 */
export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!isHTMLElement(el)) {
    return getTextNodeChildren(el)
  }

  if (isLineBreak(el)) {
    return getInlineNodes('\n')
  }

  if (isImageNode(el)) {
    return getImageInlineNodes(el)
  }

  if (isHorizontalRule(el)) {
    return [{ type: 'divider', children: [{ text: '' }] }]
  }

  const marks = marksFromElementAttributes(el)

  if (isQuoteListClass(el)) {
    marks.delete('italic')
    return addMarksToChildren(marks, () => [
      {
        type: 'blockquote',
        children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)),
      },
    ])
  }

  return addMarksToChildren(marks, () => deserializeElementChildren(el))
}

/**
 * Deserializes an HTML string.
 */
export function deserializeHTML(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

type DeserializedNode = InlineFromExternalPaste | Block

type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]

function deserializeNodes(nodes: Iterable<globalThis.Node>): DeserializedNode[] {
  const outputNodes: (InlineFromExternalPaste | Block)[] = []
  for (const node of nodes) {
    outputNodes.push(...deserializeHTMLNode(node))
  }
  return outputNodes
}

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

      // we want to ignore whitespace between block level elements
      // useful info about whitespace in html:
      // https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model/Whitespace
      if (Node.string(node).trim() !== '') {
        queuedInlines.push(node)
      }
    }

    flushInlines()
    return result as DeserializedNodes
  }

  return deserializedNodes as DeserializedNodes
}