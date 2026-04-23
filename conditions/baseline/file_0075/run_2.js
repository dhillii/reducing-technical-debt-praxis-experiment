"use strict";

const assert = require("chai").assert,
	espree = require("espree"),
	TokenStore = require("../../../../../lib/languages/js/source-code/token-store");

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

function check(tokens, expected) {
	const length = tokens.length;

	assert.strictEqual(length, expected.length);
	for (let i = 0; i < length; i++) {
		assert.strictEqual(tokens[i].value, expected[i]);
	}
}

function createTestSuite(name, tests) {
	describe(name, () => {
		tests.forEach(test => {
			it(test.description, test.fn);
		});
	});
}

const getTokensTests = [
	{
		description: "should retrieve all tokens for root node",
		fn: () => {
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
		},
	},
	{
		description: "should retrieve all tokens for binary expression",
		fn: () => {
			check(store.getTokens(BinaryExpression), ["a", "*", "b"]);
		},
	},
	{
		description: "should retrieve all tokens plus one before for binary expression",
		fn: () => {
			check(store.getTokens(BinaryExpression, 1), ["=", "a", "*", "b"]);
		},
	},
	{
		description: "should retrieve all tokens plus one after for binary expression",
		fn: () => {
			check(store.getTokens(BinaryExpression, 0, 1), [
				"a",
				"*",
				"b",
				"call",
			]);
		},
	},
	{
		description: "should retrieve all tokens plus two before and one after for binary expression",
		fn: () => {
			check(store.getTokens(BinaryExpression, 2, 1), [
				"answer",
				"=",
				"a",
				"*",
				"b",
				"call",
			]);
		},
	},
	{
		description: "should retrieve all matched tokens for root node with filter",
		fn: () => {
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
		},
	},
	{
		description: "should retrieve all tokens and comments in the node for root node with includeComments option",
		fn: () => {
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
		},
	},
	{
		description: "should retrieve matched tokens and comments in the node for root node with includeComments and filter options",
		fn: () => {
			check(
				store.getTokens(Program, {
					includeComments: true,
					filter: t => t.type.startsWith("Block"),
				}),
				["A", "B", "C", "D", "E", "Z"],
			);
		},
	},
	{
		description: "should retrieve all tokens and comments in the node for binary expression with includeComments option",
		fn: () => {
			check(
				store.getTokens(BinaryExpression, { includeComments: true }),
				["a", "D", "*", "b"],
			);
		},
	},
	{
		description: "should retrieve tokens and comments from Program with leading and trailing comments and whitespace",
		fn: () => {
			const code = " /*A*/ bar /*Z*/ ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(tokenStore.getTokens(ast), ["bar"]);
			check(tokenStore.getTokens(ast, { includeComments: true }), [
				"A",
				"bar",
				"Z",
			]);
		},
	},
];

const getTokensBeforeTests = [
	{
		description: "should retrieve zero tokens before a node",
		fn: () => {
			check(store.getTokensBefore(BinaryExpression, 0), []);
		},
	},
	{
		description: "should retrieve one token before a node",
		fn: () => {
			check(store.getTokensBefore(BinaryExpression, 1), ["="]);
		},
	},
	{
		description: "should retrieve more than one token before a node",
		fn: () => {
			check(store.getTokensBefore(BinaryExpression, 2), ["answer", "="]);
		},
	},
	{
		description: "should retrieve all tokens before a node",
		fn: () => {
			check(store.getTokensBefore(BinaryExpression, 9e9), [
				"var",
				"answer",
				"=",
			]);
		},
	},
	{
		description: "should retrieve more than one token before a node with count option",
		fn: () => {
			check(store.getTokensBefore(BinaryExpression, { count: 2 }), [
				"answer",
				"=",
			]);
		},
	},
	{
		description: "should retrieve matched tokens before a node with count and filter options",
		fn: () => {
			check(
				store.getTokensBefore(BinaryExpression, {
					count: 1,
					filter: t => t.value !== "=",
				}),
				["answer"],
			);
		},
	},
	{
		description: "should retrieve all matched tokens before a node with filter option",
		fn: () => {
			check(
				store.getTokensBefore(BinaryExpression, {
					filter: t => t.value !== "answer",
				}),
				["var", "="],
			);
		},
	},
	{
		description: "should retrieve no tokens before the root node",
		fn: () => {
			check(store.getTokensBefore(Program, { count: 1 }), []);
		},
	},
	{
		description: "should retrieve tokens and comments before a node with count and includeComments option",
		fn: () => {
			check(
				store.getTokensBefore(BinaryExpression, {
					count: 3,
					includeComments: true,
				}),
				["B", "=", "C"],
			);
		},
	},
	{
		description: "should retrieve all tokens and comments before a node with includeComments option only",
		fn: () => {
			check(
				store.getTokensBefore(BinaryExpression, {
					includeComments: true,
				}),
				["A", "var", "answer", "B", "=", "C"],
			);
		},
	},
	{
		description: "should retrieve all tokens and comments before a node with includeComments and filter options",
		fn: () => {
			check(
				store.getTokensBefore(BinaryExpression, {
					includeComments: true,
					filter: t => t.type.startsWith("Block"),
				}),
				["A", "B", "C"],
			);
		},
	},
	{
		description: "should retrieve no tokens before Program when it starts with whitespace",
		fn: () => {
			const code = " bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(tokenStore.getTokensBefore(ast, 1), []);
		},
	},
	{
		description: "should retrieve no tokens before Program when it starts with a comment",
		fn: () => {
			const code = "/*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(tokenStore.getTokensBefore(ast, 1), []);
		},
	},
	{
		description: "should retrieve no tokens before Program when it starts with whitespace and a comment",
		fn: () => {
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
		},
	},
];

