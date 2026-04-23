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
 * Asserts that the given tokens match the expected values.
 * @param {Token[]} tokens Tokens returned from the API.
 * @param {string[]} expected Expected token values.
 */
function assertTokensMatch(tokens, expected) {
	const length = tokens.length;
	assert.strictEqual(length, expected.length);
	for (let i = 0; i < length; i++) {
		assert.strictEqual(tokens[i].value, expected[i]);
	}
}

/**
 * Executes a getTokens test case.
 * @param {ASTNode|Token} node Node or token to query.
 * @param {any} [options] Options passed to getTokens.
 * @param {string[]} expected Expected token values.
 */
function testGetTokens(node, options, expected) {
	assertTokensMatch(store.getTokens(node, options), expected);
}

/**
 * Executes a getTokensBefore test case.
 * @param {ASTNode|Token} node Node or token to query.
 * @param {any} [options] Options passed to getTokensBefore.
 * @param {string[]} expected Expected token values.
 */
function testGetTokensBefore(node, options, expected) {
	assertTokensMatch(store.getTokensBefore(node, options), expected);
}

/**
 * Executes a getTokenBefore test case.
 * @param {ASTNode|Token} node Node or token to query.
 * @param {any} [options] Options passed to getTokenBefore.
 * @param {string|null} expected Expected token value or null.
 */
function testGetTokenBefore(node, options, expected) {
	const token = store.getTokenBefore(node, options);
	if (expected === null) {
		assert.isNull(token);
	} else {
		assert.strictEqual(token.value, expected);
	}
}

/**
 * Executes a getTokensAfter test case.
 * @param {ASTNode|Token} node Node or token to query.
 * @param {any} [options] Options passed to getTokensAfter.
 * @param {string[]} expected Expected token values.
 */
function testGetTokensAfter(node, options, expected) {
	assertTokensMatch(store.getTokensAfter(node, options), expected);
}

/**
 * Executes a getTokenAfter test case.
 * @param {ASTNode|Token} node Node or token to query.
 * @param {any} [options] Options passed to getTokenAfter.
 * @param {string|null} expected Expected token value or null.
 */
function testGetTokenAfter(node, options, expected) {
	const token = store.getTokenAfter(node, options);
	if (expected === null) {
		assert.isNull(token);
	} else {
		assert.strictEqual(token.value, expected);
	}
}

/**
 * Executes a getFirstTokens test case.
 * @param {ASTNode|Token} node Node or token to query.
 * @param {any} [options] Options passed to getFirstTokens.
 * @param {string[]} expected Expected token values.
 */
function testGetFirstTokens(node, options, expected) {
	assertTokensMatch(store.getFirstTokens(node, options), expected);
}

/**
 * Executes a getFirstToken test case.
 * @param {ASTNode|Token} node Node or token to query.
 * @param {any} [options] Options passed to getFirstToken.
 * @param {string|null} expected Expected token value or null.
 */
function testGetFirstToken(node, options, expected) {
	const token = store.getFirstToken(node, options);
	if (expected === null) {
		assert.isNull(token);
	} else {
		assert.strictEqual(token.value, expected);
	}
}

/**
 * Executes a getLastTokens test case.
 * @param {ASTNode|Token} node Node or token to query.
 * @param {any} [options] Options passed to getLastTokens.
 * @param {string[]} expected Expected token values.
 */
function testGetLastTokens(node, options, expected) {
	assertTokensMatch(store.getLastTokens(node, options), expected);
}

/**
 * Executes a getLastToken test case.
 * @param {ASTNode|Token} node Node or token to query.
 * @param {any} [options] Options passed to getLastToken.
 * @param {string|null} expected Expected token value or null.
 */
function testGetLastToken(node, options, expected) {
	const token = store.getLastToken(node, options);
	if (expected === null) {
		assert.isNull(token);
	} else {
		assert.strictEqual(token.value, expected);
	}
}

/**
 * Executes a getFirstTokensBetween test case.
 * @param {ASTNode|Token} left Left node/token.
 * @param {ASTNode|Token} right Right node/token.
 * @param {any} [options] Options passed to getFirstTokensBetween.
 * @param {string[]} expected Expected token values.
 */
function testGetFirstTokensBetween(left, right, options, expected) {
	assertTokensMatch(store.getFirstTokensBetween(left, right, options), expected);
}

/**
 * Executes a getFirstTokenBetween test case.
 * @param {ASTNode|Token} left Left node/token.
 * @param {ASTNode|Token} right Right node/token.
 * @param {any} [options] Options passed to getFirstTokenBetween.
 * @param {string|null} expected Expected token value or null.
 */
