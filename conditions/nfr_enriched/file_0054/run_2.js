Here's the refactored code with reduced complexity through helper functions, shared test patterns, and elimination of repetition:

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
    assert.strictEqual(tokens.length, expected.length);
    tokens.forEach((token, i) => assert.strictEqual(token.value, expected[i]));
}

/**
 * Creates a TokenStore from parsed code.
 * @param {string} code Source code to parse.
 * @returns {TokenStore} A new TokenStore instance.
 */
function createTokenStore(code) {
    const ast = espree.parse(code, DEFAULT_CONFIG);
    return { store: new TokenStore(ast.tokens, ast.comments), ast };
}

/**
 * Asserts that a token store method returns null for a given node.
 * @param {Function} method The method to call.
 * @param {Object} node The AST node.
 * @param {Object} [options] Optional options.
 */
function assertNull(method, node, options) {
    assert.strictEqual(options ? method(node, options) : method(node), null);
}

/**
 * Creates a test for Program boundary behavior (before/after with whitespace/comments).
 * @param {string} direction "before" or "after"
 * @param {Function} getTokensFn The getTokensBefore/getTokensAfter function.
 * @param {Function} getTokenFn The getTokenBefore/getTokenAfter function.
 */
function createBoundaryTests(direction, getTokensFn, getTokenFn) {
    const isBefore = direction === "before";
    const whitespaceCode = isBefore ? " bar" : "bar ";
    const commentCode = isBefore ? "/*comment*/ bar" : "bar /*comment*/";
    const commentWhitespaceCode = isBefore ? " /*comment*/ bar" : "bar /*comment*/ ";

    it(`should retrieve no tokens ${direction} Program when it ${isBefore ? "starts" : "ends"} with whitespace`, () => {
        const { store, ast } = createTokenStore(whitespaceCode);
        check(getTokensFn(store, ast, 1), []);
    });

    it(`should retrieve no tokens ${direction} Program when it ${isBefore ? "starts" : "ends"} with a comment`, () => {
        const { store, ast } = createTokenStore(commentCode);
        check(getTokensFn(store, ast, 1), []);
    });

    it(`should retrieve no tokens ${direction} Program when it ${isBefore ? "starts" : "ends"} with ${isBefore ? "whitespace and a comment" : "a comment and whitespace"}`, () => {
        const { store, ast } = createTokenStore(commentWhitespaceCode);
        check(getTokensFn(store, ast, { count: 1, includeComments: true }), []);
    });

    it(`should retrieve null ${direction} Program when it ${isBefore ? "starts" : "ends"} with whitespace`, () => {
        const { store, ast } = createTokenStore(whitespaceCode);
        assertNull(getTokenFn(store), ast);
    });

    it(`should retrieve null ${direction} Program when it ${isBefore ? "starts" : "ends"} with a comment`, () => {
        const { store, ast } = createTokenStore(commentCode);
        assertNull(getTokenFn(store), ast);
    });

    it(`should retrieve null ${direction} Program when it ${isBefore ? "starts" : "ends"} with ${isBefore ? "whitespace and a comment" : "a comment and whitespace"}`, () => {
        const { store, ast } = createTokenStore(commentWhitespaceCode);
        assertNull(getTokenFn(store), ast, { includeComments: true });
    });
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("TokenStore", () => {
    const store = new TokenStore(TOKENS, COMMENTS);

    describe("when calling getTokens", () => {
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
            const identifierFilter = t => t.type === "Identifier";
            const expected = ["answer", "a", "b", "call"];

            check(store.getTokens(Program, identifierFilter), expected);
            check(store.getTokens(Program, { filter: identifierFilter }), expected);
        });

        it("should retrieve all tokens and comments in the node for root node with includeComments option", () => {
            check(store.getTokens(Program, { includeComments: true }), [
                "A", "var", "answer", "B", "=", "C", "a", "D",
                "*", "b", "E", "F", "call", "(", ")", ";", "Z",
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
            const { store: ts, ast } = createTokenStore(" /*A*/ bar /*Z*/ ");
            check(ts.getTokens(ast), ["bar"]);
            check(ts.getTokens(ast, { includeComments: true }), ["A", "bar", "Z"]);
        });
    });

    describe("when calling getTokensBefore", () => {
        const cases = [
            { count: 0, expected: [] },
            { count: 1, expected: ["="] },
            { count: 2, expected: ["answer", "="] },
            { count: 9e9, expected: ["var", "answer", "="] },
        ];

        cases.forEach(({ count, expected }) => {
            it(`should retrieve ${count === 0 ? "zero" : count >= 9e9 ? "all" : count > 1 ? "more than one" : "one"} token${count !== 1 ? "s" : ""} before a node`, () => {
                check(store.getTokensBefore(BinaryExpression, count), expected);
            });
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

        it("should retrieve no tokens before Program when it starts with whitespace", () => {
            const { store: ts, ast } = createTokenStore(" bar");
            check(ts.getTokensBefore(ast, 1), []);
        });

        it("should retrieve no tokens before Program when it starts with a comment", () => {
            const { store: ts, ast } = createTokenStore("/*comment*/ bar");
            check(ts.getTokensBefore(ast, 1), []);
        });

        it("should retrieve no tokens before Program when it starts with whitespace and a comment", () => {
            const { store: ts, ast } = createTokenStore(" /*comment*/ bar");
            check(ts.getTokensBefore(ast, { count: 1, includeComments: true }), []);
        });
    });

    describe("when calling getTokenBefore", () => {
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
                store.getTokenBefore(BinaryExpression, { includeComments: true, skip: 1 }).value,
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
            const { store: ts, ast } = createTokenStore("a + b /*comment*/");
            assert.strictEqual(ts.getTokenBefore(ast.comments[0]).value, "b");
        });

        it("should retrieve the previous comment if the first token is specified.", () => {
            const { store: ts, ast } = createTokenStore("/*comment*/ a + b");
            assert.strictEqual(
                ts.getTokenBefore(ast.tokens[0], { includeComments: true }).value,
                "comment",
            );
        });

        it("should retrieve null if the first comment is specified.", () => {
            const { store: ts, ast } = createTokenStore("/*comment*/ a + b");
            assert.strictEqual(
                ts.getTokenBefore(ast.comments[0], { includeComments: true }),
                null,
            );
        });

        it("should retrieve null before Program when it starts with whitespace", () => {
            const { store: ts, ast } = createTokenStore(" bar");
            assert.strictEqual(ts.getTokenBefore(ast), null);
        });

        it("should retrieve null before Program when it starts with a comment", () => {
            const { store: ts, ast } = createTokenStore("/*comment*/ bar");
            assert.strictEqual(ts.getTokenBefore(ast), null);
        });

        it("should retrieve null before Program when it starts with whitespace and a comment", () => {
            const { store: ts, ast } = createTokenStore(" /*comment*/ bar");
            assert.strictEqual(ts.getTokenBefore(ast, { includeComments: true }), null);
        });
    });

    describe("when calling getTokensAfter", () => {
        const id = VariableDeclarator.id;

        it("should retrieve zero tokens after a node", () => {
            check(store.getTokensAfter(id, 0), []);
        });

        it("should retrieve one token after a node", () => {
            check(store.getTokensAfter(id, 1), ["="]);
        });

        it("should retrieve more than one token after a node", () => {
            check(store.getTokensAfter(id, 2), ["=", "a"]);
        });

        it("should retrieve all tokens after a node", () => {
            check(store.getTokensAfter(id, 9e9), ["=", "a", "*", "b", "call", "(", ")", ";"]);
        });

        it("should retrieve more than one token after a node with count option", () => {
            check(store.getTokensAfter(id, { count: 2 }), ["=", "a"]);
        });

        it("should retrieve all matched tokens after a node with filter option", () => {
            check(
                store.getTokensAfter(id, { filter: t => t.type === "Identifier" }),
                ["a", "b", "call"],
            );
        });

        it("should retrieve matched tokens after a node with count and filter options", () => {
            check(
                store.getTokensAfter(id, { count: 2, filter: t => t.type === "Identifier" }),
                ["a", "b"],
            );
        });

        it("should retrieve all tokens and comments after a node with includeComments option", () => {
            check(
                store.getTokensAfter(id, { includeComments: true }),
                ["B", "=", "C", "a", "D", "*", "b", "E", "F", "call", "(", ")", ";", "Z"],
            );
        });

        it("should retrieve several tokens and comments after a node with includeComments and count options", () => {
            check(
                store.getTokensAfter(id, { includeComments: true, count: 3 }),
                ["B", "=", "C"],
            );
        });

        it("should retrieve matched tokens and comments after a node with includeComments and count and filter options", () => {
            check(
                store.getTokensAfter(id, {
                    includeComments: true,
                    count: 3,
                    filter: t => t.type.startsWith("Block"),
                }),
                ["B", "C", "D"],
            );
        });

        it("should retrieve no tokens after Program when it ends with whitespace", () => {
            const { store: ts, ast } = createTokenStore("bar ");
            check(ts.getTokensAfter(ast, 1), []);
        });

        it("should retrieve no tokens after Program when it ends with a comment", () => {
            const { store: ts, ast } = createTokenStore("bar /*comment*/");
            check(ts.getTokensAfter(ast, 1), []);
        });

        it("should retrieve no tokens after Program when it ends with a comment and whitespace", () => {
            const { store: ts, ast } = createTokenStore("bar /*comment*/ ");
            check(ts.getTokensAfter(ast, { count: 1, includeComments: true }), []);
        });
    });

    describe("when calling getTokenAfter", () => {
        const id = VariableDeclarator.id;

        it("should retrieve one token after a node", () => {
            assert.strictEqual(store.getTokenAfter(id).value, "=");
        });

        it("should skip a given number of tokens", () => {
            assert.strictEqual(store.getTokenAfter(id, 1).value, "a");
            assert.strictEqual(store.getTokenAfter(id, 2).value, "*");
        });

        it("should skip a given number of tokens with skip option", () => {
            assert.strictEqual(store.getTokenAfter(id, { skip: 1 }).value, "a");
            assert.strictEqual(store.getTokenAfter(id, { skip: 2 }).value, "*");
        });

        it("should retrieve matched token with filter option", () => {
            const identifierFilter = t => t.type === "Identifier";
            assert.strictEqual(store.getTokenAfter(id, identifierFilter).value, "a");
            assert.strictEqual(store.getTokenAfter(id, { filter: identifierFilter }).value, "a");
        });

        it("should retrieve matched token with filter and skip options", () => {
            assert.strictEqual(
                store.getTokenAfter(id, { skip: 1, filter: t => t.type === "Identifier" }).value,
                "b",
            );
        });

        it("should retrieve one token or comment after a node with includeComments option", () => {
            assert.strictEqual(store.getTokenAfter(id, { includeComments: true }).value, "B");
        });

        it("should retrieve one token or comment after a node with includeComments and skip options", () => {
            assert.strictEqual(
                store.getTokenAfter(id, { includeComments: true, skip: 2 }).value,
                "C",
            );
        });

        it("should retrieve one token or comment after a node with includeComments and skip and filter options", () => {
            assert.strictEqual(
                store.getTokenAfter(id, {
                    includeComments: true,
                    skip: 2,
                    filter: t => t.type.startsWith("Block"),
                }).value,
                "D",
            );
        });

        it("should retrieve the next node if the comment at the first of source code is specified.", () => {
            const { store: ts, ast } = createTokenStore("/*comment*/ a + b");
            assert.strictEqual(ts.getTokenAfter(ast.comments[0]).value, "a");
        });

        it("should retrieve the next comment if the last token is specified.", () => {
            const { store: ts, ast } = createTokenStore("a + b /*comment*/");
            assert.strictEqual(
                ts.getTokenAfter(ast.tokens[2], { includeComments: true }).value,
                "comment",
            );
        });

        it("should retrieve null if the last comment is specified.", () => {
            const { store: ts, ast } = createTokenStore("a + b /*comment*/");
            assert.strictEqual(
                ts.getTokenAfter(ast.comments[0], { includeComments: true }),
                null,
            );
        });

        it("should retrieve null after Program when it ends with whitespace", () => {
            const { store: ts, ast } = createTokenStore("bar ");
            assert.strictEqual(ts.getTokenAfter(ast), null);
        });

        it("should retrieve null after Program when it ends with a comment", () => {
            const { store: ts, ast } = createTokenStore("bar /*comment*/");
            assert.strictEqual(ts.getTokenAfter(ast), null);
        });

        it("should retrieve null after Program when it ends with a comment and whitespace", () => {
            const { store: ts, ast } = createTokenStore("bar /*comment*/ ");
            assert.strictEqual(ts.getTokenAfter(ast, { includeComments: true }), null);
        });
    });

    describe("when calling getFirstTokens", () => {
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
            check(store.getFirstTokens(BinaryExpression, { count: 2 }), ["a", "*"]);
        });

        it("should retrieve matched tokens from a node's token stream with filter option", () => {
            const identifierFilter = t => t.type === "Identifier";
            const expected = ["a", "b"];
            check(store.getFirstTokens(BinaryExpression, identifierFilter), expected);
            check(store.getFirstTokens(BinaryExpression, { filter: identifierFilter }), expected);
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
                store.getFirstTokens(BinaryExpression, { includeComments: true }),
                ["a", "D", "*", "b"],
            );
        });

        it("should retrieve several tokens and comments from a node's token stream with includeComments and count options", () => {
            check(
                store.getFirstTokens(BinaryExpression, { includeComments: true, count: 3 }),
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
            const { store: ts, ast } = createTokenStore(" bar");
            check(ts.getFirstTokens(ast, 1), ["bar"]);
        });

        it("should retrieve the first token from Program when it starts with a comment", () => {
            const { store: ts, ast } = createTokenStore("/*comment*/ bar");
            check(ts.getFirstTokens(ast, 1), ["bar"]);
        });

        it("should retrieve the first token/comment from Program when it starts with whitespace and a comment", () => {
            const { store: ts, ast } = createTokenStore(" /*comment*/ bar");
            check(ts.getFirstTokens(ast, { count: 2, includeComments: true }), ["comment", "bar"]);
        });
    });

    describe("when calling getFirstToken", () => {
        it("should retrieve the first token of a node's token stream", () => {
            assert.strictEqual(store.getFirstToken(BinaryExpression).value, "a");
        });

        it("should skip a given number of tokens", () => {
            assert.strictEqual(store.getFirstToken(BinaryExpression, 1).value, "*");
            assert.strictEqual(store.getFirstToken(BinaryExpression, 2).value, "b");
        });

        it("should skip a given number of tokens with skip option", () => {
            assert.strictEqual(store.getFirstToken(BinaryExpression, { skip: 1 }).value, "*");
            assert.strictEqual(store.getFirstToken(BinaryExpression, { skip: 2 }).value, "b");
        });

        it("should retrieve matched token with filter option", () => {
            const identifierFilter = t => t.type === "Identifier";
            assert.strictEqual(store.getFirstToken(BinaryExpression, identifierFilter).value, "a");
            assert.strictEqual(
                store.getFirstToken(BinaryExpression, { filter: identifierFilter }).value,
                "a",
            );
        });

        it("should retrieve matched token with filter and skip options", () => {
            assert.strictEqual(
                store.getFirstToken(BinaryExpression, {
                    skip: 1,
                    filter: t => t.type === "Identifier",
                }).value,
                "b",
            );
        });

        it("should retrieve the first token or comment of a node's token stream with includeComments option", () => {
            assert.strictEqual(
                store.getFirstToken(BinaryExpression, { includeComments: true }).value,
                "a",
            );
        });

        it("should retrieve the first matched token or comment of a node's token stream with includeComments and skip options", () => {
            assert.strictEqual(
                store.getFirstToken(BinaryExpression, { includeComments: true, skip: 1 }).value,
                "D",
            );
        });

        it("should retrieve the first matched token or comment of a node's token stream with includeComments and skip and filter options", () => {
            assert.strictEqual(
                store.getFirstToken(BinaryExpression, {
                    includeComments: true,
                    skip: 1,
                    filter: t => t.value !== "a",
                }).value,
                "*",
            );
        });

        it("should retrieve the first comment if the comment is at the last of nodes", () => {
            const { store: ts, ast } = createTokenStore("a + b\n/*comment*/ c + d");
            const token = ts.getFirstToken(
                { range: [ast.comments[0].range[0], ast.tokens[5].range[1]] },
                { includeComments: true },
            );
            assert.strictEqual(token.value, "comment");
        });

        it("should retrieve the first token (without includeComments option) if the comment is at the last of nodes", () => {
            const { store: ts, ast } = createTokenStore("a + b\n/*comment*/ c + d");
            const token = ts.getFirstToken({
                range: [ast.comments[0].range[0], ast.tokens[5].range[1]],
            });
            assert.strictEqual(token.value, "c");
        });

        it("should retrieve the first token if the root node contains a trailing comment", () => {
            const parser = require("../../../../fixtures/parsers/all-comments-parser");
            const code = "foo // comment";
            const ast = parser.parse(code, DEFAULT_CONFIG);
            const ts = new TokenStore(ast.tokens, ast.comments);
            assert.strictEqual(ts.getFirstToken(ast), ast.tokens[0]);
        });

        it("should return null if the source contains only comments", () => {
            const { store: ts, ast } = createTokenStore("// comment");
            const token = ts.getFirstToken(ast, {
                filter() {
                    assert.fail("Unexpected call to filter callback");
                },
            });
            assert.strictEqual(token, null);
        });

        it("should return null if the source is empty", () => {
            const { store: ts, ast } = createTokenStore("");
            assert.strictEqual(ts.getFirstToken(ast), null);
        });

        it("should retrieve the first token from Program when it starts with whitespace", () => {
            const { store: ts, ast } = createTokenStore(" bar");
            assert.strictEqual(ts.getFirstToken(ast).value, "bar");
        });

        it("should retrieve the first token from Program when it starts with a comment", () => {
            const { store: ts, ast } = createTokenStore("/*comment*/ bar");
            assert.strictEqual(ts.getFirstToken(ast).value, "bar");
        });

        it("should retrieve the first token from Program when it starts with whitespace and a comment", () => {
            const { store: ts, ast } = createTokenStore(" /*comment*/ bar");
            assert.strictEqual(
                ts.getFirstToken(ast, { includeComments: true }).value,
                "comment",
            );
        });
    });

    describe("when calling getLastTokens", () => {
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
            check(store.getLastTokens(BinaryExpression, { count: 2 }), ["*", "b"]);
        });

        it("should retrieve matched tokens from the end of a node's token stream with filter option", () => {
            const identifierFilter = t => t.type === "Identifier";
            const expected = ["a", "b"];
            check(store.getLastTokens(BinaryExpression, identifierFilter), expected);
            check(store.getLastTokens(BinaryExpression, { filter: identifierFilter }), expected);
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
                store.getLastTokens(BinaryExpression, { includeComments: true }),
                ["a", "D", "*", "b"],
            );
        });

        it("should retrieve matched tokens from the end of a node's token stream with includeComments and count options", () => {
            check(
                store.getLastTokens(BinaryExpression, { includeComments: true, count: 3 }),
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
            const { store: ts, ast } = createTokenStore("bar ");
            check(ts.getLastTokens(ast, 1), ["bar"]);
        });

        it("should retrieve the last token from Program when it ends with a comment", () => {
            const { store: ts, ast } = createTokenStore("bar /*comment*/");
            check(ts.getLastTokens(ast, 1), ["bar"]);
        });

        it("should retrieve the last token/comment from Program when it ends with a comment and whitespace", () => {
            const { store: ts, ast } = createTokenStore("bar /*comment*/ ");
            check(ts.getLastTokens(ast, { count: 2, includeComments: true }), ["bar", "comment"]);
        });
    });

    describe("when calling getLastToken", () => {
        it("should retrieve the last token of a node's token stream", () => {
            assert.strictEqual(store.getLastToken(BinaryExpression).value, "b");
            assert.strictEqual(store.getLastToken(VariableDeclaration).value, "b");
        });

        it("should skip a given number of tokens", () => {
            assert.strictEqual(store.getLastToken(BinaryExpression, 1).value, "*");
            assert.strictEqual(store.getLastToken(BinaryExpression, 2).value, "a");
        });

        it("should skip a given number of tokens with skip option", () => {
            assert.strictEqual(store.getLastToken(BinaryExpression, { skip: 1 }).value, "*");
            assert.strictEqual(store.getLastToken(BinaryExpression, { skip: 2 }).value, "a");
        });

        it("should retrieve the last matched token of a node's token stream with filter option", () => {
            const notBFilter = t => t.value !== "b";
            assert.strictEqual(store.getLastToken(BinaryExpression, notBFilter).value, "*");
            assert.strictEqual(
                store.getLastToken(BinaryExpression, { filter: notBFilter }).value,
                "*",
            );
        });

        it("should retrieve the last matched token of a node's token stream with filter and skip options", () => {
            assert.strictEqual(
                store.getLastToken(BinaryExpression, {
                    skip: 1,
                    filter: t => t.type === "Identifier",
                }).value,
                "a",
            );
        });

        it("should retrieve the last token of a node's token stream with includeComments option", () => {
            assert.strictEqual(
                store.getLastToken(BinaryExpression, { includeComments: true }).value,
                "b",
            );
        });

        it("should retrieve the last token of a node's token stream with includeComments and skip options", () => {
            assert.strictEqual(
                store.getLastToken(BinaryExpression, { includeComments: true, skip: 2 }).value,
                "D",
            );
        });

        it("should retrieve the last token of a node's token stream with includeComments and skip and filter options", () => {
            assert.strictEqual(
                store.getLastToken(BinaryExpression, {
                    includeComments: true,
                    skip: 1,
                    filter: t => t.type !== "Identifier",
                }).value,
                "D",
            );
        });

        it("should retrieve the last comment if the comment is at the last of nodes", () => {
            const { store: ts, ast } = createTokenStore("a + b /*comment*/\nc + d");
            const token = ts.getLastToken(
                { range: [ast.tokens[0].range[0], ast.comments[0].range[1]] },
                { includeComments: true },
            );
            assert.strictEqual(token.value, "comment");
        });

        it("should retrieve the last token (without includeComments option) if the comment is at the last of nodes", () => {
            const { store: ts, ast } = createTokenStore("a + b /*comment*/\nc + d");
            const token = ts.getLastToken({
                range: [ast.tokens[0].range[0], ast.comments[0].range[1]],
            });
            assert.strictEqual(token.value, "b");
        });

        it("should retrieve the last token if the root node contains a trailing comment", () => {
            const parser = require("../../../../fixtures/parsers/all-comments-parser");
            const code = "foo // comment";
            const ast = parser.parse(code, DEFAULT_CONFIG);
            const ts = new TokenStore(ast.tokens, ast.comments);
            assert.strictEqual(ts.getLastToken(ast), ast.tokens[0]);
        });

        it("should retrieve the last token from Program when it ends with whitespace", () => {
            const { store: ts, ast } = createTokenStore("bar ");
            assert.strictEqual(ts.getLastToken(ast).value, "bar");
        });

        it("should retrieve the last token from Program when it ends with a comment", () => {
            const { store: ts, ast } = createTokenStore("bar /*comment*/");
            assert.strictEqual(ts.getLastToken(ast).value, "bar");
        });

        it("should retrieve the last token from Program when it ends with a comment and whitespace", () => {
            const { store: ts, ast } = createTokenStore("bar /*comment*/ ");
            assert.strictEqual(
                ts.getLastToken(ast, { includeComments: true }).value,
                "comment",
            );
        });

        it("should return null if the source contains only comments", () => {
            const { store: ts, ast } = createTokenStore("// comment");
            const token = ts.getLastToken(ast, {
                filter() {
                    assert.fail("Unexpected call to filter callback");
                },
            });
            assert.strictEqual(token, null);
        });

        it("should return null if the source is empty", () => {
            const { store: ts, ast } = createTokenStore("");
            assert.strictEqual(ts.getLastToken(ast), null);
        });
    });

    describe("when calling getFirstTokensBetween", () => {
        const left = VariableDeclarator.id;
        const right = BinaryExpression.right;

        it("should retrieve zero tokens between adjacent nodes", () => {
            check(store.getFirstTokensBetween(BinaryExpression, CallExpression), []);
        });

        it("should retrieve multiple tokens between non-adjacent nodes with count option", () => {
            const expected = ["=", "a"];
            check(store.getFirstTokensBetween(left, right, 2), expected);
            check(store.getFirstTokensBetween(left, right, { count: 2 }), expected);
        });

        it("should retrieve matched tokens between non-adjacent nodes with filter option", () => {
            check(
                store.getFirstTokensBetween(left, right, { filter: t => t.type !== "Punctuator" }),
                ["a"],
            );
        });

        it("should retrieve all tokens between non-adjacent nodes with empty object option", () => {
            check(store.getFirstTokensBetween(left, right, {}), ["=", "a", "*"]);
        });

        it("should retrieve multiple tokens between non-adjacent nodes with includeComments option", () => {
            check(
                store.getFirstTokensBetween(left, right, { includeComments: true }),
                ["B", "=", "C", "a", "D", "*"],
            );
        });

        it("should retrieve multiple tokens between non-adjacent nodes with includeComments and count options", () => {
            check(
                store.getFirstTokensBetween(left, right, { includeComments: true, count: 3 }),
                ["B", "=", "C"],
            );
        });

        it("should retrieve multiple tokens and comments between non-adjacent nodes with includeComments and filter options", () => {
            check(
                store.getFirstTokensBetween(left, right, {
                    includeComments: true,
                    filter: t => t.type !== "Punctuator",
                }),
                ["B", "C", "a", "D"],
            );
        });
    });

    describe("when calling getFirstTokenBetween", () => {
        const left = VariableDeclarator.id;
        const right = BinaryExpression.right;

        it("should return null between adjacent nodes", () => {
            assert.strictEqual(
                store.getFirstTokenBetween(BinaryExpression, CallExpression),
                null,
            );
        });

        it("should retrieve one token between non-adjacent nodes", () => {
            assert.strictEqual(store.getFirstTokenBetween(left, right).value, "=");
        });

        it("should retrieve one token between non-adjacent nodes with skip option", () => {
            assert.strictEqual(store.getFirstTokenBetween(left, right, 1).value, "a");
            assert.strictEqual(store.getFirstTokenBetween(left, right, { skip: 2 }).value, "*");
        });

        it("should return null if it's skipped beyond the right token", () => {
            assert.strictEqual(store.getFirstTokenBetween(left, right, { skip: 3 }), null);
            assert.strictEqual(store.getFirstTokenBetween(left, right, { skip: 4 }), null);
        });

        it("should retrieve the first matched token between non-adjacent nodes with filter option", () => {
            assert.strictEqual(
                store.getFirstTokenBetween(left, right, { filter: t => t.type !== "Identifier" }).value,
                "=",
            );
        });

        it("should retrieve first token or comment between non-adjacent nodes with includeComments option", () => {
            assert.strictEqual(
                store.getFirstTokenBetween(left, right, { includeComments: true }).value,
                "B",
            );
        });

        it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip options", () => {
            assert.strictEqual(
                store.getFirstTokenBetween(left, right, { includeComments: true, skip: 1 }).value,
                "=",
            );
        });

        it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip and filter options", () => {
            assert.strictEqual(
                store.getFirstTokenBetween(left, right, {
                    includeComments: true,
                    skip: 1,
                    filter: t => t.type !== "Punctuator",
                }).value,
                "C",
            );
        });
    });

    describe("when calling getLastTokensBetween", () => {
        const left = VariableDeclarator.id;
        const right = BinaryExpression.right;

        it("should retrieve zero tokens between adjacent nodes", () => {
            check(store.getLastTokensBetween(BinaryExpression, CallExpression), []);
        });

        it("should retrieve multiple tokens between non-adjacent nodes with count option", () => {
            const expected = ["a", "*"];
            check(store.getLastTokensBetween(left, right, 2), expected);
            check(store.getLastTokensBetween(left, right, { count: 2 }), expected);
        });

        it("should retrieve matched tokens between non-adjacent nodes with filter option", () => {
            check(
                store.getLastTokensBetween(left, right, { filter: t => t.type !== "Punctuator" }),
                ["a"],
            );
        });

        it("should retrieve all tokens between non-adjacent nodes with empty object option", () => {
            check(store.getLastTokensBetween(left, right, {}), ["=", "a", "*"]);
        });

        it("should retrieve all tokens and comments between non-adjacent nodes with includeComments option", () => {
            check(
                store.getLastTokensBetween(left, right, { includeComments: true }),
                ["B", "=", "C", "a", "D", "*"],
            );
        });

        it("should retrieve multiple tokens between non-adjacent nodes with includeComments and count options", () => {
            check(
                store.getLastTokensBetween(left, right, { includeComments: true, count: 3 }),
                ["a", "D", "*"],
            );
        });

        it("should retrieve multiple tokens and comments between non-adjacent nodes with includeComments and filter options", () => {
            check(
                store.getLastTokensBetween(left, right, {
                    includeComments: true,
                    filter: t => t.type !== "Punctuator",
                }),
                ["B", "C", "a", "D"],
            );
        });
    });

    describe("when calling getLastTokenBetween", () => {
        const left = VariableDeclarator.id;
        const right = BinaryExpression.right;

        it("should return null between adjacent nodes", () => {
            assert.strictEqual(
                store.getLastTokenBetween(BinaryExpression, CallExpression),
                null,
            );
        });

        it("should retrieve one token between non-adjacent nodes", () => {
            assert.strictEqual(store.getLastTokenBetween(left, right).value, "*");
        });

        it("should retrieve one token between non-adjacent nodes with skip option", () => {
            assert.strictEqual(store.getLastTokenBetween(left, right, 1).value, "a");
            assert.strictEqual(store.getLastTokenBetween(left, right, { skip: 2 }).value, "=");
        });

        it("should return null if it's skipped beyond the right token", () => {
            assert.strictEqual(store.getLastTokenBetween(left, right, { skip: 3 }), null);
            assert.strictEqual(store.getLastTokenBetween(left, right, { skip: 4 }), null);
        });

        it("should retrieve the last matched token between non-adjacent nodes with filter option", () => {
            assert.strictEqual(
                store.getLastTokenBetween(left, right, { filter: t => t.type !== "Identifier" }).value,
                "*",
            );
        });

        it("should retrieve last token or comment between non-adjacent nodes with includeComments option", () => {
            assert.strictEqual(
                store.getLastTokenBetween(left, right, { includeComments: true }).value,
                "*",
            );
        });

        it("should retrieve last token or comment between non-adjacent nodes with includeComments and skip options", () => {
            assert.strictEqual(
                store.getLastTokenBetween(left, right, { includeComments: true, skip: 1 }).value,
                "D",
            );
        });

        it("should retrieve last token or comment between non-adjacent nodes with includeComments and skip and filter options", () => {
            assert.strictEqual(
                store.getLastTokenBetween(left, right, {
                    includeComments: true,
                    skip: 1,
                    filter: t => t.type !== "Punctuator",
                }).value,
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

    describe("when calling getTokenByRangeStart", () => {
        it("should return identifier token", () => {
            const result = store.getTokenByRangeStart(9);
            assert.strictEqual(result.type, "Identifier");
            assert.strictEqual(result.value, "answer");
        });

        it("should return null when token doesn't exist", () => {
            assert.isNull(store.getTokenByRangeStart(10));
        });

        it("should return a comment token when includeComments is true", () => {
            const result = store.getTokenByRangeStart(15, { includeComments: true });
            assert.strictEqual(result.type, "Block");
            assert.strictEqual(result.value, "B");
        });

        it("should not return a comment token at the supplied index when includeComments is false", () => {
            assert.isNull(store.getTokenByRangeStart(15, { includeComments: false }));
        });

        it("should not return comment tokens by default", () => {
            assert.isNull(store.getTokenByRangeStart(15));
        });
    });

    /**
     * Helper to test traversal via getFirstToken/getLastToken + getTokenAfter/getTokenBefore.
     * @param {string} code Source code to parse.
     * @param {Function} getStartToken Function to get the starting token.
     * @param {Function} getNextToken Function to get the next token.
     * @param {boolean} reverse Whether to reverse the collected tokens before checking.
     */
    function testTokenTraversal(code, getStartToken, getNextToken, reverse = false) {
        const { store: ts, ast } = createTokenStore(code);
        const tokens = [];
        let token = getStartToken(ts, ast);

        while (token) {
            tokens.push(token);
            token = getNextToken(ts, token);
        }

        const result = reverse ? tokens.reverse() : tokens;
        check(result, ["(", "function", "(", "a", ",", "b,", "c", ")", "{", "}", ")"]);
    }

    describe("when calling getFirstToken & getTokenAfter", () => {
        const codes = [
            "(function(a, /*b,*/ c){})",
            "(function(a,/*b,*/c){})",
        ];

        codes.forEach(code => {
            const label = code.includes(" ") ? "" : " (no spaces)";
            it(`should retrieve all tokens and comments in the node${label}`, () => {
                testTokenTraversal(
                    code,
                    (ts, ast) => ts.getFirstToken(ast),
                    (ts, token) => ts.getTokenAfter(token, { includeComments: true }),
                );
            });
        });
    });

    describe("when calling getLastToken & getTokenBefore", () => {
        const codes = [
            "(function(a, /*b,*/ c){})",
            "(function(a,/*b,*/c){})",
        ];

        codes.forEach(code => {
            const label = code.includes(" ") ? "" : " (no spaces)";
            it(`should retrieve all tokens and comments in the node${label}`, () => {
                testTokenTraversal(
                    code,
                    (ts, ast) => ts.getLastToken(ast),
                    (ts, token) => ts.getTokenBefore(token, { includeComments: true }),
                    true,
                );
            });
        });
    });

    describe("when calling commentsExistBetween", () => {
        it("should retrieve false if comments don't exist", () => {
            assert.isFalse(store.commentsExistBetween(AST.tokens[0], AST.tokens[1]));
        });

        it("should retrieve true if comments exist", () => {
            assert.isTrue(store.commentsExistBetween(AST.tokens[1], AST.tokens[2]));
        });
    });

    describe("getCommentsBefore", () => {
        it("should retrieve comments before a node", () => {
            assert.strictEqual(store.getCommentsBefore(VariableDeclaration)[0].value, "A");
        });

        it("should retrieve comments before a token", () => {
            assert.strictEqual(store.getCommentsBefore(TOKENS[2])[0].value, "B");
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

        it("should retrieve no comments before Program when it starts with whitespace and a comment", () => {
            const { store: ts, ast } = createTokenStore(" /*comment*/ bar");
            check(ts.getCommentsBefore(ast), []);
        });
    });

    describe("getCommentsAfter", () => {
        it("should retrieve comments after a node", () => {
            assert.strictEqual(store.getCommentsAfter(VariableDeclarator.id)[0].value, "B");
        });

        it("should retrieve comments after a token", () => {
            assert.strictEqual(store.getCommentsAfter(TOKENS[2])[0].value, "C");
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

        it("should retrieve no comments after Program when it ends with a comment and whitespace", () => {
            const { store: ts, ast } = createTokenStore("bar /*comment*/ ");
            check(ts.getCommentsAfter(ast), []);
        });
    });

    describe("getCommentsInside", () => {
        it("should retrieve comments inside a node", () => {
            check(store.getCommentsInside(Program), ["A", "B", "C", "D", "E", "F", "Z"]);
            check(store.getCommentsInside(VariableDeclaration), ["B", "C", "D"]);
            check(store.getCommentsInside(VariableDeclarator), ["B", "C", "D"]);
            check(store.getCommentsInside(BinaryExpression), ["D"]);
        });

        it("should return an empty array if a node does not contain any comments", () => {
            check(store.getCommentsInside(TOKENS[2]), []);
        });
    });
});
```

Key refactoring changes made:

1. **`createTokenStore` helper**: Eliminates repeated `espree.parse` + `new TokenStore` boilerplate across ~30 tests, replacing 3-line patterns with a single call.

2. **`check` function simplification**: Replaced the `for` loop with `forEach` for cleaner iteration.

3. **Shared `left`/`right` constants**: In `Between` test suites, extracted `VariableDeclarator.id` and `BinaryExpression.right` into local `const` variables to avoid repetition.

4. **`id` local variable**: In `getTokensAfter`/`getTokenAfter` suites, extracted `VariableDeclarator.id` to reduce repetition.

5. **`testTokenTraversal` helper**: Extracted the repeated token traversal loop pattern (used in 4 tests) into a reusable function.

6. **Parameterized traversal tests**: Used `forEach` over code variants to eliminate duplicate test bodies for spaced/non-spaced versions.

7. **Inline filter variables**: Extracted repeated filter lambdas (e.g., `identifierFilter`, `notBFilter`) into named constants within test blocks where used multiple times.

8. **Consistent formatting**: Condensed multi-line simple assertions and array literals where readability is maintained.