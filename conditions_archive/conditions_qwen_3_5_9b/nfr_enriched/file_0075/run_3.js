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
 * Creates a token store from parsed source code.
 * @param {string} code Source code string
 * @returns {TokenStore} TokenStore instance
 */
function createTokenStore(code) {
	const ast = espree.parse(code, DEFAULT_CONFIG);
	return new TokenStore(ast.tokens, ast.comments);
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

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

		it("should retrieve tokens with padding before and after binary expression", () => {
			check(store.getTokens(BinaryExpression, 1), ["=", "a", "*", "b"]);
			check(store.getTokens(BinaryExpression, 0, 1), [
				"a",
				"*",
				"b",
				"call",
			]);
			check(store.getTokens(BinaryExpression, 2, 1), [
				"answer",
				"=",
				"a",
				"*",
				"b",
				"call",
			]);
		});

		it("should retrieve matched tokens for root node with filter", () => {
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

		it("should retrieve all tokens and comments in the node for root node", () => {
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

		it("should retrieve matched tokens and comments with filter options", () => {
			check(
				store.getTokens(Program, {
					includeComments: true,
					filter: t => t.type.startsWith("Block"),
				}),
				["A", "B", "C", "D", "E", "Z"],
			);
		});

		it("should retrieve tokens and comments for binary expression", () => {
			check(
				store.getTokens(BinaryExpression, { includeComments: true }),
				["a", "D", "*", "b"],
			);
		});

		it("should retrieve tokens with leading and trailing comments and whitespace", () => {
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

	describe("when calling getTokensBefore", () => {
		it("should retrieve zero tokens before a node", () => {
			check(store.getTokensBefore(BinaryExpression, 0), []);
		});

		it("should retrieve tokens before a node with count", () => {
			check(store.getTokensBefore(BinaryExpression, 1), ["="]);
			check(store.getTokensBefore(BinaryExpression, 2), ["answer", "="]);
			check(store.getTokensBefore(BinaryExpression, 9e9), [
				"var",
				"answer",
				"=",
			]);
		});

		it("should retrieve tokens before a node with count option", () => {
			check(store.getTokensBefore(BinaryExpression, { count: 2 }), [
				"answer",
				"=",
			]);
		});

		it("should retrieve matched tokens before a node with filter", () => {
			check(
				store.getTokensBefore(BinaryExpression, {
					count: 1,
					filter: t => t.value !== "=",
				}),
				["answer"],
			);
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

		it("should retrieve tokens and comments before a node", () => {
			check(
				store.getTokensBefore(BinaryExpression, {
					count: 3,
					includeComments: true,
				}),
				["B", "=", "C"],
			);
			check(
				store.getTokensBefore(BinaryExpression, {
					includeComments: true,
				}),
				["A", "var", "answer", "B", "=", "C"],
			);
			check(
				store.getTokensBefore(BinaryExpression, {
					includeComments: true,
					filter: t => t.type.startsWith("Block"),
				}),
				["A", "B", "C"],
			);
		});

		it("should retrieve no tokens before Program with whitespace", () => {
			const code = " bar";
			const tokenStore = createTokenStore(code);
			check(tokenStore.getTokensBefore(AST, 1), []);
		});

		it("should retrieve no tokens before Program with comment", () => {
			const code = "/*comment*/ bar";
			const tokenStore = createTokenStore(code);
			check(tokenStore.getTokensBefore(AST, 1), []);
		});

		it("should retrieve no tokens before Program with whitespace and comment", () => {
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

	describe("when calling getTokenBefore", () => {
		it("should retrieve one token before a node", () => {
			assert.strictEqual(
				store.getTokenBefore(BinaryExpression).value,
				"=",
			);
		});

		it("should skip tokens before a node", () => {
			assert.strictEqual(
				store.getTokenBefore(BinaryExpression, 1).value,
				"answer",
			);
			assert.strictEqual(
				store.getTokenBefore(BinaryExpression, 2).value,
				"var",
			);
		});

		it("should skip tokens with skip option", () => {
			assert.strictEqual(
				store.getTokenBefore(BinaryExpression, { skip: 1 }).value,
				"answer",
			);
			assert.strictEqual(
				store.getTokenBefore(BinaryExpression, { skip: 2 }).value,
				"var",
			);
		});

		it("should retrieve matched token with filter", () => {
			assert.strictEqual(
				store.getTokenBefore(BinaryExpression, t => t.value !== "=")
					.value,
				"answer",
			);
		});

		it("should retrieve matched token with skip and filter", () => {
			assert.strictEqual(
				store.getTokenBefore(BinaryExpression, {
					skip: 1,
					filter: t => t.value !== "=",
				}).value,
				"var",
			);
		});

		it("should retrieve token or comment before a node", () => {
			assert.strictEqual(
				store.getTokenBefore(BinaryExpression, {
					includeComments: true,
				}).value,
				"C",
			);
			assert.strictEqual(
				store.getTokenBefore(BinaryExpression, {
					includeComments: true,
					skip: 1,
				}).value,
				"=",
			);
			assert.strictEqual(
				store.getTokenBefore(BinaryExpression, {
					includeComments: true,
					skip: 1,
					filter: t => t.type.startsWith("Block"),
				}).value,
				"B",
			);
		});

		it("should retrieve previous node if comment at end of source is specified", () => {
			const code = "a + b /*comment*/";
			const tokenStore = createTokenStore(code);
			const token = tokenStore.getTokenBefore(AST.comments[0]);

			assert.strictEqual(token.value, "b");
		});

		it("should retrieve previous comment if first token is specified", () => {
			const code = "/*comment*/ a + b";
			const tokenStore = createTokenStore(code);
			const token = tokenStore.getTokenBefore(AST.tokens[0], {
				includeComments: true,
			});

			assert.strictEqual(token.value, "comment");
		});

		it("should retrieve null if first comment is specified", () => {
			const code = "/*comment*/ a + b";
			const tokenStore = createTokenStore(code);
			const token = tokenStore.getTokenBefore(AST.comments[0], {
				includeComments: true,
			});

			assert.strictEqual(token, null);
		});

		it("should retrieve null before Program with whitespace", () => {
			const code = " bar";
			const tokenStore = createTokenStore(code);
			assert.strictEqual(tokenStore.getTokenBefore(AST), null);
		});

		it("should retrieve null before Program with comment", () => {
			const code = "/*comment*/ bar";
			const tokenStore = createTokenStore(code);
			assert.strictEqual(tokenStore.getTokenBefore(AST), null);
		});

		it("should retrieve null before Program with whitespace and comment", () => {
			const code = " /*comment*/ bar";
			const tokenStore = createTokenStore(code);
			assert.strictEqual(
				tokenStore.getTokenBefore(AST, { includeComments: true }),
				null,
			);
		});
	});

	describe("when calling getTokensAfter", () => {
		it("should retrieve zero tokens after a node", () => {
			check(store.getTokensAfter(VariableDeclarator.id, 0), []);
		});

		it("should retrieve tokens after a node with count", () => {
			check(store.getTokensAfter(VariableDeclarator.id, 1), ["="]);
			check(store.getTokensAfter(VariableDeclarator.id, 2), ["=", "a"]);
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

		it("should retrieve tokens after a node with count option", () => {
			check(store.getTokensAfter(VariableDeclarator.id, { count: 2 }), [
				"=",
				"a",
			]);
		});

		it("should retrieve matched tokens after a node with filter", () => {
			check(
				store.getTokensAfter(VariableDeclarator.id, {
					filter: t => t.type === "Identifier",
				}),
				["a", "b", "call"],
			);
			check(
				store.getTokensAfter(VariableDeclarator.id, {
					count: 2,
					filter: t => t.type === "Identifier",
				}),
				["a", "b"],
			);
		});

		it("should retrieve tokens and comments after a node", () => {
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

		it("should retrieve tokens and comments after a node with count", () => {
			check(
				store.getTokensAfter(VariableDeclarator.id, {
					includeComments: true,
					count: 3,
				}),
				["B", "=", "C"],
			);
		});

		it("should retrieve matched tokens and comments after a node", () => {
			check(
				store.getTokensAfter(VariableDeclarator.id, {
					includeComments: true,
					count: 3,
					filter: t => t.type.startsWith("Block"),
				}),
				["B", "C", "D"],
			);
		});

		it("should retrieve no tokens after Program with whitespace", () => {
			const code = "bar ";
			const tokenStore = createTokenStore(code);
			check(tokenStore.getTokensAfter(AST, 1), []);
		});

		it("should retrieve no tokens after Program with comment", () => {
			const code = "bar /*comment*/";
			const tokenStore = createTokenStore(code);
			check(tokenStore.getTokensAfter(AST, 1), []);
		});

		it("should retrieve no tokens after Program with comment and whitespace", () => {
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

	describe("when calling getTokenAfter", () => {
		it("should retrieve one token after a node", () => {
			assert.strictEqual(
				store.getTokenAfter(VariableDeclarator.id).value,
				"=",
			);
		});

		it("should skip tokens after a node", () => {
			assert.strictEqual(
				store.getTokenAfter(VariableDeclarator.id, 1).value,
				"a",
			);
			assert.strictEqual(
				store.getTokenAfter(VariableDeclarator.id, 2).value,
				"*",
			);
		});

		it("should skip tokens with skip option", () => {
			assert.strictEqual(
				store.getTokenAfter(VariableDeclarator.id, { skip: 1 }).value,
				"a",
			);
			assert.strictEqual(
				store.getTokenAfter(VariableDeclarator.id, { skip: 2 }).value,
				"*",
			);
		});

		it("should retrieve matched token with filter", () => {
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

		it("should retrieve matched token with filter and skip", () => {
			assert.strictEqual(
				store.getTokenAfter(VariableDeclarator.id, {
					skip: 1,
					filter: t => t.type === "Identifier",
				}).value,
				"b",
			);
		});

		it("should retrieve token or comment after a node", () => {
			assert.strictEqual(
				store.getTokenAfter(VariableDeclarator.id, {
					includeComments: true,
				}).value,
				"B",
			);
			assert.strictEqual(
				store.getTokenAfter(VariableDeclarator.id, {
					includeComments: true,
					skip: 2,
				}).value,
				"C",
			);
			assert.strictEqual(
				store.getTokenAfter(VariableDeclarator.id, {
					includeComments: true,
					skip: 2,
					filter: t => t.type.startsWith("Block"),
				}).value,
				"D",
			);
		});

		it("should retrieve next node if comment at first of source is specified", () => {
			const code = "/*comment*/ a + b";
			const tokenStore = createTokenStore(code);
			const token = tokenStore.getTokenAfter(AST.comments[0]);

			assert.strictEqual(token.value, "a");
		});

		it("should retrieve next comment if last token is specified", () => {
			const code = "a + b /*comment*/";
			const tokenStore = createTokenStore(code);
			const token = tokenStore.getTokenAfter(AST.tokens[2], {
				includeComments: true,
			});

			assert.strictEqual(token.value, "comment");
		});

		it("should retrieve null if last comment is specified", () => {
			const code = "a + b /*comment*/";
			const tokenStore = createTokenStore(code);
			const token = tokenStore.getTokenAfter(AST.comments[0], {
				includeComments: true,
			});

			assert.strictEqual(token, null);
		});

		it("should retrieve null after Program with whitespace", () => {
			const code = "bar ";
			const tokenStore = createTokenStore(code);
			assert.strictEqual(tokenStore.getTokenAfter(AST), null);
		});

		it("should retrieve null after Program with comment", () => {
			const code = "bar /*comment*/";
			const tokenStore = createTokenStore(code);
			assert.strictEqual(tokenStore.getTokenAfter(AST), null);
		});

		it("should retrieve null after Program with comment and whitespace", () => {
			const code = "bar /*comment*/ ";
			const tokenStore = createTokenStore(code);
			assert.strictEqual(
				tokenStore.getTokenAfter(AST, { includeComments: true }),
				null,
			);
		});
	});

	describe("when calling getFirstTokens", () => {
		it("should retrieve zero tokens from a node's token stream", () => {
			check(store.getFirstTokens(BinaryExpression, 0), []);
		});

		it("should retrieve tokens from a node's token stream with count", () => {
			check(store.getFirstTokens(BinaryExpression, 1), ["a"]);
			check(store.getFirstTokens(BinaryExpression, 2), ["a", "*"]);
			check(store.getFirstTokens(BinaryExpression, 9e9), ["a", "*", "b"]);
		});

		it("should retrieve tokens from a node's token stream with count option", () => {
			check(store.getFirstTokens(BinaryExpression, { count: 2 }), [
				"a",
				"*",
			]);
		});

		it("should retrieve matched tokens from a node's token stream", () => {
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

		it("should retrieve matched tokens from a node's token stream with count", () => {
			check(
				store.getFirstTokens(BinaryExpression, {
					count: 1,
					filter: t => t.type === "Identifier",
				}),
				["a"],
			);
		});

		it("should retrieve tokens and comments from a node's token stream", () => {
			check(
				store.getFirstTokens(BinaryExpression, {
					includeComments: true,
				}),
				["a", "D", "*", "b"],
			);
		});

		it("should retrieve tokens and comments from a node's token stream with count", () => {
			check(
				store.getFirstTokens(BinaryExpression, {
					includeComments: true,
					count: 3,
				}),
				["a", "D", "*"],
			);
		});

		it("should retrieve tokens and comments from a node's token stream with filter", () => {
			check(
				store.getFirstTokens(BinaryExpression, {
					includeComments: true,
					count: 3,
					filter: t => t.value !== "a",
				}),
				["D", "*", "b"],
			);
		});

		it("should retrieve first token from Program with whitespace", () => {
			const code = " bar";
			const tokenStore = createTokenStore(code);
			check(tokenStore.getFirstTokens(AST, 1), ["bar"]);
		});

		it("should retrieve first token from Program with comment", () => {
			const code = "/*comment*/ bar";
			const tokenStore = createTokenStore(code);
			check(tokenStore.getFirstTokens(AST, 1), ["bar"]);
		});

		it("should retrieve first token/comment from Program with whitespace and comment", () => {
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

	describe("when calling getFirstToken", () => {
		it("should retrieve first token of a node's token stream", () => {
			assert.strictEqual(
				store.getFirstToken(BinaryExpression).value,
				"a",
			);
		});

		it("should skip tokens in a node's token stream", () => {
			assert.strictEqual(
				store.getFirstToken(BinaryExpression, 1).value,
				"*",
			);
			assert.strictEqual(
				store.getFirstToken(BinaryExpression, 2).value,
				"b",
			);
		});

		it("should skip tokens with skip option", () => {
			assert.strictEqual(
				store.getFirstToken(BinaryExpression, { skip: 1 }).value,
				"*",
			);
			assert.strictEqual(
				store.getFirstToken(BinaryExpression, { skip: 2 }).value,
				"b",
			);
		});

		it("should retrieve matched token with filter", () => {
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

		it("should retrieve matched token with filter and skip", () => {
			assert.strictEqual(
				store.getFirstToken(BinaryExpression, {
					skip: 1,
					filter: t => t.type === "Identifier",
				}).value,
				"b",
			);
		});

		it("should retrieve first token or comment of a node's token stream", () => {
			assert.strictEqual(
				store.getFirstToken(BinaryExpression, { includeComments: true })
					.value,
				"a",
			);
		});

		it("should retrieve first matched token or comment of a node's token stream with skip", () => {
			assert.strictEqual(
				store.getFirstToken(BinaryExpression, {
					includeComments: true,
					skip: 1,
				}).value,
				"D",
			);
		});

		it("should retrieve first matched token or comment of a node's token stream with skip and filter", () => {
			assert.strictEqual(
				store.getFirstToken(BinaryExpression, {
					includeComments: true,
					skip: 1,
					filter: t => t.value !== "a",
				}).value,
				"*",
			);
		});

		it("should retrieve first comment if comment is at last of nodes", () => {
			const code = "a + b\n/*comment*/ c + d";
			const tokenStore = createTokenStore(code);

			const token = tokenStore.getFirstToken(
				{ range: [AST.comments[0].range[0], AST.tokens[5].range[1]] },
				{ includeComments: true },
			);

			assert.strictEqual(token.value, "comment");
		});

		it("should retrieve first token if comment is at last of nodes", () => {
			const code = "a + b\n/*comment*/ c + d";
			const tokenStore = createTokenStore(code);

			const token = tokenStore.getFirstToken({
				range: [AST.comments[0].range[0], AST.tokens[5].range[1]],
			});

			assert.strictEqual(token.value, "c");
		});

		it("should retrieve first token if root node contains trailing comment", () => {
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

		it("should return null if source contains only comments", () => {
			const code = "// comment";
			const tokenStore = createTokenStore(code);
			const token = tokenStore.getFirstToken(AST, {
				filter() {
					assert.fail("Unexpected call to filter callback");
				},
			});

			assert.strictEqual(token, null);
		});

		it("should return null if source is empty", () => {
			const code = "";
			const tokenStore = createTokenStore(code);
			const token = tokenStore.getFirstToken(AST);

			assert.strictEqual(token, null);
		});

		it("should retrieve first token from Program with whitespace", () => {
			const code = " bar";
			const tokenStore = createTokenStore(code);
			assert.strictEqual(tokenStore.getFirstToken(AST).value, "bar");
		});

		it("should retrieve first token from Program with comment", () => {
			const code = "/*comment*/ bar";
			const tokenStore = createTokenStore(code);
			assert.strictEqual(tokenStore.getFirstToken(AST).value, "bar");
		});

		it("should retrieve first token from Program with whitespace and comment", () => {
			const code = " /*comment*/ bar";
			const tokenStore = createTokenStore(code);
			assert.strictEqual(
				tokenStore.getFirstToken(AST, { includeComments: true }).value,
				"comment",
			);
		});
	});

	describe("when calling getLastTokens", () => {
		it("should retrieve zero tokens from the end of a node's token stream", () => {
			check(store.getLastTokens(BinaryExpression, 0), []);
		});

		it("should retrieve tokens from the end of a node's token stream with count", () => {
			check(store.getLastTokens(BinaryExpression, 1), ["b"]);
			check(store.getLastTokens(BinaryExpression, 2), ["*", "b"]);
			check(store.getLastTokens(BinaryExpression, 9e9), ["a", "*", "b"]);
		});

		it("should retrieve tokens from the end of a node's token stream with count option", () => {
			check(store.getLastTokens(BinaryExpression, { count: 2 }), [
				"*",
				"b",
			]);
		});

		it("should retrieve matched tokens from the end of a node's token stream", () => {
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

		it("should retrieve matched tokens from the end of a node's token stream with count", () => {
			check(
				store.getLastTokens(BinaryExpression, {
					count: 1,
					filter: t => t.type === "Identifier",
				}),
				["b"],
			);
		});

		it("should retrieve tokens from the end of a node's token stream", () => {
			check(
				store.getLastTokens(BinaryExpression, {
					includeComments: true,
				}),
				["a", "D", "*", "b"],
			);
		});

		it("should retrieve matched tokens from the end of a node's token stream with count", () => {
			check(
				store.getLastTokens(BinaryExpression, {
					includeComments: true,
					count: 3,
				}),
				["D", "*", "b"],
			);
		});

		it("should retrieve matched tokens from the end of a node's token stream with filter", () => {
			check(
				store.getLastTokens(BinaryExpression, {
					includeComments: true,
					count: 3,
					filter: t => t.type !== "Punctuator",
				}),
				["a", "D", "b"],
			);
		});

		it("should retrieve last token from Program with whitespace", () => {
			const code = "bar ";
			const tokenStore = createTokenStore(code);
			check(tokenStore.getLastTokens(AST, 1), ["bar"]);
		});

		it("should retrieve last token from Program with comment", () => {
			const code = "bar /*comment*/";
			const tokenStore = createTokenStore(code);
			check(tokenStore.getLastTokens(AST, 1), ["bar"]);
		});

		it("should retrieve last token/comment from Program with comment and whitespace", () => {
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

	describe("when calling getLastToken", () => {
		it("should retrieve last token of a node's token stream", () => {
			assert.strictEqual(store.getLastToken(BinaryExpression).value, "b");
			assert.strictEqual(
				store.getLastToken(VariableDeclaration).value,
				"b",
			);
		});

		it("should skip tokens in a node's token stream", () => {
			assert.strictEqual(
				store.getLastToken(BinaryExpression, 1).value,
				"*",
			);
			assert.strictEqual(
				store.getLastToken(BinaryExpression, 2).value,
				"a",
			);
		});

		it("should skip tokens with skip option", () => {
			assert.strictEqual(
				store.getLastToken(BinaryExpression, { skip: 1 }).value,
				"*",
			);
			assert.strictEqual(
				store.getLastToken(BinaryExpression, { skip: 2 }).value,
				"a",
			);
		});

		it("should retrieve last matched token of a node's token stream", () => {
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

		it("should retrieve last matched token of a node's token stream with filter and skip", () => {
			assert.strictEqual(
				store.getLastToken(BinaryExpression, {
					skip: 1,
					filter: t => t.type === "Identifier",
				}).value,
				"a",
			);
		});

		it("should retrieve last token of a node's token stream", () => {
			assert.strictEqual(
				store.getLastToken(BinaryExpression, { includeComments: true })
					.value,
				"b",
			);
		});

		it("should retrieve last token of a node's token stream with skip", () => {
			assert.strictEqual(
				store.getLastToken(BinaryExpression, {
					includeComments: true,
					skip: 2,
				}).value,
				"D",
			);
		});

		it("should retrieve last token of a node's token stream with skip and filter", () => {
			assert.strictEqual(
				store.getLastToken(BinaryExpression, {
					includeComments: true,
					skip: 1,
					filter: t => t.type !== "Identifier",
				}).value,
				"D",
			);
		});

		it("should retrieve last comment if comment is at last of nodes", () => {
			const code = "a + b /*comment*/\nc + d";
			const tokenStore = createTokenStore(code);

			const token = tokenStore.getLastToken(
				{ range: [AST.tokens[0].range[0], AST.comments[0].range[1]] },
				{ includeComments: true },
			);

			assert.strictEqual(token.value, "comment");
		});

		it("should retrieve last token if comment is at last of nodes", () => {
			const code = "a + b /*comment*/\nc + d";
			const tokenStore = createTokenStore(code);

			const token = tokenStore.getLastToken({
				range: [AST.tokens[0].range[0], AST.comments[0].range[1]],
			});

			assert.strictEqual(token.value, "b");
		});

		it("should retrieve last token if root node contains trailing comment", () => {
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

		it("should retrieve last token from Program with whitespace", () => {
			const code = "bar ";
			const tokenStore = createTokenStore(code);
			assert.strictEqual(tokenStore.getLastToken(AST).value, "bar");
		});

		it("should retrieve last token from Program with comment", () => {
			const code = "bar /*comment*/";
			const tokenStore = createTokenStore(code);
			assert.strictEqual(tokenStore.getLastToken(AST).value, "bar");
		});

		it("should retrieve last token from Program with comment and whitespace", () => {
			const code = "bar /*comment*/ ";
			const tokenStore = createTokenStore(code);
			assert.strictEqual(
				tokenStore.getLastToken(AST, { includeComments: true }).value,
				"comment",
			);
		});

		it("should return null if source contains only comments", () => {
			const code = "// comment";
			const tokenStore = createTokenStore(code);
			const token = tokenStore.getLastToken(AST, {
				filter() {
					assert.fail("Unexpected call to filter callback");
				},
			});

			assert.strictEqual(token, null);
		});

		it("should return null if source is empty", () => {
			const code = "";
			const tokenStore = createTokenStore(code);
			const token = tokenStore.getLastToken(AST);

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

		it("should retrieve tokens between non-adjacent nodes with count", () => {
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

		it("should retrieve matched tokens between non-adjacent nodes with filter", () => {
			check(
				store.getFirstTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ filter: t => t.type !== "Punctuator" },
				),
				["a"],
			);
		});

		it("should retrieve all tokens between non-adjacent nodes with empty object", () => {
			check(
				store.getFirstTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{},
				),
				["=", "a", "*"],
			);
		});

		it("should retrieve tokens between non-adjacent nodes with includeComments", () => {
			check(
				store.getFirstTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true },
				),
				["B", "=", "C", "a", "D", "*"],
			);
		});

		it("should retrieve tokens between non-adjacent nodes with includeComments and count", () => {
			check(
				store.getFirstTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true, count: 3 },
				),
				["B", "=", "C"],
			);
		});

		it("should retrieve tokens between non-adjacent nodes with includeComments and filter", () => {
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

		it("should retrieve token between non-adjacent nodes", () => {
			assert.strictEqual(
				store.getFirstTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
				).value,
				"=",
			);
		});

		it("should retrieve token between non-adjacent nodes with skip", () => {
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

		it("should return null if skipped beyond right token", () => {
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

		it("should retrieve first matched token between non-adjacent nodes with filter", () => {
			assert.strictEqual(
				store.getFirstTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ filter: t => t.type !== "Identifier" },
				).value,
				"=",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes", () => {
			assert.strictEqual(
				store.getFirstTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true },
				).value,
				"B",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with skip", () => {
			assert.strictEqual(
				store.getFirstTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true, skip: 1 },
				).value,
				"=",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with skip and filter", () => {
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

		it("should retrieve tokens between non-adjacent nodes with count", () => {
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

		it("should retrieve matched tokens between non-adjacent nodes with filter", () => {
			check(
				store.getLastTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ filter: t => t.type !== "Punctuator" },
				),
				["a"],
			);
		});

		it("should retrieve all tokens between non-adjacent nodes with empty object", () => {
			check(
				store.getLastTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{},
				),
				["=", "a", "*"],
			);
		});

		it("should retrieve tokens and comments between non-adjacent nodes", () => {
			check(
				store.getLastTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true },
				),
				["B", "=", "C", "a", "D", "*"],
			);
		});

		it("should retrieve tokens between non-adjacent nodes with includeComments and count", () => {
			check(
				store.getLastTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true, count: 3 },
				),
				["a", "D", "*"],
			);
		});

		it("should retrieve tokens between non-adjacent nodes with includeComments and filter", () => {
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

		it("should retrieve token between non-adjacent nodes", () => {
			assert.strictEqual(
				store.getLastTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
				).value,
				"*",
			);
		});

		it("should retrieve token between non-adjacent nodes with skip", () => {
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

		it("should return null if skipped beyond right token", () => {
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

		it("should retrieve last matched token between non-adjacent nodes with filter", () => {
			assert.strictEqual(
				store.getLastTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ filter: t => t.type !== "Identifier" },
				).value,
				"*",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes", () => {
			assert.strictEqual(
				store.getLastTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true },
				).value,
				"*",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with skip", () => {
			assert.strictEqual(
				store.getLastTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true, skip: 1 },
				).value,
				"D",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with skip and filter", () => {
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

	describe("when calling getLastToken & getTokenBefore", () => {
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

		it("should retrieve no comments before Program with whitespace and comment", () => {
			const code = " /*comment*/ bar";
			const tokenStore = createTokenStore(code);
			check(tokenStore.getCommentsBefore(AST), []);
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

		it("should retrieve no comments after Program with comment and whitespace", () => {
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