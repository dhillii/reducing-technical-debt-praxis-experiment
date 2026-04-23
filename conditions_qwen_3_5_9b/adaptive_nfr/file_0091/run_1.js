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

function isBlockNode(node: DeserializedNode): node is Block {
  return isBlock(node)
}

function hasNonEmptyText(node: globalThis.Node): boolean {
  return Node.string(node).trim() !== ''
}

function isWhitespaceNode(node: globalThis.Node): boolean {
  return !hasNonEmptyText(node)
}

function isHeadingNode(nodeName: string): node is (Node & { type: 'heading' }) {
  return typeof headings[nodeName] === 'number'
}

function isParagraphNode(nodeName: string): boolean {
  return nodeName === 'P'
}

function isListNode(nodeName: string): boolean {
  return nodeName === 'OL' || nodeName === 'UL'
}

function isBlockquoteNode(nodeName: string): boolean {
  return nodeName === 'BLOCKQUOTE'
}

function isCodeNode(nodeName: string): boolean {
  return nodeName === 'PRE'
}

function isLinkNode(nodeName: string): boolean {
  return nodeName === 'A'
}

function isImageNode(nodeName: string): boolean {
  return nodeName === 'IMG'
}

function isDividerNode(nodeName: string): boolean {
  return nodeName === 'HR'
}

function isBreakNode(nodeName: string): boolean {
  return nodeName === 'BR'
}

function isTextNode(node: globalThis.Node): node is Text {
  return node.nodeType === Node.TEXT_NODE
}

function isHtmlElementNode(node: globalThis.Node): node is globalThis.HTMLElement {
  return node instanceof globalThis.HTMLElement
}

function isListContentNode(node: DeserializedNode): boolean {
  return node.type === 'ordered-list' || node.type === 'unordered-list'
}

function isBlockChildrenContainer(node: DeserializedNode): boolean {
  return node.type === 'paragraph' || node.type === 'list-item-content'
}

function hasBlockChildren(nodes: DeserializedNode[]): boolean {
  return nodes.some(isBlockNode)
}

function hasNonEmptyTextNodes(nodes: DeserializedNode[]): boolean {
  return nodes.some(node => {
    if (isBlockNode(node)) {
      return false
    }
    if (isBlockChildrenContainer(node)) {
      return false
    }
    return true
  })
}

function isConfluenceQuote(element: globalThis.HTMLElement): boolean {
  return element.classList.contains('listtype-quote')
}

function isGoogleDocsBold(element: globalThis.HTMLElement): boolean {
  const { nodeName, style } = element
  const fontWeight = style.fontWeight

  if (nodeName === 'B' && fontWeight !== 'normal') {
    return true
  }

  if (typeof fontWeight === 'string') {
    return (
      fontWeight === 'bold' ||
      fontWeight === 'bolder' ||
      fontWeight === '1000' ||
      /^[5-9]\d{2}$/.test(fontWeight)
    )
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

function isGoogleDocsCode(element: globalThis.HTMLElement): boolean {
  return element.nodeName === 'SPAN' && element.classList.contains('code')
}

function isGoogleDocsUnderline(element: globalThis.HTMLElement): boolean {
  return element.style.textDecoration === 'underline'
}

function isGoogleDocsStrikethrough(element: globalThis.HTMLElement): boolean {
  return element.style.textDecoration === 'line-through'
}

function isGoogleDocsAlignCenter(element: globalThis.HTMLElement): boolean {
  return element.style.textAlign === 'center'
}

function isGoogleDocsAlignEnd(element: globalThis.HTMLElement): boolean {
  return element.style.textAlign === 'right' || element.style.textAlign === 'end'
}

function isGoogleDocsBlockquote(element: globalThis.HTMLElement): boolean {
  return element.nodeName === 'BLOCKQUOTE'
}

function isGoogleDocsOrderedList(element: globalThis.HTMLElement): boolean {
  return element.nodeName === 'OL'
}

function isGoogleDocsUnorderedList(element: globalThis.HTMLElement): boolean {
  return element.nodeName === 'UL'
}

function isGoogleDocsParagraph(element: globalThis.HTMLElement): boolean {
  return element.nodeName === 'P'
}

function isGoogleDocsHeading(element: globalThis.HTMLElement): boolean {
  const { nodeName } = element
  return typeof headings[nodeName] === 'number'
}

function isGoogleDocsCodeBlock(element: globalThis.HTMLElement): boolean {
  return element.nodeName === 'PRE'
}

function isGoogleDocsLink(element: globalThis.HTMLElement): boolean {
  return element.nodeName === 'A'
}

function isGoogleDocsImage(element: globalThis.HTMLElement): boolean {
  return element.nodeName === 'IMG'
}

function isGoogleDocsDivider(element: globalThis.HTMLElement): boolean {
  return element.nodeName === 'HR'
}

function isGoogleDocsBreak(element: globalThis.HTMLElement): boolean {
  return element.nodeName === 'BR'
}

function isGoogleDocsListItem(element: globalThis.HTMLElement): boolean {
  return element.nodeName === 'LI'
}

function isGoogleDocsDiv(element: globalThis.HTMLElement): boolean {
  return element.nodeName === 'DIV'
}

function isGoogleDocsDivWithInlineChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0])
}

function isGoogleDocsDivWithBlockChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && isBlock(children[0])
}

function isGoogleDocsDivWithMixedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && hasBlockChildren(children)
}

function isGoogleDocsDivWithOnlyInlineChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children)
}

function isGoogleDocsDivWithOnlyBlockChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && isBlock(children[0]) && !hasBlockChildren(children)
}

function isGoogleDocsDivWithOnlyTextChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyEmptyChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyWhitespaceChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidChildren(element: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return element.nodeName === 'DIV' && !isBlock(children[0]) && !hasBlockChildren(children) && !hasNonEmptyTextNodes(children)
}

function isGoogleDocsDivWithOnlyNullOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefinedOrNullOrUndefinedOrVoidOrUndefined