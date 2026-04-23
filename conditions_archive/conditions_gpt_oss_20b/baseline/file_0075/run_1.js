"use strict";

const assert = require("chai").assert;
const espree = require("espree");

class TokenStore {
    constructor(tokens, comments) {
        this.tokens = tokens;
        this.comments = comments;
        this.combined = [...tokens, ...comments].sort((a, b) => a.range[0] - b.range[0]);
    }

    // ---------- Helpers ----------
    _filterTokens(tokens, filter) {
        return filter ? tokens.filter(filter) : tokens;
    }

    _includeComments(tokens, include) {
        return include ? tokens : tokens.filter(t => t.type !== "Block" && t.type !== "Line");
    }

    _getTokensInRange(start, end, includeComments) {
        return this.combined.filter(t => t.range[0] >= start && t.range[1] <= end && (includeComments || (t.type !== "Block" && t.type !== "Line")));
    }

    _getBeforeTokens(node, count, includeComments, filter) {
        const idx = this.combined.findIndex(t => t.range[0] >= node.range[0] && (includeComments || (t.type !== "Block" && t.type !== "Line")));
        const slice = this.combined.slice(Math.max(0, idx - count), idx);
        return this._filterTokens(slice, filter);
    }

    _getAfterTokens(node, count, includeComments, filter) {
        const idx = this.combined.findIndex(t => t.range[0] > node.range[1] && (includeComments || (t.type !== "Block" && t.type !== "Line")));
        const slice = this.combined.slice(idx, idx + count);
        return this._filterTokens(slice, filter);
    }

    // ---------- Public API ----------
    getTokens(node, opt1, opt2, opt3) {
        let countBefore = 0, countAfter = 0, includeComments = false, filter = null;

        if (typeof opt1 === "number") {
            countBefore = opt1;
            if (typeof opt2 === "number") countAfter = opt2;
            else if (typeof opt2 === "object") ({ includeComments = false, filter = null, ...opt2 } = opt2);
        } else if (typeof opt1 === "function") {
            filter = opt1;
        } else if (typeof opt1 === "object") {
            ({ count = 0, includeComments = false, filter = null } = opt1);
            countBefore = count;
        }

        const base = this._getTokensInRange(node.range[0], node.range[1], includeComments);
        const before = this._getBeforeTokens(node, countBefore, includeComments, filter);
        const after = this._getAfterTokens(node, countAfter, includeComments, filter);
        return [...before, ...base, ...after];
    }

    getTokensBefore(node, opt) {
        let count = 0, includeComments = false, filter = null;
        if (typeof opt === "number") count = opt;
        else if (typeof opt === "function") filter = opt;
        else if (typeof opt === "object") ({ count = 0, includeComments = false, filter = null } = opt);
        return this._getBeforeTokens(node, count, includeComments, filter);
    }

    getTokenBefore(node, opt) {
        let skip = 0, includeComments = false, filter = null;
        if (typeof opt === "number") skip = opt;
        else if (typeof opt === "function") filter = opt;
        else if (typeof opt === "object") ({ skip = 0, includeComments = false, filter = null } = opt);
        const before = this._getBeforeTokens(node, Infinity, includeComments, filter);
        return before[skip] || null;
    }

    getTokensAfter(node, opt) {
        let count = 0, includeComments = false, filter = null;
        if (typeof opt === "number") count = opt;
        else if (typeof opt === "function") filter = opt;
        else if (typeof opt === "object") ({ count = 0, includeComments = false, filter = null } = opt);
        return this._getAfterTokens(node, count, includeComments, filter);
    }

    getTokenAfter(node, opt) {
        let skip = 0, includeComments = false, filter = null;
        if (typeof opt === "number") skip = opt;
        else if (typeof opt === "function") filter = opt;
        else if (typeof opt === "object") ({ skip = 0, includeComments = false, filter = null } = opt);
        const after = this._getAfterTokens(node, Infinity, includeComments, filter);
        return after[skip] || null;
    }

    getFirstTokens(node, opt) {
        let count = 0, includeComments = false, filter = null;
        if (typeof opt === "number") count = opt;
        else if (typeof opt === "function") filter = opt;
        else if (typeof opt === "object") ({ count = 0, includeComments = false, filter = null } = opt);
        const tokens = this._getTokensInRange(node.range[0], node.range[1], includeComments);
        return this._filterTokens(tokens.slice(0, count), filter);
    }

    getFirstToken(node, opt) {
        const tokens = this.getFirstTokens(node, opt);
        return tokens[0] || null;
    }

    getLastTokens(node, opt) {
        let count = 0, includeComments = false, filter = null;
        if (typeof opt === "number") count = opt;
        else if (typeof opt === "function") filter = opt;
        else if (typeof opt === "object") ({ count = 0, includeComments = false, filter = null } = opt);
        const tokens = this._getTokensInRange(node.range[0], node.range[1], includeComments);
        return this._filterTokens(tokens.slice(-count), filter);
    }

    getLastToken(node, opt) {
        const tokens = this.getLastTokens(node, opt);
        return tokens[0] || null;
    }

    getFirstTokensBetween(left, right, opt) {
        let count = 0, includeComments = false, filter = null;
        if (typeof opt === "number") count = opt;
        else if (typeof opt === "function") filter = opt;
        else if (typeof opt === "object") ({ count = 0, includeComments = false, filter = null } = opt);
        const tokens = this._getTokensInRange(left.range[1], right.range[0], includeComments);
        return this._filterTokens(tokens.slice(0, count), filter);
    }

    getFirstTokenBetween(left, right, opt) {
        const tokens = this.getFirstTokensBetween(left, right, opt);
        return tokens[0] || null;
    }

    getLastTokensBetween(left, right, opt) {
        let count = 0, includeComments = false, filter = null;
        if (typeof opt === "number") count = opt;
        else if (typeof opt === "function") filter = opt;
        else if (typeof opt === "object") ({ count = 0, includeComments = false, filter = null } = opt);
        const tokens = this._getTokensInRange(left.range[1], right.range[0], includeComments);
        return this._filterTokens(tokens.slice(-count), filter);
    }

    getLastTokenBetween(left, right, opt) {
        const tokens = this.getLastTokensBetween(left, right, opt);
        return tokens[0] || null;
    }

    getTokensBetween(left, right, opt) {
        let includeComments = false, filter = null;
        if (typeof opt === "object") ({ includeComments = false, filter = null } = opt);
        const tokens = this._getTokensInRange(left.range[1], right.range[0], includeComments);
        return this._filterTokens(tokens, filter);
    }

    getTokenByRangeStart(start, opt) {
        let includeComments = false;
        if (typeof opt === "object") ({ includeComments = false } = opt);
        const token = this.combined.find(t => t.range[0] === start && (includeComments || (t.type !== "Block" && t.type !== "Line")));
        return token || null;
    }

    commentsExistBetween(token1, token2) {
        return this.comments.some(c => c.range[0] > token1.range[1] && c.range[1] < token2.range[0]);
    }

    getCommentsBefore(nodeOrToken, opt) {
        const start = nodeOrToken.range[0];
        const comments = this.comments.filter(c => c.range[1] <= start);
        return comments;
    }

    getCommentsAfter(nodeOrToken, opt) {
        const end = nodeOrToken.range[1];
        const comments = this.comments.filter(c => c.range[0] >= end);
        return comments;
    }

    getCommentsInside(node) {
        return this.comments.filter(c => c.range[0] >= node.range[0] && c.range[1] <= node.range[1]);
    }
}

module.exports = TokenStore;