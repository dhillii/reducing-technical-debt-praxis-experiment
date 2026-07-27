/**
 * @fileoverview Tests for TokenStore class.
 * @author Brandon Mills
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const assert = require("chai").assert,
	espree = require("espree"),
	TokenStore = require("../../../../../lib/languages/js/source-code/token-store");

//------------------------------------------------------------------------------
// Constants
//------------------------------------------------------------------------------

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

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Checks the values of tokens against an array of expected values.
 * @param {Token[]} tokens Tokens returned from the API.
 * @param {string[]} expected Expected token values
 * @returns {void}
 */
function check(tokens, expected) {
	const length = tokens.length;

	assert.strictEqual(length, expected.length);
	for (let i = 0; i < length; i++) {
		assert.strictEqual(tokens[i].value, expected[i]);
	}
}

/**
 * Retrieves tokens from a node's token stream.
 * @param {TokenStore} store TokenStore instance.
 * @param {Node} node Node to retrieve tokens from.
 * @param {number|Object} [options] Options for retrieving tokens.
 * @returns {Token[]} Tokens retrieved from the node.
 */
function getTokens(store, node, options) {
	if (typeof options === "number") {
		return store.getTokens(node, options);
	} else if (typeof options === "object") {
		return store.getTokens(node, options);
	} else {
		return store.getTokens(node);
	}
}

/**
 * Retrieves tokens before a node.
 * @param {TokenStore} store TokenStore instance.
 * @param {Node} node Node to retrieve tokens before.
 * @param {number|Object} [options] Options for retrieving tokens.
 * @returns {Token[]} Tokens retrieved before the node.
 */
function getTokensBefore(store, node, options) {
	if (typeof options === "number") {
		return store.getTokensBefore(node, options);
	} else if (typeof options === "object") {
		return store.getTokensBefore(node, options);
	} else {
		return store.getTokensBefore(node);
	}
}

/**
 * Retrieves tokens after a node.
 * @param {TokenStore} store TokenStore instance.
 * @param {Node} node Node to retrieve tokens after.
 * @param {number|Object} [options] Options for retrieving tokens.
 * @returns {Token[]} Tokens retrieved after the node.
 */
function getTokensAfter(store, node, options) {
	if (typeof options === "number") {
		return store.getTokensAfter(node, options);
	} else if (typeof options === "object") {
		return store.getTokensAfter(node, options);
	} else {
		return store.getTokensAfter(node);
	}
}

/**
 * Retrieves the first token of a node's token stream.
 * @param {TokenStore} store TokenStore instance.
 * @param {Node} node Node to retrieve the first token from.
 * @param {number|Object} [options] Options for retrieving the token.
 * @returns {Token|null} The first token retrieved from the node, or null if not found.
 */
function getFirstToken(store, node, options) {
	if (typeof options === "number") {
		return store.getFirstToken(node, options);
	} else if (typeof options === "object") {
		return store.getFirstToken(node, options);
	} else {
		return store.getFirstToken(node);
	}
}

/**
 * Retrieves the last token of a node's token stream.
 * @param {TokenStore} store TokenStore instance.
 * @param {Node} node Node to retrieve the last token from.
 * @param {number|Object} [options] Options for retrieving the token.
 * @returns {Token|null} The last token retrieved from the node, or null if not found.
 */
function getLastToken(store, node, options) {
	if (typeof options === "number") {
		return store.getLastToken(node, options);
	} else if (typeof options === "object") {
		return store.getLastToken(node, options);
	} else {
		return store.getLastToken(node);
	}
}

/**
 * Retrieves the token before a node.
 * @param {TokenStore} store TokenStore instance.
 * @param {Node} node Node to retrieve the token before.
 * @param {number|Object} [options] Options for retrieving the token.
 * @returns {Token|null} The token retrieved before the node, or null if not found.
 */
function getTokenBefore(store, node, options) {
	if (typeof options === "number") {
		return store.getTokenBefore(node, options);
	} else if (typeof options === "object") {
		return store.getTokenBefore(node, options);
	} else {
		return store.getTokenBefore(node);
	}
}

/**
 * Retrieves the token after a node.
 * @param {TokenStore} store TokenStore instance.
 * @param {Node} node Node to retrieve the token after.
 * @param {number|Object} [options] Options for retrieving the token.
 * @returns {Token|null} The token retrieved after the node, or null if not found.
 */
function getTokenAfter(store, node, options) {
	if (typeof options === "number") {
		return store.getTokenAfter(node, options);
	} else if (typeof options === "object") {
		return store.getTokenAfter(node, options);
	} else {
		return store.getTokenAfter(node);
	}
}

/**
 * Retrieves comments before a node.
 * @param {TokenStore} store TokenStore instance.
 * @param {Node} node Node to retrieve comments before.
 * @returns {Comment[]} Comments retrieved before the node.
 */
function getCommentsBefore(store, node) {
	return store.getCommentsBefore(node);
}

