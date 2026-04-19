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

/* -------------------------------------------------------------------------- */
/* Alignment helpers */
/* -------------------------------------------------------------------------- */

function getAlignmentFromDataAttribute(element: Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  const align = parent?.dataset.align
  if (align === 'center' || align === 'end') {
    return align
  }
}

function getAlignmentFromStyle(element: HTMLElement): 'center' | 'end' | undefined {
  const textAlign = element.style.textAlign
  if (textAlign === 'center') return 'center'
  if (textAlign === 'right' || textAlign === 'end') return 'end'
}

function getAlignmentFromElement(element: Element): 'center' | 'end' | undefined {
  return (
    getAlignmentFromDataAttribute(element) ??
    (element instanceof HTMLElement ? getAlignmentFromStyle(element) : undefined)
  )
}

/* -------------------------------------------------------------------------- */
/* Mark helpers */
/* -------------------------------------------------------------------------- */

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

function getMarksFromNodeName(element: HTMLElement): Set<Mark> {
  const marks = new Set<Mark>()
  const mark = TEXT_TAGS[element.nodeName]
  if (mark) marks.add(mark)
  return marks
}

function getMarksFromStyle(element: HTMLElement): Set<Mark> {
  const marks = new Set<Mark>()
  const { fontWeight, textDecoration, verticalAlign, fontStyle } = element.style

  if (textDecoration === 'underline') marks.add('underline')
  else if (textDecoration === 'line-through') marks.add('strikethrough')

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

  if (fontStyle === 'italic') marks.add('italic')

  if (verticalAlign === 'super') marks.add('superscript')
  else if (verticalAlign === 'sub') marks.add('subscript')

  return marks
}

function getMarksFromConfluence(element: HTMLElement): Set<Mark> {
  const marks = new Set<Mark>()
  if (element.nodeName === 'SPAN' && element.classList.contains('code')) marks.add('code')
  return marks
}

function marksFromElementAttributes(element: HTMLElement): Set<Mark> {
  const marks = new Set<Mark>()
  getMarksFromNodeName(element).forEach(m => marks.add(m))
  getMarksFromStyle(element).forEach(m => marks.add(m))
  getMarksFromConfluence(element).forEach(m => marks.add(m))
  return marks
}

/* -------------------------------------------------------------------------- */
/* Node deserialization helpers */
/* -------------------------------------------------------------------------- */

function handleAnchor(
  el: HTMLElement,
  childNodes: NodeListOf<ChildNode>
): DeserializedNode[] {
  const href = el.getAttribute('href')
  if (!href) return deserializeNodes(el.childNodes)

  return setLinkForChildren(
    href,
    () => forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
  )
}

function handlePre(el: HTMLElement): DeserializedNode[] {
  if (!el.textContent) return []
  return [{ type: 'code', children: [{ text: el.textContent }] }]
}

function handleListItem(
  el: HTMLElement,
  children: DeserializedNode[]
): DeserializedNode[] {
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

function handleParagraph(
  el: HTMLElement,
  children: DeserializedNode[]
): DeserializedNode[] {
  return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
}

function handleHeading(
  el: HTMLElement,
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

function handleBlockquote(
  el: HTMLElement,
  children: DeserializedNode[]
): DeserializedNode[] {
  return [{ type: 'blockquote', children }]
}

function handleOrderedList(
  el: HTMLElement,
  children: DeserializedNode[]
): DeserializedNode[] {
  return [{ type: 'ordered-list', children }]
}

function handleUnorderedList(
  el: HTMLElement,
  children: DeserializedNode[]
): DeserializedNode[] {
  return [{ type: 'unordered-list', children }]
}

function handleDiv(el: HTMLElement, children: DeserializedNode[]): DeserializedNode[] {
  if (!isBlock(children[0])) return [{ type: 'paragraph', children }]
  return children
}

/* -------------------------------------------------------------------------- */
/* Main deserialization logic */
/* -------------------------------------------------------------------------- */

export function deserializeHTML(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

type DeserializedNode = InlineFromExternalPaste | Block

type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]

export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!(el instanceof globalThis.HTMLElement)) {
    const text = el.textContent
    if (!text) return []
    return getInlineNodes(text)
  }

  const { nodeName } = el

  /* Special elements */
  if (nodeName === 'BR') return getInlineNodes('\n')
  if (nodeName === 'IMG') {
    const alt = el.getAttribute('alt')
    return getInlineNodes(alt ?? '')
  }
  if (nodeName === 'HR') return [{ type: 'divider', children: [{ text: '' }] }]

  /* List quote handling */
  if (el.classList.contains('listtype-quote')) {
    const marks = marksFromElementAttributes(el)
    marks.delete('italic')
    return addMarksToChildren(marks, () => [
      {
        type: 'blockquote',
        children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)),
      },
    ])
  }

  const marks = marksFromElementAttributes(el)

  return addMarksToChildren(marks, () => {
    const children = fixNodesForBlockChildren(deserializeNodes(el.childNodes))

    switch (nodeName) {
      case 'A':
        return handleAnchor(el, el.childNodes)
      case 'PRE':
        return handlePre(el)
      case 'LI':
        return handleListItem(el, children)
      case 'P':
        return handleParagraph(el, children)
      case 'BLOCKQUOTE':
        return handleBlockquote(el, children)
      case 'OL':
        return handleOrderedList(el, children)
      case 'UL':
        return handleUnorderedList(el, children)
      case 'DIV':
        return handleDiv(el, children)
      default:
        return children
    }
  })
}

function deserializeNodes(nodes: Iterable<globalThis.Node>): DeserializedNode[] {
  const output: DeserializedNode[] = []
  for (const node of nodes) {
    output.push(...deserializeHTMLNode(node))
  }
  return output
}

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

/* -------------------------------------------------------------------------- */
/* Heading level mapping */
/* -------------------------------------------------------------------------- */

const headings: Record<string, (Node & { type: 'heading' })['level'] | undefined> = {
  H1: 1,
  H2: 2,
  H3: 3,
  H4: 4,
  H5: 5,
  H6: 6,
}
```