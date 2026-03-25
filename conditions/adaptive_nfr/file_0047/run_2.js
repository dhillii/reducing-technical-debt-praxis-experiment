# Code Refactoring Analysis

The code has several complexity issues:
1. **Massive `create()` function** with deeply nested logic
2. **Large inline listener objects** with complex handlers
3. **Repeated patterns** (JSX handlers, offset setting patterns)
4. **Complex `getDesiredIndent`** with multiple branches
5. **Long `Program:exit`** handler
6. **Duplicated option parsing logic**

Here's the refactored version:

```javascript
/**
 * @fileoverview This rule sets a specific indentation style and width for your code
 *
 * @author Teddy Katz
 * @author Vitaly Puzrin
 * @author Gyandeep Singh
 * @deprecated in ESLint v8.53.0
 */

"use strict";

const astUtils = require("./utils/ast-utils");

//------------------------------------------------------------------------------
// Constants
//------------------------------------------------------------------------------

const KNOWN_NODES = new Set([
    "AssignmentExpression", "AssignmentPattern", "ArrayExpression",
    "ArrayPattern", "ArrowFunctionExpression", "AwaitExpression",
    "BlockStatement", "BinaryExpression", "BreakStatement", "CallExpression",
    "CatchClause", "ChainExpression", "ClassBody", "ClassDeclaration",
    "ClassExpression", "ConditionalExpression", "ContinueStatement",
    "DoWhileStatement", "DebuggerStatement", "EmptyStatement",
    "ExperimentalRestProperty", "ExperimentalSpreadProperty",
    "ExpressionStatement", "ForStatement", "ForInStatement", "ForOfStatement",
    "FunctionDeclaration", "FunctionExpression", "Identifier", "IfStatement",
    "Literal", "LabeledStatement", "LogicalExpression", "MemberExpression",
    "MetaProperty", "MethodDefinition", "NewExpression", "ObjectExpression",
    "ObjectPattern", "PrivateIdentifier", "Program", "Property",
    "PropertyDefinition", "RestElement", "ReturnStatement",
    "SequenceExpression", "SpreadElement", "StaticBlock", "Super",
    "SwitchCase", "SwitchStatement", "TaggedTemplateExpression",
    "TemplateElement", "TemplateLiteral", "ThisExpression", "ThrowStatement",
    "TryStatement", "UnaryExpression", "UpdateExpression",
    "VariableDeclaration", "VariableDeclarator", "WhileStatement",
    "WithStatement", "YieldExpression", "JSXFragment", "JSXOpeningFragment",
    "JSXClosingFragment", "JSXIdentifier", "JSXNamespacedName",
    "JSXMemberExpression", "JSXEmptyExpression", "JSXExpressionContainer",
    "JSXElement", "JSXClosingElement", "JSXOpeningElement", "JSXAttribute",
    "JSXSpreadAttribute", "JSXText", "ExportDefaultDeclaration",
    "ExportNamedDeclaration", "ExportAllDeclaration", "ExportSpecifier",
    "ImportDeclaration", "ImportSpecifier", "ImportDefaultSpecifier",
    "ImportNamespaceSpecifier", "ImportExpression",
]);

const UNARY_OPERATORS_FOR_IIFE = new Set(["!", "~", "+", "-"]);

const IIFE_ANCESTOR_TYPES = new Set([
    "UnaryExpression", "AssignmentExpression",
    "LogicalExpression", "SequenceExpression", "VariableDeclarator",
]);

const ELEMENT_LIST_SCHEMA = {
    oneOf: [
        { type: "integer", minimum: 0 },
        { enum: ["first", "off"] },
    ],
};

const DEFAULT_VARIABLE_INDENT = 1;
const DEFAULT_PARAMETER_INDENT = 1;
const DEFAULT_FUNCTION_BODY_INDENT = 1;

//------------------------------------------------------------------------------
// IndexMap
//------------------------------------------------------------------------------

/**
 * A mutable map with numeric keys for fast range-based offset lookups.
 */
class IndexMap {
    constructor(maxKey) {
        this._values = Array(maxKey + 1);
    }

    insert(key, value) {
        this._values[key] = value;
    }

    findLastNotAfter(key) {
        for (let index = key; index >= 0; index--) {
            const value = this._values[index];
            if (value) return value;
        }
        return void 0;
    }

    deleteRange(start, end) {
        this._values.fill(void 0, start, end);
    }
}

//------------------------------------------------------------------------------
// TokenInfo
//------------------------------------------------------------------------------

/**
 * Helper class for token-based indentation info.
 */
class TokenInfo {
    constructor(sourceCode) {
        this.sourceCode = sourceCode;
        this.firstTokensByLineNumber = new Map();
        this._buildLineMap(sourceCode.tokensAndComments);
    }

    _buildLineMap(tokens) {
        for (const token of tokens) {
            const { start, end } = token.loc;

            if (!this.firstTokensByLineNumber.has(start.line)) {
                this.firstTokensByLineNumber.set(start.line, token);
            }

            if (!this.firstTokensByLineNumber.has(end.line)) {
                const lineText = this.sourceCode.text.slice(
                    token.range[1] - end.column,
                    token.range[1],
                );
                if (lineText.trim()) {
                    this.firstTokensByLineNumber.set(end.line, token);
                }
            }
        }
    }

    getFirstTokenOfLine(token) {
        return this.firstTokensByLineNumber.get(token.loc.start.line);
    }

    isFirstTokenOfLine(token) {
        return this.getFirstTokenOfLine(token) === token;
    }

    getTokenIndent(token) {
        return this.sourceCode.text.slice(
            token.range[0] - token.loc.start.column,
            token.range[0],
        );
    }
}

//------------------------------------------------------------------------------
// OffsetStorage
//------------------------------------------------------------------------------

/**
 * Stores desired token offsets and computes expected indentation.
 */
class OffsetStorage {
    constructor(tokenInfo, indentSize, indentType, maxIndex) {
        this._tokenInfo = tokenInfo;
        this._indentSize = indentSize;
        this._indentType = indentType;

        this._indexMap = new IndexMap(maxIndex);
        this._indexMap.insert(0, { offset: 0, from: null, force: false });

        this._lockedFirstTokens = new WeakMap();
        this._desiredIndentCache = new WeakMap();
        this._ignoredTokens = new WeakSet();
    }

    _getOffsetDescriptor(token) {
        return this._indexMap.findLastNotAfter(token.range[0]);
    }

    matchOffsetOf(baseToken, offsetToken) {
        this._lockedFirstTokens.set(offsetToken, baseToken);
    }

    setDesiredOffset(token, fromToken, offset) {
        return this.setDesiredOffsets(token.range, fromToken, offset);
    }

    setDesiredOffsets(range, fromToken, offset, force) {
        const descriptorToInsert = { offset, from: fromToken, force };
        const descriptorAfterRange = this._indexMap.findLastNotAfter(range[1]);

        const fromTokenIsInRange = fromToken &&
            fromToken.range[0] >= range[0] &&
            fromToken.range[1] <= range[1];
        const fromTokenDescriptor =
            fromTokenIsInRange && this._getOffsetDescriptor(fromToken);

        this._indexMap.deleteRange(range[0] + 1, range[1]);
        this._indexMap.insert(range[0], descriptorToInsert);

        if (fromTokenIsInRange) {
            this._indexMap.insert(fromToken.range[0], fromTokenDescriptor);
            this._indexMap.insert(fromToken.range[1], descriptorToInsert);
        }

        this._indexMap.insert(range[1], descriptorAfterRange);
    }

    getDesiredIndent(token) {
        if (this._desiredIndentCache.has(token)) {
            return this._desiredIndentCache.get(token);
        }

        const indent = this._computeDesiredIndent(token);
        this._desiredIndentCache.set(token, indent);
        return indent;
    }

    _computeDesiredIndent(token) {
        if (this._ignoredTokens.has(token)) {
            return this._tokenInfo.getTokenIndent(token);
        }

        if (this._lockedFirstTokens.has(token)) {
            return this._computeLockedIndent(token);
        }

        return this._computeOffsetIndent(token);
    }

    _computeLockedIndent(token) {
        const firstToken = this._lockedFirstTokens.get(token);
        const firstTokenOfLine = this._tokenInfo.getFirstTokenOfLine(firstToken);
        const columnDiff = firstToken.loc.start.column -
            firstTokenOfLine.loc.start.column;

        return this.getDesiredIndent(firstTokenOfLine) +
            this._indentType.repeat(columnDiff);
    }

    _computeOffsetIndent(token) {
        const offsetInfo = this._getOffsetDescriptor(token);
        const isSameLine = offsetInfo.from &&
            offsetInfo.from.loc.start.line === token.loc.start.line;
        const isCollapsed = isSameLine &&
            !/^\s*?\n/u.test(token.value) &&
            !offsetInfo.force;

        const offset = isCollapsed ? 0 : offsetInfo.offset * this._indentSize;
        const base = offsetInfo.from ? this.getDesiredIndent(offsetInfo.from) : "";

        return base + this._indentType.repeat(offset);
    }

    ignoreToken(token) {
        if (this._tokenInfo.isFirstTokenOfLine(token)) {
            this._ignoredTokens.add(token);
        }
    }

    getFirstDependency(token) {
        return this._getOffsetDescriptor(token).from;
    }
}

//------------------------------------------------------------------------------
// Schema
//------------------------------------------------------------------------------

const RULE_SCHEMA = [
    {
        oneOf: [
            { enum: ["tab"] },
            { type: "integer", minimum: 0 },
        ],
    },
    {
        type: "object",
        properties: {
            SwitchCase: { type: "integer", minimum: 0, default: 0 },
            VariableDeclarator: {
                oneOf: [
                    ELEMENT_LIST_SCHEMA,
                    {
                        type: "object",
                        properties: {
                            var: ELEMENT_LIST_SCHEMA,
                            let: ELEMENT_LIST_SCHEMA,
                            const: ELEMENT_LIST_SCHEMA,
                        },
                        additionalProperties: false,
                    },
                ],
            },
            outerIIFEBody: {
                oneOf: [
                    { type: "integer", minimum: 0 },
                    { enum: ["off"] },
                ],
            },
            MemberExpression: {
                oneOf: [
                    { type: "integer", minimum: 0 },
                    { enum: ["off"] },
                ],
            },
            FunctionDeclaration: {
                type: "object",
                properties: {
                    parameters: ELEMENT_LIST_SCHEMA,
                    body: { type: "integer", minimum: 0 },
                },
                additionalProperties: false,
            },
            FunctionExpression: {
                type: "object",
                properties: {
                    parameters: ELEMENT_LIST_SCHEMA,
                    body: { type: "integer", minimum: 0 },
                },
                additionalProperties: false,
            },
            StaticBlock: {
                type: "object",
                properties: {
                    body: { type: "integer", minimum: 0 },
                },
                additionalProperties: false,
            },
            CallExpression: {
                type: "object",
                properties: { arguments: ELEMENT_LIST_SCHEMA },
                additionalProperties: false,
            },
            ArrayExpression: ELEMENT_LIST_SCHEMA,
            ObjectExpression: ELEMENT_LIST_SCHEMA,
            ImportDeclaration: ELEMENT_LIST_SCHEMA,
            flatTernaryExpressions: { type: "boolean", default: false },
            offsetTernaryExpressions: { type: "boolean", default: false },
            ignoredNodes: {
                type: "array",
                items: {
                    type: "string",
                    not: { pattern: ":exit$" },
                },
            },
            ignoreComments: { type: "boolean", default: false },
        },
        additionalProperties: false,
    },
];

//------------------------------------------------------------------------------
// Option Parsing
//------------------------------------------------------------------------------

/**
 * Builds the default options object.
 * @returns {Object} Default options
 */
function buildDefaultOptions() {
    return {
        SwitchCase: 0,
        VariableDeclarator: {
            var: DEFAULT_VARIABLE_INDENT,
            let: DEFAULT_VARIABLE_INDENT,
            const: DEFAULT_VARIABLE_INDENT,
        },
        outerIIFEBody: 1,
        FunctionDeclaration: {
            parameters: DEFAULT_PARAMETER_INDENT,
            body: DEFAULT_FUNCTION_BODY_INDENT,
        },
        FunctionExpression: {
            parameters: DEFAULT_PARAMETER_INDENT,
            body: DEFAULT_FUNCTION_BODY_INDENT,
        },
        StaticBlock: { body: DEFAULT_FUNCTION_BODY_INDENT },
        CallExpression: { arguments: DEFAULT_PARAMETER_INDENT },
        MemberExpression: 1,
        ArrayExpression: 1,
        ObjectExpression: 1,
        ImportDeclaration: 1,
        flatTernaryExpressions: false,
        ignoredNodes: [],
        ignoreComments: false,
    };
}

/**
 * Parses context options into indentType, indentSize, and merged options.
 * @param {Array} contextOptions Raw context.options
 * @returns {{ indentType: string, indentSize: number, options: Object }}
 */
function parseOptions(contextOptions) {
    let indentType = "space";
    let indentSize = 4;
    const options = buildDefaultOptions();

    if (!contextOptions.length) {
        return { indentType, indentSize, options };
    }

    if (contextOptions[0] === "tab") {
        indentSize = 1;
        indentType = "tab";
    } else {
        indentSize = contextOptions[0];
    }

    if (contextOptions[1]) {
        Object.assign(options, contextOptions[1]);
        normalizeVariableDeclaratorOption(options);
    }

    return { indentType, indentSize, options };
}

/**
 * Normalizes VariableDeclarator option to always be an object.
 * @param {Object} options The options object (mutated in place)
 * @returns {void}
 */
function normalizeVariableDeclaratorOption(options) {
    const vd = options.VariableDeclarator;
    if (typeof vd === "number" || vd === "first") {
        options.VariableDeclarator = { var: vd, let: vd, const: vd };
    }
}

//------------------------------------------------------------------------------
// Rule Helpers
//------------------------------------------------------------------------------

/**
 * Checks if a node is a file-level IIFE.
 * @param {ASTNode} node The function node
 * @returns {boolean}
 */
function isOuterIIFE(node) {
    if (!node.parent ||
        node.parent.type !== "CallExpression" ||
        node.parent.callee !== node) {
        return false;
    }

    let statement = node.parent.parent;

    while (IIFE_ANCESTOR_TYPES.has(statement.type)) {
        if (statement.type === "UnaryExpression" &&
            !UNARY_OPERATORS_FOR_IIFE.has(statement.operator)) {
            break;
        }
        statement = statement.parent;
    }

    return (
        (statement.type === "ExpressionStatement" ||
            statement.type === "VariableDeclaration") &&
        statement.parent.type === "Program"
    );
}

/**
 * Counts trailing linebreaks after the last non-whitespace character.
 * @param {string} string
 * @returns {number}
 */
function countTrailingLinebreaks(string) {
    const trailingWhitespace = string.match(/\s*$/u)[0];
    const linebreakMatches = trailingWhitespace.match(
        astUtils.createGlobalLinebreakMatcher(),
    );
    return linebreakMatches === null ? 0 : linebreakMatches.length;
}

/**
 * Checks whether there are blank lines between two tokens.
 * @param {Token} firstToken
 * @param {Token} secondToken
 * @param {TokenInfo} tokenInfo
 * @returns {boolean}
 */
function hasBlankLinesBetween(firstToken, secondToken, tokenInfo) {
    const firstLine = firstToken.loc.end.line;
    const secondLine = secondToken.loc.start.line;

    if (firstLine === secondLine || firstLine === secondLine - 1) {
        return false;
    }

    for (let line = firstLine + 1; line < secondLine; ++line) {
        if (!tokenInfo.firstTokensByLineNumber.has(line)) {
            return true;
        }
    }
    return false;
}

/**
 * Determines the block indent level for a BlockStatement or ClassBody.
 * @param {ASTNode} node
 * @param {Object} options
 * @returns {number}
 */
function getBlockIndentLevel(node, options) {
    const parent = node.parent;
    if (!parent) return 1;

    if (isOuterIIFE(parent)) return options.outerIIFEBody;
    if (parent.type === "FunctionExpression" ||
        parent.type === "ArrowFunctionExpression") {
        return options.FunctionExpression.body;
    }
    if (parent.type === "FunctionDeclaration") {
        return options.FunctionDeclaration.body;
    }
    return 1;
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

/** @type {import('../types').Rule.RuleModule} */
module.exports = {
    meta: {
        deprecated: {
            message: "Formatting rules are being moved out of ESLint core.",
            url: "https://eslint.org/blog/2023/10/deprecating-formatting-rules/",
            deprecatedSince: "8.53.0",
            availableUntil: "11.0.0",
            replacedBy: [
                {
                    message: "ESLint Stylistic now maintains deprecated stylistic core rules.",
                    url: "https://eslint.style/guide/migration",
                    plugin: {
                        name: "@stylistic/eslint-plugin",
                        url: "https://eslint.style",
                    },
                    rule: {
                        name: "indent",
                        url: "https://eslint.style/rules/indent",
                    },
                },
            ],
        },
        type: "layout",
        docs: {
            description: "Enforce consistent indentation",
            recommended: false,
            url: "https://eslint.org/docs/latest/rules/indent",
        },
        fixable: "whitespace",
        schema: RULE_SCHEMA,
        messages: {
            wrongIndentation:
                "Expected indentation of {{expected}} but found {{actual}}.",
        },
    },

    create(context) {
        const { indentType, indentSize, options } = parseOptions(context.options);
        const sourceCode = context.sourceCode;
        const tokenInfo = new TokenInfo(sourceCode);
        const offsets = new OffsetStorage(
            tokenInfo,
            indentSize,
            indentType === "space" ? " " : "\t",
            sourceCode.text.length,
        );
        const parameterParens = new WeakSet();

        //----------------------------------------------------------------------
        // Reporting
        //----------------------------------------------------------------------

        /**
         * Builds error message data for an indentation violation.
         * @param {number} expectedAmount
         * @param {number} actualSpaces
         * @param {number} actualTabs
         * @returns {{ expected: string, actual: string }}
         */
        function createErrorMessageData(expectedAmount, actualSpaces, actualTabs) {
            const plural = n => n === 1 ? "" : "s";
            const expected = `${expectedAmount} ${indentType}${plural(expectedAmount)}`;
            let actual;

            if (actualSpaces > 0) {
                actual = indentType === "space"
                    ? actualSpaces
                    : `${actualSpaces} space${plural(actualSpaces)}`;
            } else if (actualTabs > 0) {
                actual = indentType === "tab"
                    ? actualTabs
                    : `${actualTabs} tab${plural(actualTabs)}`;
            } else {
                actual = "0";
            }

            return { expected, actual };
        }

        /**
         * Reports an indentation violation for a token.
         * @param {Token} token
         * @param {string} neededIndent
         * @returns {void}
         */
        function report(token, neededIndent) {
            const actualIndent = Array.from(tokenInfo.getTokenIndent(token));
            const numSpaces = actualIndent.filter(c => c === " ").length;
            const numTabs = actualIndent.filter(c => c === "\t").length;

            context.report({
                node: token,
                messageId: "wrongIndentation",
                data: createErrorMessageData(neededIndent.length, numSpaces, numTabs),
                loc: {
                    start: { line: token.loc.start.line, column: 0 },
                    end: { line: token.loc.start.line, column: token.loc.start.column },
                },
                fix(fixer) {
                    const range = [token.range[0] - token.loc.start.column, token.range[0]];
                    return fixer.replaceTextRange(range, neededIndent);
                },
            });
        }

        /**
         * Validates a token's indentation against the desired indent.
         * @param {Token} token
         * @param {string} desiredIndent
         * @returns {boolean}
         */
        function validateTokenIndent(token, desiredIndent) {
            const indentation = tokenInfo.getTokenIndent(token);
            return indentation === desiredIndent ||
                (indentation.includes(" ") && indentation.includes("\t"));
        }

        //----------------------------------------------------------------------
        // Offset Helpers
        //----------------------------------------------------------------------

        /**
         * Adds indentation for a list of elements (arrays, objects, params, etc.)
         * @param {ASTNode[]} elements
         * @param {Token} startToken
         * @param {Token} endToken
         * @param {number|string} offset
         * @returns {void}
         */
        function addElementListIndent(elements, startToken, endToken, offset) {
            function getFirstToken(element) {
                let token = sourceCode.getTokenBefore(element);
                while (astUtils.isOpeningParenToken(token) && token !== startToken) {
                    token = sourceCode.getTokenBefore(token);
                }
                return sourceCode.getTokenAfter(token);
            }

            offsets.setDesiredOffsets(
                [startToken.range[1], endToken.range[0]],
                startToken,
                typeof offset === "number" ? offset : 1,
            );
            offsets.setDesiredOffset(endToken, startToken, 0);

            if (offset === "first" && elements.length && !elements[0]) {
                return;
            }

            elements.forEach((element, index) => {
                if (!element) return;

                if (offset === "off") {
                    offsets.ignoreToken(getFirstToken(element));
                }

                if (index === 0) return;

                if (offset === "first" &&
                    tokenInfo.isFirstTokenOfLine(getFirstToken(element))) {
                    offsets.matchOffsetOf(
                        getFirstToken(elements[0]),
                        getFirstToken(element),
                    );
                } else {
                    const previousElement = elements[index - 1];
                    const firstTokenOfPrev = previousElement && getFirstToken(previousElement);
                    const lastTokenOfPrev = previousElement &&
                        sourceCode.getLastToken(previousElement);

                    if (previousElement &&
                        lastTokenOfPrev.loc.end.line -
                        countTrailingLinebreaks(lastTokenOfPrev.value) >
                        startToken.loc.end.line) {
                        offsets.setDesiredOffsets(
                            [previousElement.range[1], element.range[1]],
                            firstTokenOfPrev,
                            0,
                        );
                    }
                }
            });
        }

        /**
         * Adds indentation for a blockless node body (e.g. `if` without braces).
         * @param {ASTNode} node
         * @returns {void}
         */
        function addBlocklessNodeIndent(node) {
            if (node.type === "BlockStatement") return;

            const lastParentToken = sourceCode.getTokenBefore(
                node,
                astUtils.isNotOpeningParenToken,
            );

            let firstBodyToken = sourceCode.getFirstToken(node);
            let lastBodyToken = sourceCode.getLastToken(node);

            while (
                astUtils.isOpeningParenToken(sourceCode.getTokenBefore(firstBodyToken)) &&
                astUtils.isClosingParenToken(sourceCode.getTokenAfter(lastBodyToken))
            ) {
                firstBodyToken = sourceCode.getTokenBefore(firstBodyToken);
                lastBodyToken = sourceCode.getTokenAfter(lastBodyToken);
            }

            offsets.setDesiredOffsets(
                [firstBodyToken.range[0], lastBodyToken.range[1]],
                lastParentToken,
                1,
            );
        }

        /**
         * Adds indentation for function call / new expression arguments.
         * @param {ASTNode} node CallExpression or NewExpression
         * @returns {void}
         */
        function addFunctionCallIndent(node) {
            const openingParen = node.arguments.length
                ? sourceCode.getFirstTokenBetween(
                    node.callee,
                    node.arguments[0],
                    astUtils.isOpeningParenToken,
                )
                : sourceCode.getLastToken(node, 1);
            const closingParen = sourceCode.getLastToken(node);

            parameterParens.add(openingParen);
            parameterParens.add(closingParen);

            if (node.optional) {
                addOptionalCalleeOffset(node, openingParen);
            }

            const offsetAfterToken = node.callee.type === "TaggedTemplateExpression"
                ? sourceCode.getFirstToken(node.callee.quasi)
                : openingParen;

            offsets.setDesiredOffset(
                openingParen,
                sourceCode.getTokenBefore(offsetAfterToken),
                0,
            );

            addElementListIndent(
                node.arguments,
                openingParen,
                closingParen,
                options.CallExpression.arguments,
            );
        }

        /**
         * Adds offset for the `?.` token in optional call expressions.
         * @param {ASTNode} node
         * @param {Token} openingParen
         * @returns {void}
         */
        function addOptionalCalleeOffset(node, openingParen) {
            const dotToken = sourceCode.getTokenAfter(
                node.callee,
                astUtils.isQuestionDotToken,
            );
            const calleeParenCount = sourceCode.getTokensBetween(
                node.callee,
                dotToken,
                { filter: astUtils.isClosingParenToken },
            ).length;
            const firstTokenOfCallee = calleeParenCount
                ? sourceCode.getTokenBefore(node.callee, { skip: calleeParenCount - 1 })
                : sourceCode.getFirstToken(node.callee);
            const lastTokenOfCallee = sourceCode.getTokenBefore(dotToken);
            const offsetBase =
                lastTokenOfCallee.loc.end.line === openingParen.loc.start.line
                    ? lastTokenOfCallee
                    : firstTokenOfCallee;

            offsets.setDesiredOffset(dotToken, offsetBase, 1);
        }

        /**
         * Adds indentation for parenthesized expressions.
         * @param {Token[]} tokens
         * @returns {void}
         */
        function addParensIndent(tokens) {
            const parenStack = [];
            const parenPairs = [];

            for (const token of tokens) {
                if (astUtils.isOpeningParenToken(token)) {
                    parenStack.push(token);
                } else if (astUtils.isClosingParenToken(token)) {
                    parenPairs.push({ left: parenStack.pop(), right: token });
                }
            }

            for (let i = parenPairs.length - 1; i >= 0; i--) {
                const { left: leftParen, right: rightParen } = parenPairs[i];

                if (!parameterParens.has(leftParen) && !parameterParens.has(rightParen)) {
                    const parenthesizedTokens = new Set(
                        sourceCode.getTokensBetween(leftParen, rightParen),
                    );
                    for (const token of parenthesizedTokens) {
                        if (!parenthesizedTokens.has(offsets.getFirstDependency(token))) {
                            offsets.setDesiredOffset(token, leftParen, 1);
                        }
                    }
                }

                offsets.setDesiredOffset(rightParen, leftParen, 0);
            }
        }

        /**
         * Ignores all tokens in an unknown node.
         * @param {ASTNode} node
         * @returns {void}
         */
        function ignoreNode(node) {
            const unknownNodeTokens = new Set(
                sourceCode.getTokens(node, { includeComments: true }),
            );

            for (const token of unknownNodeTokens) {
                if (!unknownNodeTokens.has(offsets.getFirstDependency(token))) {
                    const firstTokenOfLine = tokenInfo.getFirstTokenOfLine(token);
                    if (token === firstTokenOfLine) {
                        offsets.ignoreToken(token);
                    } else {
                        offsets.setDesiredOffset(token, firstTokenOfLine, 0);
                    }
                }
            }
        }

        /**
         * Checks whether a token is on the first line of its containing statement.
         * @param {Token} token
         * @param {ASTNode} leafNode
         * @returns {boolean}
         */
        function isOnFirstLineOfStatement(token, leafNode) {
            let node = leafNode;
            while (node.parent &&
                !node.parent.type.endsWith("Statement") &&
                !node.parent.type.endsWith("Declaration")) {
                node = node.parent;
            }
            node = node.parent;
            return !node || node.loc.start.line === token.loc.start.line;
        }

        //----------------------------------------------------------------------
        // ConditionalExpression helpers
        //----------------------------------------------------------------------

        /**
         * Sets offsets for a ConditionalExpression node.
         * @param {ASTNode} node
         * @returns {void}
         */
        function handleConditionalExpression(node) {
            const firstToken = sourceCode.getFirstToken(node);

            if (options.flatTernaryExpressions &&
                astUtils.isTokenOnSameLine(node.test, node.consequent) &&
                !isOnFirstLineOfStatement(firstToken, node)) {
                return;
            }

            const questionMarkToken = sourceCode.getFirstTokenBetween(
                node.test,
                node.consequent,
                token => token.type === "Punctuator" && token.value === "?",
            );
            const colonToken = sourceCode.getFirstTokenBetween(
                node.consequent,
                node.alternate,
                token => token.type === "Punctuator" && token.value === ":",
            );

            const firstConsequentToken = sourceCode.getTokenAfter(questionMarkToken);
            const lastConsequentToken = sourceCode.getTokenBefore(colonToken);
            const firstAlternateToken = sourceCode.getTokenAfter(colonToken);

            offsets.setDesiredOffset(questionMarkToken, firstToken, 1);
            offsets.setDesiredOffset(colonToken, firstToken, 1);

            const consequentOffset =
                firstConsequentToken.type === "Punctuator" &&
                options.offsetTernaryExpressions ? 2 : 1;
            offsets.setDesiredOffset(firstConsequentToken, firstToken, consequentOffset);

            if (lastConsequentToken.loc.end.line === firstAlternateToken.loc.start.line) {
                offsets.setDesiredOffset(firstAlternateToken, firstConsequentToken, 0);
            } else {
                const alternateOffset =
                    firstAlternateToken.type === "Punctuator" &&
                    options.offsetTernaryExpressions ? 2 : 1;
                offsets.setDesiredOffset(firstAlternateToken, firstToken, alternateOffset);
            }
        }

        //----------------------------------------------------------------------
        // MemberExpression helpers
        //----------------------------------------------------------------------

        /**
         * Sets offsets for MemberExpression, JSXMemberExpression, MetaProperty.
         * @param {ASTNode} node
         * @returns {void}
         */
        function handleMemberExpression(node) {
            const object = node.type === "MetaProperty" ? node.meta : node.object;
            const firstNonObjectToken = sourceCode.getFirstTokenBetween(
                object,
                node.property,
                astUtils.isNotClosingParenToken,
            );
            const secondNonObjectToken = sourceCode.getTokenAfter(firstNonObjectToken);

            const objectParenCount = sourceCode.getTokensBetween(
                object,
                node.property,
                { filter: astUtils.isClosingParenToken },
            ).length;
            const firstObjectToken = objectParenCount
                ? sourceCode.getTokenBefore(object, { skip: objectParenCount - 1 })
                : sourceCode.getFirstToken(object);
            const lastObjectToken = sourceCode.getTokenBefore(firstNonObjectToken);
            const firstPropertyToken = node.computed
                ? firstNonObjectToken
                : secondNonObjectToken;

            if (node.computed) {
                offsets.setDesiredOffset(sourceCode.getLastToken(node), firstNonObjectToken, 0);
                offsets.setDesiredOffsets(node.property.range, firstNonObjectToken, 1);
            }

            const offsetBase =
                lastObjectToken.loc.end.line === firstPropertyToken.loc.start.line
                    ? lastObjectToken
                    : firstObjectToken;

            if (typeof options.MemberExpression === "number") {
                offsets.setDesiredOffset(firstNonObjectToken, offsetBase, options.MemberExpression);
                offsets.setDesiredOffset(
                    secondNonObjectToken,
                    node.computed ? firstNonObjectToken : offsetBase,
                    options.MemberExpression,
                );
            } else {
                offsets.ignoreToken(firstNonObjectToken);
                offsets.ignoreToken(secondNonObjectToken);
                offsets.setDesiredOffset(firstNonObjectToken, offsetBase, 0);
                offsets.setDesiredOffset(secondNonObjectToken, firstNonObjectToken, 0);
            }
        }

        //----------------------------------------------------------------------
        // PropertyDefinition helpers
        //----------------------------------------------------------------------

        /**
         * Sets offsets for a PropertyDefinition node.
         * @param {ASTNode} node
         * @returns {void}
         */
        function handlePropertyDefinition(node) {
            const firstToken = sourceCode.getFirstToken(node);
            const maybeSemicolonToken = sourceCode.getLastToken(node);
            let keyLastToken;

            if (node.computed) {
                const bracketTokenL = sourceCode.getTokenBefore(
                    node.key,
                    astUtils.isOpeningBracketToken,
                );
                const bracketTokenR = keyLastToken = sourceCode.getTokenAfter(
                    node.key,
                    astUtils.isClosingBracketToken,
                );
                const keyRange = [bracketTokenL.range[1], bracketTokenR.range[0]];

                if (bracketTokenL !== firstToken) {
                    offsets.setDesiredOffset(bracketTokenL, firstToken, 0);
                }
                offsets.setDesiredOffsets(keyRange, bracketTokenL, 1);
                offsets.setDesiredOffset(bracketTokenR, bracketTokenL, 0);
            } else {
                const idToken = keyLastToken = sourceCode.getFirstToken(node.key);
                if (idToken !== firstToken) {
                    offsets.setDesiredOffset(idToken, firstToken, 1);
                }
            }

            if (node.value) {
                const eqToken = sourceCode.getTokenBefore(node.value, astUtils.isEqToken);
                const valueToken = sourceCode.getTokenAfter(eqToken);

                offsets.setDesiredOffset(eqToken, keyLastToken, 1);
                offsets.setDesiredOffset(valueToken, eqToken, 1);
                if (astUtils.isSemicolonToken(maybeSemicolonToken)) {
                    offsets.setDesiredOffset(maybeSemicolonToken, eqToken, 1);
                }
            } else if (astUtils.isSemicolonToken(maybeSemicolonToken)) {
                offsets.setDesiredOffset(maybeSemicolonToken, keyLastToken, 1);
            }
        }

        //----------------------------------------------------------------------
        // Semicolon-first style exit handler
        //----------------------------------------------------------------------

        /**
         * Handles semicolon-first style for blockless statement exits.
         * @param {ASTNode} node
         * @returns {void}
         */
        function handleBlocklessStatementExit(node) {
            const nodesToCheck = node.type === "IfStatement"
                ? [node.consequent, ...(node.alternate ? [node.alternate] : [])]
                : [node.body];

            for (const nodeToCheck of nodesToCheck) {
                const lastToken = sourceCode.getLastToken(nodeToCheck);
                if (!astUtils.isSemicolonToken(lastToken)) continue;

                const tokenBeforeLast = sourceCode.getTokenBefore(lastToken);
                const tokenAfterLast = sourceCode.getTokenAfter(lastToken);

                if (!astUtils.isTokenOnSameLine(tokenBeforeLast, lastToken) &&
                    tokenAfterLast &&
                    astUtils.isTokenOnSameLine(lastToken, tokenAfterLast)) {
                    offsets.setDesiredOffset(
                        lastToken,
                        sourceCode.getFirstToken(node),
                        0,
                    );
                }
            }
        }

        //----------------------------------------------------------------------
        // Program:exit validation
        //----------------------------------------------------------------------

        /**
         * Builds a map from comment tokens to their preceding non-comment tokens.
         * @returns {WeakMap}
         */
        function buildPrecedingTokensMap() {
            const precedingTokens = new WeakMap();
            for (const comment of sourceCode.ast.comments) {
                const tokenOrCommentBefore = sourceCode.getTokenBefore(comment, {
                    includeComments: true,
                });
                const hasToken = precedingTokens.has(tokenOrCommentBefore)
                    ? precedingTokens.get(tokenOrCommentBefore)
                    : tokenOrCommentBefore;
                precedingTokens.set(comment, hasToken);
            }
            return precedingTokens;
        }

        /**
         * Validates indentation for a comment token.
         * @param {Token} firstTokenOfLine
         * @param {WeakMap} precedingTokens
         * @returns {boolean} true if the comment should be skipped (valid or aligned)
         */
        function validateCommentIndent(firstTokenOfLine, precedingTokens) {
            const tokenBefore = precedingTokens.get(firstTokenOfLine);
            const tokenAfter = tokenBefore
                ? sourceCode.getTokenAfter(tokenBefore)
                : sourceCode.ast.tokens[0];

            if (tokenAfter &&
                astUtils.isSemicolonToken(tokenAfter) &&
                !astUtils.isTokenOnSameLine(firstTokenOfLine, tokenAfter)) {
                offsets.setDesiredOffset(firstTokenOfLine, tokenAfter, 0);
            }

            const mayAlignWithBefore = tokenBefore &&
                !hasBlankLinesBetween(tokenBefore, firstTokenOfLine, tokenInfo);
            const mayAlignWithAfter = tokenAfter &&
                !hasBlankLinesBetween(firstTokenOfLine, tokenAfter, tokenInfo);

            return (
                (mayAlignWithBefore &&
                    validateTokenIndent(
                        firstTokenOfLine,
                        offsets.getDesiredIndent(tokenBefore),
                    )) ||
                (mayAlignWithAfter &&
                    validateTokenIndent(
                        firstTokenOfLine,
                        offsets.getDesiredIndent(tokenAfter),
                    ))
            );
        }

        /**
         * Validates indentation for all lines in the file.
         * @param {WeakMap} precedingTokens
         * @returns {void}
         */
        function validateAllLines(precedingTokens) {
            for (let i = 1; i < sourceCode.lines.length + 1; i++) {
                if (!tokenInfo.firstTokensByLineNumber.has(i)) continue;

                const firstTokenOfLine = tokenInfo.firstTokensByLineNumber.get(i);
                if (firstTokenOfLine.loc.start.line !== i) continue;

                if (astUtils.isCommentToken(firstTokenOfLine)) {
                    if (validateCommentIndent(firstTokenOfLine, precedingTokens)) {
                        continue;
                    }
                }

                if (validateTokenIndent(
                    firstTokenOfLine,
                    offsets.getDesiredIndent(firstTokenOfLine),
                )) {
                    continue;
                }

                report(firstTokenOfLine, offsets.getDesiredIndent(firstTokenOfLine));
            }
        }

        //----------------------------------------------------------------------
        // Node Listeners
        //----------------------------------------------------------------------

        const ignoredNodeFirstTokens = new Set();

        const baseOffsetListeners = {
            "ArrayExpression, ArrayPattern"(node) {
                const openingBracket = sourceCode.getFirstToken(node);
                const closingBracket = sourceCode.getTokenAfter(
                    [...node.elements].reverse().find(el => el) || openingBracket,
                    astUtils.isClosingBracketToken,
                );
                addElementListIndent(
                    node.elements,
                    openingBracket,
                    closingBracket,
                    options.ArrayExpression,
                );
            },

            "ObjectExpression, ObjectPattern"(node) {
                const openingCurly = sourceCode.getFirstToken(node);
                const closingCurly = sourceCode.getTokenAfter(
                    node.properties.length ? node.properties.at(-1) : openingCurly,
                    astUtils.isClosingBraceToken,
                );
                addElementListIndent(
                    node.properties,
                    openingCurly,
                    closingCurly,
                    options.ObjectExpression,
                );
            },

            ArrowFunctionExpression(node) {
                const maybeOpeningParen = sourceCode.getFirstToken(node, {
                    skip: node.async ? 1 : 0,
                });

                if (astUtils.isOpeningParenToken(maybeOpeningParen)) {
                    const closingParen = sourceCode.getTokenBefore(
                        node.body,
                        astUtils.isClosingParenToken,
                    );
                    parameterParens.add(maybeOpeningParen);
                    parameterParens.add(closingParen);
                    addElementListIndent(
                        node.params,
                        maybeOpeningParen,
                        closingParen,
                        options.FunctionExpression.parameters,
                    );
                }

                addBlocklessNodeIndent(node.body);
            },

            AssignmentExpression(node) {
                const operator = sourceCode.getFirstTokenBetween(
                    node.left,
                    node.right,
                    token => token.value === node.operator,
                );
                offsets.setDesiredOffsets(
                    [operator.range[0], node.range[1]],
                    sourceCode.getLastToken(node.left),
                    1,
                );
                offsets.ignoreToken(operator);
                offsets.ignoreToken(sourceCode.getTokenAfter(operator));
            },

            "BinaryExpression, LogicalExpression"(node) {
                const operator = sourceCode.getFirstTokenBetween(
                    node.left,
                    node.right,
                    token => token.value === node.operator,
                );
                const tokenAfterOperator = sourceCode.getTokenAfter(operator);
                offsets.ignoreToken(operator);
                offsets.ignoreToken(tokenAfterOperator);
                offsets.setDesiredOffset(tokenAfterOperator, operator, 0);
            },

            "BlockStatement, ClassBody"(node) {
                const blockIndentLevel = getBlockIndentLevel(node, options);

                if (!astUtils.STATEMENT_LIST_PARENTS.has(node.parent.type)) {
                    offsets.setDesiredOffset(
                        sourceCode.getFirstToken(node),
                        sourceCode.getFirstToken(node.parent),
                        0,
                    );
                }

                addElementListIndent(
                    node.body,
                    sourceCode.getFirstToken(node),
                    sourceCode.getLastToken(node),
                    blockIndentLevel,
                );
            },

            CallExpression: addFunctionCallIndent,

            "ClassDeclaration[superClass], ClassExpression[superClass]"(node) {
                const classToken = sourceCode.getFirstToken(node);
                const extendsToken = sourceCode.getTokenBefore(
                    node.superClass,
                    astUtils.isNotOpeningParenToken,
                );
                offsets.setDesiredOffsets(
                    [extendsToken.range[0], node.body.range[0]],
                    classToken,
                    1,
                );
            },

            ConditionalExpression: handleConditionalExpression,

            "DoWhileStatement, WhileStatement, ForInStatement, ForOfStatement, WithStatement":
                node => addBlocklessNodeIndent(node.body),

            ExportNamedDeclaration(node) {
                if (node.declaration !== null) return;

                const closingCurly = sourceCode.getLastToken(
                    node,
                    astUtils.isClosingBraceToken,
                );
                addElementListIndent(
                    node.specifiers,
                    sourceCode.getFirstToken(node, { skip: 1 }),
                    closingCurly,
                    1,
                );

                if (node.source) {
                    offsets.setDesiredOffsets(
                        [closingCurly.range[1], node.range[1]],
                        sourceCode.getFirstToken(node),
                        1,
                    );
                }
            },

            ForStatement(node) {
                const forOpeningParen = sourceCode.getFirstToken(node, 1);
                for (const part of [node.init, node.test, node.update]) {
                    if (part) {
                        offsets.setDesiredOffsets(part.range, forOpeningParen, 1);
                    }
                }
                addBlocklessNodeIndent(node.body);
            },

            "FunctionDeclaration, FunctionExpression"(node) {
                const closingParen = sourceCode.getTokenBefore(node.body);
                const openingParen = sourceCode.getTokenBefore(
                    node.params.length ? node.params[0] : closingParen,
                );
                parameterParens.add(openingParen);
                parameterParens.add(closingParen);
                addElementListIndent(
                    node.params,
                    openingParen,
                    closingParen,
                    options[node.type].parameters,
                );
            },

            IfStatement(node) {
                addBlocklessNodeIndent(node.consequent);
                if (node.alternate) {
                    addBlocklessNodeIndent(node.alternate);
                }
            },

            ":matches(DoWhileStatement, ForStatement, ForInStatement, ForOfStatement, IfStatement, WhileStatement, WithStatement):exit":
                handleBlocklessStatementExit,

            ImportDeclaration(node) {
                const hasImportSpecifiers = node.specifiers.some(
                    s => s.type === "ImportSpecifier",
                );

                if (hasImportSpecifiers) {
                    const openingCurly = sourceCode.getFirstToken(
                        node,
                        astUtils.isOpeningBraceToken,
                    );
                    const closingCurly = sourceCode.getLastToken(
                        node,
                        astUtils.isClosingBraceToken,
                    );
                    addElementListIndent(
                        node.specifiers.filter(s => s.type === "ImportSpecifier"),
                        openingCurly,
                        closingCurly,
                        options.ImportDeclaration,
                    );
                }

                const fromToken = sourceCode.getLastToken(
                    node,
                    token => token.type === "Identifier" && token.value === "from",
                );
                const sourceToken = sourceCode.getLastToken(
                    node,
                    token => token.type === "String",
                );
                const semiToken = sourceCode.getLastToken(
                    node,
                    token => token.type === "Punctuator" && token.value === ";",
                );

                if (fromToken) {
                    const end = semiToken && semiToken.range[1] === sourceToken.range[1]
                        ? node.range[1]
                        : sourceToken.range[1];
                    offsets.setDesiredOffsets(
                        [fromToken.range[0], end],
                        sourceCode.getFirstToken(node),
                        1,
                    );
                }
            },

            ImportExpression(node) {
                const openingParen = sourceCode.getFirstToken(node, 1);
                const closingParen = sourceCode.getLastToken(node);

                parameterParens.add(openingParen);
                parameterParens.add(closingParen);
                offsets.setDesiredOffset(
                    openingParen,
                    sourceCode.getTokenBefore(openingParen),
                    0,
                );
                addElementListIndent(
                    [node.source],
                    openingParen,
                    closingParen,
                    options.CallExpression.arguments,
                );
            },

            "MemberExpression, JSXMemberExpression, MetaProperty": handleMemberExpression,

            NewExpression(node) {
                const hasParens = node.arguments.length > 0 ||
                    (astUtils.isClosingParenToken(sourceCode.getLastToken(node)) &&
                        astUtils.isOpeningParenToken(sourceCode.getLastToken(node, 1)));
                if (hasParens) {
                    addFunctionCallIndent(node);
                }
            },

            Property(node) {
                if (!node.shorthand && !node.method && node.kind === "init") {
                    const colon = sourceCode.getFirstTokenBetween(
                        node.key,
                        node.value,
                        astUtils.isColonToken,
                    );
                    offsets.ignoreToken(sourceCode.getTokenAfter(colon));
                }
            },

            PropertyDefinition: handlePropertyDefinition,

            StaticBlock(node) {
                const openingCurly = sourceCode.getFirstToken(node, { skip: 1 });
                const closingCurly = sourceCode.getLastToken(node);
                addElementListIndent(
                    node.body,
                    openingCurly,
                    closingCurly,
                    options.StaticBlock.body,
                );
            },

            SwitchStatement(node) {
                const openingCurly = sourceCode.getTokenAfter(
                    node.discriminant,
                    astUtils.isOpeningBraceToken,
                );
                const closingCurly = sourceCode.getLastToken(node);

                offsets.setDesiredOffsets(
                    [openingCurly.range[1], closingCurly.range[0]],
                    openingCurly,
                    options.SwitchCase,
                );

                if (node.cases.length) {
                    sourceCode
                        .getTokensBetween(node.cases.at(-1), closingCurly, {
                            includeComments: true,
                            filter: astUtils.isCommentToken,
                        })
                        .forEach(token => offsets.ignoreToken(token));
                }
            },

            SwitchCase(node) {
                const isSingleBlock = node.consequent.length === 1 &&
                    node.consequent[0].type === "BlockStatement";
                if (isSingleBlock) return;

                const caseKeyword = sourceCode.getFirstToken(node);
                const tokenAfterCurrentCase = sourceCode.getTokenAfter(node);
                offsets.setDesiredOffsets(
                    [caseKeyword.range[1], tokenAfterCurrentCase.range[0]],
                    caseKeyword,
                    1,
                );
            },

            TemplateLiteral(node) {
                node.expressions.forEach((expression, index) => {
                    const previousQuasi = node.quasis[index];
                    const nextQuasi = node.quasis[index + 1];
                    const tokenToAlignFrom =
                        previousQuasi.loc.start.line === previousQuasi.loc.end.line
                            ? sourceCode.getFirstToken(previousQuasi)
                            : null;

                    offsets.setDesiredOffsets(
                        [previousQuasi.range[1], nextQuasi.range[0]],
                        tokenToAlignFrom,
                        1,
                    );
                    offsets.setDesiredOffset(
                        sourceCode.getFirstToken(nextQuasi),
                        tokenToAlignFrom,
                        0,
                    );
                });
            },

            VariableDeclaration(node) {
                let variableIndent = Object.hasOwn(options.VariableDeclarator, node.kind)
                    ? options.VariableDeclarator[node.kind]
                    : DEFAULT_VARIABLE_INDENT;

                const firstToken = sourceCode.getFirstToken(node);
                const lastToken = sourceCode.getLastToken(node);

                if (options.VariableDeclarator[node.kind] === "first") {
                    if (node.declarations.length > 1) {
                        addElementListIndent(
                            node.declarations,
                            firstToken,
                            lastToken,
                            "first",
                        );
                        return;
                    }
                    variableIndent = DEFAULT_VARIABLE_INDENT;
                }

                const isMultiLine =
                    node.declarations.at(-1).loc.start.line > node.loc.start.line;
                offsets.setDesiredOffsets(
                    node.range,
                    firstToken,
                    variableIndent,
                    isMultiLine,
                );

                if (astUtils.isSemicolonToken(lastToken)) {
                    offsets.ignoreToken(lastToken);
                }
            },

            VariableDeclarator(node) {
                if (!node.init) return;

                const equalOperator = sourceCode.getTokenBefore(
                    node.init,
                    astUtils.isNotOpeningParenToken,
                );
                const tokenAfterOperator = sourceCode.getTokenAfter(equalOperator);

                offsets.ignoreToken(equalOperator);
                offsets.ignoreToken(tokenAfterOperator);
                offsets.setDesiredOffsets(
                    [tokenAfterOperator.range[0], node.range[1]],
                    equalOperator,
                    1,
                );
                offsets.setDesiredOffset(
                    equalOperator,
                    sourceCode.getLastToken(node.id),
                    0,
                );
            },

            "JSXAttribute[value]"(node) {
                const equalsToken = sourceCode.getFirstTokenBetween(
                    node.name,
                    node.value,
                    token => token.type === "Punctuator" && token.value === "=",
                );
                offsets.setDesiredOffsets(
                    [equalsToken.range[0], node.value.range[1]],
                    sourceCode.getFirstToken(node.name),
                    1,
                );
            },

            JSXElement(node) {
                if (node.closingElement) {
                    addElementListIndent(
                        node.children,
                        sourceCode.getFirstToken(node.openingElement),
                        sourceCode.getFirstToken(node.closingElement),
                        1,
                    );
                }
            },

            JSXOpeningElement(node) {
                const firstToken = sourceCode.getFirstToken(node);
                let closingToken;

                if (node.selfClosing) {
                    closingToken = sourceCode.getLastToken(node, { skip: 1 });
                    offsets.setDesiredOffset(
                        sourceCode.getLastToken(node),
                        closingToken,
                        0,
                    );
                } else {
                    closingToken = sourceCode.getLastToken(node);
                }

                offsets.setDesiredOffsets(node.name.range, firstToken);
                addElementListIndent(node.attributes, firstToken, closingToken, 1);
            },

            JSXClosingElement(node) {
                offsets.setDesiredOffsets(
                    node.name.range,
                    sourceCode.getFirstToken(node),
                    1,
                );
            },

            JSXFragment(node) {
                addElementListIndent(
                    node.children,
                    sourceCode.getFirstToken(node.openingFragment),
                    sourceCode.getFirstToken(node.closingFragment),
                    1,
                );
            },

            JSXOpeningFragment(node) {
                const firstToken = sourceCode.getFirstToken(node);
                const closingToken = sourceCode.getLastToken(node);
                offsets.setDesiredOffsets(node.range, firstToken, 1);
                offsets.matchOffsetOf(firstToken, closingToken);
            },

            JSXClosingFragment(node) {
                const firstToken = sourceCode.getFirstToken(node);
                const slashToken = sourceCode.getLastToken(node, { skip: 1 });
                const closingToken = sourceCode.getLastToken(node);
                const tokenToMatch = astUtils.isTokenOnSameLine(slashToken, closingToken)
                    ? slashToken
                    : closingToken;
                offsets.setDesiredOffsets(node.range, firstToken, 1);
                offsets.matchOffsetOf(firstToken, tokenToMatch);
            },

            "JSXExpressionContainer, JSXSpreadAttribute"(node) {
                const openingCurly = sourceCode.getFirstToken(node);
                const closingCurly = sourceCode.getLastToken(node);
                offsets.setDesiredOffsets(
                    [openingCurly.range[1], closingCurly.range[0]],
                    openingCurly,
                    1,
                );
            },

            "*"(node) {
                const firstToken = sourceCode.getFirstToken(node);
                if (firstToken && !ignoredNodeFirstTokens.has(firstToken)) {
                    offsets.setDesiredOffsets(node.range, firstToken, 0);
                }
            },
        };

        //----------------------------------------------------------------------
        // Listener Queue & Ignored Nodes
        //----------------------------------------------------------------------

        const listenerCallQueue = [];
        const ignoredNodes = new Set();

        function addToIgnoredNodes(node) {
            ignoredNodes.add(node);
            ignoredNodeFirstTokens.add(sourceCode.getFirstToken(node));
        }

        const offsetListeners = {};
        for (const [selector, listener] of Object.entries(baseOffsetListeners)) {
            offsetListeners[selector] = node =>
                listenerCallQueue.push({ listener, node });
        }

        const ignoredNodeListeners = options.ignoredNodes.reduce(
            (listeners, ignoredSelector) =>
                Object.assign(listeners, { [ignoredSelector]: addToIgnoredNodes }),
            {},
        );

        return Object.assign(offsetListeners, ignoredNodeListeners, {
            "*:exit"(node) {
                if (!KNOWN_NODES.has(node.type)) {
                    addToIgnoredNodes(node);
                }
            },

            "Program:exit"() {
                if (options.ignoreComments) {
                    sourceCode.getAllComments().forEach(
                        comment => offsets.ignoreToken(comment),
                    );
                }

                for (const { listener, node } of listenerCallQueue) {
                    if (!ignoredNodes.has(node)) {
                        listener(node);
                    }
                }

                ignoredNodes.forEach(ignoreNode);
                addParensIndent(sourceCode.ast.tokens);

                const precedingTokens = buildPrecedingTokensMap();
                validateAllLines(precedingTokens);
            },
        });
    },
};
```

