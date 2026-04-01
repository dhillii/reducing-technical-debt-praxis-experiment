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

  if (nodeName === 'SPAN' && element.classList.contains('code')) {
    marks.add('code')
  }

  if (typeof fontWeight === 'string') {
    getMarksFromFontWeight(nodeName, fontWeight).forEach(mark => marks.add(mark))
  }

  if (style.fontStyle === 'italic') {
    marks.add('italic')
  }

  getMarksFromVerticalAlign(verticalAlign).forEach(mark => marks.add(mark))

  return marks
}

export function deserializeHTML(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

type DeserializedNode = InlineFromExternalPaste | Block

type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]

/** Handles deserialization of text nodes */
function deserializeTextNode(el: globalThis.Node): DeserializedNode[] {
  const text = el.textContent
  if (!text) {
    return []
  }
  return getInlineNodes(text)
}

/** Handles deserialization of image elements */
function deserializeImageNode(el: HTMLElement): DeserializedNode[] {
  const alt = el.dataset.alt ?? el.getAttribute('alt') ?? ''
  return getInlineNodes(alt)
}

/** Handles deserialization of link elements */
function deserializeLinkNode(el: HTMLElement): DeserializedNode[] {
  const href = el.dataset.href ?? el.getAttribute('href')
  if (href) {
    return setLinkForChildren(href, () =>
      forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
    )
  }
  return deserializeNodes(el.childNodes)
}

/** Handles deserialization of code block elements */
function deserializeCodeBlockNode(el: HTMLElement): DeserializedNode[] {
  if (el.textContent) {
    return [{ type: 'code', children: [{ text: el.textContent }] }]
  }
  return deserializeNodes(el.childNodes)
}

/** Handles deserialization of list item elements */
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

/** Handles deserialization of paragraph elements */
function deserializeParagraphNode(el: HTMLElement, children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
}

/** Handles deserialization of heading elements */
function deserializeHeadingNode(
  nodeName: string,
  el: HTMLElement,
  children: DeserializedNode[]
): DeserializedNode[] {
  const headingLevel = headings[nodeName]
  if (typeof headingLevel === 'number') {
    return [
      { type: 'heading', level: headingLevel, textAlign: getAlignmentFromElement(el), children },
    ]
  }
  return []
}

/** Handles deserialization of blockquote elements */
function deserializeBlockquoteNode(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'blockquote', children }]
}

/** Handles deserialization of ordered list elements */
function deserializeOrderedListNode(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'ordered-list', children }]
}

/** Handles deserialization of unordered list elements */
function deserializeUnorderedListNode(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'unordered-list', children }]
}

/** Handles deserialization of div elements */
function deserializeDivNode(children: DeserializedNode[], deserialized: DeserializedNode[]): DeserializedNode[] {
  if (!isBlock(children[0])) {
    return [{ type: 'paragraph', children }]
  }
  return deserialized
}

/** Handles deserialization of dropbox paper blockquotes */
function deserializeDropboxBlockquoteNode(el: HTMLElement, marks: Set<Mark>): DeserializedNode[] {
  marks.delete('italic')
  return addMarksToChildren(marks, () => [
    { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
  ])
}

export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!(el instanceof globalThis.HTMLElement)) {
    return deserializeTextNode(el)
  }

  if (el.nodeName === 'BR') {
    return getInlineNodes('\n')
  }

  if (el.nodeName === 'IMG') {
    return deserializeImageNode(el)
  }

  if (el.nodeName === 'HR') {
    return [{ type: 'divider', children: [{ text: '' }] }]
  }

  const marks = marksFromElementAttributes(el)

  if (el.classList.contains('listtype-quote')) {
    return deserializeDropboxBlockquoteNode(el, marks)
  }

  return addMarksToChildren(marks, (): DeserializedNode[] => {
    const { nodeName } = el

    if (nodeName === 'A') {
      return deserializeLinkNode(el)
    }

    if (nodeName === 'PRE') {
      return deserializeCodeBlockNode(el)
    }

    const deserialized = deserializeNodes(el.childNodes)
    const children = fixNodesForBlockChildren(deserialized)

    if (nodeName === 'LI') {
      return deserializeListItemNode(children)
    }

    if (nodeName === 'P') {
      return deserializeParagraphNode(el, children)
    }

    const headingResult = deserializeHeadingNode(nodeName, el, children)
    if (headingResult.length > 0) {
      return headingResult
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
      return deserializeDivNode(children, deserialized)
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