/**
 * Checks if there is at least one whitespace character between two nodes.
 * @param {ASTNode} left The left node.
 * @param {ASTNode} right The right node.
 * @returns {boolean} True if there is at least one whitespace character between the two nodes.
 */
function isSpaceBetween(left, right) {
    // Check if the left node is before the right node
    if (left.range[1] < right.range[0]) {
        // Get the tokens between the two nodes
        const tokens = this.ast.tokens.filter(token => token.range[0] >= left.range[1] && token.range[1] <= right.range[0]);

        // Check if there are any whitespace tokens between the two nodes
        return tokens.some(token => token.type === "Whitespace");
    }

    // Check if the right node is before the left node
    if (right.range[1] < left.range[0]) {
        // Get the tokens between the two nodes
        const tokens = this.ast.tokens.filter(token => token.range[0] >= right.range[1] && token.range[1] <= left.range[0]);

        // Check if there are any whitespace tokens between the two nodes
        return tokens.some(token => token.type === "Whitespace");
    }

    // If the nodes are not before or after each other, return false
    return false;
}