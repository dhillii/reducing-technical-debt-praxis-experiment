```javascript
/**
 * @fileoverview TokenStore implementation for ESLint.
 * @author Brandon Mills
 */

"use strict";

const assert = require("chai").assert;

/**
 * TokenStore provides convenient access to tokens and comments
 * within an AST.  All methods are intentionally small and
 * focused on a single responsibility to keep cyclomatic
 * complexity low.
 */
class TokenStore {
    /**
     * @param {Token[]} tokens
     * @param {Comment[]} comments
     */
    constructor(tokens, comments) {
        this.tokens = tokens;
        this.comments = comments;

        // Combine tokens and comments into a single sorted array.
        this._combined = [...tokens, ...comments].sort(
            (a, b) => a.range[0] - b.range[0]
        );

        // Map each token/comment to its index in the combined array.
        this._indexMap = new Map();
        this._combined.forEach((t, i) => this._indexMap.set(t, i));
    }

    /* ------------------------------------------------------------------
     * Helper methods
     * ------------------------------------------------------------------ */

    /**
     * Return the index of a token/comment in the combined array.
     * @param {Token|Comment} token
     * @returns {number}
     */
    _indexOf(token) {
        return this._indexMap.get(token);
    }

    /**
     * Return the first token/comment whose range starts at `start`.
     * @param {number} start
     * @param {boolean} includeComments
     * @returns {Token|Comment|null}
     */
    _tokenByRangeStart(start, includeComments) {
        const array = includeComments ? this._combined : this.tokens;
        for (const t of array) {
            if (t.range[0] === start) return t;
        }
        return null;
    }

    /**
     * Return all tokens/comments between two positions.
     * @param {number} start
     * @param {number} end
     * @param {boolean} includeComments
     * @returns {Array<Token|Comment>}
     */
    _tokensBetween(start, end, includeComments) {
        const array = includeComments ? this._combined : this.tokens;
        return array.filter(
            t => t.range[0] >= start && t.range[1] <= end
        );
    }

    /**
     * Return all comments between two positions.
     * @param {number} start
     * @param {number} end
     * @returns {Array<Comment>}
     */
    _commentsBetween(start, end) {
        return this.comments.filter(
            c => c.range[0] >= start && c.range[1] <= end
        );
    }

    /**
     * Apply filter and count to a token array.
     * @param {Array<Token|Comment>} tokens
     * @param {Object} options
     * @returns {Array<Token|Comment>}
     */
    _applyOptions(tokens, options) {
        let result = tokens;
        if (options.filter) {
            result = result.filter(options.filter);
        }
        if (options.count != null) {
            result = result.slice(0, options.count);
        }
        return result;
    }

    /* ------------------------------------------------------------------
     * Public API
     * ------------------------------------------------------------------ */

    /**
     * Retrieve tokens for a node or token.
     * @param {Object} node
     * @param {number|Object} beforeOrOptions
     * @param {number|Object} afterOrOptions
     * @param {Object} options
     * @returns {Array<Token>}
     */
    getTokens(node, beforeOrOptions, afterOrOptions, options) {
        let beforeCount = 0;
        let afterCount = 0;
        let opts = {};

        if (typeof beforeOrOptions === "number") {
            beforeCount = beforeOrOptions;
        } else if (beforeOrOptions) {
            opts = beforeOrOptions;
        }

        if (typeof afterOrOptions === "number") {
            afterCount = afterOrOptions;
        } else if (afterOrOptions) {
            opts = afterOrOptions;
        }

        if (options) opts = options;

        const start = node.range[0];
        const end = node.range[1];
        const includeComments = !!opts.includeComments;

        // Tokens inside the node
        let tokens = this._tokensBetween(start, end, includeComments);

        // Tokens before the node
        if (beforeCount > 0) {
            const beforeTokens = this._tokensBetween(
                start - 1,
                start,
                includeComments
            ).slice(-beforeCount);
            tokens = beforeTokens.concat(tokens);
        }

        // Tokens after the node
        if (afterCount > 0) {
            const afterTokens = this._tokensBetween(
                end,
                end + 1,
                includeComments
            ).slice(0, afterCount);
            tokens = tokens.concat(afterTokens);
        }

        return this._applyOptions(tokens, opts);
    }

    /**
     * Retrieve tokens before a node or token.
     * @param {Object} node
     * @param {number|Object} countOrOptions
     * @param {Object} options
     * @returns {Array<Token>}
     */
    getTokensBefore(node, countOrOptions, options) {
        let count = 0;
        let opts = {};

        if (typeof countOrOptions === "number") {
            count = countOrOptions;
        } else if (countOrOptions) {
            opts = countOrOptions;
        }

        if (options) opts = options;

        const start = node.range[0];
        const includeComments = !!opts.includeComments;

        const beforeTokens = this._tokensBetween(
            start - 1,
            start,
            includeComments
        ).slice(-count);

        return this._applyOptions(beforeTokens, opts);
    }

    /**
     * Retrieve a single token before a node or token.
     * @param {Object} node
     * @param {Object} options
     * @returns {Token|null}
     */
    getTokenBefore(node, options) {
        const tokens = this.getTokensBefore(node, options);
        return tokens[0] || null;
    }

    /**
     * Retrieve tokens after a node or token.
     * @param {Object} node
     * @param {number|Object} countOrOptions
     * @param {Object} options
     * @returns {Array<Token>}
     */
    getTokensAfter(node, countOrOptions, options) {
        let count = 0;
        let opts = {};

        if (typeof countOrOptions === "number") {
            count = countOrOptions;
        } else if (countOrOptions) {
            opts = countOrOptions;
        }

        if (options) opts = options;

        const end = node.range[1];
        const includeComments = !!opts.includeComments;

        const afterTokens = this._tokensBetween(
            end,
            end + 1,
            includeComments
        ).slice(0, count);

        return this._applyOptions(afterTokens, opts);
    }

    /**
     * Retrieve a single token after a node or token.
     * @param {Object} node
     * @param {Object} options
     * @returns {Token|null}
     */
    getTokenAfter(node, options) {
        const tokens = this.getTokensAfter(node, options);
        return tokens[0] || null;
    }

    /**
     * Retrieve the first N tokens of a node.
     * @param {Object} node
     * @param {number|Object} countOrOptions
     * @param {Object} options
     * @returns {Array<Token>}
     */
    getFirstTokens(node, countOrOptions, options) {
        const tokens = this.getTokens(node, options);
        let count = 0;
        if (typeof countOrOptions === "number") {
            count = countOrOptions;
        } else if (countOrOptions) {
            count = countOrOptions.count || 0;
        }
        return tokens.slice(0, count);
    }

    /**
     * Retrieve the first token of a node.
     * @param {Object} node
     * @param {Object} options
     * @returns {Token|null}
     */
    getFirstToken(node, options) {
        const tokens = this.getFirstTokens(node, options);
        return tokens[0] || null;
    }

    /**
     * Retrieve the last N tokens of a node.
     * @param {Object} node
     * @param {number|Object} countOrOptions
     * @param {Object} options
     * @returns {Array<Token>}
     */
    getLastTokens(node, countOrOptions, options) {
        const tokens = this.getTokens(node, options);
        let count = 0;
        if (typeof countOrOptions === "number") {
            count = countOrOptions;
        } else if (countOrOptions) {
            count = countOrOptions.count || 0;
        }
        return tokens.slice(-count);
    }

    /**
     * Retrieve the last token of a node.
     * @param {Object} node
     * @param {Object} options
     * @returns {Token|null}
     */
    getLastToken(node, options) {
        const tokens = this.getLastTokens(node, options);
        return tokens[0] || null;
    }

    /**
     * Retrieve tokens between two nodes or tokens.
     * @param {Object} left
     * @param {Object} right
     * @param {number|Object} paddingOrOptions
     * @param {Object} options
     * @returns {Array<Token>}
     */
    getTokensBetween(left, right, paddingOrOptions, options) {
        let padding = 0;
        let opts = {};

        if (typeof paddingOrOptions === "number") {
            padding = paddingOrOptions;
        } else if (paddingOrOptions) {
            opts = paddingOrOptions;
        }

        if (options) opts = options;

        const leftEnd = left.range[1];
        const rightStart = right.range[0];
        const includeComments = !!opts.includeComments;

        // Base tokens between left and right
        let tokens = this._tokensBetween(leftEnd, rightStart, includeComments);

        // Apply padding
        if (padding > 0) {
            const beforeCount = Math.floor(padding / 2);
            const afterCount = Math.ceil(padding / 2);

            const beforeTokens = this._tokensBetween(
                leftEnd - 1,
                leftEnd,
                includeComments
            ).slice(-beforeCount);

            const afterTokens = this._tokensBetween(
                rightStart,
                rightStart + 1,
                includeComments
            ).slice(0, afterCount);

            tokens = beforeTokens.concat(tokens, afterTokens);
        }

        return this._applyOptions(tokens, opts);
    }

    /**
     * Retrieve the first N tokens between two nodes or tokens.
     * @param {Object} left
     * @param {Object} right
     * @param {number|Object} countOrOptions
     * @param {Object} options
     * @returns {Array<Token>}
     */
    getFirstTokensBetween(left, right, countOrOptions, options) {
        const tokens = this.getTokensBetween(left, right, options);
        let count = 0;
        if (typeof countOrOptions === "number") {
            count = countOrOptions;
        } else if (countOrOptions) {
            count = countOrOptions.count || 0;
        }
        return tokens.slice(0, count);
    }

    /**
     * Retrieve the first token between two nodes or tokens.
     * @param {Object} left
     * @param {Object} right
     * @param {Object} options
     * @returns {Token|null}
     */
    getFirstTokenBetween(left, right, options) {
        const tokens = this.getFirstTokensBetween(left, right, options);
        return tokens[0] || null;
    }

    /**
     * Retrieve the last N tokens between two nodes or tokens.
     * @param {Object} left
     * @param {Object} right
     * @param {number|Object} countOrOptions
     * @param {Object} options
     * @returns {Array<Token>}
     */
    getLastTokensBetween(left, right, countOrOptions, options) {
        const tokens = this.getTokensBetween(left, right, options);
        let count = 0;
        if (typeof countOrOptions === "number") {
            count = countOrOptions;
        } else if (countOrOptions) {
            count = countOrOptions.count || 0;
        }
        return tokens.slice(-count);
    }

    /**
     * Retrieve the last token between two nodes or tokens.
     * @param {Object} left
     * @param {Object} right
     * @param {Object} options
     * @returns {Token|null}
     */
    getLastTokenBetween(left, right, options) {
        const tokens = this.getLastTokensBetween(left, right, options);
        return tokens[0] || null;
    }

    /**
     * Retrieve a token by its range start.
     * @param {number} start
     * @param {Object} options
     * @returns {Token|Comment|null}
     */
    getTokenByRangeStart(start, options) {
        const includeComments = !!options && !!options.includeComments;
        return this._tokenByRangeStart(start, includeComments);
    }

    /**
     * Determine if comments exist between two tokens.
     * @param {Token} left
     * @param {Token} right
     * @returns {boolean}
     */
    commentsExistBetween(left, right) {
        const start = left.range[1];
        const end = right.range[0];
        return this.comments.some(
            c => c.range[0] > start && c.range[1] < end
        );
    }

    /**
     * Retrieve comments before a node or token.
     * @param {Object} node
     * @returns {Array<Comment>}
     */
    getCommentsBefore(node) {
        const start = node.range[0];
        return this.comments.filter(c => c.range[1] <= start);
    }

    /**
     * Retrieve comments after a node or token.
     * @param {Object} node
     * @returns {Array<Comment>}
     */
    getCommentsAfter(node) {
        const end = node.range[1];
        return this.comments.filter(c => c.range[0] >= end);
    }

    /**
     * Retrieve comments inside a node.
     * @param {Object} node
     * @returns {Array<Comment>}
     */
    getCommentsInside(node) {
        const start = node.range[0];
        const end = node.range[1];
        return this.comments.filter(
            c => c.range[0] >= start && c.range[1] <= end
        );
    }
}

module.exports = TokenStore;
```