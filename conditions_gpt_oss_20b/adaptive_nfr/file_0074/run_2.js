/**
 * Determine if there is whitespace between two nodes or tokens.
 * @param {ASTNode|Token} node1
 * @param {ASTNode|Token} node2
 * @returns {boolean}
 */
isSpaceBetween(node1, node2) {
    const [start1, end1] = this._getRange(node1);
    const [start2, end2] = this._getRange(node2);
    const [firstEnd, secondStart] = start1 < start2 ? [end1, start2] : [end2, start1];
    if (firstEnd >= secondStart) {
        return false;
    }
    const betweenText = this.text.slice(firstEnd, secondStart);
    if (!/\s/.test(betweenText)) {
        return false;
    }
    const tokensBetween = this._getTokensBetween(firstEnd, secondStart);
    // If only comments or JSXText with only whitespace, return false
    if (tokensBetween.every(tok => this._isComment(tok) || (tok.type === 'JSXText' && /^\s*$/.test(tok.value)))) {
        return false;
    }
    return true;
}

/**
 * Get the range of a node or token.
 * @private
 * @param {ASTNode|Token} node
 * @returns {[number, number]}
 */
_getRange(node) {
    return node.range || [node.start, node.end];
}

/**
 * Get tokens between two positions.
 * @private
 * @param {number} start
 * @param {number} end
 * @returns {Array<Token>}
 */
_getTokensBetween(start, end) {
    const tokens = this.tokensAndComments;
    const result = [];
    for (const tok of tokens) {
        if (tok.range[0] >= start && tok.range[1] <= end) {
            result.push(tok);
        }
    }
    return result;
}

/**
 * Check if a token is a comment.
 * @private
 * @param {Token} token
 * @returns {boolean}
 */
_isComment(token) {
    return token.type === 'Line' || token.type === 'Block';
}