```javascript
"use strict";

const assert = require("chai").assert;
const espree = require("espree");
const TokenStore = require("../../../../../lib/languages/js/source-code/token-store");

const DEFAULT_CONFIG = {
	loc: true,
	range: true,
	tokens: true,
	comment: true,
};

const SOURCE_CODE = "/*A*/var answer/*B*/=/*C*/a/*D*/* b/*E*///F\n    call();\n/*Z*/";
const AST = espree.parse(SOURCE_CODE, DEFAULT_CONFIG);
const TOKENS = AST.tokens;
const COMMENTS = AST.comments;
const Program = AST;
const VariableDeclaration = Program.body[0];
const VariableDeclarator = VariableDeclaration.declarations[0];
const BinaryExpression = VariableDeclarator.init;
const CallExpression = Program.body[1].expression;

function check(tokens, expected) {
	assert.strictEqual(tokens.length, expected.length);
	tokens.forEach((token, i) => {
		assert.strictEqual(token.value, expected[i]);
	});
}

function createTestStore(code = SOURCE_CODE) {
	const ast = espree.parse(code, DEFAULT_CONFIG);
	return new TokenStore(ast.tokens, ast.comments);
}

function describeGetTokens() {
	describe("when calling getTokens", () => {
		const store = new TokenStore(TOKENS, COMMENTS);

		it("should retrieve all tokens for root node", () => {
			check(store.getTokens(Program), [
				"var", "answer", "=", "a", "*", "b", "call", "(", ")", ";",
			]);
		});

		it("should retrieve all tokens for binary expression", () => {
			check(store.getTokens(BinaryExpression), ["a", "*", "b"]);
		});

		it("should retrieve all tokens plus one before for binary expression", () => {
			check(store.getTokens(BinaryExpression, 1), ["=", "a", "*", "b"]);
		});

		it("should retrieve all tokens plus one after for binary expression", () => {
			check(store.getTokens(BinaryExpression, 0, 1), ["a", "*", "b", "call"]);
		});

		it("should retrieve all tokens plus two before and one after for binary expression", () => {
			check(store.getTokens(BinaryExpression, 2, 1), [
				"answer", "=", "a", "*", "b", "call",
			]);
		});

		it("should retrieve all matched tokens for root node with filter", () => {
			check(
				store.getTokens(Program, t => t.type === "Identifier"),
				["answer", "a", "b", "call"],
			);
			check(
				store.getTokens(Program, { filter: t => t.type === "Identifier" }),
				["answer", "a", "b", "call"],
			);
		});

		it("should retrieve all tokens and comments in the node for root node with includeComments option", () => {
			check(store.getTokens(Program, { includeComments: true }), [
				"A", "var", "answer", "B", "=", "C", "a", "D", "*", "b", "E", "F",
				"call", "(", ")", ";", "Z",
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
			const tokenStore = createTestStore(" /*A*/ bar /*Z*/ ");
			const ast = tokenStore.tokens[0].range ? espree.parse(" /*A*/ bar /*Z*/ ", DEFAULT_CONFIG) : AST;
			check(tokenStore.getTokens(ast), ["bar"]);
			check(tokenStore.getTokens(ast, { includeComments: true }), ["A", "bar", "Z"]);
		});
	});
}

function describeGetTokensBefore() {
	describe("when calling getTokensBefore", () => {
		const store = new TokenStore(TOKENS, COMMENTS);

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
			check(store.getTokensBefore(BinaryExpression, 9e9), ["var", "answer", "="]);
		});

		it("should retrieve more than one token before a node with count option", () => {
			check(store.getTokensBefore(BinaryExpression, { count: 2 }), ["answer", "="]);
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
				store.getTokensBefore(BinaryExpression, { includeComments: true }),
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

		const testCases = [
			{ code: " bar", desc: "whitespace" },
			{ code: "/*comment*/ bar", desc: "comment" },
			{ code: " /*comment*/ bar", desc: "whitespace and comment" },
		];

		testCases.forEach(({ code, desc }) => {
			it(`should retrieve no tokens before Program when it starts with ${desc}`, () => {
				const tokenStore = createTestStore(code);
				const ast = espree.parse(code, DEFAULT_CONFIG);
				const options = desc === "whitespace and comment" ? { count: 1, includeComments: true } : 1;
				check(tokenStore.getTokensBefore(ast, options), []);
			});
		});
	});
}

function describeGetTokenBefore() {
	describe("when calling getTokenBefore", () => {
		const store = new TokenStore(TOKENS, COMMENTS);

		it("should retrieve one token before a node", () => {
			assert.strictEqual(store.getTokenBefore(BinaryExpression).value, "=");
		});

		it("should skip a given number of tokens", () => {
			assert.strictEqual(store.getTokenBefore(BinaryExpression, 1).value, "answer");
			assert.strictEqual(store.getTokenBefore(BinaryExpression, 2).value, "var");
		});

		it("should skip a given number of tokens with skip option", () => {
			assert.strictEqual(store.getTokenBefore(BinaryExpression, { skip: 1 }).value, "answer");
			assert.strictEqual(store.getTokenBefore(BinaryExpression, { skip: 2 }).value, "var");
		});

		it("should retrieve matched token with filter option", () => {
			assert.strictEqual(
				store.getTokenBefore(BinaryExpression, t => t.value !== "=").value,
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
				store.getTokenBefore(BinaryExpression, { includeComments: true }).value,
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
			const tokenStore = createTestStore("a + b /*comment*/");
			const ast = espree.parse("a + b /*comment*/", DEFAULT_CONFIG);
			const token = tokenStore.getTokenBefore(ast.comments[0]);
			assert.strictEqual(token.value, "b");
		});

		it("should retrieve the previous comment if the first token is specified.", () => {
			const tokenStore = createTestStore("/*comment*/ a + b");
			const ast = espree.parse("/*comment*/ a + b", DEFAULT_CONFIG);
			const token = tokenStore.getTokenBefore(ast.tokens[0], { includeComments: true });
			assert.strictEqual(token.value, "comment");
		});

		it("should retrieve null if the first comment is specified.", () => {
			const tokenStore = createTestStore("/*comment*/ a + b");
			const ast = espree.parse("/*comment*/ a + b", DEFAULT_CONFIG);
			const token = tokenStore.getTokenBefore(ast.comments[0], { includeComments: true });
			assert.strictEqual(token, null);
		});

		const edgeCases = [
			{ code: " bar", desc: "whitespace" },
			{ code: "/*comment*/ bar", desc: "comment" },
			{ code: " /*comment*/ bar", desc: "whitespace and comment" },
		];

		edgeCases.forEach(({ code, desc }) => {
			it(`should retrieve null before Program when it starts with ${desc}`, () => {
				const tokenStore = createTestStore(code);
				const ast = espree.parse(code, DEFAULT_CONFIG);
				const options = desc === "whitespace and comment" ? { includeComments: true } : undefined;
				assert.strictEqual(tokenStore.getTokenBefore(ast, options), null);
			});
		});
	});
}

function describeGetTokensAfter() {
	describe("when calling getTokensAfter", () => {
		const store = new TokenStore(TOKENS, COMMENTS);

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
				"=", "a", "*", "b", "call", "(", ")", ";",
			]);
		});

		it("should retrieve more than one token after a node with count option", () => {
			check(store.getTokensAfter(VariableDeclarator.id, { count: 2 }), ["=", "a"]);
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
				store.getTokensAfter(VariableDeclarator.id, { includeComments: true }),
				["B", "=", "C", "a", "D", "*", "b", "E", "F", "call", "(", ")", ";", "Z"],
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

		const endCases = [
			{ code: "bar ", desc: "whitespace" },
			{ code: "bar /*comment*/", desc: "comment" },
			{ code: "bar /*comment*/ ", desc: "comment and whitespace" },
		];

		endCases.forEach(({ code, desc }) => {
			it(`should retrieve no tokens after Program when it ends with ${desc}`, () => {
				const tokenStore = createTestStore(code);
				const ast = espree.parse(code, DEFAULT_CONFIG);
				const options = desc === "comment and whitespace" ? { count: 1, includeComments: true } : 1;
				check(tokenStore.getTokensAfter(ast, options), []);
			});
		});
	});
}

function desc