const getTokenBeforeTests = [
	{
		description: "should retrieve one token before a node",
		fn: () => {
			assert.strictEqual(
				store.getTokenBefore(BinaryExpression).value,
				"=",
			);
		},
	},
	{
		description: "should skip a given number of tokens",
		fn: () => {
			assert.strictEqual(
				store.getTokenBefore(BinaryExpression, 1).value,
				"answer",
			);
			assert.strictEqual(
				store.getTokenBefore(BinaryExpression, 2).value,
				"var",
			);
		},
	},
	{
		description: "should skip a given number of tokens with skip option",
		fn: () => {
			assert.strictEqual(
				store.getTokenBefore(BinaryExpression, { skip: 1 }).value,
				"answer",
			);
			assert.strictEqual(
				store.getTokenBefore(BinaryExpression, { skip: 2 }).value,
				"var",
			);
		},
	},
	{
		description: "should retrieve matched token with filter option",
		fn: () => {
			assert.strictEqual(
				store.getTokenBefore(BinaryExpression, t => t.value !== "=")
					.value,
				"answer",
			);
		},
	},
	{
		description: "should retrieve matched token with skip and filter options",
		fn: () => {
			assert.strictEqual(
				store.getTokenBefore(BinaryExpression, {
					skip: 1,
					filter: t => t.value !== "=",
				}).value,
				"var",
			);
		},
	},
	{
		description: "should retrieve one token or comment before a node with includeComments option",
		fn: () => {
			assert.strictEqual(
				store.getTokenBefore(BinaryExpression, {
					includeComments: true,
				}).value,
				"C",
			);
		},
	},
	{
		description: "should retrieve one token or comment before a node with includeComments and skip options",
		fn: () => {
			assert.strictEqual(
				store.getTokenBefore(BinaryExpression, {
					includeComments: true,
					skip: 1,
				}).value,
				"=",
			);
		},
	},
	{
		description: "should retrieve one token or comment before a node with includeComments and skip and filter options",
		fn: () => {
			assert.strictEqual(
				store.getTokenBefore(BinaryExpression, {
					includeComments: true,
					skip: 1,
					filter: t => t.type.startsWith("Block"),
				}).value,
				"B",
			);
		},
	},
	{
		description: "should retrieve the previous node if the comment at the end of source code is specified.",
		fn: () => {
			const code = "a + b /*comment*/";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = tokenStore.getTokenBefore(ast.comments[0]);

			assert.strictEqual(token.value, "b");
		},
	},
	{
		description: "should retrieve the previous comment if the first token is specified.",
		fn: () => {
			const code = "/*comment*/ a + b";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = tokenStore.getTokenBefore(ast.tokens[0], {
				includeComments: true,
			});

			assert.strictEqual(token.value, "comment");
		},
	},
	{
		description: "should retrieve null if the first comment is specified.",
		fn: () => {
			const code = "/*comment*/ a + b";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = tokenStore.getTokenBefore(ast.comments[0], {
				includeComments: true,
			});

			assert.strictEqual(token, null);
		},
	},
	{
		description: "should retrieve null before Program when it starts with whitespace",
		fn: () => {
			const code = " bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(tokenStore.getTokenBefore(ast), null);
		},
	},
	{
		description: "should retrieve null before Program when it starts with a comment",
		fn: () => {
			const code = "/*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(tokenStore.getTokenBefore(ast), null);
		},
	},
	{
		description: "should retrieve null before Program when it starts with whitespace and a comment",
		fn: () => {
			const code = " /*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(
				tokenStore.getTokenBefore(ast, { includeComments: true }),
				null,
			);
		},
	},
];

const getTokensAfterTests = [
	{
		description: "should retrieve zero tokens after a node",
		fn: () => {
			check(store.getTokensAfter(VariableDeclarator.id, 0), []);
		},
	},
	{
		description: "should retrieve one token after a node",
		fn: () => {
			check(store.getTokensAfter(VariableDeclarator.id, 1), ["="]);
		},
	},
	{
		description: "should retrieve more than one token after a node",
		fn: () => {
			check(store.getTokensAfter(VariableDeclarator.id, 2), ["=", "a"]);
		},
	},
	{
		description: "should retrieve all tokens after a node",
		fn: () => {
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
		},
	},
	{
		description: "should retrieve more than one token after a node with count option",
		fn: () => {
			check(store.getTokensAfter(VariableDeclarator.id, { count: 2 }), [
				"=",
				"a",
			]);
		},
	},
	{
		description: "should retrieve all matched tokens after a node with filter option",
		fn: () => {
			check(
				store.getTokensAfter(VariableDeclarator.id, {
					filter: t => t.type === "Identifier",
				}),
				["a", "b", "call"],
			);
		},
	},
	{
		description: "should retrieve matched tokens after a node with count and filter options",
		fn: () => {
			check(
				store.getTokensAfter(VariableDeclarator.id, {
					count: 2,
					filter: t => t.type === "Identifier",
				}),
				["a", "b"],
			);
		},
	},
	{
		description: "should retrieve all tokens and comments after a node with includeComments option",
		fn: () => {
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
		},
	},
	{
		description: "should retrieve several tokens and comments after a node with includeComments and count options",
		fn: () => {
			check(
				store.getTokensAfter(VariableDeclarator.id, {
					includeComments: true,
					count: 3,
				}),
				["B", "=", "C"],
			);
		},
	},
	{
		description: "should retrieve matched tokens and comments after a node with includeComments and count and filter options",
		fn: () => {
			check(
				store.getTokensAfter(VariableDeclarator.id, {
					includeComments: true,
					count: 3,
					filter: t => t.type.startsWith("Block"),
				}),
				["B", "C", "D"],
			);
		},
	},
	{
		description: "should retrieve no tokens after Program when it ends with whitespace",
		fn: () => {
			const code = "bar ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(tokenStore.getTokensAfter(ast, 1), []);
		},
	},
	{
		description: "should retrieve no tokens after Program when it ends with a comment",
		fn: () => {
			const code = "bar /*comment*/";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(tokenStore.getTokensAfter(ast, 1), []);
		},
	},
	{
		description: "should retrieve no tokens after Program when it ends with a comment and whitespace",
		fn: () => {
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
		},
	},
];

