Looking at this code, I'll identify key areas for refactoring:

1. **Extract option parsing** into a dedicated function
2. **Reduce repetitive patterns** in node handlers
3. **Simplify complex conditionals** by extracting helper functions
4. **Consolidate similar handlers** that share logic

```javascript
/**
 * @fileoverview Disallow parenthesising higher precedence subexpressions.
 * @author Michael Ficarra
 * @deprecated in ESLint v8.53.0
 */
"use strict";

const { isParenthesized: isParenthesizedRaw } = require("@eslint-community/eslint-utils");
const astUtils = require("./utils/ast-utils.js");

//------------------------------------------------------------------------------
// Constants
//------------------------------------------------------------------------------

const SCHEMA = {
    anyOf: [
        {
            type: "array",
            items: [{ enum: ["functions"] }],
            minItems: 0,
            maxItems: 1,
        },
        {
            type: "array",
            items: [
                { enum: ["all"] },
                {
                    type: "object",
                    properties: {
                        conditionalAssign: { type: "boolean" },
                        ternaryOperandBinaryExpressions: { type: "boolean" },
                        nestedBinaryExpressions: { type: "boolean" },
                        returnAssign: { type: "boolean" },
                        ignoreJSX: { enum: ["none", "all", "single-line", "multi-line"] },
                        enforceForArrowConditionals: { type: "boolean" },
                        enforceForSequenceExpressions: { type: "boolean" },
                        enforceForNewInMemberExpressions: { type: "boolean" },
                        enforceForFunctionPrototypeMethods: { type: "boolean" },
                        allowParensAfterCommentPattern: { type: "string" },
                    },
                    additionalProperties: false,
                },
            ],
            minItems: 0,
            maxItems: 2,
        },
    ],
};

const META = {
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
                    name: "no-extra-parens",
                    url: "https://eslint.style/rules/no-extra-parens",
                },
            },
        ],
    },
    type: "layout",
    docs: {
        description: "Disallow unnecessary parentheses",
        recommended: false,
        url: "https://eslint.org/docs/latest/rules/no-extra-parens",
    },
    fixable: "code",
    schema: SCHEMA,
    messages: {
        unexpected: "Unnecessary parentheses around expression.",
    },
};

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Parses rule options into a normalized config object.
 * @param {Array} options Raw context.options
 * @returns {object} Parsed configuration flags
 */
function parseOptions(options) {
    const allNodes = options[0] !== "functions";
    const opts = (allNodes && options[1]) || {};

    const flag = (key, defaultVal = true) =>
        allNodes && opts[key] !== undefined ? opts[key] : allNodes && defaultVal;

    return {
        ALL_NODES: allNodes,
        EXCEPT_COND_ASSIGN: allNodes && opts.conditionalAssign === false,
        EXCEPT_COND_TERNARY: allNodes && opts.ternaryOperandBinaryExpressions === false,
        NESTED_BINARY: allNodes && opts.nestedBinaryExpressions === false,
        EXCEPT_RETURN_ASSIGN: allNodes && opts.returnAssign === false,
        IGNORE_JSX: allNodes && opts.ignoreJSX,
        IGNORE_ARROW_CONDITIONALS: allNodes && opts.enforceForArrowConditionals === false,
        IGNORE_SEQUENCE_EXPRESSIONS: allNodes && opts.enforceForSequenceExpressions === false,
        IGNORE_NEW_IN_MEMBER_EXPR: allNodes && opts.enforceForNewInMemberExpressions === false,
        IGNORE_FUNCTION_PROTOTYPE_METHODS: allNodes && opts.enforceForFunctionPrototypeMethods === false,
        ALLOW_PARENS_AFTER_COMMENT_PATTERN: allNodes && opts.allowParensAfterCommentPattern,
    };
}

/**
 * Determines if a node is a `call` or `apply` method call on a FunctionExpression.
 * @param {ASTNode} node
 * @returns {boolean}
 */
function isImmediateFunctionPrototypeMethodCall(node) {
    const callNode = astUtils.skipChainExpression(node);
    if (callNode.type !== "CallExpression") return false;

    const callee = astUtils.skipChainExpression(callNode.callee);
    return (
        callee.type === "MemberExpression" &&
        callee.object.type === "FunctionExpression" &&
        ["call", "apply"].includes(astUtils.getStaticPropertyName(callee))
    );
}

/**
 * Determines if a node is an IIFE.
 * @param {ASTNode} node
 * @returns {boolean}
 */
function isIIFE(node) {
    const maybeCallNode = astUtils.skipChainExpression(node);
    return (
        maybeCallNode.type === "CallExpression" &&
        maybeCallNode.callee.type === "FunctionExpression"
    );
}

/**
 * Determines if a node can be an assignment target.
 * @param {ASTNode} node
 * @returns {boolean}
 */
function canBeAssignmentTarget(node) {
    return node && (node.type === "Identifier" || node.type === "MemberExpression");
}

/**
 * Determines if a node is or contains an assignment expression.
 * @param {ASTNode} node
 * @returns {boolean}
 */
function containsAssignment(node) {
    if (node.type === "AssignmentExpression") return true;

    if (
        node.type === "ConditionalExpression" &&
        (node.consequent.type === "AssignmentExpression" ||
            node.alternate.type === "AssignmentExpression")
    ) {
        return true;
    }

    return (
        (node.left && node.left.type === "AssignmentExpression") ||
        (node.right && node.right.type === "AssignmentExpression")
    );
}

/**
 * Checks whether the syntax of an ancestor of an 'in' expression safely encloses it.
 * @param {ASTNode} node
 * @param {ASTNode} child
 * @returns {boolean}
 */
function isSafelyEnclosingInExpression(node, child) {
    switch (node.type) {
        case "ArrayExpression":
        case "ArrayPattern":
        case "BlockStatement":
        case "ObjectExpression":
        case "ObjectPattern":
        case "TemplateLiteral":
            return true;
        case "ArrowFunctionExpression":
        case "FunctionExpression":
            return node.params.includes(child);
        case "CallExpression":
        case "NewExpression":
            return node.arguments.includes(child);
        case "MemberExpression":
            return node.computed && node.property === child;
        case "ConditionalExpression":
            return node.consequent === child;
        default:
            return false;
    }
}

/**
 * Checks if a MemberExpression is at a NewExpression's callee position.
 * @param {ASTNode} node
 * @returns {boolean}
 */
function isMemberExpInNewCallee(node) {
    if (node.type !== "MemberExpression") return false;

    if (node.parent.type === "NewExpression" && node.parent.callee === node) {
        return true;
    }

    return node.parent.object === node && isMemberExpInNewCallee(node.parent);
}

/**
 * Checks if a MemberExpression contains a CallExpression in its object chain.
 * @param {ASTNode} node
 * @returns {boolean}
 */
function doesMemberExpressionContainCallExpression(node) {
    let current = node.object;
    while (current.type === "MemberExpression") {
        current = current.object;
    }
    return current.type === "CallExpression";
}

/**
 * Checks if an assignment has anonymous function/class on the right with a plain identifier on the left.
 * @param {ASTNode} node AssignmentExpression
 * @returns {boolean}
 */
function isAnonymousFunctionAssignmentException({ left, operator, right }) {
    if (!left || left.type !== "Identifier") return false;
    if (!["=", "&&=", "||=", "??="].includes(operator)) return false;

    const { type, id } = right;
    return (
        type === "ArrowFunctionExpression" ||
        ((type === "FunctionExpression" || type === "ClassExpression") && !id)
    );
}

/**
 * Finds the path from node up to ancestor.
 * @param {ASTNode} node
 * @param {ASTNode} ancestor
 * @returns {ASTNode[]}
 */
function pathToAncestor(node, ancestor) {
    const path = [node];
    let current = node;

    while (current !== ancestor) {
        current = current.parent;
        if (current === null) {
            throw new Error("Nodes are not in the ancestor-descendant relationship.");
        }
        path.push(current);
    }

    return path;
}

/**
 * Finds the path from node down to descendant.
 * @param {ASTNode} node
 * @param {ASTNode} descendant
 * @returns {ASTNode[]}
 */
function pathToDescendant(node, descendant) {
    return pathToAncestor(descendant, node).reverse();
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

/** @type {import('../types').Rule.RuleModule} */
module.exports = {
    meta: META,

    create(context) {
        const sourceCode = context.sourceCode;
        const tokensToIgnore = new WeakSet();
        const precedence = astUtils.getPrecedence;

        const {
            ALL_NODES,
            EXCEPT_COND_ASSIGN,
            EXCEPT_COND_TERNARY,
            NESTED_BINARY,
            EXCEPT_RETURN_ASSIGN,
            IGNORE_JSX,
            IGNORE_ARROW_CONDITIONALS,
            IGNORE_SEQUENCE_EXPRESSIONS,
            IGNORE_NEW_IN_MEMBER_EXPR,
            IGNORE_FUNCTION_PROTOTYPE_METHODS,
            ALLOW_PARENS_AFTER_COMMENT_PATTERN,
        } = parseOptions(context.options);

        const PRECEDENCE_OF_ASSIGNMENT_EXPR = precedence({ type: "AssignmentExpression" });
        const PRECEDENCE_OF_UPDATE_EXPR = precedence({ type: "UpdateExpression" });

        let reportsBuffer;

        // ------------------------------------------------------------------
        // Parenthesis detection helpers
        // ------------------------------------------------------------------

        function isParenthesised(node) {
            return isParenthesizedRaw(1, node, sourceCode);
        }

        function isParenthesisedTwice(node) {
            return isParenthesizedRaw(2, node, sourceCode);
        }

        /**
         * Determines if this rule should be enforced for a node.
         * @param {ASTNode} node
         * @returns {boolean}
         */
        function ruleApplies(node) {
            if (node.type === "JSXElement" || node.type === "JSXFragment") {
                const isSingleLine = node.loc.start.line === node.loc.end.line;

                switch (IGNORE_JSX) {
                    case "all": return false;
                    case "multi-line": return isSingleLine;
                    case "single-line": return !isSingleLine;
                    case "none": break;
                    // no default
                }
            }

            if (node.type === "SequenceExpression" && IGNORE_SEQUENCE_EXPRESSIONS) {
                return false;
            }

            if (isImmediateFunctionPrototypeMethodCall(node) && IGNORE_FUNCTION_PROTOTYPE_METHODS) {
                return false;
            }

            return (
                ALL_NODES ||
                node.type === "FunctionExpression" ||
                node.type === "ArrowFunctionExpression"
            );
        }

        function hasExcessParens(node) {
            return ruleApplies(node) && isParenthesised(node);
        }

        function hasDoubleExcessParens(node) {
            return ruleApplies(node) && isParenthesisedTwice(node);
        }

        function hasExcessParensWithPrecedence(node, precedenceLowerLimit) {
            return (
                ruleApplies(node) &&
                isParenthesised(node) &&
                (precedence(node) >= precedenceLowerLimit || isParenthesisedTwice(node))
            );
        }

        function hasExcessParensNoLineTerminator(token, node) {
            return token.loc.end.line === node.loc.start.line
                ? hasExcessParens(node)
                : hasDoubleExcessParens(node);
        }

        // ------------------------------------------------------------------
        // Assignment / return helpers
        // ------------------------------------------------------------------

        function isCondAssignException(node) {
            return EXCEPT_COND_ASSIGN && node.test.type === "AssignmentExpression";
        }

        function isInReturnStatement(node) {
            for (let current = node; current; current = current.parent) {
                if (
                    current.type === "ReturnStatement" ||
                    (current.type === "ArrowFunctionExpression" &&
                        current.body.type !== "BlockStatement")
                ) {
                    return true;
                }
            }
            return false;
        }

        function isReturnAssignException(node) {
            if (!EXCEPT_RETURN_ASSIGN || !isInReturnStatement(node)) return false;

            if (node.type === "ReturnStatement") {
                return node.argument && containsAssignment(node.argument);
            }
            if (node.type === "ArrowFunctionExpression" && node.body.type !== "BlockStatement") {
                return containsAssignment(node.body);
            }
            return containsAssignment(node);
        }

        // ------------------------------------------------------------------
        // Fix helpers
        // ------------------------------------------------------------------

        function requiresLeadingSpace(node) {
            const leftParenToken = sourceCode.getTokenBefore(node);
            const tokenBeforeLeftParen = sourceCode.getTokenBefore(leftParenToken, {
                includeComments: true,
            });
            const tokenAfterLeftParen = sourceCode.getTokenAfter(leftParenToken, {
                includeComments: true,
            });

            return (
                tokenBeforeLeftParen &&
                tokenBeforeLeftParen.range[1] === leftParenToken.range[0] &&
                leftParenToken.range[1] === tokenAfterLeftParen.range[0] &&
                !astUtils.canTokensBeAdjacent(tokenBeforeLeftParen, tokenAfterLeftParen)
            );
        }

        function requiresTrailingSpace(node) {
            const nextTwoTokens = sourceCode.getTokensAfter(node, { count: 2 });
            const rightParenToken = nextTwoTokens[0];
            const tokenAfterRightParen = nextTwoTokens[1];
            const tokenBeforeRightParen = sourceCode.getLastToken(node);

            return (
                rightParenToken &&
                tokenAfterRightParen &&
                !sourceCode.isSpaceBetween(rightParenToken, tokenAfterRightParen) &&
                !astUtils.canTokensBeAdjacent(tokenBeforeRightParen, tokenAfterRightParen)
            );
        }

        function isNewExpressionWithParens(newExpression) {
            const lastToken = sourceCode.getLastToken(newExpression);
            const penultimateToken = sourceCode.getTokenBefore(lastToken);

            return (
                newExpression.arguments.length > 0 ||
                (astUtils.isOpeningParenToken(penultimateToken) &&
                    astUtils.isClosingParenToken(lastToken) &&
                    newExpression.callee.range[1] < newExpression.range[1])
            );
        }

        function isFixable(node) {
            if (node.type !== "Literal" || typeof node.value !== "string") return true;
            if (isParenthesisedTwice(node)) return true;
            return !astUtils.isTopLevelExpressionStatement(node.parent);
        }

        function shouldAllowCommentPattern(leftParenToken) {
            if (!ALLOW_PARENS_AFTER_COMMENT_PATTERN) return false;

            const comments = sourceCode.getCommentsBefore(leftParenToken);
            if (!comments.length) return false;

            const ignorePattern = new RegExp(ALLOW_PARENS_AFTER_COMMENT_PATTERN, "u");
            return ignorePattern.test(comments[comments.length - 1].value);
        }

        // ------------------------------------------------------------------
        // Reporting
        // ------------------------------------------------------------------

        function buildFixer(node, leftParenToken, rightParenToken) {
            if (!isFixable(node)) return null;

            return fixer => {
                const inner = sourceCode.text.slice(
                    leftParenToken.range[1],
                    rightParenToken.range[0],
                );
                return fixer.replaceTextRange(
                    [leftParenToken.range[0], rightParenToken.range[1]],
                    (requiresLeadingSpace(node) ? " " : "") +
                        inner +
                        (requiresTrailingSpace(node) ? " " : ""),
                );
            };
        }

        function report(node) {
            const leftParenToken = sourceCode.getTokenBefore(node);
            const rightParenToken = sourceCode.getTokenAfter(node);

            if (!isParenthesisedTwice(node)) {
                if (tokensToIgnore.has(sourceCode.getFirstToken(node))) return;
                if (isIIFE(node) && !isParenthesised(node.callee)) return;
                if (shouldAllowCommentPattern(leftParenToken)) return;
            }

            const finishReport = () => {
                context.report({
                    node,
                    loc: leftParenToken.loc,
                    messageId: "unexpected",
                    fix: buildFixer(node, leftParenToken, rightParenToken),
                });
            };

            if (reportsBuffer) {
                reportsBuffer.reports.push({ node, finishReport });
            } else {
                finishReport();
            }
        }

        function reportIfExcessParens(node) {
            if (hasExcessParens(node)) report(node);
        }

        function reportIfExcessParensWithPrecedence(node, limit) {
            if (hasExcessParensWithPrecedence(node, limit)) report(node);
        }

        // ------------------------------------------------------------------
        // Reports buffer
        // ------------------------------------------------------------------

        function startNewReportsBuffering() {
            reportsBuffer = {
                upper: reportsBuffer,
                inExpressionNodes: [],
                reports: [],
            };
        }

        function endCurrentReportsBuffering() {
            const { upper, inExpressionNodes, reports } = reportsBuffer;

            if (upper) {
                upper.inExpressionNodes.push(...inExpressionNodes);
                upper.reports.push(...reports);
            } else {
                reports.forEach(({ finishReport }) => finishReport());
            }

            reportsBuffer = upper;
        }

        function isInCurrentReportsBuffer(node) {
            return reportsBuffer.reports.some(r => r.node === node);
        }

        function removeFromCurrentReportsBuffer(node) {
            reportsBuffer.reports = reportsBuffer.reports.filter(r => r.node !== node);
        }

        // ------------------------------------------------------------------
        // Node-specific checkers
        // ------------------------------------------------------------------

        function checkArgumentWithPrecedence(node) {
            reportIfExcessParensWithPrecedence(node.argument, precedence(node));
        }

        function checkCallNew(node) {
            const callee = node.callee;

            if (hasExcessParensWithPrecedence(callee, precedence(node))) {
                const isAllowedCallee =
                    !hasDoubleExcessParens(callee) &&
                    (isIIFE(node) ||
                        (callee.type === "NewExpression" &&
                            !isNewExpressionWithParens(callee) &&
                            !(node.type === "NewExpression" && !isNewExpressionWithParens(node))) ||
                        (node.type === "NewExpression" &&
                            callee.type === "MemberExpression" &&
                            doesMemberExpressionContainCallExpression(callee)) ||
                        (!node.optional && callee.type === "ChainExpression"));

                if (!isAllowedCallee) {
                    report(callee);
                }
            }

            node.arguments
                .filter(arg => hasExcessParensWithPrecedence(arg, PRECEDENCE_OF_ASSIGNMENT_EXPR))
                .forEach(report);
        }

        function checkBinaryLogical(node) {
            const prec = precedence(node);
            const isExponentiation = node.operator === "**";

            const isBinaryOrLogical = n =>
                n.type === "BinaryExpression" || n.type === "LogicalExpression";

            const shouldSkipLeft = NESTED_BINARY && isBinaryOrLogical(node.left);
            const shouldSkipRight = NESTED_BINARY && isBinaryOrLogical(node.right);

            if (!shouldSkipLeft && hasExcessParens(node.left)) {
                const leftPrec = precedence(node.left);
                const isSafeLeft =
                    (["AwaitExpression", "UnaryExpression"].includes(node.left.type) && isExponentiation) ||
                    astUtils.isMixedLogicalAndCoalesceExpressions(node.left, node);
                const hasHigherOrEqualPrec =
                    leftPrec > prec || (leftPrec === prec && !isExponentiation);

                if ((!isSafeLeft && hasHigherOrEqualPrec) || isParenthesisedTwice(node.left)) {
                    report(node.left);
                }
            }

            if (!shouldSkipRight && hasExcessParens(node.right)) {
                const rightPrec = precedence(node.right);
                const isSafeRight = astUtils.isMixedLogicalAndCoalesceExpressions(node.right, node);
                const hasHigherOrEqualPrec =
                    rightPrec > prec || (rightPrec === prec && isExponentiation);

                if ((!isSafeRight && hasHigherOrEqualPrec) || isParenthesisedTwice(node.right)) {
                    report(node.right);
                }
            }
        }

        function checkClass(node) {
            if (!node.superClass) return;

            const hasExtraParens =
                precedence(node.superClass) > PRECEDENCE_OF_UPDATE_EXPR
                    ? hasExcessParens(node.superClass)
                    : hasDoubleExcessParens(node.superClass);

            if (hasExtraParens) report(node.superClass);
        }

        function checkSpreadOperator(node) {
            reportIfExcessParensWithPrecedence(node.argument, PRECEDENCE_OF_ASSIGNMENT_EXPR);
        }

        function checkExpressionOrExportStatement(node) {
            const firstToken = isParenthesised(node)
                ? sourceCode.getTokenBefore(node)
                : sourceCode.getFirstToken(node);

            const secondToken = sourceCode.getTokenAfter(firstToken, astUtils.isNotOpeningParenToken);
            const thirdToken = secondToken ? sourceCode.getTokenAfter(secondToken) : null;
            const tokenAfterClosingParens = secondToken
                ? sourceCode.getTokenAfter(secondToken, astUtils.isNotClosingParenToken)
                : null;

            if (astUtils.isOpeningParenToken(firstToken) && secondToken) {
                const isLetWithBracket =
                    secondToken.type === "Keyword" &&
                    secondToken.value === "let" &&
                    tokenAfterClosingParens &&
                    (astUtils.isOpeningBracketToken(tokenAfterClosingParens) ||
                        tokenAfterClosingParens.type === "Identifier");

                const isAsyncFunction =
                    secondToken.type === "Identifier" &&
                    secondToken.value === "async" &&
                    thirdToken &&
                    thirdToken.type === "Keyword" &&
                    thirdToken.value === "function";

                const isKeywordThatNeedsParens =
                    secondToken.type === "Keyword" &&
                    (secondToken.value === "function" || secondToken.value === "class");

                if (
                    astUtils.isOpeningBraceToken(secondToken) ||
                    isKeywordThatNeedsParens ||
                    isLetWithBracket ||
                    isAsyncFunction
                ) {
                    tokensToIgnore.add(secondToken);
                }
            }

            const hasExtraParens =
                node.parent.type === "ExportDefaultDeclaration"
                    ? hasExcessParensWithPrecedence(node, PRECEDENCE_OF_ASSIGNMENT_EXPR)
                    : hasExcessParens(node);

            if (hasExtraParens) report(node);
        }

        function handleForLeftToken(node) {
            if (node.left.type === "VariableDeclaration") return;

            const firstLeftToken = sourceCode.getFirstToken(
                node.left,
                astUtils.isNotOpeningParenToken,
            );

            if (firstLeftToken.value === "let") {
                const nextToken = sourceCode.getTokenAfter(
                    firstLeftToken,
                    astUtils.isNotClosingParenToken,
                );
                if (
                    node.type === "ForInStatement" &&
                    astUtils.isOpeningBracketToken(nextToken)
                ) {
                    tokensToIgnore.add(firstLeftToken);
                } else if (node.type === "ForOfStatement") {
                    tokensToIgnore.add(firstLeftToken);
                }
            }
        }

        // ------------------------------------------------------------------
        // Visitor
        // ------------------------------------------------------------------

        return {
            ArrayExpression(node) {
                node.elements
                    .filter(e => e && hasExcessParensWithPrecedence(e, PRECEDENCE_OF_ASSIGNMENT_EXPR))
                    .forEach(report);
            },

            ArrayPattern(node) {
                node.elements
                    .filter(e => canBeAssignmentTarget(e) && hasExcessParens(e))
                    .forEach(report);
            },

            ArrowFunctionExpression(node) {
                if (isReturnAssignException(node)) return;
                if (node.body.type === "ConditionalExpression" && IGNORE_ARROW_CONDITIONALS) return;

                if (node.body.type !== "BlockStatement") {
                    const firstBodyToken = sourceCode.getFirstToken(
                        node.body,
                        astUtils.isNotOpeningParenToken,
                    );
                    const tokenBeforeFirst = sourceCode.getTokenBefore(firstBodyToken);

                    if (
                        astUtils.isOpeningParenToken(tokenBeforeFirst) &&
                        astUtils.isOpeningBraceToken(firstBodyToken)
                    ) {
                        tokensToIgnore.add(firstBodyToken);
                    }

                    reportIfExcessParensWithPrecedence(node.body, PRECEDENCE_OF_ASSIGNMENT_EXPR);
                }
            },

            AssignmentExpression(node) {
                if (
                    canBeAssignmentTarget(node.left) &&
                    hasExcessParens(node.left) &&
                    (!isAnonymousFunctionAssignmentException(node) ||
                        isParenthesisedTwice(node.left))
                ) {
                    report(node.left);
                }

                if (
                    !isReturnAssignException(node) &&
                    hasExcessParensWithPrecedence(node.right, precedence(node))
                ) {
                    report(node.right);
                }
            },

            BinaryExpression(node) {
                if (reportsBuffer && node.operator === "in") {
                    reportsBuffer.inExpressionNodes.push(node);
                }
                checkBinaryLogical(node);
            },

            CallExpression: checkCallNew,

            ConditionalExpression(node) {
                if (isReturnAssignException(node)) return;

                const isBinaryOrLogical = n =>
                    n.type === "BinaryExpression" || n.type === "LogicalExpression";

                if (
                    !(EXCEPT_COND_TERNARY && isBinaryOrLogical(node.test)) &&
                    !isCondAssignException(node) &&
                    hasExcessParensWithPrecedence(
                        node.test,
                        precedence({ type: "LogicalExpression", operator: "||" }),
                    )
                ) {
                    report(node.test);
                }

                for (const branch of [node.consequent, node.alternate]) {
                    if (
                        !(EXCEPT_COND_TERNARY && isBinaryOrLogical(branch)) &&
                        hasExcessParensWithPrecedence(branch, PRECEDENCE_OF_ASSIGNMENT_EXPR)
                    ) {
                        report(branch);
                    }
                }
            },

            DoWhileStatement(node) {
                if (hasExcessParens(node.test) && !isCondAssignException(node)) {
                    report(node.test);
                }
            },

            ExportDefaultDeclaration: node => checkExpressionOrExportStatement(node.declaration),
            ExpressionStatement: node => checkExpressionOrExportStatement(node.expression),

            ForInStatement(node) {
                handleForLeftToken(node);
                if (hasExcessParens(node.left)) report(node.left);
                if (hasExcessParens(node.right)) report(node.right);
            },

            ForOfStatement(node) {
                handleForLeftToken(node);
                if (hasExcessParens(node.left)) report(node.left);
                reportIfExcessParensWithPrecedence(node.right, PRECEDENCE_OF_ASSIGNMENT_EXPR);
            },

            ForStatement(node) {
                if (node.test && hasExcessParens(node.test) && !isCondAssignException(node)) {
                    report(node.test);
                }

                if (node.update && hasExcessParens(node.update)) {
                    report(node.update);
                }

                if (node.init) {
                    if (node.init.type !== "VariableDeclaration") {
                        const firstToken = sourceCode.getFirstToken(
                            node.init,
                            astUtils.isNotOpeningParenToken,
                        );

                        if (
                            firstToken.value === "let" &&
                            astUtils.isOpeningBracketToken(
                                sourceCode.getTokenAfter(firstToken, astUtils.isNotClosingParenToken),
                            )
                        ) {
                            tokensToIgnore.add(firstToken);
                        }
                    }

                    startNewReportsBuffering();
                    if (hasExcessParens(node.init)) report(node.init);
                }
            },

            "ForStatement > *.init:exit"(node) {
                if (reportsBuffer.reports.length) {
                    reportsBuffer.inExpressionNodes.forEach(inExpressionNode => {
                        const path = pathToDescendant(node, inExpressionNode);
                        let nodeToExclude;

                        for (let i = 0; i < path.length; i++) {
                            const pathNode = path[i];

                            if (i < path.length - 1) {
                                if (isSafelyEnclosingInExpression(pathNode, path[i + 1])) {
                                    return;
                                }
                            }

                            if (isParenthesised(pathNode)) {
                                if (isInCurrentReportsBuffer(pathNode)) {
                                    if (isParenthesisedTwice(pathNode)) return;
                                    if (!nodeToExclude) nodeToExclude = pathNode;
                                } else {
                                    return;
                                }
                            }
                        }

                        removeFromCurrentReportsBuffer(nodeToExclude);
                    });
                }

                endCurrentReportsBuffering();
            },

            IfStatement(node) {
                if (hasExcessParens(node.test) && !isCondAssignException(node)) {
                    report(node.test);
                }
            },

            ImportExpression(node) {
                const { source } = node;
                if (source.type === "SequenceExpression") {
                    if (hasDoubleExcessParens(source)) report(source);
                } else if (hasExcessParens(source)) {
                    report(source);
                }
            },

            LogicalExpression: checkBinaryLogical,

            MemberExpression(node) {
                const allowWrapOnce =
                    isMemberExpInNewCallee(node) &&
                    doesMemberExpressionContainCallExpression(node);

                const nodeObjHasExcessParens = allowWrapOnce
                    ? hasDoubleExcessParens(node.object)
                    : hasExcessParens(node.object) &&
                      !(
                          isImmediateFunctionPrototypeMethodCall(node.parent) &&
                          node.parent.callee === node &&
                          IGNORE_FUNCTION_PROTOTYPE_METHODS
                      );

                if (nodeObjHasExcessParens) {
                    const objPrec = precedence(node.object);
                    const nodePrec = precedence(node);
                    const isDecimalOrRegex =
                        astUtils.isDecimalInteger(node.object) ||
                        (node.object.type === "Literal" && node.object.regex);

                    if (
                        objPrec >= nodePrec &&
                        (node.computed || !isDecimalOrRegex)
                    ) {
                        report(node.object);
                    } else if (node.object.type === "CallExpression") {
                        report(node.object);
                    } else if (
                        !IGNORE_NEW_IN_MEMBER_EXPR &&
                        node.object.type === "NewExpression" &&
                        isNewExpressionWithParens(node.object)
                    ) {
                        report(node.object);
                    } else if (node.optional && node.object.type === "ChainExpression") {
                        report(node.object);
                    }
                }

                if (node.computed && hasExcessParens(node.property)) {
                    report(node.property);
                }
            },

            "MethodDefinition[computed=true]"(node) {
                reportIfExcessParensWithPrecedence(node.key, PRECEDENCE_OF_ASSIGNMENT_EXPR);
            },

            NewExpression: checkCallNew,

            ObjectExpression(node) {
                node.properties
                    .filter(
                        p =>
                            p.value &&
                            hasExcessParensWithPrecedence(p.value, PRECEDENCE_OF_ASSIGNMENT_EXPR),
                    )
                    .forEach(p => report(p.value));
            },

            ObjectPattern(node) {
                node.properties
                    .filter(p => canBeAssignmentTarget(p.value) && hasExcessParens(p.value))
                    .forEach(p => report(p.value));
            },

            Property(node) {
                if (node.computed && node.key) {
                    reportIfExcessParensWithPrecedence(node.key, PRECEDENCE_OF_ASSIGNMENT_EXPR);
                }
            },

            PropertyDefinition(node) {
                if (node.computed) {
                    reportIfExcessParensWithPrecedence(node.key, PRECEDENCE_OF_ASSIGNMENT_EXPR);
                }
                if (node.value) {
                    reportIfExcessParensWithPrecedence(node.value, PRECEDENCE_OF_ASSIGNMENT_EXPR);
                }
            },

            RestElement(node) {
                if (canBeAssignmentTarget(node.argument) && hasExcessParens(node.argument)) {
                    report(node.argument);
                }
            },

            ReturnStatement(node) {
                const returnToken = sourceCode.getFirstToken(node);

                if (isReturnAssignException(node)) return;

                if (
                    node.argument &&
                    hasExcessParensNoLineTerminator(returnToken, node.argument) &&
                    !(node.argument.type === "Literal" && node.argument.regex)
                ) {
                    report(node.argument);
                }
            },

            SequenceExpression(node) {
                const prec = precedence(node);
                node.expressions
                    .filter(e => hasExcessParensWithPrecedence(e, prec))
                    .forEach(report);
            },

            SwitchCase(node) {
                if (node.test && hasExcessParens(node.test)) report(node.test);
            },

            SwitchStatement(node) {
                if (hasExcessParens(node.discriminant)) report(node.discriminant);
            },

            ThrowStatement(node) {
                const throwToken = sourceCode.getFirstToken(node);
                if (hasExcessParensNoLineTerminator(throwToken, node.argument)) {
                    report(node.argument);
                }
            },

            UnaryExpression: checkArgumentWithPrecedence,

            UpdateExpression(node) {
                if (node.prefix) {
                    checkArgumentWithPrecedence(node);
                    return;
                }

                const { argument } = node;
                const operatorToken = sourceCode.getLastToken(node);

                if (argument.loc.end.line === operatorToken.loc.start.line) {
                    checkArgumentWithPrecedence(node);
                } else if (hasDoubleExcessParens(argument)) {
                    report(argument);
                }
            },

            AwaitExpression: checkArgumentWithPrecedence,

            VariableDeclarator(node) {
                if (
                    node.init &&
                    hasExcessParensWithPrecedence(node.init, PRECEDENCE_OF_ASSIGNMENT_EXPR) &&
                    !(node.init.type === "Literal" && node.init.regex)
                ) {
                    report(node.init);
                }
            },

            WhileStatement(node) {
                if (hasExcessParens(node.test) && !isCondAssignException(node)) {
                    report(node.test);
                }
            },

            WithStatement(node) {
                if (hasExcessParens(node.object)) report(node.object);
            },

            YieldExpression(node) {
                if (!node.argument) return;

                const yieldToken = sourceCode.getFirstToken(node);
                if (
                    (precedence(node.argument) >= precedence(node) &&
                        hasExcessParensNoLineTerminator(yieldToken, node.argument)) ||
                    hasDoubleExcessParens(node.argument)
                ) {
                    report(node.argument);
                }
            },

            ClassDeclaration: checkClass,
            ClassExpression: checkClass,

            SpreadElement: checkSpreadOperator,
            SpreadProperty: checkSpreadOperator,
            ExperimentalSpreadProperty: checkSpreadOperator,

            TemplateLiteral(node) {
                node.expressions.filter(e => e && hasExcessParens(e)).forEach(report);
            },

            AssignmentPattern(node) {
                const { left, right } = node;

                if (canBeAssignmentTarget(left) && hasExcessParens(left)) {
                    report(left);
                }

                if (right) {
                    reportIfExcessParensWithPrecedence(right, PRECEDENCE_OF_ASSIGNMENT_EXPR);
                }
            },
        };
    },
};
```

