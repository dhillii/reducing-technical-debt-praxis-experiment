"use strict";

class TokenStore {
    constructor(tokens, comments) {
        this.tokens = tokens || [];
        this.comments = comments || [];
        this.combined = this._mergeTokensAndComments(this.tokens, this.comments);
        this.tokenIndexMap = new Map();
        this.combined.forEach((item, idx) => {
            if (item.type === "token") this.tokenIndexMap.set(item.node, idx);
        });
    }

    _mergeTokensAndComments(tokens, comments) {
        const merged = [
            ...tokens.map(t => ({ type: "token", node: t })),
            ...comments.map(c => ({ type: "comment", node: c }))
        ];
        merged.sort((a, b) => a.node.range[0] - b.node.range[0]);
        return merged;
    }

    _parseOptions(opt, defaults = {}) {
        if (typeof opt === "number") return { ...defaults, count: opt };
        if (opt == null) return defaults;
        return { ...defaults, ...opt };
    }

    _filterItems(items, opts) {
        const result = [];
        for (const item of items) {
            if (!opts.includeComments && item.type === "comment") continue;
            if (opts.filter && !opts.filter(item.node)) continue;
            result.push(item.node);
            if (result.length >= opts.count) break;
        }
        return result;
    }

    _getItemsInRange(startCond, endCond, opts) {
        const items = [];
        for (const item of this.combined) {
            if (startCond(item) && endCond(item)) {
                items.push(item);
            }
        }
        return this._filterItems(items, opts);
    }

    getTokens(node, opt) {
        const opts = this._parseOptions(opt, { includeComments: false, filter: null, count: Infinity });
        return this._getItemsInRange(
            item => item.node.range[0] >= node.range[0] && item.node.range[1] <= node.range[1],
            () => true,
            opts
        );
    }

    getTokensBefore(node, opt) {
        const opts = this._parseOptions(opt, { includeComments: false, filter: null, count: Infinity });
        return this._getItemsInRange(
            item => item.node.range[1] <= node.range[0],
            () => true,
            opts
        );
    }

    getTokenBefore(node, opt) {
        const opts = this._parseOptions(opt, { includeComments: false, filter: null, count: Infinity });
        const tokens = this.getTokensBefore(node, opts);
        return tokens.length ? tokens[tokens.length - 1] : null;
    }

    getTokensAfter(node, opt) {
        const opts = this._parseOptions(opt, { includeComments: false, filter: null, count: Infinity });
        return this._getItemsInRange(
            item => item.node.range[0] >= node.range[1],
            () => true,
            opts
        );
    }

    getTokenAfter(node, opt) {
        const opts = this._parseOptions(opt, { includeComments: false, filter: null, count: Infinity });
        const tokens = this.getTokensAfter(node, opts);
        return tokens.length ? tokens[0] : null;
    }

    getFirstTokens(node, opt) {
        const opts = this._parseOptions(opt, { includeComments: false, filter: null, count: Infinity });
        return this.getTokens(node, opts);
    }

    getFirstToken(node, opt) {
        const tokens = this.getFirstTokens(node, opt);
        return tokens.length ? tokens[0] : null;
    }

    getLastTokens(node, opt) {
        const opts = this._parseOptions(opt, { includeComments: false, filter: null, count: Infinity });
        const all = this.getTokens(node, { ...opts, count: Infinity });
        return all.slice(-opts.count);
    }

    getLastToken(node, opt) {
        const tokens = this.getLastTokens(node, opt);
        return tokens.length ? tokens[0] : null;
    }

    getFirstTokensBetween(left, right, opt) {
        const opts = this._parseOptions(opt, { includeComments: false, filter: null, count: Infinity });
        return this._getItemsInRange(
            item => item.node.range[0] >= left.range[1] && item.node.range[1] <= right.range[0],
            () => true,
            opts
        );
    }

    getFirstTokenBetween(left, right, opt) {
        const tokens = this.getFirstTokensBetween(left, right, opt);
        return tokens.length ? tokens[0] : null;
    }

    getLastTokensBetween(left, right, opt) {
        const opts = this._parseOptions(opt, { includeComments: false, filter: null, count: Infinity });
        const all = this._getItemsInRange(
            item => item.node.range[0] >= left.range[1] && item.node.range[1] <= right.range[0],
            () => true,
            { ...opts, count: Infinity }
        );
        return all.slice(-opts.count);
    }

    getLastTokenBetween(left, right, opt) {
        const tokens = this.getLastTokensBetween(left, right, opt);
        return tokens.length ? tokens[0] : null;
    }

    getTokensBetween(left, right, opt) {
        const opts = this._parseOptions(opt, { includeComments: false, filter: null, count: Infinity });
        return this._getItemsInRange(
            item => item.node.range[0] >= left.range[1] && item.node.range[1] <= right.range[0],
            () => true,
            opts
        );
    }

    getTokenByRangeStart(start, opt) {
        const opts = this._parseOptions(opt, { includeComments: false });
        for (const item of this.combined) {
            if (item.node.range[0] === start) {
                if (!opts.includeComments && item.type === "comment") return null;
                return item.node;
            }
        }
        return null;
    }

    _findTokenIndex(token) {
        return this.tokenIndexMap.get(token) ?? -1;
    }

    _findFirstTokenIndex(node) {
        for (let i = 0; i < this.combined.length; i++) {
            const item = this.combined[i];
            if (item.type === "token" && item.node.range[0] >= node.range[0] && item.node.range[1] <= node.range[1]) {
                return i;
            }
        }
        return -1;
    }

    _findLastTokenIndex(node) {
        for (let i = this.combined.length - 1; i >= 0; i--) {
            const item = this.combined[i];
            if (item.type === "token" && item.node.range[0] >= node.range[0] && item.node.range[1] <= node.range[1]) {
                return i;
            }
        }
        return -1;
    }

    getCommentsBefore(nodeOrToken) {
        let idx;
        if (nodeOrToken.type && nodeOrToken.range) {
            idx = this._findFirstTokenIndex(nodeOrToken);
        } else {
            idx = this._findTokenIndex(nodeOrToken);
        }
        if (idx === -1) return [];
        const comments = [];
        for (let i = idx - 1; i >= 0; i--) {
            const item = this.combined[i];
            if (item.type === "comment") {
                comments.unshift(item.node);
            } else {
                break;
            }
        }
        return comments;
    }

    getCommentsAfter(nodeOrToken) {
        let idx;
        if (nodeOrToken.type && nodeOrToken.range) {
            idx = this._findLastTokenIndex(nodeOrToken);
        } else {
            idx = this._findTokenIndex(nodeOrToken);
        }
        if (idx === -1) return [];
        const comments = [];
        for (let i = idx + 1; i < this.combined.length; i++) {
            const item = this.combined[i];
            if (item.type === "comment") {
                comments.push(item.node);
            } else {
                break;
            }
        }
        return comments;
    }

    getCommentsInside(node) {
        const comments = [];
        for (const item of this.combined) {
            if (item.type === "comment" &&
                item.node.range[0] >= node.range[0] &&
                item.node.range[1] <= node.range[1]) {
                comments.push(item.node);
            }
        }
        return comments;
    }

    commentsExistBetween(token1, token2) {
        const idx1 = this._findTokenIndex(token1);
        const idx2 = this._findTokenIndex(token2);
        if (idx1 === -1 || idx2 === -1) return false;
        const [start, end] = idx1 < idx2 ? [idx1, idx2] : [idx2, idx1];
        for (let i = start + 1; i < end; i++) {
            if (this.combined[i].type === "comment") return true;
        }
        return false;
    }
}

module.exports = TokenStore;