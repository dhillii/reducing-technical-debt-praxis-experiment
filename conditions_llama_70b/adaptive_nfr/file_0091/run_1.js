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
 * Returns the alignment of the given element.
 * @param element The element to get the alignment from.
 * @returns The alignment of the element, or undefined if not found.
 */
function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  // confluence
  const attribute = parent?.dataset.align
  // note: we don't show html that confluence would parse as alignment
  // we could change that but meh
  // (they match on div.fabric-editor-block-mark with data-align)
  if (attribute === 'center' || attribute === 'end') {
    return attribute
  }
  if (element instanceof HTMLElement) {
    // Google docs
    const textAlign = element.style.textAlign
    if (textAlign === 'center') {
      return 'center'
    }
    // TODO: RTL things?
    if (textAlign === 'right' || textAlign === 'end') {
      return 'end'
    }
  }
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
 * Returns the marks from the given element's attributes.
 * @param element The element to get the marks from.
 * @returns The marks from the element's attributes.
 */
function marksFromElementAttributes(element: globalThis.HTMLElement): Set<Mark> {
  const marks = new Set<Mark>()
  const style = element.style
  const { nodeName } = element
  const markFromNodeName = TEXT_TAGS[nodeName]
  if (markFromNodeName) {
    marks.add(markFromNodeName)
  }
  const { fontWeight, textDecoration, verticalAlign } = style

  if (isUnderline(textDecoration)) {
    marks.add('underline')
  } else if (isStrikethrough(textDecoration)) {
    marks.add('strikethrough')
  }
  // confluence
  if (nodeName === 'SPAN' && element.classList.contains('code')) {
    marks.add('code')
  }
  // Google Docs does weird things with <b>
  if (isBold(nodeName, fontWeight)) {
    marks.add('bold')
  }
  if (style.fontStyle === 'italic') {
    marks.add('italic')
  }
  // Google Docs uses vertical align for subscript and superscript instead of <sup> and <sub>
  if (isSuperscript(verticalAlign)) {
    marks.add('superscript')
  } else if (isSubscript(verticalAlign)) {
    marks.add('subscript')
  }
  return marks
}

/**
 * Checks if the given text decoration is underline.
 * @param textDecoration The text decoration to check.
 * @returns True if the text decoration is underline, false otherwise.
 */
function isUnderline(textDecoration: string): boolean {
  return textDecoration === 'underline'
}

/**
 * Checks if the given text decoration is strikethrough.
 * @param textDecoration The text decoration to check.
 * @returns True if the text decoration is strikethrough, false otherwise.
 */
function isStrikethrough(textDecoration: string): boolean {
  return textDecoration === 'line-through'
}

/**
 * Checks if the given node name and font weight are bold.
 * @param nodeName The node name to check.
 * @param fontWeight The font weight to check.
 * @returns True if the node name and font weight are bold, false otherwise.
 */
function isBold(nodeName: string, fontWeight: string): boolean {
  if (nodeName === 'B' && fontWeight !== 'normal') {
    return true
  }
  return typeof fontWeight === 'string' &&
    (fontWeight === 'bold' ||
      fontWeight === 'bolder' ||
      fontWeight === '1000' ||
      /^[5-9]\d{2}$/.test(fontWeight))
}

/**
 * Checks if the given vertical align is superscript.
 * @param verticalAlign The vertical align to check.
 * @returns True if the vertical align is superscript, false otherwise.
 */
function isSuperscript(verticalAlign: string): boolean {
  return verticalAlign === 'super'
}

/**
 * Checks if the given vertical align is subscript.
 * @param verticalAlign The vertical align to check.
 * @returns True if the vertical align is subscript, false otherwise.
 */
function isSubscript(verticalAlign: string): boolean {
  return verticalAlign === 'sub'
}

export function deserializeHTML(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

type DeserializedNode = InlineFromExternalPaste | Block

type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]

/**
 * Deserializes the given HTML node.
 * @param el The HTML node to deserialize.
 * @returns The deserialized node.
 */
