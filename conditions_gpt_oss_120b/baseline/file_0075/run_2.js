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
        this._merged = this._mergeTokensAndComments();
    }

    _mergeTokensAndComments() {
        const items = [];
        for (const t of this.tokens) {
            items.push({ ...t, isComment: false });
        }
        for (const c of this.comments) {
            items.push({ ...c, isComment: true });
        }
        items.sort((a, b) => a.range[0] - b.range[0]);
        return items;
    }

    _normalizeOptions(opts) {
        if (typeof opts === "function") {
            return { ...DEFAULT_OPTIONS, filter: opts };
        }
        if (typeof opts === "number") {
            return { ...DEFAULT_OPTIONS, count: opts };
        }
        if (opts && typeof opts === "object") {
            return { ...DEFAULT_OPTIONS, ...opts };
        }
        return { ...DEFAULT_OPTIONS };
    }

    _rangeForNode(node) {
        return node && node.range ? node.range : [0, 0];
    }

    _sliceByRange(start, end, includeComments) {
        const result = [];
        for (const item of this._merged) {
            if (item.range[0] >= start && item.range[1] <= end) {
                if (!item.isComment || includeComments) {
                    result.push(item);
                }
            }
        }
        return result;
    }

    _applyFilter(items, filter) {
        if (!filter) return items;
        return items.filter(filter);
    }

    _applySkipAndCount(items, skip, count) {
        const start = skip || 0;
        const end = count != null ? start + count : undefined;
        return items.slice(start, end);
    }

    getTokens(node, beforeOrOptions, after) {
        const opts = this._normalizeOptions(beforeOrOptions);
        const includeComments = opts.includeComments;
        const filter = opts.filter;
        const before = typeof beforeOrOptions === "number" ? beforeOrOptions : opts.count;
        const afterCount = typeof after === "number" ? after : opts.count;

        const [start, end] = this._rangeForNode(node);
        let tokens = this._sliceByRange(start, end, includeComments);
        if (filter) tokens = this._applyFilter(tokens, filter);

        if (before) {
            const beforeStart = Math.max(0, start - before);
            const beforeTokens = this._sliceByRange(beforeStart, start, includeComments);
            tokens = beforeTokens.concat(tokens);
        }

        if (afterCount) {
            const afterEnd = end + afterCount;
            const afterTokens = this._sliceByRange(end, afterEnd, includeComments);
            tokens = tokens.concat(afterTokens);
        }

        return tokens;
    }

    getTokensBefore(node, options) {
        const opts = this._normalizeOptions(options);
        const includeComments = opts.includeComments;
        const filter = opts.filter;
        const count = opts.count != null ? opts.count : Number.MAX_SAFE_INTEGER;
        const [start] = this._rangeForNode(node);
        const beforeTokens = this._sliceByRange(0, start, includeComments);
        const filtered = this._applyFilter(beforeTokens, filter);
        return this._applySkipAndCount(filtered, 0, count);
    }

    getTokenBefore(node, options) {
        const tokens = this.getTokensBefore(node, options);
        return tokens.length ? tokens[tokens.length - 1] : null;
    }

    getTokensAfter(node, options) {
        const opts = this._normalizeOptions(options);
        const includeComments = opts.includeComments;
        const filter = opts.filter;
        const count = opts.count != null ? opts.count : Number.MAX_SAFE_INTEGER;
        const [, end] = this._rangeForNode(node);
        const afterTokens = this._sliceByRange(end, Number.MAX_SAFE_INTEGER, includeComments);
        const filtered = this._applyFilter(afterTokens, filter);
        return this._applySkipAndCount(filtered, 0, count);
    }

    getTokenAfter(node, options) {
        const tokens = this.getTokensAfter(node, options);
        return tokens.length ? tokens[0] : null;
    }

    getFirstTokens(node, options) {
        const opts = this._normalizeOptions(options);
        const includeComments = opts.includeComments;
        const filter = opts.filter;
        const count = opts.count != null ? opts.count : Number.MAX_SAFE_INTEGER;
        const [start, end] = this._rangeForNode(node);
        const tokens = this._sliceByRange(start, end, includeComments);
        const filtered = this._applyFilter(tokens, filter);
        return this._applySkipAndCount(filtered, opts.skip, count);
    }

    getFirstToken(node, options) {
        const tokens = this.getFirstTokens(node, options);
        return tokens.length ? tokens[0] : null;
    }

    getLastTokens(node, options) {
        const opts = this._normalizeOptions(options);
        const includeComments = opts.includeComments;
        const filter = opts.filter;
        const count = opts.count != null ? opts.count : Number.MAX_SAFE_INTEGER;
        const [start, end] = this._rangeForNode(node);
        const tokens = this._sliceByRange(start, end, includeComments);
        const filtered = this._applyFilter(tokens, filter);
        const reversed = filtered.slice().reverse();
        return this._applySkipAndCount(reversed, opts.skip, count).reverse();
    }

    getLastToken(node, options) {
        const tokens = this.getLastTokens(node, options);
        return tokens.length ? tokens[tokens.length - 1] : null;
    }

    getFirstTokensBetween(left, right, options) {
        const opts = this._normalizeOptions(options);
        const includeComments = opts.includeComments;
        const filter = opts.filter;
        const count = opts.count != null ? opts.count : Number.MAX_SAFE_INTEGER;
        const leftEnd = this._rangeForNode(left)[1];
        const rightStart = this._rangeForNode(right)[0];
        const tokens = this._sliceByRange(leftEnd, rightStart, includeComments);
        const filtered = this._applyFilter(tokens, filter);
        return this._applySkipAndCount(filtered, opts.skip, count);
    }

    getFirstTokenBetween(left, right, options) {
        const tokens = this.getFirstTokensBetween(left, right, options);
        return tokens.length ? tokens[0] : null;
    }

    getLastTokensBetween(left, right, options) {
        const opts = this._normalizeOptions(options);
        const includeComments = opts.includeComments;
        const filter = opts.filter;
        const count = opts.count != null ? opts.count : Number.MAX_SAFE_INTEGER;
        const leftEnd = this._rangeForNode(left)[1];
        const rightStart = this._rangeForNode(right)[0];
        const tokens = this._sliceByRange(leftEnd, rightStart, includeComments);
        const filtered = this._applyFilter(tokens, filter);
        const reversed = filtered.slice().reverse();
        return this._applySkipAndCount(reversed, opts.skip, count).reverse();
    }

    getLastTokenBetween(left, right, options) {
        const tokens = this.getLastTokensBetween(left, right, options);
        return tokens.length ? tokens[tokens.length - 1] : null;
    }

    getTokensBetween(left, right, padding = 0) {
        const leftEnd = this._rangeForNode(left)[1];
        const rightStart = this._rangeForNode(right)[0];
        const start = Math.max(0, leftEnd - padding);
        const end = rightStart + padding;
        return this._sliceByRange(start, end, false);
    }

    getTokenByRangeStart(index, options) {
        const opts = this._normalizeOptions(options);
        const includeComments = opts.includeComments;
        for (const item of this._merged) {
            if (item.range[0] === index && (!item.isComment || includeComments)) {
                return item;
            }
        }
        return null;
    }

    commentsExistBetween(left, right) {
        const leftEnd = this._rangeForNode(left)[1];
        const rightStart = this._rangeForNode(right)[0];
        for (const c of this.comments) {
            if (c.range[0] >= leftEnd && c.range[1] <= rightStart) {
                return true;
            }
        }
        return false;
    }

    getCommentsBefore(nodeOrToken) {
        const start = this._rangeForNode(nodeOrToken)[0];
        const result = [];
        for (const c of this.comments) {
            if (c.range[1] <= start) {
                result.push(c);
            }
        }
        return result;
    }

    getCommentsAfter(nodeOrToken) {
        const end = this._rangeForNode(nodeOrToken)[1];
        const result = [];
        for (const c of this.comments) {
            if (c.range[0] >= end) {
                result.push(c);
            }
        }
        return result;
    }

    getCommentsInside(node) {
        const [start, end] = this._rangeForNode(node);
        const result = [];
        for (const c of this.comments) {
            if (c.range[0] >= start && c.range[1] <= end) {
                result.push(c);
            }
        }
        return result;
    }
}

module.exports = TokenStore;