function testGetFirstTokenBetween(left, right, options, expected) {
	const token = store.getFirstTokenBetween(left, right, options);
	if (expected === null) {
		assert.isNull(token);
	} else {
		assert.strictEqual(token.value, expected);
	}
}

/**
 * Executes a getLastTokensBetween test case.
 * @param {ASTNode|Token} left Left node/token.
 * @param {ASTNode|Token} right Right node/token.
 * @param {any} [options] Options passed to getLastTokensBetween.
 * @param {string[]} expected Expected token values.
 */
function testGetLastTokensBetween(left, right, options, expected) {
	assertTokensMatch(store.getLastTokensBetween(left, right, options), expected);
}

/**
 * Executes a getLastTokenBetween test case.
 * @param {ASTNode|Token} left Left node/token.
 * @param {ASTNode|Token} right Right node/token.
 * @param {any} [options] Options passed to getLastTokenBetween.
 * @param {string|null} expected Expected token value or null.
 */
function testGetLastTokenBetween(left, right, options, expected) {
	const token = store.getLastTokenBetween(left, right, options);
	if (expected === null) {
		assert.isNull(token);
	} else {
		assert.strictEqual(token.value, expected);
	}
}

/**
 * Executes a getTokensBetween test case.
 * @param {ASTNode|Token} left Left node/token.
 * @param {ASTNode|Token} right Right node/token.
 * @param {any} [options] Options passed to getTokensBetween.
 * @param {string[]} expected Expected token values.
 */
function testGetTokensBetween(left, right, options, expected) {
	assertTokensMatch(store.getTokensBetween(left, right, options), expected);
}

/**
 * Executes a getTokenByRangeStart test case.
 * @param {number} index Index to query.
 * @param {any} [options] Options passed to getTokenByRangeStart.
 * @param {object} expected Expected token descriptor.
 */
function testGetTokenByRangeStart(index, options, expected) {
	const token = store.getTokenByRangeStart(index, options);
	if (expected === null) {
		assert.isNull(token);
	} else {
		assert.strictEqual(token.type, expected.type);
		assert.strictEqual(token.value, expected.value);
	}
}

/**
 * Executes a commentsExistBetween test case.
 * @param {Token} left Left token.
 * @param {Token} right Right token.
 * @param {boolean} expected Expected boolean result.
 */
function testCommentsExistBetween(left, right, expected) {
	assert.strictEqual(store.commentsExistBetween(left, right), expected);
}

/**
 * Executes a getCommentsBefore test case.
 * @param {ASTNode|Token} node Node or token.
 * @param {string[]} expected Expected comment values.
 */
function testGetCommentsBefore(node, expected) {
	const comments = store.getCommentsBefore(node);
	assertTokensMatch(comments, expected);
}

/**
 * Executes a getCommentsAfter test case.
 * @param {ASTNode|Token} node Node or token.
 * @param {string[]} expected Expected comment values.
 */
function testGetCommentsAfter(node, expected) {
	const comments = store.getCommentsAfter(node);
	assertTokensMatch(comments, expected);
}

/**
 * Executes a getCommentsInside test case.
 * @param {ASTNode|Token} node Node or token.
 * @param {string[]} expected Expected comment values.
 */
