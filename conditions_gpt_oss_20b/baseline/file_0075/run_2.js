"use strict";

const assert = require("chai").assert;

class TokenStore {
    constructor(tokens = [], comments = []) {
        this.tokens = tokens.slice();
        this.comments = comments.slice();
        // Merge tokens and comments into a single sorted array
        this._combined = [...tokens, ...comments].sort((a, b) => a.range[0] - b.range[0]);
    }

    // ---------- Helper methods ----------
    _isToken(item) {
        return item.type !== "Block" && item.type !== "Line";
    }

    _filterItems(items, filter) {
        return filter ? items.filter(filter) : items;
    }

    _sliceByCount(items, count) {
        if (count == null || count <= 0) return [];
        return items.slice(0, count);
    }

    _indexOfFirstAfter(rangeStart, includeComments) {
        for (let i = 0; i < this._combined.length; i++) {
            const item = this._combined[i];
            if (item.range[0] >= rangeStart) {
                if (!includeComments && !this._isToken(item)) continue;
                return i;
            }
        }
        return this._combined.length;
    }

    _indexOfLastBefore(rangeEnd, includeComments) {
        for (let i = this._combined.length - 1; i >= 0; i--) {
            const item = this._combined[i];
            if (item.range[1] <= rangeEnd) {
                if (!includeComments && !this._isToken(item)) continue;
                return i;
            }
        }
        return -1;
    }

    _getItemsBetween(startIdx, endIdx, includeComments) {
        const items = [];
        for (let i = startIdx; i <= endIdx; i++) {
            const item = this._combined[i];
            if (!includeComments && !this._isToken(item)) continue;
            items.push(item);
        }
        return items;
    }

    // ---------- Public API ----------
    getTokens(node, beforeCountOrOptions, afterCount) {
        const rangeStart = node.range[0];
        const rangeEnd = node.range[1];
        let beforeCount = 0;
        let afterCountVal = 0;
        let includeComments = false;
        let filter = null;

        if (typeof beforeCountOrOptions === "number") {
            beforeCount = beforeCountOrOptions;
        } else if (typeof beforeCountOrOptions === "function") {
            filter = beforeCountOrOptions;
        } else if (beforeCountOrOptions && typeof beforeCountOrOptions === "object") {
            beforeCount = beforeCountOrOptions.count || 0;
            afterCountVal = beforeCountOrOptions.afterCount || 0;
            includeComments = !!beforeCountOrOptions.includeComments;
            filter = beforeCountOrOptions.filter || null;
        }

        if (afterCount != null) {
            afterCountVal = afterCount;
        }

        const startIdx = this._indexOfFirstAfter(rangeStart, includeComments);
        const endIdx = this._indexOfLastBefore(rangeEnd, includeComments);

        const inside = this._getItemsBetween(startIdx, endIdx, includeComments);
        const filteredInside = this._filterItems(inside, filter);

        const beforeIdx = this._indexOfLastBefore(rangeStart, includeComments);
        const beforeItems = this._getItemsBetween(
            Math.max(0, beforeIdx - beforeCount + 1),
            beforeIdx,
            includeComments
        );
        const filteredBefore = this._filterItems(beforeItems, filter);

        const afterIdx = this._indexOfFirstAfter(rangeEnd, includeComments);
        const afterItems = this._getItemsBetween(
            afterIdx,
            Math.min(this._combined.length - 1, afterIdx + afterCountVal - 1),
            includeComments
        );
        const filteredAfter = this._filterItems(afterItems, filter);

        return [...filteredBefore, ...filteredInside, ...filteredAfter];
    }

    getTokensBefore(node, options = {}) {
        const rangeStart = node.range[0];
        const count = options.count || 0;
        const includeComments = !!options.includeComments;
        const filter = options.filter || null;

        const idx = this._indexOfLastBefore(rangeStart, includeComments);
        if (idx < 0) return [];

        const startIdx = Math.max(0, idx - count + 1);
        const items = this._getItemsBetween(startIdx, idx, includeComments);
        return this._filterItems(items, filter);
    }

