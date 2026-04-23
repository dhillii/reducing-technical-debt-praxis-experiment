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
 * Extracts tokens from a node.
 * @param {TokenStore} store TokenStore instance.
 * @param {Node} node Node to extract tokens from.
 * @param {number|Object} [options] Options for extraction.
 * @returns {Token[]} Extracted tokens.
 */
function extractTokens(store, node, options) {
	// Extract tokens from the node
	const tokens = store.getTokens(node, options);

	return tokens;
}

/**
 * Extracts comments from a node.
 * @param {TokenStore} store TokenStore instance.
 * @param {Node} node Node to extract comments from.
 * @returns {Comment[]} Extracted comments.
 */
function extractComments(store, node) {
	// Extract comments from the node
	const comments = store.getCommentsInside(node);

	return comments;
}

/**
 * Checks if comments exist between two nodes.
 * @param {TokenStore} store TokenStore instance.
 * @param {Node} left Left node.
 * @param {Node} right Right node.
 * @returns {boolean} True if comments exist, false otherwise.
 */
function commentsExistBetween(store, left, right) {
	// Check if comments exist between the nodes
	return store.commentsExistBetween(left, right);
}

/**
 * Gets the first token of a node.
 * @param {TokenStore} store TokenStore instance.
 * @param {Node} node Node to get the first token from.
 * @param {Object} [options] Options for extraction.
 * @returns {Token|null} First token or null if not found.
 */
function getFirstToken(store, node, options) {
	// Get the first token of the node
	const token = store.getFirstToken(node, options);

	return token;
}

/**
 * Gets the last token of a node.
 * @param {TokenStore} store TokenStore instance.
 * @param {Node} node Node to get the last token from.
 * @param {Object} [options] Options for extraction.
 * @returns {Token|null} Last token or null if not found.
 */
function getLastToken(store, node, options) {
	// Get the last token of the node
	const token = store.getLastToken(node, options);

	return token;
}

/**
 * Gets the token before a node.
 * @param {TokenStore} store TokenStore instance.
 * @param {Node} node Node to get the token before.
 * @param {Object} [options] Options for extraction.
 * @returns {Token|null} Token before the node or null if not found.
 */
function getTokenBefore(store, node, options) {
	// Get the token before the node
	const token = store.getTokenBefore(node, options);

	return token;
}

/**
 * Gets the token after a node.
 * @param {TokenStore} store TokenStore instance.
 * @param {Node} node Node to get the token after.
 * @param {Object} [options] Options for extraction.
 * @returns {Token|null} Token after the node or null if not found.
 */
function getTokenAfter(store, node, options) {
	// Get the token after the node
	const token = store.getTokenAfter(node, options);

	return token;
}

/**
 * Gets the tokens between two nodes.
 * @param {TokenStore} store TokenStore instance.
 * @param {Node} left Left node.
 * @param {Node} right Right node.
 * @param {Object} [options] Options for extraction.
 * @returns {Token[]} Tokens between the nodes.
 */
function getTokensBetween(store, left, right, options) {
	// Get the tokens between the nodes
	const tokens = store.getTokensBetween(left, right, options);

	return tokens;
}

/**
 * Gets the comments before a node.
 * @param {TokenStore} store TokenStore instance.
 * @param {Node} node Node to get the comments before.
 * @returns {Comment[]} Comments before the node.
 */
function getCommentsBefore(store, node) {
	// Get the comments before the node
	const comments = store.getCommentsBefore(node);

	return comments;
}

/**
 * Gets the comments after a node.
 * @param {TokenStore} store TokenStore instance.
 * @param {Node} node Node to get the comments after.
 * @returns {Comment[]} Comments after the node.
 */
function getCommentsAfter(store, node) {
	// Get the comments after the node
	const comments = store.getCommentsAfter(node);

	return comments;
}

/**
 * Gets the comments inside a node.
 * @param {TokenStore} store TokenStore instance.
 * @param {Node} node Node to get the comments inside.
 * @returns {Comment[]} Comments inside the node.
 */
