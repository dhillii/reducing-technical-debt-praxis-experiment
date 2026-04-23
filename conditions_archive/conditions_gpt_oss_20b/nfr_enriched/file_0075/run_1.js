/**
 * @fileoverview TokenStore implementation for ESLint.
 * @author Brandon Mills
 */

"use strict";

const assert = require("chai").assert;
const espree = require("espree");

/**
 * TokenStore provides convenient access to tokens and comments
 * within an AST.  All methods are intentionally small and
 * focused on a single responsibility to keep cyclomatic
 * complexity low.
 */
class TokenStore {
	/**
	 * @param {Token[]} tokens
	 * @param {Comment[]} comments
	 */
	constructor(tokens, comments) {
		/** @private @type {Array<{type:string, range:[number,number], value:string}>} */
		this._items = [...tokens, ...comments].sort(
			(a, b) => a.range[0] - b.range[0]
		);
		/** @private @type {Token[]} */
		this.tokens = tokens;
		/** @private @type {Comment[]} */
		this.comments = comments;
	}

	/**
	 * Find the index of the first item whose start >= value.
	 * @private
	 * @param {number} value
	 * @returns {number}
	 */
	_findIndexGE(value) {
		let low = 0;
		let high = this._items.length;
		while (low < high) {
			const mid = (low + high) >> 1;
			if (this._items[mid].range[0] < value) low = mid + 1;
			else high = mid;
		}
		return low;
	}

	/**
	 * Find the index of the first item whose start > value.
	 * @private
	 * @param {number} value
	 * @returns {number}
	 */
	_findIndexGT(value) {
		let low = 0;
		let high = this._items.length;
		while (low < high) {
			const mid = (low + high) >> 1;
			if (this._items[mid].range[0] <= value) low = mid + 1;
			else high = mid;
		}
		return low;
	}

	/**
	 * Return items within a range, optionally including comments.
	 * @private
	 * @param {number} start
	 * @param {number} end
	 * @param {boolean} includeComments
	 * @returns {Array}
	 */
	_itemsInRange(start, end, includeComments) {
		const idxStart = this._findIndexGE(start);
		const idxEnd = this._findIndexGE(end);
		const slice = this._items.slice(idxStart, idxEnd);
		if (!includeComments) {
			return slice.filter(item => !item.type.startsWith("Block") && !item.type.startsWith("Line"));
		}
		return slice;
	}

	/**
	 * Return items before a node or token.
	 * @private
	 * @param {Node|Token} nodeOrToken
	 * @param {number} count
	 * @param {boolean} includeComments
	 * @param {function} filter
	 * @returns {Array}
	 */
	_itemsBefore(nodeOrToken, count, includeComments, filter) {
		const start = nodeOrToken.range[0];
		const idx = this._findIndexGE(start);
		const slice = this._items.slice(Math.max(0, idx - count), idx);
		return this._filterItems(slice, includeComments, filter);
	}

	/**
	 * Return items after a node or token.
	 * @private
	 * @param {Node|Token} nodeOrToken
	 * @param {number} count
	 * @param {boolean} includeComments
	 * @param {function} filter
	 * @returns {Array}
	 */
	_itemsAfter(nodeOrToken, count, includeComments, filter) {
		const end = nodeOrToken.range[1];
		const idx = this._findIndexGE(end);
		const slice = this._items.slice(idx, idx + count);
		return this._filterItems(slice, includeComments, filter);
	}

	/**
	 * Apply includeComments and filter to a slice of items.
	 * @private
	 * @param {Array} items
	 * @param {boolean} includeComments
	 * @param {function} filter
	 * @returns {Array}
	 */
	_filterItems(items, includeComments, filter) {
		let result = items;
		if (!includeComments) {
			result = result.filter(item => !item.type.startsWith("Block") && !item.type.startsWith("Line"));
		}
		if (filter) {
			result = result.filter(filter);
		}
		return result;
	}

	/**
	 * Normalize arguments for methods that accept either a number
	 * or an options object.
	 * @private
	 * @param {any} arg1
	 * @param {any} arg2
	 * @returns {{count:number, options:Object}}
	 */
	_normalizeCountOptions(arg1, arg2) {
		if (typeof arg1 === "number") {
			return { count: arg1, options: arg2 || {} };
		}
		return { count: 0, options: arg1 || {} };
	}

	/**
	 * Get tokens (and optionally comments) within a node, with optional
	 * padding before and after.
	 * @param {Node} node
	 * @param {number|Object} countBeforeOrOptions
	 * @param {number} [countAfter]
	 * @param {Object} [options]
	 * @returns {Array}
	 */
	getTokens(node, countBeforeOrOptions, countAfter, options) {
		const { count: countBefore, options: opt1 } = this._normalizeCountOptions(countBeforeOrOptions, countAfter);
		const countAfterVal = typeof countAfter === "number" ? countAfter : 0;
		const opts = typeof options === "object" ? options : opt1;
		const includeComments = !!opts.includeComments;
		const filter = opts.filter;

		const startIdx = this._findIndexGE(node.range[0]);
		const endIdx = this._findIndexGE(node.range[1]);

		const before = this._items.slice(Math.max(0, startIdx - countBefore), startIdx);
		const within = this._items.slice(startIdx, endIdx);
		const after = this._items.slice(endIdx, endIdx + countAfterVal);

		const result = [...before, ...within, ...after];
		return this._filterItems(result, includeComments, filter);
	}

	/**
	 * Get tokens before a node or token.
	 * @param {Node|Token} nodeOrToken
	 * @param {number|Object} countOrOptions
	 * @returns {Array}
	 */
	getTokensBefore(nodeOrToken, countOrOptions) {
		const { count, options } = this._normalizeCountOptions(countOrOptions);
		const includeComments = !!options.includeComments;
		const filter = options.filter;
		return this._itemsBefore(nodeOrToken, count, includeComments, filter);
	}

	/**
	 * Get a single token before a node or token.
	 * @param {Node|Token} nodeOrToken
	 * @param {number|Object} countOrOptions
	 * @returns {Token|null}
	 */
	getTokenBefore(nodeOrToken, countOrOptions) {
		const items = this.getTokensBefore(nodeOrToken, countOrOptions);
		return items.length ? items[items.length - 1] : null;
	}

	/**
	 * Get tokens after a node or token.
	 * @param {Node|Token} nodeOrToken
	 * @param {number|Object} countOrOptions
	 * @returns {Array}
	 */
	getTokensAfter(nodeOrToken, countOrOptions) {
		const { count, options } = this._normalizeCountOptions(countOrOptions);
		const includeComments = !!options.includeComments;
		const filter = options.filter;
		return this._itemsAfter(nodeOrToken, count, includeComments, filter);
	}

	/**
	 * Get a single token after a node or token.
	 * @param {Node|Token} nodeOrToken
	 * @param {number|Object} countOrOptions
	 * @returns {Token|null}
	 */
	getTokenAfter(nodeOrToken, countOrOptions) {
		const items = this.getTokensAfter(nodeOrToken, countOrOptions);
		return items.length ? items[0] : null;
	}