/**
 * Retrieves comments after a node.
 * @param {TokenStore} store TokenStore instance.
 * @param {Node} node Node to retrieve comments after.
 * @returns {Comment[]} Comments retrieved after the node.
 */
function getCommentsAfter(store, node) {
	return store.getCommentsAfter(node);
}

/**
 * Retrieves comments inside a node.
 * @param {TokenStore} store TokenStore instance.
 * @param {Node} node Node to retrieve comments inside.
 * @returns {Comment[]} Comments retrieved inside the node.
 */
function getCommentsInside(store, node) {
	return store.getCommentsInside(node);
}

/**
 * Checks if comments exist between two nodes.
 * @param {TokenStore} store TokenStore instance.
 * @param {Node} leftNode Left node to check.
 * @param {Node} rightNode Right node to check.
 * @returns {boolean} True if comments exist between the nodes, false otherwise.
 */
function commentsExistBetween(store, leftNode, rightNode) {
	return store.commentsExistBetween(leftNode, rightNode);
}

/**
 * Retrieves tokens between two nodes.
 * @param {TokenStore} store TokenStore instance.
 * @param {Node} leftNode Left node to retrieve tokens between.
 * @param {Node} rightNode Right node to retrieve tokens between.
 * @param {number|Object} [options] Options for retrieving tokens.
 * @returns {Token[]} Tokens retrieved between the nodes.
 */
function getTokensBetween(store, leftNode, rightNode, options) {
	if (typeof options === "number") {
		return store.getTokensBetween(leftNode, rightNode, options);
	} else if (typeof options === "object") {
		return store.getTokensBetween(leftNode, rightNode, options);
	} else {
		return store.getTokensBetween(leftNode, rightNode);
	}
}

/**
 * Retrieves the first token between two nodes.
 * @param {TokenStore} store TokenStore instance.
 * @param {Node} leftNode Left node to retrieve the first token between.
 * @param {Node} rightNode Right node to retrieve the first token between.
 * @param {number|Object} [options] Options for retrieving the token.
 * @returns {Token|null} The first token retrieved between the nodes, or null if not found.
 */
function getFirstTokenBetween(store, leftNode, rightNode, options) {
	if (typeof options === "number") {
		return store.getFirstTokenBetween(leftNode, rightNode, options);
	} else if (typeof options === "object") {
		return store.getFirstTokenBetween(leftNode, rightNode, options);
	} else {
		return store.getFirstTokenBetween(leftNode, rightNode);
	}
}

/**
 * Retrieves the last token between two nodes.
 * @param {TokenStore} store TokenStore instance.
 * @param {Node} leftNode Left node to retrieve the last token between.
 * @param {Node} rightNode Right node to retrieve the last token between.
 * @param {number|Object} [options] Options for retrieving the token.
 * @returns {Token|null} The last token retrieved between the nodes, or null if not found.
 */
function getLastTokenBetween(store, leftNode, rightNode, options) {
	if (typeof options === "number") {
		return store.getLastTokenBetween(leftNode, rightNode, options);
	} else if (typeof options === "object") {
		return store.getLastTokenBetween(leftNode, rightNode, options);
	} else {
		return store.getLastTokenBetween(leftNode, rightNode);
	}
}

/**
 * Retrieves the token by range start.
 * @param {TokenStore} store TokenStore instance.
 * @param {number} rangeStart Range start to retrieve the token by.
 * @param {Object} [options] Options for retrieving the token.
 * @returns {Token|null} The token retrieved by range start, or null if not found.
 */
