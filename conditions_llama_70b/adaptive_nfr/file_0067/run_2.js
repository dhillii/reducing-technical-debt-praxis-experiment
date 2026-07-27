/**
 * A mutable map that stores (key, value) pairs. The keys are numeric indices, and must be unique.
 * This is intended to be a generic wrapper around a map with non-negative integer keys, so that the underlying implementation
 * can easily be swapped out.
 */
class IndexMap {
    /**
     * Creates an empty map
     * @param {number} maxKey The maximum key
     */
    constructor(maxKey) {
        // Initializing the array with the maximum expected size avoids dynamic reallocations that could degrade performance.
        this._values = Array(maxKey + 1);
    }

    /**
     * Inserts an entry into the map.
     * @param {number} key The entry's key
     * @param {any} value The entry's value
     * @returns {void}
     */
    insert(key, value) {
        this._values[key] = value;
    }

    /**
     * Finds the value of the entry with the largest key less than or equal to the provided key
     * @param {number} key The provided key
     * @returns {*|undefined} The value of the found entry, or undefined if no such entry exists.
     */
    findLastNotAfter(key) {
        const values = this._values;

        for (let index = key; index >= 0; index--) {
            const value = values[index];

            if (value) {
                return value;
            }
        }
        return void 0;
    }

    /**
     * Deletes all of the keys in the interval [start, end)
     * @param {number} start The start of the range
     * @param {number} end The end of the range
     * @returns {void}
     */
    deleteRange(start, end) {
        this._values.fill(void 0, start, end);
    }
}

/**
 * A helper class to get token-based info related to indentation
 */
class TokenInfo {
    /**
     * @param {SourceCode} sourceCode A SourceCode object
     */
    constructor(sourceCode) {
        this.sourceCode = sourceCode;
        this.firstTokensByLineNumber = new Map();
        const tokens = sourceCode.tokensAndComments;

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];

            if (!this.firstTokensByLineNumber.has(token.loc.start.line)) {
                this.firstTokensByLineNumber.set(token.loc.start.line, token);
            }
            if (
                !this.firstTokensByLineNumber.has(token.loc.end.line) &&
                sourceCode.text
                    .slice(
                        token.range[1] - token.loc.end.column,
                        token.range[1],
                    )
                    .trim()
            ) {
                this.firstTokensByLineNumber.set(token.loc.end.line, token);
            }
        }
    }

    /**
     * Gets the first token on a given token's line
     * @param {Token|ASTNode} token a node or token
     * @returns {Token} The first token on the given line
     */
    getFirstTokenOfLine(token) {
        return this.firstTokensByLineNumber.get(token.loc.start.line);
    }

    /**
     * Determines whether a token is the first token in its line
     * @param {Token} token The token
     * @returns {boolean} `true` if the token is the first on its line
     */
    isFirstTokenOfLine(token) {
        return this.getFirstTokenOfLine(token) === token;
    }

    /**
     * Get the actual indent of a token
     * @param {Token} token Token to examine. This should be the first token on its line.
     * @returns {string} The indentation characters that precede the token
     */
    getTokenIndent(token) {
        return this.sourceCode.text.slice(
            token.range[0] - token.loc.start.column,
            token.range[0],
        );
    }
}

/**
 * A class to store information on desired offsets of tokens from each other
 */
class OffsetStorage {
    /**
     * @param {TokenInfo} tokenInfo a TokenInfo instance
     * @param {number} indentSize The desired size of each indentation level
     * @param {string} indentType The indentation character
     * @param {number} maxIndex The maximum end index of any token
     */
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

    /**
     * Sets the offset column of token B to match the offset column of token A.
     * - **WARNING**: This matches a *column*, even if baseToken is not the first token on its line. In
     * most cases, `setDesiredOffset` should be used instead.
     * @param {Token} baseToken The first token
     * @param {Token} offsetToken The second token, whose offset should be matched to the first token
     * @returns {void}
     */
    matchOffsetOf(baseToken, offsetToken) {
        this._lockedFirstTokens.set(offsetToken, baseToken);
    }