	/**
	 * Get first tokens from a node's token stream.
	 * @param {Node} node
	 * @param {number|Object} countOrOptions
	 * @returns {Array}
	 */
	getFirstTokens(node, countOrOptions) {
		const { count, options } = this._normalizeCountOptions(countOrOptions);
		const includeComments = !!options.includeComments;
		const filter = options.filter;
		const items = this._itemsInRange(node.range[0], node.range[1], includeComments);
		const result = count ? items.slice(0, count) : items;
		return this._filterItems(result, includeComments, filter);
	}

	/**
	 * Get the first token from a node's token stream.
	 * @param {Node} node
	 * @param {number|Object} countOrOptions
	 * @returns {Token|null}
	 */
	getFirstToken(node, countOrOptions) {
		const items = this.getFirstTokens(node, countOrOptions);
		return items.length ? items[0] : null;
	}

	/**
	 * Get last tokens from a node's token stream.
	 * @param {Node} node
	 * @param {number|Object} countOrOptions
	 * @returns {Array}
	 */
	getLastTokens(node, countOrOptions) {
		const { count, options } = this._normalizeCountOptions(countOrOptions);
		const includeComments = !!options.includeComments;
		const filter = options.filter;
		const items = this._itemsInRange(node.range[0], node.range[1], includeComments);
		const result = count ? items.slice(-count) : items;
		return this._filterItems(result, includeComments, filter);
	}

	/**
	 * Get the last token from a node's token stream.
	 * @param {Node} node
	 * @param {number|Object} countOrOptions
	 * @returns {Token|null}
	 */
	getLastToken(node, countOrOptions) {
		const items = this.getLastTokens(node, countOrOptions);
		return items.length ? items[items.length - 1] : null;
	}

	/**
	 * Get tokens between two nodes or tokens.
	 * @param {Node|Token} left
	 * @param {Node|Token} right
	 * @param {number|Object} countOrOptions
	 * @returns {Array}
	 */
	getTokensBetween(left, right, countOrOptions) {
		const { count, options } = this._normalizeCountOptions(countOrOptions);
		const includeComments = !!options.includeComments;
		const filter = options.filter;
		const start = left.range[1];
		const end = right.range[0];
		const items = this._itemsInRange(start, end, includeComments);
		const result = count ? items.slice(0, count) : items;
		return this._filterItems(result, includeComments, filter);
	}

	/**
	 * Get the first token between two nodes or tokens.
	 * @param {Node|Token} left
	 * @param {Node|Token} right
	 * @param {number|Object} countOrOptions
	 * @returns {Token|null}
	 */
	getFirstTokenBetween(left, right, countOrOptions) {
		const items = this.getTokensBetween(left, right, countOrOptions);
		return items.length ? items[0] : null;
	}

	/**
	 * Get the last token between two nodes or tokens.
	 * @param {Node|Token} left
	 * @param {Node|Token} right
	 * @param {number|Object} countOrOptions
	 * @returns {Token|null}
	 */
	getLastTokenBetween(left, right, countOrOptions) {
		const items = this.getTokensBetween(left, right, countOrOptions);
		return items.length ? items[items.length - 1] : null;
	}

	/**
	 * Get the first token from a node or token.
	 * @param {Node|Token} nodeOrToken
	 * @returns {Token|null}
	 */
	getTokenByRangeStart(index, options = {}) {
		const includeComments = !!options.includeComments;
		for (const item of this._items) {
			if (item.range[0] === index) {
				if (!includeComments && (item.type.startsWith("Block") || item.type.startsWith("Line"))) {
					return null;
				}
				return item;
			}
		}
		return null;
	}

