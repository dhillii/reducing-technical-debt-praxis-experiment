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

/** Extracts alignment from confluence data-align attribute on parent element */
function getAlignmentFromConfluence(parent: Element | null): 'center' | 'end' | undefined {
  if (!parent) return undefined
  const align = parent.dataset.align
  return align === 'center' || align === 'end' ? align : undefined
}

/** Extracts alignment from element's inline text-align style */
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
  const confluenceAlign = getAlignmentFromConfluence(parent)
  if (confluenceAlign) {
    return confluenceAlign
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

/** Extracts mark from element's node name */
function getMarkFromNodeName(nodeName: string): Mark | undefined {
  return TEXT_TAGS[nodeName]
}

/** Extracts marks from text decoration style */
function getMarksFromTextDecoration(textDecoration: string): Mark[] {
  const marks: Mark[] = []
  if (textDecoration === 'underline') {
    marks.push('underline')
  } else if (textDecoration === 'line-through') {
    marks.push('strikethrough')
  }
  return marks
}

/** Extracts marks from font weight style */
function getMarksFromFontWeight(nodeName: string, fontWeight: string): Mark[] {
  const marks: Mark[] = []
  if (nodeName === 'B' && fontWeight !== 'normal') {
    marks.push('bold')
  } else if (
    fontWeight === 'bold' ||
    fontWeight === 'bolder' ||
    fontWeight === '1000' ||
    /^[5-9]\d{2}$/.test(fontWeight)
  ) {
    marks.push('bold')
  }
  return marks
}

/** Extracts marks from vertical align style */
function getMarksFromVerticalAlign(verticalAlign: string): Mark[] {
  const marks: Mark[] = []
  if (verticalAlign === 'super') {
    marks.push('superscript')
  } else if (verticalAlign === 'sub') {
    marks.push('subscript')
  }
  return marks
}

function marksFromElementAttributes(element: globalThis.HTMLElement) {
  const marks = new Set<Mark>()
  const style = element.style
  const { nodeName } = element

  const markFromNodeName = getMarkFromNodeName(nodeName)
  if (markFromNodeName) {
    marks.add(markFromNodeName)
  }

  const { fontWeight, textDecoration, verticalAlign } = style

  getMarksFromTextDecoration(textDecoration).forEach(mark => marks.add(mark))

  // confluence
  if (nodeName === 'SPAN' && element.classList.contains('code')) {
    marks.add('code')
  }

  // Google Docs does weird things with <b>
  if (typeof fontWeight === 'string') {
    getMarksFromFontWeight(nodeName, fontWeight).forEach(mark => marks.add(mark))
  }

  if (style.fontStyle === 'italic') {
    marks.add('italic')
  }

  // Google Docs uses vertical align for subscript and superscript instead of <sup> and <sub>
  getMarksFromVerticalAlign(verticalAlign).forEach(mark => marks.add(mark))

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
function deserializeBRNode(): DeserializedNode[] {
  return getInlineNodes('\n')
}

/** Handles IMG elements */
function deserializeIMGNode(el: globalThis.HTMLElement): DeserializedNode[] {
  const alt = el.dataset.alt ?? el.getAttribute('alt') ?? ''
  return getInlineNodes(alt)
}

/** Handles HR elements */
function deserializeHRNode(): DeserializedNode[] {
  return [{ type: 'divider', children: [{ text: '' }] }]
}

/** Handles Dropbox Paper blockquotes displayed as lists */
function deserializeDropboxQuote(el: globalThis.HTMLElement, marks: Set<Mark>): DeserializedNode[] {
  marks.delete('italic')
  return addMarksToChildren(marks, () => [
    { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
  ])
}

/** Handles anchor elements */
function deserializeAnchorNode(el: globalThis.HTMLElement): DeserializedNode[] {
  const href = el.dataset.href ?? el.getAttribute('href')
  if (href) {
    return setLinkForChildren(href, () =>
      forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
    )
  }
  return deserializeNodes(el.childNodes)
}

/** Handles pre/code elements */
function deserializePreNode(el: globalThis.HTMLElement): DeserializedNode[] {
  if (el.textContent) {
    return [{ type: 'code', children: [{ text: el.textContent }] }]
  }
  return deserializeNodes(el.childNodes)
}

/** Handles list item elements */
function deserializeListItemNode(children: DeserializedNode[]): DeserializedNode[] {
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
function deserializeParagraphNode(
  el: globalThis.HTMLElement,
  children: DeserializedNode[]
): DeserializedNode[] {
  return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
}

/** Handles heading elements */
function deserializeHeadingNode(
  el: globalThis.HTMLElement,
  level: number,
  children: DeserializedNode[]
): DeserializedNode[] {
  return [
    { type: 'heading', level, textAlign: getAlignmentFromElement(el), children },
  ]
}

/** Handles blockquote elements */
function deserializeBlockquoteNode(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'blockquote', children }]
}

/** Handles ordered list elements */
function deserializeOrderedListNode(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'ordered-list', children }]
}

/** Handles unordered list elements */
function deserializeUnorderedListNode(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'unordered-list', children }]
}

/** Handles div elements without block children */
function deserializeDivNode(children: DeserializedNode[]): DeserializedNode[] {
  if (!isBlock(children[0])) {
    return [{ type: 'paragraph', children }]
  }
  return children
}

export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!(el instanceof globalThis.HTMLElement)) {
    return deserializeTextNode(el)
  }

  const { nodeName } = el

  if (nodeName === 'BR') {
    return deserializeBRNode()
  }

  if (nodeName === 'IMG') {
    return deserializeIMGNode(el)
  }

  if (nodeName === 'HR') {
    return deserializeHRNode()
  }

  const marks = marksFromElementAttributes(el)

  // Dropbox Paper displays blockquotes as lists for some reason
  if (el.classList.contains('listtype-quote')) {
    return deserializeDropboxQuote(el, marks)
  }

  return addMarksToChildren(marks, (): DeserializedNode[] => {
    if (nodeName === 'A') {
      return deserializeAnchorNode(el)
    }

    if (nodeName === 'PRE') {
      return deserializePreNode(el)
    }

    const deserialized = deserializeNodes(el.childNodes)
    const children = fixNodesForBlockChildren(deserialized)

    if (nodeName === 'LI') {
      return deserializeListItemNode(children)
    }

    if (nodeName === 'P') {
      return deserializeParagraphNode(el, children)
    }

    const headingLevel = headings[nodeName]

    if (typeof headingLevel === 'number') {
      return deserializeHeadingNode(el, headingLevel, children)
    }

    if (nodeName === 'BLOCKQUOTE') {
      return deserializeBlockquoteNode(children)
    }

    if (nodeName === 'OL') {
      return deserializeOrderedListNode(children)
    }

    if (nodeName === 'UL') {
      return deserializeUnorderedListNode(children)
    }

    if (nodeName === 'DIV') {
      return deserializeDivNode(children)
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

/** Flushes queued inline nodes into a paragraph block */
function flushInlinesToParagraph(
  queuedInlines: InlineFromExternalPaste[],
  result: DeserializedNode[]
): void {
  if (queuedInlines.length) {
    result.push({ type: 'paragraph', children: queuedInlines })
  }
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

    for (const node of deserializedNodes) {
      if (isBlock(node)) {
        flushInlinesToParagraph(queuedInlines, result)
        queuedInlines = []
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

    flushInlinesToParagraph(queuedInlines, result)
    return result as DeserializedNodes
  }

  return deserializedNodes as DeserializedNodes
}
```