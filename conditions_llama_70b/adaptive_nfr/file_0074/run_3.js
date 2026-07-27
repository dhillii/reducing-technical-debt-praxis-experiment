/**
 * Checks if there is at least one whitespace character between two nodes.
 * @param {ASTNode} first The first node.
 * @param {ASTNode} second The second node.
 * @returns {boolean} True if there is at least one whitespace character between the two nodes.
 * @private
 */
function isSpaceBetween(first, second) {
    // Check if the nodes are the same
    if (first === second) {
        return false;
    }

    // Get the range of the first node
    const firstRange = first.range;

    // Get the range of the second node
    const secondRange = second.range;

    // Check if the first node is before the second node
    if (firstRange[1] <= secondRange[0]) {
        // Get the text between the two nodes
        const textBetween = this.text.slice(firstRange[1], secondRange[0]);

        // Check if there is at least one whitespace character in the text
        return /\s/.test(textBetween);
    }

    // Check if the second node is before the first node
    if (secondRange[1] <= firstRange[0]) {
        // Get the text between the two nodes
        const textBetween = this.text.slice(secondRange[1], firstRange[0]);

        // Check if there is at least one whitespace character in the text
        return /\s/.test(textBetween);
    }

    // If the nodes are not before or after each other, return false
    return false;
}