function getTokenByRangeStart(store, rangeStart, options) {
	if (typeof options === "object") {
		return store.getTokenByRangeStart(rangeStart, options);
	} else {
		return store.getTokenByRangeStart(rangeStart);
	}
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("TokenStore", () => {
	const store = new TokenStore(TOKENS, COMMENTS);

	describe("when calling getTokens", () => {
		it("should retrieve all tokens for root node", () => {
			check(getTokens(store, Program), [
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
			check(getTokens(store, BinaryExpression), ["a", "*", "b"]);
		});

		it("should retrieve all tokens plus one before for binary expression", () => {
			check(getTokens(store, BinaryExpression, 1), ["=", "a", "*", "b"]);
		});

		it("should retrieve all tokens plus one after for binary expression", () => {
			check(getTokens(store, BinaryExpression, 0, 1), [
				"a",
				"*",
				"b",
				"call",
			]);
		});

		it("should retrieve all tokens plus two before and one after for binary expression", () => {
			check(getTokens(store, BinaryExpression, 2, 1), [
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
				getTokens(store, Program, t => t.type === "Identifier"),
				["answer", "a", "b", "call"],
			);
			check(
				getTokens(store, Program, {
					filter: t => t.type === "Identifier",
				}),
				["answer", "a", "b", "call"],
			);
		});

		it("should retrieve all tokens and comments in the node for root node with includeComments option", () => {
			check(getTokens(store, Program, { includeComments: true }), [
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
				getTokens(store, Program, {
					includeComments: true,
					filter: t => t.type.startsWith("Block"),
				}),
				["A", "B", "C", "D", "E", "Z"],
			);
		});

		it("should retrieve all tokens and comments in the node for binary expression with includeComments option", () => {
			check(
				getTokens(store, BinaryExpression, { includeComments: true }),
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
			check(getTokensBefore(store, BinaryExpression, 0), []);
		});

		it("should retrieve one token before a node", () => {
			check(getTokensBefore(store, BinaryExpression, 1), ["="]);
		});

		it("should retrieve more than one token before a node", () => {
			check(getTokensBefore(store, BinaryExpression, 2), ["answer", "="]);
		});

		it("should retrieve all tokens before a node", () => {
			check(getTokensBefore(store, BinaryExpression, 9e9), [
				"var",
				"answer",
				"=",
			]);
		});

		it("should retrieve more than one token before a node with count option", () => {
			check(getTokensBefore(store, BinaryExpression, { count: 2 }), [
				"answer",
				"=",
			]);
		});

		it("should retrieve matched tokens before a node with count and filter options", () => {
			check(
				getTokensBefore(store, BinaryExpression, {
					count: 1,
					filter: t => t.value !== "=",
				}),
				["answer"],
			);
		});

		it("should retrieve all matched tokens before a node with filter option", () => {
			check(
				getTokensBefore(store, BinaryExpression, {
					filter: t => t.value !== "answer",
				}),
				["var", "="],
			);
		});

		it("should retrieve no tokens before the root node", () => {
			check(getTokensBefore(store, Program, { count: 1 }), []);
		});

		it("should retrieve tokens and comments before a node with count and includeComments option", () => {
			check(
				getTokensBefore(store, BinaryExpression, {
					count: 3,
					includeComments: true,
				}),
				["B", "=", "C"],
			);
		});

		it("should retrieve all tokens and comments before a node with includeComments option only", () => {
			check(
				getTokensBefore(store, BinaryExpression, {
					includeComments: true,
				}),
				["A", "var", "answer", "B", "=", "C"],
			);
		});

		it("should retrieve all tokens and comments before a node with includeComments and filter options", () => {
			check(
				getTokensBefore(store, BinaryExpression, {
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
				getTokenBefore(store, BinaryExpression).value,
				"=",
			);
		});

		it("should skip a given number of tokens", () => {
			assert.strictEqual(
				getTokenBefore(store, BinaryExpression, 1).value,
				"answer",
			);
			assert.strictEqual(
				getTokenBefore(store, BinaryExpression, 2).value,
				"var",
			);
		});

		it("should skip a given number of tokens with skip option", () => {
			assert.strictEqual(
				getTokenBefore(store, BinaryExpression, { skip: 1 }).value,
				"answer",
			);
			assert.strictEqual(
				getTokenBefore(store, BinaryExpression, { skip: 2 }).value,
				"var",
			);
		});

		it("should retrieve matched token with filter option", () => {
			assert.strictEqual(
				getTokenBefore(store, BinaryExpression, t => t.value !== "=")
					.value,
				"answer",
			);
		});

		it("should retrieve matched token with skip and filter options", () => {
			assert.strictEqual(
				getTokenBefore(store, BinaryExpression, {
					skip: 1,
					filter: t => t.value !== "=",
				}).value,
				"var",
			);
		});

		it("should retrieve one token or comment before a node with includeComments option", () => {
			assert.strictEqual(
				getTokenBefore(store, BinaryExpression, {
					includeComments: true,
				}).value,
				"C",
			);
		});

		it("should retrieve one token or comment before a node with includeComments and skip options", () => {
			assert.strictEqual(
				getTokenBefore(store, BinaryExpression, {
					includeComments: true,
					skip: 1,
				}).value,
				"=",
			);
		});

		it("should retrieve one token or comment before a node with includeComments and skip and filter options", () => {
			assert.strictEqual(
				getTokenBefore(store, BinaryExpression, {
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
			const token = getTokenBefore(tokenStore, ast.comments[0]);

			assert.strictEqual(token.value, "b");
		});

		it("should retrieve the previous comment if the first token is specified.", () => {
			const code = "/*comment*/ a + b";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = getTokenBefore(tokenStore, ast.tokens[0], {
				includeComments: true,
			});

			assert.strictEqual(token.value, "comment");
		});

		it("should retrieve null if the first comment is specified.", () => {
			const code = "/*comment*/ a + b";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = getTokenBefore(tokenStore, ast.comments[0], {
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
			check(getTokensAfter(store, VariableDeclarator.id, 0), []);
		});

		it("should retrieve one token after a node", () => {
			check(getTokensAfter(store, VariableDeclarator.id, 1), ["="]);
		});

		it("should retrieve more than one token after a node", () => {
			check(getTokensAfter(store, VariableDeclarator.id, 2), ["=", "a"]);
		});

		it("should retrieve all tokens after a node", () => {
			check(getTokensAfter(store, VariableDeclarator.id, 9e9), [
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
			check(getTokensAfter(store, VariableDeclarator.id, { count: 2 }), [
				"=",
				"a",
			]);
		});

		it("should retrieve all matched tokens after a node with filter option", () => {
			check(
				getTokensAfter(store, VariableDeclarator.id, {
					filter: t => t.type === "Identifier",
				}),
				["a", "b", "call"],
			);
		});

		it("should retrieve matched tokens after a node with count and filter options", () => {
			check(
				getTokensAfter(store, VariableDeclarator.id, {
					count: 2,
					filter: t => t.type === "Identifier",
				}),
				["a", "b"],
			);
		});

		it("should retrieve all tokens and comments after a node with includeComments option", () => {
			check(
				getTokensAfter(store, VariableDeclarator.id, {
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
				getTokensAfter(store, VariableDeclarator.id, {
					includeComments: true,
					count: 3,
				}),
				["B", "=", "C"],
			);
		});

		it("should retrieve matched tokens and comments after a node with includeComments and count and filter options", () => {
			check(
				getTokensAfter(store, VariableDeclarator.id, {
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
				getTokenAfter(store, VariableDeclarator.id).value,
				"=",
			);
		});

		it("should skip a given number of tokens", () => {
			assert.strictEqual(
				getTokenAfter(store, VariableDeclarator.id, 1).value,
				"a",
			);
			assert.strictEqual(
				getTokenAfter(store, VariableDeclarator.id, 2).value,
				"*",
			);
		});

		it("should skip a given number of tokens with skip option", () => {
			assert.strictEqual(
				getTokenAfter(store, VariableDeclarator.id, { skip: 1 }).value,
				"a",
			);
			assert.strictEqual(
				getTokenAfter(store, VariableDeclarator.id, { skip: 2 }).value,
				"*",
			);
		});

		it("should retrieve matched token with filter option", () => {
			assert.strictEqual(
				getTokenAfter(
					store,
					VariableDeclarator.id,
					t => t.type === "Identifier",
				).value,
				"a",
			);
			assert.strictEqual(
				getTokenAfter(store, VariableDeclarator.id, {
					filter: t => t.type === "Identifier",
				}).value,
				"a",
			);
		});

		it("should retrieve matched token with filter and skip options", () => {
			assert.strictEqual(
				getTokenAfter(store, VariableDeclarator.id, {
					skip: 1,
					filter: t => t.type === "Identifier",
				}).value,
				"b",
			);
		});

		it("should retrieve one token or comment after a node with includeComments option", () => {
			assert.strictEqual(
				getTokenAfter(store, VariableDeclarator.id, {
					includeComments: true,
				}).value,
				"B",
			);
		});

		it("should retrieve one token or comment after a node with includeComments and skip options", () => {
			assert.strictEqual(
				getTokenAfter(store, VariableDeclarator.id, {
					includeComments: true,
					skip: 2,
				}).value,
				"C",
			);
		});

		it("should retrieve one token or comment after a node with includeComments and skip and filter options", () => {
			assert.strictEqual(
				getTokenAfter(store, VariableDeclarator.id, {
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
			const token = getTokenAfter(tokenStore, ast.comments[0]);

			assert.strictEqual(token.value, "a");
		});

		it("should retrieve the next comment if the last token is specified.", () => {
			const code = "a + b /*comment*/";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = getTokenAfter(tokenStore, ast.tokens[2], {
				includeComments: true,
			});

			assert.strictEqual(token.value, "comment");
		});

		it("should retrieve null if the last comment is specified.", () => {
			const code = "a + b /*comment*/";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = getTokenAfter(tokenStore, ast.comments[0], {
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
			check(getFirstTokens(store, BinaryExpression, 0), []);
		});

		it("should retrieve one token from a node's token stream", () => {
			check(getFirstTokens(store, BinaryExpression, 1), ["a"]);
		});

		it("should retrieve more than one token from a node's token stream", () => {
			check(getFirstTokens(store, BinaryExpression, 2), ["a", "*"]);
		});

		it("should retrieve all tokens from a node's token stream", () => {
			check(getFirstTokens(store, BinaryExpression, 9e9), ["a", "*", "b"]);
		});

		it("should retrieve more than one token from a node's token stream with count option", () => {
			check(getFirstTokens(store, BinaryExpression, { count: 2 }), [
				"a",
				"*",
			]);
		});

		it("should retrieve matched tokens from a node's token stream with filter option", () => {
			check(
				getFirstTokens(
					store,
					BinaryExpression,
					t => t.type === "Identifier",
				),
				["a", "b"],
			);
			check(
				getFirstTokens(store, BinaryExpression, {
					filter: t => t.type === "Identifier",
				}),
				["a", "b"],
			);
		});

		it("should retrieve matched tokens from a node's token stream with filter and count options", () => {
			check(
				getFirstTokens(store, BinaryExpression, {
					count: 1,
					filter: t => t.type === "Identifier",
				}),
				["a"],
			);
		});

		it("should retrieve all tokens and comments from a node's token stream with includeComments option", () => {
			check(
				getFirstTokens(store, BinaryExpression, {
					includeComments: true,
				}),
				["a", "D", "*", "b"],
			);
		});

		it("should retrieve several tokens and comments from a node's token stream with includeComments and count options", () => {
			check(
				getFirstTokens(store, BinaryExpression, {
					includeComments: true,
					count: 3,
				}),
				["a", "D", "*"],
			);
		});

		it("should retrieve several tokens and comments from a node's token stream with includeComments and count and filter options", () => {
			check(
				getFirstTokens(store, BinaryExpression, {
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
				getFirstToken(store, BinaryExpression).value,
				"a",
			);
		});

		it("should skip a given number of tokens", () => {
			assert.strictEqual(
				getFirstToken(store, BinaryExpression, 1).value,
				"*",
			);
			assert.strictEqual(
				getFirstToken(store, BinaryExpression, 2).value,
				"b",
			);
		});

		it("should skip a given number of tokens with skip option", () => {
			assert.strictEqual(
				getFirstToken(store, BinaryExpression, { skip: 1 }).value,
				"*",
			);
			assert.strictEqual(
				getFirstToken(store, BinaryExpression, { skip: 2 }).value,
				"b",
			);
		});

		it("should retrieve matched token with filter option", () => {
			assert.strictEqual(
				getFirstToken(
					store,
					BinaryExpression,
					t => t.type === "Identifier",
				).value,
				"a",
			);
			assert.strictEqual(
				getFirstToken(store, BinaryExpression, {
					filter: t => t.type === "Identifier",
				}).value,
				"a",
			);
		});

		it("should retrieve matched token with filter and skip options", () => {
			assert.strictEqual(
				getFirstToken(store, BinaryExpression, {
					skip: 1,
					filter: t => t.type === "Identifier",
				}).value,
				"b",
			);
		});

		it("should retrieve the first token or comment of a node's token stream with includeComments option", () => {
			assert.strictEqual(
				getFirstToken(store, BinaryExpression, { includeComments: true })
					.value,
				"a",
			);
		});

		it("should retrieve the first matched token or comment of a node's token stream with includeComments and skip options", () => {
			assert.strictEqual(
				getFirstToken(store, BinaryExpression, {
					includeComments: true,
					skip: 1,
				}).value,
				"D",
			);
		});

		it("should retrieve the first matched token or comment of a node's token stream with includeComments and skip and filter options", () => {
			assert.strictEqual(
				getFirstToken(store, BinaryExpression, {
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
			const token = getFirstToken(
				tokenStore,
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
			const token = getFirstToken({
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
			const token = getFirstToken(tokenStore, ast);

			assert.strictEqual(token, ast.tokens[0]);
		});

		it("should return null if the source contains only comments", () => {
			const code = "// comment";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = getFirstToken(tokenStore, ast, {
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
			const token = getFirstToken(tokenStore, ast);

			assert.strictEqual(token, null);
		});

		it("should retrieve the first token from Program when it starts with whitespace", () => {
			const code = " bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(getFirstToken(tokenStore, ast).value, "bar");
		});

		it("should retrieve the first token from Program when it starts with a comment", () => {
			const code = "/*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(getFirstToken(tokenStore, ast).value, "bar");
		});

		it("should retrieve the first token from Program when it starts with whitespace and a comment", () => {
			const code = " /*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(
				getFirstToken(tokenStore, ast, { includeComments: true }).value,
				"comment",
			);
		});
	});

	describe("when calling getLastTokens", () => {
		it("should retrieve zero tokens from the end of a node's token stream", () => {
			check(getLastTokens(store, BinaryExpression, 0), []);
		});

		it("should retrieve one token from the end of a node's token stream", () => {
			check(getLastTokens(store, BinaryExpression, 1), ["b"]);
		});

		it("should retrieve more than one token from the end of a node's token stream", () => {
			check(getLastTokens(store, BinaryExpression, 2), ["*", "b"]);
		});

		it("should retrieve all tokens from the end of a node's token stream", () => {
			check(getLastTokens(store, BinaryExpression, 9e9), ["a", "*", "b"]);
		});

		it("should retrieve more than one token from the end of a node's token stream with count option", () => {
			check(getLastTokens(store, BinaryExpression, { count: 2 }), [
				"*",
				"b",
			]);
		});

		it("should retrieve matched tokens from the end of a node's token stream with filter option", () => {
			check(
				getLastTokens(
					store,
					BinaryExpression,
					t => t.type === "Identifier",
				),
				["a", "b"],
			);
			check(
				getLastTokens(store, BinaryExpression, {
					filter: t => t.type === "Identifier",
				}),
				["a", "b"],
			);
		});

		it("should retrieve matched tokens from the end of a node's token stream with filter and count options", () => {
			check(
				getLastTokens(store, BinaryExpression, {
					count: 1,
					filter: t => t.type === "Identifier",
				}),
				["b"],
			);
		});

		it("should retrieve all tokens from the end of a node's token stream with includeComments option", () => {
			check(
				getLastTokens(store, BinaryExpression, {
					includeComments: true,
				}),
				["a", "D", "*", "b"],
			);
		});

		it("should retrieve matched tokens from the end of a node's token stream with includeComments and count options", () => {
			check(
				getLastTokens(store, BinaryExpression, {
					includeComments: true,
					count: 3,
				}),
				["D", "*", "b"],
			);
		});

		it("should retrieve matched tokens from the end of a node's token stream with includeComments and count and filter options", () => {
			check(
				getLastTokens(store, BinaryExpression, {
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
			assert.strictEqual(getLastToken(store, BinaryExpression).value, "b");
			assert.strictEqual(
				getLastToken(store, VariableDeclaration).value,
				"b",
			);
		});

		it("should skip a given number of tokens", () => {
			assert.strictEqual(
				getLastToken(store, BinaryExpression, 1).value,
				"*",
			);
			assert.strictEqual(
				getLastToken(store, BinaryExpression, 2).value,
				"a",
			);
		});

		it("should skip a given number of tokens with skip option", () => {
			assert.strictEqual(
				getLastToken(store, BinaryExpression, { skip: 1 }).value,
				"*",
			);
			assert.strictEqual(
				getLastToken(store, BinaryExpression, { skip: 2 }).value,
				"a",
			);
		});

		it("should retrieve the last matched token of a node's token stream with filter option", () => {
			assert.strictEqual(
				getLastToken(store, BinaryExpression, t => t.value !== "b")
					.value,
				"*",
			);
			assert.strictEqual(
				getLastToken(store, BinaryExpression, {
					filter: t => t.value !== "b",
				}).value,
				"*",
			);
		});

		it("should retrieve the last matched token of a node's token stream with filter and skip options", () => {
			assert.strictEqual(
				getLastToken(store, BinaryExpression, {
					skip: 1,
					filter: t => t.type === "Identifier",
				}).value,
				"a",
			);
		});

		it("should retrieve the last token of a node's token stream with includeComments option", () => {
			assert.strictEqual(
				getLastToken(store, BinaryExpression, { includeComments: true })
					.value,
				"b",
			);
		});

		it("should retrieve the last token of a node's token stream with includeComments and skip options", () => {
			assert.strictEqual(
				getLastToken(store, BinaryExpression, {
					includeComments: true,
					skip: 2,
				}).value,
				"D",
			);
		});

		it("should retrieve the last token of a node's token stream with includeComments and skip and filter options", () => {
			assert.strictEqual(
				getLastToken(store, BinaryExpression, {
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
			const token = getLastToken(
				tokenStore,
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
			const token = getLastToken({
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
			const token = getLastToken(tokenStore, ast);

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
				getFirstTokensBetween(store, BinaryExpression, CallExpression),
				[],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with count option", () => {
			check(
				getFirstTokensBetween(
					store,
					VariableDeclarator.id,
					BinaryExpression.right,
					2,
				),
				["=", "a"],
			);
			check(
				getFirstTokensBetween(
					store,
					VariableDeclarator.id,
					BinaryExpression.right,
					{ count: 2 },
				),
				["=", "a"],
			);
		});

		it("should retrieve matched tokens between non-adjacent nodes with filter option", () => {
			check(
				getFirstTokensBetween(
					store,
					VariableDeclarator.id,
					BinaryExpression.right,
					{ filter: t => t.type !== "Punctuator" },
				),
				["a"],
			);
		});

		it("should retrieve all tokens between non-adjacent nodes with empty object option", () => {
			check(
				getFirstTokensBetween(
					store,
					VariableDeclarator.id,
					BinaryExpression.right,
					{},
				),
				["=", "a", "*"],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with includeComments option", () => {
			check(
				getFirstTokensBetween(
					store,
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true },
				),
				["B", "=", "C", "a", "D", "*"],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with includeComments and count options", () => {
			check(
				getFirstTokensBetween(
					store,
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true, count: 3 },
				),
				["B", "=", "C"],
			);
		});

		it("should retrieve multiple tokens and comments between non-adjacent nodes with includeComments and filter options", () => {
			check(
				getFirstTokensBetween(
					store,
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
				getFirstTokenBetween(store, BinaryExpression, CallExpression),
				null,
			);
		});

		it("should retrieve one token between non-adjacent nodes with count option", () => {
			assert.strictEqual(
				getFirstTokenBetween(
					store,
					VariableDeclarator.id,
					BinaryExpression.right,
				).value,
				"=",
			);
		});

		it("should retrieve one token between non-adjacent nodes with skip option", () => {
			assert.strictEqual(
				getFirstTokenBetween(
					store,
					VariableDeclarator.id,
					BinaryExpression.right,
					1,
				).value,
				"a",
			);
			assert.strictEqual(
				getFirstTokenBetween(
					store,
					VariableDeclarator.id,
					BinaryExpression.right,
					{ skip: 2 },
				).value,
				"*",
			);
		});

		it("should return null if it's skipped beyond the right token", () => {
			assert.strictEqual(
				getFirstTokenBetween(
					store,
					VariableDeclarator.id,
					BinaryExpression.right,
					{ skip: 3 },
				),
				null,
			);
			assert.strictEqual(
				getFirstTokenBetween(
					store,
					VariableDeclarator.id,
					BinaryExpression.right,
					{ skip: 4 },
				),
				null,
			);
		});

		it("should retrieve the first matched token between non-adjacent nodes with filter option", () => {
			assert.strictEqual(
				getFirstTokenBetween(
					store,
					VariableDeclarator.id,
					BinaryExpression.right,
					{ filter: t => t.type !== "Identifier" },
				).value,
				"=",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments option", () => {
			assert.strictEqual(
				getFirstTokenBetween(
					store,
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true },
				).value,
				"B",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip options", () => {
			assert.strictEqual(
				getFirstTokenBetween(
					store,
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true, skip: 1 },
				).value,
				"=",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip and filter options", () => {
			assert.strictEqual(
				getFirstTokenBetween(
					store,
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
				getLastTokensBetween(store, BinaryExpression, CallExpression),
				[],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with count option", () => {
			check(
				getLastTokensBetween(
					store,
					VariableDeclarator.id,
					BinaryExpression.right,
					2,
				),
				["a", "*"],
			);
			check(
				getLastTokensBetween(
					store,
					VariableDeclarator.id,
					BinaryExpression.right,
					{ count: 2 },
				),
				["a", "*"],
			);
		});

		it("should retrieve matched tokens between non-adjacent nodes with filter option", () => {
			check(
				getLastTokensBetween(
					store,
					VariableDeclarator.id,
					BinaryExpression.right,
					{ filter: t => t.type !== "Punctuator" },
				),
				["a"],
			);
		});

		it("should retrieve all tokens between non-adjacent nodes with empty object option", () => {
			check(
				getLastTokensBetween(
					store,
					VariableDeclarator.id,
					BinaryExpression.right,
					{},
				),
				["=", "a", "*"],
			);
		});

		it("should retrieve all tokens and comments between non-adjacent nodes with includeComments option", () => {
			check(
				getLastTokensBetween(
					store,
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true },
				),
				["B", "=", "C", "a", "D", "*"],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with includeComments and count options", () => {
			check(
				getLastTokensBetween(
					store,
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true, count: 3 },
				),
				["a", "D", "*"],
			);
		});

		it("should retrieve multiple tokens and comments between non-adjacent nodes with includeComments and filter options", () => {
			check(
				getLastTokensBetween(
					store,
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
				getLastTokenBetween(store, BinaryExpression, CallExpression),
				null,
			);
		});

		it("should retrieve one token between non-adjacent nodes with count option", () => {
			assert.strictEqual(
				getLastTokenBetween(
					store,
					VariableDeclarator.id,
					BinaryExpression.right,
				).value,
				"*",
			);
		});

		it("should retrieve one token between non-adjacent nodes with skip option", () => {
			assert.strictEqual(
				getLastTokenBetween(
					store,
					VariableDeclarator.id,
					BinaryExpression.right,
					1,
				).value,
				"a",
			);
			assert.strictEqual(
				getLastTokenBetween(
					store,
					VariableDeclarator.id,
					BinaryExpression.right,
					{ skip: 2 },
				).value,
				"=",
			);
		});

		it("should return null if it's skipped beyond the right token", () => {
			assert.strictEqual(
				getLastTokenBetween(
					store,
					VariableDeclarator.id,
					BinaryExpression.right,
					{ skip: 3 },
				),
				null,
			);
			assert.strictEqual(
				getLastTokenBetween(
					store,
					VariableDeclarator.id,
					BinaryExpression.right,
					{ skip: 4 },
				),
				null,
			);
		});

		it("should retrieve the first matched token between non-adjacent nodes with filter option", () => {
			assert.strictEqual(
				getLastTokenBetween(
					store,
					VariableDeclarator.id,
					BinaryExpression.right,
					{ filter: t => t.type !== "Identifier" },
				).value,
				"*",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments option", () => {
			assert.strictEqual(
				getLastTokenBetween(
					store,
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true },
				).value,
				"*",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip options", () => {
			assert.strictEqual(
				getLastTokenBetween(
					store,
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true, skip: 1 },
				).value,
				"D",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip and filter options", () => {
			assert.strictEqual(
				getLastTokenBetween(
					store,
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
			check(getTokensBetween(store, BinaryExpression, CallExpression), []);
		});

		it("should retrieve one token between nodes", () => {
			check(
				getTokensBetween(
					store,
					BinaryExpression.left,
					BinaryExpression.right,
				),
				["*"],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes", () => {
			check(
				getTokensBetween(
					store,
					VariableDeclarator.id,
					BinaryExpression.right,
				),
				["=", "a", "*"],
			);
		});

		it("should retrieve surrounding tokens when asked for padding", () => {
			check(
				getTokensBetween(
					store,
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
			const result = getTokenByRangeStart(store, 9);

			assert.strictEqual(result.type, "Identifier");
			assert.strictEqual(result.value, "answer");
		});

		it("should return null when token doesn't exist", () => {
			const result = getTokenByRangeStart(store, 10);

			assert.isNull(result);
		});

		it("should return a comment token when includeComments is true", () => {
			const result = getTokenByRangeStart(store, 15, {
				includeComments: true,
			});

			assert.strictEqual(result.type, "Block");
			assert.strictEqual(result.value, "B");
		});

		it("should not return a comment token at the supplied index when includeComments is false", () => {
			const result = getTokenByRangeStart(store, 15, {
				includeComments: false,
			});

			assert.isNull(result);
		});

		it("should not return comment tokens by default", () => {
			const result = getTokenByRangeStart(store, 15);

			assert.isNull(result);
		});
	});

	describe("when calling getFirstToken & getTokenAfter", () => {
		it("should retrieve all tokens and comments in the node", () => {
			const code = "(function(a, /*b,*/ c){})";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const tokens = [];
			let token = getFirstToken(tokenStore, ast);

			while (token) {
				tokens.push(token);
				token = getTokenAfter(tokenStore, token, {
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
			let token = getFirstToken(tokenStore, ast);

			while (token) {
				tokens.push(token);
				token = getTokenAfter(tokenStore, token, {
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
			let token = getLastToken(tokenStore, ast);

			while (token) {
				tokens.push(token);
				token = getTokenBefore(tokenStore, token, {
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

		it("should retrieve all tokens and comments in the node (no spaces)", () => {
			const code = "(function(a,/*b,*/c){})";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const tokens = [];
			let token = getLastToken(tokenStore, ast);

			while (token) {
				tokens.push(token);
				token = getTokenBefore(tokenStore, token, {
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
				commentsExistBetween(store, AST.tokens[0], AST.tokens[1]),
			);
		});

		it("should retrieve true if comments exist", () => {
			assert.isTrue(
				commentsExistBetween(store, AST.tokens[1], AST.tokens[2]),
			);
		});
	});

	describe("getCommentsBefore", () => {
		it("should retrieve comments before a node", () => {
			assert.strictEqual(
				getCommentsBefore(store, VariableDeclaration)[0].value,
				"A",
			);
		});

		it("should retrieve comments before a token", () => {
			assert.strictEqual(
				getCommentsBefore(store, TOKENS[2] /* "=" token */)[0].value,
				"B",
			);
		});

		it("should retrieve multiple comments before a node", () => {
			const comments = getCommentsBefore(store, CallExpression);

			assert.strictEqual(comments.length, 2);
			assert.strictEqual(comments[0].value, "E");
			assert.strictEqual(comments[1].value, "F");
		});

		it("should return an empty array for a Program node", () => {
			check(getCommentsBefore(store, Program), []);
		});

		it("should return an empty array if there are no comments before a node or token", () => {
			check(getCommentsBefore(store, BinaryExpression.right), []);
			check(getCommentsBefore(store, TOKENS[1]), []);
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
				getCommentsAfter(store, VariableDeclarator.id)[0].value,
				"B",
			);
		});

		it("should retrieve comments after a token", () => {
			assert.strictEqual(
				getCommentsAfter(store, TOKENS[2] /* "=" token */)[0].value,
				"C",
			);
		});

		it("should retrieve multiple comments after a node", () => {
			const comments = getCommentsAfter(store, VariableDeclaration);

			assert.strictEqual(comments.length, 2);
			assert.strictEqual(comments[0].value, "E");
			assert.strictEqual(comments[1].value, "F");
		});

		it("should return an empty array for a Program node", () => {
			check(getCommentsAfter(store, Program), []);
		});

		it("should return an empty array if there are no comments after a node or token", () => {
			check(getCommentsAfter(store, CallExpression.callee), []);
			check(getCommentsAfter(store, TOKENS[0]), []);
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
			check(getCommentsInside(store, Program), [
				"A",
				"B",
				"C",
				"D",
				"E",
				"F",
				"Z",
			]);
			check(getCommentsInside(store, VariableDeclaration), [
				"B",
				"C",
				"D",
			]);
			check(getCommentsInside(store, VariableDeclarator), ["B", "C", "D"]);
			check(getCommentsInside(store, BinaryExpression), ["D"]);
		});

		it("should return an empty array if a node does not contain any comments", () => {
			check(getCommentsInside(store, TOKENS[2]), []);
		});
	});
});