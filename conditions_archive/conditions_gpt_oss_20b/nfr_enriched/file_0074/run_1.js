/**
 * Determine whether there is at least one whitespace character between two nodes or tokens.
 *
 * @param {ASTNode|Token} node1 First node or token.
 * @param {ASTNode|Token} node2 Second node or token.
 * @returns {boolean} True if whitespace exists between them, false otherwise.
 */
isSpaceBetween(node1, node2) {
  if (!node1 || !node2) {
    throw new Error('Missing required argument: node');
  }

  // JSXText nodes are never considered whitespace between nodes.
  if (node1.type === 'JSXText' || node2.type === 'JSXText') {
    return false;
  }

  const [first, second] = node1.range[0] <= node2.range[0]
    ? [node1, node2]
    : [node2, node1];

  // If ranges overlap or are adjacent, no space between.
  if (first.range[1] >= second.range[0]) {
    return false;
  }

  const between = this.text.slice(first.range[1], second.range[0]);

  return /\s/.test(between);
}