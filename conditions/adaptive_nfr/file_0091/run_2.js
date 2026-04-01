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

/** Check if parent has confluence alignment data attribute */
function hasConfluenceAlignment(parent: Element | null): parent is Element {
  return parent !== null && (parent.dataset.align === 'center' || parent.dataset.align === 'end')
}

/** Get alignment value from confluence data attribute */
function getConfluenceAlignment(parent: Element): 'center' | 'end' | undefined {
  const align = parent.dataset.align
  return align === 'center' || align === 'end' ? align : undefined
}

/** Check if text alignment is center */
function isTextAlignCenter(textAlign: string): boolean {
  return textAlign === 'center'
}

/** Check if text alignment is end/right */
function isTextAlignEnd(textAlign: string): boolean {
  return textAlign === 'right' || textAlign === 'end'
}

/** Get alignment from Google Docs style attribute */
function getGoogleDocsAlignment(element: HTMLElement): 'center' | 'end' | undefined {
  const textAlign = element.style.textAlign
  if (isTextAlignCenter(textAlign)) {
    return 'center'
  }
  if (isTextAlignEnd(textAlign)) {
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

/** Check if font weight indicates bold */
function isBoldFontWeight(fontWeight: string): boolean {
  return (
    fontWeight === 'bold' ||
    fontWeight === 'bolder' ||
    fontWeight === '1000' ||
    /^[5-9]\d{2}$/.test(fontWeight)
  )
}

/** Add text decoration marks */
function addTextDecorationMarks(marks: Set<Mark>, textDecoration: string): void {
  if (textDecoration === 'underline') {
    marks.add('underline')
  } else if (textDecoration === 'line-through') {
    marks.add('strikethrough')
  }
}

/** Add vertical alignment marks */
function addVerticalAlignMarks(marks: Set<Mark>, verticalAlign: string): void {
  if (verticalAlign === 'super') {
    marks.add('superscript')
  } else if (verticalAlign === 'sub') {
    marks.add('subscript')
  }
}

/** Add font weight marks */
function addFontWeightMarks(marks: Set<Mark>, nodeName: string, fontWeight: string): void {
  if (nodeName === 'B' && fontWeight !== 'normal') {
    marks.add('bold')
    return
  }
  if (typeof fontWeight === 'string' && isBoldFontWeight(fontWeight)) {
    marks.add('bold')
  }
}

function marksFromElementAttributes(element: globalThis.HTMLElement) {
  const marks = new Set<Mark>()
  const style = element.style
  const { nodeName } = element
  const markFromNodeName = TEXT_TAGS[nodeName]
  
  if (markFromNodeName) {
    marks.add(markFromNodeName)
  }

  const { fontWeight, textDecoration, verticalAlign } = style

  addTextDecorationMarks(marks, textDecoration)

  if (nodeName === 'SPAN' && element.classList.contains('code')) {
    marks.add('code')
  }

  addFontWeightMarks(marks, nodeName, fontWeight)

  if (style.fontStyle === 'italic') {
    marks.add('italic')
  }

  addVerticalAlignMarks(marks, verticalAlign)

  return marks
}

export function deserializeHTML(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

type DeserializedNode = InlineFromExternalPaste | Block

type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]

/** Check if element is non-HTML node */
function isNonHTMLNode(el: globalThis.Node): el is globalThis.Node {
  return !(el instanceof globalThis.HTMLElement)
}

/** Check if element is BR tag */
function isBRTag(nodeName: string): boolean {
  return nodeName === 'BR'
}

/** Check if element is IMG tag */
function isIMGTag(nodeName: string): boolean {
  return nodeName === 'IMG'
}

/** Check if element is HR tag */
function isHRTag(nodeName: string): boolean {
  return nodeName === 'HR'
}

/** Check if element is Dropbox Paper blockquote */
function isDropboxPaperBlockquote(el: globalThis.HTMLElement): boolean {
  return el.classList.contains('listtype-quote')
}

/** Check if element is anchor tag with href */
function isAnchorWithHref(nodeName: string, href: string | null): boolean {
  return nodeName === 'A' && !!href
}

/** Check if element is PRE tag with content */
function isPreWithContent(nodeName: string, textContent: string | null): boolean {
  return nodeName === 'PRE' && !!textContent
}

/** Check if element is list item */
function isListItem(nodeName: string): boolean {
  return nodeName === 'LI'
}

/** Check if element is paragraph */
function isParagraph(nodeName: string): boolean {
  return nodeName === 'P'
}

/** Check if element is blockquote */
function isBlockquote(nodeName: string): boolean {
  return nodeName === 'BLOCKQUOTE'
}

/** Check if element is ordered list */
function isOrderedList(nodeName: string): boolean {
  return nodeName === 'OL'
}

/** Check if element is unordered list */
function isUnorderedList(nodeName: string): boolean {
  return nodeName === 'UL'
}

/** Check if element is div without block children */
function isDivWithoutBlocks(nodeName: string, firstChild: DeserializedNode | undefined): boolean {
  return nodeName === 'DIV' && !isBlock(firstChild)
}

/** Process non-HTML node */
function processNonHTMLNode(el: globalThis.Node): DeserializedNode[] {
  const text = el.textContent
  if (!text) {
    return []
  }
  return getInlineNodes(text)
}

/** Process BR tag */
function processBRTag(): DeserializedNode[] {
  return getInlineNodes('\n')
}

/** Process IMG tag */
function processIMGTag(el: globalThis.HTMLElement): DeserializedNode[] {
  const alt = el.dataset.alt ?? ''
  return getInlineNodes(alt)
}

/** Process HR tag */
function processHRTag(): DeserializedNode[] {
  return [{ type: 'divider', children: [{ text: '' }] }]
}

/** Process Dropbox Paper blockquote */
function processDropboxBlockquote(
  el: globalThis.HTMLElement,
  marks: Set<Mark>
): DeserializedNode[] {
  marks.delete('italic')
  return addMarksToChildren(marks, () => [
    { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
  ])
}

/** Process anchor tag */
function processAnchorTag(el: globalThis.HTMLElement, href: string): DeserializedNode[] {
  return setLinkForChildren(href, () =>
    forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
  )
}

/** Process PRE tag */
function processPreTag(el: globalThis.HTMLElement): DeserializedNode[] {
  return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
}

/** Process list item */
function processListItem(children: DeserializedNode[]): DeserializedNode[] {
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

/** Process paragraph */
function processParagraph(el: globalThis.HTMLElement, children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
}

/** Process heading */
function processHeading(
  el: globalThis.HTMLElement,
  level: number,
  children: DeserializedNode[]
): DeserializedNode[] {
  return [
    { type: 'heading', level, textAlign: getAlignmentFromElement(el), children },
  ]
}

/** Process blockquote */
function processBlockquote(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'blockquote', children }]
}

/** Process ordered list */
function processOrderedList(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'ordered-list', children }]
}