	/**
	 * Determine if any comments exist between two tokens.
	 * @param {Token} left
	 * @param {Token} right
	 * @returns {boolean}
	 */
	commentsExistBetween(left, right) {
		for (const comment of this.comments) {
			if (comment.range[0] >= left.range[1] && comment.range[1] <= right.range[0]) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Get comments before a node or token.
	 * @param {Node|Token} nodeOrToken
	 * @returns {Array}
	 */
	getCommentsBefore(nodeOrToken) {
		const start = nodeOrToken.range[0];
		const idx = this._findIndexGE(start);
		const slice = this._items.slice(0, idx);
		return slice.filter(item => item.type.startsWith("Block") || item.type.startsWith("Line"));
	}

	/**
	 * Get comments after a node or token.
	 * @param {Node|Token} nodeOrToken
	 * @returns {Array}
	 */
	getCommentsAfter(nodeOrToken) {
		const end = nodeOrToken.range[1];
		const idx = this._findIndexGE(end);
		const slice = this._items.slice(idx);
		return slice.filter(item => item.type.startsWith("Block") || item.type.startsWith("Line"));
	}

	/**
	 * Get comments inside a node.
	 * @param {Node} node
	 * @returns {Array}
	 */
	getCommentsInside(node) {
		const start = node.range[0];
		const end = node.range[1];
		const idxStart = this._findIndexGE(start);
		const idxEnd = this._findIndexGE(end);
		const slice = this._items.slice(idxStart, idxEnd);
		return slice.filter(item => item.type.startsWith("Block") || item.type.startsWith("Line"));
	}
}

module.exports = TokenStore;

/* ------------------------------------------------------------------
 * Tests for TokenStore class.
 * ------------------------------------------------------------------ */

const DEFAULT_CONFIG = {
	loc: true,
	range: true,
	tokens: true,
	comment: true,
};

const SOURCE_CODE =
		"/*A*/var answer/*B*/=/*C*/a/*D*/* b/*E*///F\n    call();\n/*Z*/",
	AST = espree.parse(SOURCE_CODE, DEFAULT_CONFIG),
	TOKENS = AST.tokens,
	COMMENTS = AST.comments,
	Program = AST,
	VariableDeclaration = Program.body[0],
	VariableDeclarator = VariableDeclaration.declarations[0],
	BinaryExpression = VariableDeclarator.init,
	CallExpression = Program.body[1].expression;

// Helper
function check(tokens, expected) {
	const length = tokens.length;
	assert.strictEqual(length, expected.length);
	for (let i = 0; i < length; i++) {
		assert.strictEqual(tokens[i].value, expected[i]);
	}
}

describe("TokenStore", () => {
	const store = new TokenStore(TOKENS, COMMENTS);

	describe("when calling getTokens", () => {
		it("should retrieve all tokens for root node", () => {
			check(store.getTokens(Program), [
				"var",
				"answer",
				"=",
				"a",
				"*",
				"b",
				"call",
				"(",
				")",
				";",
			]);
		});

		it("should retrieve all tokens for binary expression", () => {
			check(store.getTokens(BinaryExpression), ["a", "*", "b"]);
		});

		it("should retrieve all tokens plus one before for binary expression", () => {
			check(store.getTokens(BinaryExpression, 1), ["=", "a", "*", "b"]);
		});

		it("should retrieve all tokens plus one after for binary expression", () => {
			check(store.getTokens(BinaryExpression, 0, 1), [
				"a",
				"*",
				"b",
				"call",
			]);
		});

		it("should retrieve all tokens plus two before and one after for binary expression", () => {
			check(store.getTokens(BinaryExpression, 2, 1), [
				"answer",
				"=",
				"a",
				"*",
				"b",
				"call",
			]);
		});

		it("should retrieve all matched tokens for root node with filter", () => {
			check(
				store.getTokens(Program, t => t.type === "Identifier"),
				["answer", "a", "b", "call"],
			);
			check(
				store.getTokens(Program, {
					filter: t => t.type === "Identifier",
				}),
				["answer", "a", "b", "call"],
			);
		});

		it("should retrieve all tokens and comments in the node for root node with includeComments option", () => {
			check(store.getTokens(Program, { includeComments: true }), [
				"A",
				"var",
				"answer",
				"B",
				"=",
				"C",
				"a",
				"D",
				"*",
				"b",
				"E",
				"F",
				"call",
				"(",
				")",
				";",
				"Z",
			]);
		});

		it("should retrieve matched tokens and comments in the node for root node with includeComments and filter options", () => {
			check(
				store.getTokens(Program, {
					includeComments: true,
					filter: t => t.type.startsWith("Block"),
				}),
				["A", "B", "C", "D", "E", "Z"],
			);
		});

		it("should retrieve all tokens and comments in the node for binary expression with includeComments option", () => {
			check(
				store.getTokens(BinaryExpression, { includeComments: true }),
				["a", "D", "*", "b"],
			);
		});

		it("should retrieve tokens and comments from Program with leading and trailing comments and whitespace", () => {
			const code = " /*A*/ bar /*Z*/ ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(tokenStore.getTokens(ast), ["bar"]);
			check(tokenStore.getTokens(ast, { includeComments: true }), [
				"A",
				"bar",
				"Z",
			]);
		});
	});

	describe("when calling getTokensBefore", () => {
		it("should retrieve zero tokens before a node", () => {
			check(store.getTokensBefore(BinaryExpression, 0), []);
		});

		it("should retrieve one token before a node", () => {
			check(store.getTokensBefore(BinaryExpression, 1), ["="]);
		});

		it("should retrieve more than one token before a node", () => {
			check(store.getTokensBefore(BinaryExpression, 2), ["answer", "="]);
		});

		it("should retrieve all tokens before a node", () => {
			check(store.getTokensBefore(BinaryExpression, 9e9), [
				"var",
				"answer",
				"=",
			]);
		});

		it("should retrieve more than one token before a node with count option", () => {
			check(store.getTokensBefore(BinaryExpression, { count: 2 }), [
				"answer",
				"=",
			]);
		});

		it("should retrieve matched tokens before a node with count and filter options", () => {
			check(
				store.getTokensBefore(BinaryExpression, {
					count: 1,
					filter: t => t.value !== "=",
				}),
				["answer"],
			);
		});

		it("should retrieve all matched tokens before a node with filter option", () => {
			check(
				store.getTokensBefore(BinaryExpression, {
					filter: t => t.value !== "answer",
				}),
				["var", "="],
			);
		});

		it("should retrieve no tokens before the root node", () => {
			check(store.getTokensBefore(Program, { count: 1 }), []);
		});

		it("should retrieve tokens and comments before a node with count and includeComments option", () => {
			check(
				store.getTokensBefore(BinaryExpression, {
					count: 3,
					includeComments: true,
				}),
				["B", "=", "C"],
			);
		});

		it("should retrieve all tokens and comments before a node with includeComments option only", () => {
			check(
				store.getTokensBefore(BinaryExpression, {
					includeComments: true,
				}),
				["A", "var", "answer", "B", "=", "C"],
			);
		});

		it("should retrieve all tokens and comments before a node with includeComments and filter options", () => {
			check(
				store.getTokensBefore(BinaryExpression, {
					includeComments: true,
					filter: t => t.type.startsWith("Block"),
				}),
				["A", "B", "C"],
			);
		});

		it("should retrieve no tokens before Program when it starts with whitespace", () => {
			const code = " bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(tokenStore.getTokensBefore(ast, 1), []);
		});

		it("should retrieve no tokens before Program when it starts with a comment", () => {
			const code = "/*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(tokenStore.getTokensBefore(ast, 1), []);
		});

		it("should retrieve no tokens before Program when it starts with whitespace and a comment", () => {
			const code = " /*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(
				tokenStore.getTokensBefore(ast, {
					count: 1,
					includeComments: true,
				}),
				[],
			);
		});
	});

	describe("when calling getTokenBefore", () => {
		it("should retrieve one token before a node", () => {
			assert.strictEqual(
				store.getTokenBefore(BinaryExpression).value,
				"=",
			);
		});

		it("should skip a given number of tokens", () => {
			assert.strictEqual(
				store.getTokenBefore(BinaryExpression, 1).value,
				"answer",
			);
			assert.strictEqual(
				store.getTokenBefore(BinaryExpression, 2).value,
				"var",
			);
		});

		it("should skip a given number of tokens with skip option", () => {
			assert.strictEqual(
				store.getTokenBefore(BinaryExpression, { skip: 1 }).value,
				"answer",
			);
			assert.strictEqual(
				store.getTokenBefore(BinaryExpression, { skip: 2 }).value,
				"var",
			);
		});

		it("should retrieve matched token with filter option", () => {
			assert.strictEqual(
				store.getTokenBefore(BinaryExpression, t => t.value !== "=")
					.value,
				"answer",
			);
		});

		it("should retrieve matched token with skip and filter options", () => {
			assert.strictEqual(
				store.getTokenBefore(BinaryExpression, {
					skip: 1,
					filter: t => t.value !== "=",
				}).value,
				"var",
			);
		});

		it("should retrieve one token or comment before a node with includeComments option", () => {
			assert.strictEqual(
				store.getTokenBefore(BinaryExpression, {
					includeComments: true,
				}).value,
				"C",
			);
		});

		it("should retrieve one token or comment before a node with includeComments and skip options", () => {
			assert.strictEqual(
				store.getTokenBefore(BinaryExpression, {
					includeComments: true,
					skip: 1,
				}).value,
				"=",
			);
		});

		it("should retrieve one token or comment before a node with includeComments and skip and filter options", () => {
			assert.strictEqual(
				store.getTokenBefore(BinaryExpression, {
					includeComments: true,
					skip: 1,
					filter: t => t.type.startsWith("Block"),
				}).value,
				"B",
			);
		});

		it("should retrieve the previous node if the comment at the end of source code is specified.", () => {
			const code = "a + b /*comment*/";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = tokenStore.getTokenBefore(ast.comments[0]);

			assert.strictEqual(token.value, "b");
		});

		it("should retrieve the previous comment if the first token is specified.", () => {
			const code = "/*comment*/ a + b";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = tokenStore.getTokenBefore(ast.tokens[0], {
				includeComments: true,
			});

			assert.strictEqual(token.value, "comment");
		});

		it("should retrieve null if the first comment is specified.", () => {
			const code = "/*comment*/ a + b";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = tokenStore.getTokenBefore(ast.comments[0], {
				includeComments: true,
			});

			assert.strictEqual(token, null);
		});

		it("should retrieve null before Program when it starts with whitespace", () => {
			const code = " bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(tokenStore.getTokenBefore(ast), null);
		});

		it("should retrieve null before Program when it starts with a comment", () => {
			const code = "/*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(tokenStore.getTokenBefore(ast), null);
		});

		it("should retrieve null before Program when it starts with whitespace and a comment", () => {
			const code = " /*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(
				tokenStore.getTokenBefore(ast, { includeComments: true }),
				null,
			);
		});
	});

	describe("when calling getTokensAfter", () => {
		it("should retrieve zero tokens after a node", () => {
			check(store.getTokensAfter(VariableDeclarator.id, 0), []);
		});

		it("should retrieve one token after a node", () => {
			check(store.getTokensAfter(VariableDeclarator.id, 1), ["="]);
		});

		it("should retrieve more than one token after a node", () => {
			check(store.getTokensAfter(VariableDeclarator.id, 2), ["=", "a"]);
		});

		it("should retrieve all tokens after a node", () => {
			check(store.getTokensAfter(VariableDeclarator.id, 9e9), [
				"=",
				"a",
				"*",
				"b",
				"call",
				"(",
				")",
				";",
			]);
		});

		it("should retrieve more than one token after a node with count option", () => {
			check(store.getTokensAfter(VariableDeclarator.id, { count: 2 }), [
				"=",
				"a",
			]);
		});

		it("should retrieve all matched tokens after a node with filter option", () => {
			check(
				store.getTokensAfter(VariableDeclarator.id, {
					filter: t => t.type === "Identifier",
				}),
				["a", "b", "call"],
			);
		});

		it("should retrieve matched tokens after a node with count and filter options", () => {
			check(
				store.getTokensAfter(VariableDeclarator.id, {
					count: 2,
					filter: t => t.type === "Identifier",
				}),
				["a", "b"],
			);
		});

		it("should retrieve all tokens and comments after a node with includeComments option", () => {
			check(
				store.getTokensAfter(VariableDeclarator.id, {
					includeComments: true,
				}),
				[
					"B",
					"=",
					"C",
					"a",
					"D",
					"*",
					"b",
					"E",
					"F",
					"call",
					"(",
					")",
					";",
					"Z",
				],
			);
		});

		it("should retrieve several tokens and comments after a node with includeComments and count options", () => {
			check(
				store.getTokensAfter(VariableDeclarator.id, {
					includeComments: true,
					count: 3,
				}),
				["B", "=", "C"],
			);
		});

		it("should retrieve matched tokens and comments after a node with includeComments and count and filter options", () => {
			check(
				store.getTokensAfter(VariableDeclarator.id, {
					includeComments: true,
					count: 3,
					filter: t => t.type.startsWith("Block"),
				}),
				["B", "C", "D"],
			);
		});

		it("should retrieve no tokens after Program when it ends with whitespace", () => {
			const code = "bar ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(tokenStore.getTokensAfter(ast, 1), []);
		});

		it("should retrieve no tokens after Program when it ends with a comment", () => {
			const code = "bar /*comment*/";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(tokenStore.getTokensAfter(ast, 1), []);
		});

		it("should retrieve no tokens after Program when it ends with a comment and whitespace", () => {
			const code = "bar /*comment*/ ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(
				tokenStore.getTokensAfter(ast, {
					count: 1,
					includeComments: true,
				}),
				[],
			);
		});
	});

