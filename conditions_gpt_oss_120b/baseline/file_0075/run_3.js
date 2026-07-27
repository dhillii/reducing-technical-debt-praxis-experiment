"use strict";

const DEFAULT_OPTIONS = {
    includeComments: false,
    filter: null,
    count: null,
    skip: 0,
};

class TokenStore {
    constructor(tokens, comments) {
        this.tokens = tokens.slice();
        this.comments = comments.slice();
        this._all = this.tokens.concat(this.comments).sort((a, b) => a.range[0] - b.range[0]);
    }

    // ---------- internal helpers ----------
    _normalizeOptions(opt) {
        if (typeof opt === "function") {
            return { filter: opt };
        }
        if (opt && typeof opt === "object") {
            return { ...opt };
        }
        return {};
    }

    _applyOptions(items, options) {
        const { filter, count, skip } = options;
        let result = items;
        if (typeof filter === "function") {
            result = result.filter(filter);
        }
        const start = skip || 0;
        const end = count != null ? start + count : undefined;
        return result.slice(start, end);
    }

    _findTokenIndex(pos, after = false) {
        let lo = 0;
        let hi = this.tokens.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            const token = this.tokens[mid];
            if (token.range[0] < pos || (after && token.range[0] === pos)) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        return lo;
    }

    _rangeIndices(node) {
        const startIdx = this._findTokenIndex(node.range[0]);
        const endIdx = this._findTokenIndex(node.range[1], true) - 1;
        return { startIdx, endIdx };
    }

    _collect(node, includeComments) {
        const { startIdx, endIdx } = this._rangeIndices(node);
        const tokens = this.tokens.slice(startIdx, endIdx + 1);
        if (!includeComments) return tokens;
        const comments = this.comments.filter(c => c.range[0] >= node.range[0] && c.range[1] <= node.range[1]);
        return this._mergeSorted(tokens, comments);
    }

    _mergeSorted(arr1, arr2) {
        const result = [];
        let i = 0, j = 0;
        while (i < arr1.length && j < arr2.length) {
            if (arr1[i].range[0] <= arr2[j].range[0]) {
                result.push(arr1[i++]);
            } else {
                result.push(arr2[j++]);
            }
        }
        while (i < arr1.length) result.push(arr1[i++]);
        while (j < arr2.length) result.push(arr2[j++]);
        return result;
    }

    _tokensBefore(node, count) {
        const { startIdx } = this._rangeIndices(node);
        const start = Math.max(0, startIdx - count);
        return this.tokens.slice(start, startIdx);
    }

    _tokensAfter(node, count) {
        const { endIdx } = this._rangeIndices(node);
        const end = Math.min(this.tokens.length, endIdx + 1 + count);
        return this.tokens.slice(endIdx + 1, end);
    }

    // ---------- public API ----------
    getTokens(node, beforeOrOptions, after) {
        const options = this._normalizeOptions(after);
        let before = 0;
        if (typeof beforeOrOptions === "number") {
            before = beforeOrOptions;
        } else if (beforeOrOptions && typeof beforeOrOptions === "object") {
            Object.assign(options, beforeOrOptions);
        }

        const includeComments = !!options.includeComments;
        const core = this._collect(node, includeComments);
        const beforeTokens = before > 0 ? this._tokensBefore(node, before) : [];
        const afterTokens = after && typeof after === "number" && after > 0 ? this._tokensAfter(node, after) : [];

        const combined = [...beforeTokens, ...core, ...afterTokens];
        return this._applyOptions(combined, options);
    }

    getTokensBefore(node, opt) {
        const options = this._normalizeOptions(opt);
        const count = options.count != null ? options.count : Number.MAX_SAFE_INTEGER;
        const includeComments = !!options.includeComments;
        const beforeTokens = this._tokensBefore(node, count);
        const comments = includeComments
            ? this.comments.filter(c => c.range[1] <= node.range[0] && !this.tokens.some(t => t.range[0] > c.range[1] && t.range[0] < node.range[0]))
            : [];
        const combined = this._mergeSorted(comments, beforeTokens);
        return this._applyOptions(combined, options);
    }

    getTokenBefore(node, opt) {
        const list = this.getTokensBefore(node, opt);
        return list.length ? list[0] : null;
    }

    getTokensAfter(node, opt) {
        const options = this._normalizeOptions(opt);
        const count = options.count != null ? options.count : Number.MAX_SAFE_INTEGER;
        const includeComments = !!options.includeComments;
        const afterTokens = this._tokensAfter(node, count);
        const comments = includeComments
            ? this.comments.filter(c => c.range[0] >= node.range[1] && !this.tokens.some(t => t.range[0] > node.range[1] && t.range[0] < c.range[0]))
            : [];
        const combined = this._mergeSorted(afterTokens, comments);
        return this._applyOptions(combined, options);
    }

