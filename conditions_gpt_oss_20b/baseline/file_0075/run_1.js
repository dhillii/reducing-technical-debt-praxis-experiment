"use strict";

class TokenStore {
    constructor(tokens, comments) {
        this.tokens = tokens.slice().sort((a, b) => a.range[0] - b.range[0]);
        this.comments = comments.slice().sort((a, b) => a.range[0] - b.range[0]);
        this.combined = this._mergeSorted(this.tokens, this.comments);
    }

    _mergeSorted(a, b) {
        const res = [];
        let i = 0, j = 0;
        while (i < a.length && j < b.length) {
            if (a[i].range[0] <= b[j].range[0]) {
                res.push(a[i++]);
            } else {
                res.push(b[j++]);
            }
        }
        while (i < a.length) res.push(a[i++]);
        while (j < b.length) res.push(b[j++]);
        return res;
    }

    _getRange(node) {
        return node.range || [node.range[0], node.range[1]];
    }

    _filterItems(items, includeComments, filter) {
        if (!filter) return items;
        return items.filter(item => filter(item));
    }

    _sliceItems(items, count) {
        if (count == null || count >= items.length) return items;
        return items.slice(0, count);
    }

    getTokens(node, options) {
        const [start, end] = this._getRange(node);
        let includeComments = false;
        let count = null;
        let filter = null;
        if (typeof options === "number") {
            count = options;
        } else if (options) {
            includeComments = !!options.includeComments;
            count = options.count;
            filter = options.filter;
        }
        const source = includeComments ? this.combined : this.tokens;
        const items = source.filter(item => {
            if (item.range[0] < start || item.range[1] > end) return false;
            if (!includeComments && item.type && item.type.startsWith("Block")) return false;
            return true;
        });
        const filtered = this._filterItems(items, includeComments, filter);
        return this._sliceItems(filtered, count);
    }

    getTokensBefore(node, options) {
        const [start] = this._getRange(node);
        let includeComments = false;
        let count = null;
        let filter = null;
        if (typeof options === "number") {
            count = options;
        } else if (options) {
            includeComments = !!options.includeComments;
            count = options.count;
            filter = options.filter;
        }
        const source = this.combined;
        const result = [];
        for (let i = source.length - 1; i >= 0; i--) {
            const item = source[i];
            if (item.range[1] > start) continue;
            if (!includeComments && item.type && item.type.startsWith("Block")) continue;
            if (filter && !filter(item)) continue;
            result.push(item);
            if (count != null && result.length >= count) break;
        }
        return result.reverse();
    }

    getTokenBefore(node, options) {
        const [start] = this._getRange(node);
        let includeComments = false;
        let skip = 0;
        let filter = null;
        if (typeof options === "number") {
            skip = options;
        } else if (options) {
            includeComments = !!options.includeComments;
            skip = options.skip || 0;
            filter = options.filter;
        }
        const source = this.combined;
        let skipped = 0;
        for (let i = source.length - 1; i >= 0; i--) {
            const item = source[i];
            if (item.range[1] > start) continue;
            if (!includeComments && item.type && item.type.startsWith("Block")) continue;
            if (filter && !filter(item)) continue;
            if (skipped < skip) {
                skipped++;
                continue;
            }
            return item;
        }
        return null;
    }

    getTokensAfter(node, options) {
        const [, end] = this._getRange(node);
        let includeComments = false;
        let count = null;
        let filter = null;
        if (typeof options === "number") {
            count = options;
        } else if (options) {
            includeComments = !!options.includeComments;
            count = options.count;
            filter = options.filter;
        }
        const source = this.combined;
        const result = [];
        for (let i = 0; i < source.length; i++) {
            const item = source[i];
            if (item.range[0] < end) continue;
            if (!includeComments && item.type && item.type.startsWith("Block")) continue;
            if (filter && !filter(item)) continue;
            result.push(item);
            if (count != null && result.length >= count) break;
        }
        return result;
    }