	describe("when calling getTokenAfter", () => {
		it("should retrieve one token after a node", () => {
			assert.strictEqual(
				store.getTokenAfter(VariableDeclarator.id).value,
				"=",
			);
		});

		it("should skip a given number of tokens", () => {
			assert.strictEqual(
				store.getTokenAfter(VariableDeclarator.id, 1).value,
				"a",
			);
			assert.strictEqual(
				store.getTokenAfter(VariableDeclarator.id, 2).value,
				"*",
			);
		});

		it("should skip a given number of tokens with skip option", () => {
			assert.strictEqual(
				store.getTokenAfter(VariableDeclarator.id, { skip: 1 }).value,
				"a",
			);
			assert.strictEqual(
				store.getTokenAfter(VariableDeclarator.id, { skip: 2 }).value,
				"*",
			);
		});

		it("should retrieve matched token with filter option", () => {
			assert.strictEqual(
				store.getTokenAfter(
					VariableDeclarator.id,
					t => t.type === "Identifier",
				).value,
				"a",
			);
			assert.strictEqual(
				store.getTokenAfter(VariableDeclarator.id, {
					filter: t => t.type === "Identifier",
				}).value,
				"a",
			);
		});

		it("should retrieve matched token with filter and skip options", () => {
			assert.strictEqual(
				store.getTokenAfter(VariableDeclarator.id, {
					skip: 1,
					filter: t => t.type === "Identifier",
				}).value,
				"b",
			);
		});

		it("should retrieve one token or comment after a node with includeComments option", () => {
			assert.strictEqual(
				store.getTokenAfter(VariableDeclarator.id, {
					includeComments: true,
				}).value,
				"B",
			);
		});

		it("should retrieve one token or comment after a node with includeComments and skip options", () => {
			assert.strictEqual(
				store.getTokenAfter(VariableDeclarator.id, {
					includeComments: true,
					skip: 2,
				}).value,
				"C",
			);
		});

		it("should retrieve one token or comment after a node with includeComments and skip and filter options", () => {
			assert.strictEqual(
				store.getTokenAfter(VariableDeclarator.id, {
					includeComments: true,
					skip: 2,
					filter: t => t.type.startsWith("Block"),
				}).value,
				"D",
			);
		});

		it("should retrieve the next node if the comment at the first of source code is specified.", () => {
			const code = "/*comment*/ a + b";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = tokenStore.getTokenAfter(ast.comments[0]);

			assert.strictEqual(token.value, "a");
		});

		it("should retrieve the next comment if the last token is specified.", () => {
			const code = "a + b /*comment*/";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = tokenStore.getTokenAfter(ast.tokens[2], {
				includeComments: true,
			});

			assert.strictEqual(token.value, "comment");
		});

		it("should retrieve null if the last comment is specified.", () => {
			const code = "a + b /*comment*/";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = tokenStore.getTokenAfter(ast.comments[0], {
				includeComments: true,
			});

			assert.strictEqual(token, null);
		});

		it("should retrieve null after Program when it ends with whitespace", () => {
			const code = "bar ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(tokenStore.getTokenAfter(ast), null);
		});

		it("should retrieve null after Program when it ends with a comment", () => {
			const code = "bar /*comment*/";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(tokenStore.getTokenAfter(ast), null);
		});

		it("should retrieve null after Program when it ends with a comment and whitespace", () => {
			const code = "bar /*comment*/ ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(
				tokenStore.getTokenAfter(ast, { includeComments: true }),
				null,
			);
		});
	});

	describe("when calling getFirstTokens", () => {
		it("should retrieve zero tokens from a node's token stream", () => {
			check(store.getFirstTokens(BinaryExpression, 0), []);
		});

		it("should retrieve one token from a node's token stream", () => {
			check(store.getFirstTokens(BinaryExpression, 1), ["a"]);
		});

		it("should retrieve more than one token from a node's token stream", () => {
			check(store.getFirstTokens(BinaryExpression, 2), ["a", "*"]);
		});

		it("should retrieve all tokens from a node's token stream", () => {
			check(store.getFirstTokens(BinaryExpression, 9e9), ["a", "*", "b"]);
		});

		it("should retrieve more than one token from a node's token stream with count option", () => {
			check(store.getFirstTokens(BinaryExpression, { count: 2 }), [
				"a",
				"*",
			]);
		});

		it("should retrieve matched tokens from a node's token stream with filter option", () => {
			check(
				store.getFirstTokens(
					BinaryExpression,
					t => t.type === "Identifier",
				),
				["a", "b"],
			);
			check(
				store.getFirstTokens(BinaryExpression, {
					filter: t => t.type === "Identifier",
				}),
				["a", "b"],
			);
		});

		it("should retrieve matched tokens from a node's token stream with filter and count options", () => {
			check(
				store.getFirstTokens(BinaryExpression, {
					count: 1,
					filter: t => t.type === "Identifier",
				}),
				["a"],
			);
		});

		it("should retrieve all tokens and comments from a node's token stream with includeComments option", () => {
			check(
				store.getFirstTokens(BinaryExpression, {
					includeComments: true,
				}),
				["a", "D", "*", "b"],
			);
		});

		it("should retrieve several tokens and comments from a node's token stream with includeComments and count options", () => {
			check(
				store.getFirstTokens(BinaryExpression, {
					includeComments: true,
					count: 3,
				}),
				["a", "D", "*"],
			);
		});

		it("should retrieve several tokens and comments from a node's token stream with includeComments and count and filter options", () => {
			check(
				store.getFirstTokens(BinaryExpression, {
					includeComments: true,
					count: 3,
					filter: t => t.value !== "a",
				}),
				["D", "*", "b"],
			);
		});

		it("should retrieve the first token from Program when it starts with whitespace", () => {
			const code = " bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(tokenStore.getFirstTokens(ast, 1), ["bar"]);
		});

		it("should retrieve the first token from Program when it starts with a comment", () => {
			const code = "/*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(tokenStore.getFirstTokens(ast, 1), ["bar"]);
		});

		it("should retrieve the first token/comment from Program when it starts with whitespace and a comment", () => {
			const code = " /*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(
				tokenStore.getFirstTokens(ast, {
					count: 2,
					includeComments: true,
				}),
				["comment", "bar"],
			);
		});
	});

	describe("when calling getFirstToken", () => {
		it("should retrieve the first token of a node's token stream", () => {
			assert.strictEqual(
				store.getFirstToken(BinaryExpression).value,
				"a",
			);
		});

		it("should skip a given number of tokens", () => {
			assert.strictEqual(
				store.getFirstToken(BinaryExpression, 1).value,
				"*",
			);
			assert.strictEqual(
				store.getFirstToken(BinaryExpression, 2).value,
				"b",
			);
		});

		it("should skip a given number of tokens with skip option", () => {
			assert.strictEqual(
				store.getFirstToken(BinaryExpression, { skip: 1 }).value,
				"*",
			);
			assert.strictEqual(
				store.getFirstToken(BinaryExpression, { skip: 2 }).value,
				"b",
			);
		});

		it("should retrieve matched token with filter option", () => {
			assert.strictEqual(
				store.getFirstToken(
					BinaryExpression,
					t => t.type === "Identifier",
				).value,
				"a",
			);
			assert.strictEqual(
				store.getFirstToken(BinaryExpression, {
					filter: t => t.type === "Identifier",
				}).value,
				"a",
			);
		});

		it("should retrieve matched token with filter and skip options", () => {
			assert.strictEqual(
				store.getFirstToken(BinaryExpression, {
					skip: 1,
					filter: t => t.type === "Identifier",
				}).value,
				"b",
			);
		});

		it("should retrieve the first token or comment of a node's token stream with includeComments option", () => {
			assert.strictEqual(
				store.getFirstToken(BinaryExpression, { includeComments: true })
					.value,
				"a",
			);
		});

		it("should retrieve the first matched token or comment of a node's token stream with includeComments and skip options", () => {
			assert.strictEqual(
				store.getFirstToken(BinaryExpression, {
					includeComments: true,
					skip: 1,
				}).value,
				"D",
			);
		});

		it("should retrieve the first matched token or comment of a node's token stream with includeComments and skip and filter options", () => {
			assert.strictEqual(
				store.getFirstToken(BinaryExpression, {
					includeComments: true,
					skip: 1,
					filter: t => t.value !== "a",
				}).value,
				"*",
			);
		});

		it("should retrieve the first comment if the comment is at the last of nodes", () => {
			const code = "a + b\n/*comment*/ c + d";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);

			/*
			 * A node must not start with a token: it can start with a comment or be empty.
			 * This test case is needed for completeness.
			 */
			const token = tokenStore.getFirstToken(
				{ range: [ast.comments[0].range[0], ast.tokens[5].range[1]] },
				{ includeComments: true },
			);

			assert.strictEqual(token.value, "comment");
		});

		it("should retrieve the first token (without includeComments option) if the comment is at the last of nodes", () => {
			const code = "a + b\n/*comment*/ c + d";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);

			/*
			 * A node must not start with a token: it can start with a comment or be empty.
			 * This test case is needed for completeness.
			 */
			const token = tokenStore.getFirstToken({
				range: [ast.comments[0].range[0], ast.tokens[5].range[1]],
			});

			assert.strictEqual(token.value, "c");
		});

		it("should retrieve the first token if the root node contains a trailing comment", () => {
			const parser = require("../../../../fixtures/parsers/all-comments-parser");
			const code = "foo // comment";
			const ast = parser.parse(code, {
				loc: true,
				range: true,
				tokens: true,
				comment: true,
			});
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = tokenStore.getFirstToken(ast);

			assert.strictEqual(token, ast.tokens[0]);
		});

		it("should return null if the source contains only comments", () => {
			const code = "// comment";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = tokenStore.getFirstToken(ast, {
				filter() {
					assert.fail("Unexpected call to filter callback");
				},
			});

			assert.strictEqual(token, null);
		});

		it("should return null if the source is empty", () => {
			const code = "";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = tokenStore.getFirstToken(ast);

			assert.strictEqual(token, null);
		});

		it("should retrieve the first token from Program when it starts with whitespace", () => {
			const code = " bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(tokenStore.getFirstToken(ast).value, "bar");
		});

		it("should retrieve the first token from Program when it starts with a comment", () => {
			const code = "/*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(tokenStore.getFirstToken(ast).value, "bar");
		});

		it("should retrieve the first token from Program when it starts with whitespace and a comment", () => {
			const code = " /*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(
				tokenStore.getFirstToken(ast, { includeComments: true }).value,
				"comment",
			);
		});
	});

	describe("when calling getLastTokens", () => {
		it("should retrieve zero tokens from the end of a node's token stream", () => {
			check(store.getLastTokens(BinaryExpression, 0), []);
		});

		it("should retrieve one token from the end of a node's token stream", () => {
			check(store.getLastTokens(BinaryExpression, 1), ["b"]);
		});

		it("should retrieve more than one token from the end of a node's token stream", () => {
			check(store.getLastTokens(BinaryExpression, 2), ["*", "b"]);
		});

		it("should retrieve all tokens from the end of a node's token stream", () => {
			check(store.getLastTokens(BinaryExpression, 9e9), ["a", "*", "b"]);
		});

		it("should retrieve more than one token from the end of a node's token stream with count option", () => {
			check(store.getLastTokens(BinaryExpression, { count: 2 }), [
				"*",
				"b",
			]);
		});

		it("should retrieve matched tokens from the end of a node's token stream with filter option", () => {
			check(
				store.getLastTokens(
					BinaryExpression,
					t => t.type === "Identifier",
				),
				["a", "b"],
			);
			check(
				store.getLastTokens(BinaryExpression, {
					filter: t => t.type === "Identifier",
				}),
				["a", "b"],
			);
		});

		it("should retrieve matched tokens from the end of a node's token stream with filter and count options", () => {
			check(
				store.getLastTokens(BinaryExpression, {
					count: 1,
					filter: t => t.type === "Identifier",
				}),
				["b"],
			);
		});

		it("should retrieve all tokens from the end of a node's token stream with includeComments option", () => {
			check(
				store.getLastTokens(BinaryExpression, {
					includeComments: true,
				}),
				["a", "D", "*", "b"],
			);
		});

		it("should retrieve matched tokens from the end of a node's token stream with includeComments and count options", () => {
			check(
				store.getLastTokens(BinaryExpression, {
					includeComments: true,
					count: 3,
				}),
				["D", "*", "b"],
			);
		});

		it("should retrieve matched tokens from the end of a node's token stream with includeComments and count and filter options", () => {
			check(
				store.getLastTokens(BinaryExpression, {
					includeComments: true,
					count: 3,
					filter: t => t.type !== "Punctuator",
				}),
				["a", "D", "b"],
			);
		});

		it("should retrieve the last token from Program when it ends with whitespace", () => {
			const code = "bar ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(tokenStore.getLastTokens(ast, 1), ["bar"]);
		});

		it("should retrieve the last token from Program when it ends with a comment", () => {
			const code = "bar /*comment*/";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(tokenStore.getLastTokens(ast, 1), ["bar"]);
		});

		it("should retrieve the last token/comment from Program when it ends with a comment and whitespace", () => {
			const code = "bar /*comment*/ ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(
				tokenStore.getLastTokens(ast, {
					count: 2,
					includeComments: true,
				}),
				["bar", "comment"],
			);
		});
	});

	describe("when calling getLastToken", () => {
		it("should retrieve the last token of a node's token stream", () => {
			assert.strictEqual(store.getLastToken(BinaryExpression).value, "b");
			assert.strictEqual(
				store.getLastToken(VariableDeclaration).value,
				"b",
			);
		});

		it("should skip a given number of tokens", () => {
			assert.strictEqual(
				store.getLastToken(BinaryExpression, 1).value,
				"*",
			);
			assert.strictEqual(
				store.getLastToken(BinaryExpression, 2).value,
				"a",
			);
		});

		it("should skip a given number of tokens with skip option", () => {
			assert.strictEqual(
				store.getLastToken(BinaryExpression, { skip: 1 }).value,
				"*",
			);
			assert.strictEqual(
				store.getLastToken(BinaryExpression, { skip: 2 }).value,
				"a",
			);
		});

		it("should retrieve the last matched token of a node's token stream with filter option", () => {
			assert.strictEqual(
				store.getLastToken(BinaryExpression, t => t.value !== "b")
					.value,
				"*",
			);
			assert.strictEqual(
				store.getLastToken(BinaryExpression, {
					filter: t => t.value !== "b",
				}).value,
				"*",
			);
		});

		it("should retrieve the last matched token of a node's token stream with filter and skip options", () => {
			assert.strictEqual(
				store.getLastToken(BinaryExpression, {
					skip: 1,
					filter: t => t.type === "Identifier",
				}).value,
				"a",
			);
		});

		it("should retrieve the last token of a node's token stream with includeComments option", () => {
			assert.strictEqual(
				store.getLastToken(BinaryExpression, { includeComments: true })
					.value,
				"b",
			);
		});

		it("should retrieve the last token of a node's token stream with includeComments and skip options", () => {
			assert.strictEqual(
				store.getLastToken(BinaryExpression, {
					includeComments: true,
					skip: 2,
				}).value,
				"D",
			);
		});

		it("should retrieve the last token of a node's token stream with includeComments and skip and filter options", () => {
			assert.strictEqual(
				store.getLastToken(BinaryExpression, {
					includeComments: true,
					skip: 1,
					filter: t => t.type !== "Identifier",
				}).value,
				"D",
			);
		});

		it("should retrieve the last comment if the comment is at the last of nodes", () => {
			const code = "a + b /*comment*/\nc + d";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);

			/*
			 * A node must not end with a token: it can end with a comment or be empty.
			 * This test case is needed for completeness.
			 */
			const token = tokenStore.getLastToken(
				{ range: [ast.tokens[0].range[0], ast.comments[0].range[1]] },
				{ includeComments: true },
			);

			assert.strictEqual(token.value, "comment");
		});

		it("should retrieve the last token (without includeComments option) if the comment is at the last of nodes", () => {
			const code = "a + b /*comment*/\nc + d";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);

			/*
			 * A node must not end with a token: it can end with a comment or be empty.
			 * This test case is needed for completeness.
			 */
			const token = tokenStore.getLastToken({
				range: [ast.tokens[0].range[0], ast.comments[0].range[1]],
			});

			assert.strictEqual(token.value, "b");
		});

		it("should retrieve the last token if the root node contains a trailing comment", () => {
			const parser = require("../../../../fixtures/parsers/all-comments-parser");
			const code = "foo // comment";
			const ast = parser.parse(code, {
				loc: true,
				range: true,
				tokens: true,
				comment: true,
			});
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = tokenStore.getLastToken(ast);

			assert.strictEqual(token, ast.tokens[0]);
		});

		it("should retrieve the last token from Program when it ends with whitespace", () => {
			const code = "bar ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(tokenStore.getLastToken(ast).value, "bar");
		});

		it("should retrieve the last token from Program when it ends with a comment", () => {
			const code = "bar /*comment*/";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(tokenStore.getLastToken(ast).value, "bar");
		});

		it("should retrieve the last token from Program when it ends with a comment and whitespace", () => {
			const code = "bar /*comment*/ ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(
				tokenStore.getLastToken(ast, { includeComments: true }).value,
				"comment",
			);
		});

		it("should return null if the source contains only comments", () => {
			const code = "// comment";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = tokenStore.getLastToken(ast, {
				filter() {
					assert.fail("Unexpected call to filter callback");
				},
			});

			assert.strictEqual(token, null);
		});

		it("should return null if the source is empty", () => {
			const code = "";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = tokenStore.getLastToken(ast);

			assert.strictEqual(token, null);
		});
	});

	describe("when calling getFirstTokensBetween", () => {
		it("should retrieve zero tokens between adjacent nodes", () => {
			check(
				store.getFirstTokensBetween(BinaryExpression, CallExpression),
				[],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with count option", () => {
			check(
				store.getFirstTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					2,
				),
				["=", "a"],
			);
			check(
				store.getFirstTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ count: 2 },
				),
				["=", "a"],
			);
		});

		it("should retrieve matched tokens between non-adjacent nodes with filter option", () => {
			check(
				store.getFirstTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ filter: t => t.type !== "Punctuator" },
				),
				["a"],
			);
		});

		it("should retrieve all tokens between non-adjacent nodes with empty object option", () => {
			check(
				store.getFirstTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{},
				),
				["=", "a", "*"],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with includeComments option", () => {
			check(
				store.getFirstTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true },
				),
				["B", "=", "C", "a", "D", "*"],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with includeComments and count options", () => {
			check(
				store.getFirstTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true, count: 3 },
				),
				["B", "=", "C"],
			);
		});

		it("should retrieve multiple tokens and comments between non-adjacent nodes with includeComments and filter options", () => {
			check(
				store.getFirstTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{
						includeComments: true,
						filter: t => t.type !== "Punctuator",
					},
				),
				["B", "C", "a", "D"],
			);
		});
	});

	describe("when calling getFirstTokenBetween", () => {
		it("should return null between adjacent nodes", () => {
			assert.strictEqual(
				store.getFirstTokenBetween(BinaryExpression, CallExpression),
				null,
			);
		});

		it("should retrieve one token between non-adjacent nodes with count option", () => {
			assert.strictEqual(
				store.getFirstTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
				).value,
				"=",
			);
		});

		it("should retrieve one token between non-adjacent nodes with skip option", () => {
			assert.strictEqual(
				store.getFirstTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					1,
				).value,
				"a",
			);
			assert.strictEqual(
				store.getFirstTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ skip: 2 },
				).value,
				"*",
			);
		});

		it("should return null if it's skipped beyond the right token", () => {
			assert.strictEqual(
				store.getFirstTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ skip: 3 },
				),
				null,
			);
			assert.strictEqual(
				store.getFirstTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ skip: 4 },
				),
				null,
			);
		});

		it("should retrieve the first matched token between non-adjacent nodes with filter option", () => {
			assert.strictEqual(
				store.getFirstTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ filter: t => t.type !== "Identifier" },
				).value,
				"=",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments option", () => {
			assert.strictEqual(
				store.getFirstTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true },
				).value,
				"B",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip options", () => {
			assert.strictEqual(
				store.getFirstTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true, skip: 1 },
				).value,
				"=",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip and filter options", () => {
			assert.strictEqual(
				store.getFirstTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{
						includeComments: true,
						skip: 1,
						filter: t => t.type !== "Punctuator",
					},
				).value,
				"C",
			);
		});
	});

	describe("when calling getLastTokensBetween", () => {
		it("should retrieve zero tokens between adjacent nodes", () => {
			check(
				store.getLastTokensBetween(BinaryExpression, CallExpression),
				[],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with count option", () => {
			check(
				store.getLastTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					2,
				),
				["a", "*"],
			);
			check(
				store.getLastTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ count: 2 },
				),
				["a", "*"],
			);
		});

		it("should retrieve matched tokens between non-adjacent nodes with filter option", () => {
			check(
				store.getLastTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ filter: t => t.type !== "Punctuator" },
				),
				["a"],
			);
		});

		it("should retrieve all tokens between non-adjacent nodes with empty object option", () => {
			check(
				store.getLastTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{},
				),
				["=", "a", "*"],
			);
		});

		it("should retrieve all tokens and comments between non-adjacent nodes with includeComments option", () => {
			check(
				store.getLastTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true },
				),
				["B", "=", "C", "a", "D", "*"],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with includeComments and count options", () => {
			check(
				store.getLastTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true, count: 3 },
				),
				["a", "D", "*"],
			);
		});

		it("should retrieve multiple tokens and comments between non-adjacent nodes with includeComments and filter options", () => {
			check(
				store.getLastTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{
						includeComments: true,
						filter: t => t.type !== "Punctuator",
					},
				),
				["B", "C", "a", "D"],
			);
		});
	});

	describe("when calling getLastTokenBetween", () => {
		it("should return null between adjacent nodes", () => {
			assert.strictEqual(
				store.getLastTokenBetween(BinaryExpression, CallExpression),
				null,
			);
		});

		it("should retrieve one token between non-adjacent nodes with count option", () => {
			assert.strictEqual(
				store.getLastTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
				).value,
				"*",
			);
		});

		it("should retrieve one token between non-adjacent nodes with skip option", () => {
			assert.strictEqual(
				store.getLastTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					1,
				).value,
				"a",
			);
			assert.strictEqual(
				store.getLastTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ skip: 2 },
				).value,
				"=",
			);
		});

		it("should return null if it's skipped beyond the right token", () => {
			assert.strictEqual(
				store.getLastTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ skip: 3 },
				),
				null,
			);
			assert.strictEqual(
				store.getLastTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ skip: 4 },
				),
				null,
			);
		});

		it("should retrieve the first matched token between non-adjacent nodes with filter option", () => {
			assert.strictEqual(
				store.getLastTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ filter: t => t.type !== "Identifier" },
				).value,
				"*",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments option", () => {
			assert.strictEqual(
				store.getLastTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true },
				).value,
				"*",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip options", () => {
			assert.strictEqual(
				store.getLastTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true, skip: 1 },
				).value,
				"D",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip and filter options", () => {
			assert.strictEqual(
				store.getLastTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{
						includeComments: true,
						skip: 1,
						filter: t => t.type !== "Punctuator",
					},
				).value,
				"a",
			);
		});
	});

	describe("when calling getTokensBetween", () => {
		it("should retrieve zero tokens between adjacent nodes", () => {
			check(store.getTokensBetween(BinaryExpression, CallExpression), []);
		});

		it("should retrieve one token between nodes", () => {
			check(
				store.getTokensBetween(
					BinaryExpression.left,
					BinaryExpression.right,
				),
				["*"],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes", () => {
			check(
				store.getTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
				),
				["=", "a", "*"],
			);
		});

		it("should retrieve surrounding tokens when asked for padding", () => {
			check(
				store.getTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.left,
					2,
				),
				["var", "answer", "=", "a", "*"],
			);
		});
	});

	describe("when calling getTokenByRangeStart", () => {
		it("should return identifier token", () => {
			const result = store.getTokenByRangeStart(9);

			assert.strictEqual(result.type, "Identifier");
			assert.strictEqual(result.value, "answer");
		});

		it("should return null when token doesn't exist", () => {
			const result = store.getTokenByRangeStart(10);

			assert.isNull(result);
		});

		it("should return a comment token when includeComments is true", () => {
			const result = store.getTokenByRangeStart(15, {
				includeComments: true,
			});

			assert.strictEqual(result.type, "Block");
			assert.strictEqual(result.value, "B");
		});

		it("should not return a comment token at the supplied index when includeComments is false", () => {
			const result = store.getTokenByRangeStart(15, {
				includeComments: false,
			});

			assert.isNull(result);
		});

		it("should not return comment tokens by default", () => {
			const result = store.getTokenByRangeStart(15);

			assert.isNull(result);
		});
	});

	describe("when calling getFirstToken & getTokenAfter", () => {
		it("should retrieve all tokens and comments in the node", () => {
			const code = "(function(a, /*b,*/ c){})";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const tokens = [];
			let token = tokenStore.getFirstToken(ast);

			while (token) {
				tokens.push(token);
				token = tokenStore.getTokenAfter(token, {
					includeComments: true,
				});
			}

			check(tokens, [
				"(",
				"function",
				"(",
				"a",
				",",
				"b,",
				"c",
				")",
				"{",
				"}",
				")",
			]);
		});

		it("should retrieve all tokens and comments in the node (no spaces)", () => {
			const code = "(function(a,/*b,*/c){})";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const tokens = [];
			let token = tokenStore.getFirstToken(ast);

			while (token) {
				tokens.push(token);
				token = tokenStore.getTokenAfter(token, {
					includeComments: true,
				});
			}

			check(tokens, [
				"(",
				"function",
				"(",
				"a",
				",",
				"b,",
				"c",
				")",
				"{",
				"}",
				")",
			]);
		});
	});

	describe("when calling getLastToken & getTokenBefore", () => {
		it("should retrieve all tokens and comments in the node", () => {
			const code = "(function(a, /*b,*/ c){})";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const tokens = [];
			let token = tokenStore.getLastToken(ast);

			while (token) {
				tokens.push(token);
				token = tokenStore.getTokenBefore(token, {
					includeComments: true,
				});
			}

			check(tokens.reverse(), [
				"(",
				"function",
				"(",
				"a",
				",",
				"b,",
				"c",
				"",
			]);
		});

		it("should retrieve all tokens and comments in the node (no spaces)", () => {
			const code = "(function(a,/*b,*/c){})";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const tokens = [];
			let token = tokenStore.getLastToken(ast);

			while (token) {
				tokens.push(token);
				token = tokenStore.getTokenBefore(token, {
					includeComments: true,
				});
			}

			check(tokens.reverse(), [
				"(",
				"function",
				"(",
				"a",
				",",
				"b,",
				"c",
				")",
				"{",
				"}",
				")",
			]);
		});
	});

	describe("when calling commentsExistBetween", () => {
		it("should retrieve false if comments don't exist", () => {
			assert.isFalse(
				store.commentsExistBetween(AST.tokens[0], AST.tokens[1]),
			);
		});

		it("should retrieve true if comments exist", () => {
			assert.isTrue(
				store.commentsExistBetween(AST.tokens[1], AST.tokens[2]),
			);
		});
	});

	describe("getCommentsBefore", () => {
		it("should retrieve comments before a node", () => {
			assert.strictEqual(
				store.getCommentsBefore(VariableDeclaration)[0].value,
				"A",
			);
		});

		it("should retrieve comments before a token", () => {
			assert.strictEqual(
				store.getCommentsBefore(TOKENS[2] /* "=" token */)[0].value,
				"B",
			);
		});

		it("should retrieve multiple comments before a node", () => {
			const comments = store.getCommentsBefore(CallExpression);

			assert.strictEqual(comments.length, 2);
			assert.strictEqual(comments[0].value, "E");
			assert.strictEqual(comments[1].value, "F");
		});

		it("should return an empty array for a Program node", () => {
			check(store.getCommentsBefore(Program), []);
		});

		it("should return an empty array if there are no comments before a node or token", () => {
			check(store.getCommentsBefore(BinaryExpression.right), []);
			check(store.getCommentsBefore(TOKENS[1]), []);
		});

		it("should retrieve no comments before Program when it starts with whitespace and a comment", () => {
			const code = " /*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(tokenStore.getCommentsBefore(ast), []);
		});
	});

	describe("getCommentsAfter", () => {
		it("should retrieve comments after a node", () => {
			assert.strictEqual(
				store.getCommentsAfter(VariableDeclarator.id)[0].value,
				"B",
			);
		});

		it("should retrieve comments after a token", () => {
			assert.strictEqual(
				store.getCommentsAfter(TOKENS[2] /* "=" token */)[0].value,
				"C",
			);
		});

		it("should retrieve multiple comments after a node", () => {
			const comments = store.getCommentsAfter(VariableDeclaration);

			assert.strictEqual(comments.length, 2);
			assert.strictEqual(comments[0].value, "E");
			assert.strictEqual(comments[1].value, "F");
		});

		it("should return an empty array for a Program node", () => {
			check(store.getCommentsAfter(Program), []);
		});

		it("should return an empty array if there are no comments after a node or token", () => {
			check(store.getCommentsAfter(CallExpression.callee), []);
			check(store.getCommentsAfter(TOKENS[0]), []);
		});

		it("should retrieve no comments after Program when it ends with a comment and whitespace", () => {
			const code = "bar /*comment*/ ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(tokenStore.getCommentsAfter(ast), []);
		});
	});

	describe("getCommentsInside", () => {
		it("should retrieve comments inside a node", () => {
			check(store.getCommentsInside(Program), [
				"A",
				"B",
				"C",
				"D",
				"E",
				"F",
				"Z",
			]);
			check(store.getCommentsInside(VariableDeclaration), [
				"B",
				"C",
				"D",
			]);
			check(store.getCommentsInside(VariableDeclarator), ["B", "C", "D"]);
			check(store.getCommentsInside(BinaryExpression), ["D"]);
		});

		it("should return an empty array if a node does not contain any comments", () => {
			check(store.getCommentsInside(TOKENS[2]), []);
		});
	});
});