/**
 * Checks if there is at least one whitespace character between two nodes.
 * @param {ASTNode} first The first node.
 * @param {ASTNode} second The second node.
 * @returns {boolean} True if there is at least one whitespace character between the two nodes.
 */
function isSpaceBetween(first, second) {
    // Check if the first node is before the second node
    if (first.range[1] <= second.range[0]) {
        // Check if there is a whitespace character between the two nodes
        return hasWhitespaceBetween(first, second);
    }
    // Check if the first node is after the second node
    else if (first.range[0] >= second.range[1]) {
        // Check if there is a whitespace character between the two nodes
        return hasWhitespaceBetween(second, first);
    }
    // If the nodes overlap, return false
    else {
        return false;
    }
}

/**
 * Checks if there is at least one whitespace character between two nodes.
 * @param {ASTNode} first The first node.
 * @param {ASTNode} second The second node.
 * @returns {boolean} True if there is at least one whitespace character between the two nodes.
 */
function hasWhitespaceBetween(first, second) {
    // Get the text between the two nodes
    const textBetween = getTextBetween(first, second);

    // Check if the text between the two nodes contains a whitespace character
    return /\s/.test(textBetween);
}

/**
 * Gets the text between two nodes.
 * @param {ASTNode} first The first node.
 * @param {ASTNode} second The second node.
 * @returns {string} The text between the two nodes.
 */
function getTextBetween(first, second) {
    // Get the start and end indices of the text between the two nodes
    const startIndex = first.range[1];
    const endIndex = second.range[0];

    // Get the text between the two nodes
    return text.slice(startIndex, endIndex);
}