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

/**
 * Extracts alignment information from an element or its parent.
 * Confluence uses `data-align` on the parent element.
 * Google Docs uses the `text-align` style on the element itself.
 */
function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  const alignAttr = parent?.dataset.align
  if (alignAttr === 'center' || alignAttr === 'end') {
    return alignAttr
  }
  if (element instanceof HTMLElement) {
    const textAlign = element.style.textAlign
    if (textAlign === 'center') return 'center'
    if (textAlign === 'right' || textAlign === 'end') return 'end'
  }
}

/**
 * Derives Slate marks from an element's tag name and inline styles.
 */
function marksFromElementAttributes(element: globalThis.HTMLElement) {
  const marks = new Set<Mark>()
  const style = element.style
  const { nodeName } = element
  const markFromNodeName = TEXT_TAGS[nodeName]
  if (markFromNodeName) marks.add(markFromNodeName)

  const { fontWeight, textDecoration, verticalAlign } = style
  if (textDecoration === 'underline') marks.add('underline')
  else if (textDecoration === 'line-through') marks.add('strikethrough')

  if (nodeName === 'SPAN' && element.classList.contains('code')) marks.add('code')
  if (nodeName === 'B' && fontWeight !== 'normal') marks.add('bold')
  else if (
    typeof fontWeight === 'string' &&
    (fontWeight === 'bold' ||
      fontWeight === 'bolder' ||
      fontWeight === '1000' ||
      /^[5-9]\d{2}$/.test(fontWeight))
  )
    marks.add('bold')
  if (style.fontStyle === 'italic') marks.add('italic')
  if (verticalAlign === 'super') marks.add('superscript')
  else if (verticalAlign === 'sub') marks.add('subscript')
  return marks
}

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

  // Handle simple inline elements
  if (el.nodeName === 'BR') return getInlineNodes('\n')
  if (el.nodeName === 'IMG') {
    const alt = el.getAttribute('alt')
    return getInlineNodes(alt ?? '')
  }
  if (el.nodeName === 'HR') return [{ type: 'divider', children: [{ text: '' }] }]

  const marks = marksFromElementAttributes(el)

  // Dropbox Paper displays blockquotes as lists for some reason
  if (el.classList.contains('listtype-quote')) {
    marks.delete('italic')
    return addMarksToChildren(marks, () => [
      { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
    ])
  }

  const deserialized = deserializeNodes(el.childNodes)
  const children = fixNodesForBlockChildren(deserialized)

  // Handle element-specific logic
  const linkResult = handleLink(el, marks)
  if (linkResult) return linkResult

  const preResult = handlePre(el)
  if (preResult) return preResult

  if (el.nodeName === 'LI') return handleListItem(el, children)
  if (el.nodeName === 'P') return handleParagraph(el, children)

  const headingLevel = headings[el.nodeName]
  if (typeof headingLevel === 'number') return handleHeading(el, children)

  if (el.nodeName === 'BLOCKQUOTE') return handleBlockquote(el, children)
  if (el.nodeName === 'OL') return handleOrderedList(el, children)
  if (el.nodeName === 'UL') return handleUnorderedList(el, children)
  if (el.nodeName === 'DIV' && !isBlock(children[0])) return handleDiv(el, children)

  return deserialized
}

/**
 * Handles <a> elements, applying link marks and disabling underline.
 */
function handleLink(el: globalThis.HTMLElement, marks: Set<Mark>): DeserializedNode[] | null {
  if (el.nodeName !== 'A') return null
  const href = el.getAttribute('href')
  if (!href) return null
  return setLinkForChildren(href, () =>
    forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
  )
}

/**
 * Handles <pre> elements, converting them to code blocks.
 */
function handlePre(el: globalThis.HTMLElement): DeserializedNode[] | null {
  if (el.nodeName !== 'PRE' || !el.textContent) return null
  return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
}

/**
 * Handles <li> elements, separating nested lists from content.
 */
function handleListItem(el: globalThis.HTMLElement, children: DeserializedNode[]): DeserializedNode[] {
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
 * Handles <p> elements, applying alignment.
 */
function handleParagraph(el: globalThis.HTMLElement, children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
}

/**
 * Handles heading elements (H1-H6).
 */
function handleHeading(el: globalThis.HTMLElement, children: DeserializedNode[]): DeserializedNode[] {
  const headingLevel = headings[el.nodeName]
  return [
    {
      type: 'heading',
      level: headingLevel,
      textAlign: getAlignmentFromElement(el),
      children,
    },
  ]
}

/**
 * Handles <blockquote> elements.
 */
function handleBlockquote(el: globalThis.HTMLElement, children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'blockquote', children }]
}

/**
 * Handles ordered lists.
 */
function handleOrderedList(el: globalThis.HTMLElement, children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'ordered-list', children }]
}

/**
 * Handles unordered lists.
 */
function handleUnorderedList(el: globalThis.HTMLElement, children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'unordered-list', children }]
}

/**
 * Handles <div> elements that should be treated as paragraphs.
 */
function handleDiv(el: globalThis.HTMLElement, children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'paragraph', children }]
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
```