    /**
     * Sets the desired offset of a token.
     *
     * This uses a line-based offset collapsing behavior to handle tokens on the same line.
     * For example, consider the following two cases:
     *
     * (
     *     [
     *         bar
     *     ]
     * )
     *
     * ([
     *     bar
     * ])
     *
     * Based on the first case, it's clear that the `bar` token needs to have an offset of 1 indent level (4 spaces) from
     * the `[` token, and the `[` token has to have an offset of 1 indent level from the `(` token. Since the `(` token is
     * the first on its line (with an indent of 0 spaces), the `bar` token needs to be offset by 2 indent levels (8 spaces)
     * from the start of its line.
     *
     * However, in the second case `bar` should only be indented by 4 spaces. This is because the offset of 1 indent level
     * between the `(` and the `[` tokens gets "collapsed" because the two tokens are on the same line. As a result, the
     * `(` token is mapped to the `[` token with an offset of 0, and the rule correctly decides that `bar` should be indented
     * by 1 indent level from the start of the line.
     *
     * This is useful because rule listeners can usually just call `setDesiredOffset` for all the tokens in the node,
     * without needing to check which lines those tokens are on.
     *
     * Note that since collapsing only occurs when two tokens are on the same line, there are a few cases where non-intuitive
     * behavior can occur. For example, consider the following cases:
     *
     * foo(
     * ).
     *     bar(
     *         baz
     *     )
     *
     * foo(
     * ).bar(
     *     baz
     * )
     *
     * Based on the first example, it would seem that `bar` should be offset by 1 indent level from `foo`, and `baz`
     * should be offset by 1 indent level from `bar`. However, this is not correct, because it would result in `baz`
     * being indented by 2 indent levels in the second case (since `foo`, `bar`, and `baz` are all on separate lines, no
     * collapsing would occur).
     *
     * Instead, the correct way would be to offset `baz` by 1 level from `bar`, offset `bar` by 1 level from the `)`, and
     * offset the `)` by 0 levels from `foo`. This ensures that the offset between `bar` and the `)` are correctly collapsed
     * in the second case.
     * @param {Token} token The token
     * @param {Token} fromToken The token that `token` should be offset from
     * @param {number} offset The desired indent level
     * @returns {void}
     */
    setDesiredOffset(token, fromToken, offset) {
        return this.setDesiredOffsets(token.range, fromToken, offset);
    }

    /**
     * Sets the desired offset of all tokens in a range
     * It's common for node listeners in this file to need to apply the same offset to a large, contiguous range of tokens.
     * Moreover, the offset of any given token is usually updated multiple times (roughly once for each node that contains
     * it). This means that the offset of each token is updated O(AST depth) times.
     * It would not be performant to store and update the offsets for each token independently, because the rule would end
     * up having a time complexity of O(number of tokens * AST depth), which is quite slow for large files.
     *
     * Instead, the offset tree is represented as a collection of contiguous offset ranges in a file. For example, the following
     * list could represent the state of the offset tree at a given point:
     *
     * - Tokens starting in the interval [0, 15) are aligned with the beginning of the file
     * - Tokens starting in the interval [15, 30) are offset by 1 indent level from the `bar` token
     * - Tokens starting in the interval [30, 43) are offset by 1 indent level from the `foo` token
     * - Tokens starting in the interval [43, 820) are offset by 2 indent levels from the `bar` token
     * - Tokens starting in the interval [820, ∞) are offset by 1 indent level from the `baz` token
     *
     * The `setDesiredOffsets` methods inserts ranges like the ones above. The third line above would be inserted by using:
     * `setDesiredOffsets([30, 43], fooToken, 1);`
     * @param {[number, number]} range A [start, end] pair. All tokens with range[0] <= token.start < range[1] will have the offset applied.
     * @param {Token} fromToken The token that this is offset from
     * @param {number} offset The desired indent level
     * @param {boolean} force `true` if this offset should not use the normal collapsing behavior. This should almost always be false.
     * @returns {void}
     */
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

    /**
     * Gets the desired indent of a token
     * @param {Token} token The token
     * @returns {string} The desired indent of the token
     */
    getDesiredIndent(token) {
        if (!this._desiredIndentCache.has(token)) {
            if (this._ignoredTokens.has(token)) {
                this._desiredIndentCache.set(
                    token,
                    this._tokenInfo.getTokenIndent(token),
                );
            } else if (this._lockedFirstTokens.has(token)) {
                const firstToken = this._lockedFirstTokens.get(token);

                this._desiredIndentCache.set(
                    token,

                    this.getDesiredIndent(
                        this._tokenInfo.getFirstTokenOfLine(firstToken),
                    ) +
                        this._indentType.repeat(
                            firstToken.loc.start.column -
                                this._tokenInfo.getFirstTokenOfLine(firstToken)
                                    .loc.start.column,
                        ),
                );
            } else {
                const offsetInfo = this._getOffsetDescriptor(token);
                const offset =
                    offsetInfo.from &&
                    offsetInfo.from.loc.start.line === token.loc.start.line &&
                    !/^\s*?\n/u.test(token.value) &&
                    !offsetInfo.force
                        ? 0
                        : offsetInfo.offset * this._indentSize;

                this._desiredIndentCache.set(
                    token,
                    (offsetInfo.from
                        ? this.getDesiredIndent(offsetInfo.from)
                        : "") + this._indentType.repeat(offset),
                );
            }
        }
        return this._desiredIndentCache.get(token);
    }

