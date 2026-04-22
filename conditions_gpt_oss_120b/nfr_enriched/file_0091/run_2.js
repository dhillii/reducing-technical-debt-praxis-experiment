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
 * Extract alignment from a parent element's `data-align` attribute or inline style.
 */
function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  const dataAlign = parent?.dataset.align // prefer .dataset over getAttribute
  if (dataAlign === 'center' || dataAlign === 'end') {
    return dataAlign
  }
  if (element instanceof HTMLElement) {
    const { textAlign } = element.style
    if (textAlign === 'center') return 'center'
    if (textAlign === 'right' || textAlign === 'end') return 'end'
  }
}

/**
 * Mapping of heading tag names to their numeric levels.
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
 * Derive Slate marks from an element's attributes and styles.
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
 * Types used by the deserializer.
 */
type DeserializedNode = InlineFromExternalPaste | Block
type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]

/**
 * Public API – deserialize a single DOM node.
 */
export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!(el instanceof globalThis.HTMLElement)) {
    const text = el.textContent
    return text ? getInlineNodes(text) : []
  }

  if (el.nodeName === 'BR') return getInlineNodes('\n')
  if (el.nodeName === 'IMG') return getInlineNodes(el.getAttribute('alt') ?? '')
  if (el.nodeName === 'HR') return [{ type: 'divider', children: [{ text: '' }] }]

  const marks = marksFromElementAttributes(el)

  // Dropbox Paper displays blockquotes as lists for some reason
  if (el.classList.contains('listtype-quote')) {
    marks.delete('italic')
    return addMarksToChildren(marks, () => [
      { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
    ])
  }

  return addMarksToChildren(marks, () => deserializeElement(el))
}

/**
 * Dispatch handling based on element type.
 */
function deserializeElement(el: globalThis.HTMLElement): DeserializedNode[] {
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
      return handleDefault(el)
  }
}

/**
 * Handle `<a>` elements – apply link and suppress underline.
 */
function handleAnchor(el: globalThis.HTMLElement): DeserializedNode[] {
  const href = el.getAttribute('href')
  if (!href) return deserializeChildren(el)
  return setLinkForChildren(href, () =>
    forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
  )
}

/**
 * Handle `<pre>` elements – treat as code blocks.
 */
function handlePre(el: globalThis.HTMLElement): DeserializedNode[] {
  if (!el.textContent) return []
  return [{ type: 'code', children: [{ text: el.textContent }] }]
}

/**
 * Handle `<li>` elements – separate nested lists from content.
 */
function handleListItem(el: globalThis.HTMLElement): DeserializedNode[] {
  const deserialized = deserializeNodes(el.childNodes)
  const children = fixNodesForBlockChildren(deserialized)

  let nestedList: Block | undefined
  const contentChildren = children.filter(node => {
    if (!nestedList && (node.type === 'ordered-list' || node.type === 'unordered-list')) {
      nestedList = node
      return false
    }
    return true
  })

  const listItemContent = {
    type: 'list-item-content' as const,
    children: contentChildren,
  }

  const listItemChildren = nestedList ? [listItemContent, nestedList] : [listItemContent]
  return [{ type: 'list-item', children: listItemChildren }]
}

/**
 * Handle `<p>` elements – apply alignment if present.
 */
function handleParagraph(el: globalThis.HTMLElement): DeserializedNode[] {
  const children = deserializeChildren(el)
  return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
}

/**
 * Handle `<div>` elements – fallback to paragraph when not a block.
 */
function handleDiv(el: globalThis.HTMLElement): DeserializedNode[] {
  const children = deserializeChildren(el)
  if (children.length && !isBlock(children[0])) {
    return [{ type: 'paragraph', children }]
  }
  return children
}

/**
 * Default handling – treat element's children as block content.
 */
function handleDefault(el: globalThis.HTMLElement): DeserializedNode[] {
  const deserialized = deserializeNodes(el.childNodes)
  const children = fixNodesForBlockChildren(deserialized)

  const headingLevel = headings[el.nodeName]
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
 * Helper to deserialize an element's child nodes.
 */
function deserializeChildren(el: globalThis.HTMLElement): DeserializedNode[] {
  return fixNodesForBlockChildren(deserializeNodes(el.childNodes))
}

/**
 * Deserialize a collection of nodes.
 */
function deserializeNodes(nodes: Iterable<globalThis.Node>): DeserializedNode[] {
  const output: DeserializedNode[] = []
  for (const node of nodes) {
    output.push(...deserializeHTMLNode(node))
  }
  return output
}

/**
 * Ensure the node list conforms to Slate's expectations for block children.
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
```