    getTokenAfter(node, options) {
        const [, end] = this._getRange(node);
        let includeComments = false;
        let skip = 0;
        let filter = null;
        if (typeof options === "number") {
            skip = options;
        } else if (options) {
            includeComments = !!options.includeComments;
            skip = options.skip || 0;
            filter = options.filter;
        }
        const source = this.combined;
        let skipped = 0;
        for (let i = 0; i < source.length; i++) {
            const item = source[i];
            if (item.range[0] < end) continue;
            if (!includeComments && item.type && item.type.startsWith("Block")) continue;
            if (filter && !filter(item)) continue;
            if (skipped < skip) {
                skipped++;
                continue;
            }
            return item;
        }
        return null;
    }

    getFirstTokens(node, options) {
        const [start, end] = this._getRange(node);
        let includeComments = false;
        let count = null;
        let filter = null;
        if (typeof options === "number") {
            count = options;
        } else if (options) {
            includeComments = !!options.includeComments;
            count = options.count;
            filter = options.filter;
        }
        const source = includeComments ? this.combined : this.tokens;
        const items = source.filter(item => {
            if (item.range[0] < start || item.range[1] > end) return false;
            if (!includeComments && item.type && item.type.startsWith("Block")) return false;
            return true;
        });
        const filtered = this._filterItems(items, includeComments, filter);
        return this._sliceItems(filtered, count);
    }

    getFirstToken(node, options) {
        const [start, end] = this._getRange(node);
        let includeComments = false;
        let skip = 0;
        let filter = null;
        if (typeof options === "number") {
            skip = options;
        } else if (options) {
            includeComments = !!options.includeComments;
            skip = options.skip || 0;
            filter = options.filter;
        }
        const source = includeComments ? this.combined : this.tokens;
        let skipped = 0;
        for (let i = 0; i < source.length; i++) {
            const item = source[i];
            if (item.range[0] < start || item.range[1] > end) continue;
            if (!includeComments && item.type && item.type.startsWith("Block")) continue;
            if (filter && !filter(item)) continue;
            if (skipped < skip) {
                skipped++;
                continue;
            }
            return item;
        }
        return null;
    }

    getLastTokens(node, options) {
        const [start, end] = this._getRange(node);
        let includeComments = false;
        let count = null;
        let filter = null;
        if (typeof options === "number") {
            count = options;
        } else if (options) {
            includeComments = !!options.includeComments;
            count = options.count;
            filter = options.filter;
        }
        const source = includeComments ? this.combined : this.tokens;
        const items = source.filter(item => {
            if (item.range[0] < start || item.range[1] > end) return false;
            if (!includeComments && item.type && item.type.startsWith("Block")) return false;
            return true;
        });
        const filtered = this._filterItems(items, includeComments, filter);
        const sliced = this._sliceItems(filtered, count);
        return sliced.reverse();
    }

    getLastToken(node, options) {
        const [start, end] = this._getRange(node);
        let includeComments = false;
        let skip = 0;
        let filter = null;
        if (typeof options === "number") {
            skip = options;
        } else if (options) {
            includeComments = !!options.includeComments;
            skip = options.skip || 0;
            filter = options.filter;
        }
        const source = includeComments ? this.combined : this.tokens;
        let skipped = 0;
        for (let i = source.length - 1; i >= 0; i--) {
            const item = source[i];
            if (item.range[0] < start || item.range[1] > end) continue;
            if (!includeComments && item.type && item.type.startsWith("Block")) continue;
            if (filter && !filter(item)) continue;
            if (skipped < skip) {
                skipped++;
                continue;
            }
            return item;
        }
        return null;
    }

    getFirstTokensBetween(node1, node2, options) {
        const [, end1] = this._getRange(node1);
        const [start2] = this._getRange(node2);
        let includeComments = false;
        let count = null;
        let filter = null;
        if (typeof options === "number") {
            count = options;
        } else if (options) {
            includeComments = !!options.includeComments;
            count = options.count;
            filter = options.filter;
        }
        const source = includeComments ? this.combined : this.tokens;
        const items = source.filter(item => {
            if (item.range[0] < end1 || item.range[1] > start2) return false;
            if (!includeComments && item.type && item.type.startsWith("Block")) return false;
            return true;
        });
        const filtered = this._filterItems(items, includeComments, filter);
        return this._sliceItems(filtered, count);
    }