export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!(el instanceof globalThis.HTMLElement)) {
    return deserializeTextNode(el)
  }
  if (el.nodeName === 'BR') {
    return getInlineNodes('\n')
  }

  if (el.nodeName === 'IMG') {
    return deserializeImageNode(el)
  }

  if (el.nodeName === 'HR') {
    return [{ type: 'divider', children: [{ text: '' }] }]
  }

  const marks = marksFromElementAttributes(el)

  if (isBlockquote(el)) {
    return addMarksToChildren(marks, () => [
      { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
    ])
  }

  return addMarksToChildren(marks, (): DeserializedNode[] => {
    if (isLink(el)) {
      return setLinkForChildren(el.dataset.href, () =>
        forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
      )
    }

    if (isCodeBlock(el)) {
      return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
    }

    const deserialized = deserializeNodes(el.childNodes)
    const children = fixNodesForBlockChildren(deserialized)

    if (isListItem(el)) {
      return deserializeListItem(el, children)
    }

    if (isParagraph(el)) {
      return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
    }

    if (isHeading(el)) {
      return [
        { type: 'heading', level: headings[el.nodeName], textAlign: getAlignmentFromElement(el), children },
      ]
    }

    if (isBlockquoteElement(el)) {
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
  })
}

/**
 * Deserializes the given text node.
 * @param el The text node to deserialize.
 * @returns The deserialized node.
 */
function deserializeTextNode(el: globalThis.Node): DeserializedNode[] {
  const text = el.textContent
  if (!text) {
    return []
  }
  return getInlineNodes(text)
}

/**
 * Deserializes the given image node.
 * @param el The image node to deserialize.
 * @returns The deserialized node.
 */
function deserializeImageNode(el: globalThis.HTMLElement): DeserializedNode[] {
  const alt = el.dataset.alt
  return getInlineNodes(alt ?? '')
}

/**
 * Checks if the given element is a blockquote.
 * @param el The element to check.
 * @returns True if the element is a blockquote, false otherwise.
 */
function isBlockquote(el: globalThis.HTMLElement): boolean {
  return el.classList.contains('listtype-quote')
}

/**
 * Checks if the given element is a link.
 * @param el The element to check.
 * @returns True if the element is a link, false otherwise.
 */
function isLink(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'A' && el.dataset.href
}

/**
 * Checks if the given element is a code block.
 * @param el The element to check.
 * @returns True if the element is a code block, false otherwise.
 */
function isCodeBlock(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'PRE' && el.textContent
}

/**
 * Deserializes the given list item.
 * @param el The list item to deserialize.
 * @param children The children of the list item.
 * @returns The deserialized list item.
 */
function deserializeListItem(el: globalThis.HTMLElement, children: DeserializedNode[]): DeserializedNode[] {
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
 * Checks if the given element is a paragraph.
 * @param el The element to check.
 * @returns True if the element is a paragraph, false otherwise.
 */
function isParagraph(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'P'
}

/**
 * Checks if the given element is a heading.
 * @param el The element to check.
 * @returns True if the element is a heading, false otherwise.
 */
function isHeading(el: globalThis.HTMLElement): boolean {
  return headings[el.nodeName] !== undefined
}

/**
 * Checks if the given element is a blockquote element.
 * @param el The element to check.
 * @returns True if the element is a blockquote element, false otherwise.
 */
function isBlockquoteElement(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'BLOCKQUOTE'
}

/**
 * Checks if the given element is an ordered list.
 * @param el The element to check.
 * @returns True if the element is an ordered list, false otherwise.
 */
function isOrderedList(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'OL'
}

/**
 * Checks if the given element is an unordered list.
 * @param el The element to check.
 * @returns True if the element is an unordered list, false otherwise.
 */
function isUnorderedList(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'UL'
}

/**
 * Checks if the given element is a div.
 * @param el The element to check.
 * @returns True if the element is a div, false otherwise.
 */
function isDiv(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'DIV'
}

/**
 * Deserializes the given nodes.
 * @param nodes The nodes to deserialize.
 * @returns The deserialized nodes.
 */
function deserializeNodes(nodes: Iterable<globalThis.Node>): DeserializedNode[] {
  const outputNodes: (InlineFromExternalPaste | Block)[] = []
  for (const node of nodes) {
    outputNodes.push(...deserializeHTMLNode(node))
  }
  return outputNodes
}

/**
 * Fixes the given nodes for block children.
 * @param deserializedNodes The nodes to fix.
 * @returns The fixed nodes.
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