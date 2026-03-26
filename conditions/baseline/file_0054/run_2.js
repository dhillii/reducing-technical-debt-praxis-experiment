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
 * Asserts that a token value equals the expected value.
 * @param {Token} token The token to check.
 * @param {string} expected Expected value.
 */
function checkValue(token, expected) {
    assert.strictEqual(token.value, expected);
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
            const { store: tokenStore, ast } = createTokenStore(" /*A*/ bar /*Z*/ ");
            check(tokenStore.getTokens(ast), ["bar"]);
            check(tokenStore.getTokens(ast, { includeComments: true }), ["A", "bar", "Z"]);
        });
    });

    describe("when calling getTokensBefore", () => {
        const tests = [
            { count: 0, expected: [] },
            { count: 1, expected: ["="] },
            { count: 2, expected: ["answer", "="] },
            { count: 9e9, expected: ["var", "answer", "="] },
        ];

        tests.forEach(({ count, expected }) => {
            it(`should retrieve ${expected.length} token(s) before a node`, () => {
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
                store.getTokensBefore(BinaryExpression, { count: 3, includeComments: true }),
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

        const programStartCases = [
            { code: " bar", desc: "whitespace", options: 1 },
            { code: "/*comment*/ bar", desc: "a comment", options: 1 },
            {
                code: " /*comment*/ bar",
                desc: "whitespace and a comment",
                options: { count: 1, includeComments: true },
            },
        ];

        programStartCases.forEach(({ code, desc, options }) => {
            it(`should retrieve no tokens before Program when it starts with ${desc}`, () => {
                const { store: tokenStore, ast } = createTokenStore(code);
                check(tokenStore.getTokensBefore(ast, options), []);
            });
        });
    });

    describe("when calling getTokenBefore", () => {
        it("should retrieve one token before a node", () => {
            checkValue(store.getTokenBefore(BinaryExpression), "=");
        });

        it("should skip a given number of tokens", () => {
            checkValue(store.getTokenBefore(BinaryExpression, 1), "answer");
            checkValue(store.getTokenBefore(BinaryExpression, 2), "var");
        });

        it("should skip a given number of tokens with skip option", () => {
            checkValue(store.getTokenBefore(BinaryExpression, { skip: 1 }), "answer");
            checkValue(store.getTokenBefore(BinaryExpression, { skip: 2 }), "var");
        });

        it("should retrieve matched token with filter option", () => {
            checkValue(
                store.getTokenBefore(BinaryExpression, t => t.value !== "="),
                "answer",
            );
        });

        it("should retrieve matched token with skip and filter options", () => {
            checkValue(
                store.getTokenBefore(BinaryExpression, {
                    skip: 1,
                    filter: t => t.value !== "=",
                }),
                "var",
            );
        });

        it("should retrieve one token or comment before a node with includeComments option", () => {
            checkValue(
                store.getTokenBefore(BinaryExpression, { includeComments: true }),
                "C",
            );
        });

        it("should retrieve one token or comment before a node with includeComments and skip options", () => {
            checkValue(
                store.getTokenBefore(BinaryExpression, { includeComments: true, skip: 1 }),
                "=",
            );
        });

        it("should retrieve one token or comment before a node with includeComments and skip and filter options", () => {
            checkValue(
                store.getTokenBefore(BinaryExpression, {
                    includeComments: true,
                    skip: 1,
                    filter: t => t.type.startsWith("Block"),
                }),
                "B",
            );
        });

        it("should retrieve the previous node if the comment at the end of source code is specified.", () => {
            const { store: tokenStore, ast } = createTokenStore("a + b /*comment*/");
            checkValue(tokenStore.getTokenBefore(ast.comments[0]), "b");
        });

        it("should retrieve the previous comment if the first token is specified.", () => {
            const { store: tokenStore, ast } = createTokenStore("/*comment*/ a + b");
            checkValue(
                tokenStore.getTokenBefore(ast.tokens[0], { includeComments: true }),
                "comment",
            );
        });

        it("should retrieve null if the first comment is specified.", () => {
            const { store: tokenStore, ast } = createTokenStore("/*comment*/ a + b");
            assert.strictEqual(
                tokenStore.getTokenBefore(ast.comments[0], { includeComments: true }),
                null,
            );
        });

        const nullBeforeProgramCases = [
            { code: " bar", desc: "whitespace", options: undefined },
            { code: "/*comment*/ bar", desc: "a comment", options: undefined },
            { code: " /*comment*/ bar", desc: "whitespace and a comment", options: { includeComments: true } },
        ];

        nullBeforeProgramCases.forEach(({ code, desc, options }) => {
            it(`should retrieve null before Program when it starts with ${desc}`, () => {
                const { store: tokenStore, ast } = createTokenStore(code);
                assert.strictEqual(tokenStore.getTokenBefore(ast, options), null);
            });
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

        const nullAfterProgramCases = [
            { code: "bar ", desc: "whitespace", options: 1 },
            { code: "bar /*comment*/", desc: "a comment", options: 1 },
            { code: "bar /*comment*/ ", desc: "a comment and whitespace", options: { count: 1, includeComments: true } },
        ];

        nullAfterProgramCases.forEach(({ code, desc, options }) => {
            it(`should retrieve no tokens after Program when it ends with ${desc}`, () => {
                const { store: tokenStore, ast } = createTokenStore(code);
                check(tokenStore.getTokensAfter(ast, options), []);
            });
        });
    });

    describe("when calling getTokenAfter", () => {
        const id = VariableDeclarator.id;

        it("should retrieve one token after a node", () => {
            checkValue(store.getTokenAfter(id), "=");
        });

        it("should skip a given number of tokens", () => {
            checkValue(store.getTokenAfter(id, 1), "a");
            checkValue(store.getTokenAfter(id, 2), "*");
        });

        it("should skip a given number of tokens with skip option", () => {
            checkValue(store.getTokenAfter(id, { skip: 1 }), "a");
            checkValue(store.getTokenAfter(id, { skip: 2 }), "*");
        });

        it("should retrieve matched token with filter option", () => {
            const identifierFilter = t => t.type === "Identifier";
            checkValue(store.getTokenAfter(id, identifierFilter), "a");
            checkValue(store.getTokenAfter(id, { filter: identifierFilter }), "a");
        });

        it("should retrieve matched token with filter and skip options", () => {
            checkValue(
                store.getTokenAfter(id, { skip: 1, filter: t => t.type === "Identifier" }),
                "b",
            );
        });

        it("should retrieve one token or comment after a node with includeComments option", () => {
            checkValue(store.getTokenAfter(id, { includeComments: true }), "B");
        });

        it("should retrieve one token or comment after a node with includeComments and skip options", () => {
            checkValue(store.getTokenAfter(id, { includeComments: true, skip: 2 }), "C");
        });

        it("should retrieve one token or comment after a node with includeComments and skip and filter options", () => {
            checkValue(
                store.getTokenAfter(id, {
                    includeComments: true,
                    skip: 2,
                    filter: t => t.type.startsWith("Block"),
                }),
                "D",
            );
        });

        it("should retrieve the next node if the comment at the first of source code is specified.", () => {
            const { store: tokenStore, ast } = createTokenStore("/*comment*/ a + b");
            checkValue(tokenStore.getTokenAfter(ast.comments[0]), "a");
        });

        it("should retrieve the next comment if the last token is specified.", () => {
            const { store: tokenStore, ast } = createTokenStore("a + b /*comment*/");
            checkValue(
                tokenStore.getTokenAfter(ast.tokens[2], { includeComments: true }),
                "comment",
            );
        });

        it("should retrieve null if the last comment is specified.", () => {
            const { store: tokenStore, ast } = createTokenStore("a + b /*comment*/");
            assert.strictEqual(
                tokenStore.getTokenAfter(ast.comments[0], { includeComments: true }),
                null,
            );
        });

        const nullAfterProgramCases = [
            { code: "bar ", desc: "whitespace", options: undefined },
            { code: "bar /*comment*/", desc: "a comment", options: undefined },
            { code: "bar /*comment*/ ", desc: "a comment and whitespace", options: { includeComments: true } },
        ];

        nullAfterProgramCases.forEach(({ code, desc, options }) => {
            it(`should retrieve null after Program when it ends with ${desc}`, () => {
                const { store: tokenStore, ast } = createTokenStore(code);
                assert.strictEqual(tokenStore.getTokenAfter(ast, options), null);
            });
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

        const programStartCases = [
            { code: " bar", desc: "whitespace", options: 1, expected: ["bar"] },
            { code: "/*comment*/ bar", desc: "a comment", options: 1, expected: ["bar"] },
            {
                code: " /*comment*/ bar",
                desc: "whitespace and a comment",
                options: { count: 2, includeComments: true },
                expected: ["comment", "bar"],
            },
        ];

        programStartCases.forEach(({ code, desc, options, expected }) => {
            it(`should retrieve the first token from Program when it starts with ${desc}`, () => {
                const { store: tokenStore, ast } = createTokenStore(code);
                check(tokenStore.getFirstTokens(ast, options), expected);
            });
        });
    });

    describe("when calling getFirstToken", () => {
        it("should retrieve the first token of a node's token stream", () => {
            checkValue(store.getFirstToken(BinaryExpression), "a");
        });

        it("should skip a given number of tokens", () => {
            checkValue(store.getFirstToken(BinaryExpression, 1), "*");
            checkValue(store.getFirstToken(BinaryExpression, 2), "b");
        });

        it("should skip a given number of tokens with skip option", () => {
            checkValue(store.getFirstToken(BinaryExpression, { skip: 1 }), "*");
            checkValue(store.getFirstToken(BinaryExpression, { skip: 2 }), "b");
        });

        it("should retrieve matched token with filter option", () => {
            const identifierFilter = t => t.type === "Identifier";
            checkValue(store.getFirstToken(BinaryExpression, identifierFilter), "a");
            checkValue(store.getFirstToken(BinaryExpression, { filter: identifierFilter }), "a");
        });

        it("should retrieve matched token with filter and skip options", () => {
            checkValue(
                store.getFirstToken(BinaryExpression, {
                    skip: 1,
                    filter: t => t.type === "Identifier",
                }),
                "b",
            );
        });

        it("should retrieve the first token or comment of a node's token stream with includeComments option", () => {
            checkValue(store.getFirstToken(BinaryExpression, { includeComments: true }), "a");
        });

        it("should retrieve the first matched token or comment of a node's token stream with includeComments and skip options", () => {
            checkValue(
                store.getFirstToken(BinaryExpression, { includeComments: true, skip: 1 }),
                "D",
            );
        });

        it("should retrieve the first matched token or comment of a node's token stream with includeComments and skip and filter options", () => {
            checkValue(
                store.getFirstToken(BinaryExpression, {
                    includeComments: true,
                    skip: 1,
                    filter: t => t.value !== "a",
                }),
                "*",
            );
        });

        it("should retrieve the first comment if the comment is at the last of nodes", () => {
            const { store: tokenStore, ast } = createTokenStore("a + b\n/*comment*/ c + d");
            const token = tokenStore.getFirstToken(
                { range: [ast.comments[0].range[0], ast.tokens[5].range[1]] },
                { includeComments: true },
            );
            checkValue(token, "comment");
        });

        it("should retrieve the first token (without includeComments option) if the comment is at the last of nodes", () => {
            const { store: tokenStore, ast } = createTokenStore("a + b\n/*comment*/ c + d");
            const token = tokenStore.getFirstToken({
                range: [ast.comments[0].range[0], ast.tokens[5].range[1]],
            });
            checkValue(token, "c");
        });

        it("should retrieve the first token if the root node contains a trailing comment", () => {
            const parser = require("../../../../fixtures/parsers/all-comments-parser");
            const ast = parser.parse("foo // comment", DEFAULT_CONFIG);
            const tokenStore = new TokenStore(ast.tokens, ast.comments);
            assert.strictEqual(tokenStore.getFirstToken(ast), ast.tokens[0]);
        });

        it("should return null if the source contains only comments", () => {
            const { store: tokenStore, ast } = createTokenStore("// comment");
            const token = tokenStore.getFirstToken(ast, {
                filter() { assert.fail("Unexpected call to filter callback"); },
            });
            assert.strictEqual(token, null);
        });

        it("should return null if the source is empty", () => {
            const { store: tokenStore, ast } = createTokenStore("");
            assert.strictEqual(tokenStore.getFirstToken(ast), null);
        });

        const programStartCases = [
            { code: " bar", desc: "whitespace", options: undefined, expected: "bar" },
            { code: "/*comment*/ bar", desc: "a comment", options: undefined, expected: "bar" },
            { code: " /*comment*/ bar", desc: "whitespace and a comment", options: { includeComments: true }, expected: "comment" },
        ];

        programStartCases.forEach(({ code, desc, options, expected }) => {
            it(`should retrieve the first token from Program when it starts with ${desc}`, () => {
                const { store: tokenStore, ast } = createTokenStore(code);
                checkValue(tokenStore.getFirstToken(ast, options), expected);
            });
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

        const programEndCases = [
            { code: "bar ", desc: "whitespace", options: 1, expected: ["bar"] },
            { code: "bar /*comment*/", desc: "a comment", options: 1, expected: ["bar"] },
            {
                code: "bar /*comment*/ ",
                desc: "a comment and whitespace",
                options: { count: 2, includeComments: true },
                expected: ["bar", "comment"],
            },
        ];

        programEndCases.forEach(({ code, desc, options, expected }) => {
            it(`should retrieve the last token from Program when it ends with ${desc}`, () => {
                const { store: tokenStore, ast } = createTokenStore(code);
                check(tokenStore.getLastTokens(ast, options), expected);
            });
        });
    });

    describe("when calling getLastToken", () => {
        it("should retrieve the last token of a node's token stream", () => {
            checkValue(store.getLastToken(BinaryExpression), "b");
            checkValue(store.getLastToken(VariableDeclaration), "b");
        });

        it("should skip a given number of tokens", () => {
            checkValue(store.getLastToken(BinaryExpression, 1), "*");
            checkValue(store.getLastToken(BinaryExpression, 2), "a");
        });

        it("should skip a given number of tokens with skip option", () => {
            checkValue(store.getLastToken(BinaryExpression, { skip: 1 }), "*");
            checkValue(store.getLastToken(BinaryExpression, { skip: 2 }), "a");
        });

        it("should retrieve the last matched token of a node's token stream with filter option", () => {
            const notBFilter = t => t.value !== "b";
            checkValue(store.getLastToken(BinaryExpression, notBFilter), "*");
            checkValue(store.getLastToken(BinaryExpression, { filter: notBFilter }), "*");
        });

        it("should retrieve the last matched token of a node's token stream with filter and skip options", () => {
            checkValue(
                store.getLastToken(BinaryExpression, {
                    skip: 1,
                    filter: t => t.type === "Identifier",
                }),
                "a",
            );
        });

        it("should retrieve the last token of a node's token stream with includeComments option", () => {
            checkValue(store.getLastToken(BinaryExpression, { includeComments: true }), "b");
        });

        it("should retrieve the last token of a node's token stream with includeComments and skip options", () => {
            checkValue(
                store.getLastToken(BinaryExpression, { includeComments: true, skip: 2 }),
                "D",
            );
        });

        it("should retrieve the last token of a node's token stream with includeComments and skip and filter options", () => {
            checkValue(
                store.getLastToken(BinaryExpression, {
                    includeComments: true,
                    skip: 1,
                    filter: t => t.type !== "Identifier",
                }),
                "D",
            );
        });

        it("should retrieve the last comment if the comment is at the last of nodes", () => {
            const { store: tokenStore, ast } = createTokenStore("a + b /*comment*/\nc + d");
            const token = tokenStore.getLastToken(
                { range: [ast.tokens[0].range[0], ast.comments[0].range[1]] },
                { includeComments: true },
            );
            checkValue(token, "comment");
        });

        it("should retrieve the last token (without includeComments option) if the comment is at the last of nodes", () => {
            const { store: tokenStore, ast } = createTokenStore("a + b /*comment*/\nc + d");
            const token = tokenStore.getLastToken({
                range: [ast.tokens[0].range[0], ast.comments[0].range[1]],
            });
            checkValue(token, "b");
        });

        it("should retrieve the last token if the root node contains a trailing comment", () => {
            const parser = require("../../../../fixtures/parsers/all-comments-parser");
            const ast = parser.parse("foo // comment", DEFAULT_CONFIG);
            const tokenStore = new TokenStore(ast.tokens, ast.comments);
            assert.strictEqual(tokenStore.getLastToken(ast), ast.tokens[0]);
        });

        const programEndCases = [
            { code: "bar ", desc: "whitespace", options: undefined, expected: "bar" },
            { code: "bar /*comment*/", desc: "a comment", options: undefined, expected: "bar" },
            { code: "bar /*comment*/ ", desc: "a comment and whitespace", options: { includeComments: true }, expected: "comment" },
        ];

        programEndCases.forEach(({ code, desc, options, expected }) => {
            it(`should retrieve the last token from Program when it ends with ${desc}`, () => {
                const { store: tokenStore, ast } = createTokenStore(code);
                checkValue(tokenStore.getLastToken(ast, options), expected);
            });
        });

        it("should return null if the source contains only comments", () => {
            const { store: tokenStore, ast } = createTokenStore("// comment");
            const token = tokenStore.getLastToken(ast, {
                filter() { assert.fail("Unexpected call to filter callback"); },
            });
            assert.strictEqual(token, null);
        });

        it("should return null if the source is empty", () => {
            const { store: tokenStore, ast } = createTokenStore("");
            assert.strictEqual(tokenStore.getLastToken(ast), null);
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
            checkValue(store.getFirstTokenBetween(left, right), "=");
        });

        it("should retrieve one token between non-adjacent nodes with skip option", () => {
            checkValue(store.getFirstTokenBetween(left, right, 1), "a");
            checkValue(store.getFirstTokenBetween(left, right, { skip: 2 }), "*");
        });

        it("should return null if it's skipped beyond the right token", () => {
            assert.strictEqual(store.getFirstTokenBetween(left, right, { skip: 3 }), null);
            assert.strictEqual(store.getFirstTokenBetween(left, right, { skip: 4 }), null);
        });

        it("should retrieve the first matched token between non-adjacent nodes with filter option", () => {
            checkValue(
                store.getFirstTokenBetween(left, right, { filter: t => t.type !== "Identifier" }),
                "=",
            );
        });

        it("should retrieve first token or comment between non-adjacent nodes with includeComments option", () => {
            checkValue(store.getFirstTokenBetween(left, right, { includeComments: true }), "B");
        });

        it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip options", () => {
            checkValue(
                store.getFirstTokenBetween(left, right, { includeComments: true, skip: 1 }),
                "=",
            );
        });

        it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip and filter options", () => {
            checkValue(
                store.getFirstTokenBetween(left, right, {
                    includeComments: true,
                    skip: 1,
                    filter: t => t.type !== "Punctuator",
                }),
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
            checkValue(store.getLastTokenBetween(left, right), "*");
        });

        it("should retrieve one token between non-adjacent nodes with skip option", () => {
            checkValue(store.getLastTokenBetween(left, right, 1), "a");
            checkValue(store.getLastTokenBetween(left, right, { skip: 2 }), "=");
        });

        it("should return null if it's skipped beyond the right token", () => {
            assert.strictEqual(store.getLastTokenBetween(left, right, { skip: 3 }), null);
            assert.strictEqual(store.getLastTokenBetween(left, right, { skip: 4 }), null);
        });

        it("should retrieve the last matched token between non-adjacent nodes with filter option", () => {
            checkValue(
                store.getLastTokenBetween(left, right, { filter: t => t.type !== "Identifier" }),
                "*",
            );
        });

        it("should retrieve last token or comment between non-adjacent nodes with includeComments option", () => {
            checkValue(store.getLastTokenBetween(left, right, { includeComments: true }), "*");
        });

        it("should retrieve last token or comment between non-adjacent nodes with includeComments and skip options", () => {
            checkValue(
                store.getLastTokenBetween(left, right, { includeComments: true, skip: 1 }),
                "D",
            );
        });

        it("should retrieve last token or comment between non-adjacent nodes with includeComments and skip and filter options", () => {
            checkValue(
                store.getLastTokenBetween(left, right, {
                    includeComments: true,
                    skip: 1,
                    filter: t => t.type !== "Punctuator",
                }),
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
     * Helper to collect all tokens by traversing forward or backward.
     * @param {TokenStore} tokenStore The token store.
     * @param {Token} startToken Starting token.
     * @param {"after"|"before"} direction Direction to traverse.
     * @returns {Token[]} Collected tokens.
     */
    function collectTokens(tokenStore, startToken, direction) {
        const tokens = [];
        let token = startToken;
        const getNext = direction === "after"
            ? t => tokenStore.getTokenAfter(t, { includeComments: true })
            : t => tokenStore.getTokenBefore(t, { includeComments: true });

        while (token) {
            tokens.push(token);
            token = getNext(token);
        }
        return tokens;
    }

    const traversalExpected = [
        "(", "function", "(", "a", ",", "b,", "c", ")", "{", "}", ")",
    ];

    describe("when calling getFirstToken & getTokenAfter", () => {
        [
            { code: "(function(a, /*b,*/ c){})", desc: "with spaces" },
            { code: "(function(a,/*b,*/c){})", desc: "no spaces" },
        ].forEach(({ code, desc }) => {
            it(`should retrieve all tokens and comments in the node (${desc})`, () => {
                const { store: tokenStore, ast } = createTokenStore(code);
                const tokens = collectTokens(tokenStore, tokenStore.getFirstToken(ast), "after");
                check(tokens, traversalExpected);
            });
        });
    });

    describe("when calling getLastToken & getTokenBefore", () => {
        [
            { code: "(function(a, /*b,*/ c){})", desc: "with spaces" },
            { code: "(function(a,/*b,*/c){})", desc: "no spaces" },
        ].forEach(({ code, desc }) => {
            it(`should retrieve all tokens and comments in the node (${desc})`, () => {
                const { store: tokenStore, ast } = createTokenStore(code);
                const tokens = collectTokens(tokenStore, tokenStore.getLastToken(ast), "before");
                check(tokens.reverse(), traversalExpected);
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
            checkValue(store.getCommentsBefore(VariableDeclaration)[0], "A");
        });

        it("should retrieve comments before a token", () => {
            checkValue(store.getCommentsBefore(TOKENS[2])[0], "B");
        });

        it("should retrieve multiple comments before a node", () => {
            const comments = store.getCommentsBefore(CallExpression);
            assert.strictEqual(comments.length, 2);
            checkValue(comments[0], "E");
            checkValue(comments[1], "F");
        });

        it("should return an empty array for a Program node", () => {
            check(store.getCommentsBefore(Program), []);
        });

        it("should return an empty array if there are no comments before a node or token", () => {
            check(store.getCommentsBefore(BinaryExpression.right), []);
            check(store.getCommentsBefore(TOKENS[1]), []);
        });

        it("should retrieve no comments before Program when it starts with whitespace and a comment", () => {
            const { store: tokenStore, ast } = createTokenStore(" /*comment*/ bar");
            check(tokenStore.getCommentsBefore(ast), []);
        });
    });

    describe("getCommentsAfter", () => {
        it("should retrieve comments after a node", () => {
            checkValue(store.getCommentsAfter(VariableDeclarator.id)[0], "B");
        });

        it("should retrieve comments after a token", () => {
            checkValue(store.getCommentsAfter(TOKENS[2])[0], "C");
        });

        it("should retrieve multiple comments after a node", () => {
            const comments = store.getCommentsAfter(VariableDeclaration);
            assert.strictEqual(comments.length, 2);
            checkValue(comments[0], "E");
            checkValue(comments[1], "F");
        });

        it("should return an empty array for a Program node", () => {
            check(store.getCommentsAfter(Program), []);
        });

        it("should return an empty array if there are no comments after a node or token", () => {
            check(store.getCommentsAfter(CallExpression.callee), []);
            check(store.getCommentsAfter(TOKENS[0]), []);
        });

        it("should retrieve no comments after Program when it ends with a comment and whitespace", () => {
            const { store: tokenStore, ast } = createTokenStore("bar /*comment*/ ");
            check(tokenStore.getCommentsAfter(ast), []);
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

1. **`createTokenStore` helper**: Eliminates repeated `espree.parse` + `new TokenStore` boilerplate across ~30 tests.

2. **`checkValue` helper**: Reduces verbose `assert.strictEqual(token.value, ...)` to a single call.

3. **`collectTokens` helper**: Extracts the forward/backward token traversal loop shared by 4 tests.

4. **Data-driven tests with `forEach`**: Groups repetitive parametric tests (e.g., null-before/after-Program cases, program-start/end cases) into table-driven loops, reducing ~40 near-identical test blocks.

5. **Extracted local variables**: `left`/`right` aliases for `VariableDeclarator.id`/`BinaryExpression.right` in `Between` suites, and `id` in `getTokensAfter`/`getTokenAfter` suites, eliminating repetition.

6. **Shared `traversalExpected` constant**: The expected token array used in 4 traversal tests is defined once.

7. **Inlined single-use variables**: Removed unnecessary intermediate variables where the value is used only once.