```javascript
"use strict";

const assert = require("chai").assert;
const espree = require("espree");
const TokenStore = require("../../../../../lib/languages/js/source-code/token-store");

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
	"/*A*/var answer/*B*/=/*C*/a/*D*/* b/*E*///F\n    call();\n/*Z*/";

//------------------------------------------------------------------------------
// Test Fixtures
//------------------------------------------------------------------------------

class TestFixture {
	constructor() {
		const ast = espree.parse(SOURCE_CODE, DEFAULT_CONFIG);
		this.ast = ast;
		this.tokens = ast.tokens;
		this.comments = ast.comments;
		this.program = ast;
		this.variableDeclaration = ast.body[0];
		this.variableDeclarator = this.variableDeclaration.declarations[0];
		this.binaryExpression = this.variableDeclarator.init;
		this.callExpression = ast.body[1].expression;
		this.store = new TokenStore(this.tokens, this.comments);
	}
}

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

function checkTokenValues(tokens, expected) {
	assert.strictEqual(tokens.length, expected.length);
	tokens.forEach((token, i) => {
		assert.strictEqual(token.value, expected[i]);
	});
}

function parseCode(code) {
	const ast = espree.parse(code, DEFAULT_CONFIG);
	return {
		ast,
		store: new TokenStore(ast.tokens, ast.comments),
	};
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("TokenStore", () => {
	let fixture;

	beforeEach(() => {
		fixture = new TestFixture();
	});

	describe("getTokens", () => {
		it("should retrieve all tokens for root node", () => {
			checkTokenValues(fixture.store.getTokens(fixture.program), [
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
			checkTokenValues(fixture.store.getTokens(fixture.binaryExpression), [
				"a",
				"*",
				"b",
			]);
		});

		it("should retrieve all tokens plus one before for binary expression", () => {
			checkTokenValues(
				fixture.store.getTokens(fixture.binaryExpression, 1),
				["=", "a", "*", "b"],
			);
		});

		it("should retrieve all tokens plus one after for binary expression", () => {
			checkTokenValues(
				fixture.store.getTokens(fixture.binaryExpression, 0, 1),
				["a", "*", "b", "call"],
			);
		});

		it("should retrieve all tokens plus two before and one after for binary expression", () => {
			checkTokenValues(
				fixture.store.getTokens(fixture.binaryExpression, 2, 1),
				["answer", "=", "a", "*", "b", "call"],
			);
		});

		it("should retrieve all matched tokens for root node with filter", () => {
			checkTokenValues(
				fixture.store.getTokens(
					fixture.program,
					(t) => t.type === "Identifier",
				),
				["answer", "a", "b", "call"],
			);
			checkTokenValues(
				fixture.store.getTokens(fixture.program, {
					filter: (t) => t.type === "Identifier",
				}),
				["answer", "a", "b", "call"],
			);
		});

		it("should retrieve all tokens and comments in the node for root node with includeComments option", () => {
			checkTokenValues(
				fixture.store.getTokens(fixture.program, {
					includeComments: true,
				}),
				[
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
				],
			);
		});

		it("should retrieve matched tokens and comments in the node for root node with includeComments and filter options", () => {
			checkTokenValues(
				fixture.store.getTokens(fixture.program, {
					includeComments: true,
					filter: (t) => t.type.startsWith("Block"),
				}),
				["A", "B", "C", "D", "E", "Z"],
			);
		});

		it("should retrieve all tokens and comments in the node for binary expression with includeComments option", () => {
			checkTokenValues(
				fixture.store.getTokens(fixture.binaryExpression, {
					includeComments: true,
				}),
				["a", "D", "*", "b"],
			);
		});

		it("should retrieve tokens and comments from Program with leading and trailing comments and whitespace", () => {
			const { ast, store } = parseCode(" /*A*/ bar /*Z*/ ");
			checkTokenValues(store.getTokens(ast), ["bar"]);
			checkTokenValues(store.getTokens(ast, { includeComments: true }), [
				"A",
				"bar",
				"Z",
			]);
		});
	});

	describe("getTokensBefore", () => {
		it("should retrieve zero tokens before a node", () => {
			checkTokenValues(
				fixture.store.getTokensBefore(fixture.binaryExpression, 0),
				[],
			);
		});

		it("should retrieve one token before a node", () => {
			checkTokenValues(
				fixture.store.getTokensBefore(fixture.binaryExpression, 1),
				["="],
			);
		});

		it("should retrieve more than one token before a node", () => {
			checkTokenValues(
				fixture.store.getTokensBefore(fixture.binaryExpression, 2),
				["answer", "="],
			);
		});

		it("should retrieve all tokens before a node", () => {
			checkTokenValues(
				fixture.store.getTokensBefore(fixture.binaryExpression, 9e9),
				["var", "answer", "="],
			);
		});

		it("should retrieve more than one token before a node with count option", () => {
			checkTokenValues(
				fixture.store.getTokensBefore(fixture.binaryExpression, {
					count: 2,
				}),
				["answer", "="],
			);
		});

		it("should retrieve matched tokens before a node with count and filter options", () => {
			checkTokenValues(
				fixture.store.getTokensBefore(fixture.binaryExpression, {
					count: 1,
					filter: (t) => t.value !== "=",
				}),
				["answer"],
			);
		});

		it("should retrieve all matched tokens before a node with filter option", () => {
			checkTokenValues(
				fixture.store.getTokensBefore(fixture.binaryExpression, {
					filter: (t) => t.value !== "answer",
				}),
				["var", "="],
			);
		});

		it("should retrieve no tokens before the root node", () => {
			checkTokenValues(
				fixture.store.getTokensBefore(fixture.program, { count: 1 }),
				[],
			);
		});

		it("should retrieve tokens and comments before a node with count and includeComments option", () => {
			checkTokenValues(
				fixture.store.getTokensBefore(fixture.binaryExpression, {
					count: 3,
					includeComments: true,
				}),
				["B", "=", "C"],
			);
		});

		it("should retrieve all tokens and comments before a node with includeComments option only", () => {
			checkTokenValues(
				fixture.store.getTokensBefore(fixture.binaryExpression, {
					includeComments: true,
				}),
				["A", "var", "answer", "B", "=", "C"],
			);
		});

		it("should retrieve all tokens and comments before a node with includeComments and filter options", () => {
			checkTokenValues(
				fixture.store.getTokensBefore(fixture.binaryExpression, {
					includeComments: true,
					filter: (t) => t.type.startsWith("Block"),
				}),
				["A", "B", "C"],
			);
		});

		it("should retrieve no tokens before Program when it starts with whitespace", () => {
			const { ast, store } = parseCode(" bar");
			checkTokenValues(store.getTokensBefore(ast, 1), []);
		});

		it("should retrieve no tokens before Program when it starts with a comment", () => {
			const { ast, store } = parseCode("/*comment*/ bar");
			checkTokenValues(store.getTokensBefore(ast, 1), []);
		});

		it("should retrieve no tokens before Program when it starts with whitespace and a comment", () => {
			const { ast, store } = parseCode(" /*comment*/ bar");
			checkTokenValues(
				store.getTokensBefore(ast, {
					count: 1,
					includeComments: true,
				}),
				[],
			);
		});
	});

	describe("getTokenBefore", () => {
		it("should retrieve one token before a node", () => {
			assert.strictEqual(
				fixture.store.getTokenBefore(fixture.binaryExpression).value,
				"=",
			);
		});

		it("should skip a given number of tokens", () => {
			assert.strictEqual(
				fixture.store.getTokenBefore(fixture.binaryExpression, 1).value,
				"answer",
			);
			assert.strictEqual(
				fixture.store.getTokenBefore(fixture.binaryExpression, 2).value,
				"var",
			);
		});

		it("should skip a given number of tokens with skip option", () => {
			assert.strictEqual(
				fixture.store.getTokenBefore(fixture.binaryExpression, {
					skip: 1,
				}).value,
				"answer",
			);
			assert.strictEqual(
				fixture.store.getTokenBefore(fixture.binaryExpression, {
					skip: 2,
				}).value,
				"var",
			);
		});

		it("should retrieve matched token with filter option", () => {
			assert.strictEqual(
				fixture.store.getTokenBefore(
					fixture.binaryExpression,
					(t) => t.value !== "=",
				).value,
				"answer",
			);
		});

		it("should retrieve matched token with skip and filter options", () => {
			assert.strictEqual(
				fixture.store.getTokenBefore(fixture.binaryExpression, {
					skip: 1,
					filter: (t) => t.value !== "=",
				}).value,
				"var",
			);
		});

		it("should retrieve one token or comment before a node with includeComments option", () => {
			assert.strictEqual(
				fixture.store.getTokenBefore(fixture.binaryExpression, {
					includeComments: true,
				}).value,
				"C",
			);
		});

		it("should retrieve one token or comment before a node with includeComments and skip options", () => {
			assert.strictEqual(
				fixture.store.getTokenBefore(fixture.binaryExpression, {
					includeComments: true,
					skip: 1,
				}).value,
				"=",
			);
		});

		it("should retrieve one token or comment before a node with includeComments and skip and filter options", () => {
			assert.strictEqual(
				fixture.store.getTokenBefore(fixture.binaryExpression, {
					includeComments: true,
					skip: 1,
					filter: (t) => t.type.startsWith("Block"),
				}).value,
				"B",
			);
		});

		it("should retrieve the previous node if the comment at the end of source code is specified.", () => {
			const { ast, store } = parseCode("a + b /*comment*/");
			const token = store.getTokenBefore(ast.comments[0]);
			assert.strictEqual(token.value, "b");
		});

		it("should retrieve the previous comment if the first token is specified.", () => {
			const { ast, store } = parseCode("/*comment*/ a + b");
			const token = store.getTokenBefore(ast.tokens[0], {
				includeComments: true,
			});
			assert.strictEqual(token.value, "comment");
		});

		it("should retrieve null if the first comment is specified.", () => {
			const { ast, store } = parseCode("/*comment*/ a + b");
			const token = store.getTokenBefore(ast.comments[0], {
				includeComments: true,
			});
			assert.strictEqual(token, null);
		});

		it("should retrieve null before Program when it starts with whitespace", () => {
			const { ast, store } = parseCode(" bar");
			assert.strictEqual(store.getTokenBefore(ast), null);
		});

		it("should retrieve null before Program when it starts with a comment", () => {
			const { ast, store } = parseCode("/*comment*/ bar");
			assert.strictEqual(store.getTokenBefore(ast), null);
		});

		it("should retrieve null before Program when it starts with whitespace and a comment", () => {
			const { ast, store } = parseCode(" /*comment*/ bar");
			assert.strictEqual(
				store.getTokenBefore(ast, { includeComments: true }),
				null,
			);
		});
	});

	describe("getTokensAfter", () => {
		it("should retrieve zero tokens after a node", () => {
			checkTokenValues(
				fixture.store.getTokensAfter(fixture.variableDeclarator.id, 0),
				[],
			);
		});

		it("should retrieve one token after a node", () => {
			checkTokenValues(
				fixture.store.getTokensAfter(fixture.variableDeclarator.id, 1),
				["="],
			);
		});

		it("should retrieve more than one token after a node", () => {
			checkTokenValues(
				fixture.store.getTokensAfter(fixture.variableDeclarator.id, 2),
				["=", "a"],
			);
		});

		it("should retrieve all tokens after a node", () => {
			checkTokenValues(
				fixture.store.getTokensAfter(fixture.variableDeclarator.id, 9e9),
				["=", "a", "*", "b", "call", "(", ")", ";"],
			);
		});

		it("should retrieve more than one token after a node with count option", () => {
			checkTokenValues(
				fixture.store.getTokensAfter(fixture.variableDeclarator.id, {
					count: 2,
				}),
				["=", "a"],
			);
		});

		it("should retrieve all matched tokens after a node with filter option", () => {
			checkTokenValues(
				fixture.store.getTokensAfter(fixture.variableDeclarator.id, {
					filter: (t) => t.type === "Identifier",
				}),
				["a", "b", "call"],
			);
		});

		it("should retrieve matched tokens after a node with count and filter options", () => {
			checkTokenValues(
				fixture.store.getTokensAfter(fixture.variableDeclarator.id, {
					count: 2,
					filter: (t) => t.type === "Identifier",
				}),
				["a", "b"],
			);
		});

		it("should retrieve all tokens and comments after a node with includeComments option", () => {
			checkTokenValues(
				fixture.store.get