    getFirstTokenBetween(node1, node2, options) {
        const [, end1] = this._getRange(node1);
        const [start2] = this._getRange(node2);
        let includeComments = false;
        let skip = 0;
        let filter = null;
        if (typeof options === "number") {
            skip = options;
        } else if (options) {
            includeComments = !!options.includeComments;
            skip = options.skip || 0;
            filter = options.filter;
        }
        const source = includeComments ? this.combined : this.tokens;
        let skipped = 0;
        for (let i = 0; i < source.length; i++) {
            const item = source[i];
            if (item.range[0] < end1 || item.range[1] > start2) continue;
            if (!includeComments && item.type && item.type.startsWith("Block")) continue;
            if (filter && !filter(item)) continue;
            if (skipped < skip) {
                skipped++;
                continue;
            }
            return item;
        }
        return null;
    }

    getLastTokensBetween(node1, node2, options) {
        const [, end1] = this._getRange(node1);
        const [start2] = this._getRange(node2);
        let includeComments = false;
        let count = null;
        let filter = null;
        if (typeof options === "number") {
            count = options;
        } else if (options) {
            includeComments = !!options.includeComments;
            count = options.count;
            filter = options.filter;
        }
        const source = includeComments ? this.combined : this.tokens;
        const items = source.filter(item => {
            if (item.range[0] < end1 || item.range[1] > start2) return false;
            if (!includeComments && item.type && item.type.startsWith("Block")) return false;
            return true;
        });
        const filtered = this._filterItems(items, includeComments, filter);
        const sliced = this._sliceItems(filtered, count);
        return sliced.reverse();
    }

    getLastTokenBetween(node1, node2, options) {
        const [, end1] = this._getRange(node1);
        const [start2] = this._getRange(node2);
        let includeComments = false;
        let skip = 0;
        let filter = null;
        if (typeof options === "number") {
            skip = options;
        } else if (options) {
            includeComments = !!options.includeComments;
            skip = options.skip || 0;
            filter = options.filter;
        }
        const source = includeComments ? this.combined : this.tokens;
        let skipped = 0;
        for (let i = source.length - 1; i >= 0; i--) {
            const item = source[i];
            if (item.range[0] < end1 || item.range[1] > start2) continue;
            if (!includeComments && item.type && item.type.startsWith("Block")) continue;
            if (filter && !filter(item)) continue;
            if (skipped < skip) {
                skipped++;
                continue;
            }
            return item;
        }
        return null;
    }

    getTokensBetween(node1, node2, options) {
        const [, end1] = this._getRange(node1);
        const [start2] = this._getRange(node2);
        let includeComments = false;
        if (options && typeof options === "object") {
            includeComments = !!options.includeComments;
        }
        const source = includeComments ? this.combined : this.tokens;
        const items = source.filter(item => {
            if (item.range[0] < end1 || item.range[1] > start2) return false;
            if (!includeComments && item.type && item.type.startsWith("Block")) return false;
            return true;
        });
        return items;
    }

    getTokenByRangeStart(start, options) {
        let includeComments = false;
        if (options && typeof options === "object") {
            includeComments = !!options.includeComments;
        }
        const token = this.tokens.find(t => t.range[0] === start);
        if (token) return token;
        if (includeComments) {
            return this.comments.find(c => c.range[0] === start) || null;
        }
        return null;
    }

    commentsExistBetween(token1, token2) {
        const end1 = token1.range[1];
        const start2 = token2.range[0];
        return this.comments.some(c => c.range[0] > end1 && c.range[1] < start2);
    }

    getCommentsBefore(node) {
        const [start] = this._getRange(node);
        return this.comments.filter(c => c.range[1] <= start);
    }

    getCommentsAfter(node) {
        const [, end] = this._getRange(node);
        return this.comments.filter(c => c.range[0] >= end);
    }

    getCommentsInside(node) {
        const [start, end] = this._getRange(node);
        return this.comments.filter(c => c.range[0] >= start && c.range[1] <= end);
    }
}

module.exports = TokenStore;