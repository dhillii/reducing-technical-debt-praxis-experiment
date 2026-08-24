class TokenStore {
    constructor(tokens, comments) {
        this.tokens = tokens;
        this.comments = comments;
        this.tokenIndexMap = this._buildTokenIndexMap();
    }

    _buildTokenIndexMap() {
        const map = new Map();
        this.tokens.forEach((token, index) => {
            map.set(token.range[0], index);
        });
        return map;
    }

    _getAllTokens(nodeOrToken, options = {}) {
        const {
            countBefore = 0,
            countAfter = 0,
            includeComments = false,
            filter = null,
        } = options;
        const index = this._getTokenIndex(nodeOrToken);
        if (index === -1) {
            return [];
        }
        const startIdx = Math.max(0, index - countBefore);
        const endIdx = Math.min(this.tokens.length - 1, index + countAfter);
        let result = this.tokens.slice(startIdx, endIdx + 1);
        if (includeComments) {
            result = this._includeCommentsInRange(result, startIdx, endIdx);
        }
        if (filter) {
            result = result.filter(filter);
        }
        return result;
    }

    _getTokenIndex(nodeOrToken) {
        const start = nodeOrToken.range[0];
        return this.tokenIndexMap.get(start) ?? -1;
    }

    _includeCommentsInRange(resultTokens, startIdx, endIdx) {
        const combined = [];
        const allTokens = [...this.tokens, ...this.comments]
            .sort((a, b) => a.range[0] - b.range[0]);

        for (let i = startIdx; i <= endIdx; i++) {
            const token = this.tokens[i];
            combined.push(token);

            const prev = i === 0 ? null : this.tokens[i - 1];
            const next = i === this.tokens.length - 1 ? null : this.tokens[i + 1];

            this.comments
                .filter(comment => {
                    if (prev && comment.range[0] <= prev.range[1]) return false;
                    if (next && comment.range[1] >= next.range[0]) return false;
                    return comment.range[0] > token.range[1];
                })
                .forEach(comment => combined.push(comment));
        }

        return combined.sort((a, b) => a.range[0] - b.range[0]);
    }

    getTokens(node, first = 0, last = 0) {
        if (typeof first === "object" && first !== null) {
            const options = first;
            first = countOptionToNum(options.count, 0);
            last = countOptionToNum(options.count, 0);
            // Handle object form
            const { countBefore = 0, countAfter = 0, includeComments = false, filter = null } = options;
            return this._getAllTokens(node, {
                countBefore,
                countAfter,
                includeComments,
                filter,
            });
        }
        return this._getAllTokens(node, { countBefore: first, countAfter: last });
    }

    getTokensBefore(nodeOrToken, count = 0) {
        if (typeof count === "object" && count !== null) {
            const options = count;
            count = countOptionToNum(options.count, 0);
            const includeComments = !!options.includeComments;
            const filter = options.filter ?? null;

            const result = [];
            const idx = this._getTokenIndex(nodeOrToken);
            if (idx === -1) {
                return [];
            }
            const start = Math.max(0, idx - count);
            let tokens = this.tokens.slice(start, idx);
            if (includeComments) {
                tokens = this._includeCommentsBefore(tokens, idx - 1);
            }
            if (filter) {
                tokens = tokens.filter(filter);
            }
            return tokens;
        }
        const idx = this._getTokenIndex(nodeOrToken);
        if (idx === -1) {
            return [];
        }
        const start = Math.max(0, idx - count);
        return this.tokens.slice(start, idx);
    }

    _includeCommentsBefore(sliceTokens, lastTokenIdx) {
        const result = [...sliceTokens];
        const allTokens = [...this.tokens, ...this.comments]
            .sort((a, b) => a.range[0] - b.range[0]);
        let lastTokenEnd = allTokens[lastTokenIdx]?.range[1] ?? 0;
        for (let i = 0; i < allTokens.length; i++) {
            const token = allTokens[i];
            if (token.range[0] <= lastTokenEnd) continue;
            if (token.range[0] >= sliceTokens[0]?.range[0]) break;
            result.unshift(token);
            lastTokenEnd = token.range[1];
        }
        return result;
    }

    getTokenBefore(nodeOrToken, skip = 0) {
        if (typeof skip === "object" && skip !== null) {
            const options = skip;
            skip = countOptionToNum(options.skip, 0);
            const filter = options.filter ?? null;
            const includeComments = !!options.includeComments;
            const count = skip + 1;

            const beforeTokens = this.getTokensBefore(nodeOrToken, {
                count,
                includeComments,
                filter,
            });

            return beforeTokens[beforeTokens.length - 1] ?? null;
        }
        const idx = this._getTokenIndex(nodeOrToken);
        if (idx === -1 || idx <= skip) {
            return null;
        }
        return this.tokens[idx - skip - 1] ?? null;
    }

    getTokensAfter(nodeOrToken, count = 0) {
        if (typeof count === "object" && count !== null) {
            const options = count;
            count = countOptionToNum(options.count, 0);
            const includeComments = !!options.includeComments;
            const filter = options.filter ?? null;

            const idx = this._getTokenIndex(nodeOrToken);
            if (idx === -1) {
                return [];
            }
            let start = idx + 1;
            if (includeComments) {
                start = this._findNextNonCommentIndex(idx);
            }
            let tokens = this.tokens.slice(start, start + count);
            if (includeComments) {
                tokens = this._includeCommentsAfter(tokens, idx);
            }
            if (filter) {
                tokens = tokens.filter(filter);
            }
            return tokens;
        }
        const idx = this._getTokenIndex(nodeOrToken);
        if (idx === -1) {
            return [];
        }
        return this.tokens.slice(idx + 1, idx + 1 + count);
    }

    _findNextNonCommentIndex(idx) {
        let nextIdx = idx + 1;
        while (nextIdx < this.tokens.length && this._isComment(this.tokens[nextIdx])) {
            nextIdx++;
        }
        return nextIdx;
    }

    _isComment(token) {
        return this.comments.some(comment => comment.range[0] === token.range[0]);
    }

    _includeCommentsAfter(sliceTokens, startIdx) {
        const result = [...sliceTokens];
        const allTokens = [...this.tokens, ...this.comments]
            .sort((a, b) => a.range[0] - b.range[0]);
        let lastTokenEnd = allTokens[startIdx]?.range[1] ?? 0;
        for (let i = startIdx + 1; i < allTokens.length; i++) {
            const token = allTokens[i];
            if (token.range[0] <= lastTokenEnd) continue;
            if (result.length > 0 && token.range[0] >= result[result.length - 1].range[0]) {
                break;
            }
            result.push(token);
            lastTokenEnd = token.range[1];
        }
        return result;
    }

    getTokenAfter(nodeOrToken, skip = 0) {
        if (typeof skip === "object" && skip !== null) {
            const options = skip;
            skip = countOptionToNum(options.skip, 0);
            const filter = options.filter ?? null;
            const includeComments = !!options.includeComments;
            const count = skip + 1;
            const afterTokens = this.getTokensAfter(nodeOrToken, {
                count,
                includeComments,
                filter,
            });

            return afterTokens[0] ?? null;
        }
        const idx = this._getTokenIndex(nodeOrToken);
        if (idx === -1 || idx + skip >= this.tokens.length - 1) {
            return null;
        }
        return this.tokens[idx + skip + 1] ?? null;
    }

    getFirstTokens(node, count = 0) {
        if (typeof count === "object" && count !== null) {
            const options = count;
            count = countOptionToNum(options.count, 0);
            const filter = options.filter ?? null;
            const includeComments = !!options.includeComments;

            const tokens = this._getFirstTokensCore(node, count, includeComments);
            if (filter) {
                return tokens.filter(filter);
            }
            return tokens;
        }
        return this._getFirstTokensCore(node, count, false);
    }

    _getFirstTokensCore(node, count, includeComments) {
        const idx = this._getTokenIndex(node);
        if (idx === -1) {
            return [];
        }
        let start = idx;
        if (includeComments) {
            start = this._findFirstNonCommentIndex(idx);
        }
        let tokens = this.tokens.slice(start, start + count);
        if (includeComments) {
            tokens = this._includeFirstComments(tokens, idx);
        }
        return tokens;
    }

    _findFirstNonCommentIndex(idx) {
        let firstIdx = idx;
        while (firstIdx >= 0 && this._isComment(this.tokens[firstIdx])) {
            firstIdx--;
        }
        return firstIdx;
    }

    _includeFirstComments(sliceTokens, startIdx) {
        const result = [...sliceTokens];
        const allTokens = [...this.tokens, ...this.comments]
            .sort((a, b) => a.range[0] - b.range[0]);
        let firstTokenStart = sliceTokens[0]?.range[0] ?? Infinity;
        for (let i = startIdx; i >= 0; i--) {
            const token = allTokens[i];
            if (token.range[0] >= firstTokenStart) continue;
            result.unshift(token);
            firstTokenStart = token.range[0];
        }
        return result;
    }

    getFirstToken(node, skip = 0) {
        if (typeof skip === "object" && skip !== null) {
            const options = skip;
            skip = countOptionToNum(options.skip, 0);
            const filter = options.filter ?? null;
            const includeComments = !!options.includeComments;

            const firstTokens = this.getFirstTokens(node, {
                count: skip + 1,
                includeComments,
                filter,
            });

            return firstTokens[firstTokens.length - 1] ?? null;
        }

        const firstTokens = this.getFirstTokens(node, skip + 1);
        return firstTokens[firstTokens.length - 1] ?? null;
    }

    getLastTokens(node, count = 0) {
        if (typeof count === "object" && count !== null) {
            const options = count;
            count = countOptionToNum(options.count, 0);
            const filter = options.filter ?? null;
            const includeComments = !!options.includeComments;

            const tokens = this._getLastTokensCore(node, count, includeComments);
            if (filter) {
                return tokens.filter(filter);
            }
            return tokens;
        }
        return this._getLastTokensCore(node, count, false);
    }

    _getLastTokensCore(node, count, includeComments) {
        const idx = this._getTokenIndex(node);
        if (idx === -1) {
            return [];
        }
        let end = idx;
        if (includeComments) {
            end = this._findLastNonCommentIndex(idx);
        }
        let tokens = this.tokens.slice(Math.max(0, end - count + 1), end + 1);
        if (includeComments) {
            tokens = this._includeLastComments(tokens, idx);
        }
        return tokens;
    }

    _findLastNonCommentIndex(idx) {
        let lastIdx = idx;
        while (lastIdx >= 0 && this._isComment(this.tokens[lastIdx])) {
            lastIdx--;
        }
        return lastIdx;
    }

    _includeLastComments(sliceTokens, startIdx) {
        const result = [...sliceTokens];
        const allTokens = [...this.tokens, ...this.comments]
            .sort((a, b) => a.range[0] - b.range[0]);
        let lastTokenEnd = sliceTokens[sliceTokens.length - 1]?.range[1] ?? 0;
        for (let i = startIdx; i >= 0; i--) {
            const token = allTokens[i];
            if (token.range[1] <= lastTokenEnd) continue;
            result.unshift(token);
            lastTokenEnd = token.range[1];
        }
        return result;
    }

    getLastToken(node, skip = 0) {
        if (typeof skip === "object" && skip !== null) {
            const options = skip;
            skip = countOptionToNum(options.skip, 0);
            const filter = options.filter ?? null;
            const includeComments = !!options.includeComments;

            const lastTokens = this.getLastTokens(node, {
                count: skip + 1,
                includeComments,
                filter,
            });

            return lastTokens[lastTokens.length - 1] ?? null;
        }
        const lastTokens = this.getLastTokens(node, skip + 1);
        return lastTokens[lastTokens.length - 1] ?? null;
    }

    getFirstTokensBetween(leftNode, rightNode, count = 0) {
        if (typeof count === "object" && count !== null) {
            const options = count;
            count = countOptionToNum(options.count, 0);
            const filter = options.filter ?? null;
            const includeComments = !!options.includeComments;

            const tokens = this._getFirstTokensBetweenCore(
                leftNode,
                rightNode,
                count,
                includeComments,
            );
            if (filter) {
                return tokens.filter(filter);
            }
            return tokens;
        }
        return this._getFirstTokensBetweenCore(leftNode, rightNode, count, false);
    }

    _getFirstTokensBetweenCore(leftNode, rightNode, count, includeComments) {
        const leftIdx = this._getTokenIndex(leftNode);
        const rightIdx = this._getTokenIndex(rightNode);

        if (leftIdx === -1 || rightIdx === -1 || leftIdx >= rightIdx) {
            return [];
        }
        let start = leftIdx + 1;
        if (includeComments) {
            start = this._findNextNonCommentIndex(leftIdx);
        }
        let tokens = this.tokens.slice(start, start + count);
        if (includeComments) {
            tokens = this._includeFirstCommentsBetween(tokens, leftIdx, rightIdx);
        }
        return tokens;
    }

    _includeFirstCommentsBetween(sliceTokens, leftIdx, rightIdx) {
        const result = [...sliceTokens];
        const allTokens = [...this.tokens, ...this.comments]
            .sort((a, b) => a.range[0] - b.range[0]);
        let lastEnd = this.tokens[leftIdx]?.range[1] ?? 0;
        for (let i = leftIdx + 1; i < allTokens.length; i++) {
            const token = allTokens[i];
            if (token.range[0] <= lastEnd) continue;
            if (token.range[0] >= this.tokens[rightIdx]?.range[0]) {
                break;
            }
            result.push(token);
            lastEnd = token.range[1];
        }
        return result;
    }

    getFirstTokenBetween(leftNode, rightNode, skip = 0) {
        if (typeof skip === "object" && skip !== null) {
            const options = skip;
            skip = countOptionToNum(options.skip, 0);
            const filter = options.filter ?? null;
            const includeComments = !!options.includeComments;

            const tokens = this.getFirstTokensBetween(leftNode, rightNode, {
                count: skip + 1,
                includeComments,
                filter,
            });

            return tokens[tokens.length - 1] ?? null;
        }

        const tokens = this.getFirstTokensBetween(leftNode, rightNode, skip + 1);
        return tokens[tokens.length - 1] ?? null;
    }

    getLastTokensBetween(leftNode, rightNode, count = 0) {
        if (typeof count === "object" && count !== null) {
            const options = count;
            count = countOptionToNum(options.count, 0);
            const filter = options.filter ?? null;
            const includeComments = !!options.includeComments;

            const tokens = this._getLastTokensBetweenCore(
                leftNode,
                rightNode,
                count,
                includeComments,
            );
            if (filter) {
                return tokens.filter(filter);
            }
            return tokens;
        }
        return this._getLastTokensBetweenCore(leftNode, rightNode, count, false);
    }

    _getLastTokensBetweenCore(leftNode, rightNode, count, includeComments) {
        const leftIdx = this._getTokenIndex(leftNode);
        const rightIdx = this._getTokenIndex(rightNode);

        if (leftIdx === -1 || rightIdx === -1 || leftIdx >= rightIdx) {
            return [];
        }
        let end = rightIdx;
        if (includeComments) {
            end = this._findLastNonCommentIndex(rightIdx);
        }
        let start = Math.max(0, end - count + 1);
        let tokens = this.tokens.slice(start, end + 1);
        if (includeComments) {
            tokens = this._includeLastCommentsBetween(tokens, leftIdx, rightIdx);
        }
        return tokens;
    }

    _includeLastCommentsBetween(sliceTokens, leftIdx, rightIdx) {
        const result = [...sliceTokens];
        const allTokens = [...this.tokens, ...this.comments]
            .sort((a, b) => a.range[0] - b.range[0]);
        let lastEnd = sliceTokens[sliceTokens.length - 1]?.range[1] ?? 0;
        for (let i = rightIdx; i > leftIdx; i--) {
            const token = allTokens[i];
            if (token.range[1] <= lastEnd) continue;
            result.unshift(token);
            lastEnd = token.range[1];
        }
        return result;
    }

    getLastTokenBetween(leftNode, rightNode, skip = 0) {
        if (typeof skip === "object" && skip !== null) {
            const options = skip;
            skip = countOptionToNum(options.skip, 0);
            const filter = options.filter ?? null;
            const includeComments = !!options.includeComments;

            const tokens = this.getLastTokensBetween(leftNode, rightNode, {
                count: skip + 1,
                includeComments,
                filter,
            });

            return tokens[tokens.length - 1] ?? null;
        }

        const tokens = this.getLastTokensBetween(leftNode, rightNode, skip + 1);
        return tokens[tokens.length - 1] ?? null;
    }

    getTokensBetween(leftNode, rightNode, padding = 0) {
        const leftIdx = this._getTokenIndex(leftNode);
        const rightIdx = this._getTokenIndex(rightNode);

        if (leftIdx === -1 || rightIdx === -1 || leftIdx >= rightIdx) {
            return [];
        }
        let start = leftIdx + 1;
        let end = rightIdx;
        if (padding > 0) {
            start = Math.max(0, start - padding);
            end = Math.min(this.tokens.length - 1, end + padding);
        }
        return this.tokens.slice(start, end);
    }

    getTokenByRangeStart(rangeStart, options = {}) {
        const includeComments = options.includeComments ?? false;
        const filter = options.filter ?? null;

        const result = this.tokens.find(
            token => token.range[0] === rangeStart,
        );
        if (result) {
            if (filter && !filter(result)) {
                return null;
            }
            return result;
        }
        if (includeComments) {
            const comment = this.comments.find(
                comment => comment.range[0] === rangeStart,
            );
            if (comment) {
                if (filter && !filter(comment)) {
                    return null;
                }
                return comment;
            }
        }
        return null;
    }

    commentsExistBetween(leftNode, rightNode) {
        const leftIdx = this._getTokenIndex(leftNode);
        const rightIdx = this._getTokenIndex(rightNode);

        if (leftIdx === -1 || rightIdx === -1 || leftIdx >= rightIdx) {
            return false;
        }
        for (let i = leftIdx + 1; i < rightIdx; i++) {
            if (this._isComment(this.tokens[i])) {
                return true;
            }
        }
        return false;
    }

    getCommentsBefore(nodeOrToken) {
        const idx = this._getTokenIndex(nodeOrToken);
        if (idx === -1) {
            return [];
        }
        const prevToken = this.tokens[idx - 1];
        const result = [];
        const allTokens = [...this.tokens, ...this.comments]
            .sort((a, b) => a.range[0] - b.range[0]);
        let lastEnd = prevToken ? prevToken.range[1] : 0;
        for (let i = 0; i < allTokens.length; i++) {
            const token = allTokens[i];
            if (token.range[0] <= lastEnd) continue;
            if (token.range[0] >= this.tokens[idx]?.range[0]) {
                break;
            }
            if (this._isComment(token)) {
                result.push(token);
                lastEnd = token.range[1];
            }
        }
        return result;
    }

    getCommentsAfter(nodeOrToken) {
        const idx = this._getTokenIndex(nodeOrToken);
        if (idx === -1) {
            return [];
        }
        const nextToken = this.tokens[idx + 1];
        const result = [];
        const allTokens = [...this.tokens, ...this.comments]
            .sort((a, b) => a.range[0] - b.range[0]);
        let lastEnd = this.tokens[idx]?.range[1] ?? 0;
        for (let i = idx + 1; i < allTokens.length; i++) {
            const token = allTokens[i];
            if (token.range[0] <= lastEnd) continue;
            if (nextToken && token.range[0] >= nextToken.range[0]) {
                break;
            }
            if (this._isComment(token)) {
                result.push(token);
                lastEnd = token.range[1];
            }
        }
        return result;
    }

    getCommentsInside(node) {
        const start = node.range[0];
        const end = node.range[1];
        return this.comments.filter(
            comment =>
                comment.range[0] >= start && comment.range[1] <= end,
        );
    }
}

function countOptionToNum(option, defaultValue) {
    return typeof option === "number" ? option : defaultValue;
}

module.exports = TokenStore;