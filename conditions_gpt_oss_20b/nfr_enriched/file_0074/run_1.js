"use strict";

const OriginalSourceCode = require("eslint/lib/languages/js/source-code/source-code");

class RefactoredSourceCode extends OriginalSourceCode {
  /**
   * Return an array of ancestor nodes for the given node.
   * @param {ASTNode} node The node to get ancestors for.
   * @returns {ASTNode[]} Array of ancestor nodes, from parent up to the root.
   * @throws {Error} If the node argument is missing.
   */
  getAncestors(node) {
    if (!node) {
      throw new Error("Missing required argument: node");
    }
    const ancestors = [];
    let current = node.parent;
    while (current) {
      ancestors.push(current);
      current = current.parent;
    }
    return ancestors;
  }
}

module.exports = RefactoredSourceCode;