function testGetCommentsInside(node, expected) {
	const comments = store.getCommentsInside(node);
	assertTokensMatch(comments, expected);
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("TokenStore", () => {
	const store = new TokenStore(TOKENS, COMMENTS);

	describe("when calling getTokens", () => {
		it("should retrieve all tokens for root node", () => {
			testGetTokens(Program, null, [
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
			testGetTokens(BinaryExpression, null, ["a", "*", "b"]);
		});

		it("should retrieve all tokens plus one before for binary expression", () => {
			testGetTokens(BinaryExpression, 1, ["=", "a", "*", "b"]);
		});

		it("should retrieve all tokens plus one after for binary expression", () => {
			testGetTokens(BinaryExpression, { after: 1 }, [
				"a",
				"*",
				"b",
				"call",
			]);
		});

		it("should retrieve all tokens plus two before and one after for binary expression", () => {
			testGetTokens(BinaryExpression, { before: 2, after: 1 }, [
				"answer",
				"=",
				"a",
				"*",
				"b",
				"call",
			]);
		});

		it("should retrieve all matched tokens for root node with filter", () => {
			testGetTokens(Program, t => t.type === "Identifier", [
				"answer",
				"a",
				"b",
				"call",
			]);
			testGetTokens(Program, { filter: t => t.type === "Identifier" }, [
				"answer",
				"a",
				"b",
				"call",
			]);
		});

		it("should retrieve all tokens and comments in the node for root node with includeComments option", () => {
			testGetTokens(Program, { includeComments: true }, [
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
			testGetTokens(
				Program,
				{
					includeComments: true,
					filter: t => t.type.startsWith("Block"),
				},
				["A", "B", "C", "D", "E", "Z"],
			);
		});

		it("should retrieve all tokens and comments in the node for binary expression with includeComments option", () => {
			testGetTokens(BinaryExpression, { includeComments: true }, [
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
			testGetTokens(ast, null, ["bar"]);
			testGetTokens(ast, { includeComments: true }, ["A", "bar", "Z"]);
		});
	});

	describe("when calling getTokensBefore", () => {
		it("should retrieve zero tokens before a node", () => {
			testGetTokensBefore(BinaryExpression, 0, []);
		});

		it("should retrieve one token before a node", () => {
			testGetTokensBefore(BinaryExpression, 1, ["="]);
		});

		it("should retrieve more than one token before a node", () => {
			testGetTokensBefore(BinaryExpression, 2, ["answer", "="]);
		});

		it("should retrieve all tokens before a node", () => {
			testGetTokensBefore(BinaryExpression, 9e9, [
				"var",
				"answer",
				"=",
			]);
		});

		it("should retrieve more than one token before a node with count option", () => {
			testGetTokensBefore(BinaryExpression, { count: 2 }, [
				"answer",
				"=",
			]);
		});

		it("should retrieve matched tokens before a node with count and filter options", () => {
			testGetTokensBefore(
				BinaryExpression,
				{ count: 1, filter: t => t.value !== "=" },
				["answer"],
			);
		});

		it("should retrieve all matched tokens before a node with filter option", () => {
			testGetTokensBefore(
				BinaryExpression,
				{ filter: t => t.value !== "answer" },
				["var", "="],
			);
		});

		it("should retrieve no tokens before the root node", () => {
			testGetTokensBefore(Program, { count: 1 }, []);
		});

		it("should retrieve tokens and comments before a node with count and includeComments option", () => {
			testGetTokensBefore(
				BinaryExpression,
				{ count: 3, includeComments: true },
				["B", "=", "C"],
			);
		});

		it("should retrieve all tokens and comments before a node with includeComments option only", () => {
			testGetTokensBefore(
				BinaryExpression,
				{ includeComments: true },
				["A", "var", "answer", "B", "=", "C"],
			);
		});

		it("should retrieve all tokens and comments before a node with includeComments and filter options", () => {
			testGetTokensBefore(
				BinaryExpression,
				{
					includeComments: true,
					filter: t => t.type.startsWith("Block"),
				},
				["A", "B", "C"],
			);
		});

		it("should retrieve no tokens before Program when it starts with whitespace", () => {
			const code = " bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			testGetTokensBefore(ast, 1, []);
		});

		it("should retrieve no tokens before Program when it starts with a comment", () => {
			const code = "/*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			testGetTokensBefore(ast, 1, []);
		});

		it("should retrieve no tokens before Program when it starts with whitespace and a comment", () => {
			const code = " /*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			testGetTokensBefore(
				ast,
				{ count: 1, includeComments: true },
				[],
			);
		});
	});

	describe("when calling getTokenBefore", () => {
		it("should retrieve one token before a node", () => {
			testGetTokenBefore(BinaryExpression, null, "=");
		});

		it("should skip a given number of tokens", () => {
			testGetTokenBefore(BinaryExpression, 1, "answer");
			testGetTokenBefore(BinaryExpression, 2, "var");
		});

		it("should skip a given number of tokens with skip option", () => {
			testGetTokenBefore(BinaryExpression, { skip: 1 }, "answer");
			testGetTokenBefore(BinaryExpression, { skip: 2 }, "var");
		});

		it("should retrieve matched token with filter option", () => {
			testGetTokenBefore(
				BinaryExpression,
				t => t.value !== "=",
				"answer",
			);
		});

		it("should retrieve matched token with skip and filter options", () => {
			testGetTokenBefore(
				BinaryExpression,
				{ skip: 1, filter: t => t.value !== "=" },
				"var",
			);
		});

		it("should retrieve one token or comment before a node with includeComments option", () => {
			testGetTokenBefore(
				BinaryExpression,
				{ includeComments: true },
				"C",
			);
		});

		it("should retrieve one token or comment before a node with includeComments and skip options", () => {
			testGetTokenBefore(
				BinaryExpression,
				{ includeComments: true, skip: 1 },
				"=",
			);
		});

		it("should retrieve one token or comment before a node with includeComments and skip and filter options", () => {
			testGetTokenBefore(
				BinaryExpression,
				{
					includeComments: true,
					skip: 1,
					filter: t => t.type.startsWith("Block"),
				},
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
			assert.isNull(tokenStore.getTokenBefore(ast));
		});

		it("should retrieve null before Program when it starts with a comment", () => {
			const code = "/*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.isNull(tokenStore.getTokenBefore(ast));
		});

		it("should retrieve null before Program when it starts with whitespace and a comment", () => {
			const code = " /*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.isNull(
				tokenStore.getTokenBefore(ast, { includeComments: true }),
			);
		});
	});

	describe("when calling getTokensAfter", () => {
		it("should retrieve zero tokens after a node", () => {
			testGetTokensAfter(VariableDeclarator.id, 0, []);
		});

		it("should retrieve one token after a node", () => {
			testGetTokensAfter(VariableDeclarator.id, 1, ["="]);
		});

		it("should retrieve more than one token after a node", () => {
			testGetTokensAfter(VariableDeclarator.id, 2, ["=", "a"]);
		});

		it("should retrieve all tokens after a node", () => {
			testGetTokensAfter(VariableDeclarator.id, 9e9, [
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
			testGetTokensAfter(VariableDeclarator.id, { count: 2 }, [
				"=",
				"a",
			]);
		});

		it("should retrieve all matched tokens after a node with filter option", () => {
			testGetTokensAfter(
				VariableDeclarator.id,
				{ filter: t => t.type === "Identifier" },
				["a", "b", "call"],
			);
		});

		it("should retrieve matched tokens after a node with count and filter options", () => {
			testGetTokensAfter(
				VariableDeclarator.id,
				{ count: 2, filter: t => t.type === "Identifier" },
				["a", "b"],
			);
		});

		it("should retrieve all tokens and comments after a node with includeComments option", () => {
			testGetTokensAfter(
				VariableDeclarator.id,
				{ includeComments: true },
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
			testGetTokensAfter(
				VariableDeclarator.id,
				{ includeComments: true, count: 3 },
				["B", "=", "C"],
			);
		});

		it("should retrieve matched tokens and comments after a node with includeComments and count and filter options", () => {
			testGetTokensAfter(
				VariableDeclarator.id,
				{
					includeComments: true,
					count: 3,
					filter: t => t.type.startsWith("Block"),
				},
				["B", "C", "D"],
			);
		});

		it("should retrieve no tokens after Program when it ends with whitespace", () => {
			const code = "bar ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			testGetTokensAfter(ast, 1, []);
		});

		it("should retrieve no tokens after Program when it ends with a comment", () => {
			const code = "bar /*comment*/";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			testGetTokensAfter(ast, 1, []);
		});

		it("should retrieve no tokens after Program when it ends with a comment and whitespace", () => {
			const code = "bar /*comment*/ ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			testGetTokensAfter(
				ast,
				{ count: 1, includeComments: true },
				[],
			);
		});
	});

	describe("when calling getTokenAfter", () => {
		it("should retrieve one token after a node", () => {
			testGetTokenAfter(VariableDeclarator.id, null, "=");
		});

		it("should skip a given number of tokens", () => {
			testGetTokenAfter(VariableDeclarator.id, 1, "a");
			testGetTokenAfter(VariableDeclarator.id, 2, "*");
		});

		it("should skip a given number of tokens with skip option", () => {
			testGetTokenAfter(VariableDeclarator.id, { skip: 1 }, "a");
			testGetTokenAfter(VariableDeclarator.id, { skip: 2 }, "*");
		});

		it("should retrieve matched token with filter option", () => {
			testGetTokenAfter(
				VariableDeclarator.id,
				t => t.type === "Identifier",
				"a",
			);
			testGetTokenAfter(
				VariableDeclarator.id,
				{ filter: t => t.type === "Identifier" },
				"a",
			);
		});

		it("should retrieve matched token with filter and skip options", () => {
			testGetTokenAfter(
				VariableDeclarator.id,
				{ skip: 1, filter: t => t.type === "Identifier" },
				"b",
			);
		});

		it("should retrieve one token or comment after a node with includeComments option", () => {
			testGetTokenAfter(
				VariableDeclarator.id,
				{ includeComments: true },
				"B",
			);
		});

		it("should retrieve one token or comment after a node with includeComments and skip options", () => {
			testGetTokenAfter(
				VariableDeclarator.id,
				{ includeComments: true, skip: 2 },
				"C",
			);
		});

		it("should retrieve one token or comment after a node with includeComments and skip and filter options", () => {
			testGetTokenAfter(
				VariableDeclarator.id,
				{
					includeComments: true,
					skip: 2,
					filter: t => t.type.startsWith("Block"),
				},
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
			assert.isNull(token);
		});

		it("should retrieve null after Program when it ends with whitespace", () => {
			const code = "bar ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.isNull(tokenStore.getTokenAfter(ast));
		});

		it("should retrieve null after Program when it ends with a comment", () => {
			const code = "bar /*comment*/";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.isNull(tokenStore.getTokenAfter(ast));
		});

		it("should retrieve null after Program when it ends with a comment and whitespace", () => {
			const code = "bar /*comment*/ ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.isNull(
				tokenStore.getTokenAfter(ast, { includeComments: true }),
			);
		});
	});

	describe("when calling getFirstTokens", () => {
		it("should retrieve zero tokens from a node's token stream", () => {
			testGetFirstTokens(BinaryExpression, 0, []);
		});

		it("should retrieve one token from a node's token stream", () => {
			testGetFirstTokens(BinaryExpression, 1, ["a"]);
		});

		it("should retrieve more than one token from a node's token stream", () => {
			testGetFirstTokens(BinaryExpression, 2, ["a", "*"]);
		});

		it("should retrieve all tokens from a node's token stream", () => {
			testGetFirstTokens(BinaryExpression, 9e9, ["a", "*", "b"]);
		});

		it("should retrieve more than one token from a node's token stream with count option", () => {
			testGetFirstTokens(BinaryExpression, { count: 2 }, [
				"a",
				"*",
			]);
		});

		it("should retrieve matched tokens from a node's token stream with filter option", () => {
			testGetFirstTokens(
				BinaryExpression,
				t => t.type === "Identifier",
				["a", "b"],
			);
			testGetFirstTokens(
				BinaryExpression,
				{ filter: t => t.type === "Identifier" },
				["a", "b"],
			);
		});

		it("should retrieve matched tokens from a node's token stream with filter and count options", () => {
			testGetFirstTokens(
				BinaryExpression,
				{ count: 1, filter: t => t.type === "Identifier" },
				["a"],
			);
		});

		it("should retrieve all tokens and comments from a node's token stream with includeComments option", () => {
			testGetFirstTokens(BinaryExpression, { includeComments: true }, [
				"a",
				"D",
				"*",
				"b",
			]);
		});

		it("should retrieve several tokens and comments from a node's token stream with includeComments and count options", () => {
			testGetFirstTokens(
				BinaryExpression,
				{ includeComments: true, count: 3 },
				["a", "D", "*"],
			);
		});

		it("should retrieve several tokens and comments from a node's token stream with includeComments and count and filter options", () => {
			testGetFirstTokens(
				BinaryExpression,
				{
					includeComments: true,
					count: 3,
					filter: t => t.value !== "a",
				},
				["D", "*", "b"],
			);
		});

		it("should retrieve the first token from Program when it starts with whitespace", () => {
			const code = " bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			testGetFirstTokens(ast, 1, ["bar"]);
		});

		it("should retrieve the first token from Program when it starts with a comment", () => {
			const code = "/*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			testGetFirstTokens(ast, 1, ["bar"]);
		});

		it("should retrieve the first token/comment from Program when it starts with whitespace and a comment", () => {
			const code = " /*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			testGetFirstTokens(
				ast,
				{ count: 2, includeComments: true },
				["comment", "bar"],
			);
		});
	});

	describe("when calling getFirstToken", () => {
		it("should retrieve the first token of a node's token stream", () => {
			testGetFirstToken(BinaryExpression, null, "a");
		});

		it("should skip a given number of tokens", () => {
			testGetFirstToken(BinaryExpression, 1, "*");
			testGetFirstToken(BinaryExpression, 2, "b");
		});

		it("should skip a given number of tokens with skip option", () => {
			testGetFirstToken(BinaryExpression, { skip: 1 }, "*");
			testGetFirstToken(BinaryExpression, { skip: 2 }, "b");
		});

		it("should retrieve matched token with filter option", () => {
			testGetFirstToken(
				BinaryExpression,
				t => t.type === "Identifier",
				"a",
			);
			testGetFirstToken(
				BinaryExpression,
				{ filter: t => t.type === "Identifier" },
				"a",
			);
		});

		it("should retrieve matched token with filter and skip options", () => {
			testGetFirstToken(
				BinaryExpression,
				{ skip: 1, filter: t => t.type === "Identifier" },
				"b",
			);
		});

		it("should retrieve the first token or comment of a node's token stream with includeComments option", () => {
			testGetFirstToken(BinaryExpression, { includeComments: true }, "a");
		});

		it("should retrieve the first matched token or comment of a node's token stream with includeComments and skip options", () => {
			testGetFirstToken(
				BinaryExpression,
				{ includeComments: true, skip: 1 },
				"D",
			);
		});

		it("should retrieve the first matched token or comment of a node's token stream with includeComments and skip and filter options", () => {
			testGetFirstToken(
				BinaryExpression,
				{
					includeComments: true,
					skip: 1,
					filter: t => t.value !== "a",
				},
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
			assert.isNull(token);
		});

		it("should return null if the source is empty", () => {
			const code = "";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = tokenStore.getFirstToken(ast);
			assert.isNull(token);
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
			testGetLastTokens(BinaryExpression, 0, []);
		});

		it("should retrieve one token from the end of a node's token stream", () => {
			testGetLastTokens(BinaryExpression, 1, ["b"]);
		});

		it("should retrieve more than one token from the end of a node's token stream", () => {
			testGetLastTokens(BinaryExpression, 2, ["*", "b"]);
		});

		it("should retrieve all tokens from the end of a node's token stream", () => {
			testGetLastTokens(BinaryExpression, 9e9, ["a", "*", "b"]);
		});

		it("should retrieve more than one token from the end of a node's token stream with count option", () => {
			testGetLastTokens(BinaryExpression, { count: 2 }, [
				"*",
				"b",
			]);
		});

		it("should retrieve matched tokens from the end of a node's token stream with filter option", () => {
			testGetLastTokens(
				BinaryExpression,
				t => t.type === "Identifier",
				["a", "b"],
			);
			testGetLastTokens(
				BinaryExpression,
				{ filter: t => t.type === "Identifier" },
				["a", "b"],
			);
		});

		it("should retrieve matched tokens from the end of a node's token stream with filter and count options", () => {
			testGetLastTokens(
				BinaryExpression,
				{ count: 1, filter: t => t.type === "Identifier" },
				["b"],
			);
		});

		it("should retrieve all tokens from the end of a node's token stream with includeComments option", () => {
			testGetLastTokens(BinaryExpression, { includeComments: true }, [
				"a",
				"D",
				"*",
				"b",
			]);
		});

		it("should retrieve matched tokens from the end of a node's token stream with includeComments and count options", () => {
			testGetLastTokens(
				BinaryExpression,
				{ includeComments: true, count: 3 },
				["D", "*", "b"],
			);
		});

		it("should retrieve matched tokens from the end of a node's token stream with includeComments and count and filter options", () => {
			testGetLastTokens(
				BinaryExpression,
				{
					includeComments: true,
					count: 3,
					filter: t => t.type !== "Punctuator",
				},
				["a", "D", "b"],
			);
		});

		it("should retrieve the last token from Program when it ends with whitespace", () => {
			const code = "bar ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			testGetLastTokens(ast, 1, ["bar"]);
		});

		it("should retrieve the last token from Program when it ends with a comment", () => {
			const code = "bar /*comment*/";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			testGetLastTokens(ast, 1, ["bar"]);
		});

		it("should retrieve the last token/comment from Program when it ends with a comment and whitespace", () => {
			const code = "bar /*comment*/ ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			testGetLastTokens(
				ast,
				{ count: 2, includeComments: true },
				["bar", "comment"],
			);
		});
	});

	describe("when calling getLastToken", () => {
		it("should retrieve the last token of a node's token stream", () => {
			testGetLastToken(BinaryExpression, null, "b");
			testGetLastToken(VariableDeclaration, null, "b");
		});

		it("should skip a given number of tokens", () => {
			testGetLastToken(BinaryExpression, 1, "*");
			testGetLastToken(BinaryExpression, 2, "a");
		});

		it("should skip a given number of tokens with skip option", () => {
			testGetLastToken(BinaryExpression, { skip: 1 }, "*");
			testGetLastToken(BinaryExpression, { skip: 2 }, "a");
		});

		it("should retrieve the last matched token of a node's token stream with filter option", () => {
			testGetLastToken(
				BinaryExpression,
				t => t.value !== "b",
				"*",
			);
			testGetLastToken(
				BinaryExpression,
				{ filter: t => t.value !== "b" },
				"*",
			);
		});

		it("should retrieve the last matched token of a node's token stream with filter and skip options", () => {
			testGetLastToken(
				BinaryExpression,
				{ skip: 1, filter: t => t.type === "Identifier" },
				"a",
			);
		});

		it("should retrieve the last token of a node's token stream with includeComments option", () => {
			testGetLastToken(BinaryExpression, { includeComments: true }, "b");
		});

		it("should retrieve the last token of a node's token stream with includeComments and skip options", () => {
			testGetLastToken(
				BinaryExpression,
				{ includeComments: true, skip: 2 },
				"D",
			);
		});

		it("should retrieve the last token of a node's token stream with includeComments and skip and filter options", () => {
			testGetLastToken(
				BinaryExpression,
				{ includeComments: true, skip: 1, filter: t => t.type !== "Identifier" },
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
			assert.isNull(token);
		});

		it("should return null if the source is empty", () => {
			const code = "";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = tokenStore.getLastToken(ast);
			assert.isNull(token);
		});
	});

	describe("when calling getFirstTokensBetween", () => {
		it("should retrieve zero tokens between adjacent nodes", () => {
			testGetFirstTokensBetween(BinaryExpression, CallExpression, null, []);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with count option", () => {
			testGetFirstTokensBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				2,
				["=", "a"],
			);
			testGetFirstTokensBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				{ count: 2 },
				["=", "a"],
			);
		});

		it("should retrieve matched tokens between non-adjacent nodes with filter option", () => {
			testGetFirstTokensBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				{ filter: t => t.type !== "Punctuator" },
				["a"],
			);
		});

		it("should retrieve all tokens between non-adjacent nodes with empty object option", () => {
			testGetFirstTokensBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				{},
				["=", "a", "*"],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with includeComments option", () => {
			testGetFirstTokensBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				{ includeComments: true },
				["B", "=", "C", "a", "D", "*"],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with includeComments and count options", () => {
			testGetFirstTokensBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				{ includeComments: true, count: 3 },
				["B", "=", "C"],
			);
		});

		it("should retrieve multiple tokens and comments between non-adjacent nodes with includeComments and filter options", () => {
			testGetFirstTokensBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				{
					includeComments: true,
					filter: t => t.type !== "Punctuator",
				},
				["B", "C", "a", "D"],
			);
		});
	});

	describe("when calling getFirstTokenBetween", () => {
		it("should return null between adjacent nodes", () => {
			testGetFirstTokenBetween(BinaryExpression, CallExpression, null, null);
		});

		it("should retrieve one token between non-adjacent nodes with count option", () => {
			testGetFirstTokenBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				null,
				"=",
			);
		});

		it("should retrieve one token between non-adjacent nodes with skip option", () => {
			testGetFirstTokenBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				1,
				"a",
			);
			testGetFirstTokenBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				{ skip: 2 },
				"*",
			);
		});

		it("should return null if it's skipped beyond the right token", () => {
			testGetFirstTokenBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				{ skip: 3 },
				null,
			);
			testGetFirstTokenBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				{ skip: 4 },
				null,
			);
		});

		it("should retrieve the first matched token between non-adjacent nodes with filter option", () => {
			testGetFirstTokenBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				{ filter: t => t.type !== "Identifier" },
				"=",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments option", () => {
			testGetFirstTokenBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				{ includeComments: true },
				"B",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip options", () => {
			testGetFirstTokenBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				{ includeComments: true, skip: 1 },
				"=",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip and filter options", () => {
			testGetFirstTokenBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				{
					includeComments: true,
					skip: 1,
					filter: t => t.type !== "Punctuator",
				},
				"C",
			);
		});
	});

	describe("when calling getLastTokensBetween", () => {
		it("should retrieve zero tokens between adjacent nodes", () => {
			testGetLastTokensBetween(BinaryExpression, CallExpression, null, []);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with count option", () => {
			testGetLastTokensBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				2,
				["a", "*"],
			);
			testGetLastTokensBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				{ count: 2 },
				["a", "*"],
			);
		});

		it("should retrieve matched tokens between non-adjacent nodes with filter option", () => {
			testGetLastTokensBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				{ filter: t => t.type !== "Punctuator" },
				["a"],
			);
		});

		it("should retrieve all tokens between non-adjacent nodes with empty object option", () => {
			testGetLastTokensBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				{},
				["=", "a", "*"],
			);
		});

		it("should retrieve all tokens and comments between non-adjacent nodes with includeComments option", () => {
			testGetLastTokensBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				{ includeComments: true },
				["B", "=", "C", "a", "D", "*"],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with includeComments and count options", () => {
			testGetLastTokensBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				{ includeComments: true, count: 3 },
				["a", "D", "*"],
			);
		});

		it("should retrieve multiple tokens and comments between non-adjacent nodes with includeComments and filter options", () => {
			testGetLastTokensBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				{
					includeComments: true,
					filter: t => t.type !== "Punctuator",
				},
				["B", "C", "a", "D"],
			);
		});
	});

	describe("when calling getLastTokenBetween", () => {
		it("should return null between adjacent nodes", () => {
			testGetLastTokenBetween(BinaryExpression, CallExpression, null, null);
		});

		it("should retrieve one token between non-adjacent nodes with count option", () => {
			testGetLastTokenBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				null,
				"*",
			);
		});

		it("should retrieve one token between non-adjacent nodes with skip option", () => {
			testGetLastTokenBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				1,
				"a",
			);
			testGetLastTokenBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				{ skip: 2 },
				"=",
			);
		});

		it("should return null if it's skipped beyond the right token", () => {
			testGetLastTokenBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				{ skip: 3 },
				null,
			);
			testGetLastTokenBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				{ skip: 4 },
				null,
			);
		});

		it("should retrieve the first matched token between non-adjacent nodes with filter option", () => {
			testGetLastTokenBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				{ filter: t => t.type !== "Identifier" },
				"*",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments option", () => {
			testGetLastTokenBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				{ includeComments: true },
				"*",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip options", () => {
			testGetLastTokenBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				{ includeComments: true, skip: 1 },
				"D",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip and filter options", () => {
			testGetLastTokenBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				{
					includeComments: true,
					skip: 1,
					filter: t => t.type !== "Punctuator",
				},
				"a",
			);
		});
	});

	describe("when calling getTokensBetween", () => {
		it("should retrieve zero tokens between adjacent nodes", () => {
			testGetTokensBetween(BinaryExpression, CallExpression, null, []);
		});

		it("should retrieve one token between nodes", () => {
			testGetTokensBetween(
				BinaryExpression.left,
				BinaryExpression.right,
				null,
				["*"],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes", () => {
			testGetTokensBetween(
				VariableDeclarator.id,
				BinaryExpression.right,
				null,
				["=", "a", "*"],
			);
		});

		it("should retrieve surrounding tokens when asked for padding", () => {
			testGetTokensBetween(
				VariableDeclarator.id,
				BinaryExpression.left,
				2,
				["var", "answer", "=", "a", "*"],
			);
		});
	});

	describe("when calling getTokenByRangeStart", () => {
		it("should return identifier token", () => {
			testGetTokenByRangeStart(9, null, {
				type: "Identifier",
				value: "answer",
			});
		});

		it("should return null when token doesn't exist", () => {
			testGetTokenByRangeStart(10, null, null);
		});

		it("should return a comment token when includeComments is true", () => {
			testGetTokenByRangeStart(15, { includeComments: true }, {
				type: "Block",
				value: "B",
			});
		});

		it("should not return a comment token at the supplied index when includeComments is false", () => {
			testGetTokenByRangeStart(15, { includeComments: false }, null);
		});

		it("should not return comment tokens by default", () => {
			testGetTokenByRangeStart(15, null, null);
		});
	});

	describe("when calling commentsExistBetween", () => {
		it("should retrieve false if comments don't exist", () => {
			testCommentsExistBetween(AST.tokens[0], AST.tokens[1], false);
		});

		it("should retrieve true if comments exist", () => {
			testCommentsExistBetween(AST.tokens[1], AST.tokens[2], true);
		});
	});

	describe("getCommentsBefore", () => {
		it("should retrieve comments before a node", () => {
			testGetCommentsBefore(VariableDeclaration, ["A"]);
		});

		it("should retrieve comments before a token", () => {
			testGetCommentsBefore(TOKENS[2] /* "=" token */, ["B"]);
		});

		it("should retrieve multiple comments before a node", () => {
			testGetCommentsBefore(CallExpression, ["E", "F"]);
		});

		it("should return an empty array for a Program node", () => {
			testGetCommentsBefore(Program, []);
		});

		it("should return an empty array if there are no comments before a node or token", () => {
			testGetCommentsBefore(BinaryExpression.right, []);
			testGetCommentsBefore(TOKENS[1], []);
		});

		it("should retrieve no comments before Program when it starts with whitespace and a comment", () => {
			const code = " /*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			testGetCommentsBefore(ast, []);
		});
	});

	describe("getCommentsAfter", () => {
		it("should retrieve comments after a node", () => {
			testGetCommentsAfter(VariableDeclarator.id, ["B"]);
		});

		it("should retrieve comments after a token", () => {
			testGetCommentsAfter(TOKENS[2] /* "=" token */, ["C"]);
		});

		it("should retrieve multiple comments after a node", () => {
			testGetCommentsAfter(VariableDeclaration, ["E", "F"]);
		});

		it("should return an empty array for a Program node", () => {
			testGetCommentsAfter(Program, []);
		});

		it("should return an empty array if there are no comments after a node or token", () => {
			testGetCommentsAfter(CallExpression.callee, []);
			testGetCommentsAfter(TOKENS[0], []);
		});

		it("should retrieve no comments after Program when it ends with a comment and whitespace", () => {
			const code = "bar /*comment*/ ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			testGetCommentsAfter(ast, []);
		});
	});

	describe("getCommentsInside", () => {
		it("should retrieve comments inside a node", () => {
			testGetCommentsInside(Program, [
				"A",
				"B",
				"C",
				"D",
				"E",
				"F",
				"Z",
			]);
			testGetCommentsInside(VariableDeclaration, ["B", "C", "D"]);
			testGetCommentsInside(VariableDeclarator, ["B", "C", "D"]);
			testGetCommentsInside(BinaryExpression, ["D"]);
		});

		it("should return an empty array if a node does not contain any comments", () => {
			testGetCommentsInside(TOKENS[2], []);
		});
	});
});