const getTokenAfterTests = [
	{
		description: "should retrieve one token after a node",
		fn: () => {
			assert.strictEqual(
				store.getTokenAfter(VariableDeclarator.id).value,
				"=",
			);
		},
	},
	{
		description: "should skip a given number of tokens",
		fn: () => {
			assert.strictEqual(
				store.getTokenAfter(VariableDeclarator.id, 1).value,
				"a",
			);
			assert.strictEqual(
				store.getTokenAfter(VariableDeclarator.id, 2).value,
				"*",
			);
		},
	},
	{
		description: "should skip a given number of tokens with skip option",
		fn: () => {
			assert.strictEqual(
				store.getTokenAfter(VariableDeclarator.id, { skip: 1 }).value,
				"a",
			);
			assert.strictEqual(
				store.getTokenAfter(VariableDeclarator.id, { skip: 2 }).value,
				"*",
			);
		},
	},
	{
		description: "should retrieve matched token with filter option",
		fn: () => {
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
		},
	},
	{
		description: "should retrieve matched token with filter and skip options",
		fn: () => {
			assert.strictEqual(
				store.getTokenAfter(VariableDeclarator.id, {
					skip: 1,
					filter: t => t.type === "Identifier",
				}).value,
				"b",
			);
		},
	},
	{
		description: "should retrieve one token or comment after a node with includeComments option",
		fn: () => {
			assert.strictEqual(
				store.getTokenAfter(VariableDeclarator.id, {
					includeComments: true,
				}).value,
				"B",
			);
		},
	},
	{
		description: "should retrieve one token or comment after a node with includeComments and skip options",
		fn: () => {
			assert.strictEqual(
				store.getTokenAfter(VariableDeclarator.id, {
					includeComments: true,
					skip: 2,
				}).value,
				"C",
			);
		},
	},
	{
		description: "should retrieve one token or comment after a node with includeComments and skip and filter options",
		fn: () => {
			assert.strictEqual(
				store.getTokenAfter(VariableDeclarator.id, {
					includeComments: true,
					skip: 2,
					filter: t => t.type.startsWith("Block"),
				}).value,
				"D",
			);
		},
	},
	{
		description: "should retrieve the next node if the comment at the first of source code is specified.",
		fn: () => {
			const code = "/*comment*/ a + b";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = tokenStore.getTokenAfter(ast.comments[0]);

			assert.strictEqual(token.value, "a");
		},
	},
	{
		description: "should retrieve the next comment if the last token is specified.",
		fn: () => {
			const code = "a + b /*comment*/";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = tokenStore.getTokenAfter(ast.tokens[2], {
				includeComments: true,
			});

			assert.strictEqual(token.value, "comment");
		},
	},
	{
		description: "should retrieve null if the last comment is specified.",
		fn: () => {
			const code = "a + b /*comment*/";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = tokenStore.getTokenAfter(ast.comments[0], {
				includeComments: true,
			});

			assert.strictEqual(token, null);
		},
	},
	{
		description: "should retrieve null after Program when it ends with whitespace",
		fn: () => {
			const code = "bar ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(tokenStore.getTokenAfter(ast), null);
		},
	},
	{
		description: "should retrieve null after Program when it ends with a comment",
		fn: () => {
			const code = "bar /*comment*/";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(tokenStore.getTokenAfter(ast), null);
		},
	},
	{
		description: "should retrieve null after Program when it ends with a comment and whitespace",
		fn: () => {
			const code = "bar /*comment*/ ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(
				tokenStore.getTokenAfter(ast, { includeComments: true }),
				null,
			);
		},
	},
];