/** Process unordered list */
function processUnorderedList(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'unordered-list', children }]
}

/** Process div without blocks */
function processDivWithoutBlocks(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'paragraph', children }]
}

export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (isNonHTMLNode(el)) {
    return processNonHTMLNode(el)
  }

  if (isBRTag(el.nodeName)) {
    return processBRTag()
  }

  if (isIMGTag(el.nodeName)) {
    return processIMGTag(el as globalThis.HTMLElement)
  }

  if (isHRTag(el.nodeName)) {
    return processHRTag()
  }

  const htmlEl = el as globalThis.HTMLElement
  const marks = marksFromElementAttributes(htmlEl)

  if (isDropboxPaperBlockquote(htmlEl)) {
    return processDropboxBlockquote(htmlEl, marks)
  }

  return addMarksToChildren(marks, (): DeserializedNode[] => {
    const { nodeName } = htmlEl
    const href = htmlEl.dataset.href

    if (isAnchorWithHref(nodeName, href)) {
      return processAnchorTag(htmlEl, href)
    }

    if (isPreWithContent(nodeName, htmlEl.textContent)) {
      return processPreTag(htmlEl)
    }

    const deserialized = deserializeNodes(htmlEl.childNodes)
    const children = fixNodesForBlockChildren(deserialized)

    if (isListItem(nodeName)) {
      return processListItem(children)
    }

    if (isParagraph(nodeName)) {
      return processParagraph(htmlEl, children)
    }

    const headingLevel = headings[nodeName]
    if (typeof headingLevel === 'number') {
      return processHeading(htmlEl, headingLevel, children)
    }

    if (isBlockquote(nodeName)) {
      return processBlockquote(children)
    }

    if (isOrderedList(nodeName)) {
      return processOrderedList(children)
    }

    if (isUnorderedList(nodeName)) {
      return processUnorderedList(children)
    }

    if (isDivWithoutBlocks(nodeName, children[0])) {
      return processDivWithoutBlocks(children)
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