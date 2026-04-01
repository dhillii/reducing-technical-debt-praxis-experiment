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

/** Check if parent element has confluence alignment data attribute */
function hasConfluenceAlignment(parent: Element | null): parent is Element {
  return parent !== null && parent !== undefined
}

/** Extract alignment value from confluence data attribute */
function getConfluenceAlignment(parent: Element): 'center' | 'end' | undefined {
  const attribute = parent.dataset.align
  if (attribute === 'center' || attribute === 'end') {
    return attribute
  }
  return undefined
}

/** Extract alignment from Google Docs text-align style */
function getGoogleDocsAlignment(textAlign: string): 'center' | 'end' | undefined {
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

  if (!(element instanceof HTMLElement)) {
    return undefined
  }

  const textAlign = element.style.textAlign
  return getGoogleDocsAlignment(textAlign)
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

/** Add mark from node name if applicable */
function addMarkFromNodeName(marks: Set<Mark>, nodeName: string): void {
  const markFromNodeName = TEXT_TAGS[nodeName]
  if (markFromNodeName) {
    marks.add(markFromNodeName)
  }
}

/** Add marks from text decoration style */
function addMarksFromTextDecoration(marks: Set<Mark>, textDecoration: string): void {
  if (textDecoration === 'underline') {
    marks.add('underline')
  } else if (textDecoration === 'line-through') {
    marks.add('strikethrough')
  }
}

/** Check if element is confluence code span */
function isConfluenceCodeSpan(nodeName: string, classList: DOMTokenList): boolean {
  return nodeName === 'SPAN' && classList.contains('code')
}

/** Check if font weight indicates bold */
function isBoldFontWeight(fontWeight: string): boolean {
  if (fontWeight === 'bold' || fontWeight === 'bolder' || fontWeight === '1000') {
    return true
  }
  return /^[5-9]\d{2}$/.test(fontWeight)
}

/** Add marks from font weight style */
function addMarksFromFontWeight(marks: Set<Mark>, nodeName: string, fontWeight: string): void {
  if (nodeName === 'B' && fontWeight !== 'normal') {
    marks.add('bold')
    return
  }
  
  if (typeof fontWeight === 'string' && isBoldFontWeight(fontWeight)) {
    marks.add('bold')
  }
}

/** Add marks from vertical align style */
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

/** Check if node is non-empty text node */
function isNonEmptyTextNode(el: globalThis.Node): boolean {
  if (el instanceof globalThis.HTMLElement) {
    return false
  }
  const text = el.textContent
  return text !== null && text !== undefined && text.length > 0
}

/** Check if element is image node */
function isImageElement(nodeName: string): boolean {
  return nodeName === 'IMG'
}

/** Check if element is horizontal rule */
function isHorizontalRule(nodeName: string): boolean {
  return nodeName === 'HR'
}

/** Check if element is line break */
function isLineBreak(nodeName: string): boolean {
  return nodeName === 'BR'
}

/** Check if element is dropbox paper blockquote */
function isDropboxPaperBlockquote(el: globalThis.HTMLElement): boolean {
  return el.classList.contains('listtype-quote')
}

/** Check if element is anchor tag with href */
function isAnchorWithHref(nodeName: string, el: globalThis.HTMLElement): boolean {
  if (nodeName !== 'A') {
    return false
  }
  const href = el.dataset.href || el.getAttribute('href')
  return href !== null && href !== undefined && href.length > 0
}

/** Check if element is preformatted code block */
function isPreformattedCode(nodeName: string, textContent: string | null): boolean {
  return nodeName === 'PRE' && textContent !== null && textContent !== undefined && textContent.length > 0
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
function isDivWithoutBlockChildren(nodeName: string, children: DeserializedNode[]): boolean {
  return nodeName === 'DIV' && !isBlock(children[0])
}

export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (isNonEmptyTextNode(el)) {
    const text = el.textContent!
    return getInlineNodes(text)
  }

  if (!(el instanceof globalThis.HTMLElement)) {
    return []
  }

  const { nodeName } = el

  if (isLineBreak(nodeName)) {
    return getInlineNodes('\n')
  }

  if (isImageElement(nodeName)) {
    const alt = el.dataset.alt || el.getAttribute('alt')
    return getInlineNodes(alt ?? '')
  }

  if (isHorizontalRule(nodeName)) {
    return [{ type: 'divider', children: [{ text: '' }] }]
  }

  const marks = marksFromElementAttributes(el)

  if (isDropboxPaperBlockquote(el)) {
    marks.delete('italic')
    return addMarksToChildren(marks, () => [
      { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
    ])
  }

  return addMarksToChildren(marks, (): DeserializedNode[] => {
    if (isAnchorWithHref(nodeName, el)) {
      const href = el.dataset.href || el.getAttribute('href')!
      return setLinkForChildren(href, () =>
        forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
      )
    }

    if (isPreformattedCode(nodeName, el.textContent)) {
      return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
    }

    const deserialized = deserializeNodes(el.childNodes)
    const children = fixNodesForBlockChildren(deserialized)

    if (isListItem(nodeName)) {
      return deserializeListItem(children)
    }

    if (isParagraph(nodeName)) {
      return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
    }

    const headingLevel = headings[nodeName]
    if (typeof headingLevel === 'number') {
      return [
        { type: 'heading', level: headingLevel, textAlign: getAlignmentFromElement(el), children },
      ]
    }

    if (isBlockquote(nodeName)) {
      return [{ type: 'blockquote', children }]
    }

    if (isOrderedList(nodeName)) {
      return [{ type: 'ordered-list', children }]
    }

    if (isUnorderedList(nodeName)) {
      return [{ type: 'unordered-list', children }]
    }

    if (isDivWithoutBlockChildren(nodeName, children)) {
      return [{ type: 'paragraph', children }]
    }

    return deserialized
  })
}

/** Deserialize list item element */
function deserializeListItem(children: DeserializedNodes): DeserializedNode[] {
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

function deserializeNodes(nodes: Iterable<globalThis.Node>): DeserializedNode[] {
  const outputNodes: (InlineFromExternalPaste | Block)[] = []
  for (const node of nodes) {
    outputNodes.push(...deserializeHTMLNode(node))
  }
  return outputNodes
}

/** Check if deserialized nodes contain any block elements */
function containsBlockElements(deserializedNodes: DeserializedNode[]): boolean {
  return deserializedNodes.some(isBlock)
}

/** Check if node string content is non-empty after trimming */
function hasNonEmptyContent(node: DeserializedNode): boolean {
  return Node.string(node).trim() !== ''
}

function fixNodesForBlockChildren(deserializedNodes: DeserializedNode[]): DeserializedNodes {
  if (!deserializedNodes.length) {
    return [{ text: '' }]
  }

  if (!containsBlockElements(deserializedNodes)) {
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

    if (hasNonEmptyContent(node)) {
      queuedInlines.push(node)
    }
  }

  flushInlines()
  return result as DeserializedNodes
}
```