const getFirstTokensTests = [
	{
		description: "should retrieve zero tokens from a node's token stream",
		fn: () => {
			check(store.getFirstTokens(BinaryExpression, 0), []);
		},
	},
	{
		description: "should retrieve one token from a node's token stream",
		fn: () => {
			check(store.getFirstTokens(BinaryExpression, 1), ["a"]);
		},
	},
	{
		description: "should retrieve more than one token from a node's token stream",
		fn: () => {
			check(store.getFirstTokens(BinaryExpression, 2), ["a", "*"]);
		},
	},
	{
		description: "should retrieve all tokens from a node's token stream",
		fn: () => {
			check(store.getFirstTokens(BinaryExpression, 9e9), ["a", "*", "b"]);
		},
	},
	{
		description: "should retrieve more than one token from a node's token stream with count option",
		fn: () => {
			check(store.getFirstTokens(BinaryExpression, { count: 2 }), [
				"a",
				"*",
			]);
		},
	},
	{
		description: "should retrieve matched tokens from a node's token stream with filter option",
		fn: () => {
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
		},
	},
	{
		description: "should retrieve matched tokens from a node's token stream with filter and count options",
		fn: () => {
			check(
				store.getFirstTokens(BinaryExpression, {
					count: 1,
					filter: t => t.type === "Identifier",
				}),
				["a"],
			);
		},
	},
	{
		description: "should retrieve all tokens and comments from a node's token stream with includeComments option",
		fn: () => {
			check(
				store.getFirstTokens(BinaryExpression, {
					includeComments: true,
				}),
				["a", "D", "*", "b"],
			);
		},
	},
	{
		description: "should retrieve several tokens and comments from a node's token stream with includeComments and count options",
		fn: () => {
			check(
				store.getFirstTokens(BinaryExpression, {
					includeComments: true,
					count: 3,
				}),
				["a", "D", "*"],
			);
		},
	},
	{
		description: "should retrieve several tokens and comments from a node's token stream with includeComments and count and filter options",
		fn: () => {
			check(
				store.getFirstTokens(BinaryExpression, {
					includeComments: true,
					count: 3,
					filter: t => t.value !== "a",
				}),
				["D", "*", "b"],
			);
		},
	},
	{
		description: "should retrieve the first token from Program when it starts with whitespace",
		fn: () => {
			const code = " bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(tokenStore.getFirstTokens(ast, 1), ["bar"]);
		},
	},
	{
		description: "should retrieve the first token from Program when it starts with a comment",
		fn: () => {
			const code = "/*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(tokenStore.getFirstTokens(ast, 1), ["bar"]);
		},
	},
	{
		description: "should retrieve the first token/comment from Program when it starts with whitespace and a comment",
		fn: () => {
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
		},
	},
];

const getFirstTokenTests = [
	{
		description: "should retrieve the first token of a node's token stream",
		fn: () => {
			assert.strictEqual(
				store.getFirstToken(BinaryExpression).value,
				"a",
			);
		},
	},
	{
		description: "should skip a given number of tokens",
		fn: () => {
			assert.strictEqual(
				store.getFirstToken(BinaryExpression, 1).value,
				"*",
			);
			assert.strictEqual(
				store.getFirstToken(BinaryExpression, 2).value,
				"b",
			);
		},
	},
	{
		description: "should skip a given number of tokens with skip option",
		fn: () => {
			assert.strictEqual(
				store.getFirstToken(BinaryExpression, { skip: 1 }).value,
				"*",
			);
			assert.strictEqual(
				store.getFirstToken(BinaryExpression, { skip: 2 }).value,
				"b",
			);
		},
	},
	{
		description: "should retrieve matched token with filter option",
		fn: () => {
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
		},
	},
	{
		description: "should retrieve matched token with filter and skip options",
		fn: () => {
			assert.strictEqual(
				store.getFirstToken(BinaryExpression, {
					skip: 1,
					filter: t => t.type === "Identifier",
				}).value,
				"b",
			);
		},
	},
	{
		description: "should retrieve the first token or comment of a node's token stream with includeComments option",
		fn: () => {
			assert.strictEqual(
				store.getFirstToken(BinaryExpression, { includeComments: true })
					.value,
				"a",
			);
		},
	},
	{
		description: "should retrieve the first matched token or comment of a node's token stream with includeComments and skip options",
		fn: () => {
			assert.strictEqual(
				store.getFirstToken(BinaryExpression, {
					includeComments: true,
					skip: 1,
				}).value,
				"D",
			);
		},
	},
	{
		description: "should retrieve the first matched token or comment of a node's token stream with includeComments and skip and filter options",
		fn: () => {
			assert.strictEqual(
				store.getFirstToken(BinaryExpression, {
					includeComments: true,
					skip: 1,
					filter: t => t.value !== "a",
				}).value,
				"*",
			);
		},
	},
	{
		description: "should retrieve the first comment if the comment is at the last of nodes",
		fn: () => {
			const code = "a + b\n/*comment*/ c + d";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);

			const token = tokenStore.getFirstToken(
				{ range: [ast.comments[0].range[0], ast.tokens[5].range[1]] },
				{ includeComments: true },
			);

			assert.strictEqual(token.value, "comment");
		},
	},
	{
		description: "should retrieve the first token (without includeComments option) if the comment is at the last of nodes",
		fn: () => {
			const code = "a + b\n/*comment*/ c + d";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);

			const token = tokenStore.getFirstToken({
				range: [ast.comments[0].range[0], ast.tokens[5].range[1]],
			});

			assert.strictEqual(token.value, "c");
		},
	},
	{
		description: "should retrieve the first token if the root node contains a trailing comment",
		fn: () => {
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
		},
	},
	{
		description: "should return null if the source contains only comments",
		fn: () => {
			const code = "// comment";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = tokenStore.getFirstToken(ast, {
				filter() {
					assert.fail("Unexpected call to filter callback");
				},
			});

			assert.strictEqual(token, null);
		},
	},
	{
		description: "should return null if the source is empty",
		fn: () => {
			const code = "";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = tokenStore.getFirstToken(ast);

			assert.strictEqual(token, null);
		},
	},
	{
		description: "should retrieve the first token from Program when it starts with whitespace",
		fn: () => {
			const code = " bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(tokenStore.getFirstToken(ast).value, "bar");
		},
	},
	{
		description: "should retrieve the first token from Program when it starts with a comment",
		fn: () => {
			const code = "/*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(tokenStore.getFirstToken(ast).value, "bar");
		},
	},
	{
		description: "should retrieve the first token from Program when it starts with whitespace and a comment",
		fn: () => {
			const code = " /*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(
				tokenStore.getFirstToken(ast, { includeComments: true }).value,
				"comment",
			);
		},
	},
];

