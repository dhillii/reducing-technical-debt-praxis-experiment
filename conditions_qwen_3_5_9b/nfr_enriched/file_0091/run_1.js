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
 * Extracts text alignment from an element's parent or style attributes.
 * Checks both Confluence (data-align) and Google Docs (textAlign) conventions.
 */
function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  const alignment = parent?.dataset.align

  if (alignment === 'center' || alignment === 'end') {
    return alignment
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
 * Extracts text formatting marks from an element's attributes and styles.
 * Handles various text decoration and font style conventions.
 */
function getMarksFromElementAttributes(element: globalThis.HTMLElement): Set<Mark> {
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
 * Handles anchor (A) element deserialization.
 * Extracts href and applies link formatting.
 */
function handleAnchorElement(el: globalThis.HTMLElement): DeserializedNode[] {
  const href = el.getAttribute('href')
  if (href) {
    return setLinkForChildren(href, () =>
      forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
    )
  }
  return []
}

/**
 * Handles preformatted text (PRE) element deserialization.
 * Converts to code block with text content.
 */
function handlePreElement(el: globalThis.HTMLElement): DeserializedNode[] {
  if (el.textContent) {
    return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
  }
  return []
}

/**
 * Handles list item (LI) element deserialization.
 * Extracts nested lists and structures list items properly.
 */
function handleListItemElement(el: globalThis.HTMLElement): DeserializedNode[] {
  const deserialized = deserializeNodes(el.childNodes)
  const children = fixNodesForBlockChildren(deserialized)
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
 * Handles paragraph (P) element deserialization.
 * Applies text alignment and wraps children in paragraph block.
 */
function handleParagraphElement(el: globalThis.HTMLElement): DeserializedNode[] {
  const deserialized = deserializeNodes(el.childNodes)
  const children = fixNodesForBlockChildren(deserialized)
  return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
}

/**
 * Handles heading elements (H1-H6) deserialization.
 * Extracts heading level and applies text alignment.
 */
function handleHeadingElement(el: globalThis.HTMLElement): DeserializedNode[] {
  const { nodeName } = el
  const headingLevel = headings[nodeName]

  if (typeof headingLevel === 'number') {
    const deserialized = deserializeNodes(el.childNodes)
    const children = fixNodesForBlockChildren(deserialized)
    return [
      { type: 'heading', level: headingLevel, textAlign: getAlignmentFromElement(el), children },
    ]
  }
  return []
}

/**
 * Handles blockquote element deserialization.
 * Wraps children in blockquote block.
 */
function handleBlockquoteElement(el: globalThis.HTMLElement): DeserializedNode[] {
  const deserialized = deserializeNodes(el.childNodes)
  const children = fixNodesForBlockChildren(deserialized)
  return [{ type: 'blockquote', children }]
}

/**
 * Handles ordered list (OL) element deserialization.
 * Wraps children in ordered list block.
 */
function handleOrderedListElement(el: globalThis.HTMLElement): DeserializedNode[] {
  const deserialized = deserializeNodes(el.childNodes)
  const children = fixNodesForBlockChildren(deserialized)
  return [{ type: 'ordered-list', children }]
}

/**
 * Handles unordered list (UL) element deserialization.
 * Wraps children in unordered list block.
 */
function handleUnorderedListElement(el: globalThis.HTMLElement): DeserializedNode[] {
  const deserialized = deserializeNodes(el.childNodes)
  const children = fixNodesForBlockChildren(deserialized)
  return [{ type: 'unordered-list', children }]
}

/**
 * Handles div element deserialization.
 * Converts to paragraph if children are not block-level.
 */
function handleDivElement(el: globalThis.HTMLElement): DeserializedNode[] {
  const deserialized = deserializeNodes(el.childNodes)
  const children = fixNodesForBlockChildren(deserialized)
  if (!isBlock(children[0])) {
    return [{ type: 'paragraph', children }]
  }
  return deserialized
}

/**
 * Handles blockquote element with listtype-quote class.
 * Removes italic mark and wraps in blockquote.
 */
function handleListTypeQuoteElement(el: globalThis.HTMLElement): DeserializedNode[] {
  const marks = getMarksFromElementAttributes(el)
  marks.delete('italic')
  return addMarksToChildren(marks, () => [
    { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
  ])
}

/**
 * Handles image (IMG) element deserialization.
 * Extracts alt text and converts to inline nodes.
 */
function handleImageElement(el: globalThis.HTMLElement): DeserializedNode[] {
  const alt = el.getAttribute('alt')
  return getInlineNodes(alt ?? '')
}

/**
 * Handles line break (BR) element deserialization.
 * Converts to newline inline node.
 */
function handleBreakElement(el: globalThis.HTMLElement): DeserializedNode[] {
  return getInlineNodes('\n')
}

/**
 * Handles heading element deserialization.
 * Extracts heading level and applies text alignment.
 */
function handleHeadingElement(el: globalThis.HTMLElement): DeserializedNode[] {
  const { nodeName } = el
  const headingLevel = headings[nodeName]

  if (typeof headingLevel === 'number') {
    const deserialized = deserializeNodes(el.childNodes)
    const children = fixNodesForBlockChildren(deserialized)
    return [
      { type: 'heading', level: headingLevel, textAlign: getAlignmentFromElement(el), children },
    ]
  }
  return []
}

type DeserializedNode = InlineFromExternalPaste | Block

type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]

export function deserializeHTML(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!(el instanceof globalThis.HTMLElement)) {
    const text = el.textContent
    if (!text) {
      return []
    }
    return getInlineNodes(text)
  }

  const { nodeName } = el

  if (nodeName === 'BR') {
    return handleBreakElement(el)
  }

  if (nodeName === 'IMG') {
    return handleImageElement(el)
  }

  if (nodeName === 'HR') {
    return [{ type: 'divider', children: [{ text: '' }] }]
  }

  if (el.classList.contains('listtype-quote')) {
    return handleListTypeQuoteElement(el)
  }

  if (nodeName === 'A') {
    return handleAnchorElement(el)
  }

  if (nodeName === 'PRE') {
    return handlePreElement(el)
  }

  if (nodeName === 'LI') {
    return handleListItemElement(el)
  }

  if (nodeName === 'P') {
    return handleParagraphElement(el)
  }

  if (nodeName === 'H1' || nodeName === 'H2' || nodeName === 'H3' || nodeName === 'H4' || nodeName === 'H5' || nodeName === 'H6') {
    return handleHeadingElement(el)
  }

  if (nodeName === 'BLOCKQUOTE') {
    return handleBlockquoteElement(el)
  }

  if (nodeName === 'OL') {
    return handleOrderedListElement(el)
  }

  if (nodeName === 'UL') {
    return handleUnorderedListElement(el)
  }

  if (nodeName === 'DIV') {
    return handleDivElement(el)
  }

  const marks = getMarksFromElementAttributes(el)
  const deserialized = deserializeNodes(el.childNodes)
  const children = fixNodesForBlockChildren(deserialized)
  return addMarksToChildren(marks, () => deserialized)
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
```