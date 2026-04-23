"use strict";

const DEFAULT_OPTIONS = {
    includeComments: false,
    filter: null,
    count: null,
    skip: 0,
};

class TokenStore {
    constructor(tokens, comments) {
        this.tokens = tokens || [];
        this.comments = comments || [];
        this._all = null;
    }

    /** Build combined sorted array of tokens and comments */
    _getAll(includeComments) {
        if (!includeComments) {
            return this.tokens;
        }
        if (this._all) {
            return this._all;
        }
        const combined = [...this.tokens, ...this.comments];
        combined.sort((a, b) => a.range[0] - b.range[0]);
        this._all = combined;
        return combined;
    }

    /** Find index of first item that starts at or after position */
    _findStartIndex(arr, pos) {
        for (let i = 0; i < arr.length; i++) {
            if (arr[i].range[0] >= pos) {
                return i;
            }
        }
        return arr.length;
    }

    /** Find index of last item that ends at or before position */
    _findEndIndex(arr, pos) {
        for (let i = arr.length - 1; i >= 0; i--) {
            if (arr[i].range[1] <= pos) {
                return i;
            }
        }
        return -1;
    }

    /** Core slice logic */
    _slice(node, before = 0, after = 0, options = {}) {
        const opt = { ...DEFAULT_OPTIONS, ...options };
        const all = this._getAll(opt.includeComments);
        const startIdx = this._findStartIndex(all, node.range[0]);
        const endIdx = this._findEndIndex(all, node.range[1]);

        const sliceStart = Math.max(0, startIdx - before);
        const sliceEnd = Math.min(all.length - 1, endIdx + after);
        let result = all.slice(sliceStart, sliceEnd + 1);

        if (opt.filter) {
            result = result.filter(opt.filter);
        }
        if (opt.count != null) {
            result = result.slice(0, opt.count);
        }
        return result;
    }

    /** getTokens overload handling */
    getTokens(node, arg1, arg2, arg3) {
        let before = 0,
            after = 0,
            options = {};

        if (typeof arg1 === "function") {
            options.filter = arg1;
        } else if (typeof arg1 === "object" && arg1 !== null) {
            options = arg1;
        } else {
            before = arg1 || 0;
            if (typeof arg2 === "function") {
                options.filter = arg2;
            } else if (typeof arg2 === "object" && arg2 !== null) {
                options = arg2;
            } else {
                after = arg2 || 0;
                if (typeof arg3 === "object" && arg3 !== null) {
                    options = arg3;
                }
            }
        }

        return this._slice(node, before, after, options);
    }

    getTokensBefore(node, arg) {
        let count = 0,
            options = {};

        if (typeof arg === "number") {
            count = arg;
        } else if (typeof arg === "object" && arg !== null) {
            count = arg.count || 0;
            options = arg;
        }

        const all = this._getAll(options.includeComments);
        const startIdx = this._findStartIndex(all, node.range[0]);
        const sliceStart = Math.max(0, startIdx - count);
        let result = all.slice(sliceStart, startIdx);

        if (options.filter) {
            result = result.filter(options.filter);
        }
        return result;
    }

    getTokenBefore(node, arg) {
        const tokens = this.getTokensBefore(node, arg);
        return tokens.length ? tokens[tokens.length - 1] : null;
    }

    getTokensAfter(node, arg) {
        let count = 0,
            options = {};

        if (typeof arg === "number") {
            count = arg;
        } else if (typeof arg === "object" && arg !== null) {
            count = arg.count || 0;
            options = arg;
        }

        const all = this._getAll(options.includeComments);
        const endIdx = this._findEndIndex(all, node.range[1]);
        const sliceEnd = Math.min(all.length, endIdx + 1 + count);
        let result = all.slice(endIdx + 1, sliceEnd);

        if (options.filter) {
            result = result.filter(options.filter);
        }
        return result;
    }

    getTokenAfter(node, arg) {
        const tokens = this.getTokensAfter(node, arg);
        return tokens.length ? tokens[0] : null;
    }

    _genericFirst(node, arg) {
        let count = null,
            options = {};

        if (typeof arg === "number") {
            count = arg;
        } else if (typeof arg === "function") {
            options.filter = arg;
        } else if (typeof arg === "object" && arg !== null) {
            count = arg.count;
            options = arg;
        }

        const all = this._getAll(options.includeComments);
        const startIdx = this._findStartIndex(all, node.range[0]);
        let result = all.slice(startIdx);

        if (options.filter) {
            result = result.filter(options.filter);
        }
        if (count != null) {
            result = result.slice(0, count);
        }
        return result;
    }

    getFirstTokens(node, arg) {
        return this._genericFirst(node, arg);
    }