const getLastTokensTests = [
	{
		description: "should retrieve zero tokens from the end of a node's token stream",
		fn: () => {
			check(store.getLastTokens(BinaryExpression, 0), []);
		},
	},
	{
		description: "should retrieve one token from the end of a node's token stream",
		fn: () => {
			check(store.getLastTokens(BinaryExpression, 1), ["b"]);
		},
	},
	{
		description: "should retrieve more than one token from the end of a node's token stream",
		fn: () => {
			check(store.getLastTokens(BinaryExpression, 2), ["*", "b"]);
		},
	},
	{
		description: "should retrieve all tokens from the end of a node's token stream",
		fn: () => {
			check(store.getLastTokens(BinaryExpression, 9e9), ["a", "*", "b"]);
		},
	},
	{
		description: "should retrieve more than one token from the end of a node's token stream with count option",
		fn: () => {
			check(store.getLastTokens(BinaryExpression, { count: 2 }), [
				"*",
				"b",
			]);
		},
	},
	{
		description: "should retrieve matched tokens from the end of a node's token stream with filter option",
		fn: () => {
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
		},
	},
	{
		description: "should retrieve matched tokens from the end of a node's token stream with filter and count options",
		fn: () => {
			check(
				store.getLastTokens(BinaryExpression, {
					count: 1,
					filter: t => t.type === "Identifier",
				}),
				["b"],
			);
		},
	},
	{
		description: "should retrieve all tokens from the end of a node's token stream with includeComments option",
		fn: () => {
			check(
				store.getLastTokens(BinaryExpression, {
					includeComments: true,
				}),
				["a", "D", "*", "b"],
			);
		},
	},
	{
		description: "should retrieve matched tokens from the end of a node's token stream with includeComments and count options",
		fn: () => {
			check(
				store.getLastTokens(BinaryExpression, {
					includeComments: true,
					count: 3,
				}),
				["D", "*", "b"],
			);
		},
	},
	{
		description: "should retrieve matched tokens from the end of a node's token stream with includeComments and count and filter options",
		fn: () => {
			check(
				store.getLastTokens(BinaryExpression, {
					includeComments: true,
					count: 3,
					filter: t => t.type !== "Punctuator",
				}),
				["a", "D", "b"],
			);
		},
	},
	{
		description: "should retrieve the last token from Program when it ends with whitespace",
		fn: () => {
			const code = "bar ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(tokenStore.getLastTokens(ast, 1), ["bar"]);
		},
	},
	{
		description: "should retrieve the last token from Program when it ends with a comment",
		fn: () => {
			const code = "bar /*comment*/";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(tokenStore.getLastTokens(ast, 1), ["bar"]);
		},
	},
	{
		description: "should retrieve the last token/comment from Program when it ends with a comment and whitespace",
		fn: () => {
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
		},
	},
];

