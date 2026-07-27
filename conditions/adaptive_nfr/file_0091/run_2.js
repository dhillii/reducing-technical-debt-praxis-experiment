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

/** @internal Check if parent has confluence alignment data attribute */
function hasConfluenceAlignment(parent: Element | null): parent is Element {
  return parent !== null && (parent.dataset.align === 'center' || parent.dataset.align === 'end')
}

/** @internal Get alignment value from confluence data attribute */
function getConfluenceAlignment(parent: Element): 'center' | 'end' {
  const align = parent.dataset.align
  return align === 'center' || align === 'end' ? (align as 'center' | 'end') : undefined as any
}

/** @internal Check if element has Google Docs center alignment */
function hasGoogleDocsCenterAlignment(element: HTMLElement): boolean {
  return element.style.textAlign === 'center'
}

/** @internal Check if element has Google Docs end alignment */
function hasGoogleDocsEndAlignment(element: HTMLElement): boolean {
  const textAlign = element.style.textAlign
  return textAlign === 'right' || textAlign === 'end'
}

function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  
  if (hasConfluenceAlignment(parent)) {
    return getConfluenceAlignment(parent)
  }
  
  if (!(element instanceof HTMLElement)) {
    return undefined
  }
  
  if (hasGoogleDocsCenterAlignment(element)) {
    return 'center'
  }
  
  if (hasGoogleDocsEndAlignment(element)) {
    return 'end'
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

/** @internal Check if font weight indicates bold */
function isBoldFontWeight(fontWeight: string): boolean {
  return fontWeight === 'bold' || fontWeight === 'bolder' || fontWeight === '1000' || /^[5-9]\d{2}$/.test(fontWeight)
}

/** @internal Check if element should have bold mark from font weight */
function shouldAddBoldFromFontWeight(nodeName: string, fontWeight: string): boolean {
  return typeof fontWeight === 'string' && isBoldFontWeight(fontWeight)
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
  } else if (shouldAddBoldFromFontWeight(nodeName, fontWeight)) {
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

export function deserializeHTML(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

type DeserializedNode = InlineFromExternalPaste | Block

type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]

/** @internal Check if node is text node without content */
function isEmptyTextNode(node: globalThis.Node): boolean {
  return !(node instanceof globalThis.HTMLElement) && !node.textContent
}

/** @internal Check if node is image element */
function isImageElement(nodeName: string): boolean {
  return nodeName === 'IMG'
}

/** @internal Check if node is horizontal rule */
function isHorizontalRule(nodeName: string): boolean {
  return nodeName === 'HR'
}

/** @internal Check if node is link element */
function isLinkElement(nodeName: string): boolean {
  return nodeName === 'A'
}

/** @internal Check if node is preformatted code block */
function isPreformattedCode(nodeName: string, textContent: string | null): boolean {
  return nodeName === 'PRE' && textContent
}

/** @internal Check if node is list item */
function isListItem(nodeName: string): boolean {
  return nodeName === 'LI'
}

/** @internal Check if node is paragraph */
function isParagraph(nodeName: string): boolean {
  return nodeName === 'P'
}

/** @internal Check if node is blockquote */
function isBlockquote(nodeName: string): boolean {
  return nodeName === 'BLOCKQUOTE'
}

/** @internal Check if node is ordered list */
function isOrderedList(nodeName: string): boolean {
  return nodeName === 'OL'
}

/** @internal Check if node is unordered list */
function isUnorderedList(nodeName: string): boolean {
  return nodeName === 'UL'
}

/** @internal Check if node is div without block children */
function isDivWithoutBlocks(nodeName: string, firstChild: DeserializedNode | undefined): boolean {
  return nodeName === 'DIV' && !isBlock(firstChild)
}

export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (isEmptyTextNode(el)) {
    return []
  }
  
  if (!(el instanceof globalThis.HTMLElement)) {
    const text = el.textContent
    return getInlineNodes(text || '')
  }
  
  if (el.nodeName === 'BR') {
    return getInlineNodes('\n')
  }

  if (isImageElement(el.nodeName)) {
    const alt = el.dataset.alt ?? ''
    return getInlineNodes(alt)
  }

  if (isHorizontalRule(el.nodeName)) {
    return [{ type: 'divider', children: [{ text: '' }] }]
  }

  const marks = marksFromElementAttributes(el)

  if (el.classList.contains('listtype-quote')) {
    marks.delete('italic')
    return addMarksToChildren(marks, () => [
      { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
    ])
  }

  return addMarksToChildren(marks, (): DeserializedNode[] => {
    const { nodeName } = el

    if (isLinkElement(nodeName)) {
      const href = el.dataset.href
      if (href) {
        return setLinkForChildren(href, () =>
          forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
        )
      }
    }

    if (isPreformattedCode(nodeName, el.textContent)) {
      return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
    }

    const deserialized = deserializeNodes(el.childNodes)
    const children = fixNodesForBlockChildren(deserialized)

    if (isListItem(nodeName)) {
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
    
    if (isDivWithoutBlocks(nodeName, children[0])) {
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