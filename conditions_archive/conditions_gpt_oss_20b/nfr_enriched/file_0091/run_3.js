```ts
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

/** Retrieve alignment from a parent element's data attribute. */
function getParentAlignment(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  return parent?.dataset.align === 'center' || parent?.dataset.align === 'end'
    ? (parent.dataset.align as 'center' | 'end')
    : undefined
}

/** Retrieve alignment from an element's inline style. */
function getStyleAlignment(element: globalThis.HTMLElement): 'center' | 'end' | undefined {
  const textAlign = element.style.textAlign
  if (textAlign === 'center') return 'center'
  if (textAlign === 'right' || textAlign === 'end') return 'end'
  return undefined
}

/** Determine alignment for an element. */
function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  return getParentAlignment(element) ?? getStyleAlignment(element as globalThis.HTMLElement)
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

/** Marks derived from the element's node name. */
function getMarksFromNodeName(element: globalThis.HTMLElement): Set<Mark> {
  const marks = new Set<Mark>()
  const mark = TEXT_TAGS[element.nodeName]
  if (mark) marks.add(mark)
  return marks
}

/** Marks derived from the element's inline style. */
function getMarksFromStyle(element: globalThis.HTMLElement): Set<Mark> {
  const marks = new Set<Mark>()
  const { fontWeight, textDecoration, verticalAlign, fontStyle } = element.style

  if (textDecoration === 'underline') marks.add('underline')
  else if (textDecoration === 'line-through') marks.add('strikethrough')

  if (fontStyle === 'italic') marks.add('italic')

  if (verticalAlign === 'super') marks.add('superscript')
  else if (verticalAlign === 'sub') marks.add('subscript')

  if (fontWeight !== 'normal') {
    if (
      typeof fontWeight === 'string' &&
      (fontWeight === 'bold' ||
        fontWeight === 'bolder' ||
        fontWeight === '1000' ||
        /^[5-9]\d{2}$/.test(fontWeight))
    )
      marks.add('bold')
  }

  return marks
}

/** Marks derived from Confluence-specific markup. */
function getMarksFromConfluence(element: globalThis.HTMLElement): Set<Mark> {
  const marks = new Set<Mark>()
  if (element.nodeName === 'SPAN' && element.classList.contains('code')) marks.add('code')
  return marks
}

/** Aggregate all marks for an element. */
function marksFromElementAttributes(element: globalThis.HTMLElement): Set<Mark> {
  const marks = new Set<Mark>()
  for (const m of getMarksFromNodeName(element)) marks.add(m)
  for (const m of getMarksFromStyle(element)) marks.add(m)
  for (const m of getMarksFromConfluence(element)) marks.add(m)
  return marks
}

/** Handle <BR> elements. */
function handleBreak(): DeserializedNode[] {
  return getInlineNodes('\n')
}

/** Handle <IMG> elements. */
function handleImage(el: globalThis.HTMLElement): DeserializedNode[] {
  const alt = el.getAttribute('alt')
  return getInlineNodes(alt ?? '')
}

/** Handle <HR> elements. */
function handleHorizontalRule(): DeserializedNode[] {
  return [{ type: 'divider', children: [{ text: '' }] }]
}

/** Handle <A> elements. */
function handleAnchor(
  el: globalThis.HTMLElement,
  marks: Set<Mark>,
  children: DeserializedNode[]
): DeserializedNode[] {
  const href = el.getAttribute('href')
  if (!href) return children
  return setLinkForChildren(
    href,
    () => forceDisableMarkForChildren('underline', () => children)
  )
}

/** Handle <PRE> elements. */
function handlePre(el: globalThis.HTMLElement): DeserializedNode[] {
  if (!el.textContent) return []
  return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
}

/** Handle <LI> elements. */
function handleListItem(
  el: globalThis.HTMLElement,
  children: DeserializedNode[]
): DeserializedNode[] {
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

/** Handle <P> elements. */
function handleParagraph(
  el: globalThis.HTMLElement,
  children: DeserializedNode[]
): DeserializedNode[] {
  return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
}

/** Handle heading elements. */
function handleHeading(
  el: globalThis.HTMLElement,
  children: DeserializedNode[]
): DeserializedNode[] {
  const level = headings[el.nodeName]
  if (typeof level !== 'number') return children
  return [
    {
      type: 'heading',
      level,
      textAlign: getAlignmentFromElement(el),
      children,
    },
  ]
}

/** Handle <BLOCKQUOTE> elements. */
function handleBlockquote(
  el: globalThis.HTMLElement,
  children: DeserializedNode[]
): DeserializedNode[] {
  return [{ type: 'blockquote', children }]
}

/** Handle <OL> elements. */
function handleOrderedList(
  el: globalThis.HTMLElement,
  children: DeserializedNode[]
): DeserializedNode[] {
  return [{ type: 'ordered-list', children }]
}

/** Handle <UL> elements. */
function handleUnorderedList(
  el: globalThis.HTMLElement,
  children: DeserializedNode[]
): DeserializedNode[] {
  return [{ type: 'unordered-list', children }]
}

/** Handle <DIV> elements that are not blocks. */
function handleDiv(
  el: globalThis.HTMLElement,
  children: DeserializedNode[]
): DeserializedNode[] {
  if (!isBlock(children[0])) return [{ type: 'paragraph', children }]
  return children
}

/** Handle special cases like listtype-quote. */
function handleSpecialListQuote(
  el: globalThis.HTMLElement,
  marks: Set<Mark>
): DeserializedNode[] {
  if (!el.classList.contains('listtype-quote')) return []
  marks.delete('italic')
  return addMarksToChildren(marks, () => [
    {
      type: 'blockquote',
      children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)),
    },
  ])
}

/** Main node deserialization logic. */
export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!(el instanceof globalThis.HTMLElement)) {
    const text = el.textContent
    if (!text) return []
    return getInlineNodes(text)
  }

  const { nodeName } = el

  if (nodeName === 'BR') return handleBreak()
  if (nodeName === 'IMG') return handleImage(el)
  if (nodeName === 'HR') return handleHorizontalRule()

  const marks = marksFromElementAttributes(el)

  const special = handleSpecialListQuote(el, marks)
  if (special.length) return special

  const children = fixNodesForBlockChildren(deserializeNodes(el.childNodes))

  return addMarksToChildren(marks, () => {
    if (nodeName === 'A') return handleAnchor(el, marks, children)
    if (nodeName === 'PRE') return handlePre(el)
    if (nodeName === 'LI') return handleListItem(el, children)
    if (nodeName === 'P') return handleParagraph(el, children)
    if (nodeName === 'BLOCKQUOTE') return handleBlockquote(el, children)
    if (nodeName === 'OL') return handleOrderedList(el, children)
    if (nodeName === 'UL') return handleUnorderedList(el, children)
    if (nodeName === 'DIV') return handleDiv(el, children)
    return children
  })
}

export function deserializeHTML(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

type DeserializedNode = InlineFromExternalPaste | Block
type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]

function deserializeNodes(nodes: Iterable<globalThis.Node>): DeserializedNode[] {
  const output: DeserializedNode[] = []
  for (const node of nodes) output.push(...deserializeHTMLNode(node))
  return output
}

/** Ensure block children are properly wrapped and normalized. */
function fixNodesForBlockChildren(deserializedNodes: DeserializedNode[]): DeserializedNodes {
  if (!deserializedNodes.length) return [{ text: '' }]

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
      if (Node.string(node).trim() !== '') queuedInlines.push(node)
    }
    flushInlines()
    return result as DeserializedNodes
  }

  return deserializedNodes as DeserializedNodes
}
```