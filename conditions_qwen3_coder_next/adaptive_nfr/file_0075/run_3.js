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

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("TokenStore", () => {
	const store = new TokenStore(TOKENS, COMMENTS);

	// Helper functions extracted for getTokens
	/**
	 * Retrieves tokens for a node with optional padding and options.
	 * @param {ASTNode} node The AST node.
	 * @param {number|Object} [before] Number of tokens before or options object.
	 * @param {number} [after] Number of tokens after.
	 * @returns {Token[]} Array of tokens.
	 */
	function getTokensForNode(node, before, after) {
		return store.getTokens(node, before, after);
	}

	/**
	 * Retrieves tokens with filter for a node.
	 * @param {ASTNode} node The AST node.
	 * @param {Function|Object} filterOrOptions Filter function or options object.
	 * @returns {Token[]} Array of filtered tokens.
	 */
	function getTokensWithFilter(node, filterOrOptions) {
		return store.getTokens(node, filterOrOptions);
	}

	/**
	 * Retrieves tokens with includeComments option for a node.
	 * @param {ASTNode} node The AST node.
	 * @param {Object} options Options object.
	 * @returns {Token[]} Array of tokens including comments.
	 */
	function getTokensWithComments(node, options) {
		return store.getTokens(node, options);
	}

	// Helper functions extracted for getTokensBefore
	/**
	 * Retrieves tokens before a node with optional count and options.
	 * @param {ASTNode} node The AST node.
	 * @param {number|Object} countOrOptions Count or options object.
	 * @returns {Token[]} Array of tokens.
	 */
	function getTokensBeforeNode(node, countOrOptions) {
		return store.getTokensBefore(node, countOrOptions);
	}

	/**
	 * Retrieves tokens before a node with includeComments option.
	 * @param {ASTNode} node The AST node.
	 * @param {Object} options Options object.
	 * @returns {Token[]} Array of tokens including comments.
	 */
	function getTokensBeforeWithComments(node, options) {
		return store.getTokensBefore(node, options);
	}

	// Helper functions extracted for getTokenBefore
	/**
	 * Retrieves a single token before a node.
	 * @param {ASTNode} node The AST node.
	 * @param {number|Object} skipOrOptions Skip count or options object.
	 * @returns {Token|null} The token before the node.
	 */
	function getTokenBeforeNode(node, skipOrOptions) {
		return store.getTokenBefore(node, skipOrOptions);
	}

	/**
	 * Retrieves a token or comment before a node with options.
	 * @param {ASTNode} node The AST node.
	 * @param {Object} options Options object.
	 * @returns {Token|null} The token or comment before the node.
	 */
	function getTokenBeforeWithComments(node, options) {
		return store.getTokenBefore(node, options);
	}

	// Helper functions extracted for getTokensAfter
	/**
	 * Retrieves tokens after a node with optional count and options.
	 * @param {ASTNode} node The AST node.
	 * @param {number|Object} countOrOptions Count or options object.
	 * @returns {Token[]} Array of tokens.
	 */
	function getTokensAfterNode(node, countOrOptions) {
		return store.getTokensAfter(node, countOrOptions);
	}

	/**
	 * Retrieves tokens after a node with includeComments option.
	 * @param {ASTNode} node The AST node.
	 * @param {Object} options Options object.
	 * @returns {Token[]} Array of tokens including comments.
	 */
	function getTokensAfterWithComments(node, options) {
		return store.getTokensAfter(node, options);
	}

	// Helper functions extracted for getTokenAfter
	/**
	 * Retrieves a single token after a node.
	 * @param {ASTNode} node The AST node.
	 * @param {number|Object} skipOrOptions Skip count or options object.
	 * @returns {Token|null} The token after the node.
	 */
	function getTokenAfterNode(node, skipOrOptions) {
		return store.getTokenAfter(node, skipOrOptions);
	}

	/**
	 * Retrieves a token or comment after a node with options.
	 * @param {ASTNode} node The AST node.
	 * @param {Object} options Options object.
	 * @returns {Token|null} The token or comment after the node.
	 */
	function getTokenAfterWithComments(node, options) {
		return store.getTokenAfter(node, options);
	}

	// Helper functions extracted for getFirstTokens
	/**
	 * Retrieves first tokens from a node with optional count and options.
	 * @param {ASTNode} node The AST node.
	 * @param {number|Object} countOrOptions Count or options object.
	 * @returns {Token[]} Array of first tokens.
	 */
	function getFirstTokensFromNode(node, countOrOptions) {
		return store.getFirstTokens(node, countOrOptions);
	}

	/**
	 * Retrieves first tokens with includeComments option.
	 * @param {ASTNode} node The AST node.
	 * @param {Object} options Options object.
	 * @returns {Token[]} Array of first tokens including comments.
	 */
	function getFirstTokensWithComments(node, options) {
		return store.getFirstTokens(node, options);
	}

	// Helper functions extracted for getFirstToken
	/**
	 * Retrieves the first token from a node.
	 * @param {ASTNode} node The AST node.
	 * @param {number|Object} skipOrOptions Skip count or options object.
	 * @returns {Token|null} The first token.
	 */
	function getFirstTokenFromNode(node, skipOrOptions) {
		return store.getFirstToken(node, skipOrOptions);
	}

	/**
	 * Retrieves the first token or comment from a node with options.
	 * @param {ASTNode} node The AST node.
	 * @param {Object} options Options object.
	 * @returns {Token|null} The first token or comment.
	 */
	function getFirstTokenWithComments(node, options) {
		return store.getFirstToken(node, options);
	}

	// Helper functions extracted for getLastTokens
	/**
	 * Retrieves last tokens from a node with optional count and options.
	 * @param {ASTNode} node The AST node.
	 * @param {number|Object} countOrOptions Count or options object.
	 * @returns {Token[]} Array of last tokens.
	 */
	function getLastTokensFromNode(node, countOrOptions) {
		return store.getLastTokens(node, countOrOptions);
	}

	/**
	 * Retrieves last tokens with includeComments option.
	 * @param {ASTNode} node The AST node.
	 * @param {Object} options Options object.
	 * @returns {Token[]} Array of last tokens including comments.
	 */
	function getLastTokensWithComments(node, options) {
		return store.getLastTokens(node, options);
	}

	// Helper functions extracted for getLastToken
	/**
	 * Retrieves the last token from a node.
	 * @param {ASTNode} node The AST node.
	 * @param {number|Object} skipOrOptions Skip count or options object.
	 * @returns {Token|null} The last token.
	 */
	function getLastTokenFromNode(node, skipOrOptions) {
		return store.getLastToken(node, skipOrOptions);
	}

	/**
	 * Retrieves the last token or comment from a node with options.
	 * @param {ASTNode} node The AST node.
	 * @param {Object} options Options object.
	 * @returns {Token|null} The last token or comment.
	 */
	function getLastTokenWithComments(node, options) {
		return store.getLastToken(node, options);
	}

	// Helper functions extracted for getFirstTokensBetween
	/**
	 * Retrieves first tokens between two nodes.
	 * @param {ASTNode} leftNode The left AST node.
	 * @param {ASTNode} rightNode The right AST node.
	 * @param {number|Object} countOrOptions Count or options object.
	 * @returns {Token[]} Array of first tokens between nodes.
	 */
	function getFirstTokensBetweenNodes(leftNode, rightNode, countOrOptions) {
		return store.getFirstTokensBetween(leftNode, rightNode, countOrOptions);
	}

	// Helper functions extracted for getFirstTokenBetween
	/**
	 * Retrieves the first token between two nodes.
	 * @param {ASTNode} leftNode The left AST node.
	 * @param {ASTNode} rightNode The right AST node.
	 * @param {number|Object} skipOrOptions Skip count or options object.
	 * @returns {Token|null} The first token between nodes.
	 */
	function getFirstTokenBetweenNodes(leftNode, rightNode, skipOrOptions) {
		return store.getFirstTokenBetween(leftNode, rightNode, skipOrOptions);
	}

	// Helper functions extracted for getLastTokensBetween
	/**
	 * Retrieves last tokens between two nodes.
	 * @param {ASTNode} leftNode The left AST node.
	 * @param {ASTNode} rightNode The right AST node.
	 * @param {number|Object} countOrOptions Count or options object.
	 * @returns {Token[]} Array of last tokens between nodes.
	 */
	function getLastTokensBetweenNodes(leftNode, rightNode, countOrOptions) {
		return store.getLastTokensBetween(leftNode, rightNode, countOrOptions);
	}

	// Helper functions extracted for getLastTokenBetween
	/**
	 * Retrieves the last token between two nodes.
	 * @param {ASTNode} leftNode The left AST node.
	 * @param {ASTNode} rightNode The right AST node.
	 * @param {number|Object} skipOrOptions Skip count or options object.
	 * @returns {Token|null} The last token between nodes.
	 */
	function getLastTokenBetweenNodes(leftNode, rightNode, skipOrOptions) {
		return store.getLastTokenBetween(leftNode, rightNode, skipOrOptions);
	}

	// Helper functions extracted for getTokensBetween
	/**
	 * Retrieves tokens between two nodes.
	 * @param {ASTNode} leftNode The left AST node.
	 * @param {ASTNode} rightNode The right AST node.
	 * @param {number|Object} paddingOrOptions Padding count or options object.
	 * @returns {Token[]} Array of tokens between nodes.
	 */
	function getTokensBetweenNodes(leftNode, rightNode, paddingOrOptions) {
		return store.getTokensBetween(leftNode, rightNode, paddingOrOptions);
	}

	// Helper functions extracted for getTokenByRangeStart
	/**
	 * Retrieves a token by range start index.
	 * @param {number} rangeStart The range start index.
	 * @param {Object} [options] Options object.
	 * @returns {Token|null} The token at the range start.
	 */
	function getTokenByRangeStartIndex(rangeStart, options) {
		return store.getTokenByRangeStart(rangeStart, options);
	}

	// Helper functions extracted for getCommentsBefore
	/**
	 * Retrieves comments before a node or token.
	 * @param {ASTNode|Token} nodeOrToken The node or token.
	 * @returns {Comment[]} Array of comments before.
	 */
	function getCommentsBeforeNodeOrToken(nodeOrToken) {
		return store.getCommentsBefore(nodeOrToken);
	}

	// Helper functions extracted for getCommentsAfter
	/**
	 * Retrieves comments after a node or token.
	 * @param {ASTNode|Token} nodeOrToken The node or token.
	 * @returns {Comment[]} Array of comments after.
	 */
	function getCommentsAfterNodeOrToken(nodeOrToken) {
		return store.getCommentsAfter(nodeOrToken);
	}

	// Helper functions extracted for getCommentsInside
	/**
	 * Retrieves comments inside a node.
	 * @param {ASTNode} node The AST node.
	 * @returns {Comment[]} Array of comments inside.
	 */
	function getCommentsInsideNode(node) {
		return store.getCommentsInside(node);
	}

	// Helper functions extracted for commentsExistBetween
	/**
	 * Checks if comments exist between two tokens.
	 * @param {Token} leftToken The left token.
	 * @param {Token} rightToken The right token.
	 * @returns {boolean} True if comments exist between tokens.
	 */
	function commentsExistBetweenTokens(leftToken, rightToken) {
		return store.commentsExistBetween(leftToken, rightToken);
	}

	// Helper functions extracted for getFirstToken & getTokenAfter
	/**
	 * Retrieves all tokens and comments in a node using getFirstToken and getTokenAfter.
	 * @param {ASTNode} node The AST node.
	 * @param {Object} options Options object.
	 * @returns {Token[]} Array of tokens and comments.
	 */
	function getAllTokensAndCommentsInNode(node, options) {
		const tokens = [];
		let token = store.getFirstToken(node, options);

		while (token) {
			tokens.push(token);
			token = store.getTokenAfter(token, options);
		}

		return tokens;
	}

	// Helper functions extracted for getLastToken & getTokenBefore
	/**
	 * Retrieves all tokens and comments in a node using getLastToken and getTokenBefore.
	 * @param {ASTNode} node The AST node.
	 * @param {Object} options Options object.
	 * @returns {Token[]} Array of tokens and comments.
	 */
	function getAllTokensAndCommentsInNodeReverse(node, options) {
		const tokens = [];
		let token = store.getLastToken(node, options);

		while (token) {
			tokens.push(token);
			token = store.getTokenBefore(token, options);
		}

		return tokens.reverse();
	}

	// Main test orchestration
	describe("when calling getTokens", () => {
		it("should retrieve all tokens for root node", () => {
			check(getTokensForNode(Program), [
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
			check(getTokensForNode(BinaryExpression), ["a", "*", "b"]);
		});

		it("should retrieve all tokens plus one before for binary expression", () => {
			check(getTokensForNode(BinaryExpression, 1), ["=", "a", "*", "b"]);
		});

		it("should retrieve all tokens plus one after for binary expression", () => {
			check(getTokensForNode(BinaryExpression, 0, 1), [
				"a",
				"*",
				"b",
				"call",
			]);
		});

		it("should retrieve all tokens plus two before and one after for binary expression", () => {
			check(getTokensForNode(BinaryExpression, 2, 1), [
				"answer",
				"=",
				"a",
				"*",
				"b",
				"call",
			]);
		});

		it("should retrieve all matched tokens for root node with filter", () => {
			check(getTokensWithFilter(Program, t => t.type === "Identifier"), [
				"answer",
				"a",
				"b",
				"call",
			]);
			check(getTokensWithFilter(Program, {
				filter: t => t.type === "Identifier",
			}), [
				"answer",
				"a",
				"b",
				"call",
			]);
		});

		it("should retrieve all tokens and comments in the node for root node with includeComments option", () => {
			check(getTokensWithComments(Program, { includeComments: true }), [
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
			check(getTokensWithComments(Program, {
				includeComments: true,
				filter: t => t.type.startsWith("Block"),
			}), ["A", "B", "C", "D", "E", "Z"]);
		});

		it("should retrieve all tokens and comments in the node for binary expression with includeComments option", () => {
			check(getTokensWithComments(BinaryExpression, { includeComments: true }), [
				"a",
				"D",
				"*",
				"b",
			]);
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
			check(getTokensBeforeNode(BinaryExpression, 0), []);
		});

		it("should retrieve one token before a node", () => {
			check(getTokensBeforeNode(BinaryExpression, 1), ["="]);
		});

		it("should retrieve more than one token before a node", () => {
			check(getTokensBeforeNode(BinaryExpression, 2), ["answer", "="]);
		});

		it("should retrieve all tokens before a node", () => {
			check(getTokensBeforeNode(BinaryExpression, 9e9), [
				"var",
				"answer",
				"=",
			]);
		});

		it("should retrieve more than one token before a node with count option", () => {
			check(getTokensBeforeNode(BinaryExpression, { count: 2 }), [
				"answer",
				"=",
			]);
		});

		it("should retrieve matched tokens before a node with count and filter options", () => {
			check(getTokensBeforeNode(BinaryExpression, {
				count: 1,
				filter: t => t.value !== "=",
			}), ["answer"]);
		});

		it("should retrieve all matched tokens before a node with filter option", () => {
			check(getTokensBeforeNode(BinaryExpression, {
				filter: t => t.value !== "answer",
			}), ["var", "="]);
		});

		it("should retrieve no tokens before the root node", () => {
			check(getTokensBeforeNode(Program, { count: 1 }), []);
		});

		it("should retrieve tokens and comments before a node with count and includeComments option", () => {
			check(getTokensBeforeWithComments(BinaryExpression, {
				count: 3,
				includeComments: true,
			}), ["B", "=", "C"]);
		});

		it("should retrieve all tokens and comments before a node with includeComments option only", () => {
			check(getTokensBeforeWithComments(BinaryExpression, {
				includeComments: true,
			}), ["A", "var", "answer", "B", "=", "C"]);
		});

		it("should retrieve all tokens and comments before a node with includeComments and filter options", () => {
			check(getTokensBeforeWithComments(BinaryExpression, {
				includeComments: true,
				filter: t => t.type.startsWith("Block"),
			}), ["A", "B", "C"]);
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
				getTokenBeforeNode(BinaryExpression).value,
				"=",
			);
		});

		it("should skip a given number of tokens", () => {
			assert.strictEqual(
				getTokenBeforeNode(BinaryExpression, 1).value,
				"answer",
			);
			assert.strictEqual(
				getTokenBeforeNode(BinaryExpression, 2).value,
				"var",
			);
		});

		it("should skip a given number of tokens with skip option", () => {
			assert.strictEqual(
				getTokenBeforeNode(BinaryExpression, { skip: 1 }).value,
				"answer",
			);
			assert.strictEqual(
				getTokenBeforeNode(BinaryExpression, { skip: 2 }).value,
				"var",
			);
		});

		it("should retrieve matched token with filter option", () => {
			assert.strictEqual(
				getTokenBeforeNode(BinaryExpression, t => t.value !== "=")
					.value,
				"answer",
			);
		});

		it("should retrieve matched token with skip and filter options", () => {
			assert.strictEqual(
				getTokenBeforeNode(BinaryExpression, {
					skip: 1,
					filter: t => t.value !== "=",
				}).value,
				"var",
			);
		});

		it("should retrieve one token or comment before a node with includeComments option", () => {
			assert.strictEqual(
				getTokenBeforeWithComments(BinaryExpression, {
					includeComments: true,
				}).value,
				"C",
			);
		});

		it("should retrieve one token or comment before a node with includeComments and skip options", () => {
			assert.strictEqual(
				getTokenBeforeWithComments(BinaryExpression, {
					includeComments: true,
					skip: 1,
				}).value,
				"=",
			);
		});

		it("should retrieve one token or comment before a node with includeComments and skip and filter options", () => {
			assert.strictEqual(
				getTokenBeforeWithComments(BinaryExpression, {
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
			check(getTokensAfterNode(VariableDeclarator.id, 0), []);
		});

		it("should retrieve one token after a node", () => {
			check(getTokensAfterNode(VariableDeclarator.id, 1), ["="]);
		});

		it("should retrieve more than one token after a node", () => {
			check(getTokensAfterNode(VariableDeclarator.id, 2), ["=", "a"]);
		});

		it("should retrieve all tokens after a node", () => {
			check(getTokensAfterNode(VariableDeclarator.id, 9e9), [
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
			check(getTokensAfterNode(VariableDeclarator.id, { count: 2 }), [
				"=",
				"a",
			]);
		});

		it("should retrieve all matched tokens after a node with filter option", () => {
			check(getTokensAfterNode(VariableDeclarator.id, {
				filter: t => t.type === "Identifier",
			}), ["a", "b", "call"]);
		});

		it("should retrieve matched tokens after a node with count and filter options", () => {
			check(getTokensAfterNode(VariableDeclarator.id, {
				count: 2,
				filter: t => t.type === "Identifier",
			}), ["a", "b"]);
		});

		it("should retrieve all tokens and comments after a node with includeComments option", () => {
			check(getTokensAfterWithComments(VariableDeclarator.id, {
				includeComments: true,
			}), [
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
			check(getTokensAfterWithComments(VariableDeclarator.id, {
				includeComments: true,
				count: 3,
			}), ["B", "=", "C"]);
		});

		it("should retrieve matched tokens and comments after a node with includeComments and count and filter options", () => {
			check(getTokensAfterWithComments(VariableDeclarator.id, {
				includeComments: true,
				count: 3,
				filter: t => t.type.startsWith("Block"),
			}), ["B", "C", "D"]);
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
				getTokenAfterNode(VariableDeclarator.id).value,
				"=",
			);
		});

		it("should skip a given number of tokens", () => {
			assert.strictEqual(
				getTokenAfterNode(VariableDeclarator.id, 1).value,
				"a",
			);
			assert.strictEqual(
				getTokenAfterNode(VariableDeclarator.id, 2).value,
				"*",
			);
		});

		it("should skip a given number of tokens with skip option", () => {
			assert.strictEqual(
				getTokenAfterNode(VariableDeclarator.id, { skip: 1 }).value,
				"a",
			);
			assert.strictEqual(
				getTokenAfterNode(VariableDeclarator.id, { skip: 2 }).value,
				"*",
			);
		});

		it("should retrieve matched token with filter option", () => {
			assert.strictEqual(
				getTokenAfterNode(
					VariableDeclarator.id,
					t => t.type === "Identifier",
				).value,
				"a",
			);
			assert.strictEqual(
				getTokenAfterNode(VariableDeclarator.id, {
					filter: t => t.type === "Identifier",
				}).value,
				"a",
			);
		});

		it("should retrieve matched token with filter and skip options", () => {
			assert.strictEqual(
				getTokenAfterNode(VariableDeclarator.id, {
					skip: 1,
					filter: t => t.type === "Identifier",
				}).value,
				"b",
			);
		});

		it("should retrieve one token or comment after a node with includeComments option", () => {
			assert.strictEqual(
				getTokenAfterWithComments(VariableDeclarator.id, {
					includeComments: true,
				}).value,
				"B",
			);
		});

		it("should retrieve one token or comment after a node with includeComments and skip options", () => {
			assert.strictEqual(
				getTokenAfterWithComments(VariableDeclarator.id, {
					includeComments: true,
					skip: 2,
				}).value,
				"C",
			);
		});

		it("should retrieve one token or comment after a node with includeComments and skip and filter options", () => {
			assert.strictEqual(
				getTokenAfterWithComments(VariableDeclarator.id, {
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
			check(getFirstTokensFromNode(BinaryExpression, 0), []);
		});

		it("should retrieve one token from a node's token stream", () => {
			check(getFirstTokensFromNode(BinaryExpression, 1), ["a"]);
		});

		it("should retrieve more than one token from a node's token stream", () => {
			check(getFirstTokensFromNode(BinaryExpression, 2), ["a", "*"]);
		});

		it("should retrieve all tokens from a node's token stream", () => {
			check(getFirstTokensFromNode(BinaryExpression, 9e9), ["a", "*", "b"]);
		});

		it("should retrieve more than one token from a node's token stream with count option", () => {
			check(getFirstTokensFromNode(BinaryExpression, { count: 2 }), [
				"a",
				"*",
			]);
		});

		it("should retrieve matched tokens from a node's token stream with filter option", () => {
			check(
				getFirstTokensFromNode(
					BinaryExpression,
					t => t.type === "Identifier",
				),
				["a", "b"],
			);
			check(
				getFirstTokensFromNode(BinaryExpression, {
					filter: t => t.type === "Identifier",
				}),
				["a", "b"],
			);
		});

		it("should retrieve matched tokens from a node's token stream with filter and count options", () => {
			check(
				getFirstTokensFromNode(BinaryExpression, {
					count: 1,
					filter: t => t.type === "Identifier",
				}),
				["a"],
			);
		});

		it("should retrieve all tokens and comments from a node's token stream with includeComments option", () => {
			check(getFirstTokensWithComments(BinaryExpression, {
				includeComments: true,
			}), ["a", "D", "*", "b"]);
		});

		it("should retrieve several tokens and comments from a node's token stream with includeComments and count options", () => {
			check(getFirstTokensWithComments(BinaryExpression, {
				includeComments: true,
				count: 3,
			}), ["a", "D", "*"]);
		});

		it("should retrieve several tokens and comments from a node's token stream with includeComments and count and filter options", () => {
			check(getFirstTokensWithComments(BinaryExpression, {
				includeComments: true,
				count: 3,
				filter: t => t.value !== "a",
			}), ["D", "*", "b"]);
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
				getFirstTokenFromNode(BinaryExpression).value,
				"a",
			);
		});

		it("should skip a given number of tokens", () => {
			assert.strictEqual(
				getFirstTokenFromNode(BinaryExpression, 1).value,
				"*",
			);
			assert.strictEqual(
				getFirstTokenFromNode(BinaryExpression, 2).value,
				"b",
			);
		});

		it("should skip a given number of tokens with skip option", () => {
			assert.strictEqual(
				getFirstTokenFromNode(BinaryExpression, { skip: 1 }).value,
				"*",
			);
			assert.strictEqual(
				getFirstTokenFromNode(BinaryExpression, { skip: 2 }).value,
				"b",
			);
		});

		it("should retrieve matched token with filter option", () => {
			assert.strictEqual(
				getFirstTokenFromNode(
					BinaryExpression,
					t => t.type === "Identifier",
				).value,
				"a",
			);
			assert.strictEqual(
				getFirstTokenFromNode(BinaryExpression, {
					filter: t => t.type === "Identifier",
				}).value,
				"a",
			);
		});

		it("should retrieve matched token with filter and skip options", () => {
			assert.strictEqual(
				getFirstTokenFromNode(BinaryExpression, {
					skip: 1,
					filter: t => t.type === "Identifier",
				}).value,
				"b",
			);
		});

		it("should retrieve the first token or comment of a node's token stream with includeComments option", () => {
			assert.strictEqual(
				getFirstTokenWithComments(BinaryExpression, { includeComments: true })
					.value,
				"a",
			);
		});

		it("should retrieve the first matched token or comment of a node's token stream with includeComments and skip options", () => {
			assert.strictEqual(
				getFirstTokenWithComments(BinaryExpression, {
					includeComments: true,
					skip: 1,
				}).value,
				"D",
			);
		});

		it("should retrieve the first matched token or comment of a node's token stream with includeComments and skip and filter options", () => {
			assert.strictEqual(
				getFirstTokenWithComments(BinaryExpression, {
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
			check(getLastTokensFromNode(BinaryExpression, 0), []);
		});

		it("should retrieve one token from the end of a node's token stream", () => {
			check(getLastTokensFromNode(BinaryExpression, 1), ["b"]);
		});

		it("should retrieve more than one token from the end of a node's token stream", () => {
			check(getLastTokensFromNode(BinaryExpression, 2), ["*", "b"]);
		});

		it("should retrieve all tokens from the end of a node's token stream", () => {
			check(getLastTokensFromNode(BinaryExpression, 9e9), ["a", "*", "b"]);
		});

		it("should retrieve more than one token from the end of a node's token stream with count option", () => {
			check(getLastTokensFromNode(BinaryExpression, { count: 2 }), [
				"*",
				"b",
			]);
		});

		it("should retrieve matched tokens from the end of a node's token stream with filter option", () => {
			check(
				getLastTokensFromNode(
					BinaryExpression,
					t => t.type === "Identifier",
				),
				["a", "b"],
			);
			check(
				getLastTokensFromNode(BinaryExpression, {
					filter: t => t.type === "Identifier",
				}),
				["a", "b"],
			);
		});

		it("should retrieve matched tokens from the end of a node's token stream with filter and count options", () => {
			check(
				getLastTokensFromNode(BinaryExpression, {
					count: 1,
					filter: t => t.type === "Identifier",
				}),
				["b"],
			);
		});

		it("should retrieve all tokens from the end of a node's token stream with includeComments option", () => {
			check(getLastTokensWithComments(BinaryExpression, {
				includeComments: true,
			}), ["a", "D", "*", "b"]);
		});

		it("should retrieve matched tokens from the end of a node's token stream with includeComments and count options", () => {
			check(getLastTokensWithComments(BinaryExpression, {
				includeComments: true,
				count: 3,
			}), ["D", "*", "b"]);
		});

		it("should retrieve matched tokens from the end of a node's token stream with includeComments and count and filter options", () => {
			check(getLastTokensWithComments(BinaryExpression, {
				includeComments: true,
				count: 3,
				filter: t => t.type !== "Punctuator",
			}), ["a", "D", "b"]);
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
			assert.strictEqual(getLastTokenFromNode(BinaryExpression).value, "b");
			assert.strictEqual(
				getLastTokenFromNode(VariableDeclaration).value,
				"b",
			);
		});

		it("should skip a given number of tokens", () => {
			assert.strictEqual(
				getLastTokenFromNode(BinaryExpression, 1).value,
				"*",
			);
			assert.strictEqual(
				getLastTokenFromNode(BinaryExpression, 2).value,
				"a",
			);
		});

		it("should skip a given number of tokens with skip option", () => {
			assert.strictEqual(
				getLastTokenFromNode(BinaryExpression, { skip: 1 }).value,
				"*",
			);
			assert.strictEqual(
				getLastTokenFromNode(BinaryExpression, { skip: 2 }).value,
				"a",
			);
		});

		it("should retrieve the last matched token of a node's token stream with filter option", () => {
			assert.strictEqual(
				getLastTokenFromNode(BinaryExpression, t => t.value !== "b")
					.value,
				"*",
			);
			assert.strictEqual(
				getLastTokenFromNode(BinaryExpression, {
					filter: t => t.value !== "b",
				}).value,
				"*",
			);
		});

		it("should retrieve the last matched token of a node's token stream with filter and skip options", () => {
			assert.strictEqual(
				getLastTokenFromNode(BinaryExpression, {
					skip: 1,
					filter: t => t.type === "Identifier",
				}).value,
				"a",
			);
		});

		it("should retrieve the last token of a node's token stream with includeComments option", () => {
			assert.strictEqual(
				getLastTokenWithComments(BinaryExpression, { includeComments: true })
					.value,
				"b",
			);
		});

		it("should retrieve the last token of a node's token stream with includeComments and skip options", () => {
			assert.strictEqual(
				getLastTokenWithComments(BinaryExpression, {
					includeComments: true,
					skip: 2,
				}).value,
				"D",
			);
		});

		it("should retrieve the last token of a node's token stream with includeComments and skip and filter options", () => {
			assert.strictEqual(
				getLastTokenWithComments(BinaryExpression, {
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
				getFirstTokensBetweenNodes(BinaryExpression, CallExpression),
				[],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with count option", () => {
			check(
				getFirstTokensBetweenNodes(
					VariableDeclarator.id,
					BinaryExpression.right,
					2,
				),
				["=", "a"],
			);
			check(
				getFirstTokensBetweenNodes(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ count: 2 },
				),
				["=", "a"],
			);
		});

		it("should retrieve matched tokens between non-adjacent nodes with filter option", () => {
			check(
				getFirstTokensBetweenNodes(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ filter: t => t.type !== "Punctuator" },
				),
				["a"],
			);
		});

		it("should retrieve all tokens between non-adjacent nodes with empty object option", () => {
			check(
				getFirstTokensBetweenNodes(
					VariableDeclarator.id,
					BinaryExpression.right,
					{},
				),
				["=", "a", "*"],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with includeComments option", () => {
			check(
				getFirstTokensBetweenNodes(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true },
				),
				["B", "=", "C", "a", "D", "*"],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with includeComments and count options", () => {
			check(
				getFirstTokensBetweenNodes(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true, count: 3 },
				),
				["B", "=", "C"],
			);
		});

		it("should retrieve multiple tokens and comments between non-adjacent nodes with includeComments and filter options", () => {
			check(
				getFirstTokensBetweenNodes(
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
				getFirstTokenBetweenNodes(BinaryExpression, CallExpression),
				null,
			);
		});

		it("should retrieve one token between non-adjacent nodes with count option", () => {
			assert.strictEqual(
				getFirstTokenBetweenNodes(
					VariableDeclarator.id,
					BinaryExpression.right,
				).value,
				"=",
			);
		});

		it("should retrieve one token between non-adjacent nodes with skip option", () => {
			assert.strictEqual(
				getFirstTokenBetweenNodes(
					VariableDeclarator.id,
					BinaryExpression.right,
					1,
				).value,
				"a",
			);
			assert.strictEqual(
				getFirstTokenBetweenNodes(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ skip: 2 },
				).value,
				"*",
			);
		});

		it("should return null if it's skipped beyond the right token", () => {
			assert.strictEqual(
				getFirstTokenBetweenNodes(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ skip: 3 },
				),
				null,
			);
			assert.strictEqual(
				getFirstTokenBetweenNodes(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ skip: 4 },
				),
				null,
			);
		});

		it("should retrieve the first matched token between non-adjacent nodes with filter option", () => {
			assert.strictEqual(
				getFirstTokenBetweenNodes(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ filter: t => t.type !== "Identifier" },
				).value,
				"=",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments option", () => {
			assert.strictEqual(
				getFirstTokenBetweenNodes(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true },
				).value,
				"B",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip options", () => {
			assert.strictEqual(
				getFirstTokenBetweenNodes(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true, skip: 1 },
				).value,
				"=",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip and filter options", () => {
			assert.strictEqual(
				getFirstTokenBetweenNodes(
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
				getLastTokensBetweenNodes(BinaryExpression, CallExpression),
				[],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with count option", () => {
			check(
				getLastTokensBetweenNodes(
					VariableDeclarator.id,
					BinaryExpression.right,
					2,
				),
				["a", "*"],
			);
			check(
				getLastTokensBetweenNodes(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ count: 2 },
				),
				["a", "*"],
			);
		});

		it("should retrieve matched tokens between non-adjacent nodes with filter option", () => {
			check(
				getLastTokensBetweenNodes(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ filter: t => t.type !== "Punctuator" },
				),
				["a"],
			);
		});

		it("should retrieve all tokens between non-adjacent nodes with empty object option", () => {
			check(
				getLastTokensBetweenNodes(
					VariableDeclarator.id,
					BinaryExpression.right,
					{},
				),
				["=", "a", "*"],
			);
		});

		it("should retrieve all tokens and comments between non-adjacent nodes with includeComments option", () => {
			check(
				getLastTokensBetweenNodes(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true },
				),
				["B", "=", "C", "a", "D", "*"],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with includeComments and count options", () => {
			check(
				getLastTokensBetweenNodes(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true, count: 3 },
				),
				["a", "D", "*"],
			);
		});

		it("should retrieve multiple tokens and comments between non-adjacent nodes with includeComments and filter options", () => {
			check(
				getLastTokensBetweenNodes(
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
				getLastTokenBetweenNodes(BinaryExpression, CallExpression),
				null,
			);
		});

		it("should retrieve one token between non-adjacent nodes with count option", () => {
			assert.strictEqual(
				getLastTokenBetweenNodes(
					VariableDeclarator.id,
					BinaryExpression.right,
				).value,
				"*",
			);
		});

		it("should retrieve one token between non-adjacent nodes with skip option", () => {
			assert.strictEqual(
				getLastTokenBetweenNodes(
					VariableDeclarator.id,
					BinaryExpression.right,
					1,
				).value,
				"a",
			);
			assert.strictEqual(
				getLastTokenBetweenNodes(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ skip: 2 },
				).value,
				"=",
			);
		});

		it("should return null if it's skipped beyond the right token", () => {
			assert.strictEqual(
				getLastTokenBetweenNodes(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ skip: 3 },
				),
				null,
			);
			assert.strictEqual(
				getLastTokenBetweenNodes(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ skip: 4 },
				),
				null,
			);
		});

		it("should retrieve the first matched token between non-adjacent nodes with filter option", () => {
			assert.strictEqual(
				getLastTokenBetweenNodes(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ filter: t => t.type !== "Identifier" },
				).value,
				"*",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments option", () => {
			assert.strictEqual(
				getLastTokenBetweenNodes(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true },
				).value,
				"*",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip options", () => {
			assert.strictEqual(
				getLastTokenBetweenNodes(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true, skip: 1 },
				).value,
				"D",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip and filter options", () => {
			assert.strictEqual(
				getLastTokenBetweenNodes(
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
			check(getTokensBetweenNodes(BinaryExpression, CallExpression), []);
		});

		it("should retrieve one token between nodes", () => {
			check(
				getTokensBetweenNodes(
					BinaryExpression.left,
					BinaryExpression.right,
				),
				["*"],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes", () => {
			check(
				getTokensBetweenNodes(
					VariableDeclarator.id,
					BinaryExpression.right,
				),
				["=", "a", "*"],
			);
		});

		it("should retrieve surrounding tokens when asked for padding", () => {
			check(
				getTokensBetweenNodes(
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
			const result = getTokenByRangeStartIndex(9);

			assert.strictEqual(result.type, "Identifier");
			assert.strictEqual(result.value, "answer");
		});

		it("should return null when token doesn't exist", () => {
			const result = getTokenByRangeStartIndex(10);

			assert.isNull(result);
		});

		it("should return a comment token when includeComments is true", () => {
			const result = getTokenByRangeStartIndex(15, {
				includeComments: true,
			});

			assert.strictEqual(result.type, "Block");
			assert.strictEqual(result.value, "B");
		});

		it("should not return a comment token at the supplied index when includeComments is false", () => {
			const result = getTokenByRangeStartIndex(15, {
				includeComments: false,
			});

			assert.isNull(result);
		});

		it("should not return comment tokens by default", () => {
			const result = getTokenByRangeStartIndex(15);

			assert.isNull(result);
		});
	});

	describe("when calling getFirstToken & getTokenAfter", () => {
		it("should retrieve all tokens and comments in the node", () => {
			const code = "(function(a, /*b,*/ c){})";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const tokens = getAllTokensAndCommentsInNode(ast, {
				includeComments: true,
			});

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
			const tokens = getAllTokensAndCommentsInNode(ast, {
				includeComments: true,
			});

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
			const tokens = getAllTokensAndCommentsInNodeReverse(ast, {
				includeComments: true,
			});

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
			const tokens = getAllTokensAndCommentsInNodeReverse(ast, {
				includeComments: true,
			});

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

	describe("when calling commentsExistBetween", () => {
		it("should retrieve false if comments don't exist", () => {
			assert.isFalse(
				commentsExistBetweenTokens(AST.tokens[0], AST.tokens[1]),
			);
		});

		it("should retrieve true if comments exist", () => {
			assert.isTrue(
				commentsExistBetweenTokens(AST.tokens[1], AST.tokens[2]),
			);
		});
	});

	describe("getCommentsBefore", () => {
		it("should retrieve comments before a node", () => {
			assert.strictEqual(
				getCommentsBeforeNodeOrToken(VariableDeclaration)[0].value,
				"A",
			);
		});

		it("should retrieve comments before a token", () => {
			assert.strictEqual(
				getCommentsBeforeNodeOrToken(TOKENS[2] /* "=" token */)[0].value,
				"B",
			);
		});

		it("should retrieve multiple comments before a node", () => {
			const comments = getCommentsBeforeNodeOrToken(CallExpression);

			assert.strictEqual(comments.length, 2);
			assert.strictEqual(comments[0].value, "E");
			assert.strictEqual(comments[1].value, "F");
		});

		it("should return an empty array for a Program node", () => {
			check(getCommentsBeforeNodeOrToken(Program), []);
		});

		it("should return an empty array if there are no comments before a node or token", () => {
			check(getCommentsBeforeNodeOrToken(BinaryExpression.right), []);
			check(getCommentsBeforeNodeOrToken(TOKENS[1]), []);
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
				getCommentsAfterNodeOrToken(VariableDeclarator.id)[0].value,
				"B",
			);
		});

		it("should retrieve comments after a token", () => {
			assert.strictEqual(
				getCommentsAfterNodeOrToken(TOKENS[2] /* "=" token */)[0].value,
				"C",
			);
		});

		it("should retrieve multiple comments after a node", () => {
			const comments = getCommentsAfterNodeOrToken(VariableDeclaration);

			assert.strictEqual(comments.length, 2);
			assert.strictEqual(comments[0].value, "E");
			assert.strictEqual(comments[1].value, "F");
		});

		it("should return an empty array for a Program node", () => {
			check(getCommentsAfterNodeOrToken(Program), []);
		});

		it("should return an empty array if there are no comments after a node or token", () => {
			check(getCommentsAfterNodeOrToken(CallExpression.callee), []);
			check(getCommentsAfterNodeOrToken(TOKENS[0]), []);
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
			check(getCommentsInsideNode(Program), [
				"A",
				"B",
				"C",
				"D",
				"E",
				"F",
				"Z",
			]);
			check(getCommentsInsideNode(VariableDeclaration), [
				"B",
				"C",
				"D",
			]);
			check(getCommentsInsideNode(VariableDeclarator), ["B", "C", "D"]);
			check(getCommentsInsideNode(BinaryExpression), ["D"]);
		});

		it("should return an empty array if a node does not contain any comments", () => {
			check(getCommentsInsideNode(TOKENS[2]), []);
		});
	});
});