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

function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  const alignment = parent?.dataset?.align
  if (alignment === 'center' || alignment === 'end') {
    return alignment
  }
  if (element instanceof HTMLElement) {
    const textAlign = element.style.textAlign
    if (textAlign === 'center') {
      return 'center'
    }
    if (textAlign === 'right' || textAlign === 'end') {
      return 'end'
    }
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

function isConfluenceAlignment(element: globalThis.Element): boolean {
  const parent = element.parentElement
  const alignment = parent?.dataset?.align
  return alignment === 'center' || alignment === 'end'
}

function isGoogleDocsAlignment(element: globalThis.HTMLElement): 'center' | 'end' | undefined {
  const textAlign = element.style.textAlign
  if (textAlign === 'center') {
    return 'center'
  }
  if (textAlign === 'right' || textAlign === 'end') {
    return 'end'
  }
  return undefined
}

function isConfluenceCodeSpan(element: globalThis.HTMLElement): boolean {
  return element.nodeName === 'SPAN' && element.classList.contains('code')
}

function isGoogleDocsBold(element: globalThis.HTMLElement): boolean {
  const { nodeName, style } = element
  const fontWeight = style.fontWeight
  if (nodeName === 'B' && fontWeight !== 'normal') {
    return true
  }
  if (typeof fontWeight === 'string' && (fontWeight === 'bold' || fontWeight === 'bolder' || fontWeight === '1000')) {
    return true
  }
  if (typeof fontWeight === 'string' && /^[5-9]\d{2}$/.test(fontWeight)) {
    return true
  }
  return false
}

function isGoogleDocsItalic(element: globalThis.HTMLElement): boolean {
  return element.style.fontStyle === 'italic'
}

function isGoogleDocsSubscript(element: globalThis.HTMLElement): boolean {
  return element.style.verticalAlign === 'sub'
}

function isGoogleDocsSuperscript(element: globalThis.HTMLElement): boolean {
  return element.style.verticalAlign === 'super'
}

function isGoogleDocsUnderline(element: globalThis.HTMLElement): boolean {
  return element.style.textDecoration === 'underline'
}

function isGoogleDocsStrikethrough(element: globalThis.HTMLElement): boolean {
  return element.style.textDecoration === 'line-through'
}

function isGoogleDocsBlockquote(element: globalThis.HTMLElement): boolean {
  return element.classList.contains('listtype-quote')
}

function isGoogleDocsLink(element: globalThis.HTMLElement): boolean {
  return element.nodeName === 'A'
}

function isGoogleDocsPre(element: globalThis.HTMLElement): boolean {
  return element.nodeName === 'PRE' && element.textContent
}

function isGoogleDocsListItem(element: globalThis.HTMLElement): boolean {
  return element.nodeName === 'LI'
}

function isGoogleDocsParagraph(element: globalThis.HTMLElement): boolean {
  return element.nodeName === 'P'
}

function isGoogleDocsHeading(element: globalThis.HTMLElement): boolean {
  const headingLevel = headings[element.nodeName]
  return typeof headingLevel === 'number'
}

function isGoogleDocsBlockquoteElement(element: globalThis.HTMLElement): boolean {
  return element.nodeName === 'BLOCKQUOTE'
}

function isGoogleDocsOrderedList(element: globalThis.HTMLElement): boolean {
  return element.nodeName === 'OL'
}

function isGoogleDocsUnorderedList(element: globalThis.HTMLElement): boolean {
  return element.nodeName === 'UL'
}

function isGoogleDocsDivWithInlineChildren(element: globalThis.HTMLElement): boolean {
  return element.nodeName === 'DIV' && !isBlock(element.childNodes[0])
}

function isGoogleDocsImage(element: globalThis.HTMLElement): boolean {
  return element.nodeName === 'IMG'
}

function isGoogleDocsHorizontalRule(element: globalThis.HTMLElement): boolean {
  return element.nodeName === 'HR'
}

function isGoogleDocsBreak(element: globalThis.HTMLElement): boolean {
  return element.nodeName === 'BR'
}

function isGoogleDocsTextElement(element: globalThis.Node): boolean {
  return !(element instanceof globalThis.HTMLElement)
}

function isGoogleDocsEmptyText(element: globalThis.Node): boolean {
  const text = element.textContent
  return !text
}

export function deserializeHTML(html: string): DeserializedNode[] {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

type DeserializedNode = InlineFromExternalPaste | Block

type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]

export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (isGoogleDocsTextElement(el)) {
    if (isGoogleDocsEmptyText(el)) {
      return []
    }
    return getInlineNodes(el.textContent)
  }
  if (isGoogleDocsBreak(el)) {
    return getInlineNodes('\n')
  }
  if (isGoogleDocsImage(el)) {
    const alt = el.dataset.alt
    return getInlineNodes(alt ?? '')
  }
  if (isGoogleDocsHorizontalRule(el)) {
    return [{ type: 'divider', children: [{ text: '' }] }]
  }

  const marks = marksFromElementAttributes(el)

  if (isGoogleDocsBlockquote(el)) {
    marks.delete('italic')
    return addMarksToChildren(marks, () => [
      { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
    ])
  }

  return addMarksToChildren(marks, (): DeserializedNode[] => {
    if (isGoogleDocsLink(el)) {
      const href = el.dataset.href
      if (href) {
        return setLinkForChildren(href, () =>
          forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
        )
      }
    }

    if (isGoogleDocsPre(el)) {
      return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
    }

    const deserialized = deserializeNodes(el.childNodes)
    const children = fixNodesForBlockChildren(deserialized)

    if (isGoogleDocsListItem(el)) {
      let nestedList: Block | undefined

      const listItemContent = {
        type: 'list-item-content' as const,
        children: children.filter(node => {
          if (nestedList === undefined && (node.type === 'ordered-list' || node.type === 'unordered-list')) {
            nestedList = node
            return false
          }
          return true
        }),
      }
      const listItemChildren = nestedList ? [listItemContent, nestedList] : [listItemContent]
      return [{ type: 'list-item', children: listItemChildren }]
    }

    if (isGoogleDocsParagraph(el)) {
      return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
    }

    if (isGoogleDocsHeading(el)) {
      return [
        { type: 'heading', level: headings[el.nodeName], textAlign: getAlignmentFromElement(el), children },
      ]
    }

    if (isGoogleDocsBlockquoteElement(el)) {
      return [{ type: 'blockquote', children }]
    }
    if (isGoogleDocsOrderedList(el)) {
      return [{ type: 'ordered-list', children }]
    }
    if (isGoogleDocsUnorderedList(el)) {
      return [{ type: 'unordered-list', children }]
    }
    if (isGoogleDocsDivWithInlineChildren(el)) {
      return [{ type: 'paragraph', children }]
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

function marksFromElementAttributes(element: globalThis.HTMLElement): Set<Mark> {
  const marks = new Set<Mark>()
  const style = element.style
  const { nodeName } = element
  const markFromNodeName = TEXT_TAGS[nodeName]
  if (markFromNodeName) {
    marks.add(markFromNodeName)
  }
  const { fontWeight, textDecoration, verticalAlign } = style

  if (isGoogleDocsUnderline(element)) {
    marks.add('underline')
  }
  if (isGoogleDocsStrikethrough(element)) {
    marks.add('strikethrough')
  }
  if (isConfluenceCodeSpan(element)) {
    marks.add('code')
  }
  if (isGoogleDocsBold(element)) {
    marks.add('bold')
  }
  if (isGoogleDocsItalic(element)) {
    marks.add('italic')
  }
  if (isGoogleDocsSuperscript(element)) {
    marks.add('superscript')
  }
  if (isGoogleDocsSubscript(element)) {
    marks.add('subscript')
  }
  return marks
}
```