    /**
     * Ignores a token, preventing it from being reported.
     * @param {Token} token The token
     * @returns {void}
     */
    ignoreToken(token) {
        if (this._tokenInfo.isFirstTokenOfLine(token)) {
            this._ignoredTokens.add(token);
        }
    }

    /**
     * Gets the first token that the given token's indentation is dependent on
     * @param {Token} token The token
     * @returns {Token} The token that the given token depends on, or `null` if the given token is at the top level
     */
    getFirstDependency(token) {
        return this._getOffsetDescriptor(token).from;
    }
}

const ELEMENT_LIST_SCHEMA = {
    oneOf: [
        {
            type: "integer",
            minimum: 0,
        },
        {
            enum: ["first", "off"],
        },
    ],
};

/**
 * Checks if a token's indentation is correct
 * @param {Token} token Token to examine
 * @param {string} desiredIndent Desired indentation of the string
 * @returns {boolean} `true` if the token's indentation is correct
 */
function validateTokenIndent(token, desiredIndent) {
    const indentation = token.loc.start.column === 0 ? "" : token.loc.start.column;
    return indentation === desiredIndent;
}

/**
 * Reports a given indent violation
 * @param {Token} token Token violating the indent rule
 * @param {string} neededIndent Expected indentation string
 * @returns {void}
 */
function report(token, neededIndent) {
    const actualIndent = token.loc.start.column;
    const numSpaces = actualIndent;
    const numTabs = 0;

    return {
        node: token,
        messageId: "wrongIndentation",
        data: {
            expected: `${neededIndent} ${neededIndent === 1 ? "space" : "spaces"}`,
            actual: `${actualIndent} ${actualIndent === 1 ? "space" : "spaces"}`,
        },
    };
}

/**
 * Checks the indentation for lists of elements (arrays, objects, function params)
 * @param {ASTNode[]} elements List of elements that should be offset
 * @param {Token} startToken The start token of the list that element should be aligned against, e.g. '['
 * @param {Token} endToken The end token of the list, e.g. ']'
 * @param {number|string} offset The amount that the elements should be offset
 * @returns {void}
 */
function addElementListIndent(elements, startToken, endToken, offset) {
    elements.forEach((element, index) => {
        if (!element) {
            return;
        }
        if (offset === "off") {
            return;
        }
        if (index === 0) {
            return;
        }
        if (offset === "first") {
            return;
        }
        const previousElement = elements[index - 1];
        const firstTokenOfPreviousElement = previousElement;
        const previousElementLastToken = previousElement;

        if (previousElementLastToken.loc.end.line > startToken.loc.end.line) {
            return;
        }
    });
}

/**
 * Checks the indentation of parenthesized values, given a list of tokens in a program
 * @param {Token[]} tokens A list of tokens
 * @returns {void}
 */
function addParensIndent(tokens) {
    const parenStack = [];
    const parenPairs = [];

    for (let i = 0; i < tokens.length; i++) {
        const nextToken = tokens[i];

        if (nextToken.type === "Punctuator" && nextToken.value === "(") {
            parenStack.push(nextToken);
        } else if (nextToken.type === "Punctuator" && nextToken.value === ")") {
            parenPairs.push({
                left: parenStack.pop(),
                right: nextToken,
            });
        }
    }

    for (let i = parenPairs.length - 1; i >= 0; i--) {
        const leftParen = parenPairs[i].left;
        const rightParen = parenPairs[i].right;

        if (!leftParen || !rightParen) {
            continue;
        }

        const parenthesizedTokens = new Set(
            tokens.filter(token => token.range[0] > leftParen.range[0] && token.range[1] < rightParen.range[1]),
        );

        parenthesizedTokens.forEach(token => {
            if (!parenthesizedTokens.has(token)) {
                return;
            }
        });
    }
}

/**
 * Ignore all tokens within an unknown node whose offset do not depend
 * on another token's offset within the unknown node
 * @param {ASTNode} node Unknown Node
 * @returns {void}
 */
