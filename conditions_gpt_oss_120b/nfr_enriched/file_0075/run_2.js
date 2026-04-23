"use strict";

const DEFAULT_OPTIONS = {
    includeComments: false,
    filter: null,
    count: null,
    skip: 0,
};

/**
 * TokenStore provides utilities for retrieving tokens and comments from source code.
 */
class TokenStore {
    /**
     * @param {Array} tokens Array of token objects.
     * @param {Array} comments Array of comment objects.
     */
    constructor(tokens, comments) {
        this.tokens = tokens || [];
        this.comments = comments || [];

        // Merge tokens and comments into a single sorted array.
        this._all = [...this.tokens, ...this.comments].sort((a, b) => a.range[0] - b.range[0]);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Normalizes option arguments for public methods.
     * @param {any[]} args Arguments passed to a public method.
     * @returns {Object} Normalized options.
     */
    _normalizeOptions(args) {
        const opts = { ...DEFAULT_OPTIONS };
        if (args.length === 0) {
            return opts;
        }

        const first = args[0];
        const second = args[1];

        // Handle numeric count/skip.
        if (typeof first === "number") {
            opts.count = first;
        } else if (typeof first === "function") {
            opts.filter = first;
        } else if (first && typeof first === "object") {
            Object.assign(opts, first);
        }

        // Second argument may be a number (after count) or an options object.
        if (typeof second === "number") {
            opts.after = second;
        } else if (second && typeof second === "object") {
            Object.assign(opts, second);
        }

        return opts;
    }

    /**
     * Retrieves items (tokens/comments) that fall within a node's range.
     * @param {Object} node AST node with a `range` property.
     * @param {boolean} includeComments Whether to include comments.
     * @returns {Array} Items inside the node.
     */
    _itemsInRange(node, includeComments) {
        const start = node.range[0];
        const end = node.range[1];
        return this._all.filter(item => {
            if (!includeComments && item.type === "Block" && item.type === "Line") {
                // comment types are Block or Line; exclude when not requested.
                return false;
            }
            return item.range[0] >= start && item.range[1] <= end;
        });
    }

    /**
     * Retrieves items before a node.
     * @param {Object} node AST node.
     * @param {boolean} includeComments Whether to include comments.
     * @returns {Array} Items before the node.
     */
    _itemsBefore(node, includeComments) {
        const start = node.range[0];
        return this._all.filter(item => {
            if (!includeComments && (item.type === "Block" || item.type === "Line")) {
                return false;
            }
            return item.range[1] <= start;
        });
    }

    /**
     * Retrieves items after a node.
     * @param {Object} node AST node.
     * @param {boolean} includeComments Whether to include comments.
     * @returns {Array} Items after the node.
     */
    _itemsAfter(node, includeComments) {
        const end = node.range[1];
        return this._all.filter(item => {
            if (!includeComments && (item.type === "Block" || item.type === "Line")) {
                return false;
            }
            return item.range[0] >= end;
        });
    }

    /**
     * Applies filter, skip, and count options to a list of items.
     * @param {Array} items Items to process.
     * @param {Object} opts Normalized options.
     * @returns {Array} Processed items.
     */
    _applyOptions(items, opts) {
        let result = items;

        if (typeof opts.filter === "function") {
            result = result.filter(opts.filter);
        }

        if (opts.skip) {
            result = result.slice(opts.skip);
        }

        if (typeof opts.count === "number") {
            result = result.slice(0, opts.count);
        }

        return result;
    }

    /**
     * Finds the first index of an item that matches a predicate.
     * @param {Function} predicate Predicate function.
     * @returns {number} Index or -1.
     */
    _findIndex(predicate) {
        for (let i = 0; i < this._all.length; i++) {
            if (predicate(this._all[i])) {
                return i;
            }
        }
        return -1;
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    getTokens(node, ...rest) {
        const opts = this._normalizeOptions(rest);
        const items = this._itemsInRange(node, opts.includeComments);
        const before = typeof opts.before === "number" ? opts.before : 0;
        const after = typeof opts.after === "number" ? opts.after : 0;

        const startIdx = this._findIndex(item => item.range[0] >= node.range[0]) - before;
        const endIdx = this._findIndex(item => item.range[1] > node.range[1]) + after;

        const slice = this._all.slice(
            Math.max(0, startIdx),
            endIdx >= 0 ? endIdx : undefined
        ).filter(item => {
            if (!opts.includeComments && (item.type === "Block" || item.type === "Line")) {
                return false;
            }
            return true;
        });

        return this._applyOptions(slice, opts);
    }

    getTokensBefore(node, ...rest) {
        const opts = this._normalizeOptions(rest);
        const items = this._itemsBefore(node, opts.includeComments);
        return this._applyOptions(items, opts);
    }

    getTokenBefore(node, ...rest) {
        const opts = this._normalizeOptions(rest);
        const items = this._itemsBefore(node, opts.includeComments);
        const filtered = this._applyOptions(items, opts);
        return filtered[0] || null;
    }

    getTokensAfter(node, ...rest) {
        const opts = this._normalizeOptions(rest);
        const items = this._itemsAfter(node, opts.includeComments);
        return this._applyOptions(items, opts);
    }

    getTokenAfter(node, ...rest) {
        const opts = this._normalizeOptions(rest);
        const items = this._itemsAfter(node, opts.includeComments);
        const filtered = this._applyOptions(items, opts);
        return filtered[0] || null;
    }

    getFirstTokens(node, ...rest) {
        const opts = this._normalizeOptions(rest);
        const items = this._itemsInRange(node, opts.includeComments);
        return this._applyOptions(items, opts);
    }

    getFirstToken(node, ...rest) {
        const opts = this._normalizeOptions(rest);
        const items = this._itemsInRange(node, opts.includeComments);
        const filtered = this._applyOptions(items, opts);
        return filtered[0] || null;
    }

    getLastTokens(node, ...rest) {
        const opts = this._normalizeOptions(rest);
        const items = this._itemsInRange(node, opts.includeComments).reverse();
        return this._applyOptions(items, opts);
    }

    getLastToken(node, ...rest) {
        const opts = this._normalizeOptions(rest);
        const items = this._itemsInRange(node, opts.includeComments).reverse();
        const filtered = this._applyOptions(items, opts);
        return filtered[0] || null;
    }

    getFirstTokensBetween(left, right, ...rest) {
        const opts = this._normalizeOptions(rest);
        const leftEnd = left.range[1];
        const rightStart = right.range[0];
        const items = this._all.filter(item => item.range[0] >= leftEnd && item.range[1] <= rightStart);
        const filtered = this._applyOptions(items, opts);
        return filtered;
    }

    getFirstTokenBetween(left, right, ...rest) {
        const tokens = this.getFirstTokensBetween(left, right, ...rest);
        return tokens[0] || null;
    }

    getLastTokensBetween(left, right, ...rest) {
        const opts = this._normalizeOptions(rest);
        const leftEnd = left.range[1];
        const rightStart = right.range[0];
        const items = this._all.filter(item => item.range[0] >= leftEnd && item.range[1] <= rightStart).reverse();
        const filtered = this._applyOptions(items, opts);
        return filtered;
    }

    getLastTokenBetween(left, right, ...rest) {
        const tokens = this.getLastTokensBetween(left, right, ...rest);
        return tokens[0] || null;
    }

    getTokensBetween(left, right, padding = 0) {
        const leftEnd = left.range[1];
        const rightStart = right.range[0];
        const items = this._all.filter(item => item.range[0] >= leftEnd && item.range[1] <= rightStart);
        if (padding) {
            const startIdx = this._findIndex(item => item.range[0] >= left.range[0]) - padding;
            const endIdx = this._findIndex(item => item.range[1] > right.range[1]) + padding;
            return this._all.slice(
                Math.max(0, startIdx),
                endIdx >= 0 ? endIdx : undefined
            );
        }
        return items;
    }

    getTokenByRangeStart(start, ...rest) {
        const opts = this._normalizeOptions(rest);
        const candidate = this._all.find(item => item.range[0] === start);
        if (!candidate) {
            return null;
        }
        if (!opts.includeComments && (candidate.type === "Block" || candidate.type === "Line")) {
            return null;
        }
        return candidate;
    }

    commentsExistBetween(leftToken, rightToken) {
        const leftEnd = leftToken.range[1];
        const rightStart = rightToken.range[0];
        return this.comments.some(comment => comment.range[0] >= leftEnd && comment.range[1] <= rightStart);
    }

    getCommentsBefore(nodeOrToken) {
        const start = nodeOrToken.range[0];
        return this.comments.filter(comment => comment.range[1] <= start);
    }

    getCommentsAfter(nodeOrToken) {
        const end = nodeOrToken.range[1];
        return this.comments.filter(comment => comment.range[0] >= end);
    }

    getCommentsInside(node) {
        const start = node.range[0];
        const end = node.range[1];
        return this.comments.filter(comment => comment.range[0] >= start && comment.range[1] <= end);
    }
}

module.exports = TokenStore;