    getTokenBefore(node, options = {}) {
        const count = options.skip || 0;
        const includeComments = !!options.includeComments;
        const filter = options.filter || null;

        const idx = this._indexOfLastBefore(node.range[0], includeComments);
        if (idx < 0) return null;

        let targetIdx = idx - count;
        while (targetIdx >= 0) {
            const item = this._combined[targetIdx];
            if (!includeComments && !this._isToken(item)) {
                targetIdx--;
                continue;
            }
            if (!filter || filter(item)) return item;
            targetIdx--;
        }
        return null;
    }

    getTokensAfter(node, options = {}) {
        const rangeEnd = node.range[1];
        const count = options.count || 0;
        const includeComments = !!options.includeComments;
        const filter = options.filter || null;

        const idx = this._indexOfFirstAfter(rangeEnd, includeComments);
        if (idx >= this._combined.length) return [];

        const endIdx = Math.min(this._combined.length - 1, idx + count - 1);
        const items = this._getItemsBetween(idx, endIdx, includeComments);
        return this._filterItems(items, filter);
    }

    getTokenAfter(node, options = {}) {
        const skip = options.skip || 0;
        const includeComments = !!options.includeComments;
        const filter = options.filter || null;

        const idx = this._indexOfFirstAfter(node.range[1], includeComments);
        if (idx >= this._combined.length) return null;

        let targetIdx = idx + skip;
        while (targetIdx < this._combined.length) {
            const item = this._combined[targetIdx];
            if (!includeComments && !this._isToken(item)) {
                targetIdx++;
                continue;
            }
            if (!filter || filter(item)) return item;
            targetIdx++;
        }
        return null;
    }

    getFirstTokens(node, options = {}) {
        const count = options.count || 0;
        const includeComments = !!options.includeComments;
        const filter = options.filter || null;

        const startIdx = this._indexOfFirstAfter(node.range[0], includeComments);
        if (startIdx >= this._combined.length) return [];

        const endIdx = Math.min(this._combined.length - 1, startIdx + count - 1);
        const items = this._getItemsBetween(startIdx, endIdx, includeComments);
        return this._filterItems(items, filter);
    }

    getFirstToken(node, options = {}) {
        const count = options.skip || 0;
        const includeComments = !!options.includeComments;
        const filter = options.filter || null;

        const idx = this._indexOfFirstAfter(node.range[0], includeComments);
        if (idx >= this._combined.length) return null;

        let targetIdx = idx + count;
        while (targetIdx < this._combined.length) {
            const item = this._combined[targetIdx];
            if (!includeComments && !this._isToken(item)) {
                targetIdx++;
                continue;
            }
            if (!filter || filter(item)) return item;
            targetIdx++;
        }
        return null;
    }

    getLastTokens(node, options = {}) {
        const count = options.count || 0;
        const includeComments = !!options.includeComments;
        const filter = options.filter || null;

        const endIdx = this._indexOfLastBefore(node.range[1], includeComments);
        if (endIdx < 0) return [];

        const startIdx = Math.max(0, endIdx - count + 1);
        const items = this._getItemsBetween(startIdx, endIdx, includeComments);
        return this._filterItems(items, filter);
    }

    getLastToken(node, options = {}) {
        const count = options.skip || 0;
        const includeComments = !!options.includeComments;
        const filter = options.filter || null;

        const idx = this._indexOfLastBefore(node.range[1], includeComments);
        if (idx < 0) return null;

        let targetIdx = idx - count;
        while (targetIdx >= 0) {
            const item = this._combined[targetIdx];
            if (!includeComments && !this._isToken(item)) {
                targetIdx--;
                continue;
            }
            if (!filter || filter(item)) return item;
            targetIdx--;
        }
        return null;
    }