    getTokenAfter(node, opt) {
        const list = this.getTokensAfter(node, opt);
        return list.length ? list[0] : null;
    }

    getFirstTokens(node, countOrOpt) {
        const options = this._normalizeOptions(countOrOpt);
        if (typeof countOrOpt === "number") options.count = countOrOpt;
        const all = this._collect(node, !!options.includeComments);
        return this._applyOptions(all, options);
    }

    getFirstToken(node, opt) {
        const list = this.getFirstTokens(node, opt);
        return list.length ? list[0] : null;
    }

    getLastTokens(node, countOrOpt) {
        const options = this._normalizeOptions(countOrOpt);
        if (typeof countOrOpt === "number") options.count = countOrOpt;
        const all = this._collect(node, !!options.includeComments);
        const reversed = all.slice().reverse();
        return this._applyOptions(reversed, options);
    }

    getLastToken(node, opt) {
        const list = this.getLastTokens(node, opt);
        return list.length ? list[0] : null;
    }

    _betweenIndices(left, right) {
        const leftEnd = this._findTokenIndex(left.range[1], true);
        const rightStart = this._findTokenIndex(right.range[0]);
        return { leftEnd, rightStart };
    }

    getFirstTokensBetween(left, right, opt) {
        const options = this._normalizeOptions(opt);
        if (typeof opt === "number") options.count = opt;
        const { leftEnd, rightStart } = this._betweenIndices(left, right);
        const core = this.tokens.slice(leftEnd, rightStart);
        const includeComments = !!options.includeComments;
        const comments = includeComments
            ? this.comments.filter(c => c.range[0] >= left.range[1] && c.range[1] <= right.range[0])
            : [];
        const combined = this._mergeSorted(core, comments);
        return this._applyOptions(combined, options);
    }

    getFirstTokenBetween(left, right, opt) {
        const list = this.getFirstTokensBetween(left, right, opt);
        return list.length ? list[0] : null;
    }

    getLastTokensBetween(left, right, opt) {
        const options = this._normalizeOptions(opt);
        if (typeof opt === "number") options.count = opt;
        const { leftEnd, rightStart } = this._betweenIndices(left, right);
        const core = this.tokens.slice(leftEnd, rightStart);
        const includeComments = !!options.includeComments;
        const comments = includeComments
            ? this.comments.filter(c => c.range[0] >= left.range[1] && c.range[1] <= right.range[0])
            : [];
        const combined = this._mergeSorted(core, comments).reverse();
        return this._applyOptions(combined, options);
    }

    getLastTokenBetween(left, right, opt) {
        const list = this.getLastTokensBetween(left, right, opt);
        return list.length ? list[0] : null;
    }

    getTokensBetween(left, right, padding = 0) {
        const before = padding > 0 ? this._tokensBefore(left, padding) : [];
        const { leftEnd, rightStart } = this._betweenIndices(left, right);
        const middle = this.tokens.slice(leftEnd, rightStart);
        return [...before, ...middle];
    }

    getTokenByRangeStart(start, opt) {
        const options = this._normalizeOptions(opt);
        const includeComments = !!options.includeComments;
        const token = this.tokens.find(t => t.range[0] === start);
        if (token) return token;
        if (includeComments) {
            return this.comments.find(c => c.range[0] === start) || null;
        }
        return null;
    }

    commentsExistBetween(left, right) {
        return this.comments.some(c => c.range[0] > left.range[1] && c.range[1] < right.range[0]);
    }

    getCommentsBefore(nodeOrToken) {
        const start = nodeOrToken.range[0];
        const before = this.comments.filter(c => c.range[1] <= start);
        const lastTokenIdx = this.tokens.findIndex(t => t.range[0] > start);
        const lastTokenPos = lastTokenIdx === -1 ? Number.MAX_SAFE_INTEGER : this.tokens[lastTokenIdx].range[0];
        const filtered = before.filter(c => c.range[1] === start || c.range[1] < start && c.range[1] > (this.tokens[lastTokenIdx - 1]?.range[1] ?? 0));
        return filtered;
    }

    getCommentsAfter(nodeOrToken) {
        const end = nodeOrToken.range[1];
        const after = this.comments.filter(c => c.range[0] >= end);
        const firstTokenIdx = this.tokens.findIndex(t => t.range[0] > end);
        const filtered = after.filter(c => c.range[0] === end || c.range[0] > end && c.range[0] < (this.tokens[firstTokenIdx]?.range[0] ?? Number.MAX_SAFE_INTEGER));
        return filtered;
    }

    getCommentsInside(node) {
        return this.comments.filter(c => c.range[0] >= node.range[0] && c.range[1] <= node.range[1]);
    }
}

module.exports = TokenStore;