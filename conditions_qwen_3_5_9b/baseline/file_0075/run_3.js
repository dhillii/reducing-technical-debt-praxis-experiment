```javascript
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
 * Creates a TokenStore instance for testing.
 * @param {string} code Source code to parse
 * @returns {TokenStore} TokenStore instance
 */
function createTokenStore(code) {
	const ast = espree.parse(code, DEFAULT_CONFIG);
	return new TokenStore(ast.tokens, ast.comments);
}

/**
 * Creates a TokenStore instance for the main test source.
 * @returns {TokenStore} TokenStore instance
 */
function createMainTokenStore() {
	return new TokenStore(TOKENS, COMMENTS);
}

/**
 * Asserts that a token has the expected value.
 * @param {Token} token The token to check
 * @param {string} expectedValue The expected value
 * @returns {void}
 */
function assertTokenValue(token, expectedValue) {
	assert.strictEqual(token.value, expectedValue);
}

/**
 * Asserts that a token is null.
 * @param {Token|null} token The token to check
 * @returns {void}
 */
function assertTokenNull(token) {
	assert.strictEqual(token, null);
}

/**
 * Asserts that a token has the expected type.
 * @param {Token} token The token to check
 * @param {string} expectedType The expected type
 * @returns {void}
 */
function assertTokenType(token, expectedType) {
	assert.strictEqual(token.type, expectedType);
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("TokenStore", () => {
	const store = createMainTokenStore();

	describe("getTokens", () => {
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
			const tokenStore = createTokenStore(code);
			check(tokenStore.getTokens(AST), ["bar"]);
			check(tokenStore.getTokens(AST, { includeComments: true }), [
				"A",
				"bar",
				"Z",
			]);
		});
	});

	describe("getTokensBefore", () => {
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
			const tokenStore = createTokenStore(code);
			check(tokenStore.getTokensBefore(AST, 1), []);
		});

		it("should retrieve no tokens before Program when it starts with a comment", () => {
			const code = "/*comment*/ bar";
			const tokenStore = createTokenStore(code);
			check(tokenStore.getTokensBefore(AST, 1), []);
		});

		it("should retrieve no tokens before Program when it starts with whitespace and a comment", () => {
			const code = " /*comment*/ bar";
			const tokenStore = createTokenStore(code);
			check(
				tokenStore.getTokensBefore(AST, {
					count: 1,
					includeComments: true,
				}),
				[],
			);
		});
	});

	describe("getTokenBefore", () => {
		it("should retrieve one token before a node", () => {
			assertTokenValue(store.getTokenBefore(BinaryExpression), "=");
		});

		it("should skip a given number of tokens", () => {
			assertTokenValue(store.getTokenBefore(BinaryExpression, 1), "answer");
			assertTokenValue(store.getTokenBefore(BinaryExpression, 2), "var");
		});

		it("should skip a given number of tokens with skip option", () => {
			assertTokenValue(store.getTokenBefore(BinaryExpression, { skip: 1 }), "answer");
			assertTokenValue(store.getTokenBefore(BinaryExpression, { skip: 2 }), "var");
		});

		it("should retrieve matched token with filter option", () => {
			assertTokenValue(
				store.getTokenBefore(BinaryExpression, t => t.value !== "="),
				"answer",
			);
		});

		it("should retrieve matched token with skip and filter options", () => {
			assertTokenValue(
				store.getTokenBefore(BinaryExpression, {
					skip: 1,
					filter: t => t.value !== "=",
				}),
				"var",
			);
		});

		it("should retrieve one token or comment before a node with includeComments option", () => {
			assertTokenValue(
				store.getTokenBefore(BinaryExpression, {
					includeComments: true,
				}),
				"C",
			);
		});

		it("should retrieve one token or comment before a node with includeComments and skip options", () => {
			assertTokenValue(
				store.getTokenBefore(BinaryExpression, {
					includeComments: true,
					skip: 1,
				}),
				"=",
			);
		});

		it("should retrieve one token or comment before a node with includeComments and skip and filter options", () => {
			assertTokenValue(
				store.getTokenBefore(BinaryExpression, {
					includeComments: true,
					skip: 1,
					filter: t => t.type.startsWith("Block"),
				}),
				"B",
			);
		});

		it("should retrieve the previous node if the comment at the end of source code is specified.", () => {
			const code = "a + b /*comment*/";
			const tokenStore = createTokenStore(code);
			const token = tokenStore.getTokenBefore(AST.comments[0]);

			assertTokenValue(token, "b");
		});

		it("should retrieve the previous comment if the first token is specified.", () => {
			const code = "/*comment*/ a + b";
			const tokenStore = createTokenStore(code);
			const token = tokenStore.getTokenBefore(AST.tokens[0], {
				includeComments: true,
			});

			assertTokenValue(token, "comment");
		});

		it("should retrieve null if the first comment is specified.", () => {
			const code = "/*comment*/ a + b";
			const tokenStore = createTokenStore(code);
			const token = tokenStore.getTokenBefore(AST.comments[0], {
				includeComments: true,
			});

			assertTokenNull(token);
		});

		it("should retrieve null before Program when it starts with whitespace", () => {
			const code = " bar";
			const tokenStore = createTokenStore(code);
			assertTokenNull(tokenStore.getTokenBefore(AST));
		});

		it("should retrieve null before Program when it starts with a comment", () => {
			const code = "/*comment*/ bar";
			const tokenStore = createTokenStore(code);
			assertTokenNull(tokenStore.getTokenBefore(AST));
		});

		it("should retrieve null before Program when it starts with whitespace and a comment", () => {
			const code = " /*comment*/ bar";
			const tokenStore = createTokenStore(code);
			assertTokenNull(
				tokenStore.getTokenBefore(AST, { includeComments: true }),
			);
		});
	});

	describe("getTokensAfter", () => {
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
			const tokenStore = createTokenStore(code);
			check(tokenStore.getTokensAfter(AST, 1), []);
		});

		it("should retrieve no tokens after Program when it ends with a comment", () => {
			const code = "bar /*comment*/";
			const tokenStore = createTokenStore(code);
			check(tokenStore.getTokensAfter(AST, 1), []);
		});

		it("should retrieve no tokens after Program when it ends with a comment and whitespace", () => {
			const code = "bar /*comment*/ ";
			const tokenStore = createTokenStore(code);
			check(
				tokenStore.getTokensAfter(AST, {
					count: 1,
					includeComments: true,
				}),
				[],
			);
		});
	});

	describe("getTokenAfter", () => {
		it("should retrieve one token after a node", () => {
			assertTokenValue(store.getTokenAfter(VariableDeclarator.id), "=");
		});

		it("should skip a given number of tokens", () => {
			assertTokenValue(store.getTokenAfter(VariableDeclarator.id, 1), "a");
			assertTokenValue(store.getTokenAfter(VariableDeclarator.id, 2), "*");
		});

		it("should skip a given number of tokens with skip option", () => {
			assertTokenValue(store.getTokenAfter(VariableDeclarator.id, { skip: 1 }), "a");
			assertTokenValue(store.getTokenAfter(VariableDeclarator.id, { skip: 2 }), "*");
		});

		it("should retrieve matched token with filter option", () => {
			assertTokenValue(
				store.getTokenAfter(VariableDeclarator.id, t => t.type === "Identifier"),
				"a",
			);
			assertTokenValue(
				store.getTokenAfter(VariableDeclarator.id, {
					filter: t => t.type === "Identifier",
				}),
				"a",
			);
		});

		it("should retrieve matched token with filter and skip options", () => {
			assertTokenValue(
				store.getTokenAfter(VariableDeclarator.id, {
					skip: 1,
					filter: t => t.type === "Identifier",
				}),
				"b",
			);
		});

		it("should retrieve one token or comment after a node with includeComments option", () => {
			assertTokenValue(
				store.getTokenAfter(VariableDeclarator.id, {
					includeComments: true,
				}),
				"B",
			);
		});

		it("should retrieve one token or comment after a node with includeComments and skip options", () => {
			assertTokenValue(
				store.getTokenAfter(VariableDeclarator.id, {
					includeComments: true,
					skip: 2,
				}),
				"C",
			);
		});

		it("should retrieve one token or comment after a node with includeComments and skip and filter options", () => {
			assertTokenValue(
				store.getTokenAfter(VariableDeclarator.id, {
					includeComments: true,
					skip: 2,
					filter: t => t.type.startsWith("Block"),
				}),
				"D",
			);
		});

		it("should retrieve the next node if the comment at the first of source code is specified.", () => {
			const code = "/*comment*/ a + b";
			const tokenStore = createTokenStore(code);
			const token = tokenStore.getTokenAfter(AST.comments[0]);

			assertTokenValue(token, "a");
		});

		it("should retrieve the next comment if the last token is specified.", () => {
			const code = "a + b /*comment*/";
			const tokenStore = createTokenStore(code);
			const token = tokenStore.getTokenAfter(AST.tokens[2], {
				includeComments: true,
			});

			assertTokenValue(token, "comment");
		});

		it("should retrieve null if the last comment is specified.", () => {
			const code = "a + b /*comment*/";
			const tokenStore = createTokenStore(code);
			const token = tokenStore.getTokenAfter(AST.comments[0], {
				includeComments: true,
			});

			assertTokenNull(token);
		});

		it("should retrieve null after Program when it ends with whitespace", () => {
			const code = "bar ";
			const tokenStore = createTokenStore(code);
			assertTokenNull(tokenStore.getTokenAfter(AST));
		});

		it("should retrieve null after Program when it ends with a comment", () => {
			const code = "bar /*comment*/";
			const tokenStore = createTokenStore(code);
			assertTokenNull(tokenStore.getTokenAfter(AST));
		});

		it("should retrieve null after Program when it ends with a comment and whitespace", () => {
			const code = "bar /*comment*/ ";
			const tokenStore = createTokenStore(code);
			assertTokenNull(
				tokenStore.getTokenAfter(AST, { includeComments: true }),
			);
		});
	});

	describe("getFirstTokens", () => {
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
				store.getFirstTokens(BinaryExpression, t => t.type === "Identifier"),
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
			const tokenStore = createTokenStore(code);
			check(tokenStore.getFirstTokens(AST, 1), ["bar"]);
		});

		it("should retrieve the first token from Program when it starts with a comment", () => {
			const code = "/*comment*/ bar";
			const tokenStore = createTokenStore(code);
			check(tokenStore.getFirstTokens(AST, 1), ["bar"]);
		});

		it("should retrieve the first token/comment from Program when it starts with whitespace and a comment", () => {
			const code = " /*comment*/ bar";
			const tokenStore = createTokenStore(code);
			check(
				tokenStore.getFirstTokens(AST, {
					count: 2,
					includeComments: true,
				}),
				["comment", "bar"],
			);
		});
	});

	describe("getFirstToken", () => {
		it("should retrieve the first token of a node's token stream", () => {
			assertTokenValue(store.getFirstToken(BinaryExpression), "a");
		});

		it("should skip a given number of tokens", () => {
			assertTokenValue(store.getFirstToken(BinaryExpression, 1), "*");
			assertTokenValue(store.getFirstToken(BinaryExpression, 2), "b");
		});

		it("should skip a given number of tokens with skip option", () => {
			assertTokenValue(store.getFirstToken(BinaryExpression, { skip: 1 }), "*");
			assertTokenValue(store.getFirstToken(BinaryExpression, { skip: 2 }), "b");
		});

		it("should retrieve matched token with filter option", () => {
			assertTokenValue(
				store.getFirstToken(BinaryExpression, t => t.type === "Identifier"),
				"a",
			);
			assertTokenValue(
				store.getFirstToken(BinaryExpression, {
					filter: t => t.type === "Identifier",
				}),
				"a",
			);
		});

		it("should retrieve matched token with filter and skip options", () => {
			assertTokenValue(
				store.getFirstToken(BinaryExpression, {
					skip: 1,
					filter: t => t.type === "Identifier",
				}),
				"b",
			);
		});

		it("should retrieve the first token or comment of a node's token stream with includeComments option", () => {
			assertTokenValue(
				store.getFirstToken(BinaryExpression, { includeComments: true }),
				"a",
			);
		});

		it("should retrieve the first matched token or comment of a node's token stream with includeComments and skip options", () => {
			assertTokenValue(
				store.getFirstToken(BinaryExpression, {
					includeComments: true,
					skip: 1,
				}),
				"D",
			);
		});

		it("should retrieve the first matched token or comment of a node's token stream with includeComments and skip and filter options", () => {
			assertTokenValue(
				store.getFirstToken(BinaryExpression, {
					includeComments: true,
					skip: 1,
					filter: t => t.value !== "a",
				}),
				"*",
			);
		});

		it("should retrieve the first comment if the comment is at the last of nodes", () => {
			const code = "a + b\n/*comment*/ c + d";
			const tokenStore = createTokenStore(code);

			const token = tokenStore.getFirstToken(
				{ range: [AST.comments[0].range[0], AST.tokens[5].range[1]] },
				{ includeComments: true },
			);

			assertTokenValue(token, "comment");
		});

		it("should retrieve the first token (without includeComments option) if the comment is at the last of nodes", () => {
			const code = "a + b\n/*comment*/ c + d";
			const tokenStore = createTokenStore(code);

			const token = tokenStore.getFirstToken({
				range: [AST.comments[0].range[0], AST.tokens[5].range[1]],
			});

			assertTokenValue(token, "c");
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

			assertTokenType(token, "Identifier");
		});

		it("should return null if the source contains only comments", () => {
			const code = "// comment";
			const tokenStore = createTokenStore(code);
			const token = tokenStore.getFirstToken(AST, {
				filter() {
					assert.fail("Unexpected call to filter callback");
				},
			});

			assertTokenNull(token);
		});

		it("should return null if the source is empty", () => {
			const code = "";
			const tokenStore = createTokenStore(code);
			const token = tokenStore.getFirstToken(AST);

			assertTokenNull(token);
		});

		it("should retrieve the first token from Program when it starts with whitespace", () => {
			const code = " bar";
			const tokenStore = createTokenStore(code);
			assertTokenValue(tokenStore.getFirstToken(AST), "bar");
		});

		it("should retrieve the first token from Program when it starts with a comment", () => {
			const code = "/*comment*/ bar";
			const tokenStore = createTokenStore(code);
			assertTokenValue(tokenStore.getFirstToken(AST), "bar");
		});

		it("should retrieve the first token from Program when it starts with whitespace and a comment", () => {
			const code = " /*comment*/ bar";
			const tokenStore = createTokenStore(code);
			assertTokenValue(
				tokenStore.getFirstToken(AST, { includeComments: true }),
				"comment",
			);
		});
	});

	describe("getLastTokens", () => {
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
				store.getLastTokens(BinaryExpression, t => t.type === "Identifier"),
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
			const tokenStore = createTokenStore(code);
			check(tokenStore.getLastTokens(AST, 1), ["bar"]);
		});

		it("should retrieve the last token from Program when it ends with a comment", () => {
			const code = "bar /*comment*/";
			const tokenStore = createTokenStore(code);
			check(tokenStore.getLastTokens(AST, 1), ["bar"]);
		});

		it("should retrieve the last token/comment from Program when it ends with a comment and whitespace", () => {
			const code = "bar /*comment*/ ";
			const tokenStore = createTokenStore(code);
			check(
				tokenStore.getLastTokens(AST, {
					count: 2,
					includeComments: true,
				}),
				["bar", "comment"],
			);
		});
	});

	describe("getLastToken", () => {
		it("should retrieve the last token of a node's token stream", () => {
			assertTokenValue(store.getLastToken(BinaryExpression), "b");
			assertTokenValue(store.getLastToken(VariableDeclaration), "b");
		});

		it("should skip a given number of tokens", () => {
			assertTokenValue(store.getLastToken(BinaryExpression, 1), "*");
			assertTokenValue(store.getLastToken(BinaryExpression, 2), "a");
		});

		it("should skip a given number of tokens with skip option", () => {
			assertTokenValue(store.getLastToken(BinaryExpression, { skip: 1 }), "*");
			assertTokenValue(store.getLastToken(BinaryExpression, { skip: 2 }), "a");
		});

		it("should retrieve the last matched token of a node's token stream with filter option", () => {
			assertTokenValue(
				store.getLastToken(BinaryExpression, t => t.value !== "b"),
				"*",
			);
			assertTokenValue(
				store.getLastToken(BinaryExpression, {
					filter: t => t.value !== "b",
				}),
				"*",
			);
		});

		it("should retrieve the last matched token of a node's token stream with filter and skip options", () => {
			assertTokenValue(
				store.getLastToken(BinaryExpression, {
					skip: 1,
					filter: t => t.type === "Identifier",
				}),
				"a",
			);
		});

		it("should retrieve the last token of a node's token stream with includeComments option", () => {
			assertTokenValue(
				store.getLastToken(BinaryExpression, { includeComments: true }),
				"b",
			);
		});

		it("should retrieve the last token of a node's token stream with includeComments and skip options", () => {
			assertTokenValue(
				store.getLastToken(BinaryExpression, {
					includeComments: true,
					skip: 2,
				}),
				"D",
			);
		});

		it("should retrieve the last token of a node's token stream with includeComments and skip and filter options", () => {
			assertTokenValue(
				store.getLastToken(BinaryExpression, {
					includeComments: true,
					skip: 1,
					filter: t => t.type !== "Identifier",
				}),
				"D",
			);
		});

		it("should retrieve the last comment if the comment is at the last of nodes", () => {
			const code = "a + b /*comment*/\nc + d";
			const tokenStore = createTokenStore(code);

			const token = tokenStore.getLastToken(
				{ range: [AST.tokens[0].range[0], AST.comments[0].range[1]] },
				{ includeComments: true },
			);

			assertTokenValue(token, "comment");
		});

		it("should retrieve the last token (without includeComments option) if the comment is at the last of nodes", () => {
			const code = "a + b /*comment*/\nc + d";
			const tokenStore = createTokenStore(code);

			const token = tokenStore.getLastToken({
				range: [AST.tokens[0].range[0], AST.comments[0].range[1]],
			});

			assertTokenValue(token, "b");
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

			assertTokenType(token, "Identifier");
		});

		it("should retrieve the last token from Program when it ends with whitespace", () => {
			const code = "bar ";
			const tokenStore = createTokenStore(code);
			assertTokenValue(tokenStore.getLastToken(AST), "bar");
		});

		it("should retrieve the last token from Program when it ends with a comment", () => {
			const code = "bar /*comment*/";
			const tokenStore = createTokenStore(code);
			assertTokenValue(tokenStore.getLastToken(AST), "bar");
		});

		it("should retrieve the last token from Program when it ends with a comment and whitespace", () => {
			const code = "bar /*comment*/ ";
			const tokenStore = createTokenStore(code);
			assertTokenValue(
				tokenStore.getLastToken(AST, { includeComments: true }),
				"comment",
			);
		});

		it("should return null if the source contains only comments", () => {
			const code = "// comment";
			const tokenStore = createTokenStore(code);
			const token = tokenStore.getLastToken(AST, {
				filter() {
					assert.fail("Unexpected call to filter callback");
				},
			});

			assertTokenNull(token);
		});

		it("should return null if the source is empty", () => {
			const code = "";
			const tokenStore = createTokenStore(code);
			const token = tokenStore.getLastToken(AST);

			assertTokenNull(token);
		});
	});

	describe("getFirstTokensBetween", () => {
		it("should retrieve zero tokens between adjacent nodes", () => {
			check(
				store.getFirstTokensBetween(BinaryExpression, CallExpression),
				[],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with count option", () => {
			check(
				store.getFirstTokensBetween(VariableDeclarator.id, BinaryExpression.right, 2),
				["=", "a"],
			);
			check(
				store.getFirstTokensBetween(VariableDeclarator.id, BinaryExpression.right, { count: 2 }),
				["=", "a"],
			);
		});

		it("should retrieve matched tokens between non-adjacent nodes with filter option", () => {
			check(
				store.getFirstTokensBetween(VariableDeclarator.id, BinaryExpression.right, { filter: t => t.type !== "Punctuator" }),
				["a"],
			);
		});

		it("should retrieve all tokens between non-adjacent nodes with empty object option", () => {
			check(
				store.getFirstTokensBetween(VariableDeclarator.id, BinaryExpression.right, {}),
				["=", "a", "*"],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with includeComments option", () => {
			check(
				store.getFirstTokensBetween(VariableDeclarator.id, BinaryExpression.right, { includeComments: true }),
				["B", "=", "C", "a", "D", "*"],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with includeComments and count options", () => {
			check(
				store.getFirstTokensBetween(VariableDeclarator.id, BinaryExpression.right, { includeComments: true, count: 3 }),
				["B", "=", "C"],
			);
		});

		it("should retrieve multiple tokens and comments between non-adjacent nodes with includeComments and filter options", () => {
			check(
				store.getFirstTokensBetween(VariableDeclarator.id, BinaryExpression.right, {
					includeComments: true,
					filter: t => t.type !== "Punctuator",
				}),
				["B", "C", "a", "D"],
			);
		});
	});

	describe("getFirstTokenBetween", () => {
		it("should return null between adjacent nodes", () => {
			assertTokenNull(store.getFirstTokenBetween(BinaryExpression, CallExpression));
		});

		it("should retrieve one token between non-adjacent nodes with count option", () => {
			assertTokenValue(
				store.getFirstTokenBetween(VariableDeclarator.id, BinaryExpression.right),
				"=",
			);
		});

		it("should retrieve one token between non-adjacent nodes with skip option", () => {
			assertTokenValue(
				store.getFirstTokenBetween(VariableDeclarator.id, BinaryExpression.right, 1),
				"a",
			);
			assertTokenValue(
				store.getFirstTokenBetween(VariableDeclarator.id, BinaryExpression.right, { skip: 2 }),
				"*",
			);
		});

		it("should return null if it's skipped beyond the right token", () => {
			assertTokenNull(
				store.getFirstTokenBetween(VariableDeclarator.id, BinaryExpression.right, { skip: 3 }),
			);
			assertTokenNull(
				store.getFirstTokenBetween(VariableDeclarator.id, BinaryExpression.right, { skip: 4 }),
			);
		});

		it("should retrieve the first matched token between non-adjacent nodes with filter option", () => {
			assertTokenValue(
				store.getFirstTokenBetween(VariableDeclarator.id, BinaryExpression.right, { filter: t => t.type !== "Identifier" }),
				"=",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments option", () => {
			assertTokenValue(
				store.getFirstTokenBetween(VariableDeclarator.id, BinaryExpression.right, { includeComments: true }),
				"B",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip options", () => {
			assertTokenValue(
				store.getFirstTokenBetween(VariableDeclarator.id, BinaryExpression.right, { includeComments: true, skip: 1 }),
				"=",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip and filter options", () => {
			assertTokenValue(
				store.getFirstTokenBetween(VariableDeclarator.id, BinaryExpression.right, {
					includeComments: true,
					skip: 1,
					filter: t => t.type !== "Punctuator",
				}),
				"C",
			);
		});
	});

	describe("getLastTokensBetween", () => {
		it("should retrieve zero tokens between adjacent nodes", () => {
			check(
				store.getLastTokensBetween(BinaryExpression, CallExpression),
				[],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with count option", () => {
			check(
				store.getLastTokensBetween(VariableDeclarator.id, BinaryExpression.right, 2),
				["a", "*"],
			);
			check(
				store.getLastTokensBetween(VariableDeclarator.id, BinaryExpression.right, { count: 2 }),
				["a", "*"],
			);
		});

		it("should retrieve matched tokens between non-adjacent nodes with filter option", () => {
			check(
				store.getLastTokensBetween(VariableDeclarator.id, BinaryExpression.right, { filter: t => t.type !== "Punctuator" }),
				["a"],
			);
		});

		it("should retrieve all tokens between non-adjacent nodes with empty object option", () => {
			check(
				store.getLastTokensBetween(VariableDeclarator.id, BinaryExpression.right, {}),
				["=", "a", "*"],
			);
		});

		it("should retrieve all tokens and comments between non-adjacent nodes with includeComments option", () => {
			check(
				store.getLastTokensBetween(VariableDeclarator.id, BinaryExpression.right, { includeComments: true }),
				["B", "=", "C", "a", "D", "*"],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with includeComments and count options", () => {
			check(
				store.getLastTokensBetween(VariableDeclarator.id, BinaryExpression.right, { includeComments: true, count: 3 }),
				["a", "D", "*"],
			);
		});

		it("should retrieve multiple tokens and comments between non-adjacent nodes with includeComments and filter options", () => {
			check(
				store.getLastTokensBetween(VariableDeclarator.id, BinaryExpression.right, {
					includeComments: true,
					filter: t => t.type !== "Punctuator",
				}),
				["B", "C", "a", "D"],
			);
		});
	});

	describe("getLastTokenBetween", () => {
		it("should return null between adjacent nodes", () => {
			assertTokenNull(store.getLastTokenBetween(BinaryExpression, CallExpression));
		});

		it("should retrieve one token between non-adjacent nodes with count option", () => {
			assertTokenValue(
				store.getLastTokenBetween(VariableDeclarator.id, BinaryExpression.right),
				"*",
			);
		});

		it("should retrieve one token between non-adjacent nodes with skip option", () => {
			assertTokenValue(
				store.getLastTokenBetween(VariableDeclarator.id, BinaryExpression.right, 1),
				"a",
			);
			assertTokenValue(
				store.getLastTokenBetween(VariableDeclarator.id, BinaryExpression.right, { skip: 2 }),
				"=",
			);
		});

		it("should return null if it's skipped beyond the right token", () => {
			assertTokenNull(
				store.getLastTokenBetween(VariableDeclarator.id, BinaryExpression.right, { skip: 3 }),
			);
			assertTokenNull(
				store.getLastTokenBetween(VariableDeclarator.id, BinaryExpression.right, { skip: 4 }),
			);
		});

		it("should retrieve the first matched token between non-adjacent nodes with filter option", () => {
			assertTokenValue(
				store.getLastTokenBetween(VariableDeclarator.id, BinaryExpression.right, { filter: t => t.type !== "Identifier" }),
				"*",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments option", () => {
			assertTokenValue(
				store.getLastTokenBetween(VariableDeclarator.id, BinaryExpression.right, { includeComments: true }),
				"*",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip options", () => {
			assertTokenValue(
				store.getLastTokenBetween(VariableDeclarator.id, BinaryExpression.right, { includeComments: true, skip: 1 }),
				"D",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip and filter options", () => {
			assertTokenValue(
				store.getLastTokenBetween(VariableDeclarator.id, BinaryExpression.right, {
					includeComments: true,
					skip: 1,
					filter: t => t.type !== "Punctuator",
				}),
				"a",
			);
		});
	});

	describe("getTokensBetween", () => {
		it("should retrieve zero tokens between adjacent nodes", () => {
			check(store.getTokensBetween(BinaryExpression, CallExpression), []);
		});

		it("should retrieve one token between nodes", () => {
			check(
				store.getTokensBetween(BinaryExpression.left, BinaryExpression.right),
				["*"],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes", () => {
			check(
				store.getTokensBetween(VariableDeclarator.id, BinaryExpression.right),
				["=", "a", "*"],
			);
		});

		it("should retrieve surrounding tokens when asked for padding", () => {
			check(
				store.getTokensBetween(VariableDeclarator.id, BinaryExpression.left, 2),
				["var", "answer", "=", "a", "*"],
			);
		});
	});

	describe("getTokenByRangeStart", () => {
		it("should return identifier token", () => {
			const result = store.getTokenByRangeStart(9);

			assertTokenType(result, "Identifier");
			assertTokenValue(result, "answer");
		});

		it("should return null when token doesn't exist", () => {
			const result = store.getTokenByRangeStart(10);

			assertTokenNull(result);
		});

		it("should return a comment token when includeComments is true", () => {
			const result = store.getTokenByRangeStart(15, {
				includeComments: true,
			});

			assertTokenType(result, "Block");
			assertTokenValue(result, "B");
		});

		it("should not return a comment token at the supplied index when includeComments is false", () => {
			const result = store.getTokenByRangeStart(15, {
				includeComments: false,
			});

			assertTokenNull(result);
		});

		it("should not return comment tokens by default", () => {
			const result = store.getTokenByRangeStart(15);

			assertTokenNull(result);
		});
	});

	describe("getFirstToken & getTokenAfter", () => {
		it("should retrieve all tokens and comments in the node", () => {
			const code = "(function(a, /*b,*/ c){})";
			const tokenStore = createTokenStore(code);
			const tokens = [];
			let token = tokenStore.getFirstToken(AST);

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
			const tokenStore = createTokenStore(code);
			const tokens = [];
			let token = tokenStore.getFirstToken(AST);

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

	describe("getLastToken & getTokenBefore", () => {
		it("should retrieve all tokens and comments in the node", () => {
			const code = "(function(a, /*b,*/ c){})";
			const tokenStore = createTokenStore(code);
			const tokens = [];
			let token = tokenStore.getLastToken(AST);

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

		it("should retrieve all tokens and comments in the node (no spaces)", () => {
			const code = "(function(a,/*b,*/c){})";
			const tokenStore = createTokenStore(code);
			const tokens = [];
			let token = tokenStore.getLastToken(AST);

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

	describe("commentsExistBetween", () => {
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
			assertTokenValue(store.getCommentsBefore(VariableDeclaration)[0], "A");
		});

		it("should retrieve comments before a token", () => {
			assertTokenValue(store.getCommentsBefore(TOKENS[2]), "B");
		});

		it("should retrieve multiple comments before a node", () => {
			const comments = store.getCommentsBefore(CallExpression);

			assert.strictEqual(comments.length, 2);
			assertTokenValue(comments[0], "E");
			assertTokenValue(comments[1], "F");
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
			const tokenStore = createTokenStore(code);
			check(tokenStore.getCommentsBefore(AST), []);
		});
	});

	describe("getCommentsAfter", () => {
		it("should retrieve comments after a node", () => {
			assertTokenValue(store.getCommentsAfter(VariableDeclarator.id)[0], "B");
		});

		it("should retrieve comments after a token", () => {
			assertTokenValue(store.getCommentsAfter(TOKENS[2]), "C");
		});

		it("should retrieve multiple comments after a node", () => {
			const comments = store.getCommentsAfter(VariableDeclaration);

			assert.strictEqual(comments.length, 2);
			assertTokenValue(comments[0], "E");
			assertTokenValue(comments[1], "F");
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
			const tokenStore = createTokenStore(code);
			check(tokenStore.getCommentsAfter(AST), []);
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
```