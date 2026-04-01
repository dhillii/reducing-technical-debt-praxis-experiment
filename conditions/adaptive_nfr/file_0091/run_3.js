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

/** Checks if parent element has confluence data-align attribute */
function hasConfluenceAlignment(parent: Element | null): parent is Element {
  return parent !== null && parent !== undefined
}

/** Extracts alignment from confluence data-align attribute */
function getConfluenceAlignment(parent: Element): 'center' | 'end' | undefined {
  const attribute = parent.dataset.align
  if (attribute === 'center' || attribute === 'end') {
    return attribute
  }
  return undefined
}

/** Extracts alignment from Google Docs text-align style */
function getGoogleDocsAlignment(element: HTMLElement): 'center' | 'end' | undefined {
  const textAlign = element.style.textAlign
  if (textAlign === 'center') {
    return 'center'
  }
  if (textAlign === 'right' || textAlign === 'end') {
    return 'end'
  }
  return undefined
}

function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  if (hasConfluenceAlignment(parent)) {
    const confluenceAlign = getConfluenceAlignment(parent)
    if (confluenceAlign) {
      return confluenceAlign
    }
  }

  if (element instanceof HTMLElement) {
    return getGoogleDocsAlignment(element)
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

/** Adds mark from node name if applicable */
function addMarkFromNodeName(marks: Set<Mark>, nodeName: string): void {
  const markFromNodeName = TEXT_TAGS[nodeName]
  if (markFromNodeName) {
    marks.add(markFromNodeName)
  }
}

/** Adds marks from text decoration style */
function addMarksFromTextDecoration(marks: Set<Mark>, textDecoration: string): void {
  if (textDecoration === 'underline') {
    marks.add('underline')
  } else if (textDecoration === 'line-through') {
    marks.add('strikethrough')
  }
}

/** Checks if element is confluence code span */
function isConfluenceCodeSpan(nodeName: string, classList: DOMTokenList): boolean {
  return nodeName === 'SPAN' && classList.contains('code')
}

/** Adds marks from font weight */
function addMarksFromFontWeight(marks: Set<Mark>, nodeName: string, fontWeight: string): void {
  if (nodeName === 'B' && fontWeight !== 'normal') {
    marks.add('bold')
    return
  }

  if (typeof fontWeight !== 'string') {
    return
  }

  const isBoldWeight =
    fontWeight === 'bold' ||
    fontWeight === 'bolder' ||
    fontWeight === '1000' ||
    /^[5-9]\d{2}$/.test(fontWeight)

  if (isBoldWeight) {
    marks.add('bold')
  }
}

/** Adds marks from vertical align style */
function addMarksFromVerticalAlign(marks: Set<Mark>, verticalAlign: string): void {
  if (verticalAlign === 'super') {
    marks.add('superscript')
  } else if (verticalAlign === 'sub') {
    marks.add('subscript')
  }
}

function marksFromElementAttributes(element: globalThis.HTMLElement) {
  const marks = new Set<Mark>()
  const style = element.style
  const { nodeName } = element

  addMarkFromNodeName(marks, nodeName)
  addMarksFromTextDecoration(marks, style.textDecoration)

  if (isConfluenceCodeSpan(nodeName, element.classList)) {
    marks.add('code')
  }

  addMarksFromFontWeight(marks, nodeName, style.fontWeight)

  if (style.fontStyle === 'italic') {
    marks.add('italic')
  }

  addMarksFromVerticalAlign(marks, style.verticalAlign)

  return marks
}

export function deserializeHTML(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

type DeserializedNode = InlineFromExternalPaste | Block

type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]

/** Handles non-HTML nodes and text content */
function deserializeNonHTMLNode(el: globalThis.Node): DeserializedNode[] {
  const text = el.textContent
  if (!text) {
    return []
  }
  return getInlineNodes(text)
}

/** Handles BR elements */
function deserializeBRElement(): DeserializedNode[] {
  return getInlineNodes('\n')
}

/** Handles IMG elements */
function deserializeIMGElement(el: globalThis.HTMLElement): DeserializedNode[] {
  const alt = el.dataset.alt ?? ''
  return getInlineNodes(alt)
}

/** Handles HR elements */
function deserializeHRElement(): DeserializedNode[] {
  return [{ type: 'divider', children: [{ text: '' }] }]
}

/** Checks if element is Dropbox Paper blockquote */
function isDropboxPaperBlockquote(el: globalThis.HTMLElement): boolean {
  return el.classList.contains('listtype-quote')
}

/** Handles Dropbox Paper blockquote elements */
function deserializeDropboxBlockquote(
  el: globalThis.HTMLElement,
  marks: Set<Mark>
): DeserializedNode[] {
  marks.delete('italic')
  return addMarksToChildren(marks, () => [
    { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
  ])
}

/** Checks if element is anchor tag with href */
function isAnchorWithHref(nodeName: string, el: globalThis.HTMLElement): boolean {
  return nodeName === 'A' && !!el.dataset.href
}

/** Handles anchor elements */
function deserializeAnchorElement(el: globalThis.HTMLElement): DeserializedNode[] {
  const href = el.dataset.href
  if (!href) {
    return deserializeNodes(el.childNodes)
  }
  return setLinkForChildren(href, () =>
    forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
  )
}

/** Checks if element is pre with text content */
function isPreWithContent(nodeName: string, el: globalThis.HTMLElement): boolean {
  return nodeName === 'PRE' && !!el.textContent
}

/** Handles pre elements */
function deserializePreElement(el: globalThis.HTMLElement): DeserializedNode[] {
  return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
}

/** Handles list item elements */
function deserializeListItem(children: DeserializedNode[]): DeserializedNode[] {
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

/** Handles paragraph elements */
function deserializeParagraph(
  el: globalThis.HTMLElement,
  children: DeserializedNode[]
): DeserializedNode[] {
  return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
}

/** Handles heading elements */
function deserializeHeading(
  el: globalThis.HTMLElement,
  level: number,
  children: DeserializedNode[]
): DeserializedNode[] {
  return [
    { type: 'heading', level, textAlign: getAlignmentFromElement(el), children },
  ]
}

/** Checks if element is blockquote */
function isBlockquote(nodeName: string): boolean {
  return nodeName === 'BLOCKQUOTE'
}

/** Handles blockquote elements */
function deserializeBlockquote(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'blockquote', children }]
}

/** Checks if element is ordered list */
function isOrderedList(nodeName: string): boolean {
  return nodeName === 'OL'
}

/** Handles ordered list elements */
function deserializeOrderedList(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'ordered-list', children }]
}

