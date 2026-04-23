/**
 * @fileoverview TokenStore implementation for ESLint.
 * @author
 */

"use strict";

class TokenStore {
    /**
     * @param {Token[]} tokens
     * @param {Comment[]} comments
     */
    constructor(tokens, comments) {
        this.tokens = tokens;
        this.comments = comments;

        // Merge tokens and comments into a single sorted array.
        this.elements = [...tokens, ...comments].sort((a, b) => a.range[0] - b.range[0]);

        // Maps for quick index lookup.
        this.tokenIndexMap = new Map();
        this.commentIndexMap = new Map();
        this.elements.forEach((el, idx) => {
            if (el.type && el.type !== "Block" && el.type !== "Line") {
                this.tokenIndexMap.set(el, idx);
            } else {
                this.commentIndexMap.set(el, idx);
            }
        });
    }

    /* -------------------------------------------------------------------------- */
    /* Helpers                                                                    */
    /* -------------------------------------------------------------------------- */

    /** Binary search for first element with range[0] >= value */
    _findFirstIndexByStart(value) {
        let lo = 0, hi = this.elements.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (this.elements[mid].range[0] < value) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }

    /** Binary search for last element with range[1] <= value */
    _findLastIndexByEnd(value) {
        let lo = 0, hi = this.elements.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (this.elements[mid].range[1] <= value) lo = mid + 1;
            else hi = mid;
        }
        return lo - 1;
    }

    /** Get token index for a node (AST node or token) */
    _getNodeTokenRange(node) {
        if (!node || typeof node.range !== "object") return null;
        const start = node.range[0];
        const end = node.range[1];
        const first = this.tokens.find(t => t.range[0] >= start);
        const last = this.tokens.slice().reverse().find(t => t.range[1] <= end);
        return first && last ? { first, last } : null;
    }

    /** Resolve options: countBefore, countAfter, includeComments, filter */
    _normalizeOptions(opts, countBefore, countAfter) {
        if (typeof opts === "number") {
            countBefore = opts;
            opts = {};
        } else if (typeof opts === "object" && opts !== null) {
            // keep as is
        } else {
            opts = {};
        }
        if (countAfter !== undefined) opts.countAfter = countAfter;
        return opts;
    }

    /** Filter elements based on includeComments and filter callback */
    _filterElements(elements, opts) {
        const { includeComments = false, filter } = opts || {};
        return elements.filter(el => {
            if (!includeComments && (el.type === "Block" || el.type === "Line")) return false;
            if (filter && typeof filter === "function") return filter(el);
            return true;
        });
    }

    /** Get element index for a token or comment */
    _getElementIndex(el) {
        if (el.type === "Block" || el.type === "Line") return this.commentIndexMap.get(el);
        return this.tokenIndexMap.get(el);
    }

    /* -------------------------------------------------------------------------- */
    /* Public API                                                                */
    /* -------------------------------------------------------------------------- */

    getTokens(node, optsOrCountBefore, countAfter) {
        const opts = this._normalizeOptions(optsOrCountBefore, optsOrCountBefore, countAfter);
        const range = this._getNodeTokenRange(node);
        if (!range) return [];
        const startIdx = this._getElementIndex(range.first);
        const endIdx = this._getElementIndex(range.last);
        const before = opts.countBefore || 0;
        const after = opts.countAfter || 0;
        const sliceStart = Math.max(0, startIdx - before);
        const sliceEnd = Math.min(this.elements.length, endIdx + after + 1);
        return this._filterElements(this.elements.slice(sliceStart, sliceEnd), opts);
    }

    getTokensBefore(node, optsOrCount) {
        const opts = this._normalizeOptions(optsOrCount);
        const range = this._getNodeTokenRange(node);
        if (!range) return [];
        const startIdx = this._getElementIndex(range.first);
        const before = opts.count || 0;
        const sliceStart = Math.max(0, startIdx - before);
        const sliceEnd = startIdx;
        return this._filterElements(this.elements.slice(sliceStart, sliceEnd), opts);
    }

    getTokenBefore(node, optsOrCount) {
        const tokens = this.getTokensBefore(node, optsOrCount);
        return tokens.length ? tokens[tokens.length - 1] : null;
    }

    getTokensAfter(node, optsOrCount, countAfter) {
        const opts = this._normalizeOptions(optsOrCount, optsOrCount, countAfter);
        const range = this._getNodeTokenRange(node);
        if (!range) return [];
        const endIdx = this._getElementIndex(range.last);
        const after = opts.countAfter || 0;
        const sliceStart = endIdx + 1;
        const sliceEnd = Math.min(this.elements.length, sliceStart + after);
        return this._filterElements(this.elements.slice(sliceStart, sliceEnd), opts);
    }

    getTokenAfter(node, optsOrCount) {
        const tokens = this.getTokensAfter(node, optsOrCount);
        return tokens.length ? tokens[0] : null;
    }

    getFirstTokens(node, optsOrCount) {
        const opts = this._normalizeOptions(optsOrCount);
        const range = this._getNodeTokenRange(node);
        if (!range) return [];
        const startIdx = this._getElementIndex(range.first);
        const count = opts.count || 0;
        const sliceStart = startIdx;
        const sliceEnd = Math.min(this.elements.length, sliceStart + count);
        return this._filterElements(this.elements.slice(sliceStart, sliceEnd), opts);
    }

    getFirstToken(node, optsOrCount) {
        const tokens = this.getFirstTokens(node, optsOrCount);
        return tokens.length ? tokens[0] : null;
    }

    getLastTokens(node, optsOrCount) {
        const opts = this._normalizeOptions(optsOrCount);
        const range = this._getNodeTokenRange(node);
        if (!range) return [];
        const endIdx = this._getElementIndex(range.last);
        const count = opts.count || 0;
        const sliceStart = Math.max(0, endIdx - count + 1);
        const sliceEnd = endIdx + 1;
        return this._filterElements(this.elements.slice(sliceStart, sliceEnd), opts);
    }

    getLastToken(node, optsOrCount) {
        const tokens = this.getLastTokens(node, optsOrCount);
        return tokens.length ? tokens[tokens.length - 1] : null;
    }

    getFirstTokensBetween(node1, node2, optsOrCount) {
        const opts = this._normalizeOptions(optsOrCount);
        const range1 = this._getNodeTokenRange(node1);
        const range2 = this._getNodeTokenRange(node2);
        if (!range1 || !range2) return [];
        const endIdx = this._getElementIndex(range1.last);
        const startIdx = this._getElementIndex(range2.first);
        const before = opts.countBefore || 0;
        const after = opts.countAfter || 0;
        const sliceStart = Math.max(0, endIdx + 1 - before);
        const sliceEnd = Math.min(this.elements.length, startIdx + after);
        return this._filterElements(this.elements.slice(sliceStart, sliceEnd), opts);
    }

    getFirstTokenBetween(node1, node2, optsOrCount) {
        const tokens = this.getFirstTokensBetween(node1, node2, optsOrCount);
        return tokens.length ? tokens[0] : null;
    }

    getLastTokensBetween(node1, node2, optsOrCount) {
        const opts = this._normalizeOptions(optsOrCount);
        const range1 = this._getNodeTokenRange(node1);
        const range2 = this._getNodeTokenRange(node2);
        if (!range1 || !range2) return [];
        const endIdx = this._getElementIndex(range1.last);
        const startIdx = this._getElementIndex(range2.first);
        const before = opts.countBefore || 0;
        const after = opts.countAfter || 0;
        const sliceStart = Math.max(0, startIdx - after);
        const sliceEnd = Math.min(this.elements.length, endIdx + 1 + before);
        return this._filterElements(this.elements.slice(sliceStart, sliceEnd), opts);
    }

    getLastTokenBetween(node1, node2, optsOrCount) {
        const tokens = this.getLastTokensBetween(node1, node2, optsOrCount);
        return tokens.length ? tokens[tokens.length - 1] : null;
    }

    getTokensBetween(node1, node2, optsOrCount) {
        const opts = this._normalizeOptions(optsOrCount);
        const range1 = this._getNodeTokenRange(node1);
        const range2 = this._getNodeTokenRange(node2);
        if (!range1 || !range2) return [];
        const endIdx = this._getElementIndex(range1.last);
        const startIdx = this._getElementIndex(range2.first);
        const sliceStart = endIdx + 1;
        const sliceEnd = startIdx;
        return this._filterElements(this.elements.slice(sliceStart, sliceEnd), opts);
    }

    getTokenByRangeStart(start, opts = {}) {
        const idx = this._findFirstIndexByStart(start);
        if (idx >= this.elements.length) return null;
        const el = this.elements[idx];
        if (el.range[0] !== start) return null;
        if (!opts.includeComments && (el.type === "Block" || el.type === "Line")) return null;
        return el;
    }

    commentsExistBetween(token1, token2) {
        const idx1 = this._getElementIndex(token1);
        const idx2 = this._getElementIndex(token2);
        if (idx1 === undefined || idx2 === undefined) return false;
        const [start, end] = idx1 < idx2 ? [idx1, idx2] : [idx2, idx1];
        for (let i = start + 1; i < end; i++) {
            const el = this.elements[i];
            if (el.type === "Block" || el.type === "Line") return true;
        }
        return false;
    }

    getCommentsBefore(node) {
        const range = this._getNodeTokenRange(node);
        if (!range) return [];
        const startIdx = this._getElementIndex(range.first);
        const comments = [];
        for (let i = startIdx - 1; i >= 0; i--) {
            const el = this.elements[i];
            if (el.type === "Block" || el.type === "Line") comments.unshift(el);
            else break;
        }
        return comments;
    }

    getCommentsAfter(node) {
        const range = this._getNodeTokenRange(node);
        if (!range) return [];
        const endIdx = this._getElementIndex(range.last);
        const comments = [];
        for (let i = endIdx + 1; i < this.elements.length; i++) {
            const el = this.elements[i];
            if (el.type === "Block" || el.type === "Line") comments.push(el);
            else break;
        }
        return comments;
    }

    getCommentsInside(node) {
        const range = this._getNodeTokenRange(node);
        if (!range) return [];
        const startIdx = this._getElementIndex(range.first);
        const endIdx = this._getElementIndex(range.last);
        const comments = [];
        for (let i = startIdx; i <= endIdx; i++) {
            const el = this.elements[i];
            if (el.type === "Block" || el.type === "Line") comments.push(el);
        }
        return comments;
    }
}

module.exports = TokenStore;