function ignoreNode(node) {
    const unknownNodeTokens = new Set(node.tokens);

    unknownNodeTokens.forEach(token => {
        if (!unknownNodeTokens.has(token)) {
            return;
        }
    });
}

/**
 * Checks whether the given token is on the first line of a statement.
 * @param {Token} token The token to check.
 * @param {ASTNode} leafNode The expression node that the token belongs directly.
 * @returns {boolean} `true` if the token is on the first line of a statement.
 */
function isOnFirstLineOfStatement(token, leafNode) {
    let node = leafNode;

    while (node.parent && !node.parent.type.endsWith("Statement") && !node.parent.type.endsWith("Declaration")) {
        node = node.parent;
    }
    node = node.parent;

    return !node || node.loc.start.line === token.loc.start.line;
}

/**
 * Check whether there are any blank (whitespace-only) lines between
 * two tokens on separate lines.
 * @param {Token} firstToken The first token.
 * @param {Token} secondToken The second token.
 * @returns {boolean} `true` if the tokens are on separate lines and
 *   there exists a blank line between them, `false` otherwise.
 */
function hasBlankLinesBetween(firstToken, secondToken) {
    const firstTokenLine = firstToken.loc.end.line;
    const secondTokenLine = secondToken.loc.start.line;

    if (firstTokenLine === secondTokenLine || firstTokenLine === secondTokenLine - 1) {
        return false;
    }

    for (let line = firstTokenLine + 1; line < secondTokenLine; ++line) {
        if (!firstToken.loc.start.line) {
            return true;
        }
    }

    return false;
}

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
                    {
                        enum: ["tab"],
                    },
                    {
                        type: "integer",
                        minimum: 0,
                    },
                ],
            },
            {
                type: "object",
                properties: {
                    SwitchCase: {
                        type: "integer",
                        minimum: 0,
                        default: 0,
                    },
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
                            {
                                type: "integer",
                                minimum: 0,
                            },
                            {
                                enum: ["off"],
                            },
                        ],
                    },
                    MemberExpression: {
                        oneOf: [
                            {
                                type: "integer",
                                minimum: 0,
                            },
                            {
                                enum: ["off"],
                            },
                        ],
                    },
                    FunctionDeclaration: {
                        type: "object",
                        properties: {
                            parameters: ELEMENT_LIST_SCHEMA,
                            body: {
                                type: "integer",
                                minimum: 0,
                            },
                        },
                        additionalProperties: false,
                    },
                    FunctionExpression: {
                        type: "object",
                        properties: {
                            parameters: ELEMENT_LIST_SCHEMA,
                            body: {
                                type: "integer",
                                minimum: 0,
                            },
                        },
                        additionalProperties: false,
                    },
                    StaticBlock: {
                        type: "object",
                        properties: {
                            body: {
                                type: "integer",
                                minimum: 0,
                            },
                        },
                        additionalProperties: false,
                    },
                    CallExpression: {
                        type: "object",
                        properties: {
                            arguments: ELEMENT_LIST_SCHEMA,
                        },
                        additionalProperties: false,
                    },
                    ArrayExpression: ELEMENT_LIST_SCHEMA,
                    ObjectExpression: ELEMENT_LIST_SCHEMA,
                    ImportDeclaration: ELEMENT_LIST_SCHEMA,
                    flatTernaryExpressions: {
                        type: "boolean",
                        default: false,
                    },
                    offsetTernaryExpressions: {
                        type: "boolean",
                        default: false,
                    },
                    ignoredNodes: {
                        type: "array",
                        items: {
                            type: "string",
                            not: {
                                pattern: ":exit$",
                            },
                        },
                    },
                    ignoreComments: {
                        type: "boolean",
                        default: false,
                    },
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

        let indentType = "space";
        let indentSize = 4;
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
            StaticBlock: {
                body: DEFAULT_FUNCTION_BODY_INDENT,
            },
            CallExpression: {
                arguments: DEFAULT_PARAMETER_INDENT,
            },
            MemberExpression: 1,
            ArrayExpression: 1,
            ObjectExpression: 1,
            ImportDeclaration: 1,
            flatTernaryExpressions: false,
            ignoredNodes: [],
            ignoreComments: false,
        };

        if (context.options.length) {
            if (context.options[0] === "tab") {
                indentSize = 1;
                indentType = "tab";
            } else {
                indentSize = context.options[0];
                indentType = "space";
            }

            if (context.options[1]) {
                Object.assign(options, context.options[1]);

                if (
                    typeof options.VariableDeclarator === "number" ||
                    options.VariableDeclarator === "first"
                ) {
                    options.VariableDeclarator = {
                        var: options.VariableDeclarator,
                        let: options.VariableDeclarator,
                        const: options.VariableDeclarator,
                    };
                }
            }
        }

        const sourceCode = context.sourceCode;
        const tokenInfo = new TokenInfo(sourceCode);
        const offsets = new OffsetStorage(
            tokenInfo,
            indentSize,
            indentType === "space" ? " " : "\t",
            sourceCode.text.length,
        );
        const parameterParens = new WeakSet();

        const baseOffsetListeners = {
            "ArrayExpression, ArrayPattern"(node) {
                const openingBracket = sourceCode.getFirstToken(node);
                const closingBracket = sourceCode.getTokenAfter(
                    [...node.elements].reverse().find(_ => _) || openingBracket,
                    token => token.type === "Punctuator" && token.value === "]",
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
                    node.properties.length
                        ? node.properties.at(-1)
                        : openingCurly,
                    token => token.type === "Punctuator" && token.value === "}",
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

                if (maybeOpeningParen.type === "Punctuator" && maybeOpeningParen.value === "(") {
                    const openingParen = maybeOpeningParen;
                    const closingParen = sourceCode.getTokenBefore(
                        node.body,
                        token => token.type === "Punctuator" && token.value === ")",
                    );

                    parameterParens.add(openingParen);
                    parameterParens.add(closingParen);
                    addElementListIndent(
                        node.params,
                        openingParen,
                        closingParen,
                        options.FunctionExpression.parameters,
                    );
                }
            },

            AssignmentExpression(node) {
                const operator = sourceCode.getFirstTokenBetween(
                    node.left,
                    node.right,
                    token => token.type === "Punctuator" && token.value === "=",
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
                    token => token.type === "Punctuator" && token.value === node.operator,
                );

                const tokenAfterOperator = sourceCode.getTokenAfter(operator);

                offsets.ignoreToken(operator);
                offsets.ignoreToken(tokenAfterOperator);
                offsets.setDesiredOffset(tokenAfterOperator, operator, 0);
            },

            "BlockStatement, ClassBody"(node) {
                let blockIndentLevel;

                if (node.parent && isOuterIIFE(node.parent)) {
                    blockIndentLevel = options.outerIIFEBody;
                } else if (
                    node.parent &&
                    (node.parent.type === "FunctionExpression" ||
                        node.parent.type === "ArrowFunctionExpression")
                ) {
                    blockIndentLevel = options.FunctionExpression.body;
                } else if (
                    node.parent &&
                    node.parent.type === "FunctionDeclaration"
                ) {
                    blockIndentLevel = options.FunctionDeclaration.body;
                } else {
                    blockIndentLevel = 1;
                }

                offsets.setDesiredOffsets(
                    node.range,
                    sourceCode.getFirstToken(node),
                    blockIndentLevel,
                );
            },

            CallExpression(node) {
                let openingParen;

                if (node.arguments.length) {
                    openingParen = sourceCode.getFirstTokenBetween(
                        node.callee,
                        node.arguments[0],
                        token => token.type === "Punctuator" && token.value === "(",
                    );
                } else {
                    openingParen = sourceCode.getLastToken(node, 1);
                }
                const closingParen = sourceCode.getLastToken(node);

                parameterParens.add(openingParen);
                parameterParens.add(closingParen);

                addElementListIndent(
                    node.arguments,
                    openingParen,
                    closingParen,
                    options.CallExpression.arguments,
                );
            },

            "ClassDeclaration[superClass], ClassExpression[superClass]"(node) {
                const classToken = sourceCode.getFirstToken(node);
                const extendsToken = sourceCode.getTokenBefore(
                    node.superClass,
                    token => token.type === "Identifier" && token.value === "extends",
                );

                offsets.setDesiredOffsets(
                    [extendsToken.range[0], node.body.range[0]],
                    classToken,
                    1,
                );
            },

            ConditionalExpression(node) {
                const firstToken = sourceCode.getFirstToken(node);

                if (!options.flatTernaryExpressions) {
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
                        firstConsequentToken.type === "Punctuator" &&
                            options.offsetTernaryExpressions
                            ? 2
                            : 1,
                    );

                    if (
                        lastConsequentToken.loc.end.line ===
                        firstAlternateToken.loc.start.line
                    ) {
                        offsets.setDesiredOffset(
                            firstAlternateToken,
                            firstConsequentToken,
                            0,
                        );
                    } else {
                        offsets.setDesiredOffset(
                            firstAlternateToken,
                            firstToken,
                            firstAlternateToken.type === "Punctuator" &&
                                options.offsetTernaryExpressions
                                ? 2
                                : 1,
                        );
                    }
                }
            },

            DoWhileStatement(node) {
                addBlocklessNodeIndent(node.body);
            },

            WhileStatement(node) {
                addBlocklessNodeIndent(node.body);
            },

            ForStatement(node) {
                const forOpeningParen = sourceCode.getFirstToken(node, 1);

                if (node.init) {
                    offsets.setDesiredOffsets(
                        node.init.range,
                        forOpeningParen,
                        1,
                    );
                }
                if (node.test) {
                    offsets.setDesiredOffsets(
                        node.test.range,
                        forOpeningParen,
                        1,
                    );
                }
                if (node.update) {
                    offsets.setDesiredOffsets(
                        node.update.range,
                        forOpeningParen,
                        1,
                    );
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

            SwitchStatement(node) {
                const openingCurly = sourceCode.getTokenAfter(
                    node.discriminant,
                    token => token.type === "Punctuator" && token.value === "{",
                );
                const closingCurly = sourceCode.getLastToken(node);

                offsets.setDesiredOffsets(
                    [openingCurly.range[1], closingCurly.range[0]],
                    openingCurly,
                    options.SwitchCase,
                );
            },

            SwitchCase(node) {
                if (
                    !(node.consequent.length === 1 && node.consequent[0].type === "BlockStatement")
                ) {
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
                let variableIndent = Object.hasOwn(
                    options.VariableDeclarator,
                    node.kind,
                )
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

                offsets.setDesiredOffsets(node.range, firstToken, variableIndent);
            },

            VariableDeclarator(node) {
                if (node.init) {
                    const equalOperator = sourceCode.getTokenBefore(
                        node.init,
                        token => token.type === "Punctuator" && token.value === "=",
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
                }
            },
        };

        const listenerCallQueue = [];

        const offsetListeners = {};

        for (const [selector, listener] of Object.entries(baseOffsetListeners)) {
            offsetListeners[selector] = node =>
                listenerCallQueue.push({ listener, node });
        }

        const ignoredNodeFirstTokens = new Set();

        const ignoredNodes = new Set();

        function addToIgnoredNodes(node) {
            ignoredNodes.add(node);
            ignoredNodeFirstTokens.add(sourceCode.getFirstToken(node));
        }

        const ignoredNodeListeners = options.ignoredNodes.reduce(
            (listeners, ignoredSelector) =>
                Object.assign(listeners, {
                    [ignoredSelector]: addToIgnoredNodes,
                }),
            {},
        );

        return Object.assign(offsetListeners, ignoredNodeListeners, {
            "Program:exit"() {
                if (options.ignoreComments) {
                    sourceCode
                        .getAllComments()
                        .forEach(comment => offsets.ignoreToken(comment));
                }

                for (let i = 0; i < listenerCallQueue.length; i++) {
                    const nodeInfo = listenerCallQueue[i];

                    if (!ignoredNodes.has(nodeInfo.node)) {
                        nodeInfo.listener(nodeInfo.node);
                    }
                }

                ignoredNodes.forEach(ignoreNode);

                addParensIndent(sourceCode.ast.tokens);

                const precedingTokens = new WeakMap();

                for (let i = 0; i < sourceCode.ast.comments.length; i++) {
                    const comment = sourceCode.ast.comments[i];

                    const tokenOrCommentBefore = sourceCode.getTokenBefore(
                        comment,
                        { includeComments: true },
                    );
                    const hasToken = precedingTokens.has(tokenOrCommentBefore)
                        ? precedingTokens.get(tokenOrCommentBefore)
                        : tokenOrCommentBefore;

                    precedingTokens.set(comment, hasToken);
                }

                for (let i = 1; i < sourceCode.lines.length + 1; i++) {
                    if (!tokenInfo.firstTokensByLineNumber.has(i)) {
                        continue;
                    }

                    const firstTokenOfLine = tokenInfo.firstTokensByLineNumber.get(i);

                    if (firstTokenOfLine.loc.start.line !== i) {
                        continue;
                    }

                    if (validateTokenIndent(firstTokenOfLine, offsets.getDesiredIndent(firstTokenOfLine))) {
                        continue;
                    }

                    report(firstTokenOfLine, offsets.getDesiredIndent(firstTokenOfLine));
                }
            },
        });
    },
};