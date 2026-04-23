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

/* ---------- Alignment ---------- */
function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  const dataAlign = parent?.dataset.align // Prefer .dataset over getAttribute
  if (dataAlign === 'center' || dataAlign === 'end') {
    return dataAlign
  }
  if (element instanceof HTMLElement) {
    const { textAlign } = element.style
    if (textAlign === 'center') return 'center'
    if (textAlign === 'right' || textAlign === 'end') return 'end'
  }
}

/* ---------- Marks ---------- */
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

/* ---------- Node Handlers ---------- */
function handleAnchor(el: globalThis.HTMLElement): DeserializedNode[] | undefined {
  const href = el.getAttribute('href')
  if (!href) return undefined
  return setLinkForChildren(href, () =>
    forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
  )
}

function handlePre(el: globalThis.HTMLElement): DeserializedNode[] | undefined {
  if (!el.textContent) return undefined
  return [{ type: 'code', children: [{ text: el.textContent }] }]
}

function handleListItem(el: globalThis.HTMLElement, children: DeserializedNode[]): DeserializedNode[] {
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

function handleParagraph(el: globalThis.HTMLElement, children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
}

function handleHeading(el: globalThis.HTMLElement, level: number, children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'heading', level, textAlign: getAlignmentFromElement(el), children }]
}

function handleBlockquote(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'blockquote', children }]
}

function handleOrderedList(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'ordered-list', children }]
}

function handleUnorderedList(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'unordered-list', children }]
}

function handleDivParagraph(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'paragraph', children }]
}

/* ---------- Core Deserialization ---------- */
export function deserializeHTML(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

type DeserializedNode = InlineFromExternalPaste | Block
type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]

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

  return addMarksToChildren(marks, () => {
    const { nodeName } = el
    const childNodes = deserializeNodes(el.childNodes)
    const children = fixNodesForBlockChildren(childNodes)

    // Specific element handlers
    if (nodeName === 'A') {
      const result = handleAnchor(el)
      if (result) return result
    }
    if (nodeName === 'PRE') {
      const result = handlePre(el)
      if (result) return result
    }
    if (nodeName === 'LI') return handleListItem(el, children)
    if (nodeName === 'P') return handleParagraph(el, children)

    const headingLevel = headings[nodeName]
    if (typeof headingLevel === 'number') return handleHeading(el, headingLevel, children)

    if (nodeName === 'BLOCKQUOTE') return handleBlockquote(children)
    if (nodeName === 'OL') return handleOrderedList(children)
    if (nodeName === 'UL') return handleUnorderedList(children)
    if (nodeName === 'DIV' && !isBlock(children[0])) return handleDivParagraph(children)

    // Fallback – return raw deserialized nodes
    return childNodes
  })
}

/* ---------- Helper Traversal ---------- */
function deserializeNodes(nodes: Iterable<globalThis.Node>): DeserializedNode[] {
  const output: DeserializedNode[] = []
  for (const node of nodes) {
    output.push(...deserializeHTMLNode(node))
  }
  return output
}

/* ---------- Block Normalization ---------- */
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