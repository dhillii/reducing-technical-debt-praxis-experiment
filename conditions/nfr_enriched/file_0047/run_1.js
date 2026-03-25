# Refactored ESLint Indent Rule

Here's the refactored code with reduced complexity through better organization, extracted helper functions, and elimination of redundant patterns:

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
    "AssignmentExpression", "AssignmentPattern", "ArrayExpression", "ArrayPattern",
    "ArrowFunctionExpression", "AwaitExpression", "BlockStatement", "BinaryExpression",
    "BreakStatement", "CallExpression", "CatchClause", "ChainExpression", "ClassBody",
    "ClassDeclaration", "ClassExpression", "ConditionalExpression", "ContinueStatement",
    "DoWhileStatement", "DebuggerStatement", "EmptyStatement", "ExperimentalRestProperty",
    "ExperimentalSpreadProperty", "ExpressionStatement", "ForStatement", "ForInStatement",
    "ForOfStatement", "FunctionDeclaration", "FunctionExpression", "Identifier",
    "IfStatement", "Literal", "LabeledStatement", "LogicalExpression", "MemberExpression",
    "MetaProperty", "MethodDefinition", "NewExpression", "ObjectExpression", "ObjectPattern",
    "PrivateIdentifier", "Program", "Property", "PropertyDefinition", "RestElement",
    "ReturnStatement", "SequenceExpression", "SpreadElement", "StaticBlock", "Super",
    "SwitchCase", "SwitchStatement", "TaggedTemplateExpression", "TemplateElement",
    "TemplateLiteral", "ThisExpression", "ThrowStatement", "TryStatement", "UnaryExpression",
    "UpdateExpression", "VariableDeclaration", "VariableDeclarator", "WhileStatement",
    "WithStatement", "YieldExpression", "JSXFragment", "JSXOpeningFragment",
    "JSXClosingFragment", "JSXIdentifier", "JSXNamespacedName", "JSXMemberExpression",
    "JSXEmptyExpression", "JSXExpressionContainer", "JSXElement", "JSXClosingElement",
    "JSXOpeningElement", "JSXAttribute", "JSXSpreadAttribute", "JSXText",
    "ExportDefaultDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration",
    "ExportSpecifier", "ImportDeclaration", "ImportSpecifier", "ImportDefaultSpecifier",
    "ImportNamespaceSpecifier", "ImportExpression",
]);

const ELEMENT_LIST_SCHEMA = {
    oneOf: [
        { type: "integer", minimum: 0 },
        { enum: ["first", "off"] },
    ],
};

const UNARY_OPERATORS = ["!", "~", "+", "-"];

//------------------------------------------------------------------------------
// IndexMap
//------------------------------------------------------------------------------

/**
 * A mutable map with numeric indices as keys, supporting range operations.
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
            if (this._values[index]) {
                return this._values[index];
            }
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
 * A helper class to get token-based info related to indentation.
 */
class TokenInfo {
    constructor(sourceCode) {
        this.sourceCode = sourceCode;
        this.firstTokensByLineNumber = new Map();
        this._buildLineTokenMap(sourceCode.tokensAndComments);
    }