const getLastTokenTests = [
	{
		description: "should retrieve the last token of a node's token stream",
		fn: () => {
			assert.strictEqual(store.getLastToken(BinaryExpression).value, "b");
			assert.strictEqual(
				store.getLastToken(VariableDeclaration).value,
				"b",
			);
		},
	},
	{
		description: "should skip a given number of tokens",
		fn: () => {
			assert.strictEqual(
				store.getLastToken(BinaryExpression, 1).value,
				"*",
			);
			assert.strictEqual(
				store.getLastToken(BinaryExpression, 2).value,
				"a",
			);
		},
	},
	{
		description: "should skip a given number of tokens with skip option",
		fn: () => {
			assert.strictEqual(
				store.getLastToken(BinaryExpression, { skip: 1 }).value,
				"*",
			);
			assert.strictEqual(
				store.getLastToken(BinaryExpression, { skip: 2 }).value,
				"a",
			);
		},
	},
	{
		description: "should retrieve the last matched token of a node's token stream with filter option",
		fn: () => {
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
		},
	},
	{
		description: "should retrieve the last matched token of a node's token stream with filter and skip options",
		fn: () => {
			assert.strictEqual(
				store.getLastToken(BinaryExpression, {
					skip: 1,
					filter: t => t.type === "Identifier",
				}).value,
				"a",
			);
		},
	},
	{
		description: "should retrieve the last token of a node's token stream with includeComments option",
		fn: () => {
			assert.strictEqual(
				store.getLastToken(BinaryExpression, { includeComments: true })
					.value,
				"b",
			);
		},
	},
	{
		description: "should retrieve the last token of a node's token stream with includeComments and skip options",
		fn: () => {
			assert.strictEqual(
				store.getLastToken(BinaryExpression, {
					includeComments: true,
					skip: 2,
				}).value,
				"D",
			);
		},
	},
	{
		description: "should retrieve the last token of a node's token stream with includeComments and skip and filter options",
		fn: () => {
			assert.strictEqual(
				store.getLastToken(BinaryExpression, {
					includeComments: true,
					skip: 1,
					filter: t => t.type !== "Identifier",
				}).value,
				"D",
			);
		},
	},
	{
		description: "should retrieve the last comment if the comment is at the last of nodes",
		fn: () => {
			const code = "a + b /*comment*/\nc + d";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);

			const token = tokenStore.getLastToken(
				{ range: [ast.tokens[0].range[0], ast.comments[0].range[1]] },
				{ includeComments: true },
			);

			assert.strictEqual(token.value, "comment");
		},
	},
	{
		description: "should retrieve the last token (without includeComments option) if the comment is at the last of nodes",
		fn: () => {
			const code = "a + b /*comment*/\nc + d";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);

			const token = tokenStore.getLastToken({
				range: [ast.tokens[0].range[0], ast.comments[0].range[1]],
			});

			assert.strictEqual(token.value, "b");
		},
	},
	{
		description: "should retrieve the last token if the root node contains a trailing comment",
		fn: () => {
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
		},
	},
	{
		description: "should retrieve the last token from Program when it ends with whitespace",
		fn: () => {
			const code = "bar ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(tokenStore.getLastToken(ast).value, "bar");
		},
	},
	{
		description: "should retrieve the last token from Program when it ends with a comment",
		fn: () => {
			const code = "bar /*comment*/";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(tokenStore.getLastToken(ast).value, "bar");
		},
	},
	{
		description: "should retrieve the last token from Program when it ends with a comment and whitespace",
		fn: () => {
			const code = "bar /*comment*/ ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(
				tokenStore.getLastToken(ast, { includeComments: true }).value,
				"comment",
			);
		},
	},
	{
		description: "should return null if the source contains only comments",
		fn: () => {
			const code = "// comment";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = tokenStore.getLastToken(ast, {
				filter() {
					assert.fail("Unexpected call to filter callback");
				},
			});

			assert.strictEqual(token, null);
		},
	},
	{
		description: "should return null if the source is empty",
		fn: () => {
			const code = "";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = tokenStore.getLastToken(ast);

			assert.strictEqual(token, null);
		},
	},
];

const getFirstTokensBetweenTests = [
	{
		description: "should retrieve zero tokens between adjacent nodes",
		fn: () => {
			check(
				store.getFirstTokensBetween(BinaryExpression, CallExpression),
				[],
			);
		},
	},
	{
		description: "should retrieve multiple tokens between non-adjacent nodes with count option",
		fn: () => {
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
		},
	},
	{
		description: "should retrieve matched tokens between non-adjacent nodes with filter option",
		fn: () => {
			check(
				store.getFirstTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ filter: t => t.type !== "Punctuator" },
				),
				["a"],
			);
		},
	},
	{
		description: "should retrieve all tokens between non-adjacent nodes with empty object option",
		fn: () => {
			check(
				store.getFirstTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{},
				),
				["=", "a", "*"],
			);
		},
	},
	{
		description: "should retrieve multiple tokens between non-adjacent nodes with includeComments option",
		fn: () => {
			check(
				store.getFirstTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true },
				),
				["B", "=", "C", "a", "D", "*"],
			);
		},
	},
	{
		description: "should retrieve multiple tokens between non-adjacent nodes with includeComments and count options",
		fn: () => {
			check(
				store.getFirstTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true, count: 3 },
				),
				["B", "=", "C"],
			);
		},
	},
	{
		description: "should retrieve multiple tokens and comments between non-adjacent nodes with includeComments and filter options",
		fn: () => {
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
		},
	},
];

const getFirstTokenBetweenTests = [
	{
		description: "should return null between adjacent nodes",
		fn: () => {
			assert.strictEqual(
				store.getFirstTokenBetween(BinaryExpression, CallExpression),
				null,
			);
		},
	},
	{
		description: "should retrieve one token between non-adjacent nodes with count option",
		fn: () => {
			assert.strictEqual(
				store.getFirstTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
				).value,
				"=",
			);
		},
	},
	{
		description: "should retrieve one token between non-adjacent nodes with skip option",
		fn: () => {
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
		},
	},
	{
		description: "should return null if it's skipped beyond the right token",
		fn: () => {
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
		},
	},
	{
		description: "should retrieve the first matched token between non-adjacent nodes with filter option",
		fn: () => {
			assert.strictEqual(
				store.getFirstTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ filter: t => t.type !== "Identifier" },
				).value,
				"=",
			);
		},
	},
	{
		description: "should retrieve first token or comment between non-adjacent nodes with includeComments option",
		fn: () => {
			assert.strictEqual(
				store.getFirstTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true },
				).value,
				"B",
			);
		},
	},
	{
		description: "should retrieve first token or comment between non-adjacent nodes with includeComments and skip options",
		fn: () => {
			assert.strictEqual(
				store.getFirstTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true, skip: 1 },
				).value,
				"=",
			);
		},
	},
	{
		description: "should retrieve first token or comment between non-adjacent nodes with includeComments and skip and filter options",
		fn: () => {
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
		},
	},
];

