```typescript
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
 * Extracts the alignment from an element.
 * @param element The element to extract the alignment from.
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
 * Extracts marks from an element's attributes.
 * @param element The element to extract marks from.
 * @returns A set of marks extracted from the element.
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
 * Checks if a text decoration is underline.
 * @param textDecoration The text decoration to check.
 * @returns True if the text decoration is underline, false otherwise.
 */
function isUnderline(textDecoration: string): boolean {
  return textDecoration === 'underline'
}

/**
 * Checks if a text decoration is strikethrough.
 * @param textDecoration The text decoration to check.
 * @returns True if the text decoration is strikethrough, false otherwise.
 */
function isStrikethrough(textDecoration: string): boolean {
  return textDecoration === 'line-through'
}

/**
 * Checks if a node name and font weight are bold.
 * @param nodeName The node name to check.
 * @param fontWeight The font weight to check.
 * @returns True if the node name and font weight are bold, false otherwise.
 */
function isBold(nodeName: string, fontWeight: string): boolean {
  if (nodeName === 'B' && fontWeight !== 'normal') {
    return true
  }
  return (
    typeof fontWeight === 'string' &&
    (fontWeight === 'bold' ||
      fontWeight === 'bolder' ||
      fontWeight === '1000' ||
      /^[5-9]\d{2}$/.test(fontWeight))
  )
}

/**
 * Checks if a vertical align is superscript.
 * @param verticalAlign The vertical align to check.
 * @returns True if the vertical align is superscript, false otherwise.
 */
function isSuperscript(verticalAlign: string): boolean {
  return verticalAlign === 'super'
}

/**
 * Checks if a vertical align is subscript.
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

  if (isBlockquoteNode(el)) {
    return addMarksToChildren(marks, () => [
      { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
    ])
  }

  return addMarksToChildren(marks, (): DeserializedNode[] => {
    if (isLinkNode(el)) {
      return setLinkForChildren(el.dataset.href, () =>
        forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
      )
    }

    if (isCodeNode(el)) {
      return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
    }

    const deserialized = deserializeNodes(el.childNodes)
    const children = fixNodesForBlockChildren(deserialized)

    if (isListNode(el)) {
      return deserializeListNode(el, children)
    }

    if (isParagraphNode(el)) {
      return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
    }

    if (isHeadingNode(el)) {
      return [
        {
          type: 'heading',
          level: headings[el.nodeName],
          textAlign: getAlignmentFromElement(el),
          children,
        },
      ]
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
    if (isDivNode(el)) {
      return [{ type: 'paragraph', children }]
    }
    return deserialized
  })
}

/**
 * Deserializes a text node.
 * @param el The text node to deserialize.
 * @returns The deserialized text node.
 */
function deserializeTextNode(el: globalThis.Node): DeserializedNode[] {
  const text = el.textContent
  if (!text) {
    return []
  }
  return getInlineNodes(text)
}

/**
 * Deserializes an image node.
 * @param el The image node to deserialize.
 * @returns The deserialized image node.
 */
function deserializeImageNode(el: globalThis.HTMLElement): DeserializedNode[] {
  const alt = el.dataset.alt
  return getInlineNodes(alt ?? '')
}

/**
 * Checks if a node is a blockquote node.
 * @param el The node to check.
 * @returns True if the node is a blockquote node, false otherwise.
 */
function isBlockquoteNode(el: globalThis.HTMLElement): boolean {
  return el.classList.contains('listtype-quote')
}

/**
 * Checks if a node is a link node.
 * @param el The node to check.
 * @returns True if the node is a link node, false otherwise.
 */
function isLinkNode(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'A' && el.dataset.href
}

/**
 * Checks if a node is a code node.
 * @param el The node to check.
 * @returns True if the node is a code node, false otherwise.
 */
function isCodeNode(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'PRE' && el.textContent
}

/**
 * Checks if a node is a list node.
 * @param el The node to check.
 * @returns True if the node is a list node, false otherwise.
 */
function isListNode(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'LI'
}

/**
 * Deserializes a list node.
 * @param el The list node to deserialize.
 * @param children The children of the list node.
 * @returns The deserialized list node.
 */
function deserializeListNode(el: globalThis.HTMLElement, children: DeserializedNode[]): DeserializedNode[] {
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
 * Checks if a node is a paragraph node.
 * @param el The node to check.
 * @returns True if the node is a paragraph node, false otherwise.
 */
function isParagraphNode(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'P'
}

/**
 * Checks if a node is a heading node.
 * @param el The node to check.
 * @returns True if the node is a heading node, false otherwise.
 */
function isHeadingNode(el: globalThis.HTMLElement): boolean {
  return headings[el.nodeName] !== undefined
}

/**
 * Checks if a node is a blockquote node.
 * @param el The node to check.
 * @returns True if the node is a blockquote node, false otherwise.
 */
function isBlockquoteNode(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'BLOCKQUOTE'
}

/**
 * Checks if a node is an ordered list node.
 * @param el The node to check.
 * @returns True if the node is an ordered list node, false otherwise.
 */
function isOrderedListNode(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'OL'
}

/**
 * Checks if a node is an unordered list node.
 * @param el The node to check.
 * @returns True if the node is an unordered list node, false otherwise.
 */
function isUnorderedListNode(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'UL'
}

/**
 * Checks if a node is a div node.
 * @param el The node to check.
 * @returns True if the node is a div node, false otherwise.
 */
function isDivNode(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'DIV' && !isBlock(el.childNodes[0])
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
```