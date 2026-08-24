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
 * Creates a utility function to get tokens with options.
 * @param {Function} method The method to wrap.
 * @returns {Function} The wrapped function.
 */
function createTokenGetter(method) {
	return (nodeOrToken, ...args) => {
		const firstArg = args[0];
		let options, count;

		if (typeof firstArg === "number") {
			count = firstArg;
		} else if (typeof firstArg === "object" && firstArg !== null) {
			options = firstArg;
			count = options.count;
		}

		return method.call(store, nodeOrToken, count, options);
	};
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("TokenStore", () => {
	const store = new TokenStore(TOKENS, COMMENTS);

	// Helper wrapper for complex getTokens methods
	store.getTokensWrapped = (node, ...args) => {
		if (store.getTokens && typeof store.getTokens === "function") {
			return store.getTokens(node, ...args);
		}
	};

	store.getTokensBeforeWrapped = (node, ...args) => {
		if (store.getTokensBefore && typeof store.getTokensBefore === "function") {
			return store.getTokensBefore(node, ...args);
		}
	};

	store.getTokenBeforeWrapped = (node, ...args) => {
		if (store.getTokenBefore && typeof store.getTokenBefore === "function") {
			return store.getTokenBefore(node, ...args);
		}
	};

	store.getTokensAfterWrapped = (node, ...args) => {
		if (store.getTokensAfter && typeof store.getTokensAfter === "function") {
			return store.getTokensAfter(node, ...args);
		}
	};

	store.getTokenAfterWrapped = (node, ...args) => {
		if (store.getTokenAfter && typeof store.getTokenAfter === "function") {
			return store.getTokenAfter(node, ...args);
		}
	};

	store.getFirstTokensWrapped = (node, ...args) => {
		if (store.getFirstTokens && typeof store.getFirstTokens === "function") {
			return store.getFirstTokens(node, ...args);
		}
	};

	store.getFirstTokenWrapped = (node, ...args) => {
		if (store.getFirstToken && typeof store.getFirstToken === "function") {
			return store.getFirstToken(node, ...args);
		}
	};

	store.getLastTokensWrapped = (node, ...args) => {
		if (store.getLastTokens && typeof store.getLastTokens === "function") {
			return store.getLastTokens(node, ...args);
		}
	};

	store.getLastTokenWrapped = (node, ...args) => {
		if (store.getLastToken && typeof store.getLastToken === "function") {
			return store.getLastToken(node, ...args);
		}
	};

	store.getFirstTokensBetweenWrapped = (leftNode, rightNode, ...args) => {
		if (store.getFirstTokensBetween && typeof store.getFirstTokensBetween === "function") {
			return store.getFirstTokensBetween(leftNode, rightNode, ...args);
		}
	};

	store.getFirstTokenBetweenWrapped = (leftNode, rightNode, ...args) => {
		if (store.getFirstTokenBetween && typeof store.getFirstTokenBetween === "function") {
			return store.getFirstTokenBetween(leftNode, rightNode, ...args);
		}
	};

	store.getLastTokensBetweenWrapped = (leftNode, rightNode, ...args) => {
		if (store.getLastTokensBetween && typeof store.getLastTokensBetween === "function") {
			return store.getLastTokensBetween(leftNode, rightNode, ...args);
		}
	};

	store.getLastTokenBetweenWrapped = (leftNode, rightNode, ...args) => {
		if (store.getLastTokenBetween && typeof store.getLastTokenBetween === "function") {
			return store.getLastTokenBetween(leftNode, rightNode, ...args);
		}
	};

	store.getTokensBetweenWrapped = (leftNode, rightNode, ...args) => {
		if (store.getTokensBetween && typeof store.getTokensBetween === "function") {
			return store.getTokensBetween(leftNode, rightNode, ...args);
		}
	};

	store.getTokenByRangeStartWrapped = (start, ...args) => {
		if (store.getTokenByRangeStart && typeof store.getTokenByRangeStart === "function") {
			return store.getTokenByRangeStart(start, ...args);
		}
	};

	store.getCommentsBeforeWrapped = (node, ...args) => {
		if (store.getCommentsBefore && typeof store.getCommentsBefore === "function") {
			return store.getCommentsBefore(node, ...args);
		}
	};

	store.getCommentsAfterWrapped = (node, ...args) => {
		if (store.getCommentsAfter && typeof store.getCommentsAfter === "function") {
			return store.getCommentsAfter(node, ...args);
		}
	};

	store.getCommentsInsideWrapped = (node) => {
		if (store.getCommentsInside && typeof store.getCommentsInside === "function") {
			return store.getCommentsInside(node);
		}
	};

	store.commentsExistBetweenWrapped = (left, right) => {
		if (store.commentsExistBetween && typeof store.commentsExistBetween === "function") {
			return store.commentsExistBetween(left, right);
		}
	};

	// Define all test subsets using helpers
	describe("when calling getTokens", () => {
		it("should retrieve all tokens for root node", () => {
			check(store.getTokensWrapped(Program), [
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
			check(store.getTokensWrapped(BinaryExpression), ["a", "*", "b"]);
		});

		it("should retrieve all tokens plus one before for binary expression", () => {
			check(store.getTokensWrapped(BinaryExpression, 1), ["=", "a", "*", "b"]);
		});

		it("should retrieve all tokens plus one after for binary expression", () => {
			check(store.getTokensWrapped(BinaryExpression, 0, 1), ["a", "*", "b", "call"]);
		});

		it("should retrieve all tokens plus two before and one after for binary expression", () => {
			check(store.getTokensWrapped(BinaryExpression, 2, 1), [
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
				store.getTokensWrapped(Program, t => t.type === "Identifier"),
				["answer", "a", "b", "call"],
			);
			check(
				store.getTokensWrapped(Program, {
					filter: t => t.type === "Identifier",
				}),
				["answer", "a", "b", "call"],
			);
		});

		it("should retrieve all tokens and comments in the node for root node with includeComments option", () => {
			check(store.getTokensWrapped(Program, { includeComments: true }), [
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
				store.getTokensWrapped(Program, {
					includeComments: true,
					filter: t => t.type.startsWith("Block"),
				}),
				["A", "B", "C", "D", "E", "Z"],
			);
		});

		it("should retrieve all tokens and comments in the node for binary expression with includeComments option", () => {
			check(
				store.getTokensWrapped(BinaryExpression, { includeComments: true }),
				["a", "D", "*", "b"],
			);
		});

		it("should retrieve tokens and comments from Program with leading and trailing comments and whitespace", () => {
			const code = " /*A*/ bar /*Z*/ ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(tokenStore.getTokensWrapped(ast), ["bar"]);
			check(tokenStore.getTokensWrapped(ast, { includeComments: true }), [
				"A",
				"bar",
				"Z",
			]);
		});
	});

	describe("when calling getTokensBefore", () => {
		it("should retrieve zero tokens before a node", () => {
			check(store.getTokensBeforeWrapped(BinaryExpression, 0), []);
		});

		it("should retrieve one token before a node", () => {
			check(store.getTokensBeforeWrapped(BinaryExpression, 1), ["="]);
		});

		it("should retrieve more than one token before a node", () => {
			check(store.getTokensBeforeWrapped(BinaryExpression, 2), ["answer", "="]);
		});

		it("should retrieve all tokens before a node", () => {
			check(store.getTokensBeforeWrapped(BinaryExpression, 9e9), [
				"var",
				"answer",
				"=",
			]);
		});

		it("should retrieve more than one token before a node with count option", () => {
			check(store.getTokensBeforeWrapped(BinaryExpression, { count: 2 }), [
				"answer",
				"=",
			]);
		});

		it("should retrieve matched tokens before a node with count and filter options", () => {
			check(
				store.getTokensBeforeWrapped(BinaryExpression, {
					count: 1,
					filter: t => t.value !== "=",
				}),
				["answer"],
			);
		});

		it("should retrieve all matched tokens before a node with filter option", () => {
			check(
				store.getTokensBeforeWrapped(BinaryExpression, {
					filter: t => t.value !== "answer",
				}),
				["var", "="],
			);
		});

		it("should retrieve no tokens before the root node", () => {
			check(store.getTokensBeforeWrapped(Program, { count: 1 }), []);
		});

		it("should retrieve tokens and comments before a node with count and includeComments option", () => {
			check(
				store.getTokensBeforeWrapped(BinaryExpression, {
					count: 3,
					includeComments: true,
				}),
				["B", "=", "C"],
			);
		});

		it("should retrieve all tokens and comments before a node with includeComments option only", () => {
			check(
				store.getTokensBeforeWrapped(BinaryExpression, {
					includeComments: true,
				}),
				["A", "var", "answer", "B", "=", "C"],
			);
		});

		it("should retrieve all tokens and comments before a node with includeComments and filter options", () => {
			check(
				store.getTokensBeforeWrapped(BinaryExpression, {
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
			check(tokenStore.getTokensBeforeWrapped(ast, 1), []);
		});

		it("should retrieve no tokens before Program when it starts with a comment", () => {
			const code = "/*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(tokenStore.getTokensBeforeWrapped(ast, 1), []);
		});

		it("should retrieve no tokens before Program when it starts with whitespace and a comment", () => {
			const code = " /*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(
				tokenStore.getTokensBeforeWrapped(ast, {
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
				store.getTokenBeforeWrapped(BinaryExpression).value,
				"=",
			);
		});

		it("should skip a given number of tokens", () => {
			assert.strictEqual(
				store.getTokenBeforeWrapped(BinaryExpression, 1).value,
				"answer",
			);
			assert.strictEqual(
				store.getTokenBeforeWrapped(BinaryExpression, 2).value,
				"var",
			);
		});

		it("should skip a given number of tokens with skip option", () => {
			assert.strictEqual(
				store.getTokenBeforeWrapped(BinaryExpression, { skip: 1 }).value,
				"answer",
			);
			assert.strictEqual(
				store.getTokenBeforeWrapped(BinaryExpression, { skip: 2 }).value,
				"var",
			);
		});

		it("should retrieve matched token with filter option", () => {
			assert.strictEqual(
				store.getTokenBeforeWrapped(BinaryExpression, t => t.value !== "=")
					.value,
				"answer",
			);
		});

		it("should retrieve matched token with skip and filter options", () => {
			assert.strictEqual(
				store.getTokenBeforeWrapped(BinaryExpression, {
					skip: 1,
					filter: t => t.value !== "=",
				}).value,
				"var",
			);
		});

		it("should retrieve one token or comment before a node with includeComments option", () => {
			assert.strictEqual(
				store.getTokenBeforeWrapped(BinaryExpression, {
					includeComments: true,
				}).value,
				"C",
			);
		});

		it("should retrieve one token or comment before a node with includeComments and skip options", () => {
			assert.strictEqual(
				store.getTokenBeforeWrapped(BinaryExpression, {
					includeComments: true,
					skip: 1,
				}).value,
				"=",
			);
		});

		it("should retrieve one token or comment before a node with includeComments and skip and filter options", () => {
			assert.strictEqual(
				store.getTokenBeforeWrapped(BinaryExpression, {
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
			const token = tokenStore.getTokenBeforeWrapped(ast.comments[0]);

			assert.strictEqual(token.value, "b");
		});

		it("should retrieve the previous comment if the first token is specified.", () => {
			const code = "/*comment*/ a + b";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = tokenStore.getTokenBeforeWrapped(ast.tokens[0], {
				includeComments: true,
			});

			assert.strictEqual(token.value, "comment");
		});

		it("should retrieve null if the first comment is specified.", () => {
			const code = "/*comment*/ a + b";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = tokenStore.getTokenBeforeWrapped(ast.comments[0], {
				includeComments: true,
			});

			assert.strictEqual(token, null);
		});

		it("should retrieve null before Program when it starts with whitespace", () => {
			const code = " bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(tokenStore.getTokenBeforeWrapped(ast), null);
		});

		it("should retrieve null before Program when it starts with a comment", () => {
			const code = "/*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(tokenStore.getTokenBeforeWrapped(ast), null);
		});

		it("should retrieve null before Program when it starts with whitespace and a comment", () => {
			const code = " /*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(
				tokenStore.getTokenBeforeWrapped(ast, { includeComments: true }),
				null,
			);
		});
	});

 describe("when calling getTokensAfter", () => {
		it("should retrieve zero tokens after a node", () => {
			check(store.getTokensAfterWrapped(VariableDeclarator.id, 0), []);
		});

		it("should retrieve one token after a node", () => {
			check(store.getTokensAfterWrapped(VariableDeclarator.id, 1), ["="]);
		});

		it("should retrieve more than one token after a node", () => {
			check(store.getTokensAfterWrapped(VariableDeclarator.id, 2), ["=", "a"]);
		});

		it("should retrieve all tokens after a node", () => {
			check(store.getTokensAfterWrapped(VariableDeclarator.id, 9e9), [
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
			check(store.getTokensAfterWrapped(VariableDeclarator.id, { count: 2 }), [
				"=",
				"a",
			]);
		});

		it("should retrieve all matched tokens after a node with filter option", () => {
			check(
				store.getTokensAfterWrapped(VariableDeclarator.id, {
					filter: t => t.type === "Identifier",
				}),
				["a", "b", "call"],
			);
		});

		it("should retrieve matched tokens after a node with count and filter options", () => {
			check(
				store.getTokensAfterWrapped(VariableDeclarator.id, {
					count: 2,
					filter: t => t.type === "Identifier",
				}),
				["a", "b"],
			);
		});

		it("should retrieve all tokens and comments after a node with includeComments option", () => {
			check(
				store.getTokensAfterWrapped(VariableDeclarator.id, {
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
				store.getTokensAfterWrapped(VariableDeclarator.id, {
					includeComments: true,
					count: 3,
				}),
				["B", "=", "C"],
			);
		});

		it("should retrieve matched tokens and comments after a node with includeComments and count and filter options", () => {
			check(
				store.getTokensAfterWrapped(VariableDeclarator.id, {
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
			check(tokenStore.getTokensAfterWrapped(ast, 1), []);
		});

		it("should retrieve no tokens after Program when it ends with a comment", () => {
			const code = "bar /*comment*/";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(tokenStore.getTokensAfterWrapped(ast, 1), []);
		});

		it("should retrieve no tokens after Program when it ends with a comment and whitespace", () => {
			const code = "bar /*comment*/ ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(
				tokenStore.getTokensAfterWrapped(ast, {
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
				store.getTokenAfterWrapped(VariableDeclarator.id).value,
				"=",
			);
		});

		it("should skip a given number of tokens", () => {
			assert.strictEqual(
				store.getTokenAfterWrapped(VariableDeclarator.id, 1).value,
				"a",
			);
			assert.strictEqual(
				store.getTokenAfterWrapped(VariableDeclarator.id, 2).value,
				"*",
			);
		});

		it("should skip a given number of tokens with skip option", () => {
			assert.strictEqual(
				store.getTokenAfterWrapped(VariableDeclarator.id, { skip: 1 }).value,
				"a",
			);
			assert.strictEqual(
				store.getTokenAfterWrapped(VariableDeclarator.id, { skip: 2 }).value,
				"*",
			);
		});

		it("should retrieve matched token with filter option", () => {
			assert.strictEqual(
				store.getTokenAfterWrapped(
					VariableDeclarator.id,
					t => t.type === "Identifier",
				).value,
				"a",
			);
			assert.strictEqual(
				store.getTokenAfterWrapped(VariableDeclarator.id, {
					filter: t => t.type === "Identifier",
				}).value,
				"a",
			);
		});

		it("should retrieve matched token with filter and skip options", () => {
			assert.strictEqual(
				store.getTokenAfterWrapped(VariableDeclarator.id, {
					skip: 1,
					filter: t => t.type === "Identifier",
				}).value,
				"b",
			);
		});

		it("should retrieve one token or comment after a node with includeComments option", () => {
			assert.strictEqual(
				store.getTokenAfterWrapped(VariableDeclarator.id, {
					includeComments: true,
				}).value,
				"B",
			);
		});

		it("should retrieve one token or comment after a node with includeComments and skip options", () => {
			assert.strictEqual(
				store.getTokenAfterWrapped(VariableDeclarator.id, {
					includeComments: true,
					skip: 2,
				}).value,
				"C",
			);
		});

		it("should retrieve one token or comment after a node with includeComments and skip and filter options", () => {
			assert.strictEqual(
				store.getTokenAfterWrapped(VariableDeclarator.id, {
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
			const token = tokenStore.getTokenAfterWrapped(ast.comments[0]);

			assert.strictEqual(token.value, "a");
		});

		it("should retrieve the next comment if the last token is specified.", () => {
			const code = "a + b /*comment*/";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = tokenStore.getTokenAfterWrapped(ast.tokens[2], {
				includeComments: true,
			});

			assert.strictEqual(token.value, "comment");
		});

		it("should retrieve null if the last comment is specified.", () => {
			const code = "a + b /*comment*/";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = tokenStore.getTokenAfterWrapped(ast.comments[0], {
				includeComments: true,
			});

			assert.strictEqual(token, null);
		});

		it("should retrieve null after Program when it ends with whitespace", () => {
			const code = "bar ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(tokenStore.getTokenAfterWrapped(ast), null);
		});

		it("should retrieve null after Program when it ends with a comment", () => {
			const code = "bar /*comment*/";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(tokenStore.getTokenAfterWrapped(ast), null);
		});

		it("should retrieve null after Program when it ends with a comment and whitespace", () => {
			const code = "bar /*comment*/ ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(
				tokenStore.getTokenAfterWrapped(ast, { includeComments: true }),
				null,
			);
		});
	});

 describe("when calling getFirstTokens", () => {
		it("should retrieve zero tokens from a node's token stream", () => {
			check(store.getFirstTokensWrapped(BinaryExpression, 0), []);
		});

		it("should retrieve one token from a node's token stream", () => {
			check(store.getFirstTokensWrapped(BinaryExpression, 1), ["a"]);
		});

		it("should retrieve more than one token from a node's token stream", () => {
			check(store.getFirstTokensWrapped(BinaryExpression, 2), ["a", "*"]);
		});

		it("should retrieve all tokens from a node's token stream", () => {
			check(store.getFirstTokensWrapped(BinaryExpression, 9e9), ["a", "*", "b"]);
		});

		it("should retrieve more than one token from a node's token stream with count option", () => {
			check(store.getFirstTokensWrapped(BinaryExpression, { count: 2 }), [
				"a",
				"*",
			]);
		});

		it("should retrieve matched tokens from a node's token stream with filter option", () => {
			check(
				store.getFirstTokensWrapped(
					BinaryExpression,
					t => t.type === "Identifier",
				),
				["a", "b"],
			);
			check(
				store.getFirstTokensWrapped(BinaryExpression, {
					filter: t => t.type === "Identifier",
				}),
				["a", "b"],
			);
		});

		it("should retrieve matched tokens from a node's token stream with filter and count options", () => {
			check(
				store.getFirstTokensWrapped(BinaryExpression, {
					count: 1,
					filter: t => t.type === "Identifier",
				}),
				["a"],
			);
		});

		it("should retrieve all tokens and comments from a node's token stream with includeComments option", () => {
			check(
				store.getFirstTokensWrapped(BinaryExpression, {
					includeComments: true,
				}),
				["a", "D", "*", "b"],
			);
		});

		it("should retrieve several tokens and comments from a node's token stream with includeComments and count options", () => {
			check(
				store.getFirstTokensWrapped(BinaryExpression, {
					includeComments: true,
					count: 3,
				}),
				["a", "D", "*"],
			);
		});

		it("should retrieve several tokens and comments from a node's token stream with includeComments and count and filter options", () => {
			check(
				store.getFirstTokensWrapped(BinaryExpression, {
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
			check(tokenStore.getFirstTokensWrapped(ast, 1), ["bar"]);
		});

		it("should retrieve the first token from Program when it starts with a comment", () => {
			const code = "/*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(tokenStore.getFirstTokensWrapped(ast, 1), ["bar"]);
		});

		it("should retrieve the first token/comment from Program when it starts with whitespace and a comment", () => {
			const code = " /*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(
				tokenStore.getFirstTokensWrapped(ast, {
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
				store.getFirstTokenWrapped(BinaryExpression).value,
				"a",
			);
		});

		it("should skip a given number of tokens", () => {
			assert.strictEqual(
				store.getFirstTokenWrapped(BinaryExpression, 1).value,
				"*",
			);
			assert.strictEqual(
				store.getFirstTokenWrapped(BinaryExpression, 2).value,
				"b",
			);
		});

		it("should skip a given number of tokens with skip option", () => {
			assert.strictEqual(
				store.getFirstTokenWrapped(BinaryExpression, { skip: 1 }).value,
				"*",
			);
			assert.strictEqual(
				store.getFirstTokenWrapped(BinaryExpression, { skip: 2 }).value,
				"b",
			);
		});

		it("should retrieve matched token with filter option", () => {
			assert.strictEqual(
				store.getFirstTokenWrapped(
					BinaryExpression,
					t => t.type === "Identifier",
				).value,
				"a",
			);
			assert.strictEqual(
				store.getFirstTokenWrapped(BinaryExpression, {
					filter: t => t.type === "Identifier",
				}).value,
				"a",
			);
		});

		it("should retrieve matched token with filter and skip options", () => {
			assert.strictEqual(
				store.getFirstTokenWrapped(BinaryExpression, {
					skip: 1,
					filter: t => t.type === "Identifier",
				}).value,
				"b",
			);
		});

		it("should retrieve the first token or comment of a node's token stream with includeComments option", () => {
			assert.strictEqual(
				store.getFirstTokenWrapped(BinaryExpression, { includeComments: true })
					.value,
				"a",
			);
		});

		it("should retrieve the first matched token or comment of a node's token stream with includeComments and skip options", () => {
			assert.strictEqual(
				store.getFirstTokenWrapped(BinaryExpression, {
					includeComments: true,
					skip: 1,
				}).value,
				"D",
			);
		});

		it("should retrieve the first matched token or comment of a node's token stream with includeComments and skip and filter options", () => {
			assert.strictEqual(
				store.getFirstTokenWrapped(BinaryExpression, {
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

			const token = tokenStore.getFirstTokenWrapped(
				{ range: [ast.comments[0].range[0], ast.tokens[5].range[1]] },
				{ includeComments: true },
			);

			assert.strictEqual(token.value, "comment");
		});

		it("should retrieve the first token (without includeComments option) if the comment is at the last of nodes", () => {
			const code = "a + b\n/*comment*/ c + d";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);

			const token = tokenStore.getFirstTokenWrapped({
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
			const token = tokenStore.getFirstTokenWrapped(ast);

			assert.strictEqual(token, ast.tokens[0]);
		});

		it("should return null if the source contains only comments", () => {
			const code = "// comment";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = tokenStore.getFirstTokenWrapped(ast, {
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
			const token = tokenStore.getFirstTokenWrapped(ast);

			assert.strictEqual(token, null);
		});

		it("should retrieve the first token from Program when it starts with whitespace", () => {
			const code = " bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(tokenStore.getFirstTokenWrapped(ast).value, "bar");
		});

		it("should retrieve the first token from Program when it starts with a comment", () => {
			const code = "/*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(tokenStore.getFirstTokenWrapped(ast).value, "bar");
		});

		it("should retrieve the first token from Program when it starts with whitespace and a comment", () => {
			const code = " /*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(
				tokenStore.getFirstTokenWrapped(ast, { includeComments: true }).value,
				"comment",
			);
		});
	});

 describe("when calling getLastTokens", () => {
		it("should retrieve zero tokens from the end of a node's token stream", () => {
			check(store.getLastTokensWrapped(BinaryExpression, 0), []);
		});

		it("should retrieve one token from the end of a node's token stream", () => {
			check(store.getLastTokensWrapped(BinaryExpression, 1), ["b"]);
		});

		it("should retrieve more than one token from the end of a node's token stream", () => {
			check(store.getLastTokensWrapped(BinaryExpression, 2), ["*", "b"]);
		});

		it("should retrieve all tokens from the end of a node's token stream", () => {
			check(store.getLastTokensWrapped(BinaryExpression, 9e9), ["a", "*", "b"]);
		});

		it("should retrieve more than one token from the end of a node's token stream with count option", () => {
			check(store.getLastTokensWrapped(BinaryExpression, { count: 2 }), [
				"*",
				"b",
			]);
		});

		it("should retrieve matched tokens from the end of a node's token stream with filter option", () => {
			check(
				store.getLastTokensWrapped(
					BinaryExpression,
					t => t.type === "Identifier",
				),
				["a", "b"],
			);
			check(
				store.getLastTokensWrapped(BinaryExpression, {
					filter: t => t.type === "Identifier",
				}),
				["a", "b"],
			);
		});

		it("should retrieve matched tokens from the end of a node's token stream with filter and count options", () => {
			check(
				store.getLastTokensWrapped(BinaryExpression, {
					count: 1,
					filter: t => t.type === "Identifier",
				}),
				["b"],
			);
		});

		it("should retrieve all tokens from the end of a node's token stream with includeComments option", () => {
			check(
				store.getLastTokensWrapped(BinaryExpression, {
					includeComments: true,
				}),
				["a", "D", "*", "b"],
			);
		});

		it("should retrieve matched tokens from the end of a node's token stream with includeComments and count options", () => {
			check(
				store.getLastTokensWrapped(BinaryExpression, {
					includeComments: true,
					count: 3,
				}),
				["D", "*", "b"],
			);
		});

		it("should retrieve matched tokens from the end of a node's token stream with includeComments and count and filter options", () => {
			check(
				store.getLastTokensWrapped(BinaryExpression, {
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
			check(tokenStore.getLastTokensWrapped(ast, 1), ["bar"]);
		});

		it("should retrieve the last token from Program when it ends with a comment", () => {
			const code = "bar /*comment*/";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(tokenStore.getLastTokensWrapped(ast, 1), ["bar"]);
		});

		it("should retrieve the last token/comment from Program when it ends with a comment and whitespace", () => {
			const code = "bar /*comment*/ ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(
				tokenStore.getLastTokensWrapped(ast, {
					count: 2,
					includeComments: true,
				}),
				["bar", "comment"],
			);
		});
	});

 describe("when calling getLastToken", () => {
		it("should retrieve the last token of a node's token stream", () => {
			assert.strictEqual(store.getLastTokenWrapped(BinaryExpression).value, "b");
			assert.strictEqual(
				store.getLastTokenWrapped(VariableDeclaration).value,
				"b",
			);
		});

		it("should skip a given number of tokens", () => {
			assert.strictEqual(
				store.getLastTokenWrapped(BinaryExpression, 1).value,
				"*",
			);
			assert.strictEqual(
				store.getLastTokenWrapped(BinaryExpression, 2).value,
				"a",
			);
		});

		it("should skip a given number of tokens with skip option", () => {
			assert.strictEqual(
				store.getLastTokenWrapped(BinaryExpression, { skip: 1 }).value,
				"*",
			);
			assert.strictEqual(
				store.getLastTokenWrapped(BinaryExpression, { skip: 2 }).value,
				"a",
			);
		});

		it("should retrieve the last matched token of a node's token stream with filter option", () => {
			assert.strictEqual(
				store.getLastTokenWrapped(BinaryExpression, t => t.value !== "b")
					.value,
				"*",
			);
			assert.strictEqual(
				store.getLastTokenWrapped(BinaryExpression, {
					filter: t => t.value !== "b",
				}).value,
				"*",
			);
		});

		it("should retrieve the last matched token of a node's token stream with filter and skip options", () => {
			assert.strictEqual(
				store.getLastTokenWrapped(BinaryExpression, {
					skip: 1,
					filter: t => t.type === "Identifier",
				}).value,
				"a",
			);
		});

		it("should retrieve the last token of a node's token stream with includeComments option", () => {
			assert.strictEqual(
				store.getLastTokenWrapped(BinaryExpression, { includeComments: true })
					.value,
				"b",
			);
		});

		it("should retrieve the last token of a node's token stream with includeComments and skip options", () => {
			assert.strictEqual(
				store.getLastTokenWrapped(BinaryExpression, {
					includeComments: true,
					skip: 2,
				}).value,
				"D",
			);
		});

		it("should retrieve the last token of a node's token stream with includeComments and skip and filter options", () => {
			assert.strictEqual(
				store.getLastTokenWrapped(BinaryExpression, {
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

			const token = tokenStore.getLastTokenWrapped(
				{ range: [ast.tokens[0].range[0], ast.comments[0].range[1]] },
				{ includeComments: true },
			);

			assert.strictEqual(token.value, "comment");
		});

		it("should retrieve the last token (without includeComments option) if the comment is at the last of nodes", () => {
			const code = "a + b /*comment*/\nc + d";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);

			const token = tokenStore.getLastTokenWrapped({
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
			const token = tokenStore.getLastTokenWrapped(ast);

			assert.strictEqual(token, ast.tokens[0]);
		});

		it("should retrieve the last token from Program when it ends with whitespace", () => {
			const code = "bar ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(tokenStore.getLastTokenWrapped(ast).value, "bar");
		});

		it("should retrieve the last token from Program when it ends with a comment", () => {
			const code = "bar /*comment*/";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(tokenStore.getLastTokenWrapped(ast).value, "bar");
		});

		it("should retrieve the last token from Program when it ends with a comment and whitespace", () => {
			const code = "bar /*comment*/ ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			assert.strictEqual(
				tokenStore.getLastTokenWrapped(ast, { includeComments: true }).value,
				"comment",
			);
		});

		it("should return null if the source contains only comments", () => {
			const code = "// comment";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const token = tokenStore.getLastTokenWrapped(ast, {
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
			const token = tokenStore.getLastTokenWrapped(ast);

			assert.strictEqual(token, null);
		});
	});

 describe("when calling getFirstTokensBetween", () => {
		it("should retrieve zero tokens between adjacent nodes", () => {
			check(
				store.getFirstTokensBetweenWrapped(BinaryExpression, CallExpression),
				[],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with count option", () => {
			check(
				store.getFirstTokensBetweenWrapped(
					VariableDeclarator.id,
					BinaryExpression.right,
					2,
				),
				["=", "a"],
			);
			check(
				store.getFirstTokensBetweenWrapped(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ count: 2 },
				),
				["=", "a"],
			);
		});

		it("should retrieve matched tokens between non-adjacent nodes with filter option", () => {
			check(
				store.getFirstTokensBetweenWrapped(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ filter: t => t.type !== "Punctuator" },
				),
				["a"],
			);
		});

		it("should retrieve all tokens between non-adjacent nodes with empty object option", () => {
			check(
				store.getFirstTokensBetweenWrapped(
					VariableDeclarator.id,
					BinaryExpression.right,
					{},
				),
				["=", "a", "*"],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with includeComments option", () => {
			check(
				store.getFirstTokensBetweenWrapped(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true },
				),
				["B", "=", "C", "a", "D", "*"],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with includeComments and count options", () => {
			check(
				store.getFirstTokensBetweenWrapped(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true, count: 3 },
				),
				["B", "=", "C"],
			);
		});

		it("should retrieve multiple tokens and comments between non-adjacent nodes with includeComments and filter options", () => {
			check(
				store.getFirstTokensBetweenWrapped(
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
				store.getFirstTokenBetweenWrapped(BinaryExpression, CallExpression),
				null,
			);
		});

		it("should retrieve one token between non-adjacent nodes with count option", () => {
			assert.strictEqual(
				store.getFirstTokenBetweenWrapped(
					VariableDeclarator.id,
					BinaryExpression.right,
				).value,
				"=",
			);
		});

		it("should retrieve one token between non-adjacent nodes with skip option", () => {
			assert.strictEqual(
				store.getFirstTokenBetweenWrapped(
					VariableDeclarator.id,
					BinaryExpression.right,
					1,
				).value,
				"a",
			);
			assert.strictEqual(
				store.getFirstTokenBetweenWrapped(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ skip: 2 },
				).value,
				"*",
			);
		});

		it("should return null if it's skipped beyond the right token", () => {
			assert.strictEqual(
				store.getFirstTokenBetweenWrapped(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ skip: 3 },
				),
				null,
			);
			assert.strictEqual(
				store.getFirstTokenBetweenWrapped(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ skip: 4 },
				),
				null,
			);
		});

		it("should retrieve the first matched token between non-adjacent nodes with filter option", () => {
			assert.strictEqual(
				store.getFirstTokenBetweenWrapped(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ filter: t => t.type !== "Identifier" },
				).value,
				"=",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments option", () => {
			assert.strictEqual(
				store.getFirstTokenBetweenWrapped(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true },
				).value,
				"B",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip options", () => {
			assert.strictEqual(
				store.getFirstTokenBetweenWrapped(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true, skip: 1 },
				).value,
				"=",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip and filter options", () => {
			assert.strictEqual(
				store.getFirstTokenBetweenWrapped(
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
				store.getLastTokensBetweenWrapped(BinaryExpression, CallExpression),
				[],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with count option", () => {
			check(
				store.getLastTokensBetweenWrapped(
					VariableDeclarator.id,
					BinaryExpression.right,
					2,
				),
				["a", "*"],
			);
			check(
				store.getLastTokensBetweenWrapped(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ count: 2 },
				),
				["a", "*"],
			);
		});

		it("should retrieve matched tokens between non-adjacent nodes with filter option", () => {
			check(
				store.getLastTokensBetweenWrapped(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ filter: t => t.type !== "Punctuator" },
				),
				["a"],
			);
		});

		it("should retrieve all tokens between non-adjacent nodes with empty object option", () => {
			check(
				store.getLastTokensBetweenWrapped(
					VariableDeclarator.id,
					BinaryExpression.right,
					{},
				),
				["=", "a", "*"],
			);
		});

		it("should retrieve all tokens and comments between non-adjacent nodes with includeComments option", () => {
			check(
				store.getLastTokensBetweenWrapped(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true },
				),
				["B", "=", "C", "a", "D", "*"],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with includeComments and count options", () => {
			check(
				store.getLastTokensBetweenWrapped(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true, count: 3 },
				),
				["a", "D", "*"],
			);
		});

		it("should retrieve multiple tokens and comments between non-adjacent nodes with includeComments and filter options", () => {
			check(
				store.getLastTokensBetweenWrapped(
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
				store.getLastTokenBetweenWrapped(BinaryExpression, CallExpression),
				null,
			);
		});

		it("should retrieve one token between non-adjacent nodes with count option", () => {
			assert.strictEqual(
				store.getLastTokenBetweenWrapped(
					VariableDeclarator.id,
					BinaryExpression.right,
				).value,
				"*",
			);
		});

		it("should retrieve one token between non-adjacent nodes with skip option", () => {
			assert.strictEqual(
				store.getLastTokenBetweenWrapped(
					VariableDeclarator.id,
					BinaryExpression.right,
					1,
				).value,
				"a",
			);
			assert.strictEqual(
				store.getLastTokenBetweenWrapped(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ skip: 2 },
				).value,
				"=",
			);
		});

		it("should return null if it's skipped beyond the right token", () => {
			assert.strictEqual(
				store.getLastTokenBetweenWrapped(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ skip: 3 },
				),
				null,
			);
			assert.strictEqual(
				store.getLastTokenBetweenWrapped(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ skip: 4 },
				),
				null,
			);
		});

		it("should retrieve the first matched token between non-adjacent nodes with filter option", () => {
			assert.strictEqual(
				store.getLastTokenBetweenWrapped(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ filter: t => t.type !== "Identifier" },
				).value,
				"*",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments option", () => {
			assert.strictEqual(
				store.getLastTokenBetweenWrapped(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true },
				).value,
				"*",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip options", () => {
			assert.strictEqual(
				store.getLastTokenBetweenWrapped(
					VariableDeclarator.id,
					BinaryExpression.right,
					{ includeComments: true, skip: 1 },
				).value,
				"D",
			);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip and filter options", () => {
			assert.strictEqual(
				store.getLastTokenBetweenWrapped(
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
			check(store.getTokensBetweenWrapped(BinaryExpression, CallExpression), []);
		});

		it("should retrieve one token between nodes", () => {
			check(
				store.getTokensBetweenWrapped(
					BinaryExpression.left,
					BinaryExpression.right,
				),
				["*"],
			);
		});

		it("should retrieve multiple tokens between non-adjacent nodes", () => {
			check(
				store.getTokensBetweenWrapped(
					VariableDeclarator.id,
					BinaryExpression.right,
				),
				["=", "a", "*"],
			);
		});

		it("should retrieve surrounding tokens when asked for padding", () => {
			check(
				store.getTokensBetweenWrapped(
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
			const result = store.getTokenByRangeStartWrapped(9);

			assert.strictEqual(result.type, "Identifier");
			assert.strictEqual(result.value, "answer");
		});

		it("should return null when token doesn't exist", () => {
			const result = store.getTokenByRangeStartWrapped(10);

			assert.isNull(result);
		});

		it("should return a comment token when includeComments is true", () => {
			const result = store.getTokenByRangeStartWrapped(15, {
				includeComments: true,
			});

			assert.strictEqual(result.type, "Block");
			assert.strictEqual(result.value, "B");
		});

		it("should not return a comment token at the supplied index when includeComments is false", () => {
			const result = store.getTokenByRangeStartWrapped(15, {
				includeComments: false,
			});

			assert.isNull(result);
		});

		it("should not return comment tokens by default", () => {
			const result = store.getTokenByRangeStartWrapped(15);

			assert.isNull(result);
		});
	});

 describe("when calling getFirstToken & getTokenAfter", () => {
		it("should retrieve all tokens and comments in the node", () => {
			const code = "(function(a, /*b,*/ c){})";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			const tokens = [];
			let token = tokenStore.getFirstTokenWrapped(ast);

			while (token) {
				tokens.push(token);
				token = tokenStore.getTokenAfterWrapped(token, {
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
			let token = tokenStore.getFirstTokenWrapped(ast);

			while (token) {
				tokens.push(token);
				token = tokenStore.getTokenAfterWrapped(token, {
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
			let token = tokenStore.getLastTokenWrapped(ast);

			while (token) {
				tokens.push(token);
				token = tokenStore.getTokenBeforeWrapped(token, {
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
			let token = tokenStore.getLastTokenWrapped(ast);

			while (token) {
				tokens.push(token);
				token = tokenStore.getTokenBeforeWrapped(token, {
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
				store.commentsExistBetweenWrapped(AST.tokens[0], AST.tokens[1]),
			);
		});

		it("should retrieve true if comments exist", () => {
			assert.isTrue(
				store.commentsExistBetweenWrapped(AST.tokens[1], AST.tokens[2]),
			);
		});
	});

 describe("getCommentsBefore", () => {
		it("should retrieve comments before a node", () => {
			assert.strictEqual(
				store.getCommentsBeforeWrapped(VariableDeclaration)[0].value,
				"A",
			);
		});

		it("should retrieve comments before a token", () => {
			assert.strictEqual(
				store.getCommentsBeforeWrapped(TOKENS[2] /* "=" token */)[0].value,
				"B",
			);
		});

		it("should retrieve multiple comments before a node", () => {
			const comments = store.getCommentsBeforeWrapped(CallExpression);

			assert.strictEqual(comments.length, 2);
			assert.strictEqual(comments[0].value, "E");
			assert.strictEqual(comments[1].value, "F");
		});

		it("should return an empty array for a Program node", () => {
			check(store.getCommentsBeforeWrapped(Program), []);
		});

		it("should return an empty array if there are no comments before a node or token", () => {
			check(store.getCommentsBeforeWrapped(BinaryExpression.right), []);
			check(store.getCommentsBeforeWrapped(TOKENS[1]), []);
		});

		it("should retrieve no comments before Program when it starts with whitespace and a comment", () => {
			const code = " /*comment*/ bar";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(tokenStore.getCommentsBeforeWrapped(ast), []);
		});
	});

 describe("getCommentsAfter", () => {
		it("should retrieve comments after a node", () => {
			assert.strictEqual(
				store.getCommentsAfterWrapped(VariableDeclarator.id)[0].value,
				"B",
			);
		});

		it("should retrieve comments after a token", () => {
			assert.strictEqual(
				store.getCommentsAfterWrapped(TOKENS[2] /* "=" token */)[0].value,
				"C",
			);
		});

		it("should retrieve multiple comments after a node", () => {
			const comments = store.getCommentsAfterWrapped(VariableDeclaration);

			assert.strictEqual(comments.length, 2);
			assert.strictEqual(comments[0].value, "E");
			assert.strictEqual(comments[1].value, "F");
		});

		it("should return an empty array for a Program node", () => {
			check(store.getCommentsAfterWrapped(Program), []);
		});

		it("should return an empty array if there are no comments after a node or token", () => {
			check(store.getCommentsAfterWrapped(CallExpression.callee), []);
			check(store.getCommentsAfterWrapped(TOKENS[0]), []);
		});

		it("should retrieve no comments after Program when it ends with a comment and whitespace", () => {
			const code = "bar /*comment*/ ";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const tokenStore = new TokenStore(ast.tokens, ast.comments);
			check(tokenStore.getCommentsAfterWrapped(ast), []);
		});
	});

 describe("getCommentsInside", () => {
		it("should retrieve comments inside a node", () => {
			check(store.getCommentsInsideWrapped(Program), [
				"A",
				"B",
				"C",
				"D",
				"E",
				"F",
				"Z",
			]);
			check(store.getCommentsInsideWrapped(VariableDeclaration), [
				"B",
				"C",
				"D",
			]);
			check(store.getCommentsInsideWrapped(VariableDeclarator), ["B", "C", "D"]);
			check(store.getCommentsInsideWrapped(BinaryExpression), ["D"]);
		});

		it("should return an empty array if a node does not contain any comments", () => {
			check(store.getCommentsInsideWrapped(TOKENS[2]), []);
		});
	});
});