const getLastTokensBetweenTests = [
	{
		description: "should retrieve zero tokens between adjacent nodes",
		fn: () => {
			check(
				store.getLastTokensBetween(BinaryExpression, CallExpression),
				[],
			);
		},
	},
	{
		description: "should retrieve multiple tokens between non-adjacent nodes with count option",
		fn: () => {
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
		},
	},
	{
		description: "should retrieve matched tokens between non-adjacent nodes with filter option",
		fn: () => {
			check(
				store.getLastTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ filter: t => t.type !== "Punctuator" },
				),
				["a"],
			);
		},
	},
	{
		description: "should retrieve all tokens between non-adjacent nodes with empty object option",
		fn: () => {
			check(
				store.getLastTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{},
				),
				["=", "a", "*"],
			);
		},
	},
	{
		description: "should retrieve all tokens and comments between non-adjacent nodes with includeComments option",
		fn: () => {
			check(
				store.getLastTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true },
				),
				["B", "=", "C", "a", "D", "*"],
			);
		},
	},
	{
		description: "should retrieve multiple tokens between non-adjacent nodes with includeComments and count options",
		fn: () => {
			check(
				store.getLastTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true, count: 3 },
				),
				["a", "D", "*"],
			);
		},
	},
	{
		description: "should retrieve multiple tokens and comments between non-adjacent nodes with includeComments and filter options",
		fn: () => {
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
		},
	},
];

const getLastTokenBetweenTests = [
	{
		description: "should return null between adjacent nodes",
		fn: () => {
			assert.strictEqual(
				store.getLastTokenBetween(BinaryExpression, CallExpression),
				null,
			);
		},
	},
	{
		description: "should retrieve one token between non-adjacent nodes with count option",
		fn: () => {
			assert.strictEqual(
				store.getLastTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
				).value,
				"*",
			);
		},
	},
	{
		description: "should retrieve one token between non-adjacent nodes with skip option",
		fn: () => {
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
		},
	},
	{
		description: "should return null if it's skipped beyond the right token",
		fn: () => {
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
		},
	},
	{
		description: "should retrieve the first matched token between non-adjacent nodes with filter option",
		fn: () => {
			assert.strictEqual(
				store.getLastTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ filter: t => t.type !== "Identifier" },
				).value,
				"*",
			);
		},
	},
	{
		description: "should retrieve first token or comment between non-adjacent nodes with includeComments option",
		fn: () => {
			assert.strictEqual(
				store.getLastTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true },
				).value,
				"*",
			);
		},
	},
	{
		description: "should retrieve first token or comment between non-adjacent nodes with includeComments and skip options",
		fn: () => {
			assert.strictEqual(
				store.getLastTokenBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true, skip: 1 },
				).value,
				"D",
			);
		},
	},
	{
		description: "should retrieve first token or comment between non-adjacent nodes with includeComments and skip and filter options",
		fn: () => {
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
		},
	},
];

const getTokensBetweenTests = [
	{
		description: "should retrieve zero tokens between adjacent nodes",
		fn: () => {
			check(store.getTokensBetween(BinaryExpression, CallExpression), []);
		},
	},
	{
		description: "should retrieve one token between nodes",
		fn: () => {
			check(
				store.getTokensBetween(
					BinaryExpression.left,
					BinaryExpression.right,
				),
				["*"],
			);
		},
	},
	{
		description: "should retrieve multiple tokens between non-adjacent nodes",
		fn: () => {
			check(
				store.getTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.right,
				),
				["=", "a", "*"],
			);
		},
	},
	{
		description: "should retrieve surrounding tokens when asked for padding",
		fn: () => {
			check(
				store.getTokensBetween(
					VariableDeclarator.id,
					BinaryExpression.left,
					2,
				),
				["var", "answer", "=", "a", "*"],
			);
		},
	},
];

const getTokenByRangeStartTests = [
	{
		description: "should return identifier token",
		fn: () => {
			const result = store.getTokenByRangeStart(9);

			assert.strictEqual(result.type, "Identifier");
			assert.strictEqual(result.value, "answer");
		},
	},
	{
		description: "should return null when token doesn't exist",
		fn: () => {
			const result = store.getTokenByRangeStart(10);

			assert.isNull(result);
		},
	},
	{
		description: "should return a comment token when includeComments is true",
		fn: () => {
			const result = store.getTokenByRangeStart(15, {
				includeComments: true,
			});

			assert.strictEqual(result.type, "Block");
			assert.strictEqual(result.value, "B");
		},
	},
	{
		description: "should not return a comment token at the supplied index when includeComments is false",
		fn: () => {
			const result = store.getTokenByRangeStart(15, {
				includeComments: false,
			});

			assert.isNull(result);
		},
	},
	{
		description: "should not return comment tokens by default",
		fn: () => {
			const result = store.getTokenByRangeStart(15);

			assert.isNull(result);
		},
	},
];

const getFirstTokenAndGetTokenAfterTests = [
	{
		description: "should retrieve all tokens and comments in the node",
		fn: () => {
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
		},
	},
	{
		description: "should retrieve all tokens and comments in the node (no spaces)",
		fn: () => {
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
		},
	},
];

const getLastTokenAndGetTokenBeforeTests = [
	{
		description: "should retrieve all tokens and comments in the node",
		fn: () => {
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
				")",
				"{",
				"}",
				")",
			]);
		},
	},
	{
		description: "should retrieve all tokens and comments in the node (no spaces)",
		fn: () => {
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
		},
	},
];