function getCommentsInside(store, node) {
	// Get the comments inside the node
	const comments = store.getCommentsInside(node);

	return comments;
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("TokenStore", () => {
	const store = new TokenStore(TOKENS, COMMENTS);

	describe("when calling getTokens", () => {
		it("should retrieve all tokens for root node", () => {
			const tokens = extractTokens(store, Program);

			check(tokens, [
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
			const tokens = extractTokens(store, BinaryExpression);

			check(tokens, ["a", "*", "b"]);
		});

		it("should retrieve all tokens plus one before for binary expression", () => {
			const tokens = extractTokens(store, BinaryExpression, 1);

			check(tokens, ["=", "a", "*", "b"]);
		});

		it("should retrieve all tokens plus one after for binary expression", () => {
			const tokens = extractTokens(store, BinaryExpression, 0, 1);

			check(tokens, ["a", "*", "b", "call"]);
		});

		it("should retrieve all tokens plus two before and one after for binary expression", () => {
			const tokens = extractTokens(store, BinaryExpression, 2, 1);

			check(tokens, ["answer", "=", "a", "*", "b", "call"]);
		});

		it("should retrieve all matched tokens for root node with filter", () => {
			const tokens = extractTokens(store, Program, t => t.type === "Identifier");

			check(tokens, ["answer", "a", "b", "call"]);
		});

		it("should retrieve all tokens and comments in the node for root node with includeComments option", () => {
			const tokens = extractTokens(store, Program, { includeComments: true });

			check(tokens, [
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
			const tokens = extractTokens(store, Program, {
				includeComments: true,
				filter: t => t.type.startsWith("Block"),
			});

			check(tokens, ["A", "B", "C", "D", "E", "Z"]);
		});

		it("should retrieve all tokens and comments in the node for binary expression with includeComments option", () => {
			const tokens = extractTokens(store, BinaryExpression, {
				includeComments: true,
			});

			check(tokens, ["a", "D", "*", "b"]);
		});

		it("should retrieve tokens and comments from Program with leading and trailing comments and whitespace", () => {
			const code = " /*A*/ bar /*Z*/ ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const tokens = extractTokens(tokenStore, ast);

			check(tokens, ["bar"]);
		});
	});

	describe("when calling getTokensBefore", () => {
		it("should retrieve zero tokens before a node", () => {
			const tokens = extractTokens(store, BinaryExpression, 0);

			check(tokens, []);
		});

		it("should retrieve one token before a node", () => {
			const tokens = extractTokens(store, BinaryExpression, 1);

			check(tokens, ["="]);
		});

		it("should retrieve more than one token before a node", () => {
			const tokens = extractTokens(store, BinaryExpression, 2);

			check(tokens, ["answer", "="]);
		});

		it("should retrieve all tokens before a node", () => {
			const tokens = extractTokens(store, BinaryExpression, 9e9);

			check(tokens, ["var", "answer", "="]);
		});

		it("should retrieve more than one token before a node with count option", () => {
			const tokens = extractTokens(store, BinaryExpression, { count: 2 });

			check(tokens, ["answer", "="]);
		});

		it("should retrieve matched tokens before a node with count and filter options", () => {
			const tokens = extractTokens(store, BinaryExpression, {
				count: 1,
				filter: t => t.value !== "=",
			});

			check(tokens, ["answer"]);
		});

		it("should retrieve all matched tokens before a node with filter option", () => {
			const tokens = extractTokens(store, BinaryExpression, {
				filter: t => t.value !== "answer",
			});

			check(tokens, ["var", "="]);
		});

		it("should retrieve no tokens before the root node", () => {
			const tokens = extractTokens(store, Program, { count: 1 });

			check(tokens, []);
		});

		it("should retrieve tokens and comments before a node with count and includeComments option", () => {
			const tokens = extractTokens(store, BinaryExpression, {
				count: 3,
				includeComments: true,
			});

			check(tokens, ["B", "=", "C"]);
		});

		it("should retrieve all tokens and comments before a node with includeComments option only", () => {
			const tokens = extractTokens(store, BinaryExpression, {
				includeComments: true,
			});

			check(tokens, ["A", "var", "answer", "B", "=", "C"]);
		});

		it("should retrieve all tokens and comments before a node with includeComments and filter options", () => {
			const tokens = extractTokens(store, BinaryExpression, {
				includeComments: true,
				filter: t => t.type.startsWith("Block"),
			});

			check(tokens, ["A", "B", "C"]);
		});

		it("should retrieve no tokens before Program when it starts with whitespace", () => {
			const code = " bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const tokens = extractTokens(tokenStore, ast, 1);

			check(tokens, []);
		});

		it("should retrieve no tokens before Program when it starts with a comment", () => {
			const code = "/*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const tokens = extractTokens(tokenStore, ast, 1);

			check(tokens, []);
		});

		it("should retrieve no tokens before Program when it starts with whitespace and a comment", () => {
			const code = " /*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const tokens = extractTokens(tokenStore, ast, {
				count: 1,
				includeComments: true,
			});

			check(tokens, []);
		});
	});

	describe("when calling getTokensAfter", () => {
		it("should retrieve zero tokens after a node", () => {
			const tokens = extractTokens(store, VariableDeclarator.id, 0);

			check(tokens, []);
		});

		it("should retrieve one token after a node", () => {
			const tokens = extractTokens(store, VariableDeclarator.id, 1);

			check(tokens, ["="]);
		});

		it("should retrieve more than one token after a node", () => {
			const tokens = extractTokens(store, VariableDeclarator.id, 2);

			check(tokens, ["=", "a"]);
		});

		it("should retrieve all tokens after a node", () => {
			const tokens = extractTokens(store, VariableDeclarator.id, 9e9);

			check(tokens, [
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
			const tokens = extractTokens(store, VariableDeclarator.id, {
				count: 2,
			});

			check(tokens, ["=", "a"]);
		});

		it("should retrieve all matched tokens after a node with filter option", () => {
			const tokens = extractTokens(store, VariableDeclarator.id, {
				filter: t => t.type === "Identifier",
			});

			check(tokens, ["a", "b", "call"]);
		});

		it("should retrieve matched tokens after a node with count and filter options", () => {
			const tokens = extractTokens(store, VariableDeclarator.id, {
				count: 2,
				filter: t => t.type === "Identifier",
			});

			check(tokens, ["a", "b"]);
		});

		it("should retrieve all tokens and comments after a node with includeComments option", () => {
			const tokens = extractTokens(store, VariableDeclarator.id, {
				includeComments: true,
			});

			check(tokens, [
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

		it("should retrieve several tokens and comments after a node with includeComments and count options", () => {
			const tokens = extractTokens(store, VariableDeclarator.id, {
				includeComments: true,
				count: 3,
			});

			check(tokens, ["B", "=", "C"]);
		});

		it("should retrieve matched tokens and comments after a node with includeComments and count and filter options", () => {
			const tokens = extractTokens(store, VariableDeclarator.id, {
				includeComments: true,
				count: 3,
				filter: t => t.type.startsWith("Block"),
			});

			check(tokens, ["B", "C", "D"]);
		});

		it("should retrieve no tokens after Program when it ends with whitespace", () => {
			const code = "bar ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const tokens = extractTokens(tokenStore, ast, 1);

			check(tokens, []);
		});

		it("should retrieve no tokens after Program when it ends with a comment", () => {
			const code = "bar /*comment*/";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const tokens = extractTokens(tokenStore, ast, 1);

			check(tokens, []);
		});

		it("should retrieve no tokens after Program when it ends with a comment and whitespace", () => {
			const code = "bar /*comment*/ ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const tokens = extractTokens(tokenStore, ast, {
				count: 1,
				includeComments: true,
			});

			check(tokens, []);
		});
	});

	describe("when calling getFirstTokens", () => {
		it("should retrieve zero tokens from a node's token stream", () => {
			const tokens = extractTokens(store, BinaryExpression, 0);

			check(tokens, []);
		});

		it("should retrieve one token from a node's token stream", () => {
			const tokens = extractTokens(store, BinaryExpression, 1);

			check(tokens, ["a"]);
		});

		it("should retrieve more than one token from a node's token stream", () => {
			const tokens = extractTokens(store, BinaryExpression, 2);

			check(tokens, ["a", "*"]);
		});

		it("should retrieve all tokens from a node's token stream", () => {
			const tokens = extractTokens(store, BinaryExpression, 9e9);

			check(tokens, ["a", "*", "b"]);
		});

		it("should retrieve more than one token from a node's token stream with count option", () => {
			const tokens = extractTokens(store, BinaryExpression, { count: 2 });

			check(tokens, ["a", "*"]);
		});

		it("should retrieve matched tokens from a node's token stream with filter option", () => {
			const tokens = extractTokens(store, BinaryExpression, {
				filter: t => t.type === "Identifier",
			});

			check(tokens, ["a", "b"]);
		});

		it("should retrieve matched tokens from a node's token stream with filter and count options", () => {
			const tokens = extractTokens(store, BinaryExpression, {
				count: 1,
				filter: t => t.type === "Identifier",
			});

			check(tokens, ["a"]);
		});

		it("should retrieve all tokens and comments from a node's token stream with includeComments option", () => {
			const tokens = extractTokens(store, BinaryExpression, {
				includeComments: true,
			});

			check(tokens, ["a", "D", "*", "b"]);
		});

		it("should retrieve several tokens and comments from a node's token stream with includeComments and count options", () => {
			const tokens = extractTokens(store, BinaryExpression, {
				includeComments: true,
				count: 3,
			});

			check(tokens, ["a", "D", "*"]);
		});

		it("should retrieve several tokens and comments from a node's token stream with includeComments and count and filter options", () => {
			const tokens = extractTokens(store, BinaryExpression, {
				includeComments: true,
				count: 3,
				filter: t => t.value !== "a",
			});

			check(tokens, ["D", "*", "b"]);
		});

		it("should retrieve the first token from Program when it starts with whitespace", () => {
			const code = " bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const tokens = extractTokens(tokenStore, ast, 1);

			check(tokens, ["bar"]);
		});

		it("should retrieve the first token from Program when it starts with a comment", () => {
			const code = "/*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const tokens = extractTokens(tokenStore, ast, 1);

			check(tokens, ["bar"]);
		});

		it("should retrieve the first token/comment from Program when it starts with whitespace and a comment", () => {
			const code = " /*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const tokens = extractTokens(tokenStore, ast, {
				count: 2,
				includeComments: true,
			});

			check(tokens, ["comment", "bar"]);
		});
	});

	describe("when calling getLastTokens", () => {
		it("should retrieve zero tokens from the end of a node's token stream", () => {
			const tokens = extractTokens(store, BinaryExpression, 0);

			check(tokens, []);
		});

		it("should retrieve one token from the end of a node's token stream", () => {
			const tokens = extractTokens(store, BinaryExpression, 1);

			check(tokens, ["b"]);
		});

		it("should retrieve more than one token from the end of a node's token stream", () => {
			const tokens = extractTokens(store, BinaryExpression, 2);

			check(tokens, ["*", "b"]);
		});

		it("should retrieve all tokens from the end of a node's token stream", () => {
			const tokens = extractTokens(store, BinaryExpression, 9e9);

			check(tokens, ["a", "*", "b"]);
		});

		it("should retrieve more than one token from the end of a node's token stream with count option", () => {
			const tokens = extractTokens(store, BinaryExpression, { count: 2 });

			check(tokens, ["*", "b"]);
		});

		it("should retrieve matched tokens from the end of a node's token stream with filter option", () => {
			const tokens = extractTokens(store, BinaryExpression, {
				filter: t => t.type === "Identifier",
			});

			check(tokens, ["a", "b"]);
		});

		it("should retrieve matched tokens from the end of a node's token stream with filter and count options", () => {
			const tokens = extractTokens(store, BinaryExpression, {
				count: 1,
				filter: t => t.type === "Identifier",
			});

			check(tokens, ["b"]);
		});

		it("should retrieve all tokens from the end of a node's token stream with includeComments option", () => {
			const tokens = extractTokens(store, BinaryExpression, {
				includeComments: true,
			});

			check(tokens, ["a", "D", "*", "b"]);
		});

		it("should retrieve matched tokens from the end of a node's token stream with includeComments and count options", () => {
			const tokens = extractTokens(store, BinaryExpression, {
				includeComments: true,
				count: 3,
			});

			check(tokens, ["D", "*", "b"]);
		});

		it("should retrieve matched tokens from the end of a node's token stream with includeComments and count and filter options", () => {
			const tokens = extractTokens(store, BinaryExpression, {
				includeComments: true,
				count: 3,
				filter: t => t.type !== "Punctuator",
			});

			check(tokens, ["a", "D", "b"]);
		});

		it("should retrieve the last token from Program when it ends with whitespace", () => {
			const code = "bar ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const tokens = extractTokens(tokenStore, ast, 1);

			check(tokens, ["bar"]);
		});

		it("should retrieve the last token from Program when it ends with a comment", () => {
			const code = "bar /*comment*/";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const tokens = extractTokens(tokenStore, ast, 1);

			check(tokens, ["bar"]);
		});

		it("should retrieve the last token/comment from Program when it ends with a comment and whitespace", () => {
			const code = "bar /*comment*/ ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const tokens = extractTokens(tokenStore, ast, {
				count: 2,
				includeComments: true,
			});

			check(tokens, ["bar", "comment"]);
		});
	});

	describe("when calling getFirstToken", () => {
		it("should retrieve the first token of a node's token stream", () => {
			const token = getFirstToken(store, BinaryExpression);

			assert.strictEqual(token.value, "a");
		});

		it("should skip a given number of tokens", () => {
			const token = getFirstToken(store, BinaryExpression, 1);

			assert.strictEqual(token.value, "*");
		});

		it("should skip a given number of tokens with skip option", () => {
			const token = getFirstToken(store, BinaryExpression, { skip: 1 });

			assert.strictEqual(token.value, "*");
		});

		it("should retrieve matched token with filter option", () => {
			const token = getFirstToken(store, BinaryExpression, {
				filter: t => t.type === "Identifier",
			});

			assert.strictEqual(token.value, "a");
		});

		it("should retrieve matched token with filter and skip options", () => {
			const token = getFirstToken(store, BinaryExpression, {
				skip: 1,
				filter: t => t.type === "Identifier",
			});

			assert.strictEqual(token.value, "b");
		});

		it("should retrieve the first token or comment of a node's token stream with includeComments option", () => {
			const token = getFirstToken(store, BinaryExpression, {
				includeComments: true,
			});

			assert.strictEqual(token.value, "a");
		});

		it("should retrieve the first matched token or comment of a node's token stream with includeComments and skip options", () => {
			const token = getFirstToken(store, BinaryExpression, {
				includeComments: true,
				skip: 1,
			});

			assert.strictEqual(token.value, "D");
		});

		it("should retrieve the first matched token or comment of a node's token stream with includeComments and skip and filter options", () => {
			const token = getFirstToken(store, BinaryExpression, {
				includeComments: true,
				skip: 1,
				filter: t => t.value !== "a",
			});

			assert.strictEqual(token.value, "*");
		});

		it("should retrieve the first comment if the comment is at the last of nodes", () => {
			const code = "a + b\n/*comment*/ c + d";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);

			/*
			 * A node must not start with a token: it can start with a comment or be empty.
			 * This test case is needed for completeness.
			 */
			const token = getFirstToken(tokenStore, {
				range: [ast.comments[0].range[0], ast.tokens[5].range[1]],
			}, { includeComments: true });

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
			const token = getFirstToken(tokenStore, {
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
			const token = getFirstToken(tokenStore, ast);

			assert.strictEqual(token.value, "bar");
		});

		it("should retrieve the first token from Program when it starts with a comment", () => {
			const code = "/*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = getFirstToken(tokenStore, ast);

			assert.strictEqual(token.value, "bar");
		});

		it("should retrieve the first token from Program when it starts with whitespace and a comment", () => {
			const code = " /*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = getFirstToken(tokenStore, ast, {
				includeComments: true,
			});

			assert.strictEqual(token.value, "comment");
		});
	});

	describe("when calling getLastToken", () => {
		it("should retrieve the last token of a node's token stream", () => {
			const token = getLastToken(store, BinaryExpression);

			assert.strictEqual(token.value, "b");
		});

		it("should skip a given number of tokens", () => {
			const token = getLastToken(store, BinaryExpression, 1);

			assert.strictEqual(token.value, "*");
		});

		it("should skip a given number of tokens with skip option", () => {
			const token = getLastToken(store, BinaryExpression, { skip: 1 });

			assert.strictEqual(token.value, "*");
		});

		it("should retrieve the last matched token of a node's token stream with filter option", () => {
			const token = getLastToken(store, BinaryExpression, {
				filter: t => t.value !== "b",
			});

			assert.strictEqual(token.value, "*");
		});

		it("should retrieve the last matched token of a node's token stream with filter and skip options", () => {
			const token = getLastToken(store, BinaryExpression, {
				skip: 1,
				filter: t => t.type === "Identifier",
			});

			assert.strictEqual(token.value, "a");
		});

		it("should retrieve the last token of a node's token stream with includeComments option", () => {
			const token = getLastToken(store, BinaryExpression, {
				includeComments: true,
			});

			assert.strictEqual(token.value, "b");
		});

		it("should retrieve the last token of a node's token stream with includeComments and skip options", () => {
			const token = getLastToken(store, BinaryExpression, {
				includeComments: true,
				skip: 2,
			});

			assert.strictEqual(token.value, "D");
		});

		it("should retrieve the last token of a node's token stream with includeComments and skip and filter options", () => {
			const token = getLastToken(store, BinaryExpression, {
				includeComments: true,
				skip: 1,
				filter: t => t.type !== "Identifier",
			});

			assert.strictEqual(token.value, "D");
		});

		it("should retrieve the last comment if the comment is at the last of nodes", () => {
			const code = "a + b /*comment*/\nc + d";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);

			/*
			 * A node must not end with a token: it can end with a comment or be empty.
			 * This test case is needed for completeness.
			 */
			const token = getLastToken(tokenStore, {
				range: [ast.tokens[0].range[0], ast.comments[0].range[1]],
			}, { includeComments: true });

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
			const token = getLastToken(tokenStore, {
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
			const token = getLastToken(tokenStore, ast);

			assert.strictEqual(token.value, "bar");
		});

		it("should retrieve the last token from Program when it ends with a comment", () => {
			const code = "bar /*comment*/";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = getLastToken(tokenStore, ast);

			assert.strictEqual(token.value, "bar");
		});

		it("should retrieve the last token from Program when it ends with a comment and whitespace", () => {
			const code = "bar /*comment*/ ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = getLastToken(tokenStore, ast, {
				includeComments: true,
			});

			assert.strictEqual(token.value, "comment");
		});

		it("should return null if the source contains only comments", () => {
			const code = "// comment";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = getLastToken(tokenStore, ast, {
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
			const token = getLastToken(tokenStore, ast);

			assert.strictEqual(token, null);
		});
	});

	describe("when calling getFirstTokensBetween", () => {
		it("should retrieve zero tokens between adjacent nodes", () => {
			const tokens = getTokensBetween(store, BinaryExpression, CallExpression);

			check(tokens, []);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with count option", () => {
			const tokens = getTokensBetween(
				store,
				VariableDeclarator.id,
				BinaryExpression.right,
				2,
			);

			check(tokens, ["=", "a"]);
		});

		it("should retrieve matched tokens between non-adjacent nodes with filter option", () => {
			const tokens = getTokensBetween(
				store,
				VariableDeclarator.id,
				BinaryExpression.right,
				{ filter: t => t.type !== "Punctuator" },
			);

			check(tokens, ["a"]);
		});

		it("should retrieve all tokens between non-adjacent nodes with empty object option", () => {
			const tokens = getTokensBetween(
				store,
				VariableDeclarator.id,
				BinaryExpression.right,
				{},
			);

			check(tokens, ["=", "a", "*"]);
		});

		it("should retrieve all tokens and comments between non-adjacent nodes with includeComments option", () => {
			const tokens = getTokensBetween(
				store,
				VariableDeclarator.id,
				BinaryExpression.right,
				{ includeComments: true },
			);

			check(tokens, ["B", "=", "C", "a", "D", "*"]);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with includeComments and count options", () => {
			const tokens = getTokensBetween(
				store,
				VariableDeclarator.id,
				BinaryExpression.right,
				{ includeComments: true, count: 3 },
			);

			check(tokens, ["B", "=", "C"]);
		});

		it("should retrieve multiple tokens and comments between non-adjacent nodes with includeComments and filter options", () => {
			const tokens = getTokensBetween(
				store,
				VariableDeclarator.id,
				BinaryExpression.right,
				{
					includeComments: true,
					filter: t => t.type !== "Punctuator",
				},
			);

			check(tokens, ["B", "C", "a", "D"]);
		});
	});

	describe("when calling getFirstTokenBetween", () => {
		it("should return null between adjacent nodes", () => {
			const token = getFirstTokenBetween(store, BinaryExpression, CallExpression);

			assert.strictEqual(token, null);
		});

		it("should retrieve one token between non-adjacent nodes with count option", () => {
			const token = getFirstTokenBetween(
				store,
				VariableDeclarator.id,
				BinaryExpression.right,
			);

			assert.strictEqual(token.value, "=");
		});

		it("should retrieve one token between non-adjacent nodes with skip option", () => {
			const token = getFirstTokenBetween(
				store,
				VariableDeclarator.id,
				BinaryExpression.right,
				1,
			);

			assert.strictEqual(token.value, "a");
		});

		it("should return null if it's skipped beyond the right token", () => {
			const token = getFirstTokenBetween(
				store,
				VariableDeclarator.id,
				BinaryExpression.right,
				{ skip: 3 },
			);

			assert.strictEqual(token, null);
		});

		it("should retrieve the first matched token between non-adjacent nodes with filter option", () => {
			const token = getFirstTokenBetween(
				store,
				VariableDeclarator.id,
				BinaryExpression.right,
				{ filter: t => t.type !== "Identifier" },
			);

			assert.strictEqual(token.value, "=");
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments option", () => {
			const token = getFirstTokenBetween(
				store,
				VariableDeclarator.id,
				BinaryExpression.right,
				{ includeComments: true },
			);

			assert.strictEqual(token.value, "B");
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip options", () => {
			const token = getFirstTokenBetween(
				store,
				VariableDeclarator.id,
				BinaryExpression.right,
				{ includeComments: true, skip: 1 },
			);

			assert.strictEqual(token.value, "=");
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip and filter options", () => {
			const token = getFirstTokenBetween(
				store,
				VariableDeclarator.id,
				BinaryExpression.right,
				{
					includeComments: true,
					skip: 1,
					filter: t => t.type !== "Punctuator",
				},
			);

			assert.strictEqual(token.value, "C");
		});
	});

	describe("when calling getLastTokensBetween", () => {
		it("should retrieve zero tokens between adjacent nodes", () => {
			const tokens = getTokensBetween(store, BinaryExpression, CallExpression);

			check(tokens, []);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with count option", () => {
			const tokens = getTokensBetween(
				store,
				VariableDeclarator.id,
				BinaryExpression.right,
				2,
			);

			check(tokens, ["a", "*"]);
		});

		it("should retrieve matched tokens between non-adjacent nodes with filter option", () => {
			const tokens = getTokensBetween(
				store,
				VariableDeclarator.id,
				BinaryExpression.right,
				{ filter: t => t.type !== "Punctuator" },
			);

			check(tokens, ["a"]);
		});

		it("should retrieve all tokens between non-adjacent nodes with empty object option", () => {
			const tokens = getTokensBetween(
				store,
				VariableDeclarator.id,
				BinaryExpression.right,
				{},
			);

			check(tokens, ["=", "a", "*"]);
		});

		it("should retrieve all tokens and comments between non-adjacent nodes with includeComments option", () => {
			const tokens = getTokensBetween(
				store,
				VariableDeclarator.id,
				BinaryExpression.right,
				{ includeComments: true },
			);

			check(tokens, ["B", "=", "C", "a", "D", "*"]);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with includeComments and count options", () => {
			const tokens = getTokensBetween(
				store,
				VariableDeclarator.id,
				BinaryExpression.right,
				{ includeComments: true, count: 3 },
			);

			check(tokens, ["a", "D", "*"]);
		});

		it("should retrieve multiple tokens and comments between non-adjacent nodes with includeComments and filter options", () => {
			const tokens = getTokensBetween(
				store,
				VariableDeclarator.id,
				BinaryExpression.right,
				{
					includeComments: true,
					filter: t => t.type !== "Punctuator",
				},
			);

			check(tokens, ["B", "C", "a", "D"]);
		});
	});

	describe("when calling getLastTokenBetween", () => {
		it("should return null between adjacent nodes", () => {
			const token = getFirstTokenBetween(store, BinaryExpression, CallExpression);

			assert.strictEqual(token, null);
		});

		it("should retrieve one token between non-adjacent nodes with count option", () => {
			const token = getFirstTokenBetween(
				store,
				VariableDeclarator.id,
				BinaryExpression.right,
			);

			assert.strictEqual(token.value, "=");
		});

		it("should retrieve one token between non-adjacent nodes with skip option", () => {
			const token = getFirstTokenBetween(
				store,
				VariableDeclarator.id,
				BinaryExpression.right,
				1,
			);

			assert.strictEqual(token.value, "a");
		});

		it("should return null if it's skipped beyond the right token", () => {
			const token = getFirstTokenBetween(
				store,
				VariableDeclarator.id,
				BinaryExpression.right,
				{ skip: 3 },
			);

			assert.strictEqual(token, null);
		});

		it("should retrieve the first matched token between non-adjacent nodes with filter option", () => {
			const token = getFirstTokenBetween(
				store,
				VariableDeclarator.id,
				BinaryExpression.right,
				{ filter: t => t.type !== "Identifier" },
			);

			assert.strictEqual(token.value, "=");
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments option", () => {
			const token = getFirstTokenBetween(
				store,
				VariableDeclarator.id,
				BinaryExpression.right,
				{ includeComments: true },
			);

			assert.strictEqual(token.value, "B");
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip options", () => {
			const token = getFirstTokenBetween(
				store,
				VariableDeclarator.id,
				BinaryExpression.right,
				{ includeComments: true, skip: 1 },
			);

			assert.strictEqual(token.value, "=");
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip and filter options", () => {
			const token = getFirstTokenBetween(
				store,
				VariableDeclarator.id,
				BinaryExpression.right,
				{
					includeComments: true,
					skip: 1,
					filter: t => t.type !== "Punctuator",
				},
			);

			assert.strictEqual(token.value, "C");
		});
	});

	describe("when calling getTokensBetween", () => {
		it("should retrieve zero tokens between adjacent nodes", () => {
			const tokens = getTokensBetween(store, BinaryExpression, CallExpression);

			check(tokens, []);
		});

		it("should retrieve one token between nodes", () => {
			const tokens = getTokensBetween(
				store,
				BinaryExpression.left,
				BinaryExpression.right,
			);

			check(tokens, ["*"]);
		});

		it("should retrieve multiple tokens between non-adjacent nodes", () => {
			const tokens = getTokensBetween(
				store,
				VariableDeclarator.id,
				BinaryExpression.right,
			);

			check(tokens, ["=", "a", "*"]);
		});

		it("should retrieve surrounding tokens when asked for padding", () => {
			const tokens = getTokensBetween(
				store,
				VariableDeclarator.id,
				BinaryExpression.left,
				2,
			);

			check(tokens, ["var", "answer", "=", "a", "*"]);
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
			const result = commentsExistBetween(store, AST.tokens[0], AST.tokens[1]);

			assert.isFalse(result);
		});

		it("should retrieve true if comments exist", () => {
			const result = commentsExistBetween(store, AST.tokens[1], AST.tokens[2]);

			assert.isTrue(result);
		});
	});

	describe("getCommentsBefore", () => {
		it("should retrieve comments before a node", () => {
			const comments = getCommentsBefore(store, VariableDeclaration);

			assert.strictEqual(comments[0].value, "A");
		});

		it("should retrieve comments before a token", () => {
			const comments = getCommentsBefore(store, TOKENS[2] /* "=" token */);

			assert.strictEqual(comments[0].value, "B");
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
			check(getCommentsBefore(tokenStore, ast), []);
		});
	});

	describe("getCommentsAfter", () => {
		it("should retrieve comments after a node", () => {
			const comments = getCommentsAfter(store, VariableDeclarator.id);

			assert.strictEqual(comments[0].value, "B");
		});

		it("should retrieve comments after a token", () => {
			const comments = getCommentsAfter(store, TOKENS[2] /* "=" token */);

			assert.strictEqual(comments[0].value, "C");
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
			check(getCommentsAfter(tokenStore, ast), []);
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