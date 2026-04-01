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

/** Extracts alignment from confluence data-align attribute */
function getAlignmentFromConfluence(parent: Element | null): 'center' | 'end' | undefined {
  const alignValue = parent?.dataset.align
  if (alignValue === 'center' || alignValue === 'end') {
    return alignValue
  }
  return undefined
}

/** Extracts alignment from element's text-align style property */
function getAlignmentFromStyle(element: HTMLElement): 'center' | 'end' | undefined {
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
  const confluenceAlignment = getAlignmentFromConfluence(parent)
  if (confluenceAlignment) {
    return confluenceAlignment
  }
  if (element instanceof HTMLElement) {
    return getAlignmentFromStyle(element)
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

/** Adds mark from element's node name if applicable */
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

/** Adds marks from font weight style */
function addMarksFromFontWeight(marks: Set<Mark>, nodeName: string, fontWeight: string): void {
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

  const { fontWeight, textDecoration, verticalAlign } = style

  addMarksFromTextDecoration(marks, textDecoration)

  // confluence
  if (nodeName === 'SPAN' && element.classList.contains('code')) {
    marks.add('code')
  }

  // Google Docs does weird things with <b>
  addMarksFromFontWeight(marks, nodeName, fontWeight)

  if (style.fontStyle === 'italic') {
    marks.add('italic')
  }

  // Google Docs uses vertical align for subscript and superscript instead of <sup> and <sub>
  addMarksFromVerticalAlign(marks, verticalAlign)

  return marks
}

export function deserializeHTML(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

type DeserializedNode = InlineFromExternalPaste | Block

type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]

/** Handles text nodes and returns inline nodes */
function deserializeTextNode(el: globalThis.Node): DeserializedNode[] {
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
function deserializeIMGElement(el: HTMLElement): DeserializedNode[] {
  const alt = el.dataset.alt ?? el.getAttribute('alt') ?? ''
  return getInlineNodes(alt)
}

/** Handles HR elements */
function deserializeHRElement(): DeserializedNode[] {
  return [{ type: 'divider', children: [{ text: '' }] }]
}

/** Handles Dropbox Paper blockquote lists */
function deserializeDropboxPaperQuote(el: HTMLElement, marks: Set<Mark>): DeserializedNode[] {
  marks.delete('italic')
  return addMarksToChildren(marks, () => [
    { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
  ])
}

/** Handles anchor elements */
function deserializeAnchorElement(el: HTMLElement): DeserializedNode[] | null {
  const href = el.dataset.href ?? el.getAttribute('href')
  if (href) {
    return setLinkForChildren(href, () =>
      forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
    )
  }
  return null
}

/** Handles pre/code elements */
function deserializePreElement(el: HTMLElement): DeserializedNode[] | null {
  if (el.textContent) {
    return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
  }
  return null
}

/** Handles list item elements */
function deserializeListItemElement(children: DeserializedNode[]): DeserializedNode[] {
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
function deserializeParagraphElement(el: HTMLElement, children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
}

/** Handles heading elements */
function deserializeHeadingElement(el: HTMLElement, level: number, children: DeserializedNode[]): DeserializedNode[] {
  return [
    { type: 'heading', level, textAlign: getAlignmentFromElement(el), children },
  ]
}

/** Handles blockquote elements */
function deserializeBlockquoteElement(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'blockquote', children }]
}

/** Handles ordered list elements */
function deserializeOrderedListElement(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'ordered-list', children }]
}

/** Handles unordered list elements */
function deserializeUnorderedListElement(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'unordered-list', children }]
}

/** Handles div elements that should be treated as paragraphs */
function deserializeDivElement(children: DeserializedNode[]): DeserializedNode[] | null {
  if (!isBlock(children[0])) {
    return [{ type: 'paragraph', children }]
  }
  return null
}

export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!(el instanceof globalThis.HTMLElement)) {
    return deserializeTextNode(el)
  }

  const { nodeName } = el

  if (nodeName === 'BR') {
    return deserializeBRElement()
  }

  if (nodeName === 'IMG') {
    return deserializeIMGElement(el)
  }

  if (nodeName === 'HR') {
    return deserializeHRElement()
  }

  const marks = marksFromElementAttributes(el)

  // Dropbox Paper displays blockquotes as lists for some reason
  if (el.classList.contains('listtype-quote')) {
    return deserializeDropboxPaperQuote(el, marks)
  }

  return addMarksToChildren(marks, (): DeserializedNode[] => {
    if (nodeName === 'A') {
      const anchorResult = deserializeAnchorElement(el)
      if (anchorResult) {
        return anchorResult
      }
    }

    if (nodeName === 'PRE') {
      const preResult = deserializePreElement(el)
      if (preResult) {
        return preResult
      }
    }

    const deserialized = deserializeNodes(el.childNodes)
    const children = fixNodesForBlockChildren(deserialized)

    if (nodeName === 'LI') {
      return deserializeListItemElement(children)
    }

    if (nodeName === 'P') {
      return deserializeParagraphElement(el, children)
    }

    const headingLevel = headings[nodeName]

    if (typeof headingLevel === 'number') {
      return deserializeHeadingElement(el, headingLevel, children)
    }

    if (nodeName === 'BLOCKQUOTE') {
      return deserializeBlockquoteElement(children)
    }

    if (nodeName === 'OL') {
      return deserializeOrderedListElement(children)
    }

    if (nodeName === 'UL') {
      return deserializeUnorderedListElement(children)
    }

    if (nodeName === 'DIV') {
      const divResult = deserializeDivElement(children)
      if (divResult) {
        return divResult
      }
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