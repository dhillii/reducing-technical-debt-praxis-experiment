# Refactored TokenStore Tests

The main complexity issues are:
1. **Repetitive inline token store creation** (parse → create store → test) duplicated dozens of times
2. **Verbose assertion patterns** for single-value checks
3. **Duplicated test logic** for "with spaces" / "no spaces" variants
4. **Long option objects** repeated verbatim across similar tests

## Refactoring Strategy

- Extract helper factories for common inline parse+store patterns
- Create assertion helpers for single-token value checks
- Consolidate parametric tests using `forEach`/data tables
- Group related single-value assertions into one `it` block where semantically appropriate

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
 * Parses code and creates a TokenStore from the result.
 * @param {string} code Source code to parse.
 * @returns {{ ast: Object, tokenStore: TokenStore }}
 */
function parseAndCreateStore(code) {
    const ast = espree.parse(code, DEFAULT_CONFIG);
    return { ast, tokenStore: new TokenStore(ast.tokens, ast.comments) };
}

/**
 * Asserts a single token's value.
 * @param {Token} token
 * @param {string} expected
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

        it("should retrieve matched tokens and comments with includeComments and filter options", () => {
            check(
                store.getTokens(Program, {
                    includeComments: true,
                    filter: t => t.type.startsWith("Block"),
                }),
                ["A", "B", "C", "D", "E", "Z"],
            );
        });

        it("should retrieve all tokens and comments for binary expression with includeComments option", () => {
            check(
                store.getTokens(BinaryExpression, { includeComments: true }),
                ["a", "D", "*", "b"],
            );
        });

        it("should retrieve tokens from Program with leading and trailing comments and whitespace", () => {
            const { ast, tokenStore } = parseAndCreateStore(" /*A*/ bar /*Z*/ ");

            check(tokenStore.getTokens(ast), ["bar"]);
            check(tokenStore.getTokens(ast, { includeComments: true }), ["A", "bar", "Z"]);
        });
    });

    describe("when calling getTokensBefore", () => {
        const BEFORE_BINARY = [
            { count: 0, expected: [] },
            { count: 1, expected: ["="] },
            { count: 2, expected: ["answer", "="] },
            { count: 9e9, expected: ["var", "answer", "="] },
        ];

        BEFORE_BINARY.forEach(({ count, expected }) => {
            it(`should retrieve ${expected.length} token(s) before a node (count=${count})`, () => {
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

        [
            { desc: "whitespace", code: " bar", opts: 1 },
            { desc: "a comment", code: "/*comment*/ bar", opts: 1 },
            {
                desc: "whitespace and a comment",
                code: " /*comment*/ bar",
                opts: { count: 1, includeComments: true },
            },
        ].forEach(({ desc, code, opts }) => {
            it(`should retrieve no tokens before Program when it starts with ${desc}`, () => {
                const { ast, tokenStore } = parseAndCreateStore(code);
                check(tokenStore.getTokensBefore(ast, opts), []);
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

        it("should retrieve one token or comment before a node with includeComments, skip, and filter options", () => {
            checkValue(
                store.getTokenBefore(BinaryExpression, {
                    includeComments: true,
                    skip: 1,
                    filter: t => t.type.startsWith("Block"),
                }),
                "B",
            );
        });

        it("should retrieve the previous node if the comment at the end of source code is specified", () => {
            const { ast, tokenStore } = parseAndCreateStore("a + b /*comment*/");
            checkValue(tokenStore.getTokenBefore(ast.comments[0]), "b");
        });

        it("should retrieve the previous comment if the first token is specified", () => {
            const { ast, tokenStore } = parseAndCreateStore("/*comment*/ a + b");
            checkValue(
                tokenStore.getTokenBefore(ast.tokens[0], { includeComments: true }),
                "comment",
            );
        });

        it("should retrieve null if the first comment is specified", () => {
            const { ast, tokenStore } = parseAndCreateStore("/*comment*/ a + b");
            assert.strictEqual(
                tokenStore.getTokenBefore(ast.comments[0], { includeComments: true }),
                null,
            );
        });

        [
            { desc: "whitespace", code: " bar", opts: undefined },
            { desc: "a comment", code: "/*comment*/ bar", opts: undefined },
            {
                desc: "whitespace and a comment",
                code: " /*comment*/ bar",
                opts: { includeComments: true },
            },
        ].forEach(({ desc, code, opts }) => {
            it(`should retrieve null before Program when it starts with ${desc}`, () => {
                const { ast, tokenStore } = parseAndCreateStore(code);
                assert.strictEqual(tokenStore.getTokenBefore(ast, opts), null);
            });
        });
    });

    describe("when calling getTokensAfter", () => {
        const id = VariableDeclarator.id;

        const AFTER_ID = [
            { count: 0, expected: [] },
            { count: 1, expected: ["="] },
            { count: 2, expected: ["=", "a"] },
            { count: 9e9, expected: ["=", "a", "*", "b", "call", "(", ")", ";"] },
        ];

        AFTER_ID.forEach(({ count, expected }) => {
            it(`should retrieve ${expected.length} token(s) after a node (count=${count})`, () => {
                check(store.getTokensAfter(id, count), expected);
            });
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

        it("should retrieve matched tokens and comments after a node with includeComments, count, and filter options", () => {
            check(
                store.getTokensAfter(id, {
                    includeComments: true,
                    count: 3,
                    filter: t => t.type.startsWith("Block"),
                }),
                ["B", "C", "D"],
            );
        });

        [
            { desc: "whitespace", code: "bar ", opts: 1 },
            { desc: "a comment", code: "bar /*comment*/", opts: 1 },
            {
                desc: "a comment and whitespace",
                code: "bar /*comment*/ ",
                opts: { count: 1, includeComments: true },
            },
        ].forEach(({ desc, code, opts }) => {
            it(`should retrieve no tokens after Program when it ends with ${desc}`, () => {
                const { ast, tokenStore } = parseAndCreateStore(code);
                check(tokenStore.getTokensAfter(ast, opts), []);
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

        it("should retrieve one token or comment after a node with includeComments, skip, and filter options", () => {
            checkValue(
                store.getTokenAfter(id, {
                    includeComments: true,
                    skip: 2,
                    filter: t => t.type.startsWith("Block"),
                }),
                "D",
            );
        });

        it("should retrieve the next node if the comment at the first of source code is specified", () => {
            const { ast, tokenStore } = parseAndCreateStore("/*comment*/ a + b");
            checkValue(tokenStore.getTokenAfter(ast.comments[0]), "a");
        });

        it("should retrieve the next comment if the last token is specified", () => {
            const { ast, tokenStore } = parseAndCreateStore("a + b /*comment*/");
            checkValue(
                tokenStore.getTokenAfter(ast.tokens[2], { includeComments: true }),
                "comment",
            );
        });

        it("should retrieve null if the last comment is specified", () => {
            const { ast, tokenStore } = parseAndCreateStore("a + b /*comment*/");
            assert.strictEqual(
                tokenStore.getTokenAfter(ast.comments[0], { includeComments: true }),
                null,
            );
        });

        [
            { desc: "whitespace", code: "bar ", opts: undefined },
            { desc: "a comment", code: "bar /*comment*/", opts: undefined },
            {
                desc: "a comment and whitespace",
                code: "bar /*comment*/ ",
                opts: { includeComments: true },
            },
        ].forEach(({ desc, code, opts }) => {
            it(`should retrieve null after Program when it ends with ${desc}`, () => {
                const { ast, tokenStore } = parseAndCreateStore(code);
                assert.strictEqual(tokenStore.getTokenAfter(ast, opts), null);
            });
        });
    });

    describe("when calling getFirstTokens", () => {
        const FIRST_TOKENS = [
            { count: 0, expected: [] },
            { count: 1, expected: ["a"] },
            { count: 2, expected: ["a", "*"] },
            { count: 9e9, expected: ["a", "*", "b"] },
        ];

        FIRST_TOKENS.forEach(({ count, expected }) => {
            it(`should retrieve ${expected.length} first token(s) from a node's token stream (count=${count})`, () => {
                check(store.getFirstTokens(BinaryExpression, count), expected);
            });
        });

        it("should retrieve more than one token with count option", () => {
            check(store.getFirstTokens(BinaryExpression, { count: 2 }), ["a", "*"]);
        });

        it("should retrieve matched tokens with filter option", () => {
            const identifierFilter = t => t.type === "Identifier";
            const expected = ["a", "b"];

            check(store.getFirstTokens(BinaryExpression, identifierFilter), expected);
            check(store.getFirstTokens(BinaryExpression, { filter: identifierFilter }), expected);
        });

        it("should retrieve matched tokens with filter and count options", () => {
            check(
                store.getFirstTokens(BinaryExpression, {
                    count: 1,
                    filter: t => t.type === "Identifier",
                }),
                ["a"],
            );
        });

        it("should retrieve all tokens and comments with includeComments option", () => {
            check(
                store.getFirstTokens(BinaryExpression, { includeComments: true }),
                ["a", "D", "*", "b"],
            );
        });

        it("should retrieve several tokens and comments with includeComments and count options", () => {
            check(
                store.getFirstTokens(BinaryExpression, { includeComments: true, count: 3 }),
                ["a", "D", "*"],
            );
        });

        it("should retrieve several tokens and comments with includeComments, count, and filter options", () => {
            check(
                store.getFirstTokens(BinaryExpression, {
                    includeComments: true,
                    count: 3,
                    filter: t => t.value !== "a",
                }),
                ["D", "*", "b"],
            );
        });

        [
            { desc: "whitespace", code: " bar", opts: 1, expected: ["bar"] },
            { desc: "a comment", code: "/*comment*/ bar", opts: 1, expected: ["bar"] },
            {
                desc: "whitespace and a comment",
                code: " /*comment*/ bar",
                opts: { count: 2, includeComments: true },
                expected: ["comment", "bar"],
            },
        ].forEach(({ desc, code, opts, expected }) => {
            it(`should retrieve the first token(s) from Program when it starts with ${desc}`, () => {
                const { ast, tokenStore } = parseAndCreateStore(code);
                check(tokenStore.getFirstTokens(ast, opts), expected);
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

        it("should retrieve the first token or comment with includeComments option", () => {
            checkValue(store.getFirstToken(BinaryExpression, { includeComments: true }), "a");
        });

        it("should retrieve the first matched token or comment with includeComments and skip options", () => {
            checkValue(
                store.getFirstToken(BinaryExpression, { includeComments: true, skip: 1 }),
                "D",
            );
        });

        it("should retrieve the first matched token or comment with includeComments, skip, and filter options", () => {
            checkValue(
                store.getFirstToken(BinaryExpression, {
                    includeComments: true,
                    skip: 1,
                    filter: t => t.value !== "a",
                }),
                "*",
            );
        });

        it("should retrieve the first comment if the comment is at the start of a node range", () => {
            const { ast, tokenStore } = parseAndCreateStore("a + b\n/*comment*/ c + d");
            const token = tokenStore.getFirstToken(
                { range: [ast.comments[0].range[0], ast.tokens[5].range[1]] },
                { includeComments: true },
            );
            checkValue(token, "comment");
        });

        it("should retrieve the first token (without includeComments) if the comment is at the start of a node range", () => {
            const { ast, tokenStore } = parseAndCreateStore("a + b\n/*comment*/ c + d");
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
            const { ast, tokenStore } = parseAndCreateStore("// comment");
            const token = tokenStore.getFirstToken(ast, {
                filter() { assert.fail("Unexpected call to filter callback"); },
            });
            assert.strictEqual(token, null);
        });

        it("should return null if the source is empty", () => {
            const { ast, tokenStore } = parseAndCreateStore("");
            assert.strictEqual(tokenStore.getFirstToken(ast), null);
        });

        [
            { desc: "whitespace", code: " bar", opts: undefined, expected: "bar" },
            { desc: "a comment", code: "/*comment*/ bar", opts: undefined, expected: "bar" },
            {
                desc: "whitespace and a comment",
                code: " /*comment*/ bar",
                opts: { includeComments: true },
                expected: "comment",
            },
        ].forEach(({ desc, code, opts, expected }) => {
            it(`should retrieve the first token from Program when it starts with ${desc}`, () => {
                const { ast, tokenStore } = parseAndCreateStore(code);
                checkValue(tokenStore.getFirstToken(ast, opts), expected);
            });
        });
    });

    describe("when calling getLastTokens", () => {
        const LAST_TOKENS = [
            { count: 0, expected: [] },
            { count: 1, expected: ["b"] },
            { count: 2, expected: ["*", "b"] },
            { count: 9e9, expected: ["a", "*", "b"] },
        ];

        LAST_TOKENS.forEach(({ count, expected }) => {
            it(`should retrieve ${expected.length} last token(s) from a node's token stream (count=${count})`, () => {
                check(store.getLastTokens(BinaryExpression, count), expected);
            });
        });

        it("should retrieve more than one token with count option", () => {
            check(store.getLastTokens(BinaryExpression, { count: 2 }), ["*", "b"]);
        });

        it("should retrieve matched tokens with filter option", () => {
            const identifierFilter = t => t.type === "Identifier";
            const expected = ["a", "b"];

            check(store.getLastTokens(BinaryExpression, identifierFilter), expected);
            check(store.getLastTokens(BinaryExpression, { filter: identifierFilter }), expected);
        });

        it("should retrieve matched tokens with filter and count options", () => {
            check(
                store.getLastTokens(BinaryExpression, {
                    count: 1,
                    filter: t => t.type === "Identifier",
                }),
                ["b"],
            );
        });

        it("should retrieve all tokens and comments with includeComments option", () => {
            check(
                store.getLastTokens(BinaryExpression, { includeComments: true }),
                ["a", "D", "*", "b"],
            );
        });

        it("should retrieve matched tokens with includeComments and count options", () => {
            check(
                store.getLastTokens(BinaryExpression, { includeComments: true, count: 3 }),
                ["D", "*", "b"],
            );
        });

        it("should retrieve matched tokens with includeComments, count, and filter options", () => {
            check(
                store.getLastTokens(BinaryExpression, {
                    includeComments: true,
                    count: 3,
                    filter: t => t.type !== "Punctuator",
                }),
                ["a", "D", "b"],
            );
        });

        [
            { desc: "whitespace", code: "bar ", opts: 1, expected: ["bar"] },
            { desc: "a comment", code: "bar /*comment*/", opts: 1, expected: ["bar"] },
            {
                desc: "a comment and whitespace",
                code: "bar /*comment*/ ",
                opts: { count: 2, includeComments: true },
                expected: ["bar", "comment"],
            },
        ].forEach(({ desc, code, opts, expected }) => {
            it(`should retrieve the last token(s) from Program when it ends with ${desc}`, () => {
                const { ast, tokenStore } = parseAndCreateStore(code);
                check(tokenStore.getLastTokens(ast, opts), expected);
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

        it("should retrieve the last matched token with filter option", () => {
            const notBFilter = t => t.value !== "b";
            checkValue(store.getLastToken(BinaryExpression, notBFilter), "*");
            checkValue(store.getLastToken(BinaryExpression, { filter: notBFilter }), "*");
        });

        it("should retrieve the last matched token with filter and skip options", () => {
            checkValue(
                store.getLastToken(BinaryExpression, {
                    skip: 1,
                    filter: t => t.type === "Identifier",
                }),
                "a",
            );
        });

        it("should retrieve the last token with includeComments option", () => {
            checkValue(store.getLastToken(BinaryExpression, { includeComments: true }), "b");
        });

        it("should retrieve the last token with includeComments and skip options", () => {
            checkValue(
                store.getLastToken(BinaryExpression, { includeComments: true, skip: 2 }),
                "D",
            );
        });

        it("should retrieve the last token with includeComments, skip, and filter options", () => {
            checkValue(
                store.getLastToken(BinaryExpression, {
                    includeComments: true,
                    skip: 1,
                    filter: t => t.type !== "Identifier",
                }),
                "D",
            );
        });

        it("should retrieve the last comment if the comment is at the end of a node range", () => {
            const { ast, tokenStore } = parseAndCreateStore("a + b /*comment*/\nc + d");
            const token = tokenStore.getLastToken(
                { range: [ast.tokens[0].range[0], ast.comments[0].range[1]] },
                { includeComments: true },
            );
            checkValue(token, "comment");
        });

        it("should retrieve the last token (without includeComments) if the comment is at the end of a node range", () => {
            const { ast, tokenStore } = parseAndCreateStore("a + b /*comment*/\nc + d");
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

        it("should return null if the source contains only comments", () => {
            const { ast, tokenStore } = parseAndCreateStore("// comment");
            const token = tokenStore.getLastToken(ast, {
                filter() { assert.fail("Unexpected call to filter callback"); },
            });
            assert.strictEqual(token, null);
        });

        it("should return null if the source is empty", () => {
            const { ast, tokenStore } = parseAndCreateStore("");
            assert.strictEqual(tokenStore.getLastToken(ast), null);
        });

        [
            { desc: "whitespace", code: "bar ", opts: undefined, expected: "bar" },
            { desc: "a comment", code: "bar /*comment*/", opts: undefined, expected: "bar" },
            {
                desc: "a comment and whitespace",
                code: "bar /*comment*/ ",
                opts: { includeComments: true },
                expected: "comment",
            },
        ].forEach(({ desc, code, opts, expected }) => {
            it(`should retrieve the last token from Program when it ends with ${desc}`, () => {
                const { ast, tokenStore } = parseAndCreateStore(code);
                checkValue(tokenStore.getLastToken(ast, opts), expected);
            });
        });
    });

    describe("when calling getFirstTokensBetween", () => {
        const left = VariableDeclarator.id;
        const right = BinaryExpression.right;

        it("should retrieve zero tokens between adjacent nodes", () => {
            check(store.getFirstTokensBetween(BinaryExpression, CallExpression), []);
        });

        it("should retrieve multiple tokens between non-adjacent nodes with count option", () => {
            check(store.getFirstTokensBetween(left, right, 2), ["=", "a"]);
            check(store.getFirstTokensBetween(left, right, { count: 2 }), ["=", "a"]);
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

        it("should return null if skipped beyond the right token", () => {
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

        it("should retrieve first token or comment with includeComments and skip options", () => {
            checkValue(
                store.getFirstTokenBetween(left, right, { includeComments: true, skip: 1 }),
                "=",
            );
        });

        it("should retrieve first token or comment with includeComments, skip, and filter options", () => {
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
            check(store.getLastTokensBetween(left, right, 2), ["a", "*"]);
            check(store.getLastTokensBetween(left, right, { count: 2 }), ["a", "*"]);
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

        it("should retrieve multiple tokens and comments with includeComments and filter options", () => {
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

        it("should return null if skipped beyond the right token", () => {
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

        it("should retrieve last token or comment with includeComments and skip options", () => {
            checkValue(
                store.getLastTokenBetween(left, right, { includeComments: true, skip: 1 }),
                "D",
            );
        });

        it("should retrieve last token or comment with includeComments, skip, and filter options", () => {
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

        it("should not return a comment token when includeComments is false", () => {
            assert.isNull(store.getTokenByRangeStart(15, { includeComments: false }));
        });

        it("should not return comment tokens by default", () => {
            assert.isNull(store.getTokenByRangeStart(15));
        });
    });

    /**
     * Helper for traversal tests using getFirstToken + getTokenAfter or
     * getLastToken + getTokenBefore.
     */
    function collectTokensForward(tokenStore, ast) {
        const tokens = [];
        let token = tokenStore.getFirstToken(ast);
        while (token) {
            tokens.push(token);
            token = tokenStore.getTokenAfter(token, { includeComments: true });
        }
        return tokens;
    }

    function collectTokensBackward(tokenStore, ast) {
        const tokens = [];
        let token = tokenStore.getLastToken(ast);
        while (token) {
            tokens.push(token);
            token = tokenStore.getTokenBefore(token, { includeComments: true });
        }
        return tokens.reverse();
    }

    const TRAVERSAL_EXPECTED = [
        "(", "function", "(", "a", ",", "b,", "c", ")", "{", "}", ")",
    ];

    describe("when calling getFirstToken & getTokenAfter", () => {
        [
            { desc: "with spaces", code: "(function(a, /*b,*/ c){})" },
            { desc: "no spaces", code: "(function(a,/*b,*/c){})" },
        ].forEach(({ desc, code }) => {
            it(`should retrieve all tokens and comments in the node (${desc})`, () => {
                const { ast, tokenStore } = parseAndCreateStore(code);
                check(collectTokensForward(tokenStore, ast), TRAVERSAL_EXPECTED);
            });
        });
    });

    describe("when calling getLastToken & getTokenBefore", () => {
        [
            { desc: "with spaces", code: "(function(a, /*b,*/ c){})" },
            { desc: "no spaces", code: "(function(a,/*b,*/c){})" },
        ].forEach(({ desc, code }) => {
            it(`should retrieve all tokens and comments in the node (${desc})`, () => {
                const { ast, tokenStore } = parseAndCreateStore(code);
                check(collectTokensBackward(tokenStore, ast), TRAVERSAL_EXPECTED);
            });
        });
    });

    describe("commentsExistBetween", () => {
        it("should return false if comments don't exist between tokens", () => {
            assert.isFalse(store.commentsExistBetween(AST.tokens[0], AST.tokens[1]));
        });

        it("should return true if comments exist between tokens", () => {
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
            const { ast, tokenStore } = parseAndCreateStore(" /*comment*/ bar");
            check(tokenStore.getCommentsBefore(ast), []);
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
            const { ast, tokenStore } = parseAndCreateStore("bar /*comment*/ ");
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

## Key Refactoring Changes

| Technique | Applied To |
|-----------|-----------|
| **`parseAndCreateStore` factory** | Eliminated ~40 repetitive `espree.parse` + `new TokenStore` blocks |
| **`checkValue` helper** | Replaced verbose `assert.strictEqual(token.value, x)` patterns |
| **`forEach` data tables** | Consolidated count-variant tests (`getTokensBefore`, `getTokensAfter`, `getFirstTokens`, `getLastTokens`) and Program boundary tests |
| **Shared `left`/`right` variables** | Reduced repetition in `*Between` describe blocks |
| **`collectTokensForward/Backward` helpers** | Extracted traversal loop logic shared across 4 tests |
| **Consolidated filter aliases** | Extracted repeated filter lambdas (`identifierFilter`, `notBFilter`) |
| **Merged semantically equivalent assertions** | Combined dual-form tests (function vs object option) into single `it` blocks |