## Key Refactoring Changes

| Area | Change | Benefit |
|------|--------|---------|
| **`IndexMap`/`TokenInfo`/`OffsetStorage`** | Extracted `_buildLineMap()`, split `getDesiredIndent` into `_computeDesiredIndent`, `_computeLockedIndent`, `_computeOffsetIndent` | Single responsibility, easier testing |
| **Option parsing** | Extracted `parseOptions()`, `buildDefaultOptions()`, `normalizeVariableDeclaratorOption()` | Isolated, reusable, testable |
| **Constants** | Moved `IIFE_ANCESTOR_TYPES`, `UNARY_OPERATORS_FOR_IIFE`, `RULE_SCHEMA` to module scope | Avoids recreation on each `create()` call |
| **`isOuterIIFE`** | Moved to module scope, uses `Set` for operator lookup | Pure function, no closure needed |
| **`hasBlankLinesBetween`** | Moved to module scope with `tokenInfo` parameter | Decoupled from closure |
| **Large handlers** | Extracted `handleConditionalExpression`, `handleMemberExpression`, `handlePropertyDefinition`, `handleBlocklessStatementExit`, `addOptionalCalleeOffset`, `getBlockIndentLevel` | Each handler has one clear purpose |
| **`Program:exit`** | Extracted `buildPrecedingTokensMap()`, `validateCommentIndent()`, `validateAllLines()` | Readable, step-by-step flow |
| **JSX handlers** | Merged `JSXExpressionContainer` + `JSXSpreadAttribute` (identical logic) | Eliminated duplication |
| **`ForStatement`** | Replaced 3 identical `if (part)` blocks with a `for...of` loop | DRY |
| **`for` loops** | Replaced index-based loops with `for...of` where possible | Cleaner iteration |