    _buildLineTokenMap(tokens) {
        for (const token of tokens) {
            const startLine = token.loc.start.line;
            const endLine = token.loc.end.line;

            if (!this.firstTokensByLineNumber.has(startLine)) {
                this.firstTokensByLineNumber.set(startLine, token);
            }

            if (
                !this.firstTokensByLineNumber.has(endLine) &&
                this.sourceCode.text
                    .slice(token.range[1] - token.loc.end.column, token.range[1])
                    .trim()
            ) {
                this.firstTokensByLineNumber.set(endLine, token);
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
 * Stores desired offsets of tokens from each other.
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
        const fromTokenIsInRange =
            fromToken &&
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
        const columnDiff = firstToken.loc.start.column - firstTokenOfLine.loc.start.column;

        return (
            this.getDesiredIndent(firstTokenOfLine) +
            this._indentType.repeat(columnDiff)
        );
    }

    _computeOffsetIndent(token) {
        const offsetInfo = this._getOffsetDescriptor(token);
        const isSameLine =
            offsetInfo.from &&
            offsetInfo.from.loc.start.line === token.loc.start.line &&
            !/^\s*?\n/u.test(token.value) &&
            !offsetInfo.force;

        const offset = isSameLine ? 0 : offsetInfo.offset * this._indentSize;
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
        schema: [
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
        ],
        messages: {
            wrongIndentation: "Expected indentation of {{expected}} but found {{actual}}.",
        },
    },

    create(context) {
        const DEFAULT_VARIABLE_INDENT = 1;
        const DEFAULT_PARAMETER_INDENT = 1;
        const DEFAULT_FUNCTION_BODY_INDENT = 1;

        const { indentSize, indentType, options } = parseOptions(context.options);
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
        // Option parsing
        //----------------------------------------------------------------------

        function parseOptions(contextOptions) {
            let indentSize = 4;
            let indentType = "space";
            const options = {
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

            if (!contextOptions.length) {
                return { indentSize, indentType, options };
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

            return { indentSize, indentType, options };
        }

        function normalizeVariableDeclaratorOption(options) {
            const vd = options.VariableDeclarator;

            if (typeof vd === "number" || vd === "first") {
                options.VariableDeclarator = { var: vd, let: vd, const: vd };
            }
        }

        //----------------------------------------------------------------------
        // Reporting helpers
        //----------------------------------------------------------------------

        function createErrorMessageData(expectedAmount, actualSpaces, actualTabs) {
            const expectedStatement = `${expectedAmount} ${indentType}${expectedAmount === 1 ? "" : "s"}`;
            let foundStatement;

            if (actualSpaces > 0) {
                foundStatement = indentType === "space"
                    ? actualSpaces
                    : `${actualSpaces} space${actualSpaces === 1 ? "" : "s"}`;
            } else if (actualTabs > 0) {
                foundStatement = indentType === "tab"
                    ? actualTabs
                    : `${actualTabs} tab${actualTabs === 1 ? "" : "s"}`;
            } else {
                foundStatement = "0";
            }

            return { expected: expectedStatement, actual: foundStatement };
        }

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
                    return fixer.replaceTextRange(
                        [token.range[0] - token.loc.start.column, token.range[0]],
                        neededIndent,
                    );
                },
            });
        }

        function validateTokenIndent(token, desiredIndent) {
            const indentation = tokenInfo.getTokenIndent(token);

            return (
                indentation === desiredIndent ||
                (indentation.includes(" ") && indentation.includes("\t"))
            );
        }

        //----------------------------------------------------------------------
        // AST helpers
        //----------------------------------------------------------------------

        function isOuterIIFE(node) {
            if (
                !node.parent ||
                node.parent.type !== "CallExpression" ||
                node.parent.callee !== node
            ) {
                return false;
            }

            let statement = node.parent.parent;

            while (isLegalIIFEAncestor(statement)) {
                statement = statement.parent;
            }

            return (
                (statement.type === "ExpressionStatement" ||
                    statement.type === "VariableDeclaration") &&
                statement.parent.type === "Program"
            );
        }

        function isLegalIIFEAncestor(node) {
            return (
                (node.type === "UnaryExpression" && UNARY_OPERATORS.includes(node.operator)) ||
                node.type === "AssignmentExpression" ||
                node.type === "LogicalExpression" ||
                node.type === "SequenceExpression" ||
                node.type === "VariableDeclarator"
            );
        }

        function countTrailingLinebreaks(string) {
            const trailingWhitespace = string.match(/\s*$/u)[0];
            const linebreakMatches = trailingWhitespace.match(
                astUtils.createGlobalLinebreakMatcher(),
            );

            return linebreakMatches === null ? 0 : linebreakMatches.length;
        }

        function hasBlankLinesBetween(firstToken, secondToken) {
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

        function isOnFirstLineOfStatement(token, leafNode) {
            let node = leafNode;

            while (
                node.parent &&
                !node.parent.type.endsWith("Statement") &&
                !node.parent.type.endsWith("Declaration")
            ) {
                node = node.parent;
            }

            node = node.parent;
            return !node || node.loc.start.line === token.loc.start.line;
        }

        //----------------------------------------------------------------------
        // Indentation helpers
        //----------------------------------------------------------------------

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

                if (offset === "first" && tokenInfo.isFirstTokenOfLine(getFirstToken(element))) {
                    offsets.matchOffsetOf(getFirstToken(elements[0]), getFirstToken(element));
                } else {
                    applyPreviousElementOffset(elements, index, element, startToken, getFirstToken);
                }
            });
        }

        function applyPreviousElementOffset(elements, index, element, startToken, getFirstToken) {
            const previousElement = elements[index - 1];

            if (!previousElement) return;

            const firstTokenOfPreviousElement = getFirstToken(previousElement);
            const previousElementLastToken = sourceCode.getLastToken(previousElement);
            const trailingLinebreaks = countTrailingLinebreaks(previousElementLastToken.value);

            if (
                previousElementLastToken.loc.end.line - trailingLinebreaks >
                startToken.loc.end.line
            ) {
                offsets.setDesiredOffsets(
                    [previousElement.range[1], element.range[1]],
                    firstTokenOfPreviousElement,
                    0,
                );
            }
        }

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

            const offsetAfterToken =
                node.callee.type === "TaggedTemplateExpression"
                    ? sourceCode.getFirstToken(node.callee.quasi)
                    : openingParen;

            offsets.setDesiredOffset(openingParen, sourceCode.getTokenBefore(offsetAfterToken), 0);
            addElementListIndent(node.arguments, openingParen, closingParen, options.CallExpression.arguments);
        }

        function addOptionalCalleeOffset(node, openingParen) {
            const dotToken = sourceCode.getTokenAfter(node.callee, astUtils.isQuestionDotToken);
            const calleeParenCount = sourceCode.getTokensBetween(node.callee, dotToken, {
                filter: astUtils.isClosingParenToken,
            }).length;
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

        function addParensIndent(tokens) {
            const parenPairs = collectParenPairs(tokens);

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

        function collectParenPairs(tokens) {
            const parenStack = [];
            const parenPairs = [];

            for (const token of tokens) {
                if (astUtils.isOpeningParenToken(token)) {
                    parenStack.push(token);
                } else if (astUtils.isClosingParenToken(token)) {
                    parenPairs.push({ left: parenStack.pop(), right: token });
                }
            }

            return parenPairs;
        }

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

        function getBlockIndentLevel(node) {
            if (node.parent && isOuterIIFE(node.parent)) {
                return options.outerIIFEBody;
            }
            if (node.parent?.type === "FunctionExpression" || node.parent?.type === "ArrowFunctionExpression") {
                return options.FunctionExpression.body;
            }
            if (node.parent?.type === "FunctionDeclaration") {
                return options.FunctionDeclaration.body;
            }
            return 1;
        }

        //----------------------------------------------------------------------
        // Node listeners
        //----------------------------------------------------------------------

        const baseOffsetListeners = {
            "ArrayExpression, ArrayPattern"(node) {
                const openingBracket = sourceCode.getFirstToken(node);
                const closingBracket = sourceCode.getTokenAfter(
                    [...node.elements].reverse().find(Boolean) || openingBracket,
                    astUtils.isClosingBracketToken,
                );

                addElementListIndent(node.elements, openingBracket, closingBracket, options.ArrayExpression);
            },

            "ObjectExpression, ObjectPattern"(node) {
                const openingCurly = sourceCode.getFirstToken(node);
                const closingCurly = sourceCode.getTokenAfter(
                    node.properties.length ? node.properties.at(-1) : openingCurly,
                    astUtils.isClosingBraceToken,
                );

                addElementListIndent(node.properties, openingCurly, closingCurly, options.ObjectExpression);
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
                const blockIndentLevel = getBlockIndentLevel(node);

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

            ConditionalExpression(node) {
                const firstToken = sourceCode.getFirstToken(node);

                if (
                    !options.flatTernaryExpressions ||
                    !astUtils.isTokenOnSameLine(node.test, node.consequent) ||
                    isOnFirstLineOfStatement(firstToken, node)
                ) {
                    addConditionalExpressionIndent(node, firstToken);
                }
            },

            "DoWhileStatement, WhileStatement, ForInStatement, ForOfStatement, WithStatement":
                node => addBlocklessNodeIndent(node.body),

            ExportNamedDeclaration(node) {
                if (node.declaration !== null) return;

                const closingCurly = sourceCode.getLastToken(node, astUtils.isClosingBraceToken);

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

            ":matches(DoWhileStatement, ForStatement, ForInStatement, ForOfStatement, IfStatement, WhileStatement, WithStatement):exit"(
                node,
            ) {
                const nodesToCheck = node.type === "IfStatement"
                    ? [node.consequent, ...(node.alternate ? [node.alternate] : [])]
                    : [node.body];

                for (const nodeToCheck of nodesToCheck) {
                    handleSemicolonFirstStyle(node, nodeToCheck);
                }
            },

            ImportDeclaration(node) {
                const importSpecifiers = node.specifiers.filter(
                    s => s.type === "ImportSpecifier",
                );

                if (importSpecifiers.length) {
                    const openingCurly = sourceCode.getFirstToken(node, astUtils.isOpeningBraceToken);
                    const closingCurly = sourceCode.getLastToken(node, astUtils.isClosingBraceToken);

                    addElementListIndent(importSpecifiers, openingCurly, closingCurly, options.ImportDeclaration);
                }

                addImportFromOffset(node);
            },

            ImportExpression(node) {
                const openingParen = sourceCode.getFirstToken(node, 1);
                const closingParen = sourceCode.getLastToken(node);

                parameterParens.add(openingParen);
                parameterParens.add(closingParen);
                offsets.setDesiredOffset(openingParen, sourceCode.getTokenBefore(openingParen), 0);
                addElementListIndent([node.source], openingParen, closingParen, options.CallExpression.arguments);
            },

            "MemberExpression, JSXMemberExpression, MetaProperty"(node) {
                addMemberExpressionIndent(node);
            },

            NewExpression(node) {
                const hasParens =
                    node.arguments.length > 0 ||
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

            PropertyDefinition(node) {
                addPropertyDefinitionIndent(node);
            },

            StaticBlock(node) {
                const openingCurly = sourceCode.getFirstToken(node, { skip: 1 });
                const closingCurly = sourceCode.getLastToken(node);

                addElementListIndent(node.body, openingCurly, closingCurly, options.StaticBlock.body);
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
                const isSingleBlockStatement =
                    node.consequent.length === 1 &&
                    node.consequent[0].type === "BlockStatement";

                if (!isSingleBlockStatement) {
                    const caseKeyword = sourceCode.getFirstToken(node);
                    const tokenAfterCurrentCase = sourceCode.getTokenAfter(node);

                    offsets.setDesiredOffsets(
                        [caseKeyword.range[1], tokenAfterCurrentCase.range[0]],
                        caseKeyword,
                        1,
                    );
                }
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
                addVariableDeclarationIndent(node);
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
                offsets.setDesiredOffset(equalOperator, sourceCode.getLastToken(node.id), 0);
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
                    offsets.setDesiredOffset(sourceCode.getLastToken(node), closingToken, 0);
                } else {
                    closingToken = sourceCode.getLastToken(node);
                }

                offsets.setDesiredOffsets(node.name.range, sourceCode.getFirstToken(node));
                addElementListIndent(node.attributes, firstToken, closingToken, 1);
            },

            JSXClosingElement(node) {
                offsets.setDesiredOffsets(node.name.range, sourceCode.getFirstToken(node), 1);
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
        // Complex listener helpers (extracted for clarity)
        //----------------------------------------------------------------------

        function addConditionalExpressionIndent(node, firstToken) {
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
            offsets.setDesiredOffset(
                firstConsequentToken,
                firstToken,
                firstConsequentToken.type === "Punctuator" && options.offsetTernaryExpressions ? 2 : 1,
            );

            if (lastConsequentToken.loc.end.line === firstAlternateToken.loc.start.line) {
                offsets.setDesiredOffset(firstAlternateToken, firstConsequentToken, 0);
            } else {
                offsets.setDesiredOffset(
                    firstAlternateToken,
                    firstToken,
                    firstAlternateToken.type === "Punctuator" && options.offsetTernaryExpressions ? 2 : 1,
                );
            }
        }

        function handleSemicolonFirstStyle(node, nodeToCheck) {
            const lastToken = sourceCode.getLastToken(nodeToCheck);

            if (!astUtils.isSemicolonToken(lastToken)) return;

            const tokenBeforeLast = sourceCode.getTokenBefore(lastToken);
            const tokenAfterLast = sourceCode.getTokenAfter(lastToken);

            if (
                !astUtils.isTokenOnSameLine(tokenBeforeLast, lastToken) &&
                tokenAfterLast &&
                astUtils.isTokenOnSameLine(lastToken, tokenAfterLast)
            ) {
                offsets.setDesiredOffset(lastToken, sourceCode.getFirstToken(node), 0);
            }
        }

        function addImportFromOffset(node) {
            const fromToken = sourceCode.getLastToken(
                node,
                token => token.type === "Identifier" && token.value === "from",
            );

            if (!fromToken) return;

            const sourceToken = sourceCode.getLastToken(
                node,
                token => token.type === "String",
            );
            const semiToken = sourceCode.getLastToken(
                node,
                token => token.type === "Punctuator" && token.value === ";",
            );
            const end =
                semiToken && semiToken.range[1] === sourceToken.range[1]
                    ? node.range[1]
                    : sourceToken.range[1];

            offsets.setDesiredOffsets(
                [fromToken.range[0], end],
                sourceCode.getFirstToken(node),
                1,
            );
        }

        function addMemberExpressionIndent(node) {
            const object = node.type === "MetaProperty" ? node.meta : node.object;
            const firstNonObjectToken = sourceCode.getFirstTokenBetween(
                object,
                node.property,
                astUtils.isNotClosingParenToken,
            );
            const secondNonObjectToken = sourceCode.getTokenAfter(firstNonObjectToken);
            const objectParenCount = sourceCode.getTokensBetween(object, node.property, {
                filter: astUtils.isClosingParenToken,
            }).length;
            const firstObjectToken = objectParenCount
                ? sourceCode.getTokenBefore(object, { skip: objectParenCount - 1 })
                : sourceCode.getFirstToken(object);
            const lastObjectToken = sourceCode.getTokenBefore(firstNonObjectToken);
            const firstPropertyToken = node.computed ? firstNonObjectToken : secondNonObjectToken;

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

        function addPropertyDefinitionIndent(node) {
            const firstToken = sourceCode.getFirstToken(node);
            const maybeSemicolonToken = sourceCode.getLastToken(node);
            let keyLastToken;

            if (node.computed) {
                const bracketTokenL = sourceCode.getTokenBefore(node.key, astUtils.isOpeningBracketToken);
                const bracketTokenR = (keyLastToken = sourceCode.getTokenAfter(node.key, astUtils.isClosingBracketToken));
                const keyRange = [bracketTokenL.range[1], bracketTokenR.range[0]];

                if (bracketTokenL !== firstToken) {
                    offsets.setDesiredOffset(bracketTokenL, firstToken, 0);
                }
                offsets.setDesiredOffsets(keyRange, bracketTokenL, 1);
                offsets.setDesiredOffset(bracketTokenR, bracketTokenL, 0);
            } else {
                const idToken = (keyLastToken = sourceCode.getFirstToken(node.key));

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

        function addVariableDeclarationIndent(node) {
            const variableIndentOption = Object.hasOwn(options.VariableDeclarator, node.kind)
                ? options.VariableDeclarator[node.kind]
                : DEFAULT_VARIABLE_INDENT;

            const firstToken = sourceCode.getFirstToken(node);
            const lastToken = sourceCode.getLastToken(node);
            let variableIndent = variableIndentOption;

            if (variableIndentOption === "first") {
                if (node.declarations.length > 1) {
                    addElementListIndent(node.declarations, firstToken, lastToken, "first");
                    return;
                }
                variableIndent = DEFAULT_VARIABLE_INDENT;
            }

            const isMultiLine = node.declarations.at(-1).loc.start.line > node.loc.start.line;

            offsets.setDesiredOffsets(node.range, firstToken, variableIndent, isMultiLine);

            if (astUtils.isSemicolonToken(lastToken)) {
                offsets.ignoreToken(lastToken);
            }
        }

        //----------------------------------------------------------------------
        // Listener wiring
        //----------------------------------------------------------------------

        const ignoredNodeFirstTokens = new Set();
        const listenerCallQueue = [];
        const offsetListeners = {};

        for (const [selector, listener] of Object.entries(baseOffsetListeners)) {
            offsetListeners[selector] = node =>
                listenerCallQueue.push({ listener, node });
        }

        const ignoredNodes = new Set();

        function addToIgnoredNodes(node) {
            ignoredNodes.add(node);
            ignoredNodeFirstTokens.add(sourceCode.getFirstToken(node));
        }

        const ignoredNodeListeners = options.ignoredNodes.reduce(
            (listeners, selector) =>
                Object.assign(listeners, { [selector]: addToIgnoredNodes }),
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
                    sourceCode.getAllComments().forEach(comment => offsets.ignoreToken(comment));
                }

                for (const { listener, node } of listenerCallQueue) {
                    if (!ignoredNodes.has(node)) {
                        listener(node);
                    }
                }

                ignoredNodes.forEach(ignoreNode);
                addParensIndent(sourceCode.ast.tokens);

                const precedingTokens = buildPrecedingTokensMap(sourceCode);
                validateIndentation(precedingTokens);
            },
        });

        //----------------------------------------------------------------------
        // Final validation helpers
        //----------------------------------------------------------------------

        function buildPrecedingTokensMap(sourceCode) {
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

        function validateIndentation(precedingTokens) {
            for (let i = 1; i <= sourceCode.lines.length; i++) {
                if (!tokenInfo.firstTokensByLineNumber.has(i)) continue;

                const firstTokenOfLine = tokenInfo.firstTokensByLineNumber.get(i);

                if (firstTokenOfLine.loc.start.line !== i) continue;

                if (astUtils.isCommentToken(firstTokenOfLine)) {
                    if (shouldSkipComment(firstTokenOfLine, precedingTokens)) continue;
                }

                if (validateTokenIndent(firstTokenOfLine, offsets.getDesiredIndent(firstTokenOfLine))) {
                    continue;
                }

                report(firstTokenOfLine, offsets.getDesiredIndent(firstTokenOfLine));
            }
        }

        function shouldSkipComment(firstTokenOfLine, precedingTokens) {
            const tokenBefore = precedingTokens.get(firstTokenOfLine);
            const tokenAfter = tokenBefore
                ? sourceCode.getTokenAfter(tokenBefore)
                : sourceCode.ast.tokens[0];
            const mayAlignWithBefore = tokenBefore && !hasBlankLinesBetween(tokenBefore, firstTokenOfLine);
            const mayAlignWithAfter = tokenAfter && !hasBlankLinesBetween(firstTokenOfLine, tokenAfter);

            if (
                tokenAfter &&
                astUtils.isSemicolonToken(tokenAfter) &&
                !astUtils.isTokenOnSameLine(firstTokenOfLine, tokenAfter)
            ) {
                offsets.setDesiredOffset(firstTokenOfLine, tokenAfter, 0);
            }

            return (
                (mayAlignWithBefore &&
                    validateTokenIndent(firstTokenOfLine, offsets.getDesiredIndent(tokenBefore))) ||
                (mayAlignWithAfter &&
                    validateTokenIndent(firstTokenOfLine, offsets.getDesiredIndent(tokenAfter)))
            );
        }
    },
};
```

## Key Refactoring Changes

1. **Extracted `parseOptions`** — Moved option parsing logic out of `create()` into a dedicated function, reducing the function's cognitive load.

2. **Extracted `normalizeVariableDeclaratorOption`** — Isolated the VariableDeclarator normalization into its own function.

3. **Extracted `getBlockIndentLevel`** — Replaced a multi-branch `if/else` chain in the `BlockStatement` listener with a dedicated function.

4. **Extracted `isLegalIIFEAncestor`** — Simplified the `while` condition in `isOuterIIFE` by naming the predicate.

5. **Extracted complex listener logic** — Pulled out `addConditionalExpressionIndent`, `handleSemicolonFirstStyle`, `addImportFromOffset`, `addMemberExpressionIndent`, `addPropertyDefinitionIndent`, and `addVariableDeclarationIndent` from inline listener bodies.

6. **Extracted `collectParenPairs`** — Separated the paren-pair collection loop from `addParensIndent`.

7. **Extracted `buildPrecedingTokensMap` and `validateIndentation`/`shouldSkipComment`** — Broke up the large `Program:exit` handler into focused functions.

8. **Merged duplicate JSX listeners** — Combined `JSXExpressionContainer` and `JSXSpreadAttribute` into a single `"JSXExpressionContainer, JSXSpreadAttribute"` selector since they had identical bodies.

9. **Replaced `forEach` with `for...of`** where semantically equivalent for improved readability.

10. **Simplified `applyPreviousElementOffset`** — Extracted the previous-element offset logic from `addElementListIndent` into its own function.