    getFirstTokensBetween(node1, node2, options = {}) {
        const count = options.count || 0;
        const includeComments = !!options.includeComments;
        const filter = options.filter || null;

        const startIdx = this._indexOfFirstAfter(node1.range[1], includeComments);
        const endIdx = this._indexOfLastBefore(node2.range[0], includeComments);
        if (startIdx > endIdx) return [];

        const items = this._getItemsBetween(startIdx, endIdx, includeComments);
        const filtered = this._filterItems(items, filter);
        return this._sliceByCount(filtered, count);
    }

    getFirstTokenBetween(node1, node2, options = {}) {
        const count = options.skip || 0;
        const includeComments = !!options.includeComments;
        const filter = options.filter || null;

        const startIdx = this._indexOfFirstAfter(node1.range[1], includeComments);
        const endIdx = this._indexOfLastBefore(node2.range[0], includeComments);
        if (startIdx > endIdx) return null;

        let targetIdx = startIdx + count;
        while (targetIdx <= endIdx) {
            const item = this._combined[targetIdx];
            if (!includeComments && !this._isToken(item)) {
                targetIdx++;
                continue;
            }
            if (!filter || filter(item)) return item;
            targetIdx++;
        }
        return null;
    }

    getLastTokensBetween(node1, node2, options = {}) {
        const count = options.count || 0;
        const includeComments = !!options.includeComments;
        const filter = options.filter || null;

        const startIdx = this._indexOfFirstAfter(node1.range[1], includeComments);
        const endIdx = this._indexOfLastBefore(node2.range[0], includeComments);
        if (startIdx > endIdx) return [];

        const items = this._getItemsBetween(startIdx, endIdx, includeComments);
        const filtered = this._filterItems(items, filter);
        return this._sliceByCount(filtered.reverse(), count).reverse();
    }

    getLastTokenBetween(node1, node2, options = {}) {
        const count = options.skip || 0;
        const includeComments = !!options.includeComments;
        const filter = options.filter || null;

        const startIdx = this._indexOfFirstAfter(node1.range[1], includeComments);
        const endIdx = this._indexOfLastBefore(node2.range[0], includeComments);
        if (startIdx > endIdx) return null;

        let targetIdx = endIdx - count;
        while (targetIdx >= startIdx) {
            const item = this._combined[targetIdx];
            if (!includeComments && !this._isToken(item)) {
                targetIdx--;
                continue;
            }
            if (!filter || filter(item)) return item;
            targetIdx--;
        }
        return null;
    }

    getTokensBetween(node1, node2, padding = 0) {
        const startIdx = this._indexOfFirstAfter(node1.range[1], false);
        const endIdx = this._indexOfLastBefore(node2.range[0], false);
        if (startIdx > endIdx) return [];

        const core = this._getItemsBetween(startIdx, endIdx, false);

        const beforeStart = Math.max(0, startIdx - padding);
        const afterEnd = Math.min(this._combined.length - 1, endIdx + padding);

        const before = this._getItemsBetween(beforeStart, startIdx - 1, false);
        const after = this._getItemsBetween(endIdx + 1, afterEnd, false);

        return [...before, ...core, ...after];
    }

    getTokenByRangeStart(index, options = {}) {
        const includeComments = !!options.includeComments;
        for (const item of this._combined) {
            if (item.range[0] === index) {
                if (!includeComments && !this._isToken(item)) return null;
                return item;
            }
        }
        return null;
    }

    commentsExistBetween(token1, token2) {
        const start = token1.range[1];
        const end = token2.range[0];
        for (const comment of this.comments) {
            if (comment.range[0] >= start && comment.range[1] <= end) return true;
        }
        return false;
    }

    getCommentsBefore(node) {
        const rangeStart = node.range[0];
        return this.comments.filter(c => c.range[1] <= rangeStart);
    }

    getCommentsAfter(node) {
        const rangeEnd = node.range[1];
        return this.comments.filter(c => c.range[0] >= rangeEnd);
    }

    getCommentsInside(node) {
        const start = node.range[0];
        const end = node.range[1];
        return this.comments.filter(c => c.range[0] >= start && c.range[1] <= end);
    }
}

module.exports = TokenStore;