/** Checks if element is unordered list */
function isUnorderedList(nodeName: string): boolean {
  return nodeName === 'UL'
}

/** Handles unordered list elements */
function deserializeUnorderedList(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'unordered-list', children }]
}

/** Checks if element is div without block children */
function isDivWithoutBlockChildren(nodeName: string, children: DeserializedNode[]): boolean {
  return nodeName === 'DIV' && !isBlock(children[0])
}

/** Handles div elements */
function deserializeDiv(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'paragraph', children }]
}

export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!(el instanceof globalThis.HTMLElement)) {
    return deserializeNonHTMLNode(el)
  }

  if (el.nodeName === 'BR') {
    return deserializeBRElement()
  }

  if (el.nodeName === 'IMG') {
    return deserializeIMGElement(el)
  }

  if (el.nodeName === 'HR') {
    return deserializeHRElement()
  }

  const marks = marksFromElementAttributes(el)

  if (isDropboxPaperBlockquote(el)) {
    return deserializeDropboxBlockquote(el, marks)
  }

  return addMarksToChildren(marks, (): DeserializedNode[] => {
    const { nodeName } = el

    if (isAnchorWithHref(nodeName, el)) {
      return deserializeAnchorElement(el)
    }

    if (isPreWithContent(nodeName, el)) {
      return deserializePreElement(el)
    }

    const deserialized = deserializeNodes(el.childNodes)
    const children = fixNodesForBlockChildren(deserialized)

    if (nodeName === 'LI') {
      return deserializeListItem(children)
    }

    if (nodeName === 'P') {
      return deserializeParagraph(el, children)
    }

    const headingLevel = headings[nodeName]
    if (typeof headingLevel === 'number') {
      return deserializeHeading(el, headingLevel, children)
    }

    if (isBlockquote(nodeName)) {
      return deserializeBlockquote(children)
    }

    if (isOrderedList(nodeName)) {
      return deserializeOrderedList(children)
    }

    if (isUnorderedList(nodeName)) {
      return deserializeUnorderedList(children)
    }

    if (isDivWithoutBlockChildren(nodeName, children)) {
      return deserializeDiv(children)
    }

    return deserialized
  })
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

  if (!deserializedNodes.some(isBlock)) {
    return deserializedNodes as DeserializedNodes
  }

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
```