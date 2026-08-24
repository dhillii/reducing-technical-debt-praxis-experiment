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
	 * Retrieves tokens for a node with optional padding and filters.
	 * @param {ASTNode} node The AST node.
	 * @param {number|Object} [options] Count or options object.
	 * @param {number} [options.countBefore=0] Number of tokens before the node.
	 * @param {number} [options.countAfter=0] Number of tokens after the node.
	 * @param {Function} [options.filter] Filter function.
	 * @param {boolean} [options.includeComments=false] Whether to include comments.
	 * @returns {Token[]} Array of tokens.
	 */
	function getTokensForNode(node, options) {
		const countBefore = typeof options === "number" ? options : (options && options.countBefore) || 0;
		const countAfter = typeof options === "number" ? 0 : (options && options.countAfter) || 0;
		const filter = typeof options === "function" ? options : (options && options.filter) || null;
		const includeComments = options && options.includeComments;

		return store.getTokens(node, {
			countBefore,
			countAfter,
			filter,
			includeComments,
		});
	}

	/**
	 * Retrieves tokens before a node with optional count and filters.
	 * @param {ASTNode} node The AST node.
	 * @param {number|Object} [options] Count or options object.
	 * @param {number} [options.count=0] Number of tokens to retrieve.
	 * @param {Function} [options.filter] Filter function.
	 * @param {boolean} [options.includeComments=false] Whether to include comments.
	 * @returns {Token[]} Array of tokens.
	 */
	function getTokensBeforeNode(node, options) {
		const count = typeof options === "number" ? options : (options && options.count) || 0;
		const filter = typeof options === "function" ? options : (options && options.filter) || null;
		const includeComments = options && options.includeComments;

		return store.getTokensBefore(node, {
			count,
			filter,
			includeComments,
		});
	}

	/**
	 * Retrieves a single token before a node with optional skip and filters.
	 * @param {ASTNode} node The AST node.
	 * @param {number|Object} [options] Skip count or options object.
	 * @param {number} [options.skip=0] Number of tokens to skip.
	 * @param {Function} [options.filter] Filter function.
	 * @param {boolean} [options.includeComments=false] Whether to include comments.
	 * @returns {Token|null} The token or null.
	 */
	function getTokenBeforeNode(node, options) {
		const skip = typeof options === "number" ? options : (options && options.skip) || 0;
		const filter = typeof options === "function" ? options : (options && options.filter) || null;
		const includeComments = options && options.includeComments;

		return store.getTokenBefore(node, {
			skip,
			filter,
			includeComments,
		});
	}

	/**
	 * Retrieves tokens after a node with optional count and filters.
	 * @param {ASTNode} node The AST node.
	 * @param {number|Object} [options] Count or options object.
	 * @param {number} [options.count=0] Number of tokens to retrieve.
	 * @param {Function} [options.filter] Filter function.
	 * @param {boolean} [options.includeComments=false] Whether to include comments.
	 * @returns {Token[]} Array of tokens.
	 */
	function getTokensAfterNode(node, options) {
		const count = typeof options === "number" ? options : (options && options.count) || 0;
		const filter = typeof options === "function" ? options : (options && options.filter) || null;
		const includeComments = options && options.includeComments;

		return store.getTokensAfter(node, {
			count,
			filter,
			includeComments,
		});
	}

	/**
	 * Retrieves a single token after a node with optional skip and filters.
	 * @param {ASTNode} node The AST node.
	 * @param {number|Object} [options] Skip count or options object.
	 * @param {number} [options.skip=0] Number of tokens to skip.
	 * @param {Function} [options.filter] Filter function.
	 * @param {boolean} [options.includeComments=false] Whether to include comments.
	 * @returns {Token|null} The token or null.
	 */
	function getTokenAfterNode(node, options) {
		const skip = typeof options === "number" ? options : (options && options.skip) || 0;
		const filter = typeof options === "function" ? options : (options && options.filter) || null;
		const includeComments = options && options.includeComments;

		return store.getTokenAfter(node, {
			skip,
			filter,
			includeComments,
		});
	}

	/**
	 * Retrieves first tokens from a node with optional count and filters.
	 * @param {ASTNode} node The AST node.
	 * @param {number|Object} [options] Count or options object.
	 * @param {number} [options.count=0] Number of tokens to retrieve.
	 * @param {Function} [options.filter] Filter function.
	 * @param {boolean} [options.includeComments=false] Whether to include comments.
	 * @returns {Token[]} Array of tokens.
	 */
	function getFirstTokensForNode(node, options) {
		const count = typeof options === "number" ? options : (options && options.count) || 0;
		const filter = typeof options === "function" ? options : (options && options.filter) || null;
		const includeComments = options && options.includeComments;

		return store.getFirstTokens(node, {
			count,
			filter,
			includeComments,
		});
	}

	/**
	 * Retrieves first token from a node with optional skip and filters.
	 * @param {ASTNode} node The AST node.
	 * @param {number|Object} [options] Skip count or options object.
	 * @param {number} [options.skip=0] Number of tokens to skip.
	 * @param {Function} [options.filter] Filter function.
	 * @param {boolean} [options.includeComments=false] Whether to include comments.
	 * @returns {Token|null} The token or null.
	 */
	function getFirstTokenForNode(node, options) {
		const skip = typeof options === "number" ? options : (options && options.skip) || 0;
		const filter = typeof options === "function" ? options : (options && options.filter) || null;
		const includeComments = options && options.includeComments;

		return store.getFirstToken(node, {
			skip,
			filter,
			includeComments,
		});
	}

	/**
	 * Retrieves last tokens from a node with optional count and filters.
	 * @param {ASTNode} node The AST node.
	 * @param {number|Object} [options] Count or options object.
	 * @param {number} [options.count=0] Number of tokens to retrieve.
	 * @param {Function} [options.filter] Filter function.
	 * @param {boolean} [options.includeComments=false] Whether to include comments.
	 * @returns {Token[]} Array of tokens.
	 */
	function getLastTokensForNode(node, options) {
		const count = typeof options === "number" ? options : (options && options.count) || 0;
		const filter = typeof options === "function" ? options : (options && options.filter) || null;
		const includeComments = options && options.includeComments;

		return store.getLastTokens(node, {
			count,
			filter,
			includeComments,
		});
	}

	/**
	 * Retrieves last token from a node with optional skip and filters.
	 * @param {ASTNode} node The AST node.
	 * @param {number|Object} [options] Skip count or options object.
	 * @param {number} [options.skip=0] Number of tokens to skip.
	 * @param {Function} [options.filter] Filter function.
	 * @param {boolean} [options.includeComments=false] Whether to include comments.
	 * @returns {Token|null} The token or null.
	 */
	function getLastTokenForNode(node, options) {
		const skip = typeof options === "number" ? options : (options && options.skip) || 0;
		const filter = typeof options === "function" ? options : (options && options.filter) || null;
		const includeComments = options && options.includeComments;

		return store.getLastToken(node, {
			skip,
			filter,
			includeComments,
		});
	}

	/**
	 * Retrieves first tokens between two nodes with optional count and filters.
	 * @param {ASTNode} leftNode The left AST node.
	 * @param {ASTNode} rightNode The right AST node.
	 * @param {number|Object} [options] Count or options object.
	 * @param {number} [options.count=0] Number of tokens to retrieve.
	 * @param {Function} [options.filter] Filter function.
	 * @param {boolean} [options.includeComments=false] Whether to include comments.
	 * @returns {Token[]} Array of tokens.
	 */
	function getFirstTokensBetweenNodes(leftNode, rightNode, options) {
		const count = typeof options === "number" ? options : (options && options.count) || 0;
		const filter = typeof options === "function" ? options : (options && options.filter) || null;
		const includeComments = options && options.includeComments;

		return store.getFirstTokensBetween(leftNode, rightNode, {
			count,
			filter,
			includeComments,
		});
	}

	/**
	 * Retrieves first token between two nodes with optional skip and filters.
	 * @param {ASTNode} leftNode The left AST node.
	 * @param {ASTNode} rightNode The right AST node.
	 * @param {number|Object} [options] Skip count or options object.
	 * @param {number} [options.skip=0] Number of tokens to skip.
	 * @param {Function} [options.filter] Filter function.
	 * @param {boolean} [options.includeComments=false] Whether to include comments.
	 * @returns {Token|null} The token or null.
	 */
	function getFirstTokenBetweenNodes(leftNode, rightNode, options) {
		const skip = typeof options === "number" ? options : (options && options.skip) || 0;
		const filter = typeof options === "function" ? options : (options && options.filter) || null;
		const includeComments = options && options.includeComments;

		return store.getFirstTokenBetween(leftNode, rightNode, {
			skip,
			filter,
			includeComments,
		});
	}

	/**
	 * Retrieves last tokens between two nodes with optional count and filters.
	 * @param {ASTNode} leftNode The left AST node.
	 * @param {ASTNode} rightNode The right AST node.
	 * @param {number|Object} [options] Count or options object.
	 * @param {number} [options.count=0] Number of tokens to retrieve.
	 * @param {Function} [options.filter] Filter function.
	 * @param {boolean} [options.includeComments=false] Whether to include comments.
	 * @returns {Token[]} Array of tokens.
	 */
	function getLastTokensBetweenNodes(leftNode, rightNode, options) {
		const count = typeof options === "number" ? options : (options && options.count) || 0;
		const filter = typeof options === "function" ? options : (options && options.filter) || null;
		const includeComments = options && options.includeComments;

		return store.getLastTokensBetween(leftNode, rightNode, {
			count,
			filter,
			includeComments,
		});
	}

	/**
	 * Retrieves last token between two nodes with optional skip and filters.
	 * @param {ASTNode} leftNode The left AST node.
	 * @param {ASTNode} rightNode The right AST node.
	 * @param {number|Object} [options] Skip count or options object.
	 * @param {number} [options.skip=0] Number of tokens to skip.
	 * @param {Function} [options.filter] Filter function.
	 * @param {boolean} [options.includeComments=false] Whether to include comments.
	 * @returns {Token|null} The token or null.
	 */
	function getLastTokenBetweenNodes(leftNode, rightNode, options) {
		const skip = typeof options === "number" ? options : (options && options.skip) || 0;
		const filter = typeof options === "function" ? options : (options && options.filter) || null;
		const includeComments = options && options.includeComments;

		return store.getLastTokenBetween(leftNode, rightNode, {
			skip,
			filter,
			includeComments,
		});
	}

	/**
	 * Retrieves tokens between two nodes with optional padding.
	 * @param {ASTNode} leftNode The left AST node.
	 * @param {ASTNode} rightNode The right AST node.
	 * @param {number|Object} [options] Padding or options object.
	 * @param {number} [options.padding=0] Number of tokens to pad.
	 * @returns {Token[]} Array of tokens.
	 */
	function getTokensBetweenNodes(leftNode, rightNode, options) {
		const padding = typeof options === "number" ? options : (options && options.padding) || 0;

		return store.getTokensBetween(leftNode, rightNode, padding);
	}

	/**
	 * Retrieves comments before a node or token.
	 * @param {ASTNode|Token} nodeOrToken The node or token.
	 * @returns {Comment[]} Array of comments.
	 */
	function getCommentsBeforeNodeOrToken(nodeOrToken) {
		return store.getCommentsBefore(nodeOrToken);
	}

	/**
	 * Retrieves comments after a node or token.
	 * @param {ASTNode|Token} nodeOrToken The node or token.
	 * @returns {Comment[]} Array of comments.
	 */
	function getCommentsAfterNodeOrToken(nodeOrToken) {
		return store.getCommentsAfter(nodeOrToken);
	}

	/**
	 * Retrieves comments inside a node.
	 * @param {ASTNode} node The AST node.
	 * @returns {Comment[]} Array of comments.
	 */
	function getCommentsInsideNode(node) {
		return store.getCommentsInside(node);
	}

	/**
	 * Checks if comments exist between two tokens.
	 * @param {Token} leftToken The left token.
	 * @param {Token} rightToken The right token.
	 * @returns {boolean} True if comments exist between the tokens.
	 */
	function commentsExistBetweenTokens(leftToken, rightToken) {
		return store.commentsExistBetween(leftToken, rightToken);
	}

	/**
	 * Retrieves a token by range start index with optional includeComments.
	 * @param {number} index The range start index.
	 * @param {Object} [options] Options object.
	 * @param {boolean} [options.includeComments=false] Whether to include comments.
	 * @returns {Token|null} The token or null.
	 */
	function getTokenByRangeStartIndex(index, options) {
		return store.getTokenByRangeStart(index, options);
	}

	/**
	 * Retrieves all tokens and comments in a node by traversing from first token.
	 * @param {ASTNode} node The AST node.
	 * @param {Object} options Options object.
	 * @param {boolean} options.includeComments Whether to include comments.
	 * @returns {Token[]} Array of tokens.
	 */
	function getAllTokensAndCommentsFromFirst(node, options) {
		const tokens = [];
		let token = store.getFirstToken(node, options);

		while (token) {
			tokens.push(token);
			token = store.getTokenAfter(token, options);
		}

		return tokens;
	}

	/**
	 * Retrieves all tokens and comments in a node by traversing from last token.
	 * @param {ASTNode} node The AST node.
	 * @param {Object} options Options object.
	 * @param {boolean} options.includeComments Whether to include comments.
	 * @returns {Token[]} Array of tokens.
	 */
	function getAllTokensAndCommentsFromLast(node, options) {
		const tokens = [];
		let token = store.getLastToken(node, options);

		while (token) {
			tokens.push(token);
			token = store.getTokenBefore(token, options);
		}

		return tokens.reverse();
	}

	// Tests
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
			check(getTokensForNode(BinaryExpression, { countAfter: 1 }), ["a", "*", "b", "call"]);
		});

		it("should retrieve all tokens plus two before and one after for binary expression", () => {
			check(getTokensForNode(BinaryExpression, { countBefore: 2, countAfter: 1 }), [
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
				getTokensForNode(Program, t => t.type === "Identifier"),
				["answer", "a", "b", "call"],
			);
			check(
				getTokensForNode(Program, {
					filter: t => t.type === "Identifier",
				}),
				["answer", "a", "b", "call"],
			);
		});

		it("should retrieve all tokens and comments in the node for root node with includeComments option", () => {
			check(getTokensForNode(Program, { includeComments: true }), [
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
				getTokensForNode(Program, {
					includeComments: true,
					filter: t => t.type.startsWith("Block"),
				}),
				["A", "B", "C", "D", "E", "Z"],
			);
		});

		it("should retrieve all tokens and comments in the node for binary expression with includeComments option", () => {
			check(
				getTokensForNode(BinaryExpression, { includeComments: true }),
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
			check(
				getTokensBeforeNode(BinaryExpression, {
					count: 1,
					filter: t => t.value !== "=",
				}),
				["answer"],
			);
		});

		it("should retrieve all matched tokens before a node with filter option", () => {
			check(
				getTokensBeforeNode(BinaryExpression, {
					filter: t => t.value !== "answer",
				}),
				["var", "="],
			);
		});

		it("should retrieve no tokens before the root node", () => {
			check(getTokensBeforeNode(Program, { count: 1 }), []);
		});

		it("should retrieve tokens and comments before a node with count and includeComments option", () => {
			check(
				getTokensBeforeNode(BinaryExpression, {
					count: 3,
					includeComments: true,
				}),
				["B", "=", "C"],
			);
		});

		it("should retrieve all tokens and comments before a node with includeComments option only", () => {
			check(
				getTokensBeforeNode(BinaryExpression, {
					includeComments: true,
				}),
				["A", "var", "answer", "B", "=", "C"],
			);
		});

		it("should retrieve all tokens and comments before a node with includeComments and filter options", () => {
			check(
				getTokensBeforeNode(BinaryExpression, {
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
				getTokenBeforeNode(BinaryExpression, {
					includeComments: true,
				}).value,
				"C",
			);
		});

		it("should retrieve one token or comment before a node with includeComments and skip options", () => {
			assert.strictEqual(
				getTokenBeforeNode(BinaryExpression, {
					includeComments: true,
					skip: 1,
				}).value,
				"=",
			);
		});

		it("should retrieve one token or comment before a node with includeComments and skip and filter options", () => {
			assert.strictEqual(
				getTokenBeforeNode(BinaryExpression, {
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
			check(
				getTokensAfterNode(VariableDeclarator.id, {
					filter: t => t.type === "Identifier",
				}),
				["a", "b", "call"],
			);
		});

		it("should retrieve matched tokens after a node with count and filter options", () => {
			check(
				getTokensAfterNode(VariableDeclarator.id, {
					count: 2,
					filter: t => t.type === "Identifier",
				}),
				["a", "b"],
			);
		});

		it("should retrieve all tokens and comments after a node with includeComments option", () => {
			check(
				getTokensAfterNode(VariableDeclarator.id, {
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
				getTokensAfterNode(VariableDeclarator.id, {
					includeComments: true,
					count: 3,
				}),
				["B", "=", "C"],
			);
		});

		it("should retrieve matched tokens and comments after a node with includeComments and count and filter options", () => {
			check(
				getTokensAfterNode(VariableDeclarator.id, {
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
				getTokenAfterNode(VariableDeclarator.id, {
					includeComments: true,
				}).value,
				"B",
			);
		});

		it("should retrieve one token or comment after a node with includeComments and skip options", () => {
			assert.strictEqual(
				getTokenAfterNode(VariableDeclarator.id, {
					includeComments: true,
					skip: 2,
				}).value,
				"C",
			);
		});

		it("should retrieve one token or comment after a node with includeComments and skip and filter options", () => {
			assert.strictEqual(
				getTokenAfterNode(VariableDeclarator.id, {
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
			check(getFirstTokensForNode(BinaryExpression, 0), []);
		});

		it("should retrieve one token from a node's token stream", () => {
			check(getFirstTokensForNode(BinaryExpression, 1), ["a"]);
		});

		it("should retrieve more than one token from a node's token stream", () => {
			check(getFirstTokensForNode(BinaryExpression, 2), ["a", "*"]);
		});

		it("should retrieve all tokens from a node's token stream", () => {
			check(getFirstTokensForNode(BinaryExpression, 9e9), ["a", "*", "b"]);
		});

		it("should retrieve more than one token from a node's token stream with count option", () => {
			check(getFirstTokensForNode(BinaryExpression, { count: 2 }), [
				"a",
				"*",
			]);
		});

		it("should retrieve matched tokens from a node's token stream with filter option", () => {
			check(
				getFirstTokensForNode(
					BinaryExpression,
					t => t.type === "Identifier",
				),
				["a", "b"],
			);
			check(
				getFirstTokensForNode(BinaryExpression, {
					filter: t => t.type === "Identifier",
				}),
				["a", "b"],
			);
		});

		it("should retrieve matched tokens from a node's token stream with filter and count options", () => {
			check(
				getFirstTokensForNode(BinaryExpression, {
					count: 1,
					filter: t => t.type === "Identifier",
				}),
				["a"],
			);
		});

		it("should retrieve all tokens and comments from a node's token stream with includeComments option", () => {
			check(
				getFirstTokensForNode(BinaryExpression, {
					includeComments: true,
				}),
				["a", "D", "*", "b"],
			);
		});

		it("should retrieve several tokens and comments from a node's token stream with includeComments and count options", () => {
			check(
				getFirstTokensForNode(BinaryExpression, {
					includeComments: true,
					count: 3,
				}),
				["a", "D", "*"],
			);
		});

		it("should retrieve several tokens and comments from a node's token stream with includeComments and count and filter options", () => {
			check(
				getFirstTokensForNode(BinaryExpression, {
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
				getFirstTokenForNode(BinaryExpression).value,
				"a",
			);
		});

		it("should skip a given number of tokens", () => {
			assert.strictEqual(
				getFirstTokenForNode(BinaryExpression, 1).value,
				"*",
			);
			assert.strictEqual(
				getFirstTokenForNode(BinaryExpression, 2).value,
				"b",
			);
		});

		it("should skip a given number of tokens with skip option", () => {
			assert.strictEqual(
				getFirstTokenForNode(BinaryExpression, { skip: 1 }).value,
				"*",
			);
			assert.strictEqual(
				getFirstTokenForNode(BinaryExpression, { skip: 2 }).value,
				"b",
			);
		});

		it("should retrieve matched token with filter option", () => {
			assert.strictEqual(
				getFirstTokenForNode(
					BinaryExpression,
					t => t.type === "Identifier",
				).value,
				"a",
			);
			assert.strictEqual(
				getFirstTokenForNode(BinaryExpression, {
					filter: t => t.type === "Identifier",
				}).value,
				"a",
			);
		});

		it("should retrieve matched token with filter and skip options", () => {
			assert.strictEqual(
				getFirstTokenForNode(BinaryExpression, {
					skip: 1,
					filter: t => t.type === "Identifier",
				}).value,
				"b",
			);
		});

		it("should retrieve the first token or comment of a node's token stream with includeComments option", () => {
			assert.strictEqual(
				getFirstTokenForNode(BinaryExpression, { includeComments: true })
					.value,
				"a",
			);
		});

		it("should retrieve the first matched token or comment of a node's token stream with includeComments and skip options", () => {
			assert.strictEqual(
				getFirstTokenForNode(BinaryExpression, {
					includeComments: true,
					skip: 1,
				}).value,
				"D",
			);
		});

		it("should retrieve the first matched token or comment of a node's token stream with includeComments and skip and filter options", () => {
			assert.strictEqual(
				getFirstTokenForNode(BinaryExpression, {
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
			check(getLastTokensForNode(BinaryExpression, 0), []);
		});

		it("should retrieve one token from the end of a node's token stream", () => {
			check(getLastTokensForNode(BinaryExpression, 1), ["b"]);
		});

		it("should retrieve more than one token from the end of a node's token stream", () => {
			check(getLastTokensForNode(BinaryExpression, 2), ["*", "b"]);
		});

		it("should retrieve all tokens from the end of a node's token stream", () => {
			check(getLastTokensForNode(BinaryExpression, 9e9), ["a", "*", "b"]);
		});

		it("should retrieve more than one token from the end of a node's token stream with count option", () => {
			check(getLastTokensForNode(BinaryExpression, { count: 2 }), [
				"*",
				"b",
			]);
		});

		it("should retrieve matched tokens from the end of a node's token stream with filter option", () => {
			check(
				getLastTokensForNode(
					BinaryExpression,
					t => t.type === "Identifier",
				),
				["a", "b"],
			);
			check(
				getLastTokensForNode(BinaryExpression, {
					filter: t => t.type === "Identifier",
				}),
				["a", "b"],
			);
		});

		it("should retrieve matched tokens from the end of a node's token stream with filter and count options", () => {
			check(
				getLastTokensForNode(BinaryExpression, {
					count: 1,
					filter: t => t.type === "Identifier",
				}),
				["b"],
			);
		});

		it("should retrieve all tokens from the end of a node's token stream with includeComments option", () => {
			check(
				getLastTokensForNode(BinaryExpression, {
					includeComments: true,
				}),
				["a", "D", "*", "b"],
			);
		});

		it("should retrieve matched tokens from the end of a node's token stream with includeComments and count options", () => {
			check(
				getLastTokensForNode(BinaryExpression, {
					includeComments: true,
					count: 3,
				}),
				["D", "*", "b"],
			);
		});

		it("should retrieve matched tokens from the end of a node's token stream with includeComments and count and filter options", () => {
			check(
				getLastTokensForNode(BinaryExpression, {
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
			assert.strictEqual(getLastTokenForNode(BinaryExpression).value, "b");
			assert.strictEqual(
				getLastTokenForNode(VariableDeclaration).value,
				"b",
			);
		});

		it("should skip a given number of tokens", () => {
			assert.strictEqual(
				getLastTokenForNode(BinaryExpression, 1).value,
				"*",
			);
			assert.strictEqual(
				getLastTokenForNode(BinaryExpression, 2).value,
				"a",
			);
		});

		it("should skip a given number of tokens with skip option", () => {
			assert.strictEqual(
				getLastTokenForNode(BinaryExpression, { skip: 1 }).value,
				"*",
			);
			assert.strictEqual(
				getLastTokenForNode(BinaryExpression, { skip: 2 }).value,
				"a",
			);
		});

		it("should retrieve the last matched token of a node's token stream with filter option", () => {
			assert.strictEqual(
				getLastTokenForNode(BinaryExpression, t => t.value !== "b")
					.value,
				"*",
			);
			assert.strictEqual(
				getLastTokenForNode(BinaryExpression, {
					filter: t => t.value !== "b",
				}).value,
				"*",
			);
		});

		it("should retrieve the last matched token of a node's token stream with filter and skip options", () => {
			assert.strictEqual(
				getLastTokenForNode(BinaryExpression, {
					skip: 1,
					filter: t => t.type === "Identifier",
				}).value,
				"a",
			);
		});

		it("should retrieve the last token of a node's token stream with includeComments option", () => {
			assert.strictEqual(
				getLastTokenForNode(BinaryExpression, { includeComments: true })
					.value,
				"b",
			);
		});

		it("should retrieve the last token of a node's token stream with includeComments and skip options", () => {
			assert.strictEqual(
				getLastTokenForNode(BinaryExpression, {
					includeComments: true,
					skip: 2,
				}).value,
				"D",
			);
		});

		it("should retrieve the last token of a node's token stream with includeComments and skip and filter options", () => {
			assert.strictEqual(
				getLastTokenForNode(BinaryExpression, {
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
			const tokens = getAllTokensAndCommentsFromFirst(ast, {
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
			const tokens = getAllTokensAndCommentsFromFirst(ast, {
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
			const tokens = getAllTokensAndCommentsFromLast(ast, {
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
			const tokens = getAllTokensAndCommentsFromLast(ast, {
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