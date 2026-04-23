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

  if (!parent) {
    return undefined
  }

  const attribute = parent.dataset.align

  if (attribute === 'center' || attribute === 'end') {
    return attribute
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

function marksFromElementAttributes(element: globalThis.HTMLElement): Set<Mark> {
  const marks = new Set<Mark>()
  const style = element.style
  const { nodeName } = element
  const markFromNodeName = TEXT_TAGS[nodeName]

  if (markFromNodeName) {
    marks.add(markFromNodeName)
  }

  const { fontWeight, textDecoration, verticalAlign } = style

  if (textDecoration === 'underline') {
    marks.add('underline')
  } else if (textDecoration === 'line-through') {
    marks.add('strikethrough')
  }

  if (nodeName === 'SPAN' && element.classList.contains('code')) {
    marks.add('code')
  }

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

  if (style.fontStyle === 'italic') {
    marks.add('italic')
  }

  if (verticalAlign === 'super') {
    marks.add('superscript')
  } else if (verticalAlign === 'sub') {
    marks.add('subscript')
  }

  return marks
}

function isAlignmentAttribute(value: string | undefined): value is 'center' | 'end' {
  return value === 'center' || value === 'end'
}

function isHeadingLevel(level: number | undefined): level is number {
  return typeof level === 'number'
}

function isBlockquoteListType(className: string): boolean {
  return className === 'listtype-quote'
}

function isCodeBlock(nodeName: string): boolean {
  return nodeName === 'PRE'
}

function isLinkElement(nodeName: string): boolean {
  return nodeName === 'A'
}

function isListElement(nodeName: string): boolean {
  return nodeName === 'OL' || nodeName === 'UL'
}

function isListItemElement(nodeName: string): boolean {
  return nodeName === 'LI'
}

function isParagraphElement(nodeName: string): boolean {
  return nodeName === 'P'
}

function isHeadingElement(nodeName: string): boolean {
  return nodeName.startsWith('H')
}

function isBlockquoteElement(nodeName: string): boolean {
  return nodeName === 'BLOCKQUOTE'
}

function isDivElement(nodeName: string): boolean {
  return nodeName === 'DIV'
}

function isImageElement(nodeName: string): boolean {
  return nodeName === 'IMG'
}

function isHorizontalRuleElement(nodeName: string): boolean {
  return nodeName === 'HR'
}

function isBreakElement(nodeName: string): boolean {
  return nodeName === 'BR'
}

function isTextElement(node: globalThis.Node): boolean {
  return !(node instanceof globalThis.HTMLElement)
}

function hasAltAttribute(element: globalThis.HTMLElement): boolean {
  return element.hasAttribute('alt')
}

function hasHrefAttribute(element: globalThis.HTMLElement): boolean {
  return element.hasAttribute('href')
}

function hasTextContent(element: globalThis.HTMLElement): boolean {
  return element.textContent !== undefined && element.textContent !== null
}

function hasNonEmptyTextContent(element: globalThis.HTMLElement): boolean {
  return element.textContent?.trim() !== ''
}

function hasNonEmptyTextNodes(nodes: Iterable<globalThis.Node>): boolean {
  for (const node of nodes) {
    if (Node.string(node).trim() !== '') {
      return true
    }
  }
  return false
}

function hasBlockChildren(nodes: DeserializedNode[]): boolean {
  return nodes.some(isBlock)
}

function hasNoChildren(nodes: DeserializedNode[]): boolean {
  return !nodes.length
}

export function deserializeHTML(html: string): DeserializedNode[] {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

type DeserializedNode = InlineFromExternalPaste | Block

type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]

export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (isTextElement(el)) {
    const text = el.textContent
    if (!text) {
      return []
    }
    return getInlineNodes(text)
  }

  if (isBreakElement(el.nodeName)) {
    return getInlineNodes('\n')
  }

  if (isImageElement(el.nodeName)) {
    const alt = el.getAttribute('alt')
    return getInlineNodes(alt ?? '')
  }

  if (isHorizontalRuleElement(el.nodeName)) {
    return [{ type: 'divider', children: [{ text: '' }] }]
  }

  const marks = marksFromElementAttributes(el)

  if (isBlockquoteListType(el.classList.contains('listtype-quote'))) {
    marks.delete('italic')
    return addMarksToChildren(marks, () => [
      { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
    ])
  }

  return addMarksToChildren(marks, (): DeserializedNode[] => {
    const { nodeName } = el

    if (isLinkElement(nodeName)) {
      const href = el.getAttribute('href')
      if (href) {
        return setLinkForChildren(href, () =>
          forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
        )
      }
    }

    if (isCodeBlock(nodeName) && hasTextContent(el)) {
      return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
    }

    const deserialized = deserializeNodes(el.childNodes)
    const children = fixNodesForBlockChildren(deserialized)

    if (isListItemElement(nodeName)) {
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

    if (isParagraphElement(nodeName)) {
      return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
    }

    const headingLevel = headings[nodeName]

    if (isHeadingLevel(headingLevel)) {
      return [
        { type: 'heading', level: headingLevel, textAlign: getAlignmentFromElement(el), children },
      ]
    }

    if (isBlockquoteElement(nodeName)) {
      return [{ type: 'blockquote', children }]
    }
    if (isListElement(nodeName)) {
      return [{ type: nodeName === 'OL' ? 'ordered-list' : 'unordered-list', children }]
    }
    if (isDivElement(nodeName) && !isBlock(children[0])) {
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
  if (hasNoChildren(deserializedNodes)) {
    return [{ text: '' }]
  }

  if (hasBlockChildren(deserializedNodes)) {
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

      if (hasNonEmptyTextNodes([node])) {
        queuedInlines.push(node)
      }
    }

    flushInlines()
    return result as DeserializedNodes
  }

  return deserializedNodes as DeserializedNodes
}