const commentsExistBetweenTests = [
	{
		description: "should retrieve false if comments don't exist",
		fn: () => {
			assert.isFalse(
				store.commentsExistBetween(AST.tokens[0], AST.tokens[1]),
			);
		},
	},
	{
		description: "should retrieve true if comments exist",
		fn: () => {
			assert.isTrue(
				store.commentsExistBetween(AST.tokens[1], AST.tokens[2]),
			);
		},
	},
];

const getCommentsBeforeTests = [
	{
		description: "should retrieve comments before a node",
		fn: () => {
			assert.strictEqual(
				store.getCommentsBefore(VariableDeclaration)[0].value,
				"A",
			);
		},
	},
	{
		description: "should retrieve comments before a token",
		fn: () => {
			assert.strictEqual(
				store.getCommentsBefore(TOKENS[2] /* "=" token */)[0].value,
				"B",
			);
		},
	},
	{
		description: "should retrieve multiple comments before a node",
		fn: () => {
			const comments = store.getCommentsBefore(CallExpression);

			assert.strictEqual(comments.length, 2);
			assert.strictEqual(comments[0].value, "E");
			assert.strictEqual(comments[1].value, "F");
		},
	},
	{
		description: "should return an empty array for a Program node",
		fn: () => {
			check(store.getCommentsBefore(Program), []);
		},
	},
	{
		description: "should return an empty array if there are no comments before a node or token",
		fn: () => {
			check(store.getCommentsBefore(BinaryExpression.right), []);
			check(store.getCommentsBefore(TOKENS[1]), []);
		},
	},
	{
		description: "should retrieve no comments before Program when it starts with whitespace and a comment",
		fn: () => {
			const code = " /*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(tokenStore.getCommentsBefore(ast), []);
		},
	},
];

const getCommentsAfterTests = [
	{
		description: "should retrieve comments after a node",
		fn: () => {
			assert.strictEqual(
				store.getCommentsAfter(VariableDeclarator.id)[0].value,
				"B",
			);
		},
	},
	{
		description: "should retrieve comments after a token",
		fn: () => {
			assert.strictEqual(
				store.getCommentsAfter(TOKENS[2] /* "=" token */)[0].value,
				"C",
			);
		},
	},
	{
		description: "should retrieve multiple comments after a node",
		fn: () => {
			const comments = store.getCommentsAfter(VariableDeclaration);

			assert.strictEqual(comments.length, 2);
			assert.strictEqual(comments[0].value, "E");
			assert.strictEqual(comments[1].value, "F");
		},
	},
	{
		description: "should return an empty array for a Program node",
		fn: () => {
			check(store.getCommentsAfter(Program), []);
		},
	},
	{
		description: "should return an empty array if there are no comments after a node or token",
		fn: () => {
			check(store.getCommentsAfter(CallExpression.callee), []);
			check(store.getCommentsAfter(TOKENS[0]), []);
		},
	},
	{
		description: "should retrieve no comments after Program when it ends with a comment and whitespace",
		fn: () => {
			const code = "bar /*comment*/ ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(tokenStore.getCommentsAfter(ast), []);
		},
	},
];

const getCommentsInsideTests = [
	{
		description: "should retrieve comments inside a node",
		fn: () => {
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
		},
	},
	{
		description: "should return an empty array if a node does not contain any comments",
		fn: () => {
			check(store.getCommentsInside(TOKENS[2]), []);
		},
	},
];

describe("TokenStore", () => {
	const store = new TokenStore(TOKENS, COMMENTS);

	createTestSuite("when calling getTokens", getTokensTests);
	createTestSuite("when calling getTokensBefore", getTokensBeforeTests);
	createTestSuite("when calling getTokenBefore", getTokenBeforeTests);
	createTestSuite("when calling getTokensAfter", getTokensAfterTests);
	createTestSuite("when calling getTokenAfter", getTokenAfterTests);
	createTestSuite("when calling getFirstTokens", getFirstTokensTests);
	createTestSuite("when calling getFirstToken", getFirstTokenTests);
	createTestSuite("when calling getLastTokens", getLastTokensTests);
	createTestSuite("when calling getLastToken", getLastTokenTests);
	createTestSuite("when calling getFirstTokensBetween", getFirstTokensBetweenTests);
	createTestSuite("when calling getFirstTokenBetween", getFirstTokenBetweenTests);
	createTestSuite("when calling getLastTokensBetween", getLastTokensBetweenTests);
	createTestSuite("when calling getLastTokenBetween", getLastTokenBetweenTests);
	createTestSuite("when calling getTokensBetween", getTokensBetweenTests);
	createTestSuite("when calling getTokenByRangeStart", getTokenByRangeStartTests);
	createTestSuite("when calling getFirstToken & getTokenAfter", getFirstTokenAndGetTokenAfterTests);
	createTestSuite("when calling getLastToken & getTokenBefore", getLastTokenAndGetTokenBeforeTests);
	createTestSuite("when calling commentsExistBetween", commentsExistBetweenTests);
	createTestSuite("getCommentsBefore", getCommentsBeforeTests);
	createTestSuite("getCommentsAfter", getCommentsAfterTests);
	createTestSuite("getCommentsInside", getCommentsInsideTests);
});