Key refactoring changes made:

1. **Extracted constants** (`SCHEMA`, `META`) to module level, separating structure from logic
2. **Extracted `parseOptions()`** to eliminate the repetitive `ALL_NODES && context.options[1] && ...` pattern
3. **Moved pure helpers to module level**: `isImmediateFunctionPrototypeMethodCall`, `isIIFE`, `canBeAssignmentTarget`, `containsAssignment`, `isSafelyEnclosingInExpression`, `isMemberExpInNewCallee`, `doesMemberExpressionContainCallExpression`, `isAnonymousFunctionAssignmentException`, `pathToAncestor`, `pathToDescendant`
4. **Added `reportIfExcessParens` and `reportIfExcessParensWithPrecedence`** to reduce repetitive `if (has...) report(...)` patterns
5. **Extracted `buildFixer`** from the `report` function for clarity
6. **Extracted `shouldAllowCommentPattern`** to simplify the `report` function
7. **Extracted `handleForLeftToken`** to deduplicate `ForInStatement`/`ForOfStatement` logic
8. **Simplified `ConditionalExpression`** handler using a loop over `[consequent, alternate]`
9. **Simplified `checkCallNew`** by inverting the condition into `isAllowedCallee`
10. **Simplified `checkBinaryLogical`** by extracting intermediate booleans with descriptive names