    getFirstToken(node, arg) {
        const tokens = this.getFirstTokens(node, arg);
        return tokens.length ? tokens[0] : null;
    }

    _genericLast(node, arg) {
        let count = null,
            options = {};

        if (typeof arg === "number") {
            count = arg;
        } else if (typeof arg === "function") {
            options.filter = arg;
        } else if (typeof arg === "object" && arg !== null) {
            count = arg.count;
            options = arg;
        }

        const all = this._getAll(options.includeComments);
        const endIdx = this._findEndIndex(all, node.range[1]);
        let result = all.slice(0, endIdx + 1);

        if (options.filter) {
            result = result.filter(options.filter);
        }
        if (count != null) {
            result = result.slice(-count);
        }
        return result;
    }

    getLastTokens(node, arg) {
        return this._genericLast(node, arg);
    }

    getLastToken(node, arg) {
        const tokens = this.getLastTokens(node, arg);
        return tokens.length ? tokens[tokens.length - 1] : null;
    }

    _betweenIndices(leftNode, rightNode) {
        const all = this._getAll(true);
        const leftIdx = this._findEndIndex(all, leftNode.range[1]);
        const rightIdx = this._findStartIndex(all, rightNode.range[0]);
        return { leftIdx, rightIdx };
    }

    getFirstTokensBetween(leftNode, rightNode, arg) {
        const { leftIdx, rightIdx } = this._betweenIndices(leftNode, rightNode);
        let count = null,
            options = {};

        if (typeof arg === "number") {
            count = arg;
        } else if (typeof arg === "object" && arg !== null) {
            count = arg.count;
            options = arg;
        }

        const all = this._getAll(options.includeComments);
        let result = all.slice(leftIdx + 1, rightIdx);

        if (options.filter) {
            result = result.filter(options.filter);
        }
        if (count != null) {
            result = result.slice(0, count);
        }
        return result;
    }

    getFirstTokenBetween(leftNode, rightNode, arg) {
        const tokens = this.getFirstTokensBetween(leftNode, rightNode, arg);
        return tokens.length ? tokens[0] : null;
    }

    getLastTokensBetween(leftNode, rightNode, arg) {
        const { leftIdx, rightIdx } = this._betweenIndices(leftNode, rightNode);
        let count = null,
            options = {};

        if (typeof arg === "number") {
            count = arg;
        } else if (typeof arg === "object" && arg !== null) {
            count = arg.count;
            options = arg;
        }

        const all = this._getAll(options.includeComments);
        let result = all.slice(leftIdx + 1, rightIdx);

        if (options.filter) {
            result = result.filter(options.filter);
        }
        if (count != null) {
            result = result.slice(-count);
        }
        return result;
    }

    getLastTokenBetween(leftNode, rightNode, arg) {
        const tokens = this.getLastTokensBetween(leftNode, rightNode, arg);
        return tokens.length ? tokens[tokens.length - 1] : null;
    }

    getTokensBetween(leftNode, rightNode, padding = 0) {
        const all = this._getAll(false);
        const leftIdx = this._findStartIndex(all, leftNode.range[0]);
        const rightIdx = this._findStartIndex(all, rightNode.range[0]);
        const start = Math.max(0, leftIdx - padding);
        const end = rightIdx;
        return all.slice(start, end + 1);
    }

    getTokenByRangeStart(start, options = {}) {
        const all = this._getAll(options.includeComments);
        for (const item of all) {
            if (item.range[0] === start) {
                return item;
            }
        }
        return null;
    }

    commentsExistBetween(left, right) {
        const leftEnd = left.range[1];
        const rightStart = right.range[0];
        return this.comments.some(c => c.range[0] >= leftEnd && c.range[1] <= rightStart);
    }

    getCommentsBefore(nodeOrToken) {
        const nodeStart = nodeOrToken.range[0];
        const allTokens = this.tokens;
        const prevTokenIdx = allTokens.findIndex(t => t.range[0] >= nodeStart) - 1;
        const prevEnd = prevTokenIdx >= 0 ? allTokens[prevTokenIdx].range[1] : 0;
        return this.comments.filter(c => c.range[1] <= nodeStart && c.range[0] >= prevEnd);
    }

    getCommentsAfter(nodeOrToken) {
        const nodeEnd = nodeOrToken.range[1];
        const allTokens = this.tokens;
        const nextTokenIdx = allTokens.findIndex(t => t.range[0] > nodeEnd);
        const nextStart = nextTokenIdx >= 0 ? allTokens[nextTokenIdx].range[0] : Infinity;
        return this.comments.filter(c => c.range[0] >= nodeEnd && c.range[1] <= nextStart);
    }

    getCommentsInside(node) {
        return this.comments.filter(c => c.range[0] >= node.range[0] && c.range[1] <= node.range[1]);
    }
}

module.exports = TokenStore;